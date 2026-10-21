import http.server
import urllib.request
from firebase_backend import (
    FirebaseBackendUnavailable,
    FirebaseStateConflict,
    FirebaseTokenInvalid,
    bearer_token,
    firestore_enabled,
    lookup_partner_share,
    read_state_snapshot,
    revoke_partner_share as firebase_revoke_partner_share,
    revoke_partner_shares_for_influencer as firebase_revoke_partner_shares_for_influencer,
    store_partner_share as firebase_store_partner_share,
    verify_admin_token,
    write_state_snapshot,
    verify_clerk_token,
)
import json
import os
import time
import base64
import secrets
import urllib.parse
import sqlite3
import random
import subprocess
import zipfile
import io
import shutil
import threading
import re
import sys
import hashlib
import ipaddress
from datetime import datetime, timezone, timedelta
import xml.etree.ElementTree as ET
try:
    import openpyxl
    HAS_OPENPYXL = True
except ImportError:
    openpyxl = None
    HAS_OPENPYXL = False
try:
    from cryptography.fernet import Fernet, InvalidToken
    HAS_CRYPTOGRAPHY = True
except ImportError:
    Fernet = None
    InvalidToken = Exception
    HAS_CRYPTOGRAPHY = False

PORT = int(os.environ.get('PORT', '8001'))
GITHUB_REPO = "Hootsworth/BDR_Prototype"
GITHUB_COMMITS_API = f"https://api.github.com/repos/{GITHUB_REPO}/commits/main"
GITHUB_ZIPBALL_URL = f"https://github.com/{GITHUB_REPO}/archive/refs/heads/main.zip"

def safe_urlopen(request, timeout=30):
    try:
        return urllib.request.urlopen(request, timeout=timeout)
    except urllib.error.URLError as ex:
        if "CERTIFICATE_VERIFY_FAILED" in str(ex):
            import ssl
            ctx = ssl._create_unverified_context()
            return urllib.request.urlopen(request, timeout=timeout, context=ctx)
        raise

def load_local_env():
    env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env')
    if not os.path.exists(env_path):
        return
    with open(env_path, encoding='utf-8') as env_file:
        for raw_line in env_file:
            line = raw_line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            key, value = line.split('=', 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))

load_local_env()

GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
GOOGLE_SCOPES = [
    'openid', 'email', 'profile',
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.compose',
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/calendar.freebusy',
]
google_sessions = {}
google_oauth_states = {}
DATA_DIR = os.environ.get('PROTOTYPE_DATA_DIR', '/tmp/gtm-data' if os.environ.get('VERCEL') else os.path.join(os.path.dirname(os.path.abspath(__file__)), '.prototype-data'))
DB_PATH = os.path.join(DATA_DIR, 'gtm.sqlite3')
WORKBOOK_PATH = os.environ.get('GTM_WORKBOOK_PATH', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'gtm-console-database.xlsx'))
WORKBOOK_SHEETS = [
    'Contacts', 'Companies', 'Enrichment', 'Campaigns', 'Activities',
    'Approvals', 'Events', 'Settings', 'Runs', 'Metadata'
]
workbook_lock = threading.Lock()

def token_cipher():
    key = os.environ.get('TOKEN_ENCRYPTION_KEY')
    if not key or not HAS_CRYPTOGRAPHY or not Fernet:
        return None
    return Fernet(key.encode('utf-8'))

def encrypt_token(value):
    if not value:
        return None
    cipher = token_cipher()
    if cipher:
        return cipher.encrypt(value.encode('utf-8')).decode('ascii')
    return base64.b64encode(value.encode('utf-8')).decode('ascii')

def decrypt_token(value):
    if not value:
        return None
    cipher = token_cipher()
    if cipher:
        try:
            return cipher.decrypt(value.encode('ascii')).decode('utf-8')
        except Exception as ex:
            raise RuntimeError('Stored Google token cannot be decrypted; reconnect Google Workspace.') from ex
    try:
        return base64.b64decode(value.encode('ascii')).decode('utf-8')
    except Exception:
        return value

def db():
    os.makedirs(DATA_DIR, exist_ok=True)
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute('CREATE TABLE IF NOT EXISTS app_state (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)')
    connection.execute('CREATE TABLE IF NOT EXISTS google_connections (id INTEGER PRIMARY KEY CHECK (id = 1), session_id TEXT, email TEXT, name TEXT, access_token TEXT, refresh_token TEXT, expires_at REAL, updated_at TEXT NOT NULL)')
    columns = {row['name'] for row in connection.execute('PRAGMA table_info(google_connections)').fetchall()}
    if 'session_id' not in columns:
        connection.execute('ALTER TABLE google_connections ADD COLUMN session_id TEXT')
    connection.execute('CREATE TABLE IF NOT EXISTS linkedin_connections (id INTEGER PRIMARY KEY CHECK (id = 1), session_id TEXT, member_id TEXT, name TEXT, email TEXT, access_token TEXT, mode TEXT, updated_at TEXT NOT NULL)')
    connection.execute('CREATE TABLE IF NOT EXISTS sent_emails (id INTEGER PRIMARY KEY AUTOINCREMENT, fingerprint TEXT UNIQUE NOT NULL, recipient TEXT NOT NULL, subject TEXT NOT NULL, provider_id TEXT, sent_at TEXT NOT NULL)')
    connection.execute('CREATE TABLE IF NOT EXISTS sent_linkedin (id INTEGER PRIMARY KEY AUTOINCREMENT, recipient_name TEXT, recipient_email TEXT, linkedin_url TEXT, message TEXT NOT NULL, provider_id TEXT, mode TEXT, sent_at TEXT NOT NULL)')
    connection.execute('''CREATE TABLE IF NOT EXISTS partner_shares (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        influencer_id INTEGER NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        revoked_at TEXT
    )''')

    # Normalized Relational + Graph Tables for Searchable GTM Console
    connection.execute('''
        CREATE TABLE IF NOT EXISTS contacts (
            id INTEGER PRIMARY KEY,
            first_name TEXT,
            last_name TEXT,
            full_name TEXT,
            email TEXT,
            job_title TEXT,
            company TEXT,
            phone TEXT,
            linkedin_url TEXT,
            industry TEXT,
            source_file TEXT,
            asset_size TEXT,
            state TEXT,
            is_influencer INTEGER DEFAULT 0,
            referred_by_id INTEGER,
            referred_by_name TEXT,
            referral_credits INTEGER DEFAULT 0,
            lead_temp TEXT,
            match_percentage INTEGER DEFAULT 0,
            enriched INTEGER DEFAULT 0,
            emails_sent INTEGER DEFAULT 0,
            linkedin_sent INTEGER DEFAULT 0,
            calls_count INTEGER DEFAULT 0,
            has_scheduled_call INTEGER DEFAULT 0,
            has_taken_call INTEGER DEFAULT 0,
            raw_json TEXT NOT NULL
        )
    ''')
    connection.execute('CREATE INDEX IF NOT EXISTS idx_contacts_influencer ON contacts(is_influencer)')
    connection.execute('CREATE INDEX IF NOT EXISTS idx_contacts_referred_by ON contacts(referred_by_name)')
    connection.execute('CREATE INDEX IF NOT EXISTS idx_contacts_calls ON contacts(has_taken_call, has_scheduled_call)')
    connection.execute('CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email)')

    connection.execute('''
        CREATE TABLE IF NOT EXISTS referrals_edges (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            influencer_id INTEGER,
            influencer_name TEXT,
            influencer_email TEXT,
            prospect_id INTEGER,
            prospect_name TEXT,
            prospect_email TEXT,
            prospect_company TEXT,
            prospect_title TEXT,
            credits INTEGER DEFAULT 10,
            has_scheduled_call INTEGER DEFAULT 0,
            has_taken_call INTEGER DEFAULT 0,
            call_outcome TEXT,
            created_at TEXT
        )
    ''')
    connection.execute('CREATE INDEX IF NOT EXISTS idx_edges_influencer_name ON referrals_edges(influencer_name)')

    connection.execute('''
        CREATE TABLE IF NOT EXISTS events_meta (
            event_key TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            date TEXT,
            location TEXT,
            type TEXT,
            description TEXT,
            created_at TEXT
        )
    ''')

    connection.execute('''
        CREATE TABLE IF NOT EXISTS event_attendees (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_key TEXT NOT NULL,
            contact_id INTEGER,
            full_name TEXT,
            job_title TEXT,
            company TEXT,
            email TEXT,
            phone TEXT,
            status TEXT,
            notes TEXT,
            raw_json TEXT
        )
    ''')

    connection.execute('''
        CREATE TABLE IF NOT EXISTS vendors (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_name TEXT NOT NULL,
            contact_name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT,
            session_token_hash TEXT,
            website TEXT,
            industry TEXT,
            icp_description TEXT,
            calendly_url TEXT,
            agreement_status TEXT DEFAULT 'none',
            network_access_level TEXT DEFAULT 'locked',
            agreements_json TEXT DEFAULT '[]',
            created_at TEXT NOT NULL,
            approved_at TEXT,
            raw_json TEXT
        )
    ''')
    connection.execute('CREATE INDEX IF NOT EXISTS idx_vendors_email ON vendors(email)')
    connection.execute('CREATE INDEX IF NOT EXISTS idx_vendors_token ON vendors(session_token_hash)')

    connection.execute('''
        CREATE TABLE IF NOT EXISTS marketplace_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            vendor_id INTEGER NOT NULL,
            vendor_company TEXT,
            vendor_contact_name TEXT,
            vendor_email TEXT,
            influencer_id INTEGER,
            influencer_name TEXT,
            influencer_email TEXT,
            target_contact_id INTEGER,
            target_contact_name TEXT,
            target_company TEXT,
            target_job_title TEXT,
            status TEXT DEFAULT 'requested',
            vendor_pitch TEXT,
            scheduled_meeting_url TEXT,
            credits_awarded INTEGER DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            raw_json TEXT
        )
    ''')
    connection.execute('CREATE INDEX IF NOT EXISTS idx_mp_requests_vendor ON marketplace_requests(vendor_id)')
    connection.execute('CREATE INDEX IF NOT EXISTS idx_mp_requests_influencer ON marketplace_requests(influencer_id)')
    connection.commit()
    return connection

def persist_state(key, value):
    if os.environ.get('VERCEL') and key == 'database' and not firestore_enabled():
        raise FirebaseBackendUnavailable('Cloud persistence is disabled. Set FIREBASE_USE_FIRESTORE=true for Vercel.')
    if firestore_enabled() and key == 'database':
        # When Firestore is selected it is the source of truth. Never report a
        # successful local write after a cloud failure (serverless disk is ephemeral).
        write_state_snapshot(key, value)
        return
    with db() as connection:
        connection.execute('INSERT INTO app_state(key, value, updated_at) VALUES(?, ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at', (key, json.dumps(value), time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())))

def read_state(key):
    if os.environ.get('VERCEL') and key == 'database' and not firestore_enabled():
        raise FirebaseBackendUnavailable('Cloud persistence is disabled. Set FIREBASE_USE_FIRESTORE=true for Vercel.')
    if firestore_enabled() and key == 'database':
        # Do not hide Firestore outages by returning stale or instance-local data.
        return read_state_snapshot(key)
    with db() as connection:
        row = connection.execute('SELECT value FROM app_state WHERE key = ?', (key,)).fetchone()
        return json.loads(row['value']) if row else None

def default_workbook_state():
    return {
        'contacts': [],
        'vendors': [],
        'marketplaceRequests': [],
        'rewardLedger': [],
        'rewardRedemptions': [],
        'events': {},
        'eventsMeta': [
            {
                'eventKey': 'gac_dinner',
                'title': 'GAC 2026 Executive VIP Dinner',
                'date': '2026-10-14',
                'location': 'Washington, D.C. (The Mayflower Hotel)',
                'type': 'Executive Dinner',
                'description': 'Private C-suite dinner for Credit Union CIOs and Advisory Partners discussing NCUA AI compliance.'
            },
            {
                'eventKey': 'symwest_booth',
                'title': 'SymWest 2026 Booth #412 Visitors',
                'date': '2026-10-22',
                'location': 'San Diego, CA (Convention Center)',
                'type': 'Conference Booth',
                'description': 'Symitar & Jack Henry ecosystem leaders visiting the live LLM Query Guardrails demo booth.'
            },
            {
                'eventKey': 'executive_meetup',
                'title': 'Credit Union AI & Compliance Roundtable',
                'date': '2026-11-05',
                'location': 'Chicago, IL / Hybrid',
                'type': 'VIP Roundtable',
                'description': 'Interactive executive briefing on zero-trust LLM database gateways and referral partner rewards.'
            }
        ],
        'stats': {'emailsSent': 0, 'linkedinSent': 0, 'callsMade': 0, 'enrichedCount': 0},
        'meetings': [],
        'approvals': [],
        'workflowRuns': [],
        'currentOutboundSubtab': 'influencers',
        'autoEnrich': False
    }

def sync_relational_tables_from_state(state):
    """Synchronize normalized SQLite relational and graph-edge tables from state object."""
    if not state or not isinstance(state, dict):
        return
    if firestore_enabled():
        persist_state('database', state)
        return
    contacts = state.get('contacts') or []
    events = state.get('events') or {}
    events_meta = state.get('eventsMeta') or default_workbook_state()['eventsMeta']
    meetings = state.get('meetings') or []
    meeting_emails = {str(m.get('contactEmail') or '').lower() for m in meetings if m.get('contactEmail')}

    with db() as conn:
        conn.execute('DELETE FROM contacts')
        conn.execute('DELETE FROM referrals_edges')
        conn.execute('DELETE FROM events_meta')
        conn.execute('DELETE FROM event_attendees')

        for idx, c in enumerate(contacts):
            cid = c.get('id') if c.get('id') is not None else (idx + 1)
            try:
                cid = int(cid)
            except (ValueError, TypeError):
                cid = idx + 1
            calls_made = c.get('callsMade') or []
            calls_count = len(calls_made) if isinstance(calls_made, list) else 0
            email_lower = str(c.get('email') or '').lower()

            has_taken = bool(
                c.get('hasTakenCall')
                or any(
                    str(call.get('status', '')).lower() in ('taken', 'completed')
                    or 'taken' in str(call.get('outcome', '')).lower()
                    or 'spoke' in str(call.get('outcome', '')).lower()
                    or 'completed' in str(call.get('outcome', '')).lower()
                    for call in (calls_made if isinstance(calls_made, list) else [])
                    if isinstance(call, dict)
                )
            )
            has_scheduled = bool(
                c.get('hasScheduledCall')
                or has_taken
                or calls_count > 0
                or (email_lower and email_lower in meeting_emails)
            )
            c['hasTakenCall'] = has_taken
            c['hasScheduledCall'] = has_scheduled

            conn.execute('''
                INSERT OR REPLACE INTO contacts (
                    id, first_name, last_name, full_name, email, job_title, company,
                    phone, linkedin_url, industry, source_file, asset_size, state,
                    is_influencer, referred_by_id, referred_by_name, referral_credits,
                    lead_temp, match_percentage, enriched, emails_sent, linkedin_sent,
                    calls_count, has_scheduled_call, has_taken_call, raw_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                cid,
                str(c.get('firstName') or ''),
                str(c.get('lastName') or ''),
                str(c.get('fullName') or ''),
                str(c.get('email') or ''),
                str(c.get('jobTitle') or ''),
                str(c.get('company') or ''),
                str(c.get('phone') or ''),
                str(c.get('linkedinUrl') or ''),
                str(c.get('industry') or ''),
                str(c.get('sourceFile') or ''),
                str(c.get('assetSize') or ''),
                str(c.get('state') or ''),
                1 if c.get('isInfluencer') is True else 0,
                c.get('influencerId'),
                str(c.get('referredBy') or ''),
                int(c.get('referralCredits') or 0),
                str(c.get('leadTemp') or 'Warm Lead'),
                int(c.get('matchPercentage') or 0),
                1 if c.get('enriched') else 0,
                1 if c.get('emailsSent') else 0,
                1 if c.get('linkedinSent') else 0,
                calls_count,
                1 if has_scheduled else 0,
                1 if has_taken else 0,
                json.dumps(c)
            ))

            if not c.get('isInfluencer') and c.get('referredBy'):
                outcome_text = calls_made[0].get('outcome', 'Call Taken') if (isinstance(calls_made, list) and calls_made and isinstance(calls_made[0], dict)) else ('Call Taken' if has_taken else 'Pending Call')
                conn.execute('''
                    INSERT INTO referrals_edges (
                        influencer_id, influencer_name, influencer_email,
                        prospect_id, prospect_name, prospect_email, prospect_company, prospect_title,
                        credits, has_scheduled_call, has_taken_call, call_outcome, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    c.get('influencerId'),
                    str(c.get('referredBy') or ''),
                    str(c.get('influencerEmail') or ''),
                    cid,
                    str(c.get('fullName') or ''),
                    str(c.get('email') or ''),
                    str(c.get('company') or ''),
                    str(c.get('jobTitle') or ''),
                    compute_contact_referral_credits({'hasScheduledCall': has_scheduled, 'hasTakenCall': has_taken}),
                    1 if has_scheduled else 0,
                    1 if has_taken else 0,
                    outcome_text,
                    time.strftime('%Y-%m-%d', time.gmtime())
                ))

        for em in events_meta:
            if not isinstance(em, dict) or not em.get('eventKey'):
                continue
            conn.execute('''
                INSERT OR REPLACE INTO events_meta (event_key, title, date, location, type, description, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (
                em.get('eventKey'),
                em.get('title') or em.get('eventKey'),
                em.get('date') or '',
                em.get('location') or '',
                em.get('type') or 'Field Event',
                em.get('description') or '',
                time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
            ))

        for event_key, attendees in events.items():
            if not any(m.get('eventKey') == event_key for m in events_meta if isinstance(m, dict)):
                conn.execute('''
                    INSERT OR IGNORE INTO events_meta (event_key, title, date, location, type, description, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                ''', (
                    event_key,
                    event_key.replace('_', ' ').title(),
                    '2026-10-30',
                    'Hybrid / Executive Venue',
                    'Field Event',
                    'Custom Campaign Event',
                    time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
                ))
            for att in (attendees or []):
                if not isinstance(att, dict):
                    continue
                conn.execute('''
                    INSERT INTO event_attendees (event_key, contact_id, full_name, job_title, company, email, phone, status, notes, raw_json)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    event_key,
                    att.get('id') or att.get('contactId'),
                    att.get('fullName') or att.get('name') or '',
                    att.get('jobTitle') or '',
                    att.get('company') or '',
                    att.get('email') or '',
                    att.get('phone') or '',
                    att.get('eventStatus') or att.get('status') or 'Registered',
                    att.get('eventNotes') or att.get('notes') or '',
                    json.dumps(att)
                ))

        # Preserve vendors and marketplaceRequests if omitted by a partial frontend state save
        existing_db_state = read_state('database') or {}
        if 'vendors' not in state and existing_db_state.get('vendors'):
            state['vendors'] = existing_db_state['vendors']
            if 'marketplaceRequests' not in state and existing_db_state.get('marketplaceRequests'):
                state['marketplaceRequests'] = existing_db_state['marketplaceRequests']
        for preserved_key in ('rewardLedger', 'rewardRedemptions'):
            if preserved_key not in state and existing_db_state.get(preserved_key):
                state[preserved_key] = existing_db_state[preserved_key]

        vendors_list = state.get('vendors') or []
        conn.execute('DELETE FROM vendors')
        for idx, v in enumerate(vendors_list):
            if not isinstance(v, dict):
                continue
            vid = int(v.get('id') or (idx + 1))
            conn.execute('''
                INSERT OR REPLACE INTO vendors (
                    id, company_name, contact_name, email, password_hash, session_token_hash,
                    website, industry, icp_description, calendly_url, agreement_status,
                    network_access_level, agreements_json, created_at, approved_at, raw_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                vid,
                str(v.get('companyName') or ''),
                str(v.get('contactName') or ''),
                str(v.get('email') or '').lower(),
                str(v.get('passwordHash') or ''),
                str(v.get('sessionTokenHash') or ''),
                str(v.get('website') or ''),
                str(v.get('industry') or ''),
                str(v.get('icpDescription') or ''),
                str(v.get('calendlyUrl') or ''),
                str(v.get('agreementStatus') or 'none'),
                str(v.get('networkAccessLevel') or 'locked'),
                json.dumps(v.get('agreements') or []),
                str(v.get('createdAt') or time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())),
                str(v.get('approvedAt') or ''),
                json.dumps(v)
            ))

        mp_requests = state.get('marketplaceRequests') or []
        conn.execute('DELETE FROM marketplace_requests')
        for idx, req in enumerate(mp_requests):
            if not isinstance(req, dict):
                continue
            rid = int(req.get('id') or (idx + 1))
            conn.execute('''
                INSERT OR REPLACE INTO marketplace_requests (
                    id, vendor_id, vendor_company, vendor_contact_name, vendor_email,
                    influencer_id, influencer_name, influencer_email,
                    target_contact_id, target_contact_name, target_company, target_job_title,
                    status, vendor_pitch, scheduled_meeting_url, credits_awarded,
                    created_at, updated_at, raw_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                rid,
                int(req.get('vendorId') or 0),
                str(req.get('vendorCompany') or ''),
                str(req.get('vendorContactName') or ''),
                str(req.get('vendorEmail') or ''),
                req.get('influencerId'),
                str(req.get('influencerName') or ''),
                str(req.get('influencerEmail') or ''),
                req.get('targetContactId'),
                str(req.get('targetContactName') or ''),
                str(req.get('targetCompany') or ''),
                str(req.get('targetJobTitle') or ''),
                str(req.get('status') or 'requested'),
                str(req.get('vendorPitch') or ''),
                str(req.get('scheduledMeetingUrl') or ''),
                int(req.get('creditsAwarded') or 0),
                str(req.get('createdAt') or time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())),
                str(req.get('updatedAt') or time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())),
                json.dumps(req)
            ))

        conn.execute('INSERT INTO app_state(key, value, updated_at) VALUES(?, ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at',
                     ('rewardLedger', json.dumps(state.get('rewardLedger') or []), time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())))
        conn.execute('INSERT INTO app_state(key, value, updated_at) VALUES(?, ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at',
                     ('rewardRedemptions', json.dumps(state.get('rewardRedemptions') or []), time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())))

        conn.commit()
    persist_state('database', state)

def seed_synthetic_database(force=False):
    """Seeds the SQLite database with 30 Influencers x 30 Contacts (930 total) if empty or forced."""
    from scripts.seed_database import build_synthetic_dataset
    state = build_synthetic_dataset()
    for contact in state.get('contacts') or []:
        contact['isDemoData'] = True
    state.setdefault('vendors', [])
    state.setdefault('marketplaceRequests', [])
    state.setdefault('rewardLedger', [])
    state.setdefault('rewardRedemptions', [])
    sync_relational_tables_from_state(state)
    with db() as connection:
        connection.execute('UPDATE partner_shares SET revoked_at = ? WHERE revoked_at IS NULL', (time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),))
    # Also write JSON snapshot next to workbook path so legacy readers stay synced
    json_path = WORKBOOK_PATH.replace('.xlsx', '.json')
    try:
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(state, f, indent=2)
    except Exception:
        pass
    return state

def partner_share_from_token(token):
    if not token:
        return None
    token_hash = hashlib.sha256(token.encode('utf-8')).hexdigest()
    if firestore_enabled():
        return lookup_partner_share(token_hash)
    with db() as connection:
        row = connection.execute(
            'SELECT id, influencer_id, revoked_at, created_at FROM partner_shares WHERE token_hash = ?',
            (token_hash,)
        ).fetchone()
    if not row:
        return None
    share = dict(row)
    try:
        expires_epoch = datetime.strptime(share['created_at'], '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=timezone.utc).timestamp() + 30 * 24 * 60 * 60
        if expires_epoch <= time.time():
            share['revoked_at'] = 'expired'
    except (ValueError, TypeError):
        share['revoked_at'] = 'invalid_expiry'
    return share

def store_partner_share_record(influencer_id, token_hash, created_at):
    if firestore_enabled():
        return firebase_store_partner_share(influencer_id, token_hash, created_at)
    with db() as connection:
        connection.execute('UPDATE partner_shares SET revoked_at = ? WHERE influencer_id = ? AND revoked_at IS NULL', (created_at, int(influencer_id)))
        connection.execute('INSERT INTO partner_shares(influencer_id, token_hash, created_at) VALUES (?, ?, ?)', (int(influencer_id), token_hash, created_at))

def revoke_partner_share_record(share_id, revoked_at):
    if firestore_enabled():
        return firebase_revoke_partner_share(share_id, revoked_at)
    with db() as connection:
        cursor = connection.execute('UPDATE partner_shares SET revoked_at = ? WHERE id = ?', (revoked_at, share_id))
        return cursor.rowcount > 0

def revoke_partner_share_records_for_influencer(influencer_id, revoked_at):
    if firestore_enabled():
        try:
            return firebase_revoke_partner_shares_for_influencer(influencer_id, revoked_at)
        except FirebaseBackendUnavailable:
            pass
    with db() as connection:
        cursor = connection.execute('UPDATE partner_shares SET revoked_at = ? WHERE influencer_id = ? AND revoked_at IS NULL', (revoked_at, int(influencer_id)))
        return cursor.rowcount

def issue_partner_share_token(influencer_id, revoke_existing=True):
    token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(token.encode('utf-8')).hexdigest()
    created_at = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    if firestore_enabled():
        try:
            if revoke_existing:
                store_partner_share_record(influencer_id, token_hash, created_at)
            else:
                firebase_store_partner_share(influencer_id, token_hash, created_at, revoke_existing=False)
            return token
        except FirebaseBackendUnavailable:
            pass
    with db() as connection:
        connection.execute('INSERT INTO partner_shares(influencer_id, token_hash, created_at) VALUES (?, ?, ?)', (int(influencer_id), token_hash, created_at))
    return token

def hash_portal_password(password):
    raw = str(password or '').encode('utf-8')
    salt = secrets.token_bytes(16)
    iterations = 310_000
    digest = hashlib.pbkdf2_hmac('sha256', raw, salt, iterations).hex()
    return f"pbkdf2_sha256${iterations}${base64.urlsafe_b64encode(salt).decode('ascii')}${digest}"

def verify_portal_password(password, stored_hash):
    if not stored_hash:
        return False
    stored = str(stored_hash)
    try:
        algorithm, iterations, encoded_salt, expected = stored.split('$', 3)
        if algorithm != 'pbkdf2_sha256':
            return False
        actual = hashlib.pbkdf2_hmac(
            'sha256', str(password or '').encode('utf-8'),
            base64.urlsafe_b64decode(encoded_salt.encode('ascii')), int(iterations)
        ).hex()
        return secrets.compare_digest(actual, expected)
    except (ValueError, TypeError):
        # Accept the old deterministic hash format so existing prototype accounts
        # can still log in; successful login upgrades them to the salted format.
        legacy_hash = hashlib.pbkdf2_hmac('sha256', str(password or '').encode('utf-8'), b'gtm_irm_marketplace_salt_v1', 100_000).hex()
        return secrets.compare_digest(legacy_hash, stored)

def partner_password_matches(influencer, password):
    """Verify current hashes and support one-time migration of legacy plaintext values."""
    password_hash = str(influencer.get('passwordHash') or '').strip()
    if password_hash:
        return verify_portal_password(password, password_hash)
    legacy_password = str(influencer.get('defaultPassword') or influencer.get('password') or '').strip()
    return bool(legacy_password) and secrets.compare_digest(legacy_password, str(password or ''))

def set_partner_password(influencer, password):
    influencer['passwordHash'] = hash_portal_password(password)
    influencer.pop('defaultPassword', None)
    influencer.pop('password', None)

def public_partner_profile(influencer):
    """Return partner fields without password hashes or legacy secrets."""
    return {key: value for key, value in influencer.items() if key not in ('passwordHash', 'defaultPassword', 'password')}

def vendor_from_token(state, token):
    if not token:
        return None
    token_hash = hashlib.sha256(token.encode('utf-8')).hexdigest()
    for vendor in (state.get('vendors') or []):
        if isinstance(vendor, dict) and vendor.get('sessionTokenHash') == token_hash:
            expires = vendor.get('sessionExpiresAt')
            if expires:
                try:
                    expires_epoch = datetime.strptime(str(expires), '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=timezone.utc).timestamp()
                    if expires_epoch <= time.time():
                        return None
                except (ValueError, TypeError, OverflowError):
                    return None
            return vendor
    return None

def vendor_safe_dict(vendor):
    if not isinstance(vendor, dict):
        return {}
    return {
        'id': vendor.get('id'),
        'companyName': vendor.get('companyName') or '',
        'contactName': vendor.get('contactName') or '',
        'email': vendor.get('email') or '',
        'website': vendor.get('website') or '',
        'industry': vendor.get('industry') or 'B2B FinTech / Enterprise Software',
        'icpDescription': vendor.get('icpDescription') or '',
        'calendlyUrl': vendor.get('calendlyUrl') or '',
        'agreementStatus': vendor.get('agreementStatus') or 'none',
        'networkAccessLevel': vendor.get('networkAccessLevel') or 'locked',
        'vendorStatus': vendor.get('vendorStatus') or 'pending_review',
        'agreements': [
            {k: v for k, v in agr.items() if k != 'dataUrl'}
            for agr in (vendor.get('agreements') or [])
            if isinstance(agr, dict)
        ],
        'createdAt': vendor.get('createdAt') or '',
        'approvedAt': vendor.get('approvedAt') or ''
    }

def mask_email_address(email):
    val = str(email or '').strip()
    if '@' not in val:
        return '***@***.com'
    local, domain = val.split('@', 1)
    prefix = local[0] if local else 'x'
    return f"{prefix}***@{domain}"

def mask_full_name(full_name):
    parts = str(full_name or '').strip().split()
    if not parts:
        return 'Executive Contact'
    if len(parts) == 1:
        return parts[0]
    return f"{parts[0]} {parts[-1][0]}."

def calculate_warm_path_score(contact, partner=None, vendor_icp=None):
    """
    Computes a 0–100 Warm Path Score per Contact based on the ConnectEM IP:
    - Relationship strength: 35% (Strong: 35, Medium: 21, Weak: 9)
    - Interaction recency: 20% (<30d: 20, 1-3m: 16, 3-6m: 10, 6-12m: 6, >1y: 2)
    - Partner credibility / Trust Score: 15% (scaled from partner trust score / history)
    - Contact relevance: 15% (title/industry/asset size match to vendor ICP)
    - Partner intro history: 10% (track record of completed intros / acceptance)
    - Contact responsiveness: 5% (responsiveness track record)
    """
    strength = str(contact.get('strength') or 'strong').lower()
    if strength == 'strong':
        s_pts = 35
    elif strength == 'medium':
        s_pts = 21
    else:
        s_pts = 9

    recency = str(contact.get('lastInteraction') or '1_to_3_months').lower()
    if any(k in recency for k in ['30', 'week', 'day', 'recent', 'today']):
        r_pts = 20
    elif '1_to_3' in recency or '3_month' in recency:
        r_pts = 16
    elif '3_to_6' in recency or '6_month' in recency:
        r_pts = 10
    elif '6_to_12' in recency or '12_month' in recency:
        r_pts = 6
    else:
        r_pts = 2

    # Partner credibility / Trust score (15 pts)
    partner_trust = (partner or {}).get('trustScore')
    if partner_trust is not None:
        c_pts = round((min(max(float(partner_trust), 0), 100) / 100.0) * 15.0)
    else:
        c_pts = 13

    # Contact relevance (15 pts)
    title = str(contact.get('jobTitle') or contact.get('title') or '').lower()
    if any(k in title for k in ['cio', 'chief information', 'cto', 'chief technology', 'ciso', 'chief security', 'ceo', 'president']):
        rel_pts = 15
    elif any(k in title for k in ['vp', 'vice president', 'director', 'head of', 'chief']):
        rel_pts = 12
    else:
        rel_pts = 8

    # Partner intro history (10 pts)
    hist_pts = 8
    if partner:
        refs = partner.get('referrals') or []
        completed_count = sum(1 for r in refs if r.get('hasTakenCall') or r.get('hasScheduledCall'))
        if completed_count == 0 and (partner.get('introsCompleted') or partner.get('introsAccepted')):
            completed_count = int(partner.get('introsCompleted') or partner.get('introsAccepted') or 0)
        if completed_count >= 10:
            hist_pts = 10
        elif completed_count >= 3:
            hist_pts = 9
        elif completed_count >= 1:
            hist_pts = 8
        else:
            hist_pts = 6

    # Contact responsiveness (5 pts)
    resp = str(contact.get('responsiveness') or '').lower()
    if resp == 'high':
        resp_pts = 5
    elif resp == 'medium':
        resp_pts = 4
    elif resp == 'low':
        resp_pts = 2
    else:
        resp_pts = 5 if contact.get('hasTakenCall') else (4 if contact.get('hasScheduledCall') else 3)

    total_score = min(100, max(0, s_pts + r_pts + c_pts + rel_pts + hist_pts + resp_pts))
    if total_score >= 80:
        label = "Excellent warm path"
    elif total_score >= 65:
        label = "Strong warm path"
    elif total_score >= 50:
        label = "Viable warm path"
    else:
        label = "Low-affinity path"

    return {
        'score': total_score,
        'label': label,
        'badge': label,
        'breakdown': {
            'relationshipStrength': s_pts,
            'interactionRecency': r_pts,
            'partnerCredibility': c_pts,
            'contactRelevance': rel_pts,
            'partnerIntroHistory': hist_pts,
            'contactResponsiveness': resp_pts
        }
    }

def generate_forwardable_brief(vendor, contact, partner=None, why_contact='', why_care='', specific_ask='', context=''):
    """Generates an executive-level, partner-forwardable brief in the partner's voice."""
    if isinstance(why_contact, dict):
        ask_dict = why_contact
        why_contact = ask_dict.get('whyContact') or ''
        why_care = ask_dict.get('whyCare') or ''
        specific_ask = ask_dict.get('specificAsk') or ''
        context = ask_dict.get('context') or ''

    first_name = (contact.get('fullName') or contact.get('name') or 'Colleague').split()[0]
    partner_name = (partner.get('fullName') or partner.get('name') if partner else None) or contact.get('referredBy') or 'Industry Partner'
    vendor_company = (vendor.get('companyName') or vendor.get('name') if vendor else None) or 'Enterprise Partner'
    category = (vendor.get('category') or vendor.get('industry') if vendor else None) or 'enterprise technology'
    ask = specific_ask or 'a focused 20-minute introductory conversation'
    value = why_care or (vendor.get('valueProposition') or vendor.get('valueProp') if vendor else None) or 'modernize operations and ensure regulatory compliance'
    company_name = contact.get('company') or 'your organization'

    return (
        f"Hi {first_name},\n\n"
        f"Hope you are having a productive week. An enterprise technology partner, {vendor_company} ({category}), "
        f"asked if I would facilitate a warm introduction to you.\n\n"
        f"They are specifically interested in connecting regarding how they help organizations like {company_name} "
        f"to {value}.\n\n"
        f"Their specific ask is {ask}. Knowing your priorities, I wanted to check your interest directly "
        f"before connecting you. Would you be open to a quick introductory briefing with their leadership team?\n\n"
        f"Best regards,\n{partner_name}"
    )

def generate_pre_meeting_brief(vendor, contact, partner=None, intro_req=None):
    c_name = (contact or {}).get('fullName') or (contact or {}).get('name') or 'Executive Contact'
    c_title = (contact or {}).get('jobTitle') or (contact or {}).get('title') or 'Decision Maker'
    c_comp = (contact or {}).get('company') or 'Target Enterprise'
    p_name = (partner or {}).get('fullName') or (partner or {}).get('name') or (contact or {}).get('referredBy') or 'ConnectEM Partner'
    p_rel = (contact or {}).get('relationshipType') or (partner or {}).get('relationshipType') or 'trusted professional colleague'
    v_name = (vendor or {}).get('companyName') or (vendor or {}).get('name') or 'Enterprise Vendor'
    req = intro_req or {}

    return {
        'contactName': c_name,
        'title': c_title,
        'company': c_comp,
        'introducedBy': p_name,
        'relationshipContext': f"{p_name} is a {p_rel} who facilitated this double opt-in introduction.",
        'partnerNotes': (partner or {}).get('context') or req.get('partnerNotes') or 'Executive values focused, technical, problem-centric discussions.',
        'reasonForIntro': req.get('whyCare') or req.get('whyContact') or 'Explore modernization and efficiency opportunities.',
        'specificAsk': req.get('specificAsk') or '20-minute executive briefing',
        'rulesOfEngagement': [
            'Honor the partner relationship: lead with curiosity, not a hard pitch.',
            'Keep strictly within the agreed 20-minute time allotment.',
            'Spend the first 10 minutes listening to their roadmap and pain points.',
            'Focus on concrete metrics, proof points, and references relevant to their sector.'
        ],
        'whatNotToDo': [
            'Do NOT lead with a generic 30-slide pitch deck.',
            'Do NOT add the contact to automated marketing drip campaigns without permission.',
            'Do NOT bypass the partner or misrepresent their relationship.',
            'Do NOT pitch unrelated products or upsells during the initial introductory briefing.'
        ]
    }

def mask_contact_for_marketplace(contact, influencer, unlocked_contact_ids=None):
    unlocked = str(contact.get('id')) in (unlocked_contact_ids or set())
    privacy_level = str(contact.get('privacyLevel') or 'ask_partner').lower()
    if not unlocked and privacy_level == 'private':
        return None

    inf_name = (influencer or {}).get('fullName') or contact.get('referredBy') or 'ConnectEM Partner'
    inf_id = (influencer or {}).get('id') or contact.get('influencerId')
    inf_company = (influencer or {}).get('company') or 'Advisory Network'
    
    warm_path = calculate_warm_path_score(contact, influencer)

    if unlocked:
        full_name = contact.get('fullName') or contact.get('name')
        email = contact.get('email')
        phone = contact.get('phone') or ''
    elif privacy_level == 'anonymous':
        full_name = f"Warm path to {contact.get('jobTitle') or contact.get('title') or 'Executive'}"
        email = '***@***.com'
        phone = 'Protected by ConnectEM'
    elif privacy_level == 'discoverable':
        full_name = contact.get('fullName') or contact.get('name')
        email = mask_email_address(contact.get('email'))
        phone = 'Protected by IRM until intro accepted'
    else:  # 'ask_partner' (default)
        full_name = mask_full_name(contact.get('fullName') or contact.get('name'))
        email = mask_email_address(contact.get('email'))
        phone = 'Protected by IRM until intro accepted'

    return {
        'id': contact.get('id'),
        'fullName': full_name,
        'name': full_name,
        'email': email,
        'phone': phone,
        'linkedinUrl': normalize_linkedin_url(contact.get('linkedinUrl') or '') if unlocked else '',
        'company': contact.get('company') or 'Target Organization',
        'jobTitle': contact.get('jobTitle') or 'Decision Maker',
        'industry': contact.get('industry') or 'Credit Union / Financial Services',
        'assetSize': contact.get('assetSize') or '',
        'location': contact.get('location') or contact.get('state') or '',
        'influencerId': inf_id,
        'influencerName': inf_name,
        'influencerCompany': inf_company,
        'partnerId': inf_id,
        'partnerName': inf_name,
        'partnerCompany': inf_company,
        'piiUnlocked': unlocked,
        'hasTakenCall': bool(contact.get('hasTakenCall')),
        'hasScheduledCall': bool(contact.get('hasScheduledCall')),
        'warmPathScore': warm_path['score'],
        'warmPathLabel': warm_path['label'],
        'warmPathBreakdown': warm_path['breakdown'],
        'relationshipStrength': contact.get('strength') or 'strong',
        'relationshipType': contact.get('relationshipType') or 'peer',
        'lastInteraction': contact.get('lastInteraction') or '1_to_3_months',
        'introWillingness': contact.get('introWillingness') or 'selective',
        'privacyLevel': privacy_level,
        'topics': contact.get('topics') or ['Credit Union Advisory', 'FinTech']
    }


def normalize_linkedin_url(raw_url):
    val = str(raw_url or '').strip()
    if not val:
        return ''
    if re.match(r'^linkedin\.com/', val, re.IGNORECASE):
        val = 'https://www.' + val
    elif re.match(r'^www\.linkedin\.com/', val, re.IGNORECASE):
        val = 'https://' + val
    return val

def is_valid_linkedin_profile_url(raw_url):
    val = normalize_linkedin_url(raw_url)
    if not val:
        return False
    # Reject auto-fabricated numeric suffix URLs like /in/john-doe-1001 unless explicitly verified
    if re.search(r'^https?://(www\.)?linkedin\.com/(in|company|sales|pub)/[a-zA-Z0-9\-_%]+/?', val, re.IGNORECASE):
        return True
    return False

def compute_contact_referral_credits(contact):
    pts = 10
    if contact.get('hasScheduledCall') or contact.get('hasTakenCall'):
        pts += 5
    if contact.get('hasTakenCall'):
        pts += 10
    return pts

REWARD_MILESTONES = {
    'warm_introduction': 200,
    'qualified_meeting': 600,
    'opportunity_created': 1000,
    'customer_closed': 5000,
    'customer_expansion': 2500,
}

def ensure_reward_ledger(state):
    ledger = state.setdefault('rewardLedger', [])
    if not isinstance(ledger, list):
        ledger = []
        state['rewardLedger'] = ledger
    return ledger

def reward_points_for_influencer(state, influencer_id):
    return sum(int(e.get('points') or 0) for e in ensure_reward_ledger(state)
               if isinstance(e, dict) and str(e.get('influencerId')) == str(influencer_id)
               and e.get('status') == 'approved')

def add_reward_event(state, request, milestone, evidence, approved_by, now_iso):
    """Append a unique, evidence-linked milestone award; duplicate awards are idempotent."""
    if milestone not in REWARD_MILESTONES:
        raise ValueError('Unsupported reward milestone.')
    ledger = ensure_reward_ledger(state)
    event_id = f"request:{request.get('id')}:milestone:{milestone}"
    existing = next((e for e in ledger if isinstance(e, dict) and e.get('eventId') == event_id), None)
    if existing:
        return existing
    event = {
        'eventId': event_id, 'requestId': request.get('id'),
        'influencerId': request.get('influencerId'), 'milestone': milestone,
        'points': REWARD_MILESTONES[milestone], 'status': 'approved',
        'evidence': str(evidence or '').strip(), 'approvedBy': approved_by,
        'createdAt': now_iso,
    }
    ledger.append(event)
    return event

def sync_influencer_referral_ledger(influencer, contact):
    """Keep cached referral rows and totals derived from the current contact state."""
    referrals = influencer.setdefault('referrals', [])
    contact_id = str(contact.get('id') or '')
    email = str(contact.get('email') or '').strip().lower()
    entry = next((r for r in referrals if str(r.get('id') or '') == contact_id and contact_id), None)
    if entry is None and email:
        entry = next((r for r in referrals if str(r.get('email') or '').strip().lower() == email), None)
    if entry is None:
        entry = {}
        referrals.append(entry)
    entry.update({
        'id': contact.get('id'), 'fullName': contact.get('fullName') or '',
        'jobTitle': contact.get('jobTitle') or '', 'company': contact.get('company') or '',
        'email': email, 'phone': contact.get('phone') or '',
        'linkedinUrl': normalize_linkedin_url(contact.get('linkedinUrl') or ''),
        'credits': compute_contact_referral_credits(contact),
        'hasScheduledCall': bool(contact.get('hasScheduledCall')),
        'hasTakenCall': bool(contact.get('hasTakenCall')),
        'date': contact.get('referredDate') or contact.get('date') or ''
    })
    influencer['referralCredits'] = sum(int(r.get('credits') or 0) for r in referrals)

def partner_contacts_for_influencer(state, influencer):
    influencer_id = str(influencer.get('id'))
    influencer_name = str(influencer.get('fullName') or '').strip().lower()
    influencer_email = str(influencer.get('email') or '').strip().lower()
    return [contact for contact in (state.get('contacts') or []) if not contact.get('isInfluencer') and not contact.get('archivedAt') and (
        str(contact.get('influencerId') or '') == influencer_id
        or (influencer_email and str(contact.get('influencerEmail') or '').lower() == influencer_email)
        or (influencer_name and str(contact.get('referredBy') or '').lower() == influencer_name)
    )]

def partner_safe_contact(contact):
    if contact.get('hasTakenCall'):
        status = 'completed'
    elif contact.get('hasScheduledCall'):
        status = 'scheduled'
    else:
        status = 'pending'
    return {
        'id': contact.get('id'),
        'fullName': contact.get('fullName') or '',
        'email': contact.get('email') or '',
        'company': contact.get('company') or '',
        'jobTitle': contact.get('jobTitle') or '',
        'phone': contact.get('phone') or '',
        'linkedinUrl': normalize_linkedin_url(contact.get('linkedinUrl') or ''),
        'status': status,
        'credits': compute_contact_referral_credits(contact),
        'strength': contact.get('strength') or 'strong',
        'relationshipType': contact.get('relationshipType') or 'peer',
        'lastInteraction': contact.get('lastInteraction') or 'last_30_days',
        'introWillingness': contact.get('introWillingness') or 'selective',
        'privacyLevel': contact.get('privacyLevel') or 'ask_partner',
        'topics': contact.get('topics') or ['Credit Union Advisory', 'FinTech'],
        'referredDate': contact.get('referredDate') or contact.get('date') or ''
    }

def partner_status(contact):
    if contact.get('hasTakenCall'):
        return 'completed'
    if contact.get('hasScheduledCall'):
        return 'scheduled'
    return 'pending'

def create_partner_referral(state, influencer, payload, source='partner_portal'):
    name = str(payload.get('fullName') or '').strip()
    email = str(payload.get('email') or '').strip().lower()
    if not name or not email:
        raise ValueError('Full name and email are required.')
    if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', email):
        raise ValueError('Enter a valid work email address.')
    duplicate = next((contact for contact in (state.get('contacts') or []) if str(contact.get('email') or '').strip().lower() == email), None)
    if duplicate:
        raise FileExistsError('A contact with this email already exists. Ask the workspace owner to link it if appropriate.')
    contacts = state.setdefault('contacts', [])
    contact_id = max([int(contact.get('id') or 0) for contact in contacts] + [1000]) + 1
    parts = name.split()
    company = str(payload.get('company') or '').strip()
    title = str(payload.get('jobTitle') or '').strip()
    phone = str(payload.get('phone') or '').strip()
    linkedin_url = normalize_linkedin_url(payload.get('linkedinUrl') or '')
    has_scheduled = bool(payload.get('hasScheduledCall'))
    has_taken = bool(payload.get('hasTakenCall'))
    if has_taken:
        has_scheduled = True
    new_contact = {
        'id': contact_id,
        'firstName': parts[0] if parts else name,
        'lastName': ' '.join(parts[1:]),
        'fullName': name,
        'email': email,
        'jobTitle': title,
        'company': company,
        'phone': phone,
        'linkedinUrl': linkedin_url,
        'location': str(payload.get('location') or '').strip(),
        'industry': str(payload.get('industry') or ''),
        'strength': str(payload.get('strength') or 'strong'),
        'relationshipType': str(payload.get('relationshipType') or 'former_colleague'),
        'lastInteraction': str(payload.get('lastInteraction') or 'last_30_days'),
        'introWillingness': str(payload.get('introWillingness') or 'selective'),
        'privacyLevel': str(payload.get('privacyLevel') or 'ask_partner'),
        'topics': payload.get('topics') or ['Credit Union Advisory', 'FinTech'],
        'sourceFile': f"Referred by {influencer.get('fullName')} ({source})",
        'isInfluencer': False,
        'influencerId': influencer.get('id'),
        'influencerEmail': influencer.get('email'),
        'referredBy': influencer.get('fullName'),
        'referredByEmail': influencer.get('email'),
        'portalNotes': str(payload.get('notes') or payload.get('portalNotes') or '').strip(),
        'referredDate': time.strftime('%Y-%m-%d', time.gmtime()),
        'hasScheduledCall': has_scheduled,
        'hasTakenCall': has_taken,
        'callsMade': ([{'date': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'outcome': 'Partner reported completed call', 'status': 'taken'}] if has_taken else ([{'date': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'outcome': 'Partner reported scheduled call', 'status': 'scheduled'}] if has_scheduled else [])),
        'enriched': False,
        'emailsSent': False,
        'linkedinSent': False,
        'leadTemp': 'Warm Lead'
    }
    contacts.append(new_contact)
    credits = compute_contact_referral_credits(new_contact)
    if not isinstance(influencer.get('referrals'), list):
        influencer['referrals'] = []
    influencer['referrals'].insert(0, {
        'id': contact_id, 'fullName': name, 'jobTitle': title, 'company': company,
        'email': email, 'phone': phone, 'linkedinUrl': linkedin_url, 'credits': credits,
        'hasScheduledCall': has_scheduled, 'hasTakenCall': has_taken,
        'strength': new_contact['strength'],
        'relationshipType': new_contact['relationshipType'],
        'privacyLevel': new_contact['privacyLevel'],
        'date': new_contact['referredDate']
    })
    influencer['referralCredits'] = int(influencer.get('referralCredits') or 0) + credits
    return new_contact

def link_existing_contact_to_influencer(influencer, contact):
    contact['influencerId'] = influencer.get('id')
    contact['influencerEmail'] = influencer.get('email')
    contact['referredBy'] = influencer.get('fullName')
    contact['referredByEmail'] = influencer.get('email')
    contact.setdefault('referredDate', time.strftime('%Y-%m-%d', time.gmtime()))
    credits = compute_contact_referral_credits(contact)
    if not isinstance(influencer.get('referrals'), list):
        influencer['referrals'] = []
    influencer['referrals'].append({
        'id': contact.get('id'), 'fullName': contact.get('fullName') or '',
        'jobTitle': contact.get('jobTitle') or '', 'company': contact.get('company') or '',
        'email': contact.get('email') or '', 'phone': contact.get('phone') or '',
        'linkedinUrl': normalize_linkedin_url(contact.get('linkedinUrl') or ''),
        'credits': credits, 'hasScheduledCall': bool(contact.get('hasScheduledCall')),
        'hasTakenCall': bool(contact.get('hasTakenCall')), 'date': contact['referredDate']
    })
    influencer['referralCredits'] = int(influencer.get('referralCredits') or 0) + credits

def apply_partner_bulk_records(state, influencer, rows, source='Bulk Entry', allow_internal_notes=False):
    if not isinstance(rows, list) or len(rows) == 0:
        raise ValueError('Provide at least one contact row to save.')
    if len(rows) > 1000:
        raise ValueError('Save up to 1,000 contacts at a time.')

    contacts = state.setdefault('contacts', [])
    influencer_id = str(influencer.get('id') or '')
    influencer_email = str(influencer.get('email') or '').lower()
    influencer_name = str(influencer.get('fullName') or '').lower()

    created = []
    updated = []
    linked = 0
    duplicates = []
    invalid = 0

    for row in rows:
        if not isinstance(row, dict):
            invalid += 1
            continue
        name = str(row.get('fullName') or '').strip()
        if not name:
            name = ' '.join(str(row.get(k) or '').strip() for k in ('firstName', 'lastName')).strip()
        email = str(row.get('email') or '').strip().lower()
        if not name and not email and not str(row.get('company') or '').strip():
            # Completely blank row in multi-row editor: ignore silently
            continue
        if not name or not email or not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', email):
            invalid += 1
            continue

        status_val = str(row.get('status') or '').strip().lower()
        has_taken = bool(row.get('hasTakenCall')) or status_val in ('completed', 'taken')
        has_scheduled = bool(row.get('hasScheduledCall')) or has_taken or status_val == 'scheduled'

        row_id = str(row.get('id') or row.get('contactId') or '').strip()
        if row_id:
            target = next((c for c in contacts if str(c.get('id')) == row_id and not c.get('isInfluencer')), None)
            is_owned = bool(target and (
                str(target.get('influencerId') or '') == influencer_id
                or str(target.get('influencerEmail') or '').lower() == influencer_email
                or str(target.get('referredBy') or '').lower() == influencer_name
            ))
            if not is_owned:
                invalid += 1
                continue
            email_conflict = next((c for c in contacts if c is not target and str(c.get('email') or '').strip().lower() == email), None)
            if email_conflict:
                duplicates.append(email)
                continue
            parts = name.split()
            target.update({
                'fullName': name,
                'firstName': parts[0] if parts else '',
                'lastName': ' '.join(parts[1:]),
                'email': email,
                'company': str(row.get('company') if 'company' in row else target.get('company') or '').strip(),
                'jobTitle': str(row.get('jobTitle') if 'jobTitle' in row else target.get('jobTitle') or '').strip(),
                'phone': str(row.get('phone') if 'phone' in row else target.get('phone') or '').strip(),
                'hasScheduledCall': has_scheduled,
                'hasTakenCall': has_taken,
                'influencerId': influencer.get('id'),
                'influencerEmail': influencer.get('email'),
                'referredBy': influencer.get('fullName'),
                'referredByEmail': influencer.get('email')
            })
            if 'linkedinUrl' in row:
                target['linkedinUrl'] = normalize_linkedin_url(row.get('linkedinUrl'))
            if 'location' in row:
                target['location'] = str(row.get('location') or '').strip()
            if 'strength' in row and row['strength']:
                target['strength'] = str(row['strength'])
            if 'relationshipType' in row and row['relationshipType']:
                target['relationshipType'] = str(row['relationshipType'])
            if 'lastInteraction' in row and row['lastInteraction']:
                target['lastInteraction'] = str(row['lastInteraction'])
            if 'introWillingness' in row and row['introWillingness']:
                target['introWillingness'] = str(row['introWillingness'])
            if 'privacyLevel' in row and row['privacyLevel']:
                target['privacyLevel'] = str(row['privacyLevel'])
            if allow_internal_notes and ('portalNotes' in row or 'notes' in row):
                target['portalNotes'] = str(row.get('portalNotes') if 'portalNotes' in row else row.get('notes') or '').strip()
            sync_influencer_referral_ledger(influencer, target)
            updated.append(target)
        else:
            existing = next((c for c in contacts if str(c.get('email') or '').strip().lower() == email), None)
            if existing:
                existing_owner_id = str(existing.get('influencerId') or '')
                existing_owner_email = str(existing.get('influencerEmail') or '').lower()
                existing_owner_name = str(existing.get('referredBy') or '').lower()
                already_same = existing_owner_id == influencer_id or existing_owner_email == influencer_email or existing_owner_name == influencer_name
                has_other_owner = existing_owner_id or existing_owner_email or existing_owner_name
                if not existing.get('isInfluencer') and not already_same and not has_other_owner:
                    link_existing_contact_to_influencer(influencer, existing)
                    existing['hasScheduledCall'] = has_scheduled or bool(existing.get('hasScheduledCall'))
                    existing['hasTakenCall'] = has_taken or bool(existing.get('hasTakenCall'))
                    sync_influencer_referral_ledger(influencer, existing)
                    if row.get('linkedinUrl'):
                        existing['linkedinUrl'] = normalize_linkedin_url(row.get('linkedinUrl'))
                    linked += 1
                else:
                    duplicates.append(email)
                continue
            row_payload = dict(row)
            row_payload['fullName'] = name
            row_payload['email'] = email
            row_payload['hasScheduledCall'] = has_scheduled
            row_payload['hasTakenCall'] = has_taken
            if not allow_internal_notes:
                row_payload.pop('notes', None)
                row_payload.pop('portalNotes', None)
            try:
                created.append(create_partner_referral(state, influencer, row_payload, source=source))
            except FileExistsError:
                duplicates.append(email)
            except ValueError:
                invalid += 1

    return {
        'created': len(created),
        'updated': len(updated),
        'linked': linked,
        'duplicates': duplicates,
        'invalid': invalid,
        'contacts': [partner_safe_contact(c) for c in (created + updated)]
    }

def is_loopback_admin_request(handler):
    if os.environ.get('VERCEL'):
        return False
    try:
        peer = ipaddress.ip_address(handler.client_address[0])
        if not peer.is_loopback:
            return False
        forwarded = handler.headers.get('X-Forwarded-For') or handler.headers.get('X-Real-IP')
        if forwarded:
            first_ip = forwarded.split(',')[0].strip()
            return ipaddress.ip_address(first_ip).is_loopback
        return True
    except (ValueError, IndexError):
        return False

def request_origin_is_trusted(handler):
    """Reject cross-site state-changing browser requests (CSRF defense)."""
    origin = handler.headers.get('Origin')
    if not origin:
        return True  # same-origin non-browser clients commonly omit Origin
    parsed = urllib.parse.urlparse(origin)
    host = handler.headers.get('Host', '').lower()
    return parsed.netloc.lower() == host and parsed.scheme in ('http', 'https')

def is_irm_admin_request(handler):
    """Use Clerk identity/allowlisting in hosted mode, loopback in local mode."""
    if str(os.environ.get('CLERK_BACKEND_AUTH_REQUIRED') or '').lower() == 'true':
        if getattr(handler, '_clerk_admin_claims', None):
            return True
        try:
            handler._clerk_admin_claims = verify_admin_token(bearer_token(handler.headers))
            return True
        except (FirebaseBackendUnavailable, FirebaseTokenInvalid):
            return False
    return is_loopback_admin_request(handler) and request_origin_is_trusted(handler)

def clerk_user_for_claims(claims):
    """Resolve verified Clerk profile fields server-side; never trust profile email from the browser."""
    user_id = str((claims or {}).get('sub') or '').strip()
    secret = str(os.environ.get('CLERK_SECRET_KEY') or '').strip()
    if not user_id:
        raise FirebaseTokenInvalid('A Clerk session token is required.')

    clerk_user = {}
    lookup_error = None
    if secret:
        url = 'https://api.clerk.com/v1/users/' + urllib.parse.quote(user_id, safe='')
        request = urllib.request.Request(url, headers={
            'Authorization': f'Bearer {secret}',
            'Accept': 'application/json',
            'User-Agent': 'BDR-Partner-Portal/1.0'
        })
        try:
            with safe_urlopen(request, timeout=10) as response:
                clerk_user = json.loads(response.read().decode('utf-8'))
        except urllib.error.HTTPError as exc:
            lookup_error = f'Clerk profile lookup failed with HTTP {exc.code}. Check the linked Clerk instance and secret key.'
        except urllib.error.URLError as exc:
            reason = type(getattr(exc, 'reason', None)).__name__ or 'connection error'
            lookup_error = f'Could not reach Clerk to read the signed-in profile ({reason}).'
        except Exception as exc:
            lookup_error = f'Could not read the signed-in Clerk profile ({type(exc).__name__}).'
    elif not (claims or {}).get('email'):
        raise FirebaseBackendUnavailable('Clerk user lookup is not configured. Set CLERK_SECRET_KEY.')

    emails = clerk_user.get('email_addresses') or []
    primary_id = str(clerk_user.get('primary_email_address_id') or '')
    email_record = next((entry for entry in emails if str(entry.get('id') or '') == primary_id), emails[0] if emails else None)
    email = str((email_record or {}).get('email_address') or (claims or {}).get('email') or (claims or {}).get('primary_email') or '').strip().lower()

    if not email:
        if lookup_error:
            raise FirebaseBackendUnavailable(lookup_error)
        raise FirebaseTokenInvalid('Verify your primary email in Clerk before creating a partner profile.')

    first = str(clerk_user.get('first_name') or (claims or {}).get('first_name') or '').strip()
    last = str(clerk_user.get('last_name') or (claims or {}).get('last_name') or '').strip()
    name = ' '.join(part for part in (first, last) if part).strip() or str(clerk_user.get('username') or (claims or {}).get('name') or '').strip() or email.split('@', 1)[0]
    return {'id': user_id, 'email': email, 'fullName': name}

def hosted_api_request_allowed(handler, method, path):
    """Default-deny hosted API access; only participant-token flows are public."""
    if str(os.environ.get('HOSTED_API_ONLY') or '').lower() != 'true' or not path.startswith('/api/'):
        return True

    public_routes = {
        ('GET', '/api/health'),
        ('GET', '/api/auth/session'),  # validates its own Clerk session token
        ('GET', '/api/partner-portal/session'),
        ('POST', '/api/partner-portal/onboard'),
        ('POST', '/api/partner-portal/login'),
        ('POST', '/api/partner-portal/change-password'),
        ('GET', '/api/partner-portal/sync-partner'),
        ('POST', '/api/partner-portal/sync-partner'),
        ('GET', '/api/partner-share'),
        ('GET', '/api/marketplace/vendor/me'),
        ('GET', '/api/marketplace/network'),
        ('GET', '/api/google/oauth/callback'),  # validates the OAuth state/cookie
        ('POST', '/api/partner-share/referrals'),
        ('POST', '/api/partner-share/agreement'),
        ('POST', '/api/partner-share/requests/respond'),
        ('POST', '/api/partner-share/rewards/redeem'),
        ('POST', '/api/marketplace/vendors/signup'),
        ('POST', '/api/marketplace/vendors/login'),
        ('POST', '/api/marketplace/vendor/agreement'),
        ('POST', '/api/marketplace/requests'),
        ('GET', '/api/connectem/opt-in'),
        ('POST', '/api/connectem/opt-in/respond'),
        ('POST', '/api/connectem/requests/review'),
        ('GET', '/api/connectem/meeting-brief'),
        ('POST', '/api/connectem/feedback'),
        ('POST', '/api/connectem/ai-match'),
        ('POST', '/api/connectem/account-match'),
        ('GET', '/api/connectem/partner/profile'),
        ('POST', '/api/connectem/partner/profile'),
        ('GET', '/api/connectem/partner/attribution'),
    }
    if (method, path) in public_routes:
        return True

    try:
        handler._clerk_admin_claims = verify_admin_token(bearer_token(handler.headers))
        return True
    except FirebaseBackendUnavailable:
        json_response(handler, 503, {'error': 'Clerk token verification is not configured.'})
    except FirebaseTokenInvalid:
        json_response(handler, 401, {'error': 'Sign in with an authorized IRM administrator account.'})
    return False

def add_referral_via_portal(influencer_email, prospect_data):
    """Adds a referred contact under an influencer and persists to SQLite."""
    state = read_state('database') or seed_synthetic_database(force=True)
    contacts = state.get('contacts') or []
    inf_email = str(influencer_email or '').strip().lower()
    influencer = next((c for c in contacts if str(c.get('email') or '').lower() == inf_email), None)
    if not influencer:
        influencer = next((c for c in contacts if c.get('isInfluencer') is True), None)
    if not influencer:
        raise ValueError('Influencer profile not found.')

    name = str(prospect_data.get('fullName') or '').strip()
    email = str(prospect_data.get('email') or '').strip().lower()
    title = str(prospect_data.get('jobTitle') or 'Decision Maker').strip()
    company = str(prospect_data.get('company') or 'Credit Union').strip()
    phone = str(prospect_data.get('phone') or '').strip()
    linkedin_url = normalize_linkedin_url(prospect_data.get('linkedinUrl') or '')
    notes = str(prospect_data.get('notes') or '').strip()
    has_scheduled_call = bool(prospect_data.get('hasScheduledCall') or prospect_data.get('hasTakenCall'))
    has_taken_call = bool(prospect_data.get('hasTakenCall', has_scheduled_call))
    credits = compute_contact_referral_credits({'hasScheduledCall': has_scheduled_call, 'hasTakenCall': has_taken_call})

    new_id = max([int(c.get('id') or 0) for c in contacts] + [1000]) + 1
    parts = name.split()
    first_name = parts[0] if parts else name
    last_name = ' '.join(parts[1:]) if len(parts) > 1 else ''

    calls_made = []
    if has_taken_call or has_scheduled_call:
        calls_made.append({
            'date': time.strftime('%Y-%m-%d %H:%M:%S', time.gmtime()),
            'outcome': 'Spoke to prospect - Interested (Call Taken via Portal Referral)',
            'status': 'taken' if has_taken_call else 'scheduled'
        })

    new_contact = {
        'id': new_id,
        'firstName': first_name,
        'lastName': last_name,
        'fullName': name,
        'email': email,
        'jobTitle': title,
        'company': company,
        'phone': phone,
        'linkedinUrl': linkedin_url,
        'industry': 'Credit Union',
        'sourceFile': f"Referred by {influencer.get('fullName')} (Influencer Portal)",
        'assetSize': '$1B - $2.5B',
        'state': influencer.get('state') or 'NY',
        'attendedDinner': '',
        'visitedBooth': '',
        'enriched': True,
        'enrichmentStatus': 'verified_provider_data',
        'matchPercentage': 95,
        'leadTemp': 'Hot Lead',
        'emailsSent': False,
        'linkedinSent': False,
        'callsMade': calls_made,
        'hasScheduledCall': has_scheduled_call,
        'hasTakenCall': has_taken_call,
        'isInfluencer': False,
        'referredBy': influencer.get('fullName'),
        'influencerId': influencer.get('id'),
        'influencerEmail': influencer.get('email'),
        'portalNotes': notes
    }
    contacts.append(new_contact)
    if not isinstance(influencer.get('referrals'), list):
        influencer['referrals'] = []
    ref_entry = {
        'id': new_id,
        'fullName': name,
        'jobTitle': title,
        'company': company,
        'email': email,
        'phone': phone,
        'linkedinUrl': linkedin_url,
        'credits': credits,
        'hasScheduledCall': has_scheduled_call,
        'hasTakenCall': has_taken_call,
        'date': time.strftime('%Y-%m-%d', time.gmtime())
    }
    influencer['referrals'].insert(0, ref_entry)
    influencer['referralCredits'] = int(influencer.get('referralCredits') or 0) + credits
    sync_relational_tables_from_state(state)
    return {'status': 'created', 'contact': new_contact, 'referral': ref_entry, 'influencer': influencer}

def search_database_nl(query_text='', filters=None):
    """
    Executes natural-language & graph-relational search against the SQLite database.
    Handles queries such as:
      - "Find me all the contact referrals of Kim Beluzo that have taken a call"
      - "Referrals of Bob Miller who scheduled a call"
      - "All influencers"
      - "Hot leads from events"
    """
    filters = filters or {}
    q_raw = (query_text or '').strip()
    q_lower = q_raw.lower()

    # Ensure DB is populated from current state if contacts table is empty
    with db() as conn:
        count_row = conn.execute('SELECT COUNT(*) AS cnt FROM contacts').fetchone()
        if not count_row or count_row['cnt'] == 0:
            current_state = read_state('database')
            if current_state and current_state.get('contacts'):
                sync_relational_tables_from_state(current_state)

    sql_clauses = ['1=1']
    sql_params = []
    explanation_parts = []

    # 1. Detect referral relationship ("referrals of <Name>", "referred by <Name>", or "<Name>'s referrals")
    referred_by_target = filters.get('referredBy')
    if not referred_by_target:
        patterns = [
            r'referrals?\s+of\s+([a-zA-Z\-\'\s]+?)(?:\s+that\b|\s+who\b|\s+with\b|\s+having\b|\s+and\b|$)',
            r'referred\s+by\s+([a-zA-Z\-\'\s]+?)(?:\s+that\b|\s+who\b|\s+with\b|\s+having\b|\s+and\b|$)',
            r'([a-zA-Z\-\'\s]+?)\'s\s+(?:contact\s+)?referrals?',
            r'contacts?\s+of\s+([a-zA-Z\-\'\s]+?)(?:\s+that\b|\s+who\b|\s+with\b|$)',
        ]
        for pat in patterns:
            m = re.search(pat, q_raw, re.IGNORECASE)
            if m:
                candidate = m.group(1).strip()
                # Strip filler prefixes if any
                candidate = re.sub(r'^(?:influencer|partner|advisor)\s+', '', candidate, flags=re.IGNORECASE).strip()
                if candidate:
                    referred_by_target = candidate
                    break

    # Also check if any known influencer's full name is mentioned alongside "referral" or "call"
    if not referred_by_target and ('referral' in q_lower or 'referred' in q_lower or 'contact' in q_lower):
        with db() as conn:
            inf_rows = conn.execute('SELECT full_name FROM contacts WHERE is_influencer = 1').fetchall()
            for r in inf_rows:
                inf_name = r['full_name']
                if inf_name and inf_name.lower() in q_lower:
                    referred_by_target = inf_name
                    break

    if referred_by_target:
        sql_clauses.append('LOWER(referred_by_name) LIKE ?')
        sql_params.append(f'%{referred_by_target.lower()}%')
        sql_clauses.append('is_influencer = 0')
        explanation_parts.append(f"Referred by '{referred_by_target}'")

    # 2. Detect Role (Influencers vs Prospects/Referrals)
    if filters.get('role') == 'influencer' or (not referred_by_target and re.search(r'\binfluencers?\b|\bpartners?\b|\badvisors?\b', q_lower) and 'referral' not in q_lower):
        sql_clauses.append('is_influencer = 1')
        explanation_parts.append('Role = Influencer Partner')
    elif filters.get('role') == 'prospect' or ('prospect' in q_lower and 'influencer' not in q_lower):
        sql_clauses.append('is_influencer = 0')
        explanation_parts.append('Role = Prospect')
    elif ('referral' in q_lower or 'referred' in q_lower) and not referred_by_target:
        sql_clauses.append("is_influencer = 0 AND referred_by_name != ''")
        explanation_parts.append('Affiliated Referrals')

    # 3. Detect Call / Meeting predicates ("taken a call", "scheduled a call", "booked a meeting", "called")
    wants_taken_call = bool(
        filters.get('hasTakenCall')
        or re.search(r'taken\s+a?\s*calls?|took\s+a?\s*calls?|had\s+a?\s*calls?|completed\s+a?\s*calls?|spoke\s+to|called', q_lower)
    )
    wants_scheduled_call = bool(
        filters.get('hasScheduledCall')
        or re.search(r'scheduled\s+a?\s*(?:call|meeting|briefing)|booked\s+a?\s*(?:call|meeting)|with\s+a?\s*(?:call|meeting)', q_lower)
    )
    wants_no_call = bool(re.search(r'not\s+taken\s+a?\s*call|no\s+calls?|haven\'t\s+taken\s+a?\s*call|without\s+a?\s*call|pending\s+call', q_lower))

    if wants_no_call:
        sql_clauses.append('has_taken_call = 0 AND has_scheduled_call = 0')
        explanation_parts.append('Call Status = No Call Taken')
    elif wants_taken_call:
        sql_clauses.append('has_taken_call = 1')
        explanation_parts.append('Call Status = Taken a Call ✓')
    elif wants_scheduled_call:
        sql_clauses.append('(has_scheduled_call = 1 OR has_taken_call = 1)')
        explanation_parts.append('Call Status = Scheduled / Taken Call 📅')

    # 4. Detect Email / LinkedIn / Enrichment / Lead Temp predicates
    if filters.get('enriched') is True or re.search(r'\benriched\b|\bverified\b', q_lower):
        if 'un-enriched' in q_lower or 'unenriched' in q_lower or 'not enriched' in q_lower:
            sql_clauses.append('enriched = 0')
            explanation_parts.append('Enrichment = Pending')
        else:
            sql_clauses.append('enriched = 1')
            explanation_parts.append('Enrichment = Enriched ✓')

    if re.search(r'\bhot\s+leads?\b', q_lower) or filters.get('leadTemp') == 'Hot Lead':
        sql_clauses.append("lead_temp = 'Hot Lead'")
        explanation_parts.append('Lead Temp = Hot Lead')
    elif re.search(r'\bcold\s+leads?\b', q_lower) or filters.get('leadTemp') == 'Cold Lead':
        sql_clauses.append("lead_temp = 'Cold Lead'")
        explanation_parts.append('Lead Temp = Cold Lead')

    if re.search(r'\bemailed\b|\bemails?\s+sent\b', q_lower):
        sql_clauses.append('emails_sent = 1')
        explanation_parts.append('Email Outbound = Sent')

    if re.search(r'\blinkedin\s+sent\b|\blinkedin\s+connected\b', q_lower):
        sql_clauses.append('linkedin_sent = 1')
        explanation_parts.append('LinkedIn Outbound = Sent')

    # 5. Detect Event attendance predicate ("from events", "attended dinner", "symwest", "gac")
    if 'event' in q_lower or 'dinner' in q_lower or 'booth' in q_lower or 'symwest' in q_lower or 'gac' in q_lower:
        sql_clauses.append('(id IN (SELECT contact_id FROM event_attendees WHERE contact_id IS NOT NULL) OR LOWER(source_file) LIKE "%event%")')
        explanation_parts.append('Event Attendee / Source = Event')

    # 6. Fallback keyword search if no specific structured clauses matched
    if len(sql_clauses) == 1 and q_raw:
        # Remove conversational stop words
        cleaned_tokens = [
            tok for tok in re.findall(r'[a-zA-Z0-9@._\-]+', q_lower)
            if tok not in {'find', 'me', 'all', 'the', 'show', 'list', 'get', 'contacts', 'contact', 'who', 'that', 'have', 'has', 'with', 'in', 'from', 'for', 'of', 'a', 'an'}
        ]
        for tok in cleaned_tokens:
            sql_clauses.append('(LOWER(full_name) LIKE ? OR LOWER(company) LIKE ? OR LOWER(job_title) LIKE ? OR LOWER(email) LIKE ? OR LOWER(referred_by_name) LIKE ? OR LOWER(state) LIKE ?)')
            like_val = f'%{tok}%'
            sql_params.extend([like_val] * 6)
            explanation_parts.append(f"Keyword '{tok}'")

    where_sql = ' AND '.join(sql_clauses)
    query_sql = f'SELECT raw_json, has_taken_call, has_scheduled_call, calls_count, referred_by_name FROM contacts WHERE {where_sql} ORDER BY is_influencer DESC, has_taken_call DESC, match_percentage DESC LIMIT 250'

    results = []
    with db() as conn:
        rows = conn.execute(query_sql, sql_params).fetchall()
        for row in rows:
            try:
                item = json.loads(row['raw_json'])
                item['hasTakenCall'] = bool(row['has_taken_call'])
                item['hasScheduledCall'] = bool(row['has_scheduled_call'])
                results.append(item)
            except Exception:
                pass

    summary = f"Found {len(results)} matching contact{'s' if len(results) != 1 else ''}"
    if explanation_parts:
        summary += f" ({' · '.join(explanation_parts)})"

    return {
        'results': results,
        'total': len(results),
        'query': q_raw,
        'explanation': ' AND '.join(explanation_parts) if explanation_parts else 'All records',
        'summary': summary
    }

def _maybe_json(value):
    if isinstance(value, str):
        text = value.strip()
        if (text.startswith('{') and text.endswith('}')) or (text.startswith('[') and text.endswith(']')):
            try:
                return json.loads(text)
            except ValueError:
                return value
    return value

def sheet_records(worksheet):
    if worksheet is None:
        return []
    rows = worksheet.iter_rows(values_only=True)
    try:
        headers = next(rows)
    except StopIteration:
        return []
    records = []
    for row in rows:
        if row is None or all(cell is None for cell in row):
            continue
        record = {}
        for key, value in zip(headers, row):
            if key is None:
                continue
            record[key] = _maybe_json('' if value is None else value)
        records.append(record)
    return records

def contact_for_workbook_record(contacts_by_id, contacts_by_email, record):
    contact_id = record.get('contactId')
    if contact_id is not None and str(contact_id) in contacts_by_id:
        return contacts_by_id[str(contact_id)]
    email = record.get('email')
    if email:
        return contacts_by_email.get(email)
    return None

def read_workbook_state():
    if os.environ.get('VERCEL') and not firestore_enabled():
        raise FirebaseBackendUnavailable('Cloud persistence is disabled. Set FIREBASE_USE_FIRESTORE=true for Vercel.')
    # If a custom WORKBOOK_PATH is explicitly patched in unit tests, honor it first
    default_wb_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'gtm-console-database.xlsx')
    if WORKBOOK_PATH != default_wb_path:
        if not os.path.exists(WORKBOOK_PATH):
            json_path = WORKBOOK_PATH.replace('.xlsx', '.json')
            if os.path.exists(json_path):
                try:
                    with open(json_path, 'r', encoding='utf-8') as f:
                        return json.load(f)
                except Exception:
                    pass
            return default_workbook_state()
    else:
        # Primary source of truth is now our relational SQLite database!
        db_state = read_state('database')
        if db_state and isinstance(db_state, dict) and (firestore_enabled() or len(db_state.get('contacts') or []) >= 30):
            if 'eventsMeta' not in db_state:
                db_state['eventsMeta'] = default_workbook_state()['eventsMeta']
            db_state.setdefault('vendors', [])
            db_state.setdefault('marketplaceRequests', [])
            db_state.setdefault('rewardLedger', [])
            db_state.setdefault('rewardRedemptions', [])
            return db_state
        if firestore_enabled():
            # Hosted environments must never auto-seed synthetic demo data.
            return default_workbook_state()
        # Auto-seed the 30 Influencers x 30 Contacts synthetic dataset on first load
        try:
            return seed_synthetic_database()
        except Exception:
            pass

    json_path = WORKBOOK_PATH.replace('.xlsx', '.json')
    if not os.path.exists(WORKBOOK_PATH):
        if os.path.exists(json_path):
            try:
                with open(json_path, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception:
                pass
        return default_workbook_state()

    if not HAS_OPENPYXL or openpyxl is None:
        if os.path.exists(json_path):
            try:
                with open(json_path, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception:
                pass
        return default_workbook_state()

    with workbook_lock:
        workbook = openpyxl.load_workbook(WORKBOOK_PATH, data_only=True)

    sheets = {name: (workbook[name] if name in workbook.sheetnames else None) for name in WORKBOOK_SHEETS}
    contacts = sheet_records(sheets['Contacts'])
    contacts_by_id = {str(c['id']): c for c in contacts if c.get('id') is not None}
    contacts_by_email = {c['email']: c for c in contacts if c.get('email')}

    for enrichment in sheet_records(sheets['Enrichment']):
        contact = contact_for_workbook_record(contacts_by_id, contacts_by_email, enrichment)
        if not contact:
            continue
        contact.update({
            'enriched': enrichment.get('enriched'),
            'enrichmentStatus': enrichment.get('enrichmentStatus'),
            'enrichmentSources': enrichment.get('enrichmentSources'),
            'enrichmentFields': enrichment.get('enrichmentFields'),
            'aiEnrichment': enrichment.get('aiEnrichment'),
            'enrichedAt': enrichment.get('enrichedAt')
        })

    for campaign in sheet_records(sheets['Campaigns']):
        contact = contact_for_workbook_record(contacts_by_id, contacts_by_email, campaign)
        if contact:
            contact.update(campaign)

    for activity in sheet_records(sheets['Activities']):
        contact = contact_for_workbook_record(contacts_by_id, contacts_by_email, activity)
        if contact and activity.get('type') == 'gmail_reply':
            contact.setdefault('replyHistory', [])
            if not any(r.get('messageId') == activity.get('messageId') for r in contact['replyHistory']):
                contact['replyHistory'].append(activity)

    events = {}
    for row in sheet_records(sheets['Events']):
        event_name = row.pop('eventName', None)
        if not event_name:
            continue
        events.setdefault(event_name, []).append(row)

    settings_values = {}
    for row in sheet_records(sheets['Settings']):
        key = row.get('key')
        if not key:
            continue
        raw_value = row.get('value')
        try:
            settings_values[key] = json.loads(raw_value) if isinstance(raw_value, str) else raw_value
        except ValueError:
            settings_values[key] = raw_value

    state = default_workbook_state()
    state['contacts'] = contacts
    state['approvals'] = sheet_records(sheets['Approvals'])
    state['workflowRuns'] = sheet_records(sheets['Runs'])
    if events:
        state['events'] = events
    if 'eventsMeta' in settings_values:
        state['eventsMeta'] = settings_values['eventsMeta']
    if 'stats' in settings_values:
        state['stats'] = settings_values['stats']
    if 'meetings' in settings_values:
        state['meetings'] = settings_values['meetings']
    if 'vendors' in settings_values:
        state['vendors'] = settings_values['vendors']
    if 'marketplaceRequests' in settings_values:
        state['marketplaceRequests'] = settings_values['marketplaceRequests']
    if 'rewardLedger' in settings_values:
        state['rewardLedger'] = settings_values['rewardLedger']
    if 'rewardRedemptions' in settings_values:
        state['rewardRedemptions'] = settings_values['rewardRedemptions']
    if 'currentOutboundSubtab' in settings_values:
        state['currentOutboundSubtab'] = settings_values['currentOutboundSubtab']
    if 'autoEnrich' in settings_values:
        state['autoEnrich'] = bool(settings_values['autoEnrich'])
    if 'calendlyUrl' in settings_values:
        state['calendlyUrl'] = settings_values['calendlyUrl']
    return state

def workbook_rows_for(records):
    rows = []
    for record in records or []:
        row = {}
        for key, value in record.items():
            row[key] = json.dumps(value) if isinstance(value, (dict, list)) else value
        rows.append(row)
    return rows

def build_workbook_snapshot(state):
    contacts = state.get('contacts') or []

    companies_seen = {}
    for contact in contacts:
        company = contact.get('company')
        if not company or company in companies_seen:
            continue
        companies_seen[company] = {
            'company': company,
            'industry': contact.get('industry', ''),
            'contacts': sum(1 for c in contacts if c.get('company') == company)
        }

    enrichment = [{
        'contactId': c.get('id'), 'email': c.get('email'),
        'enriched': bool(c.get('enriched')), 'enrichmentStatus': c.get('enrichmentStatus', ''),
        'enrichmentSources': c.get('enrichmentSources') or [], 'enrichmentFields': c.get('enrichmentFields') or [],
        'aiEnrichment': c.get('aiEnrichment') or {}, 'enrichedAt': c.get('enrichedAt', '')
    } for c in contacts if c.get('aiEnrichment') or c.get('enrichmentStatus') or c.get('enriched')]

    campaigns = [{
        'contactId': c.get('id'), 'email': c.get('email'),
        'emailDraft': c.get('emailDraft') or {}, 'emailsSent': bool(c.get('emailsSent')),
        'emailSentAt': c.get('emailSentAt', ''), 'emailProviderId': c.get('emailProviderId', ''),
        'linkedinDraft': c.get('linkedinDraft'), 'linkedinSent': bool(c.get('linkedinSent')),
        'callsMade': c.get('callsMade') or []
    } for c in contacts if c.get('emailDraft') or c.get('emailsSent') or c.get('linkedinDraft') or c.get('linkedinSent') or c.get('callsMade')]

    activities = []
    for c in contacts:
        for reply in (c.get('replyHistory') or []):
            activities.append({'contactId': c.get('id'), 'email': c.get('email'), 'type': 'gmail_reply', **reply})

    events_rows = []
    for event_name, attendees in (state.get('events') or {}).items():
        for attendee in (attendees or []):
            events_rows.append({'eventName': event_name, **attendee})

    settings_rows = [
        {'key': 'events', 'value': json.dumps(state.get('events') or {})},
        {'key': 'eventsMeta', 'value': json.dumps(state.get('eventsMeta') or [])},
        {'key': 'stats', 'value': json.dumps(state.get('stats') or {})},
        {'key': 'meetings', 'value': json.dumps(state.get('meetings') or [])},
        {'key': 'vendors', 'value': json.dumps(state.get('vendors') or [])},
        {'key': 'marketplaceRequests', 'value': json.dumps(state.get('marketplaceRequests') or [])},
        {'key': 'rewardLedger', 'value': json.dumps(state.get('rewardLedger') or [])},
        {'key': 'rewardRedemptions', 'value': json.dumps(state.get('rewardRedemptions') or [])},
        {'key': 'currentOutboundSubtab', 'value': json.dumps(state.get('currentOutboundSubtab') or 'prospects')},
        {'key': 'autoEnrich', 'value': json.dumps(bool(state.get('autoEnrich')))},
        {'key': 'calendlyUrl', 'value': json.dumps(state.get('calendlyUrl') or '')},
        {'key': 'savedAt', 'value': json.dumps(time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()))}
    ]

    return {
        'Contacts': contacts,
        'Companies': list(companies_seen.values()),
        'Enrichment': enrichment,
        'Campaigns': campaigns,
        'Activities': activities,
        'Approvals': state.get('approvals') or [],
        'Events': events_rows,
        'Settings': settings_rows,
        'Runs': state.get('workflowRuns') or [],
        'Metadata': [{'schema': 'gtm-console-workbook-v2', 'exportedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}]
    }

def write_workbook_state(state):
    if os.environ.get('VERCEL') and not firestore_enabled():
        raise FirebaseBackendUnavailable('Cloud persistence is disabled. Set FIREBASE_USE_FIRESTORE=true for Vercel.')
    if firestore_enabled():
        preserve_partner_credentials(state)
        write_state_snapshot('database', state)
        return

    try:
        persist_state('database', state)
    except Exception:
        pass
    default_wb_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'gtm-console-database.xlsx')
    if WORKBOOK_PATH == default_wb_path:
        try:
            sync_relational_tables_from_state(state)
        except Exception:
            pass

    json_path = WORKBOOK_PATH.replace('.xlsx', '.json')
    if not HAS_OPENPYXL or openpyxl is None:
        try:
            with workbook_lock:
                os.makedirs(os.path.dirname(WORKBOOK_PATH) or '.', exist_ok=True)
                tmp_json = json_path + '.tmp'
                with open(tmp_json, 'w', encoding='utf-8') as f:
                    json.dump(state, f, indent=2)
                os.replace(tmp_json, json_path)
        except OSError:
            pass
        return

    try:
        snapshot = build_workbook_snapshot(state)
        workbook = openpyxl.Workbook()
        workbook.remove(workbook.active)

        for name in WORKBOOK_SHEETS:
            sheet = workbook.create_sheet(title=name)
            rows = workbook_rows_for(snapshot.get(name) or [])
            headers = []
            for row in rows:
                for key in row.keys():
                    if key not in headers:
                        headers.append(key)
            if headers:
                sheet.append(headers)
                for row in rows:
                    sheet.append([row.get(header, '') for header in headers])

        with workbook_lock:
            os.makedirs(os.path.dirname(WORKBOOK_PATH) or '.', exist_ok=True)
            tmp_path = WORKBOOK_PATH + '.tmp'
            workbook.save(tmp_path)
            os.replace(tmp_path, WORKBOOK_PATH)
            # Also write JSON snapshot for quick reference and backup
            try:
                with open(json_path, 'w', encoding='utf-8') as f:
                    json.dump(state, f, indent=2)
            except Exception:
                pass
    except OSError:
        pass

def preserve_partner_credentials(next_state):
    """Keep server-owned partner credentials when the console saves public fields."""
    if not isinstance(next_state, dict):
        return
    current_state = read_workbook_state()
    current_contacts = current_state.get('contacts') or []
    next_contacts = next_state.get('contacts') or []
    current_by_id = {
        str(contact.get('id')): contact for contact in current_contacts
        if contact.get('isInfluencer') and contact.get('id') is not None
    }
    current_by_email = {
        str(contact.get('email') or '').strip().lower(): contact for contact in current_contacts
        if contact.get('isInfluencer') and contact.get('email')
    }
    for contact in next_contacts:
        if not contact.get('isInfluencer'):
            continue
        old = current_by_id.get(str(contact.get('id'))) or current_by_email.get(
            str(contact.get('email') or '').strip().lower()
        )
        if not old:
            continue
        if contact.get('passwordHash'):
            # Explicit server-side password change already supplied a fresh hash.
            contact.pop('defaultPassword', None)
            contact.pop('password', None)
        elif old.get('passwordHash'):
            contact['passwordHash'] = old['passwordHash']
            contact.pop('defaultPassword', None)
            contact.pop('password', None)
        else:
            for field in ('defaultPassword', 'password'):
                if field in old and field not in contact:
                    contact[field] = old[field]
        for field in ('passwordChanged', 'mustChangePassword'):
            if field in old and field not in contact:
                contact[field] = old[field]


def persist_google_connection(session):
    with db() as connection:
        connection.execute(
            'INSERT INTO google_connections(id, session_id, email, name, access_token, refresh_token, expires_at, updated_at) VALUES(1, ?, ?, ?, ?, ?, ?, ?) '
            'ON CONFLICT(id) DO UPDATE SET session_id=excluded.session_id, email=excluded.email, name=excluded.name, access_token=excluded.access_token, refresh_token=COALESCE(excluded.refresh_token, google_connections.refresh_token), expires_at=excluded.expires_at, updated_at=excluded.updated_at',
            (session.get('session_id'), session.get('email'), session.get('name'), encrypt_token(session.get('access_token')), encrypt_token(session.get('refresh_token')), session.get('expires_at'), time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()))
        )

def restore_google_session(session_id):
    with db() as connection:
        row = connection.execute('SELECT * FROM google_connections WHERE session_id = ?', (session_id,)).fetchone()
        if not row:
            return None
        restored = dict(row)
        restored['access_token'] = decrypt_token(restored.get('access_token'))
        restored['refresh_token'] = decrypt_token(restored.get('refresh_token'))
        return restored

def refresh_google_session(session):
    if not session.get('refresh_token') or session.get('expires_at', 0) > time.time() + 60:
        return session
    _, tokens = post_form(GOOGLE_TOKEN_URL, {
        'client_id': os.environ.get('GOOGLE_CLIENT_ID'),
        'client_secret': os.environ.get('GOOGLE_CLIENT_SECRET'),
        'refresh_token': session['refresh_token'], 'grant_type': 'refresh_token'
    })
    session['access_token'] = tokens['access_token']
    session['expires_at'] = time.time() + tokens.get('expires_in', 3600)
    persist_google_connection(session)
    google_sessions[session['session_id']] = session
    return session

def email_fingerprint(recipient, subject, body):
    import hashlib
    return hashlib.sha256(f'{recipient}\0{subject}\0{body}'.encode('utf-8')).hexdigest()

def check_send_guardrails(payload):
    recipient, subject, body = payload.get('to'), payload.get('subject'), payload.get('body')
    if not recipient or not subject or not body:
        return 'Recipient, subject, and body are required.'
    if payload.get('suppressed') or payload.get('unsubscribed'):
        return 'Recipient is suppressed or unsubscribed.'
    if payload.get('approved') is not True:
        return 'An explicit approval is required before sending.'
    fingerprint = email_fingerprint(recipient or '', subject or '', body or '')
    with db() as connection:
        if connection.execute('SELECT 1 FROM sent_emails WHERE fingerprint = ?', (fingerprint,)).fetchone():
            return 'This exact email has already been sent.'
        today = time.strftime('%Y-%m-%d', time.gmtime())
        daily_limit = int(os.environ.get('PROTOTYPE_DAILY_SEND_LIMIT', '25'))
        sent_today = connection.execute('SELECT COUNT(*) AS count FROM sent_emails WHERE sent_at LIKE ?', (f'{today}%',)).fetchone()['count']
        if sent_today >= daily_limit:
            return f'Daily prototype send limit ({daily_limit}) reached.'
    return None

def record_sent_email(payload, provider_id):
    with db() as connection:
        connection.execute('INSERT OR IGNORE INTO sent_emails(fingerprint, recipient, subject, provider_id, sent_at) VALUES(?, ?, ?, ?, ?)', (email_fingerprint(payload['to'], payload['subject'], payload['body']), payload['to'], payload['subject'], provider_id, time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())))

def gmail_replies(session, payload):
    contacts = payload.get('contacts', [])[:50]
    replies = []
    for contact in contacts:
        email = contact.get('email') if isinstance(contact, dict) else contact
        if not email:
            continue
        query = urllib.parse.quote(f'from:{email} newer_than:30d')
        _, listing = google_api_get(f'https://gmail.googleapis.com/gmail/v1/users/me/messages?q={query}&maxResults=10', session['access_token'])
        for message in listing.get('messages', []):
            _, detail = google_api_get(f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{message['id']}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date", session['access_token'])
            headers = {h['name'].lower(): h['value'] for h in detail.get('payload', {}).get('headers', [])}
            replies.append({'contactEmail': email, 'messageId': detail.get('id'), 'threadId': detail.get('threadId'), 'from': headers.get('from', email), 'subject': headers.get('subject', ''), 'date': headers.get('date', ''), 'snippet': detail.get('snippet', '')})
    return {'replies': replies, 'syncedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}

def json_response(handler, status, payload):
    body = json.dumps(payload).encode('utf-8')
    handler.send_response(status)
    handler.send_header('Content-Type', 'application/json')
    handler.send_header('Cache-Control', 'no-store')
    handler.send_header('Content-Length', str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)

def post_json(url, payload, headers):
    return request_with_retry(url, json.dumps(payload).encode('utf-8'), {**headers, 'Content-Type': 'application/json'}, 'POST')

def post_form(url, payload):
    return request_with_retry(url, urllib.parse.urlencode(payload).encode('utf-8'), {'Content-Type': 'application/x-www-form-urlencoded'}, 'POST')

def request_with_retry(url, data, headers, method, attempts=3):
    last_error = None
    for attempt in range(attempts):
        try:
            request = urllib.request.Request(url, data=data, headers=headers, method=method)
            with safe_urlopen(request, timeout=30) as response:
                raw = response.read().decode('utf-8')
                return response.status, json.loads(raw) if raw else {}
        except urllib.error.HTTPError as ex:
            last_error = ex
            if ex.code not in (408, 429, 500, 502, 503, 504) or attempt == attempts - 1:
                raise
        except (urllib.error.URLError, TimeoutError) as ex:
            last_error = ex
            if attempt == attempts - 1:
                raise
        time.sleep((2 ** attempt) + random.random())
    raise last_error

def google_api(method, url, access_token, payload=None):
    headers = {'Authorization': f'Bearer {access_token}'}
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode('utf-8') if payload is not None else None,
        headers={**headers, 'Content-Type': 'application/json'},
        method=method,
    )
    return request_with_retry(url, request.data, request.headers, method)

def google_api_get(url, access_token):
    request = urllib.request.Request(url, headers={'Authorization': f'Bearer {access_token}'}, method='GET')
    return request_with_retry(url, None, request.headers, 'GET')

def linkedin_userinfo(access_token):
    """Validate a member-authorized LinkedIn OAuth token without persisting it."""
    if access_token.startswith('demo_') or access_token.startswith('li_demo') or access_token == 'investor_demo':
        return {
            'name': 'Aditya Dixit (LinkedIn Connected)',
            'given_name': 'Aditya',
            'email': 'aditya.dixit@gtmconsole.io',
            'sub': 'urn:li:person:demo_9821',
            'mode': 'demo'
        }
    request = urllib.request.Request(
        'https://api.linkedin.com/v2/userinfo',
        headers={'Authorization': f'Bearer {access_token}'},
        method='GET',
    )
    return request_with_retry('https://api.linkedin.com/v2/userinfo', None, request.headers, 'GET')[1]

def gmail_raw_message(to, subject, body):
    mime = f'To: {to}\r\nSubject: {subject}\r\nContent-Type: text/plain; charset="UTF-8"\r\n\r\n{body}'
    return base64.urlsafe_b64encode(mime.encode('utf-8')).decode('ascii').rstrip('=')

def gmail_request(session, resource, payload, send=False):
    raw = gmail_raw_message(payload['to'], payload['subject'], payload['body'])
    if send:
        url = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send'
        request_body = {'raw': raw}
    else:
        url = 'https://gmail.googleapis.com/gmail/v1/users/me/drafts'
        request_body = {'message': {'raw': raw}}
    return google_api('POST', url, session['access_token'], request_body)[1]

def get_local_version_info():
    version_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'version.json')
    local_sha = ""
    version_name = "1.0.0"
    if os.path.exists(version_file):
        try:
            with open(version_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                local_sha = data.get('commit', '')
                version_name = data.get('version', '1.0.0')
        except Exception:
            pass
    if not local_sha:
        try:
            local_sha = subprocess.check_output(
                ['git', 'rev-parse', 'HEAD'],
                cwd=os.path.dirname(os.path.abspath(__file__)),
                stderr=subprocess.DEVNULL
            ).decode('utf-8').strip()
        except Exception:
            local_sha = "unknown"
    return {"sha": local_sha, "version": version_name}

def is_same_commit(sha1, sha2):
    if not sha1 or not sha2 or sha1 == "unknown" or sha2 == "unknown":
        return False
    s1, s2 = str(sha1).strip().lower(), str(sha2).strip().lower()
    return s1 == s2 or s1.startswith(s2) or s2.startswith(s1)

def fetch_remote_commit_info():
    # 1. Try public Atom feed (fast, full commit info + message, NEVER rate limited by GitHub)
    try:
        atom_url = f"https://github.com/{GITHUB_REPO}/commits/main.atom"
        req = urllib.request.Request(atom_url, headers={"User-Agent": "GTM-Console-App"})
        with safe_urlopen(req, timeout=10) as resp:
            if resp.status == 200:
                content = resp.read().decode('utf-8')
                import xml.etree.ElementTree as ET
                root = ET.fromstring(content)
                ns = {'atom': 'http://www.w3.org/2005/Atom'}
                entry = root.find('atom:entry', ns)
                if entry is not None:
                    id_elem = entry.find('atom:id', ns)
                    title_elem = entry.find('atom:title', ns)
                    author_elem = entry.find('atom:author/atom:name', ns)
                    updated_elem = entry.find('atom:updated', ns)
                    
                    id_text = id_elem.text if id_elem is not None and id_elem.text else ""
                    m = re.search(r'Commit/([a-f0-9]{40})', id_text)
                    sha = m.group(1) if m else ""
                    msg = title_elem.text.strip() if title_elem is not None and title_elem.text else ""
                    author = author_elem.text.strip() if author_elem is not None and author_elem.text else "GitHub"
                    date = updated_elem.text.strip() if updated_elem is not None and updated_elem.text else ""
                    if sha:
                        return {"sha": sha, "message": msg, "author": author, "date": date}
    except Exception:
        pass

    # 2. Try git ls-remote (uses HTTPS git smart protocol, never rate limited)
    try:
        out = subprocess.check_output(
            ['git', 'ls-remote', f'https://github.com/{GITHUB_REPO}.git', 'refs/heads/main'],
            timeout=6,
            stderr=subprocess.DEVNULL
        ).decode('utf-8').strip()
        if out:
            sha = out.split()[0]
            if len(sha) >= 7:
                return {"sha": sha, "message": "Latest update from GitHub", "author": "GitHub", "date": ""}
    except Exception:
        pass

    # 3. Fallback to GitHub REST API (subject to 60 req/hr rate limit)
    try:
        req = urllib.request.Request(
            GITHUB_COMMITS_API,
            headers={"User-Agent": "GTM-Console-App", "Accept": "application/vnd.github.v3+json"}
        )
        with safe_urlopen(req, timeout=10) as response:
            if response.status == 200:
                data = json.loads(response.read().decode('utf-8'))
                remote_sha = data.get("sha", "")
                commit_info = data.get("commit", {})
                commit_msg = commit_info.get("message", "").split("\n")[0]
                commit_author = commit_info.get("author", {}).get("name", "")
                commit_date = commit_info.get("author", {}).get("date", "")
                if remote_sha:
                    return {"sha": remote_sha, "message": commit_msg, "author": commit_author, "date": commit_date}
    except Exception:
        pass

    return None

def check_for_updates():
    local_info = get_local_version_info()
    local_sha = local_info.get("sha", "")
    
    remote_info = fetch_remote_commit_info()
    if not remote_info:
        return {
            "update_available": False,
            "error": "Could not reach GitHub to check updates (offline or connection issue).",
            "current_version": local_info.get("version", "1.1.0"),
            "current_commit": local_sha[:7] if local_sha != "unknown" else "v1.1.0"
        }
        
    remote_sha = remote_info.get("sha", "")
    is_update_available = bool(
        remote_sha and local_sha and local_sha != "unknown" and not is_same_commit(local_sha, remote_sha)
    )
    
    return {
        "update_available": is_update_available,
        "current_version": local_info.get("version", "1.1.0"),
        "current_commit": local_sha[:7] if local_sha != "unknown" else "v1.1.0",
        "latest_commit": remote_sha[:7] if remote_sha else "",
        "commit_message": remote_info.get("message", ""),
        "author": remote_info.get("author", ""),
        "date": remote_info.get("date", ""),
        "repo_url": f"https://github.com/{GITHUB_REPO}"
    }

def apply_system_update():
    app_root = os.path.dirname(os.path.abspath(__file__))
    has_git = os.path.isdir(os.path.join(app_root, '.git'))
    
    if has_git:
        try:
            subprocess.check_call(['git', 'pull', 'origin', 'main'], cwd=app_root, timeout=60)
            new_sha = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=app_root).decode('utf-8').strip()
            
            version_file = os.path.join(app_root, 'version.json')
            with open(version_file, 'w', encoding='utf-8') as f:
                json.dump({
                    "version": "1.0.0",
                    "commit": new_sha,
                    "updated_at": time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
                }, f, indent=2)
                
            return {"status": "success", "mode": "git", "new_version": new_sha[:7]}
        except Exception:
            pass  # Fall through to zipball extraction if git fails
            
    req = urllib.request.Request(GITHUB_ZIPBALL_URL, headers={"User-Agent": "GTM-Console-App"})
    with safe_urlopen(req, timeout=45) as response:
        zip_bytes = response.read()
        
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        names = zf.namelist()
        if not names:
            raise RuntimeError("Empty archive received from GitHub.")
        prefix = names[0].split('/')[0] + '/'
        
        preserve_paths = {'.env', '.prototype-data', '.venv', 'node_modules', 'gtm.sqlite3', 'version.json'}
        
        for member in zf.infolist():
            if not member.filename.startswith(prefix):
                continue
            rel_path = member.filename[len(prefix):]
            if not rel_path or rel_path.endswith('/'):
                continue
                
            first_segment = rel_path.split('/')[0]
            if first_segment in preserve_paths or rel_path.endswith('.xlsx') or rel_path.endswith('.sqlite3'):
                continue
                
            target_file = os.path.join(app_root, rel_path)
            os.makedirs(os.path.dirname(target_file), exist_ok=True)
            with zf.open(member) as src, open(target_file, 'wb') as dst:
                shutil.copyfileobj(src, dst)
                
    # Fetch latest full commit sha from GitHub to write into version.json
    remote_info = fetch_remote_commit_info()
    latest_sha = remote_info.get("sha", "") if remote_info else ""
    if not latest_sha:
        latest_sha = "latest"
    version_file = os.path.join(app_root, 'version.json')
    with open(version_file, 'w', encoding='utf-8') as f:
        json.dump({
            "version": "1.1.0",
            "commit": latest_sha,
            "updated_at": time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
        }, f, indent=2)
        
    return {"status": "success", "mode": "zipball", "new_version": latest_sha[:7]}

def restart_local_server():
    """Re-exec the local API server so updated Python routes take effect."""
    if os.environ.get('VERCEL'):
        return
    app_root = os.path.dirname(os.path.abspath(__file__))
    os.chdir(app_root)
    os.execv(sys.executable, [sys.executable, os.path.abspath(__file__)])

class ProxyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Same-origin is the normal path; restrict cross-origin calls to local development.
        origin = self.headers.get('Origin')
        if origin in ('http://localhost:8001', 'http://127.0.0.1:8001'):
            self.send_header('Access-Control-Allow-Origin', origin)
            self.send_header('Access-Control-Allow-Credentials', 'true')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def _session_id(self):
        cookie = self.headers.get('Cookie', '')
        for part in cookie.split(';'):
            key, _, value = part.strip().partition('=')
            if key == 'gtm_session':
                return value
        return None

    def _google_session(self):
        session_id = self._session_id()
        if not session_id:
            return None
        session = google_sessions.get(session_id) or restore_google_session(session_id)
        if not session:
            return None
        try:
            return refresh_google_session(session)
        except Exception:
            return None

    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)
        clean_path = parsed_url.path

        if clean_path == '/app-config.js':
            publishable_key = str(os.environ.get('CLERK_PUBLISHABLE_KEY') or '').strip()
            body = ('window.__APP_CONFIG__ = ' + json.dumps({'clerkPublishableKey': publishable_key}) + ';').encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/javascript; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        if str(os.environ.get('HOSTED_API_ONLY') or '').lower() == 'true' and not clean_path.startswith('/api/'):
            json_response(self, 404, {'error': 'Not found.'})
            return

        if clean_path == '/api/health':
            json_response(self, 200, {'ok': True, 'service': 'trusted-influence-api'})
            return

        if not hosted_api_request_allowed(self, 'GET', clean_path):
            return

        if clean_path == '/api/auth/session':
            try:
                claims = verify_clerk_token(bearer_token(self.headers))
                json_response(self, 200, {
                    'authenticated': True,
                    'user': {
                        'uid': claims.get('sub'),
                        'email': claims.get('email'),
                        'emailVerified': bool(claims.get('email_verified')),
                        'displayName': claims.get('name') or ''
                    }
                })
            except FirebaseBackendUnavailable as ex:
                json_response(self, 503, {'error': str(ex)})
            except FirebaseTokenInvalid as ex:
                json_response(self, 401, {'error': str(ex)})
            return

        if clean_path == '/api/partner-portal/session':
            try:
                claims = verify_clerk_token(bearer_token(self.headers))
                user = clerk_user_for_claims(claims)
                state = read_workbook_state()
                influencer = next((c for c in state.get('contacts', []) if c.get('isInfluencer') and (str(c.get('clerkUserId') or '') == str(user['id']) or str(c.get('email') or '').strip().lower() == user['email'].lower())), None)
                if not influencer:
                    json_response(self, 200, {'profileComplete': False, 'user': user})
                    return
                if influencer.get('clerkUserId') and str(influencer.get('clerkUserId')) != str(user['id']):
                    json_response(self, 409, {'error': 'This partner profile is linked to a different Clerk account.'})
                    return
                influencer['clerkUserId'] = user['id']
                write_workbook_state(state)
                json_response(self, 200, {'profileComplete': True, 'token': issue_partner_share_token(influencer['id'], revoke_existing=False)})
            except FirebaseBackendUnavailable as ex:
                json_response(self, 503, {'error': str(ex)})
            except FirebaseTokenInvalid as ex:
                json_response(self, 401, {'error': str(ex)})
            except Exception as ex:
                json_response(self, 500, {'error': f'Could not load partner profile: {ex}'})
            return

        if clean_path == '/api/partner-portal/sync-partner':
            share = partner_share_from_token(bearer_token(self.headers))
            if not share or share.get('revoked_at'):
                json_response(self, 401, {'error': 'Sign in to your Influencer Portal first.'})
                return
            query = urllib.parse.parse_qs(parsed_url.query)
            email = str((query.get('email') or [''])[0]).strip().lower()
            uid = str((query.get('uid') or [''])[0]).strip()
            state = read_workbook_state()
            contacts = state.get('contacts', [])
            influencer = next((
                c for c in contacts
                if c.get('isInfluencer') and str(c.get('id')) == str(share['influencer_id'])
            ), None)
            if not influencer:
                json_response(self, 404, {'error': 'Partner profile not found.'})
                return
            referrals = [
                c for c in contacts
                if not c.get('isInfluencer') and (
                    str(c.get('influencerId')) == str(influencer['id'])
                    or (c.get('referredByEmail') and str(c.get('referredByEmail')).lower() == influencer.get('email', '').lower())
                )
            ]
            json_response(self, 200, {'influencer': public_partner_profile(influencer), 'referrals': referrals})
            return

        if clean_path == '/portal':
            query = urllib.parse.parse_qs(parsed_url.query)
            email = (query.get('email') or [''])[0]
            destination = '/?tab=influencers'
            if email:
                destination += '&email=' + urllib.parse.quote(email)
            self.send_response(302)
            self.send_header('Location', destination)
            self.end_headers()
            return

        if clean_path in ('/admin', '/admin/'):
            host = self.headers.get('Host', '')
            query_str = f"?{parsed_url.query}" if parsed_url.query else ""
            if 'connectem.ai' in host and not host.startswith('admin.'):
                self.send_response(302)
                self.send_header('Location', f"https://admin.connectem.ai/{query_str}")
                self.end_headers()
                return
            self.send_response(302)
            self.send_header('Location', f"/index.html{query_str}")
            self.end_headers()
            return

        if clean_path in ('/go', '/go/'):
            host = self.headers.get('Host', '')
            query_str = f"?{parsed_url.query}" if parsed_url.query else ""
            if 'connectem.ai' in host:
                self.send_response(302)
                self.send_header('Location', f"https://go.connectem.ai/partner-portal{query_str}")
                self.end_headers()
                return
            self.send_response(302)
            self.send_header('Location', f"/partner-portal.html{query_str}")
            self.end_headers()
            return

        if clean_path == '/marketplace':
            self.send_response(302)
            self.send_header('Location', '/marketplace.html')
            self.end_headers()
            return

        if clean_path == '/api/db/state':
            if not is_irm_admin_request(self):
                json_response(self, 403, {'error': 'Database state is available only from the local console.'})
                return
            try:
                state = read_workbook_state()
                json_response(self, 200, {'state': state, 'database': 'sqlite3', 'path': DB_PATH})
            except Exception as ex:
                json_response(self, 500, {'error': f'Database read failed: {ex}'})
            return

        if clean_path == '/api/workbook/state':
            if str(os.environ.get('HOSTED_API_ONLY') or '').lower() == 'true' and not firestore_enabled():
                json_response(self, 503, {'error': 'Cloud persistence is disabled. Set FIREBASE_USE_FIRESTORE=true and configure the Vercel workload identity connection.'})
                return
            if not is_irm_admin_request(self):
                status = 503 if str(os.environ.get('CLERK_BACKEND_AUTH_REQUIRED') or '').lower() == 'true' and not os.environ.get('CLERK_ISSUER') else 403
                json_response(self, status, {'error': 'Valid IRM administrator authentication is required.'})
                return
            try:
                json_response(self, 200, {'state': read_workbook_state(), 'database': 'firestore' if firestore_enabled() else 'sqlite3', 'path': 'bdrcreek / (default)' if firestore_enabled() else DB_PATH})
            except FirebaseBackendUnavailable as ex:
                json_response(self, 503, {'error': str(ex)})
            except Exception as ex:
                json_response(self, 500, {'error': f'Could not read the database: {ex}'})
            return

        if clean_path == '/api/state' and os.environ.get('VERCEL'):
            json_response(self, 503, {'error': 'Durable state storage is unavailable in the current serverless deployment.'})
            return

        if clean_path == '/api/workbook/state' and os.environ.get('VERCEL'):
            json_response(self, 503, {'error': 'Durable database storage is unavailable in the current serverless deployment.'})
            return

        if clean_path == '/api/db/search':
            if not is_irm_admin_request(self):
                json_response(self, 403, {'error': 'Database search is available only from the local console.'})
                return
            query_params = urllib.parse.parse_qs(parsed_url.query)
            q_str = query_params.get('q', [''])[0]
            try:
                result = search_database_nl(q_str)
                json_response(self, 200, result)
            except Exception as ex:
                json_response(self, 500, {'error': f'Search failed: {ex}'})
            return

        if clean_path == '/api/partner-share':
            token = str(self.headers.get('Authorization') or '').removeprefix('Bearer ').strip()
            share = partner_share_from_token(token)
            if not share or share['revoked_at']:
                json_response(self, 401, {'error': 'This partner link is invalid or has been revoked.'})
                return
            try:
                state = read_workbook_state()
                influencer = next((c for c in state.get('contacts', []) if c.get('isInfluencer') and str(c.get('id')) == str(share['influencer_id'])), None)
                if not influencer:
                    json_response(self, 404, {'error': 'Partner profile not found.'})
                    return
                contacts = partner_contacts_for_influencer(state, influencer)
                safe_contacts = [partner_safe_contact(c) for c in contacts]
                total_credits = sum(c.get('credits', 10) for c in safe_contacts)
                calendly_url = str(state.get('calendlyUrl') or os.environ.get('GTM_CALENDLY_URL') or 'https://calendly.com/gtm-console/executive-briefing').strip()
                agreements = [
                    {k: v for k, v in a.items() if k != 'dataUrl'}
                    for a in (influencer.get('agreements') or [])
                    if isinstance(a, dict)
                ]
                inf_id_str = str(influencer.get('id') or '')
                inf_email_lower = str(influencer.get('email') or '').lower()
                demo_contact_ids = {str(c.get('id')) for c in (state.get('contacts') or []) if c.get('isDemoData')}
                mp_requests = [
                    req for req in (state.get('marketplaceRequests') or [])
                    if isinstance(req, dict) and (
                        str(req.get('influencerId') or '') == inf_id_str
                        or (inf_email_lower and str(req.get('influencerEmail') or '').lower() == inf_email_lower)
                    ) and str(req.get('targetContactId') or '') not in demo_contact_ids
                ]
                json_response(self, 200, {
                    'influencer': {
                        **{key: influencer.get(key) for key in ('id', 'fullName', 'company', 'jobTitle', 'email', 'linkedinUrl', 'location')},
                        'referralCredits': total_credits,
                        'totalReferrals': len(safe_contacts),
                        'callsScheduled': sum(1 for c in safe_contacts if c.get('status') in ('scheduled', 'completed')),
                        'callsCompleted': sum(1 for c in safe_contacts if c.get('status') == 'completed'),
                        'hasSignedAgreement': any(str(a.get('status') or '').lower() == 'signed' for a in agreements),
                        'agreements': agreements
                    },
                    'calendlyUrl': calendly_url,
                    'contacts': safe_contacts,
                    'marketplaceRequests': mp_requests,
                    'requests': mp_requests,
                    'trustScore': influencer.get('trustScore') or 96,
                    'pipelineInfluenced': 185000,
                    'closedRevenue': 45000,
                    'rewardLedger': [e for e in ensure_reward_ledger(state) if isinstance(e, dict) and str(e.get('influencerId')) == inf_id_str],
                    'rewardPoints': reward_points_for_influencer(state, inf_id_str),
                    'rewardRedemptions': [r for r in (state.get('rewardRedemptions') or []) if isinstance(r, dict) and str(r.get('influencerId')) == inf_id_str]
                })
            except Exception as ex:
                json_response(self, 500, {'error': f'Could not load partner workspace: {ex}'})
            return

        if clean_path == '/api/marketplace/vendor/me':
            token = str(self.headers.get('Authorization') or '').removeprefix('Bearer ').strip()
            try:
                state = read_workbook_state()
                vendor = vendor_from_token(state, token)
                if not vendor:
                    json_response(self, 401, {'error': 'Sign in to your Vendor Marketplace account first.'})
                    return
                if vendor.get('vendorStatus') == 'revoked':
                    json_response(self, 403, {'error': 'Vendor Marketplace access has been revoked.'})
                    return
                contacts = state.get('contacts') or []
                demo_contact_ids = {str(c.get('id')) for c in contacts if c.get('isDemoData')}
                influencers = [c for c in contacts if c.get('isInfluencer') and not c.get('archivedAt') and not c.get('isDemoData')]
                prospects = [c for c in contacts if not c.get('isInfluencer') and not c.get('archivedAt') and not c.get('isDemoData')]
                orgs = {str(c.get('company') or '').strip() for c in prospects if c.get('company')}
                vendor_requests = [
                    req for req in (state.get('marketplaceRequests') or [])
                    if isinstance(req, dict) and str(req.get('vendorId')) == str(vendor.get('id'))
                    and str(req.get('targetContactId') or '') not in demo_contact_ids
                ]
                json_response(self, 200, {
                    'vendor': vendor_safe_dict(vendor),
                    'requests': vendor_requests,
                    'networkSummary': {
                        'totalInfluencers': len(influencers),
                        'totalNetworkContacts': len(prospects),
                        'totalOrganizations': len(orgs)
                    }
                })
            except Exception as ex:
                json_response(self, 500, {'error': f'Could not load vendor profile: {ex}'})
            return

        if clean_path == '/api/marketplace/network':
            token = str(self.headers.get('Authorization') or '').removeprefix('Bearer ').strip()
            try:
                state = read_workbook_state()
                vendor = vendor_from_token(state, token)
                if not vendor:
                    json_response(self, 401, {'error': 'Sign in to your Vendor Marketplace account first.'})
                    return
                if vendor.get('vendorStatus') != 'approved':
                    json_response(self, 403, {'error': 'IRM approval is required before Marketplace network access.', 'code': 'VENDOR_REVIEW_REQUIRED'})
                    return
                if vendor.get('agreementStatus') != 'signed' or vendor.get('networkAccessLevel') == 'locked':
                    json_response(self, 403, {
                        'error': 'Signed IRM Marketplace Agreement is required before accessing the Influencer Network.',
                        'code': 'AGREEMENT_REQUIRED',
                        'vendor': vendor_safe_dict(vendor)
                    })
                    return
                if vendor.get('vendorStatus') == 'revoked':
                    json_response(self, 403, {'error': 'Vendor Marketplace access has been revoked.'})
                    return
                contacts = state.get('contacts') or []
                influencers = [c for c in contacts if c.get('isInfluencer') and not c.get('archivedAt') and not c.get('isDemoData')]
                inf_by_id = {str(i.get('id')): i for i in influencers}
                inf_by_email = {str(i.get('email') or '').lower(): i for i in influencers if i.get('email')}
                inf_by_name = {str(i.get('fullName') or '').lower(): i for i in influencers if i.get('fullName')}

                vendor_requests = [
                    req for req in (state.get('marketplaceRequests') or [])
                    if isinstance(req, dict) and str(req.get('vendorId')) == str(vendor.get('id'))
                    and str(req.get('targetContactId') or '') not in {str(c.get('id')) for c in contacts if c.get('isDemoData')}
                ]
                unlocked_contact_ids = {
                    str(req.get('targetContactId'))
                    for req in vendor_requests
                    if req.get('status') in ('influencer_accepted', 'call_scheduled', 'call_completed') and req.get('targetContactId') is not None
                }

                network_contacts = []
                orgs_map = {}
                for c in contacts:
                    if c.get('isInfluencer') or c.get('archivedAt') or c.get('isDemoData'):
                        continue
                    inf = (
                        inf_by_id.get(str(c.get('influencerId') or ''))
                        or inf_by_email.get(str(c.get('influencerEmail') or '').lower())
                        or inf_by_name.get(str(c.get('referredBy') or '').lower())
                    )
                    if not inf or not any(str(a.get('status') or '').lower() == 'signed' for a in (inf.get('agreements') or []) if isinstance(a, dict)):
                        continue
                    masked = mask_contact_for_marketplace(c, inf, unlocked_contact_ids)
                    network_contacts.append(masked)
                    comp = masked['company']
                    if comp not in orgs_map:
                        orgs_map[comp] = {
                            'company': comp,
                            'industry': masked['industry'],
                            'assetSize': masked['assetSize'],
                            'contactsCount': 0,
                            'influencers': set()
                        }
                    orgs_map[comp]['contactsCount'] += 1
                    if masked['influencerName']:
                        orgs_map[comp]['influencers'].add(masked['influencerName'])

                influencer_summaries = []
                for inf in influencers:
                    refs = partner_contacts_for_influencer(state, inf)
                    influencer_summaries.append({
                        'id': inf.get('id'),
                        'fullName': inf.get('fullName') or 'Advisor',
                        'company': inf.get('company') or 'Advisory Partner',
                        'jobTitle': inf.get('jobTitle') or 'Industry Partner',
                        'location': inf.get('location') or inf.get('state') or '',
                        'reachCount': len(refs),
                        'organizations': sorted({str(r.get('company') or '').strip() for r in refs if r.get('company')})[:8],
                        'hasSignedAgreement': any(str(a.get('status') or '').lower() == 'signed' for a in (inf.get('agreements') or []) if isinstance(a, dict))
                    })

                organizations = [
                    {
                        **org_info,
                        'influencers': sorted(org_info['influencers'])
                    }
                    for org_info in orgs_map.values()
                ]

                json_response(self, 200, {
                    'vendor': vendor_safe_dict(vendor),
                    'influencers': influencer_summaries,
                    'contacts': network_contacts,
                    'organizations': organizations,
                    'requests': vendor_requests
                })
            except Exception as ex:
                json_response(self, 500, {'error': f'Could not load marketplace network: {ex}'})
            return

        if clean_path == '/api/connectem/opt-in':
            query_params = urllib.parse.parse_qs(parsed_url.query)
            token = (query_params.get('token') or [''])[0].strip()
            if not token:
                json_response(self, 400, {'error': 'Opt-in token required.'})
                return
            state = read_workbook_state()
            reqs = state.get('marketplaceRequests') or []
            req = next((r for r in reqs if isinstance(r, dict) and (str(r.get('optInToken') or '') == token or str(r.get('id') or '') == token)), None)
            if not req:
                json_response(self, 404, {'error': 'Invalid or expired opt-in request.'})
                return
            contacts = state.get('contacts') or []
            vendors = state.get('vendors') or []
            target = next((c for c in contacts if str(c.get('id')) == str(req.get('targetContactId'))), None)
            partner = next((c for c in contacts if str(c.get('id')) == str(req.get('influencerId')) or str(c.get('id')) == str(req.get('partnerId'))), None)
            vendor = next((v for v in vendors if str(v.get('id')) == str(req.get('vendorId'))), None)

            json_response(self, 200, {
                'valid': True,
                'requestId': req.get('id'),
                'partnerName': (partner.get('fullName') if partner else None) or req.get('influencerName') or 'A mutual colleague',
                'partnerTitle': (partner.get('jobTitle') if partner else None) or 'Advisory Partner',
                'partnerCompany': (partner.get('company') if partner else None) or 'Advisory Network',
                'contactName': (target.get('fullName') if target else None) or req.get('targetContactName') or 'Executive',
                'contactCompany': (target.get('company') if target else None) or req.get('targetCompany') or 'Your Organization',
                'contactTitle': (target.get('jobTitle') if target else None) or req.get('targetJobTitle') or 'Executive',
                'vendorCompany': (vendor.get('companyName') if vendor else None) or req.get('vendorCompany') or 'Technology Partner',
                'vendorCategory': (vendor.get('category') or vendor.get('industry') if vendor else None) or 'Enterprise Technology',
                'valueProposition': (vendor.get('valueProposition') or vendor.get('icpDescription') if vendor else None) or req.get('whyTheyShouldCare') or req.get('vendorPitch') or '',
                'forwardableBrief': req.get('forwardableBrief') or req.get('vendorPitch') or '',
                'specificAsk': req.get('specificAsk') or 'A brief 20-minute executive briefing',
                'status': req.get('status'),
                'scheduledMeetingUrl': req.get('scheduledMeetingUrl') or (vendor.get('calendlyUrl') if vendor else '')
            })
            return

        if clean_path == '/api/connectem/meeting-brief':
            query_params = urllib.parse.parse_qs(parsed_url.query)
            req_id = (query_params.get('requestId') or [''])[0].strip()
            if not req_id:
                json_response(self, 400, {'error': 'requestId is required.'})
                return
            state = read_workbook_state()
            reqs = state.get('marketplaceRequests') or []
            req = next((r for r in reqs if isinstance(r, dict) and str(r.get('id')) == req_id), None)
            if not req:
                json_response(self, 404, {'error': 'Request not found.'})
                return
            contacts = state.get('contacts') or []
            vendors = state.get('vendors') or []
            target = next((c for c in contacts if str(c.get('id')) == str(req.get('targetContactId'))), None)
            partner = next((c for c in contacts if str(c.get('id')) == str(req.get('influencerId')) or str(c.get('id')) == str(req.get('partnerId'))), None)
            vendor = next((v for v in vendors if str(v.get('id')) == str(req.get('vendorId'))), None)

            json_response(self, 200, {
                'requestId': req.get('id'),
                'status': req.get('status'),
                'target': {
                    'name': (target.get('fullName') if target else None) or req.get('targetContactName') or 'Executive',
                    'title': (target.get('jobTitle') if target else None) or req.get('targetJobTitle') or 'Executive',
                    'company': (target.get('company') if target else None) or req.get('targetCompany') or 'Target Account',
                    'assetSize': (target.get('assetSize') if target else '') or '$1B - $5B',
                    'industry': (target.get('industry') if target else '') or 'Credit Union / Banking',
                    'location': (target.get('location') or target.get('state') if target else '') or 'United States'
                },
                'facilitator': {
                    'name': (partner.get('fullName') if partner else None) or req.get('influencerName') or 'ConnectEM Partner',
                    'title': (partner.get('jobTitle') if partner else None) or 'Advisory Partner',
                    'company': (partner.get('company') if partner else None) or 'Advisory Network',
                    'relationshipStrength': (target.get('strength') if target else 'strong'),
                    'relationshipType': (target.get('relationshipType') if target else 'peer'),
                    'trustScore': (partner.get('trustScore') if partner else 95)
                },
                'context': {
                    'whyContact': req.get('whyThisContact') or 'Key technology and operational decision maker',
                    'whyCare': req.get('whyTheyShouldCare') or req.get('vendorPitch'),
                    'specificAsk': req.get('specificAsk') or '20-minute executive briefing',
                    'optInNotes': req.get('contactOptInNotes') or 'Double opt-in confirmed by contact directly.'
                },
                'rulesOfEngagement': [
                    "Do NOT lead with a 30-slide pitch deck; focus on a collaborative diagnostic.",
                    "Spend the first 10 minutes listening to their current roadmap, legacy dependencies, and pain points.",
                    "Reference the introducing partner's context naturally; do not assume prior commitments.",
                    "Strictly adhere to the agreed 20-minute boundary unless the executive explicitly asks to continue."
                ],
                'schedulingUrl': req.get('scheduledMeetingUrl') or (vendor.get('calendlyUrl') if vendor else '')
            })
            return

        if clean_path == '/api/connectem/partner/profile':
            token = str(self.headers.get('Authorization') or '').removeprefix('Bearer ').strip()
            share = partner_share_from_token(token)
            state = read_workbook_state()
            partner = None
            if share:
                partner = next((c for c in state.get('contacts') or [] if str(c.get('id')) == str(share.get('influencer_id'))), None)
            if not partner:
                json_response(self, 401, {'error': 'Partner session expired or invalid.'})
                return
            json_response(self, 200, {
                'id': partner.get('id'),
                'fullName': partner.get('fullName'),
                'email': partner.get('email'),
                'company': partner.get('company'),
                'jobTitle': partner.get('jobTitle'),
                'location': partner.get('location') or partner.get('state') or '',
                'expertise': partner.get('expertise') or ['Credit Union Systems', 'AI & Data Governance', 'NCUA Compliance'],
                'geography': partner.get('geography') or ['North America', 'United States'],
                'industries': partner.get('industries') or ['Credit Unions', 'Community Banking', 'FinTech'],
                'openTo': partner.get('openTo') or ['warm_intros', 'advisory_calls', 'consulting', 'board_roles', 'vendor_feedback'],
                'trustScore': partner.get('trustScore') or 94,
                'agreements': partner.get('agreements') or [{'id': 'agr-1', 'title': 'ConnectEM Master Partner Agreement', 'status': 'signed'}]
            })
            return

        if clean_path == '/api/connectem/partner/attribution':
            token = str(self.headers.get('Authorization') or '').removeprefix('Bearer ').strip()
            share = partner_share_from_token(token)
            state = read_workbook_state()
            partner = None
            if share:
                partner = next((c for c in state.get('contacts') or [] if str(c.get('id')) == str(share.get('influencer_id'))), None)
            if not partner:
                json_response(self, 401, {'error': 'Partner session invalid.'})
                return
            pid = str(partner.get('id'))
            p_email = str(partner.get('email') or '').lower()
            reqs = [
                r for r in (state.get('marketplaceRequests') or [])
                if isinstance(r, dict) and (str(r.get('influencerId') or '') == pid or str(r.get('influencerEmail') or '').lower() == p_email)
            ]
            intros_requested = len(reqs)
            intros_accepted = sum(1 for r in reqs if r.get('status') in ('influencer_accepted', 'contact_opt_in_requested', 'contact_accepted', 'introduction_made', 'call_scheduled', 'call_completed', 'meeting_completed', 'opportunity_created', 'won'))
            opt_ins = sum(1 for r in reqs if r.get('status') in ('contact_accepted', 'introduction_made', 'call_scheduled', 'call_completed', 'meeting_completed', 'opportunity_created', 'won'))
            meetings_held = sum(1 for r in reqs if r.get('status') in ('call_completed', 'meeting_completed', 'opportunity_created', 'won') or r.get('vendorMeetingHeld'))
            opportunities_created = sum(1 for r in reqs if r.get('status') in ('opportunity_created', 'won') or r.get('outcome') in ('opportunity', 'poc', 'customer'))
            pipeline_influenced = sum(float(r.get('opportunityValue') or 0) for r in reqs if r.get('outcome') in ('opportunity', 'poc', 'customer', 'technical_eval'))
            closed_revenue = sum(float(r.get('opportunityValue') or 0) for r in reqs if r.get('outcome') == 'customer' or r.get('status') == 'won')

            base_score = 85
            if intros_requested > 0:
                acc_rate = intros_accepted / intros_requested
                base_score += round(acc_rate * 8)
            if opt_ins > 0:
                base_score += min(5, opt_ins * 2)
            trust_score = min(99, max(50, partner.get('trustScore') or base_score))

            json_response(self, 200, {
                'trustScore': trust_score,
                'introsRequested': intros_requested,
                'introsAccepted': intros_accepted,
                'contactOptIns': opt_ins,
                'meetingsHeld': meetings_held,
                'opportunitiesCreated': opportunities_created,
                'pipelineInfluenced': pipeline_influenced or (185000 if meetings_held > 0 else 0),
                'closedRevenue': closed_revenue,
                'compensationModel': {
                    'type': 'enterprise_referral_and_advisory',
                    'referralFeeRate': '15% of Year 1 ACV',
                    'qualifiedMeetingFee': '$750 per completed briefing',
                    'advisoryRetainer': 'Available on request'
                }
            })
            return

        if clean_path == '/api/irm/marketplace':
            if not is_irm_admin_request(self):
                json_response(self, 403, {'error': 'IRM Marketplace admin overview is restricted to the local console.'})
                return
            try:
                state = read_workbook_state()
                vendors = [vendor_safe_dict(v) for v in (state.get('vendors') or []) if isinstance(v, dict)]
                requests_list = [r for r in (state.get('marketplaceRequests') or []) if isinstance(r, dict)]
                contacts = state.get('contacts') or []
                influencers = [c for c in contacts if c.get('isInfluencer') and not c.get('archivedAt') and not c.get('isDemoData')]
                prospects = [c for c in contacts if not c.get('isInfluencer') and not c.get('archivedAt') and not c.get('isDemoData')]
                json_response(self, 200, {
                    'vendors': vendors,
                    'marketplaceRequests': requests_list,
                    'influencers': [
                        {'id': c.get('id'), 'fullName': c.get('fullName'), 'email': c.get('email'),
                         'company': c.get('company'), 'influencerStatus': c.get('influencerStatus', 'approved')}
                        for c in influencers
                    ],
                    'summary': {
                        'totalVendors': len(vendors),
                        'signedVendors': sum(1 for v in vendors if v.get('agreementStatus') == 'signed'),
                        'totalInfluencers': len(influencers),
                        'totalNetworkContacts': len(prospects),
                        'totalRequests': len(requests_list),
                        'scheduledIntros': sum(1 for r in requests_list if r.get('status') in ('influencer_accepted', 'call_scheduled', 'call_completed'))
                    }
                })
            except Exception as ex:
                json_response(self, 500, {'error': f'Could not load IRM marketplace overview: {ex}'})
            return

        if clean_path == '/api/portal/influencers':
            if not is_irm_admin_request(self):
                json_response(self, 403, {'error': 'Use a scoped partner link to view shared partner data.'})
                return
            try:
                state = read_workbook_state()
                contacts = state.get('contacts') or []
                influencers = []
                for c in contacts:
                    if c.get('isInfluencer') is True:
                        inf_copy = dict(c)
                        refs = partner_contacts_for_influencer(state, c)
                        inf_copy['totalReferrals'] = len(refs)
                        inf_copy['callsTakenCount'] = sum(1 for r in refs if r.get('hasTakenCall') or r.get('hasScheduledCall'))
                        inf_copy['referralCredits'] = sum(compute_contact_referral_credits(r) for r in refs)
                        influencers.append(inf_copy)
                json_response(self, 200, {'influencers': influencers, 'total': len(influencers)})
            except Exception as ex:
                json_response(self, 500, {'error': str(ex)})
            return

        if clean_path == '/api/portal/referrals':
            if not is_irm_admin_request(self):
                json_response(self, 403, {'error': 'Use a scoped partner link to view shared referrals.'})
                return
            try:
                query_params = urllib.parse.parse_qs(parsed_url.query)
                email_q = (query_params.get('email', [''])[0] or '').strip().lower()
                state = read_workbook_state()
                contacts = state.get('contacts') or []
                influencers = [c for c in contacts if c.get('isInfluencer') is True]
                chosen = next((i for i in influencers if str(i.get('email') or '').lower() == email_q), influencers[0] if influencers else None)
                referrals = partner_contacts_for_influencer(state, chosen) if chosen else []
                json_response(self, 200, {'influencer': chosen, 'referrals': referrals, 'total': len(referrals)})
            except Exception as ex:
                json_response(self, 500, {'error': str(ex)})
            return

        if self.path == '/api/google/oauth/start':
            client_id = os.environ.get('GOOGLE_CLIENT_ID')
            redirect_uri = os.environ.get('GOOGLE_REDIRECT_URI', 'http://localhost:8001/api/google/oauth/callback')
            if not client_id:
                json_response(self, 503, {'error': 'GOOGLE_CLIENT_ID is not configured on the server.'})
                return
            state = secrets.token_urlsafe(32)
            google_oauth_states[state] = time.time()
            params = urllib.parse.urlencode({
                'client_id': client_id, 'redirect_uri': redirect_uri,
                'response_type': 'code', 'scope': ' '.join(GOOGLE_SCOPES),
                'access_type': 'offline', 'prompt': 'consent', 'state': state,
            })
            self.send_response(302)
            self.send_header('Location', f'{GOOGLE_AUTH_URL}?{params}')
            self.end_headers()
            return

        if self.path.startswith('/api/google/oauth/callback'):
            query = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            state = query.get('state', [''])[0]
            code = query.get('code', [''])[0]
            if not state or state not in google_oauth_states or time.time() - google_oauth_states.pop(state) > 600:
                json_response(self, 400, {'error': 'Invalid or expired Google OAuth state.'})
                return
            if not code:
                json_response(self, 400, {'error': query.get('error', ['Google authorization was cancelled.'])[0]})
                return
            try:
                token_status, tokens = post_form(
                    GOOGLE_TOKEN_URL,
                    {'code': code, 'client_id': os.environ.get('GOOGLE_CLIENT_ID'),
                     'client_secret': os.environ.get('GOOGLE_CLIENT_SECRET'),
                     'redirect_uri': os.environ.get('GOOGLE_REDIRECT_URI', 'http://localhost:8001/api/google/oauth/callback'),
                     'grant_type': 'authorization_code'},
                )
                access_token = tokens['access_token']
                profile_status, profile = google_api('GET', 'https://openidconnect.googleapis.com/v1/userinfo', access_token)
                session_id = secrets.token_urlsafe(32)
                google_sessions[session_id] = {
                    'session_id': session_id,
                    'access_token': access_token, 'refresh_token': tokens.get('refresh_token'),
                    'expires_at': time.time() + tokens.get('expires_in', 3600),
                    'email': profile.get('email'), 'name': profile.get('name'),
                }
                persist_google_connection(google_sessions[session_id])
                self.send_response(302)
                self.send_header('Set-Cookie', f'gtm_session={session_id}; HttpOnly; SameSite=Lax; Path=/')
                self.send_header('Location', '/?google=connected')
                self.end_headers()
            except Exception as ex:
                json_response(self, 502, {'error': f'Google OAuth exchange failed: {ex}'})
            return

        if self.path == '/api/google/status':
            session = self._google_session()
            json_response(self, 200, {'connected': bool(session), 'email': session.get('email') if session else None})
            return

        if self.path == '/api/google/verify':
            session = self._google_session()
            if not session:
                json_response(self, 401, {'error': 'Connect a Google Workspace account first.'})
                return
            try:
                _, gmail_profile = google_api_get('https://gmail.googleapis.com/gmail/v1/users/me/profile', session['access_token'])
                _, calendar = google_api_get('https://www.googleapis.com/calendar/v3/calendars/primary', session['access_token'])
                json_response(self, 200, {'gmail': {'email': gmail_profile.get('emailAddress'), 'messagesTotal': gmail_profile.get('messagesTotal')}, 'calendar': {'id': calendar.get('id'), 'summary': calendar.get('summary')}, 'status': 'verified'})
            except urllib.error.HTTPError as ex:
                json_response(self, ex.code, {'error': ex.read().decode('utf-8', errors='replace')})
            return

        if self.path == '/api/google/disconnect':
            session_id = self._session_id()
            google_sessions.pop(session_id or '', None)
            with db() as connection:
                connection.execute('DELETE FROM google_connections WHERE session_id = ?', (session_id,))
            self.send_response(302)
            self.send_header('Set-Cookie', 'gtm_session=; Max-Age=0; Path=/')
            self.send_header('Location', '/')
            self.end_headers()
            return

        if self.path == '/api/state':
            if not is_irm_admin_request(self):
                status = 503 if str(os.environ.get('CLERK_BACKEND_AUTH_REQUIRED') or '').lower() == 'true' and not os.environ.get('CLERK_ISSUER') else 403
                json_response(self, status, {'error': 'Valid IRM administrator authentication is required.'})
                return
            json_response(self, 200, {'state': read_state('database') or {}})
            return

        if self.path == '/api/workbook/state':
            if not is_irm_admin_request(self):
                status = 503 if str(os.environ.get('CLERK_BACKEND_AUTH_REQUIRED') or '').lower() == 'true' and not os.environ.get('CLERK_ISSUER') else 403
                json_response(self, status, {'error': 'Valid IRM administrator authentication is required.'})
                return
            try:
                json_response(self, 200, {'state': read_workbook_state(), 'path': DB_PATH})
            except Exception as ex:
                json_response(self, 500, {'error': f'Could not read the database: {ex}'})
            return

        if self.path == '/api/system/update-check':
            json_response(self, 200, check_for_updates())
            return

        super().do_GET()

    def do_POST(self):
        try:
            content_length = int(self.headers.get('Content-Length', 0))
        except (TypeError, ValueError):
            json_response(self, 400, {'error': 'Invalid Content-Length.'})
            return
        if content_length < 0 or content_length > 10 * 1024 * 1024:
            json_response(self, 413, {'error': 'Request body exceeds the 10 MB limit.'})
            return
        post_data = self.rfile.read(content_length)
        try:
            payload = json.loads(post_data.decode('utf-8')) if post_data else {}
        except json.JSONDecodeError:
            json_response(self, 400, {'error': 'Request body must be valid JSON.'})
            return

        clean_path = urllib.parse.urlsplit(self.path).path
        if not hosted_api_request_allowed(self, 'POST', clean_path):
            return

        if self.path == '/api/system/update':
            if not is_irm_admin_request(self):
                json_response(self, 403, {'error': 'Updates are available to the local app owner only.'})
                return
            try:
                result = apply_system_update()
                json_response(self, 200, result)
                if result.get('status') == 'success' and not os.environ.get('VERCEL'):
                    # Let the success response finish before replacing the running process.
                    threading.Timer(2.5, restart_local_server).start()
            except Exception as ex:
                json_response(self, 500, {'error': f'System update failed: {ex}'})
            return

        if self.path == '/api/partner-shares/create':
            if not is_irm_admin_request(self) or not request_origin_is_trusted(self):
                json_response(self, 403, {'error': 'Only the local app owner can create partner links.'})
                return
            if os.environ.get('VERCEL'):
                json_response(self, 503, {'error': 'Partner sharing requires a persistent database. The current serverless deployment stores data on temporary disk.'})
                return
            try:
                state = read_workbook_state()
                influencer_id = str(payload.get('influencerId') or '')
                influencer = next((c for c in state.get('contacts', []) if c.get('isInfluencer') and str(c.get('id')) == influencer_id), None)
                if not influencer:
                    json_response(self, 404, {'error': 'Influencer profile not found.'})
                    return
                configured_base = os.environ.get('GTM_PUBLIC_BASE_URL', '').strip().rstrip('/')
                if configured_base and urllib.parse.urlparse(configured_base).scheme != 'https':
                    json_response(self, 400, {'error': 'GTM_PUBLIC_BASE_URL must use HTTPS before sharing contact details.'})
                    return
                token = secrets.token_urlsafe(32)
                token_hash = hashlib.sha256(token.encode('utf-8')).hexdigest()
                created_at = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
                store_partner_share_record(influencer['id'], token_hash, created_at)
                request_origin = self.headers.get('Origin') or f"http://{self.headers.get('Host', f'localhost:{PORT}')}"
                share_base = configured_base or request_origin
                portal_path = '/' if 'go.connectem.ai' in share_base else '/partner-portal.html'
                share_url = f"{share_base}{portal_path}#token={urllib.parse.quote(token)}"
                json_response(self, 201, {'status': 'created', 'token': token, 'influencer': influencer.get('fullName'), 'shareUrl': share_url, 'publicBaseConfigured': bool(configured_base)})
            except Exception as ex:
                json_response(self, 500, {'error': f'Could not create partner link: {ex}'})
            return

        if self.path == '/api/partner-shares/revoke':
            if os.environ.get('VERCEL') or not is_irm_admin_request(self) or not request_origin_is_trusted(self):
                json_response(self, 403, {'error': 'Only the local app owner can revoke partner links.'})
                return
            token = str(payload.get('token') or '').strip()
            share = partner_share_from_token(token)
            if not share:
                json_response(self, 404, {'error': 'Partner link not found.'})
                return
            revoke_partner_share_record(share['id'], time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()))
            json_response(self, 200, {'status': 'revoked'})
            return

        if self.path == '/api/partner-shares/revoke-influencer':
            if os.environ.get('VERCEL') or not is_irm_admin_request(self) or not request_origin_is_trusted(self):
                json_response(self, 403, {'error': 'Only the local app owner can revoke partner links.'})
                return
            try:
                influencer_id = int(payload.get('influencerId'))
                revoked = revoke_partner_share_records_for_influencer(influencer_id, time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()))
                json_response(self, 200, {'status': 'revoked', 'revoked': revoked})
            except (TypeError, ValueError):
                json_response(self, 400, {'error': 'A valid influencer ID is required.'})
            return

        if clean_path == '/api/partner-share/referrals':
            token = str(self.headers.get('Authorization') or '').removeprefix('Bearer ').strip()
            share = partner_share_from_token(token)
            if not share or share['revoked_at']:
                json_response(self, 401, {'error': 'This partner link is invalid or has been revoked.'})
                return
            try:
                if any(str(row.get('status') or '').lower() == 'completed' for row in (payload.get('referrals') or []) if isinstance(row, dict)) or str(payload.get('status') or '').lower() == 'completed':
                    json_response(self, 400, {'error': 'Meeting completion must be confirmed by the buyer and approved by IRM.'})
                    return
                state = read_workbook_state()
                influencer = next((c for c in state.get('contacts', []) if c.get('isInfluencer') and str(c.get('id')) == str(share['influencer_id'])), None)
                if not influencer:
                    json_response(self, 404, {'error': 'Partner profile not found.'})
                    return
                if isinstance(payload.get('contacts'), list):
                    rows = payload.get('contacts') or []
                    if len(rows) > 1000:
                        json_response(self, 400, {'error': 'Submit up to 1,000 contacts at a time.'})
                        return
                    # Call outcomes arrive from a partner self-report. They are useful
                    # as a scheduling signal, but must not be treated as verified completion.
                    for row in rows:
                        if isinstance(row, dict):
                            row['hasTakenCall'] = False
                            if str(row.get('status') or '').lower() == 'completed':
                                row['status'] = 'scheduled'
                    summary = apply_partner_bulk_records(state, influencer, rows, source='Partner Link', allow_internal_notes=False)
                    if summary['created'] or summary['updated'] or summary['linked']:
                        write_workbook_state(state)
                    json_response(self, 200, {'status': 'bulk_saved', **summary})
                    return
                payload['hasTakenCall'] = False
                contact = create_partner_referral(state, influencer, payload, source='Partner Link')
                write_workbook_state(state)
                json_response(self, 201, {'status': 'created', 'contact': partner_safe_contact(contact)})
            except FileExistsError as ex:
                json_response(self, 409, {'error': str(ex)})
            except ValueError as ex:
                json_response(self, 400, {'error': str(ex)})
            except Exception as ex:
                json_response(self, 500, {'error': f'Could not add referral: {ex}'})
            return

        if clean_path == '/api/partner-portal/onboard':
            try:
                auth_hdr = bearer_token(self.headers)
                user = None
                if auth_hdr:
                    try:
                        claims = verify_clerk_token(auth_hdr)
                        user = clerk_user_for_claims(claims)
                    except Exception:
                        user = None

                email = (user['email'] if user else str(payload.get('email') or '')).strip().lower()
                name = str(payload.get('fullName') or (user['fullName'] if user else '')).strip()
                company = str(payload.get('company') or '').strip()
                password = str(payload.get('password') or '').strip()
                job_title = str(payload.get('jobTitle') or 'Industry Advisor').strip()
                phone = str(payload.get('phone') or '').strip()
                linkedin_url = normalize_linkedin_url(payload.get('linkedinUrl') or '')
                location = str(payload.get('location') or '').strip()

                if not name or not company or not email:
                    json_response(self, 400, {'error': 'Full name, company, and email are required.'})
                    return
                if not user and not password:
                    json_response(self, 400, {'error': 'Please enter a password for your partner account.'})
                    return

                state = read_workbook_state()
                contacts = state.setdefault('contacts', [])
                influencer = next((c for c in contacts if c.get('isInfluencer') and str(c.get('email') or '').strip().lower() == email), None)
                if user and influencer and influencer.get('clerkUserId') and str(influencer.get('clerkUserId')) != user['id']:
                    json_response(self, 409, {'error': 'This partner profile is linked to a different Clerk account.'})
                    return
                if influencer:
                    influencer['fullName'] = name
                    influencer['company'] = company
                    influencer['jobTitle'] = job_title
                    if user:
                        influencer['clerkUserId'] = user['id']
                    if password:
                        set_partner_password(influencer, password)
                        influencer['passwordChanged'] = True
                        influencer['mustChangePassword'] = False
                    if phone:
                        influencer['phone'] = phone
                    if linkedin_url:
                        influencer['linkedinUrl'] = linkedin_url
                    if location:
                        influencer['location'] = location
                    influencer.setdefault('referrals', [])
                    influencer.setdefault('referralCredits', 0)
                    influencer.setdefault('agreements', [])
                else:
                    existing = next((c for c in contacts if str(c.get('email') or '').strip().lower() == email), None)
                    if existing and not existing.get('isInfluencer'):
                        existing.update({
                            'fullName': name, 'company': company, 'jobTitle': job_title,
                            'isInfluencer': True, 'influencerStatus': 'pending_review',
                            'sourceFile': existing.get('sourceFile') or 'Influencer Portal Onboarding'
                        })
                        if user:
                            existing['clerkUserId'] = user['id']
                        if password:
                            set_partner_password(existing, password)
                            existing['passwordChanged'] = True
                            existing['mustChangePassword'] = False
                        if phone:
                            existing['phone'] = phone
                        if linkedin_url:
                            existing['linkedinUrl'] = linkedin_url
                        influencer = existing
                    else:
                        parts = name.split()
                        valid_ids = []
                        for c in contacts:
                            try:
                                valid_ids.append(int(c.get('id')))
                            except (ValueError, TypeError):
                                pass
                        new_id = max(valid_ids + [1000]) + 1
                        influencer = {
                            'id': new_id, 'firstName': parts[0] if parts else name,
                            'lastName': ' '.join(parts[1:]), 'fullName': name, 'email': email,
                            'company': company, 'jobTitle': job_title, 'linkedinUrl': linkedin_url,
                            'phone': phone, 'location': location, 'isInfluencer': True,
                            'influencerStatus': 'pending_review',
                            'referralCredits': 0, 'referrals': [],
                            'agreements': [], 'sourceFile': 'Influencer Portal Onboarding'
                        }
                        if user:
                            influencer['clerkUserId'] = user['id']
                        if password:
                            set_partner_password(influencer, password)
                            influencer['passwordChanged'] = True
                            influencer['mustChangePassword'] = False
                        contacts.append(influencer)
                write_workbook_state(state)
                json_response(self, 201, {
                    'status': 'created',
                    'token': issue_partner_share_token(influencer['id'], revoke_existing=False),
                    'influencer': {key: influencer.get(key) for key in ('id', 'fullName', 'email', 'company', 'jobTitle')}
                })
            except FirebaseBackendUnavailable as ex:
                json_response(self, 503, {'error': str(ex)})
            except FirebaseTokenInvalid as ex:
                json_response(self, 401, {'error': str(ex)})
            except Exception as ex:
                json_response(self, 500, {'error': f'Partner onboarding failed: {ex}'})
            return

        if clean_path == '/api/partner-portal/signup':
            json_response(self, 410, {'error': 'Public signup is disabled. Partner accounts now use Clerk or direct administrator provisioning. Sign in through the Influencer Portal.'})
            return

        if clean_path == '/api/partner-portal/login':
            email = str(payload.get('email') or '').strip().lower()
            password = str(payload.get('password') or '').strip()
            if not email or not password:
                json_response(self, 400, {'error': 'Email and password are required.'})
                return
            state = read_workbook_state()
            contacts = state.get('contacts', [])
            influencer = next((
                c for c in contacts
                if c.get('isInfluencer') and str(c.get('email') or '').strip().lower() == email
            ), None)
            if not influencer:
                json_response(self, 401, {'error': 'No partner account found for this email address. Please contact your administrator.'})
                return

            if not partner_password_matches(influencer, password):
                json_response(self, 401, {'error': 'Incorrect password. Please verify your credentials or contact your administrator.'})
                return

            # Upgrade records written by older versions on successful authentication.
            if not influencer.get('passwordHash'):
                set_partner_password(influencer, password)
                write_workbook_state(state)
            must_change = bool(influencer.get('mustChangePassword') or not influencer.get('passwordChanged'))
            influencer['mustChangePassword'] = must_change

            referrals = [
                c for c in contacts
                if not c.get('isInfluencer') and (
                    str(c.get('influencerId')) == str(influencer['id'])
                    or (c.get('referredByEmail') and str(c.get('referredByEmail')).lower() == email)
                    or (c.get('referredBy') and str(c.get('referredBy')).lower() == str(influencer.get('fullName', '')).lower())
                )
            ]
            json_response(self, 200, {
                'status': 'success',
                'success': True,
                'mustChangePassword': must_change,
                'token': issue_partner_share_token(influencer['id'], revoke_existing=False),
                'partner': public_partner_profile(influencer),
                'influencer': public_partner_profile(influencer),
                'referrals': referrals
            })
            return

        if clean_path == '/api/partner-portal/change-password':
            share = partner_share_from_token(bearer_token(self.headers))
            if not share or share.get('revoked_at'):
                json_response(self, 401, {'error': 'Sign in to your Influencer Portal first.'})
                return
            email = str(payload.get('email') or '').strip().lower()
            current_pwd = str(payload.get('currentPassword') or '').strip()
            new_pwd = str(payload.get('newPassword') or '').strip()

            if not email or not current_pwd or not new_pwd:
                json_response(self, 400, {'error': 'Email, current password, and new password are required.'})
                return
            if len(new_pwd) < 12:
                json_response(self, 400, {'error': 'New password must be at least 12 characters long.'})
                return
            if new_pwd == 'welcomebdr123!':
                json_response(self, 400, {'error': 'Please choose a custom password different from the temporary default.'})
                return

            state = read_workbook_state()
            contacts = state.get('contacts', [])
            influencer = next((
                c for c in contacts
                if c.get('isInfluencer') and str(c.get('email') or '').strip().lower() == email
            ), None)
            if not influencer:
                json_response(self, 404, {'error': 'Partner account not found.'})
                return
            if str(influencer.get('id')) != str(share['influencer_id']):
                json_response(self, 403, {'error': 'This session is not authorized to change that partner password.'})
                return

            if not partner_password_matches(influencer, current_pwd):
                json_response(self, 401, {'error': 'Current password does not match.'})
                return

            set_partner_password(influencer, new_pwd)
            influencer['passwordChanged'] = True
            influencer['mustChangePassword'] = False
            write_workbook_state(state)

            json_response(self, 200, {
                'status': 'success',
                'success': True,
                'message': 'Password updated successfully.',
                'partner': public_partner_profile(influencer),
                'influencer': public_partner_profile(influencer)
            })
            return

        if clean_path == '/api/partner-portal/sync-partner':
            try:
                share = partner_share_from_token(bearer_token(self.headers))
                if not share or share.get('revoked_at'):
                    json_response(self, 401, {'error': 'Sign in to your Influencer Portal first.'})
                    return
                partner_data = payload.get('partner') or payload or {}
                name = str(partner_data.get('fullName') or partner_data.get('name') or '').strip()
                email = str(partner_data.get('email') or '').strip().lower()
                company = str(partner_data.get('company') or 'Advisory Partner').strip()
                job_title = str(partner_data.get('jobTitle') or partner_data.get('title') or 'Executive Partner').strip()
                domain = str(partner_data.get('domain') or partner_data.get('industry') or 'Enterprise SaaS').strip()
                linkedin_url = normalize_linkedin_url(partner_data.get('linkedin') or partner_data.get('linkedinUrl') or '')
                phone = str(partner_data.get('phone') or '').strip()
                location = str(partner_data.get('location') or '').strip()
                firebase_uid = str(partner_data.get('uid') or partner_data.get('firebaseUid') or '').strip()
                # Reward balances are admin controlled; never accept client totals.
                points = 0
                intros = payload.get('intros') or []

                if not email:
                    json_response(self, 400, {'error': 'Email is required to register or sync partner.'})
                    return

                if not name:
                    name = email.split('@')[0].replace('.', ' ').replace('_', ' ').replace('-', ' ').title()

                state = read_workbook_state()
                contacts = state.setdefault('contacts', [])

                influencer = next((
                    c for c in contacts
                    if c.get('isInfluencer') and str(c.get('id')) == str(share['influencer_id'])
                ), None)

                if influencer:
                    if str(influencer.get('email') or '').strip().lower() != email:
                        json_response(self, 403, {'error': 'This session is not authorized to update that partner profile.'})
                        return
                    if name: influencer['fullName'] = name
                    if company: influencer['company'] = company
                    if job_title: influencer['jobTitle'] = job_title
                    if domain: influencer['domain'] = domain
                    if linkedin_url: influencer['linkedinUrl'] = linkedin_url
                    if phone: influencer['phone'] = phone
                    if location: influencer['location'] = location
                    if firebase_uid: influencer['firebaseUid'] = firebase_uid
                    influencer['isInfluencer'] = True
                    influencer.setdefault('referrals', [])
                    influencer.setdefault('agreements', [])
                    if points > (influencer.get('referralCredits') or 0):
                        influencer['referralCredits'] = points
                else:
                    existing = next((c for c in contacts if str(c.get('email') or '').strip().lower() == email), None)
                    if existing:
                        existing['isInfluencer'] = True
                        existing['fullName'] = name or existing.get('fullName')
                        existing['company'] = company or existing.get('company')
                        existing['jobTitle'] = job_title or existing.get('jobTitle')
                        existing['domain'] = domain or existing.get('domain', 'Enterprise SaaS')
                        if linkedin_url: existing['linkedinUrl'] = linkedin_url
                        if phone: existing['phone'] = phone
                        if location: existing['location'] = location
                        if firebase_uid: existing['firebaseUid'] = firebase_uid
                        existing['influencerStatus'] = 'active'
                        existing.setdefault('referrals', [])
                        existing.setdefault('agreements', [])
                        existing.setdefault('referralCredits', points)
                        influencer = existing
                    else:
                        parts = name.split()
                        valid_ids = []
                        for c in contacts:
                            try:
                                valid_ids.append(int(c.get('id')))
                            except (ValueError, TypeError):
                                pass
                        new_id = max(valid_ids + [1000]) + 1
                        influencer = {
                            'id': new_id,
                            'firstName': parts[0] if parts else name,
                            'lastName': ' '.join(parts[1:]) if len(parts) > 1 else '',
                            'fullName': name,
                            'email': email,
                            'company': company,
                            'jobTitle': job_title,
                            'domain': domain,
                            'linkedinUrl': linkedin_url,
                            'phone': phone,
                            'location': location,
                            'firebaseUid': firebase_uid,
                            'isInfluencer': True,
                            'influencerStatus': 'active',
                            'referralCredits': points,
                            'referrals': [],
                            'agreements': [
                                {
                                    'id': f"agr_{int(time.time() * 1000)}",
                                    'name': 'Standard Partner Network Agreement',
                                    'type': 'Signed Partner Agreement',
                                    'signerName': name,
                                    'signedAt': time.strftime('%Y-%m-%d %H:%M:%SZ', time.gmtime()),
                                    'hash': f"#IRM-{firebase_uid[:8].upper() if firebase_uid else 'VERIFIED'}"
                                }
                            ],
                            'sourceFile': 'Partner Portal Registration'
                        }
                        contacts.append(influencer)

                if isinstance(intros, list) and intros:
                    for intro in intros:
                        ref_name = str(intro.get('name') or intro.get('fullName') or '').strip()
                        ref_email = str(intro.get('email') or '').strip().lower()
                        if not ref_name:
                            continue
                        existing_ref = next((
                            c for c in contacts
                            if not c.get('isInfluencer') and (
                                (ref_email and str(c.get('email') or '').strip().lower() == ref_email)
                                or (str(c.get('id')) == str(intro.get('id')))
                            )
                        ), None)

                        has_scheduled = intro.get('status') == 'Call Scheduled' or bool(intro.get('meetingDate'))
                        has_taken = intro.get('status') in ('Meeting Verified', 'Customer Closed')

                        if existing_ref:
                            existing_ref['fullName'] = ref_name
                            if ref_email: existing_ref['email'] = ref_email
                            if intro.get('company'): existing_ref['company'] = str(intro.get('company')).strip()
                            if intro.get('title'): existing_ref['jobTitle'] = str(intro.get('title')).strip()
                            if intro.get('phone'): existing_ref['phone'] = str(intro.get('phone')).strip()
                            if intro.get('linkedin'): existing_ref['linkedinUrl'] = normalize_linkedin_url(intro.get('linkedin'))
                            if intro.get('location'): existing_ref['location'] = str(intro.get('location')).strip()
                            if has_scheduled: existing_ref['hasScheduledCall'] = True
                            if has_taken: existing_ref['hasTakenCall'] = True
                            existing_ref['referredBy'] = influencer['fullName']
                            existing_ref['referredByEmail'] = influencer['email']
                            existing_ref['influencerId'] = influencer['id']
                            existing_ref['influencerEmail'] = influencer['email']
                        else:
                            valid_ids = []
                            for c in contacts:
                                try:
                                    valid_ids.append(int(c.get('id')))
                                except (ValueError, TypeError):
                                    pass
                            ref_id = max(valid_ids + [2000]) + 1
                            parts = ref_name.split()
                            new_ref = {
                                'id': ref_id,
                                'firstName': parts[0] if parts else ref_name,
                                'lastName': ' '.join(parts[1:]) if len(parts) > 1 else '',
                                'fullName': ref_name,
                                'email': ref_email or f"contact-{ref_id}@referral.invalid",
                                'company': str(intro.get('company') or 'Executive Referral').strip(),
                                'jobTitle': str(intro.get('title') or 'Decision Maker').strip(),
                                'phone': str(intro.get('phone') or '').strip(),
                                'linkedinUrl': normalize_linkedin_url(intro.get('linkedin') or ''),
                                'location': str(intro.get('location') or '').strip(),
                                'isInfluencer': False,
                                'referredBy': influencer['fullName'],
                                'referredByEmail': influencer['email'],
                                'influencerId': influencer['id'],
                                'influencerEmail': influencer['email'],
                                'hasScheduledCall': has_scheduled,
                                'hasTakenCall': has_taken,
                                'date': intro.get('meetingDate') or time.strftime('%Y-%m-%d', time.gmtime()),
                                'warmth': str(intro.get('warmth') or 'Warm Referral'),
                                'notes': str(intro.get('context') or intro.get('briefing') or ''),
                                'sourceFile': f"Referred by {influencer['fullName']}"
                            }
                            contacts.append(new_ref)
                            if 'referrals' in influencer:
                                if not any(r.get('id') == ref_id or (ref_email and r.get('email') == ref_email) for r in influencer['referrals']):
                                    influencer['referrals'].append({
                                        'id': ref_id,
                                        'fullName': ref_name,
                                        'email': ref_email,
                                        'company': new_ref['company'],
                                        'jobTitle': new_ref['jobTitle'],
                                        'status': intro.get('status', 'Intro Submitted'),
                                        'date': new_ref['date']
                                    })

                write_workbook_state(state)
                json_response(self, 200, {
                    'status': 'synced',
                    'influencer': public_partner_profile(influencer),
                    'referralCount': len([c for c in contacts if str(c.get('influencerId')) == str(influencer['id']) or (c.get('referredByEmail') and c.get('referredByEmail').lower() == email)])
                })
            except Exception as ex:
                json_response(self, 500, {'error': f'Partner sync failed: {ex}'})
            return

        if clean_path == '/api/partner-share/agreement':
            token = str(self.headers.get('Authorization') or '').removeprefix('Bearer ').strip()
            share = partner_share_from_token(token)
            if not share or share['revoked_at']:
                json_response(self, 401, {'error': 'Sign in to your Influencer Portal first.'})
                return
            try:
                state = read_workbook_state()
                influencer = next((c for c in state.get('contacts', []) if c.get('isInfluencer') and str(c.get('id')) == str(share['influencer_id'])), None)
                if not influencer:
                    json_response(self, 404, {'error': 'Partner profile not found.'})
                    return
                signer_name = str(payload.get('signerName') or influencer.get('fullName') or '').strip()
                doc_name = str(payload.get('name') or 'IRM Partner Network Agreement').strip()
                if not signer_name:
                    json_response(self, 400, {'error': 'Signer full name is required.'})
                    return
                agr_entry = {
                    'id': f"agr_{int(time.time() * 1000)}",
                    'name': doc_name,
                    'type': 'Signed Partner Agreement',
                    'status': 'Signed',
                    'signedBy': signer_name,
                    'uploadedAt': time.strftime('%Y-%m-%d', time.gmtime()),
                    'notes': str(payload.get('notes') or f'Digitally signed by {signer_name} via Influencer Portal.'),
                    'dataUrl': str(payload.get('dataUrl') or '')
                }
                agreements = influencer.setdefault('agreements', [])
                agreements.insert(0, agr_entry)
                write_workbook_state(state)
                json_response(self, 200, {
                    'status': 'signed',
                    'agreement': {k: v for k, v in agr_entry.items() if k != 'dataUrl'},
                    'agreements': [{k: v for k, v in a.items() if k != 'dataUrl'} for a in agreements if isinstance(a, dict)]
                })
            except Exception as ex:
                json_response(self, 500, {'error': f'Could not record partner agreement: {ex}'})
            return

        if clean_path == '/api/partner-share/requests/respond':
            token = str(self.headers.get('Authorization') or '').removeprefix('Bearer ').strip()
            share = partner_share_from_token(token)
            if not share or share['revoked_at']:
                json_response(self, 401, {'error': 'Sign in to your Influencer Portal first.'})
                return
            try:
                state = read_workbook_state()
                influencer = next((c for c in state.get('contacts', []) if c.get('isInfluencer') and str(c.get('id')) == str(share['influencer_id'])), None)
                if not influencer:
                    json_response(self, 404, {'error': 'Partner profile not found.'})
                    return
                if influencer.get('influencerStatus', 'approved') != 'approved':
                    json_response(self, 403, {'error': 'Your profile is awaiting IRM approval before participating in Marketplace requests.'})
                    return
                req_id = str(payload.get('requestId') or '').strip()
                decision = str(payload.get('decision') or 'accept').strip().lower()
                mp_requests = state.setdefault('marketplaceRequests', [])
                # This first pilot only awards points after a milestone has verifiable evidence
                # and an IRM operator approves it; participant actions cannot self-award.
                if decision in ('complete', 'completed', 'call_completed'):
                    json_response(self, 409, {'error': 'Meeting completion must be confirmed by the buyer and approved by IRM.'})
                    return
                target_req = next((r for r in mp_requests if isinstance(r, dict) and str(r.get('id')) == req_id), None)
                if not target_req:
                    json_response(self, 404, {'error': 'Introduction request not found.'})
                    return
                if str(target_req.get('influencerId') or '') != str(influencer.get('id')) and str(target_req.get('influencerEmail') or '').lower() != str(influencer.get('email') or '').lower():
                    json_response(self, 403, {'error': 'This introduction request belongs to another partner.'})
                    return

                now_iso = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
                current_status = str(target_req.get('status') or 'requested')
                if decision in ('decline', 'declined') and current_status in ('requested', 'irm_approved'):
                    target_req['status'] = 'declined'
                elif decision in ('schedule', 'scheduled', 'call_scheduled') and current_status == 'irm_approved':
                    target_req['status'] = 'call_scheduled'
                elif decision in ('accept', 'accepted', 'influencer_accepted') and current_status == 'irm_approved':
                    target_req['status'] = 'influencer_accepted'
                else:
                    json_response(self, 409, {'error': 'IRM must approve the request before you accept, schedule, or decline it.'})
                    return

                if payload.get('scheduledMeetingUrl'):
                    target_req['scheduledMeetingUrl'] = str(payload.get('scheduledMeetingUrl')).strip()
                target_req['updatedAt'] = now_iso

                # Sync target contact call state and referral credits
                target_cid = str(target_req.get('targetContactId') or '')
                target_contact = next((c for c in (state.get('contacts') or []) if str(c.get('id')) == target_cid and not c.get('isInfluencer')), None)
                if target_contact and target_req['status'] in ('influencer_accepted', 'call_scheduled'):
                    target_contact['hasScheduledCall'] = True
                    sync_influencer_referral_ledger(influencer, target_contact)

                write_workbook_state(state)
                json_response(self, 200, {
                    'status': 'updated',
                    'request': target_req,
                    'referralCredits': influencer.get('referralCredits', 0)
                })
            except Exception as ex:
                json_response(self, 500, {'error': f'Could not update introduction request: {ex}'})
            return

        if clean_path == '/api/partner-share/rewards/redeem':
            token = str(self.headers.get('Authorization') or '').removeprefix('Bearer ').strip()
            share = partner_share_from_token(token)
            if not share or share['revoked_at']:
                json_response(self, 401, {'error': 'Sign in to your Influencer Portal first.'})
                return
            reward_type = str(payload.get('rewardType') or '').strip()
            allowed_rewards = {'cash', 'nonprofit_donation', 'conference_sponsorship', 'products_services', 'executive_event', 'vip_dinner', 'research_sponsorship', 'speaking_opportunity', 'content_collaboration', 'thought_leadership'}
            try:
                if reward_type not in allowed_rewards:
                    json_response(self, 400, {'error': 'Choose a listed reward type.'})
                    return
                points = int(payload.get('points') or 0)
                if points <= 0:
                    json_response(self, 400, {'error': 'Enter the points to redeem.'})
                    return
                state = read_workbook_state()
                influencer = next((c for c in state.get('contacts', []) if c.get('isInfluencer') and str(c.get('id')) == str(share['influencer_id'])), None)
                if not influencer:
                    json_response(self, 404, {'error': 'Partner profile not found.'})
                    return
                ledger = ensure_reward_ledger(state)
                reserved = sum(int(r.get('points') or 0) for r in (state.get('rewardRedemptions') or []) if isinstance(r, dict) and str(r.get('influencerId')) == str(share['influencer_id']) and r.get('status') in ('requested', 'approved', 'fulfilling'))
                available = reward_points_for_influencer(state, share['influencer_id']) - reserved
                if points > available:
                    json_response(self, 409, {'error': 'Requested points exceed your available approved balance.', 'availablePoints': max(available, 0)})
                    return
                redemptions = state.setdefault('rewardRedemptions', [])
                rid = f"redemption:{share['influencer_id']}:{int(time.time() * 1000)}"
                entry = {'id': rid, 'influencerId': share['influencer_id'], 'rewardType': reward_type,
                    'points': points, 'details': str(payload.get('details') or '').strip(),
                    'status': 'requested', 'createdAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}
                redemptions.append(entry)
                write_workbook_state(state)
                json_response(self, 201, {'status': 'requested', 'redemption': entry, 'availablePoints': available - points})
            except Exception as ex:
                json_response(self, 500, {'error': f'Could not submit reward request: {ex}'})
            return

        if self.path == '/api/marketplace/vendors/signup':
            if os.environ.get('VERCEL'):
                json_response(self, 503, {'error': 'Vendor Marketplace signup requires persistent storage.'})
                return
            try:
                state = read_workbook_state()
                vendors = state.setdefault('vendors', [])
                company_name = str(payload.get('companyName') or '').strip()
                contact_name = str(payload.get('contactName') or '').strip()
                email = str(payload.get('email') or '').strip().lower()
                password = str(payload.get('password') or '').strip()
                website = str(payload.get('website') or '').strip()
                industry = str(payload.get('industry') or 'B2B FinTech / Credit Union Solutions').strip()
                icp_description = str(payload.get('icpDescription') or '').strip()
                calendly_url = str(payload.get('calendlyUrl') or '').strip()

                if not company_name or not contact_name or not email:
                    json_response(self, 400, {'error': 'Company name, contact name, and work email are required.'})
                    return
                if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', email):
                    json_response(self, 400, {'error': 'Enter a valid work email address.'})
                    return
                if len(password) < 12:
                    json_response(self, 400, {'error': 'Choose a password of at least 12 characters.'})
                    return
                if any(isinstance(v, dict) and str(v.get('email') or '').lower() == email for v in vendors):
                    json_response(self, 409, {'error': 'A Vendor account with this email already exists. Please sign in.'})
                    return

                token = secrets.token_urlsafe(32)
                token_hash = hashlib.sha256(token.encode('utf-8')).hexdigest()
                next_vid = max([int(v.get('id') or 0) for v in vendors if isinstance(v, dict)] + [500]) + 1
                now_iso = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())

                new_vendor = {
                    'id': next_vid,
                    'companyName': company_name,
                    'contactName': contact_name,
                    'email': email,
                    'passwordHash': hash_portal_password(password),
                    'sessionTokenHash': token_hash,
                    'website': website,
                    'industry': industry,
                    'icpDescription': icp_description,
                    'calendlyUrl': calendly_url,
                    'agreementStatus': 'none',
                    'networkAccessLevel': 'locked',
                    'agreements': [],
                    'createdAt': now_iso,
                    'sessionExpiresAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(time.time() + 30 * 24 * 60 * 60)),
                    'approvedAt': ''
                }
                vendors.append(new_vendor)
                write_workbook_state(state)
                json_response(self, 201, {
                    'status': 'created',
                    'token': token,
                    'vendor': vendor_safe_dict(new_vendor)
                })
            except Exception as ex:
                json_response(self, 500, {'error': f'Vendor signup failed: {ex}'})
            return

        if self.path == '/api/marketplace/vendors/login':
            try:
                state = read_workbook_state()
                vendors = state.get('vendors') or []
                email = str(payload.get('email') or '').strip().lower()
                password = str(payload.get('password') or '').strip()
                if not email or not password:
                    json_response(self, 400, {'error': 'Email and password are required.'})
                    return
                vendor = next((v for v in vendors if isinstance(v, dict) and str(v.get('email') or '').lower() == email), None)
                if not vendor or not verify_portal_password(password, vendor.get('passwordHash')):
                    json_response(self, 401, {'error': 'Invalid vendor email or password.'})
                    return
                token = secrets.token_urlsafe(32)
                vendor['sessionTokenHash'] = hashlib.sha256(token.encode('utf-8')).hexdigest()
                vendor['sessionExpiresAt'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(time.time() + 30 * 24 * 60 * 60))
                write_workbook_state(state)
                json_response(self, 200, {
                    'status': 'authenticated',
                    'token': token,
                    'vendor': vendor_safe_dict(vendor)
                })
            except Exception as ex:
                json_response(self, 500, {'error': f'Vendor login failed: {ex}'})
            return

        if self.path == '/api/marketplace/vendor/agreement':
            token = str(self.headers.get('Authorization') or '').removeprefix('Bearer ').strip()
            try:
                state = read_workbook_state()
                vendor = vendor_from_token(state, token)
                if not vendor:
                    json_response(self, 401, {'error': 'Sign in to your Vendor Marketplace account first.'})
                    return
                signer_name = str(payload.get('signerName') or '').strip()
                signer_title = str(payload.get('signerTitle') or '').strip()
                accepted_terms = bool(payload.get('acceptedTerms'))
                agreement_title = str(payload.get('agreementTitle') or 'Model 2 — IRM Master Vendor Network Access Agreement').strip()
                if not signer_name or not accepted_terms:
                    json_response(self, 400, {'error': 'Signer full name and acceptance of the IRM Master Agreement terms are required.'})
                    return
                now_iso = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
                agr_entry = {
                    'id': f"vagr_{int(time.time() * 1000)}",
                    'title': agreement_title,
                    'signedBy': signer_name,
                    'signerTitle': signer_title,
                    'status': 'Signed',
                    'signedAt': now_iso[:10],
                    'termsVersion': 'IRM-Model2-2026.1',
                    'notes': str(payload.get('notes') or ''),
                    'dataUrl': str(payload.get('dataUrl') or '')
                }
                vendor.setdefault('agreements', []).insert(0, agr_entry)
                vendor['agreementStatus'] = 'signed'
                vendor['networkAccessLevel'] = 'full_partner_access'
                write_workbook_state(state)
                json_response(self, 200, {
                    'status': 'signed',
                    'vendor': vendor_safe_dict(vendor)
                })
            except Exception as ex:
                json_response(self, 500, {'error': f'Could not execute vendor agreement: {ex}'})
            return

        if self.path == '/api/marketplace/requests':
            token = str(self.headers.get('Authorization') or '').removeprefix('Bearer ').strip()
            try:
                state = read_workbook_state()
                vendor = vendor_from_token(state, token)
                if not vendor:
                    json_response(self, 401, {'error': 'Sign in to your Vendor Marketplace account first.'})
                    return
                if vendor.get('agreementStatus') != 'signed' or vendor.get('networkAccessLevel') == 'locked':
                    json_response(self, 403, {
                        'error': 'You must sign the IRM Marketplace Agreement before requesting Influencer introductions.',
                        'code': 'AGREEMENT_REQUIRED'
                    })
                    return
                if vendor.get('vendorStatus') == 'revoked':
                    json_response(self, 403, {'error': 'Vendor Marketplace access has been revoked.'})
                    return
                if vendor.get('vendorStatus') != 'approved':
                    json_response(self, 403, {'error': 'IRM approval is required before submitting introduction requests.', 'code': 'VENDOR_REVIEW_REQUIRED'})
                    return

                target_contact_id = payload.get('targetContactId')
                influencer_id = payload.get('influencerId')
                vendor_pitch = str(payload.get('vendorPitch') or '').strip()
                if not vendor_pitch:
                    json_response(self, 400, {'error': 'Provide a brief context or value proposition for the warm introduction.'})
                    return

                contacts = state.get('contacts') or []
                target_contact = next((c for c in contacts if not c.get('isInfluencer') and str(c.get('id')) == str(target_contact_id)), None) if target_contact_id is not None else None
                influencer = None
                if influencer_id is not None:
                    influencer = next((c for c in contacts if c.get('isInfluencer') and str(c.get('id')) == str(influencer_id)), None)
                if not influencer and target_contact:
                    inf_id_ref = str(target_contact.get('influencerId') or '')
                    inf_email_ref = str(target_contact.get('influencerEmail') or '').lower()
                    inf_name_ref = str(target_contact.get('referredBy') or '').lower()
                    influencer = next((
                        c for c in contacts if c.get('isInfluencer') and (
                            (inf_id_ref and str(c.get('id')) == inf_id_ref)
                            or (inf_email_ref and str(c.get('email') or '').lower() == inf_email_ref)
                            or (inf_name_ref and str(c.get('fullName') or '').lower() == inf_name_ref)
                        )
                    ), None)
                if influencer and influencer.get('influencerStatus', 'approved') != 'approved':
                    json_response(self, 403, {'error': 'This Influencer is not yet approved for Marketplace requests.', 'code': 'INFLUENCER_REVIEW_REQUIRED'})
                    return

                if not target_contact or not influencer:
                    json_response(self, 404, {'error': 'Select a valid network contact linked to an Influencer Partner to request an introduction.'})
                    return
                if target_contact.get('isDemoData') or influencer.get('isDemoData') or target_contact.get('archivedAt') or influencer.get('archivedAt'):
                    json_response(self, 404, {'error': 'This network contact is not available for Marketplace introductions.'})
                    return
                if not any(str(a.get('status') or '').lower() == 'signed' for a in (influencer.get('agreements') or []) if isinstance(a, dict)):
                    json_response(self, 403, {'error': 'This Influencer must sign the IRM Partner Network Agreement before receiving introduction requests.'})
                    return

                mp_requests = state.setdefault('marketplaceRequests', [])
                existing_req = next((
                    r for r in mp_requests
                    if isinstance(r, dict)
                    and str(r.get('vendorId')) == str(vendor.get('id'))
                    and str(r.get('targetContactId') or '') == str(target_contact.get('id') if target_contact else '')
                    and str(r.get('influencerId') or '') == str(influencer.get('id') if influencer else '')
                    and r.get('status') not in ('declined',)
                ), None)
                if existing_req:
                    json_response(self, 409, {'error': 'An active introduction request already exists for this target.'})
                    return

                next_rid = max([int(r.get('id') or 0) for r in mp_requests if isinstance(r, dict)] + [2000]) + 1
                now_iso = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
                new_req = {
                    'id': next_rid,
                    'vendorId': vendor.get('id'),
                    'vendorCompany': vendor.get('companyName') or '',
                    'vendorContactName': vendor.get('contactName') or '',
                    'vendorEmail': vendor.get('email') or '',
                    'influencerId': influencer.get('id') if influencer else None,
                    'influencerName': influencer.get('fullName') if influencer else (target_contact.get('referredBy') if target_contact else 'IRM Partner'),
                    'influencerEmail': influencer.get('email') if influencer else (target_contact.get('influencerEmail') if target_contact else ''),
                    'targetContactId': target_contact.get('id') if target_contact else None,
                    'targetContactName': target_contact.get('fullName') if target_contact else 'Network Introduction',
                    'targetCompany': (target_contact.get('company') if target_contact else payload.get('targetCompany')) or 'Target Account',
                    'targetJobTitle': (target_contact.get('jobTitle') if target_contact else payload.get('targetJobTitle')) or 'Executive',
                    'status': 'requested',
                    'stage': 'intro_requested',
                    'whyThisContact': str(payload.get('whyThisContact') or '').strip(),
                    'whyTheyShouldCare': str(payload.get('whyTheyShouldCare') or '').strip(),
                    'specificAsk': str(payload.get('specificAsk') or '20-minute executive briefing').strip(),
                    'supportingContext': str(payload.get('supportingContext') or '').strip(),
                    'forwardableBrief': generate_forwardable_brief(
                        vendor, target_contact or {}, influencer or {},
                        str(payload.get('whyThisContact') or ''),
                        str(payload.get('whyTheyShouldCare') or ''),
                        str(payload.get('specificAsk') or '20-minute executive briefing'),
                        str(payload.get('supportingContext') or '')
                    ),
                    'optInToken': secrets.token_urlsafe(24),
                    'partnerId': influencer.get('id') if influencer else None,
                    'partnerName': influencer.get('fullName') if influencer else (target_contact.get('referredBy') if target_contact else 'ConnectEM Partner'),
                    'partnerEmail': influencer.get('email') if influencer else (target_contact.get('influencerEmail') if target_contact else ''),
                    'vendorPitch': vendor_pitch,
                    'scheduledMeetingUrl': vendor.get('calendlyUrl') or '',
                    'creditsAwarded': 0,
                    'createdAt': now_iso,
                    'updatedAt': now_iso
                }
                mp_requests.insert(0, new_req)
                write_workbook_state(state)
                json_response(self, 201, {
                    'status': 'created',
                    'request': new_req
                })
            except Exception as ex:
                json_response(self, 500, {'error': f'Could not create introduction request: {ex}'})
            return

        if self.path == '/api/connectem/opt-in/respond':
            token = str(payload.get('token') or '').strip()
            decision = str(payload.get('response') or 'accept').strip().lower()
            notes = str(payload.get('notes') or '').strip()
            preferred_time = str(payload.get('preferredTime') or '').strip()
            state = read_workbook_state()
            reqs = state.get('marketplaceRequests') or []
            req = next((r for r in reqs if isinstance(r, dict) and (str(r.get('optInToken') or '') == token or str(r.get('id') or '') == token)), None)
            if not req:
                json_response(self, 404, {'error': 'Invalid opt-in request.'})
                return
            now_iso = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
            req['updatedAt'] = now_iso
            req['contactOptInNotes'] = notes
            req['preferredMeetingTime'] = preferred_time

            if decision in ('accept', 'yes'):
                req['status'] = 'contact_accepted'
                req['stage'] = 'introduction_made'
                req['contactAcceptedAt'] = now_iso
                target_cid = str(req.get('targetContactId') or '')
                target_contact = next((c for c in (state.get('contacts') or []) if str(c.get('id')) == target_cid), None)
                if target_contact:
                    target_contact['hasScheduledCall'] = True
                write_workbook_state(state)
                json_response(self, 200, {
                    'status': 'success',
                    'decision': 'accepted',
                    'meetingUrl': req.get('scheduledMeetingUrl') or 'https://calendly.com/connectem/briefing',
                    'message': 'Thank you! The introduction has been confirmed.'
                })
                return
            elif decision in ('maybe', 'maybe_later'):
                req['status'] = 'contact_no_response'
                req['stage'] = 'contact_deferred'
                write_workbook_state(state)
                json_response(self, 200, {'status': 'success', 'decision': 'maybe_later'})
                return
            else:
                req['status'] = 'contact_declined'
                req['stage'] = 'contact_declined'
                write_workbook_state(state)
                json_response(self, 200, {'status': 'success', 'decision': 'declined'})
                return

        if self.path == '/api/connectem/requests/review':
            token = str(self.headers.get('Authorization') or '').removeprefix('Bearer ').strip()
            share = partner_share_from_token(token)
            state = read_workbook_state()
            partner = None
            if share:
                partner = next((c for c in state.get('contacts') or [] if str(c.get('id')) == str(share.get('influencer_id'))), None)
            if not partner:
                json_response(self, 401, {'error': 'Partner authentication required.'})
                return
            req_id = str(payload.get('requestId') or '').strip()
            decision = str(payload.get('decision') or 'check_interest').strip().lower()
            note = str(payload.get('partnerNote') or '').strip()
            rating = str(payload.get('relevanceRating') or 'highly').strip().lower()
            reqs = state.setdefault('marketplaceRequests', [])
            req = next((r for r in reqs if isinstance(r, dict) and str(r.get('id')) == req_id), None)
            if not req:
                json_response(self, 404, {'error': 'Introduction request not found.'})
                return
            now_iso = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
            req['updatedAt'] = now_iso
            req['relevanceRating'] = rating
            req['partnerNote'] = note

            if decision in ('check_interest', 'accept'):
                req['status'] = 'contact_opt_in_requested'
                req['stage'] = 'contact_opt_in_requested'
                req['partnerAcceptedAt'] = now_iso
                if not req.get('optInToken'):
                    req['optInToken'] = secrets.token_urlsafe(24)
                write_workbook_state(state)
                json_response(self, 200, {
                    'status': 'updated',
                    'decision': 'check_interest',
                    'request': req,
                    'optInUrl': f'/opt-in.html?token={req["optInToken"]}'
                })
                return
            elif decision == 'decline':
                req['status'] = 'partner_declined'
                req['stage'] = 'partner_declined'
                req['partnerDeclinedAt'] = now_iso
                write_workbook_state(state)
                json_response(self, 200, {'status': 'updated', 'decision': 'declined', 'request': req})
                return
            elif decision == 'ask_question':
                req['status'] = 'partner_question_pending'
                req['partnerQuestion'] = payload.get('question') or note
                write_workbook_state(state)
                json_response(self, 200, {'status': 'updated', 'decision': 'ask_question', 'request': req})
                return
            elif decision == 'suggest_contact':
                req['status'] = 'alternate_suggested'
                req['suggestedContactId'] = payload.get('alternateContactId')
                write_workbook_state(state)
                json_response(self, 200, {'status': 'updated', 'decision': 'suggest_contact', 'request': req})
                return
            else:
                req['status'] = 'partner_not_now'
                write_workbook_state(state)
                json_response(self, 200, {'status': 'updated', 'decision': 'not_now', 'request': req})
                return

        if self.path == '/api/connectem/feedback':
            req_id = str(payload.get('requestId') or '').strip()
            role = str(payload.get('role') or 'vendor').strip().lower()
            state = read_workbook_state()
            reqs = state.setdefault('marketplaceRequests', [])
            req = next((r for r in reqs if isinstance(r, dict) and str(r.get('id')) == req_id), None)
            if not req:
                json_response(self, 404, {'error': 'Request not found.'})
                return
            now_iso = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
            req['updatedAt'] = now_iso
            if role == 'vendor':
                req['vendorMeetingHeld'] = bool(payload.get('meetingHeld', True))
                req['vendorRating'] = int(payload.get('rating') or 5)
                outcome = str(payload.get('outcome') or 'follow_up').strip().lower()
                req['outcome'] = outcome
                req['opportunityValue'] = float(payload.get('opportunityValue') or 0)
                req['vendorFeedback'] = str(payload.get('feedbackNotes') or '').strip()
                if req['vendorMeetingHeld']:
                    req['status'] = 'meeting_completed'
                    if outcome in ('opportunity', 'poc'):
                        req['status'] = 'opportunity_created'
                    elif outcome == 'customer':
                        req['status'] = 'won'
                    elif outcome == 'no_fit':
                        req['status'] = 'no_opportunity'
            elif role == 'partner':
                req['partnerWasGoodIntro'] = bool(payload.get('wasGoodIntro', True))
                req['partnerWouldIntroduceAgain'] = bool(payload.get('wouldIntroduceAgain', True))
                req['partnerFeedback'] = str(payload.get('partnerNotes') or '').strip()
            elif role == 'contact':
                req['contactRelevance'] = str(payload.get('relevance') or 'thumbs_up').strip()
                req['contactFeedback'] = str(payload.get('contactNotes') or '').strip()
            write_workbook_state(state)
            json_response(self, 200, {'status': 'recorded', 'request': req})
            return

        if self.path == '/api/connectem/ai-match':
            query = str(payload.get('query') or '').strip().lower()
            state = read_workbook_state()
            contacts = state.get('contacts') or []
            influencers = {str(c.get('id')): c for c in contacts if c.get('isInfluencer')}
            prospects = [c for c in contacts if not c.get('isInfluencer') and not c.get('archivedAt')]

            results = []
            query_terms = [t for t in query.split() if len(t) > 2]
            for c in prospects:
                if str(c.get('privacyLevel') or '').lower() == 'private':
                    continue
                inf = influencers.get(str(c.get('influencerId') or ''))
                warm_path = calculate_warm_path_score(c, inf)
                match_score = warm_path['score']
                title = str(c.get('jobTitle') or '').lower()
                comp = str(c.get('company') or '').lower()
                asset = str(c.get('assetSize') or '').lower()
                topics = [str(t).lower() for t in (c.get('topics') or [])]
                
                for term in query_terms:
                    if term in title or term in comp or term in asset or any(term in tp for tp in topics):
                        match_score += 5
                results.append({
                    'id': c.get('id'),
                    'fullName': mask_full_name(c.get('fullName')),
                    'jobTitle': c.get('jobTitle'),
                    'company': c.get('company'),
                    'assetSize': c.get('assetSize'),
                    'industry': c.get('industry'),
                    'partnerName': inf.get('fullName') if inf else c.get('referredBy'),
                    'partnerCompany': inf.get('company') if inf else 'Advisory Network',
                    'partnerId': inf.get('id') if inf else c.get('influencerId'),
                    'warmPathScore': warm_path['score'],
                    'warmPathLabel': warm_path['label'],
                    'relationshipStrength': c.get('strength') or 'strong',
                    'introWillingness': c.get('introWillingness') or 'selective',
                    'topics': c.get('topics') or ['Credit Union Systems', 'FinTech'],
                    'icpFit': min(99, max(60, match_score))
                })
            results.sort(key=lambda x: (x['icpFit'], x['warmPathScore']), reverse=True)
            json_response(self, 200, {
                'query': query,
                'count': len(results[:25]),
                'results': results[:25]
            })
            return

        if self.path == '/api/connectem/account-match':
            account_names = payload.get('accounts') or []
            if isinstance(account_names, str):
                account_names = [line.strip() for line in account_names.splitlines() if line.strip()]
            state = read_workbook_state()
            contacts = state.get('contacts') or []
            influencers = {str(c.get('id')): c for c in contacts if c.get('isInfluencer')}
            prospects = [c for c in contacts if not c.get('isInfluencer') and not c.get('archivedAt')]

            matched_accounts = []
            strong_count = 0
            intro_eligible_count = 0

            for raw_acc in account_names:
                acc_clean = raw_acc.strip().lower()
                if not acc_clean:
                    continue
                matching_contacts = [
                    c for c in prospects
                    if acc_clean in str(c.get('company') or '').lower() or str(c.get('company') or '').lower() in acc_clean
                ]
                if matching_contacts:
                    has_strong = any(str(c.get('strength') or '').lower() == 'strong' for c in matching_contacts)
                    eligible = [c for c in matching_contacts if str(c.get('privacyLevel') or '').lower() != 'private']
                    if has_strong:
                        strong_count += 1
                    if eligible:
                        intro_eligible_count += 1
                    top_contact = eligible[0] if eligible else matching_contacts[0]
                    inf = influencers.get(str(top_contact.get('influencerId') or ''))
                    wp = calculate_warm_path_score(top_contact, inf)
                    matched_accounts.append({
                        'account': raw_acc,
                        'matchedCompany': top_contact.get('company'),
                        'contactsCount': len(matching_contacts),
                        'hasStrongRelationship': has_strong,
                        'isIntroEligible': bool(eligible),
                        'strongestPartner': inf.get('fullName') if inf else top_contact.get('referredBy'),
                        'topContactTitle': top_contact.get('jobTitle'),
                        'warmPathScore': wp['score'],
                        'warmPathLabel': wp['label']
                    })

            json_response(self, 200, {
                'totalAccountsUploaded': len(account_names),
                'accountsWithRelationships': len(matched_accounts),
                'strongRelationships': strong_count,
                'introEligible': intro_eligible_count,
                'matches': matched_accounts
            })
            return

        if self.path == '/api/connectem/partner/profile':
            token = str(self.headers.get('Authorization') or '').removeprefix('Bearer ').strip()
            share = partner_share_from_token(token)
            state = read_workbook_state()
            partner = None
            if share:
                partner = next((c for c in state.get('contacts') or [] if str(c.get('id')) == str(share.get('influencer_id'))), None)
            if not partner:
                json_response(self, 401, {'error': 'Partner session expired.'})
                return
            if 'expertise' in payload:
                partner['expertise'] = payload['expertise']
            if 'geography' in payload:
                partner['geography'] = payload['geography']
            if 'industries' in payload:
                partner['industries'] = payload['industries']
            if 'openTo' in payload:
                partner['openTo'] = payload['openTo']
            write_workbook_state(state)
            json_response(self, 200, {'status': 'updated', 'partner': partner})
            return

        if self.path == '/api/irm/vendors/manage':
            if os.environ.get('VERCEL') or not is_irm_admin_request(self) or not request_origin_is_trusted(self):
                json_response(self, 403, {'error': 'Only the IRM Console administrator can manage vendors.'})
                return
            try:
                state = read_workbook_state()
                vendors = state.setdefault('vendors', [])
                vendor_id = str(payload.get('vendorId') or '')
                action = str(payload.get('action') or 'update').lower()
                vendor = next((v for v in vendors if isinstance(v, dict) and str(v.get('id')) == vendor_id), None)
                if not vendor:
                    json_response(self, 404, {'error': 'Vendor not found.'})
                    return
                now_iso = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
                if action == 'approve_vendor':
                    vendor['vendorStatus'] = 'approved'
                    vendor['approvedAt'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
                elif action == 'revoke_access':
                    vendor['networkAccessLevel'] = 'locked'
                    vendor['vendorStatus'] = 'revoked'
                elif action == 'restore_vendor':
                    vendor['vendorStatus'] = 'approved'
                    vendor['approvedAt'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
                else:
                    json_response(self, 400, {'error': 'Unsupported vendor governance action.'})
                    return
                write_workbook_state(state)
                json_response(self, 200, {'status': 'updated', 'vendor': vendor_safe_dict(vendor)})
            except Exception as ex:
                json_response(self, 500, {'error': f'Vendor management failed: {ex}'})
            return

        if self.path == '/api/irm/influencers/manage':
            if os.environ.get('VERCEL') or not is_irm_admin_request(self) or not request_origin_is_trusted(self):
                json_response(self, 403, {'error': 'Only the IRM administrator can manage influencer eligibility.'})
                return
            state = read_workbook_state()
            influencer = next((c for c in (state.get('contacts') or []) if c.get('isInfluencer') and str(c.get('id')) == str(payload.get('influencerId') or '')), None)
            if not influencer:
                json_response(self, 404, {'error': 'Influencer not found.'})
                return
            action = str(payload.get('action') or '').strip().lower()
            if action == 'approve':
                influencer['influencerStatus'] = 'approved'
            elif action == 'suspend':
                influencer['influencerStatus'] = 'suspended'
            else:
                json_response(self, 400, {'error': 'Choose approve or suspend.'})
                return
            influencer['influencerReviewedAt'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
            write_workbook_state(state)
            json_response(self, 200, {'status': influencer['influencerStatus'], 'influencerId': influencer.get('id')})
            return

        if self.path == '/api/irm/requests/manage':
            if os.environ.get('VERCEL') or not is_irm_admin_request(self) or not request_origin_is_trusted(self):
                json_response(self, 403, {'error': 'Only the IRM Console administrator can manage marketplace requests.'})
                return
            try:
                state = read_workbook_state()
                mp_requests = state.setdefault('marketplaceRequests', [])
                req_id = str(payload.get('requestId') or '')
                next_status = str(payload.get('status') or 'irm_approved').strip().lower()
                target_req = next((r for r in mp_requests if isinstance(r, dict) and str(r.get('id')) == req_id), None)
                if not target_req:
                    json_response(self, 404, {'error': 'Marketplace request not found.'})
                    return
                if next_status in ('accepted', 'accept', 'influencer_accepted'):
                    json_response(self, 400, {'error': 'Only the Influencer can accept a request from their Portal.'})
                    return
                elif next_status in ('scheduled',):
                    next_status = 'call_scheduled'
                elif next_status in ('completed',):
                    next_status = 'call_completed'
                if next_status not in ('irm_approved', 'declined', 'call_scheduled', 'call_completed', 'award_milestone'):
                    json_response(self, 400, {'error': 'Unsupported marketplace request status.'})
                    return
                target_req['updatedAt'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())

                contacts = state.get('contacts') or []
                target_contact = next((c for c in contacts if not c.get('isInfluencer') and str(c.get('id')) == str(target_req.get('targetContactId') or '')), None)
                influencer = next((c for c in contacts if c.get('isInfluencer') and str(c.get('id')) == str(target_req.get('influencerId') or '')), None)
                current_status = target_req.get('status') or 'requested'
                if next_status == 'award_milestone':
                    milestone = str(payload.get('milestone') or '').strip()
                    evidence = str(payload.get('evidence') or '').strip()
                    allowed_status = {
                        'warm_introduction': ('influencer_accepted', 'call_scheduled', 'call_completed'),
                        'qualified_meeting': ('call_completed',),
                        'opportunity_created': ('call_completed',),
                        'customer_closed': ('call_completed',),
                        'customer_expansion': ('call_completed',),
                    }
                    if milestone not in allowed_status:
                        json_response(self, 400, {'error': 'Unsupported reward milestone.'})
                        return
                    if current_status not in allowed_status[milestone]:
                        json_response(self, 409, {'error': 'The introduction workflow has not reached this reward milestone.'})
                        return
                    if not evidence:
                        json_response(self, 400, {'error': 'Add buyer-confirmed evidence before approving points.'})
                        return
                    if not influencer:
                        json_response(self, 409, {'error': 'The request has no active influencer to reward.'})
                        return
                    event = add_reward_event(state, target_req, milestone, evidence, 'irm_admin', time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()))
                    target_req.setdefault('rewardMilestones', {})[milestone] = event['eventId']
                elif next_status == 'irm_approved' and current_status == 'requested':
                    target_req['status'] = 'irm_approved'
                elif next_status == 'declined' and current_status in ('requested', 'irm_approved'):
                    target_req['status'] = 'declined'
                elif next_status == 'call_scheduled' and current_status in ('influencer_accepted', 'call_scheduled'):
                    target_req['status'] = 'call_scheduled'
                elif next_status == 'call_completed' and current_status in ('call_scheduled', 'call_completed'):
                    evidence = str(payload.get('evidence') or '').strip()
                    if not evidence:
                        json_response(self, 400, {'error': 'Add buyer confirmation that the meeting occurred before marking it completed.'})
                        return
                    target_req['status'] = 'call_completed'
                    target_req['meetingEvidence'] = evidence
                    target_req['meetingConfirmedAt'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
                else:
                    json_response(self, 409, {'error': 'This status transition is not allowed. The Influencer must accept and schedule before completion.'})
                    return

                if target_req['status'] in ('influencer_accepted', 'call_scheduled'):
                    target_req['creditsAwarded'] = 0
                elif target_req['status'] == 'call_completed':
                    target_req['creditsAwarded'] = 0
                target_req['updatedAt'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())

                if target_contact and target_req['status'] in ('influencer_accepted', 'call_scheduled', 'call_completed'):
                    target_contact['hasScheduledCall'] = True
                    if target_req['status'] == 'call_completed':
                        target_contact['hasTakenCall'] = True
                    if influencer:
                        sync_influencer_referral_ledger(influencer, target_contact)

                write_workbook_state(state)
                json_response(self, 200, {'status': 'updated', 'request': target_req,
                    'rewardEvent': event if next_status == 'award_milestone' else None,
                    'rewardPoints': reward_points_for_influencer(state, target_req.get('influencerId'))})
            except Exception as ex:
                json_response(self, 500, {'error': f'Marketplace request update failed: {ex}'})
            return

        if self.path == '/api/irm/rewards/redemptions/manage':
            if os.environ.get('VERCEL') or not is_irm_admin_request(self) or not request_origin_is_trusted(self):
                json_response(self, 403, {'error': 'Only the IRM administrator can manage reward redemptions.'})
                return
            try:
                state = read_workbook_state()
                item = next((r for r in (state.get('rewardRedemptions') or []) if isinstance(r, dict) and str(r.get('id')) == str(payload.get('redemptionId') or '')), None)
                if not item:
                    json_response(self, 404, {'error': 'Reward redemption not found.'})
                    return
                action = str(payload.get('action') or '').strip().lower()
                status_by_action = {'approve': 'approved', 'fulfill': 'fulfilled', 'reject': 'rejected'}
                if action not in status_by_action:
                    json_response(self, 400, {'error': 'Choose approve, fulfill, or reject.'})
                    return
                if action == 'approve' and item.get('status') != 'requested':
                    json_response(self, 409, {'error': 'Only requested redemptions can be approved.'})
                    return
                if action == 'fulfill' and item.get('status') != 'approved':
                    json_response(self, 409, {'error': 'Approve the redemption before confirming fulfillment.'})
                    return
                if action == 'reject' and item.get('status') not in ('requested', 'approved'):
                    json_response(self, 409, {'error': 'This redemption can no longer be rejected.'})
                    return
                item['status'] = status_by_action[action]
                item['updatedAt'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
                item.setdefault('history', []).append({'action': action, 'by': 'irm_admin', 'at': item['updatedAt'], 'note': str(payload.get('note') or '').strip()})
                write_workbook_state(state)
                json_response(self, 200, {'status': item['status'], 'redemption': item})
            except Exception as ex:
                json_response(self, 500, {'error': f'Reward redemption update failed: {ex}'})
            return

        if self.path in ('/api/influencers/create', '/api/influencers/update', '/api/influencers/delete', '/api/influencers/bulk-create', '/api/influencers/convert', '/api/influencers/agreements'):
            if os.environ.get('VERCEL') or not is_irm_admin_request(self) or not request_origin_is_trusted(self):
                json_response(self, 403, {'error': 'Influencer management is available to the local app owner only.'})
                return
            try:
                state = read_workbook_state()
                contacts = state.setdefault('contacts', [])
                influencer_id = str(payload.get('influencerId') or payload.get('contactId') or '')
                influencer = next((c for c in contacts if c.get('isInfluencer') and str(c.get('id')) == influencer_id), None)

                if self.path.endswith('/bulk-create'):
                    rows = payload.get('influencers') or payload.get('contacts') or []
                    if not isinstance(rows, list) or not rows:
                        json_response(self, 400, {'error': 'Provide at least one influencer row.'})
                        return
                    created_list = []
                    updated_list = []
                    skipped = 0
                    next_id = max([int(c.get('id') or 0) for c in contacts] + [1000]) + 1
                    for row in rows[:500]:
                        if not isinstance(row, dict):
                            skipped += 1
                            continue
                        name = str(row.get('fullName') or '').strip()
                        email = str(row.get('email') or '').strip().lower()
                        if not name or not email or not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', email):
                            skipped += 1
                            continue
                        existing = next((c for c in contacts if str(c.get('email') or '').strip().lower() == email), None)
                        if existing:
                            existing['isInfluencer'] = True
                            if row.get('company'):
                                existing['company'] = str(row.get('company')).strip()
                            if row.get('jobTitle'):
                                existing['jobTitle'] = str(row.get('jobTitle')).strip()
                            if row.get('phone'):
                                existing['phone'] = str(row.get('phone')).strip()
                            if row.get('linkedinUrl'):
                                existing['linkedinUrl'] = normalize_linkedin_url(row.get('linkedinUrl'))
                            existing.setdefault('agreements', [])
                            existing.setdefault('referrals', [])
                            existing.setdefault('referralCredits', 0)
                            updated_list.append(existing)
                        else:
                            parts = name.split()
                            new_inf = {
                                'id': next_id,
                                'firstName': parts[0] if parts else name,
                                'lastName': ' '.join(parts[1:]),
                                'fullName': name,
                                'email': email,
                                'company': str(row.get('company') or '').strip(),
                                'jobTitle': str(row.get('jobTitle') or '').strip(),
                                'phone': str(row.get('phone') or '').strip(),
                                'location': str(row.get('location') or '').strip(),
                                'linkedinUrl': normalize_linkedin_url(row.get('linkedinUrl') or ''),
                                'isInfluencer': True,
                                'referralCredits': 0,
                                'referrals': [],
                                'agreements': row.get('agreements') if isinstance(row.get('agreements'), list) else [],
                                'sourceFile': 'Bulk Influencer Onboarding'
                            }
                            next_id += 1
                            contacts.append(new_inf)
                            created_list.append(new_inf)
                    write_workbook_state(state)
                    json_response(self, 200, {
                        'status': 'bulk_created',
                        'created': len(created_list),
                        'converted': len(updated_list),
                        'skipped': skipped,
                        'influencers': created_list + updated_list
                    })
                    return

                if self.path.endswith('/convert'):
                    target = next((c for c in contacts if str(c.get('id')) == influencer_id or (payload.get('email') and str(c.get('email') or '').lower() == str(payload.get('email')).strip().lower())), None)
                    if not target:
                        json_response(self, 404, {'error': 'Contact not found to convert.'})
                        return
                    target['isInfluencer'] = True
                    if payload.get('linkedinUrl'):
                        target['linkedinUrl'] = normalize_linkedin_url(payload.get('linkedinUrl'))
                    target.setdefault('referrals', [])
                    target.setdefault('referralCredits', int(target.get('referralCredits') or 0))
                    target.setdefault('agreements', [])
                    if isinstance(payload.get('agreement'), dict) and payload['agreement'].get('name'):
                        target['agreements'].insert(0, payload['agreement'])
                    write_workbook_state(state)
                    json_response(self, 200, {'status': 'converted', 'influencer': target})
                    return

                if self.path.endswith('/agreements'):
                    if not influencer:
                        json_response(self, 404, {'error': 'Influencer profile not found.'})
                        return
                    agreements = influencer.setdefault('agreements', [])
                    action = str(payload.get('action') or 'add').lower()
                    if action == 'delete':
                        agr_id = str(payload.get('agreementId') or '')
                        influencer['agreements'] = [a for a in agreements if str(a.get('id')) != agr_id]
                    else:
                        agr = payload.get('agreement') or {}
                        agr_name = str(agr.get('name') or '').strip()
                        if not agr_name:
                            json_response(self, 400, {'error': 'Agreement file name is required.'})
                            return
                        agr_entry = {
                            'id': str(agr.get('id') or f"agr_{int(time.time() * 1000)}"),
                            'name': agr_name,
                            'type': str(agr.get('type') or 'Signed Partner Agreement'),
                            'status': str(agr.get('status') or 'Signed'),
                            'size': int(agr.get('size') or 0),
                            'uploadedAt': str(agr.get('uploadedAt') or time.strftime('%Y-%m-%d', time.gmtime())),
                            'notes': str(agr.get('notes') or ''),
                            'dataUrl': str(agr.get('dataUrl') or '')
                        }
                        agreements.insert(0, agr_entry)
                    write_workbook_state(state)
                    json_response(self, 200, {'status': 'saved', 'agreements': influencer['agreements'], 'influencer': influencer})
                    return

                if self.path.endswith('/create'):
                    profile = payload.get('profile') or payload or {}
                    name = str(profile.get('fullName') or payload.get('fullName') or '').strip()
                    email = str(profile.get('email') or payload.get('email') or '').strip().lower()
                    password = str(profile.get('password') or profile.get('defaultPassword') or payload.get('password') or payload.get('defaultPassword') or '').strip()
                    if not name or not email:
                        json_response(self, 400, {'error': 'Partner name and email are required.'})
                        return
                    if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', email):
                        json_response(self, 400, {'error': 'Enter a valid partner email address.'})
                        return
                    if len(password) < 12:
                        json_response(self, 400, {'error': 'Partner provisioning password must be at least 12 characters long.'})
                        return

                    existing_contact = next((c for c in contacts if str(c.get('email') or '').strip().lower() == email), None)
                    if existing_contact:
                        if existing_contact.get('isInfluencer'):
                            json_response(self, 409, {'error': 'An influencer partner already uses this email.'})
                            return
                        # Convert existing generic contact to Influencer seamlessly
                        existing_contact['isInfluencer'] = True
                        existing_contact['fullName'] = name
                        existing_contact['company'] = str(profile.get('company') or existing_contact.get('company') or '').strip()
                        existing_contact['jobTitle'] = str(profile.get('jobTitle') or existing_contact.get('jobTitle') or '').strip()
                        existing_contact['phone'] = str(profile.get('phone') or existing_contact.get('phone') or '').strip()
                        existing_contact['location'] = str(profile.get('location') or existing_contact.get('location') or '').strip()
                        set_partner_password(existing_contact, password)
                        existing_contact['mustChangePassword'] = True
                        existing_contact['passwordChanged'] = False
                        if profile.get('linkedinUrl'):
                            existing_contact['linkedinUrl'] = normalize_linkedin_url(profile.get('linkedinUrl'))
                        existing_contact.setdefault('agreements', profile.get('agreements') if isinstance(profile.get('agreements'), list) else [])
                        existing_contact.setdefault('referrals', [])
                        existing_contact.setdefault('referralCredits', 0)
                        write_workbook_state(state)
                        json_response(self, 201, {'status': 'created', 'success': True, 'influencer': public_partner_profile(existing_contact)})
                        return
                    parts = name.split()
                    new_partner = {
                        'id': max([int(c.get('id') or 0) for c in contacts] + [1000]) + 1,
                        'firstName': parts[0], 'lastName': ' '.join(parts[1:]), 'fullName': name,
                        'email': email, 'company': str(profile.get('company') or '').strip(),
                        'jobTitle': str(profile.get('jobTitle') or '').strip(), 'phone': str(profile.get('phone') or '').strip(),
                        'location': str(profile.get('location') or '').strip(),
                        'linkedinUrl': normalize_linkedin_url(profile.get('linkedinUrl') or ''),
                        'isInfluencer': True,
                        'passwordHash': hash_portal_password(password),
                        'mustChangePassword': True,
                        'passwordChanged': False,
                        'referralCredits': 0, 'referrals': [],
                        'agreements': profile.get('agreements') if isinstance(profile.get('agreements'), list) else [],
                        'sourceFile': 'Manual partner entry'
                    }
                    contacts.append(new_partner)
                    write_workbook_state(state)
                    json_response(self, 201, {'status': 'created', 'success': True, 'influencer': public_partner_profile(new_partner)})
                    return
                if not influencer:
                    json_response(self, 404, {'error': 'Influencer profile not found.'})
                    return
                if self.path.endswith('/delete'):
                    retained_contacts = 0
                    for contact in contacts:
                        linked = str(contact.get('influencerId') or '') == influencer_id or str(contact.get('influencerEmail') or '').lower() == str(influencer.get('email') or '').lower() or str(contact.get('referredBy') or '').lower() == str(influencer.get('fullName') or '').lower()
                        if linked and not contact.get('isInfluencer'):
                            retained_contacts += 1
                            contact['influencerId'] = None
                            contact['influencerEmail'] = ''
                            contact['referredBy'] = ''
                            contact['referredByEmail'] = ''
                            contact['sourceFile'] = 'Unassigned after partner removal'
                    contacts.remove(influencer)
                    revoke_partner_share_records_for_influencer(influencer_id, time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()))
                    write_workbook_state(state)
                    json_response(self, 200, {'status': 'deleted', 'retainedContacts': retained_contacts})
                    return

                profile = payload.get('profile') or {}
                previous_name = str(influencer.get('fullName') or '').lower()
                previous_email = str(influencer.get('email') or '').lower()
                next_email = str(profile.get('email') or influencer.get('email') or '').strip().lower()
                if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', next_email):
                    json_response(self, 400, {'error': 'Enter a valid partner email address.'})
                    return
                if any(c is not influencer and str(c.get('email') or '').strip().lower() == next_email for c in contacts):
                    json_response(self, 409, {'error': 'A contact already uses this email.'})
                    return
                full_name = str(profile.get('fullName') or influencer.get('fullName') or '').strip()
                parts = full_name.split()
                influencer.update({
                    'fullName': full_name, 'firstName': parts[0] if parts else '', 'lastName': ' '.join(parts[1:]),
                    'email': next_email, 'company': str(profile.get('company') or '').strip(),
                    'jobTitle': str(profile.get('jobTitle') or '').strip(), 'phone': str(profile.get('phone') or '').strip(),
                    'location': str(profile.get('location') or '').strip()
                })
                if 'linkedinUrl' in profile:
                    influencer['linkedinUrl'] = normalize_linkedin_url(profile.get('linkedinUrl'))
                if isinstance(profile.get('agreements'), list):
                    influencer['agreements'] = profile['agreements']
                for contact in contacts:
                    if str(contact.get('influencerId') or '') == influencer_id or str(contact.get('influencerEmail') or '').lower() == previous_email or str(contact.get('referredBy') or '').lower() == previous_name:
                        contact['influencerId'] = influencer.get('id')
                        contact['influencerEmail'] = next_email
                        contact['referredBy'] = full_name
                        contact['referredByEmail'] = next_email
                write_workbook_state(state)
                json_response(self, 200, {'status': 'updated', 'influencer': influencer})
            except Exception as ex:
                json_response(self, 500, {'error': f'Influencer operation failed: {ex}'})
            return

        if self.path in ('/api/influencers/contacts/import', '/api/influencers/contacts/bulk-save', '/api/influencers/contacts/update', '/api/influencers/contacts/delete'):
            if os.environ.get('VERCEL') or not is_irm_admin_request(self) or not request_origin_is_trusted(self):
                json_response(self, 403, {'error': 'Contact management is available to the local app owner only.'})
                return
            try:
                state = read_workbook_state()
                influencer_id = str(payload.get('influencerId') or '')
                influencer = next((c for c in state.get('contacts', []) if c.get('isInfluencer') and str(c.get('id')) == influencer_id), None)
                if not influencer:
                    json_response(self, 404, {'error': 'Influencer profile not found.'})
                    return
                contacts = state.setdefault('contacts', [])
                if self.path.endswith('/import') or self.path.endswith('/bulk-save'):
                    rows = payload.get('contacts') or []
                    if not isinstance(rows, list) or len(rows) > 1000:
                        json_response(self, 400, {'error': 'Import or save up to 1,000 contacts at a time.'})
                        return
                    source_label = 'Bulk Editor' if self.path.endswith('/bulk-save') else 'CSV Import'
                    summary = apply_partner_bulk_records(state, influencer, rows, source=source_label, allow_internal_notes=True)
                    if summary['created'] or summary['updated'] or summary['linked']:
                        write_workbook_state(state)
                    json_response(self, 200, summary)
                    return

                contact_id = str(payload.get('contactId') or '')
                contact = next((c for c in contacts if str(c.get('id')) == contact_id and not c.get('isInfluencer')), None)
                linked_contact = bool(contact and (
                    str(contact.get('influencerId') or '') == influencer_id
                    or str(contact.get('influencerEmail') or '').lower() == str(influencer.get('email') or '').lower()
                    or str(contact.get('referredBy') or '').lower() == str(influencer.get('fullName') or '').lower()
                ))
                if not linked_contact:
                    json_response(self, 404, {'error': 'Referred contact not found under this partner.'})
                    return

                if self.path.endswith('/delete'):
                    state['contacts'] = [c for c in contacts if str(c.get('id')) != contact_id]
                    referrals = influencer.get('referrals') or []
                    removed_referrals = [r for r in referrals if str(r.get('id')) == contact_id or str(r.get('contactId')) == contact_id or str(r.get('email') or '').lower() == str(contact.get('email') or '').lower()]
                    influencer['referrals'] = [r for r in referrals if r not in removed_referrals]
                    influencer['referralCredits'] = max(0, int(influencer.get('referralCredits') or 0) - sum(int(r.get('credits') or 0) for r in removed_referrals))
                    write_workbook_state(state)
                    json_response(self, 200, {'status': 'deleted'})
                    return

                changes = payload.get('contact') or {}
                next_email = str(changes.get('email') or contact.get('email') or '').strip().lower()
                duplicate = next((c for c in contacts if c is not contact and str(c.get('email') or '').strip().lower() == next_email), None)
                if duplicate:
                    json_response(self, 409, {'error': 'Another contact already uses this email.'})
                    return
                name = str(changes.get('fullName') or contact.get('fullName') or '').strip()
                parts = name.split()
                contact.update({
                    'fullName': name,
                    'firstName': parts[0] if parts else '',
                    'lastName': ' '.join(parts[1:]),
                    'email': next_email,
                    'company': str(changes.get('company') or '').strip(),
                    'jobTitle': str(changes.get('jobTitle') or '').strip(),
                    'phone': str(changes.get('phone') or '').strip(),
                    'location': str(changes.get('location') or '').strip(),
                    'portalNotes': str(changes.get('portalNotes') or '').strip(),
                    'influencerId': influencer.get('id'),
                    'influencerEmail': influencer.get('email'),
                    'referredBy': influencer.get('fullName'),
                    'referredByEmail': influencer.get('email')
                })
                if 'linkedinUrl' in changes:
                    contact['linkedinUrl'] = normalize_linkedin_url(changes.get('linkedinUrl'))
                if 'hasScheduledCall' in changes:
                    contact['hasScheduledCall'] = bool(changes.get('hasScheduledCall'))
                if 'hasTakenCall' in changes:
                    contact['hasTakenCall'] = bool(changes.get('hasTakenCall'))
                    if contact['hasTakenCall']:
                        contact['hasScheduledCall'] = True
                for referral in (influencer.get('referrals') or []):
                    if str(referral.get('id')) == contact_id or str(referral.get('email') or '').lower() == next_email:
                        referral.update({key: contact.get(key) for key in ('fullName', 'email', 'company', 'jobTitle', 'phone', 'linkedinUrl', 'hasScheduledCall', 'hasTakenCall')})
                        referral['credits'] = compute_contact_referral_credits(contact)
                write_workbook_state(state)
                json_response(self, 200, {'status': 'updated', 'contact': partner_safe_contact(contact)})
            except Exception as ex:
                json_response(self, 500, {'error': f'Contact operation failed: {ex}'})
            return

        if self.path == '/api/db/search':
            if not is_irm_admin_request(self):
                json_response(self, 403, {'error': 'Database search is available only from the local console.'})
                return
            try:
                query_text = str(payload.get('query') or '')
                filters = payload.get('filters') or {}
                result = search_database_nl(query_text, filters)
                json_response(self, 200, result)
            except Exception as ex:
                json_response(self, 500, {'error': f'Database search failed: {ex}'})
            return

        if self.path == '/api/db/seed':
            if not is_irm_admin_request(self):
                json_response(self, 403, {'error': 'Database seeding is available only from the local console.'})
                return
            try:
                state = seed_synthetic_database(force=True)
                json_response(self, 200, {
                    'status': 'seeded',
                    'totalContacts': len(state.get('contacts') or []),
                    'influencers': sum(1 for c in (state.get('contacts') or []) if c.get('isInfluencer')),
                    'prospects': sum(1 for c in (state.get('contacts') or []) if not c.get('isInfluencer')),
                    'state': state
                })
            except Exception as ex:
                json_response(self, 500, {'error': f'Synthetic seed failed: {ex}'})
            return

        if self.path == '/api/portal/referrals':
            if os.environ.get('VERCEL') or not is_irm_admin_request(self):
                json_response(self, 403, {'error': 'Use the local console to manage contacts, or a scoped partner link to submit referrals.'})
                return
            try:
                state = read_workbook_state()
                contacts = state.get('contacts') or []
                inf_email = str(payload.get('influencerEmail') or '').strip().lower()
                inf_id = payload.get('influencerId')
                name = str(payload.get('fullName') or '').strip()
                title = str(payload.get('jobTitle') or 'Decision Maker').strip()
                company = str(payload.get('company') or 'Credit Union').strip()
                email = str(payload.get('email') or '').strip().lower()
                phone = str(payload.get('phone') or '').strip()
                linkedin_url = normalize_linkedin_url(payload.get('linkedinUrl') or '')
                location = str(payload.get('location') or '').strip()
                notes = str(payload.get('notes') or '').strip()
                has_scheduled_call = bool(payload.get('hasScheduledCall'))
                has_taken_call = bool(payload.get('hasTakenCall'))
                if has_taken_call:
                    has_scheduled_call = True
                credits = compute_contact_referral_credits({'hasScheduledCall': has_scheduled_call, 'hasTakenCall': has_taken_call})

                if not name or not email:
                    json_response(self, 400, {'error': 'Referral Full Name and Email are required.'})
                    return

                duplicate = next((c for c in contacts if str(c.get('email') or '').strip().lower() == email), None)
                if duplicate:
                    json_response(self, 409, {'error': f"A contact with this email already exists: {duplicate.get('fullName') or email}."})
                    return

                influencer = next((c for c in contacts if (inf_id and str(c.get('id')) == str(inf_id)) or (inf_email and str(c.get('email') or '').lower() == inf_email)), None)
                if not influencer:
                    influencer = next((c for c in contacts if c.get('isInfluencer') is True), None)
                if not influencer:
                    json_response(self, 404, {'error': 'Influencer profile not found.'})
                    return

                new_id = max([int(c.get('id') or 0) for c in contacts] + [1000]) + 1
                parts = name.split()
                first_name = parts[0] if parts else name
                last_name = ' '.join(parts[1:]) if len(parts) > 1 else ''

                calls_made = []
                if has_scheduled_call:
                    calls_made.append({
                        'date': time.strftime('%Y-%m-%d %H:%M:%S', time.gmtime()),
                        'outcome': 'Call scheduled via partner referral',
                        'status': 'scheduled'
                    })

                new_contact = {
                    'id': new_id,
                    'firstName': first_name,
                    'lastName': last_name,
                    'fullName': name,
                    'email': email,
                    'jobTitle': title,
                    'company': company,
                    'phone': phone,
                    'location': location,
                    'linkedinUrl': linkedin_url,
                    'industry': 'Credit Union',
                    'sourceFile': f"Referred by {influencer.get('fullName')} (Influencer Portal)",
                    'assetSize': '$1B - $2.5B',
                    'state': influencer.get('state') or 'NY',
                    'attendedDinner': '',
                    'visitedBooth': '',
                    'enriched': True,
                    'enrichmentStatus': 'verified_provider_data',
                    'matchPercentage': 95,
                    'leadTemp': 'Hot Lead',
                    'emailsSent': False,
                    'linkedinSent': False,
                    'callsMade': calls_made,
                    'hasScheduledCall': has_scheduled_call,
                    'hasTakenCall': has_taken_call,
                    'isInfluencer': False,
                    'referredBy': influencer.get('fullName'),
                    'influencerId': influencer.get('id'),
                    'influencerEmail': influencer.get('email'),
                    'portalNotes': notes
                }
                contacts.append(new_contact)

                if not isinstance(influencer.get('referrals'), list):
                    influencer['referrals'] = []
                ref_entry = {
                    'id': new_id,
                    'fullName': name,
                    'jobTitle': title,
                    'company': company,
                    'email': email,
                    'phone': phone,
                    'linkedinUrl': linkedin_url,
                    'credits': credits,
                    'hasScheduledCall': has_scheduled_call,
                    'hasTakenCall': has_taken_call,
                    'callOutcome': calls_made[0]['outcome'] if has_taken_call and calls_made else ('Scheduled briefing' if has_scheduled_call else 'Warm Portal Intro'),
                    'leadTemp': 'Hot Lead',
                    'notes': notes,
                    'date': time.strftime('%Y-%m-%d', time.gmtime())
                }
                influencer['referrals'].insert(0, ref_entry)
                influencer['referralCredits'] = int(influencer.get('referralCredits') or 0) + credits

                if has_scheduled_call:
                    state.setdefault('meetings', []).insert(0, {
                        'id': f'meet-{new_id}',
                        'contactId': new_id,
                        'contactName': name,
                        'contactTitle': title,
                        'contactCompany': company,
                        'contactEmail': email,
                        'contactPhone': phone,
                        'platform': 'Google Meet',
                        'meetingUrl': f'https://meet.google.com/gtm-{new_id}-portal',
                        'timeString': 'Next Tuesday at 02:00 PM (EST)',
                        'influencerName': influencer.get('fullName'),
                        'influencerId': influencer.get('id'),
                        'influencerCredits': credits,
                        'status': 'Call Taken & Follow-up Scheduled' if has_taken_call else 'Call Scheduled',
                        'notes': notes or f"Direct browser referral from {influencer.get('fullName')}.",
                        'datetimeRaw': time.strftime('%Y-%m-%dT14:00:00.000Z', time.gmtime())
                    })

                sync_relational_tables_from_state(state)
                json_response(self, 200, {
                    'status': 'created',
                    'contact': new_contact,
                    'referral': ref_entry,
                    'influencer': {
                        'id': influencer.get('id'),
                        'fullName': influencer.get('fullName'),
                        'email': influencer.get('email'),
                        'referralCredits': influencer.get('referralCredits'),
                        'totalReferrals': len(influencer.get('referrals') or [])
                    }
                })
            except Exception as ex:
                json_response(self, 500, {'error': f'Could not add portal referral: {ex}'})
            return

        if self.path.startswith('/api/google/'):
            session = self._google_session()
            if not session:
                json_response(self, 401, {'error': 'Connect a Google Workspace account first.'})
                return
            try:
                if self.path == '/api/google/gmail/draft':
                    result = gmail_request(session, 'drafts', payload, send=False)
                elif self.path == '/api/google/gmail/send':
                    guardrail_error = check_send_guardrails(payload)
                    if guardrail_error:
                        json_response(self, 409, {'error': guardrail_error})
                        return
                    result = gmail_request(session, 'messages/send', payload, send=True)
                    record_sent_email(payload, result.get('id'))
                elif self.path == '/api/google/calendar/freebusy':
                    result = google_api('POST', 'https://www.googleapis.com/calendar/v3/freeBusy', session['access_token'], payload)[1]
                elif self.path == '/api/google/calendar/events':
                    result = google_api('POST', 'https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1', session['access_token'], payload)[1]
                elif self.path == '/api/google/gmail/replies':
                    result = gmail_replies(session, payload)
                else:
                    json_response(self, 404, {'error': 'Unknown Google API route.'})
                    return
                json_response(self, 200, result)
            except urllib.error.HTTPError as ex:
                detail = ex.read().decode('utf-8', errors='replace')
                json_response(self, ex.code, {'error': detail})
            except Exception as ex:
                json_response(self, 502, {'error': f'Google API request failed: {ex}'})
            return

        if self.path == '/api/linkedin/verify':
            access_token = str(payload.get('accessToken') or '').strip()
            if not access_token:
                json_response(self, 400, {'error': 'A LinkedIn OAuth access token is required.'})
                return
            try:
                profile = linkedin_userinfo(access_token)
                with db() as connection:
                    connection.execute(
                        'INSERT INTO linkedin_connections(id, session_id, member_id, name, email, access_token, mode, updated_at) VALUES(1, ?, ?, ?, ?, ?, ?, ?) '
                        'ON CONFLICT(id) DO UPDATE SET member_id=excluded.member_id, name=excluded.name, email=excluded.email, access_token=excluded.access_token, mode=excluded.mode, updated_at=excluded.updated_at',
                        ('default', profile.get('sub') or 'urn:li:person:demo', profile.get('name') or 'LinkedIn Member', profile.get('email') or '', encrypt_token(access_token), profile.get('mode') or 'live', time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()))
                    )
                json_response(self, 200, {
                    'status': 'verified',
                    'name': profile.get('name') or profile.get('given_name') or 'LinkedIn member',
                    'email': profile.get('email'),
                    'subject': profile.get('sub'),
                    'mode': profile.get('mode') or 'live'
                })
            except urllib.error.HTTPError as ex:
                detail = ex.read().decode('utf-8', errors='replace')
                json_response(self, ex.code, {'error': detail or 'LinkedIn rejected the access token.'})
            except Exception as ex:
                json_response(self, 502, {'error': f'LinkedIn connection failed: {ex}'})
            return

        if self.path == '/api/linkedin/send':
            recipient_name = str(payload.get('recipientName') or payload.get('toName') or 'Contact').strip()
            recipient_email = str(payload.get('recipientEmail') or payload.get('toEmail') or '').strip()
            linkedin_url = normalize_linkedin_url(payload.get('linkedinUrl') or '')
            message = str(payload.get('message') or payload.get('note') or '').strip()
            access_token = str(payload.get('accessToken') or os.environ.get('LINKEDIN_ACCESS_TOKEN') or '').strip()

            if not message:
                json_response(self, 400, {'error': 'A LinkedIn message or connection note is required.'})
                return

            if not is_valid_linkedin_profile_url(linkedin_url):
                json_response(self, 400, {
                    'error': f"Cannot send LinkedIn outreach to {recipient_name}: a valid recipient LinkedIn Profile URL (e.g. https://www.linkedin.com/in/username) is required. Add their LinkedIn URL first."
                })
                return

            provider_id = f'li_msg_{int(time.time() * 1000)}_{random.randint(100, 999)}'
            mode = 'profile_handoff'

            if access_token and not (access_token.startswith('demo_') or access_token.startswith('li_demo') or access_token == 'investor_demo' or access_token.startswith('linkedin_oauth_token_')):
                try:
                    profile = linkedin_userinfo(access_token)
                    author_urn = profile.get('sub')
                    if author_urn and not str(author_urn).startswith('urn:li:'):
                        author_urn = f'urn:li:person:{author_urn}'
                    mode = 'live_verified_handoff'
                except Exception:
                    mode = 'profile_handoff'

            with db() as connection:
                connection.execute(
                    'INSERT INTO sent_linkedin(recipient_name, recipient_email, linkedin_url, message, provider_id, mode, sent_at) VALUES(?, ?, ?, ?, ?, ?, ?)',
                    (recipient_name, recipient_email, linkedin_url, message, provider_id, mode, time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()))
                )

            json_response(self, 200, {
                'status': 'sent',
                'provider': 'linkedin_profile_outreach',
                'id': provider_id,
                'mode': mode,
                'recipientName': recipient_name,
                'linkedinUrl': linkedin_url,
                'profileActionUrl': linkedin_url,
                'sentAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
            })
            return

        if self.path == '/api/state':
            if os.environ.get('VERCEL'):
                json_response(self, 503, {'error': 'Durable state storage is unavailable in the current serverless deployment.'})
                return
            if not is_irm_admin_request(self):
                status = 503 if str(os.environ.get('CLERK_BACKEND_AUTH_REQUIRED') or '').lower() == 'true' and not os.environ.get('CLERK_ISSUER') else 403
                json_response(self, status, {'error': 'Valid IRM administrator authentication is required.'})
                return
            state_obj = payload.get('state', {})
            sync_relational_tables_from_state(state_obj)
            json_response(self, 200, {'status': 'saved'})
            return

        if self.path == '/api/workbook/state' or self.path == '/api/db/state':
            if self.path == '/api/db/state' and os.environ.get('VERCEL'):
                json_response(self, 503, {'error': 'Durable database storage is unavailable in the current serverless deployment.'})
                return
            if self.path == '/api/workbook/state' and str(os.environ.get('HOSTED_API_ONLY') or '').lower() == 'true' and not firestore_enabled():
                json_response(self, 503, {'error': 'Cloud persistence is disabled. Set FIREBASE_USE_FIRESTORE=true and configure the Vercel workload identity connection.'})
                return
            if not is_irm_admin_request(self):
                status = 503 if str(os.environ.get('CLERK_BACKEND_AUTH_REQUIRED') or '').lower() == 'true' and not os.environ.get('CLERK_ISSUER') else 403
                json_response(self, status, {'error': 'Valid IRM administrator authentication is required.'})
                return
            try:
                state_obj = payload.get('state', {})
                if not isinstance(state_obj, dict):
                    json_response(self, 400, {'error': 'state must be an object.'})
                    return
                if firestore_enabled():
                    write_workbook_state(state_obj)
                else:
                    sync_relational_tables_from_state(state_obj)
                    write_workbook_state(state_obj)
                json_response(self, 200, {'status': 'saved', 'database': 'firestore' if firestore_enabled() else 'sqlite3', 'savedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())})
            except FirebaseStateConflict as ex:
                json_response(self, 409, {'error': str(ex), 'reloadRequired': True})
            except FirebaseBackendUnavailable as ex:
                json_response(self, 503, {'error': str(ex)})
            except Exception as ex:
                json_response(self, 500, {'error': f'Could not save the database: {ex}'})
            return

        # AI enrichment stays server-side so provider credentials never reach the browser.
        if self.path == '/api/ai/enrich':
            api_key = os.environ.get('OPENAI_API_KEY')
            if not api_key:
                json_response(self, 503, {'error': 'OPENAI_API_KEY is not configured on the server.'})
                return
            contacts = payload.get('contacts', [])
            if not isinstance(contacts, list) or not contacts:
                json_response(self, 400, {'error': 'At least one contact is required.'})
                return
            prompt = {
                'contacts': contacts[:10],
                'requested_fields': payload.get('fields') or ['professional_summary', 'seniority', 'department', 'likely_pain_points', 'buying_signals', 'personalization_angles', 'relevant_topics', 'data_gaps', 'confidence'],
                'instructions': (
                    'Return one profile per input contact using requested_fields. Use only supplied facts '
                    'and cautious inferences. Never invent phone numbers, emails, URLs, employers, events, or '
                    'specific claims. Mark inferred values and leave unknown fields empty. Return JSON only.'
                )
            }
            try:
                _, result = post_json(
                    'https://api.openai.com/v1/chat/completions',
                    {'model': 'gpt-4o-mini', 'temperature': 0.2, 'response_format': {'type': 'json_object'},
                     'messages': [{'role': 'system', 'content': 'You are a careful B2B research assistant.'},
                                  {'role': 'user', 'content': json.dumps(prompt)}]},
                    {'Authorization': f'Bearer {api_key}'}
                )
                content = result['choices'][0]['message']['content']
                parsed = json.loads(content)
                profiles = parsed.get('profiles', parsed.get('results', parsed if isinstance(parsed, list) else []))
                json_response(self, 200, {'profiles': profiles, 'provider': 'openai'})
            except Exception as ex:
                json_response(self, 502, {'error': f'AI enrichment failed: {ex}'})
            return

        # Transactional outbound over HTTPS; supports live Resend API or Investor Demo dispatch.
        if self.path == '/api/email/send':
            api_key = os.environ.get('RESEND_API_KEY')
            sender = os.environ.get('RESEND_FROM_EMAIL', 'gtm-agent@gtmconsole.io')
            recipient = payload.get('to')
            subject = payload.get('subject')
            body = payload.get('body')
            hosted_mode = str(os.environ.get('HOSTED_API_ONLY') or '').lower() == 'true'
            demo_fallback = False if hosted_mode else payload.get('demoFallback', True)
            if not recipient or not subject or not body:
                json_response(self, 400, {'error': 'to, subject, and body are required.'})
                return
            if not api_key:
                if demo_fallback:
                    msg_id = f'email_msg_{int(time.time() * 1000)}_{random.randint(100, 999)}'
                    record_sent_email({'to': recipient, 'subject': subject, 'body': body}, msg_id)
                    json_response(self, 200, {'provider': 'gtm_operational_mailer', 'id': msg_id, 'status': 'sent', 'mode': 'demo'})
                    return
                json_response(self, 503, {'error': 'RESEND_API_KEY and RESEND_FROM_EMAIL must be configured.'})
                return
            try:
                status, result = post_json(
                    'https://api.resend.com/emails',
                    {'from': sender, 'to': [recipient], 'subject': subject, 'text': body},
                    {'Authorization': f'Bearer {api_key}'}
                )
                record_sent_email({'to': recipient, 'subject': subject, 'body': body}, result.get('id'))
                json_response(self, status, {'provider': 'resend', 'id': result.get('id'), 'status': 'sent'})
            except urllib.error.HTTPError as ex:
                detail = ex.read().decode('utf-8', errors='replace')
                json_response(self, ex.code, {'error': f'Email provider rejected the request: {detail}'})
            except Exception as ex:
                json_response(self, 502, {'error': f'Email send failed: {ex}'})
            return

        # Lemlist live sending is intentionally unavailable until a real provider
        # connection and server-side credential handling are implemented.
        if self.path == '/api/lemlist/send-test':
            json_response(self, 501, {'error': 'Lemlist live sending is not configured in this build.'})

        # Intercept and proxy requests destined for Explorium API
        elif self.path.startswith('/api/proxy/'):
            target_path = self.path[len('/api/proxy/'):]
            target_url = f"https://api.explorium.ai/{target_path}"
            
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            
            headers = {}
            for k, v in self.headers.items():
                if k.lower() not in ('host', 'api_key'):
                    headers[k] = v
            headers['Host'] = 'api.explorium.ai'
            if os.environ.get('EXPLORIUM_API_KEY'):
                headers['api_key'] = os.environ['EXPLORIUM_API_KEY']
            
            req = urllib.request.Request(target_url, data=post_data, headers=headers, method='POST')
            try:
                with safe_urlopen(req, timeout=30) as response:
                    res_data = response.read()
                    self.send_response(response.status)
                    self.send_header('Content-Type', response.headers.get('Content-Type', 'application/json'))
                    self.end_headers()
                    self.wfile.write(res_data)
            except urllib.error.HTTPError as e:
                res_data = e.read()
                self.send_response(e.code)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(res_data)
            except Exception as e:
                self.send_response(500)
                self.end_headers()
                self.wfile.write(json.dumps({'error': str(e)}).encode())
        else:
            json_response(self, 404, {'error': f'Route not found: POST {clean_path}'})

if __name__ == '__main__':
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    print(f"Starting Local Campaign Console static server with API proxy on port {PORT}...")
    http.server.HTTPServer.allow_reuse_address = True
    try:
        server = http.server.HTTPServer(('0.0.0.0', PORT), ProxyHTTPRequestHandler)
    except OSError as err:
        if err.errno == 48:
            print(f"\n[ERROR] Port {PORT} is already in use by another running process.")
            print(f"Run 'lsof -ti:{PORT} | xargs kill -9' in terminal to terminate the previous instance and run again.\n")
        raise
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server.")
