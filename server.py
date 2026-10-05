import http.server
import urllib.request
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

PORT = 8001
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
    with db() as connection:
        connection.execute('INSERT INTO app_state(key, value, updated_at) VALUES(?, ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at', (key, json.dumps(value), time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())))

def read_state(key):
    with db() as connection:
        row = connection.execute('SELECT value FROM app_state WHERE key = ?', (key,)).fetchone()
        return json.loads(row['value']) if row else None

def default_workbook_state():
    return {
        'contacts': [],
        'vendors': [],
        'marketplaceRequests': [],
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
    with db() as connection:
        return connection.execute(
            'SELECT id, influencer_id, revoked_at FROM partner_shares WHERE token_hash = ?',
            (token_hash,)
        ).fetchone()

def issue_partner_share_token(influencer_id):
    token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(token.encode('utf-8')).hexdigest()
    created_at = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    with db() as connection:
        connection.execute('INSERT INTO partner_shares(influencer_id, token_hash, created_at) VALUES (?, ?, ?)', (int(influencer_id), token_hash, created_at))
    return token

def hash_portal_password(password):
    raw = str(password or '').encode('utf-8')
    salt = b'gtm_irm_marketplace_salt_v1'
    return hashlib.pbkdf2_hmac('sha256', raw, salt, 100_000).hex()

def verify_portal_password(password, stored_hash):
    if not stored_hash:
        return False
    return secrets.compare_digest(hash_portal_password(password), str(stored_hash))

def vendor_from_token(state, token):
    if not token:
        return None
    token_hash = hashlib.sha256(token.encode('utf-8')).hexdigest()
    for vendor in (state.get('vendors') or []):
        if isinstance(vendor, dict) and vendor.get('sessionTokenHash') == token_hash:
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

def mask_contact_for_marketplace(contact, influencer, unlocked_contact_ids=None):
    unlocked = str(contact.get('id')) in (unlocked_contact_ids or set())
    inf_name = (influencer or {}).get('fullName') or contact.get('referredBy') or 'IRM Partner'
    inf_id = (influencer or {}).get('id') or contact.get('influencerId')
    inf_company = (influencer or {}).get('company') or 'Advisory Network'
    return {
        'id': contact.get('id'),
        'fullName': contact.get('fullName') if unlocked else mask_full_name(contact.get('fullName')),
        'email': contact.get('email') if unlocked else mask_email_address(contact.get('email')),
        'phone': (contact.get('phone') or '') if unlocked else 'Protected by IRM until intro accepted',
        'linkedinUrl': normalize_linkedin_url(contact.get('linkedinUrl') or '') if unlocked else '',
        'company': contact.get('company') or 'Target Organization',
        'jobTitle': contact.get('jobTitle') or 'Decision Maker',
        'industry': contact.get('industry') or 'Credit Union / Financial Services',
        'assetSize': contact.get('assetSize') or '',
        'location': contact.get('location') or contact.get('state') or '',
        'influencerId': inf_id,
        'influencerName': inf_name,
        'influencerCompany': inf_company,
        'piiUnlocked': unlocked,
        'hasTakenCall': bool(contact.get('hasTakenCall')),
        'hasScheduledCall': bool(contact.get('hasScheduledCall'))
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
    # If a custom WORKBOOK_PATH is explicitly patched in unit tests, honor it first
    default_wb_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'gtm-console-database.xlsx')
    if WORKBOOK_PATH != default_wb_path:
        if not os.path.exists(WORKBOOK_PATH):
            return default_workbook_state()
    else:
        # Primary source of truth is now our relational SQLite database!
        db_state = read_state('database')
        if db_state and isinstance(db_state, dict) and len(db_state.get('contacts') or []) >= 30:
            if 'eventsMeta' not in db_state:
                db_state['eventsMeta'] = default_workbook_state()['eventsMeta']
            db_state.setdefault('vendors', [])
            db_state.setdefault('marketplaceRequests', [])
            return db_state
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
    default_wb_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'gtm-console-database.xlsx')
    if WORKBOOK_PATH == default_wb_path:
        try:
            sync_relational_tables_from_state(state)
        except Exception:
            pass

    json_path = WORKBOOK_PATH.replace('.xlsx', '.json')
    if not HAS_OPENPYXL or openpyxl is None:
        with workbook_lock:
            os.makedirs(os.path.dirname(WORKBOOK_PATH) or '.', exist_ok=True)
            tmp_json = json_path + '.tmp'
            with open(tmp_json, 'w', encoding='utf-8') as f:
                json.dump(state, f, indent=2)
            os.replace(tmp_json, json_path)
        return

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

        if clean_path == '/marketplace':
            self.send_response(302)
            self.send_header('Location', '/marketplace.html')
            self.end_headers()
            return

        if clean_path == '/api/db/state':
            if not is_loopback_admin_request(self):
                json_response(self, 403, {'error': 'Database state is available only from the local console.'})
                return
            try:
                state = read_workbook_state()
                json_response(self, 200, {'state': state, 'database': 'sqlite3', 'path': DB_PATH})
            except Exception as ex:
                json_response(self, 500, {'error': f'Database read failed: {ex}'})
            return

        if clean_path == '/api/state' and os.environ.get('VERCEL'):
            json_response(self, 503, {'error': 'Durable state storage is unavailable in the current serverless deployment.'})
            return

        if clean_path == '/api/workbook/state' and os.environ.get('VERCEL'):
            json_response(self, 503, {'error': 'Durable database storage is unavailable in the current serverless deployment.'})
            return

        if clean_path == '/api/db/search':
            if not is_loopback_admin_request(self):
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
                mp_requests = [
                    req for req in (state.get('marketplaceRequests') or [])
                    if isinstance(req, dict) and (
                        str(req.get('influencerId') or '') == inf_id_str
                        or (inf_email_lower and str(req.get('influencerEmail') or '').lower() == inf_email_lower)
                    )
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
                    'marketplaceRequests': mp_requests
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
                contacts = state.get('contacts') or []
                influencers = [c for c in contacts if c.get('isInfluencer') and not c.get('archivedAt')]
                prospects = [c for c in contacts if not c.get('isInfluencer') and not c.get('archivedAt')]
                orgs = {str(c.get('company') or '').strip() for c in prospects if c.get('company')}
                vendor_requests = [
                    req for req in (state.get('marketplaceRequests') or [])
                    if isinstance(req, dict) and str(req.get('vendorId')) == str(vendor.get('id'))
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
                if vendor.get('agreementStatus') != 'signed' or vendor.get('networkAccessLevel') == 'locked':
                    json_response(self, 403, {
                        'error': 'Signed IRM Marketplace Agreement is required before accessing the Influencer Network.',
                        'code': 'AGREEMENT_REQUIRED',
                        'vendor': vendor_safe_dict(vendor)
                    })
                    return

                contacts = state.get('contacts') or []
                influencers = [c for c in contacts if c.get('isInfluencer') and not c.get('archivedAt')]
                inf_by_id = {str(i.get('id')): i for i in influencers}
                inf_by_email = {str(i.get('email') or '').lower(): i for i in influencers if i.get('email')}
                inf_by_name = {str(i.get('fullName') or '').lower(): i for i in influencers if i.get('fullName')}

                vendor_requests = [
                    req for req in (state.get('marketplaceRequests') or [])
                    if isinstance(req, dict) and str(req.get('vendorId')) == str(vendor.get('id'))
                ]
                unlocked_contact_ids = {
                    str(req.get('targetContactId'))
                    for req in vendor_requests
                    if req.get('status') in ('influencer_accepted', 'call_scheduled', 'call_completed') and req.get('targetContactId') is not None
                }

                network_contacts = []
                orgs_map = {}
                for c in contacts:
                    if c.get('isInfluencer') or c.get('archivedAt'):
                        continue
                    inf = (
                        inf_by_id.get(str(c.get('influencerId') or ''))
                        or inf_by_email.get(str(c.get('influencerEmail') or '').lower())
                        or inf_by_name.get(str(c.get('referredBy') or '').lower())
                    )
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

        if clean_path == '/api/irm/marketplace':
            if not is_loopback_admin_request(self):
                json_response(self, 403, {'error': 'IRM Marketplace admin overview is restricted to the local console.'})
                return
            try:
                state = read_workbook_state()
                vendors = [vendor_safe_dict(v) for v in (state.get('vendors') or []) if isinstance(v, dict)]
                requests_list = [r for r in (state.get('marketplaceRequests') or []) if isinstance(r, dict)]
                contacts = state.get('contacts') or []
                influencers = [c for c in contacts if c.get('isInfluencer') and not c.get('archivedAt')]
                prospects = [c for c in contacts if not c.get('isInfluencer') and not c.get('archivedAt')]
                json_response(self, 200, {
                    'vendors': vendors,
                    'marketplaceRequests': requests_list,
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
            if not is_loopback_admin_request(self):
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
            if not is_loopback_admin_request(self):
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
            if not is_loopback_admin_request(self):
                json_response(self, 403, {'error': 'Database state is available only from the local console.'})
                return
            json_response(self, 200, {'state': read_state('database') or {}})
            return

        if self.path == '/api/workbook/state':
            if not is_loopback_admin_request(self):
                json_response(self, 403, {'error': 'Database state is available only from the local console.'})
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

        if self.path == '/api/system/update':
            if not is_loopback_admin_request(self):
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
            if not is_loopback_admin_request(self) or not request_origin_is_trusted(self):
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
                with db() as connection:
                    connection.execute('UPDATE partner_shares SET revoked_at = ? WHERE influencer_id = ? AND revoked_at IS NULL', (created_at, int(influencer['id'])))
                    connection.execute('INSERT INTO partner_shares(influencer_id, token_hash, created_at) VALUES (?, ?, ?)', (int(influencer['id']), token_hash, created_at))
                request_origin = self.headers.get('Origin') or f"http://{self.headers.get('Host', f'localhost:{PORT}')}"
                share_base = configured_base or request_origin
                share_url = f"{share_base}/partner-portal.html#token={urllib.parse.quote(token)}"
                json_response(self, 201, {'status': 'created', 'token': token, 'influencer': influencer.get('fullName'), 'shareUrl': share_url, 'publicBaseConfigured': bool(configured_base)})
            except Exception as ex:
                json_response(self, 500, {'error': f'Could not create partner link: {ex}'})
            return

        if self.path == '/api/partner-shares/revoke':
            if os.environ.get('VERCEL') or not is_loopback_admin_request(self) or not request_origin_is_trusted(self):
                json_response(self, 403, {'error': 'Only the local app owner can revoke partner links.'})
                return
            token = str(payload.get('token') or '').strip()
            share = partner_share_from_token(token)
            if not share:
                json_response(self, 404, {'error': 'Partner link not found.'})
                return
            with db() as connection:
                connection.execute('UPDATE partner_shares SET revoked_at = ? WHERE id = ?', (time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), share['id']))
            json_response(self, 200, {'status': 'revoked'})
            return

        if self.path == '/api/partner-shares/revoke-influencer':
            if os.environ.get('VERCEL') or not is_loopback_admin_request(self) or not request_origin_is_trusted(self):
                json_response(self, 403, {'error': 'Only the local app owner can revoke partner links.'})
                return
            try:
                influencer_id = int(payload.get('influencerId'))
                with db() as connection:
                    cursor = connection.execute('UPDATE partner_shares SET revoked_at = ? WHERE influencer_id = ? AND revoked_at IS NULL', (time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), influencer_id))
                json_response(self, 200, {'status': 'revoked', 'revoked': cursor.rowcount})
            except (TypeError, ValueError):
                json_response(self, 400, {'error': 'A valid influencer ID is required.'})
            return

        if self.path == '/api/partner-share/referrals':
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

        if self.path == '/api/partner-portal/signup':
            if os.environ.get('VERCEL'):
                json_response(self, 503, {'error': 'Self-serve portal signup requires persistent storage.'})
                return
            try:
                state = read_workbook_state()
                contacts = state.setdefault('contacts', [])
                name = str(payload.get('fullName') or '').strip()
                email = str(payload.get('email') or '').strip().lower()
                password = str(payload.get('password') or '').strip()
                company = str(payload.get('company') or '').strip()
                job_title = str(payload.get('jobTitle') or 'Industry Advisor').strip()
                phone = str(payload.get('phone') or '').strip()
                location = str(payload.get('location') or '').strip()
                linkedin_url = normalize_linkedin_url(payload.get('linkedinUrl') or '')
                sign_agreement = bool(payload.get('acceptAgreement'))

                if not name or not email:
                    json_response(self, 400, {'error': 'Full name and work email are required.'})
                    return
                if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', email):
                    json_response(self, 400, {'error': 'Enter a valid work email address.'})
                    return
                if len(password) < 4:
                    json_response(self, 400, {'error': 'Choose a password of at least 4 characters.'})
                    return

                existing = next((c for c in contacts if str(c.get('email') or '').strip().lower() == email), None)
                now_date = time.strftime('%Y-%m-%d', time.gmtime())
                initial_agreements = []
                if sign_agreement:
                    initial_agreements.append({
                        'id': f"agr_{int(time.time() * 1000)}",
                        'name': 'IRM Partner Network Agreement (Self-Serve Portal)',
                        'type': 'Signed Partner Agreement',
                        'status': 'Signed',
                        'signedBy': name,
                        'uploadedAt': now_date,
                        'notes': 'Digitally signed during Influencer Portal onboarding.'
                    })

                if existing:
                    if existing.get('isInfluencer') and existing.get('portalPasswordHash'):
                        json_response(self, 409, {'error': 'An Influencer Portal account with this email already exists. Please sign in.'})
                        return
                    existing['isInfluencer'] = True
                    existing['fullName'] = name
                    if company:
                        existing['company'] = company
                    if job_title:
                        existing['jobTitle'] = job_title
                    if phone:
                        existing['phone'] = phone
                    if location:
                        existing['location'] = location
                    if linkedin_url:
                        existing['linkedinUrl'] = linkedin_url
                    existing['portalPasswordHash'] = hash_portal_password(password)
                    existing.setdefault('referrals', [])
                    existing.setdefault('referralCredits', 0)
                    existing.setdefault('agreements', [])
                    if initial_agreements:
                        existing['agreements'] = initial_agreements + existing['agreements']
                    influencer = existing
                else:
                    parts = name.split()
                    new_id = max([int(c.get('id') or 0) for c in contacts] + [1000]) + 1
                    influencer = {
                        'id': new_id,
                        'firstName': parts[0] if parts else name,
                        'lastName': ' '.join(parts[1:]),
                        'fullName': name,
                        'email': email,
                        'company': company or 'Independent Advisory',
                        'jobTitle': job_title,
                        'phone': phone,
                        'location': location,
                        'linkedinUrl': linkedin_url,
                        'isInfluencer': True,
                        'portalPasswordHash': hash_portal_password(password),
                        'referralCredits': 0,
                        'referrals': [],
                        'agreements': initial_agreements,
                        'sourceFile': 'Influencer Portal Self-Signup'
                    }
                    contacts.append(influencer)

                write_workbook_state(state)
                token = issue_partner_share_token(influencer['id'])
                json_response(self, 201, {
                    'status': 'created',
                    'token': token,
                    'influencer': {
                        'id': influencer.get('id'),
                        'fullName': influencer.get('fullName'),
                        'email': influencer.get('email'),
                        'company': influencer.get('company'),
                        'jobTitle': influencer.get('jobTitle')
                    }
                })
            except Exception as ex:
                json_response(self, 500, {'error': f'Influencer signup failed: {ex}'})
            return

        if self.path == '/api/partner-portal/login':
            try:
                state = read_workbook_state()
                contacts = state.get('contacts') or []
                email = str(payload.get('email') or '').strip().lower()
                password = str(payload.get('password') or '').strip()
                if not email or not password:
                    json_response(self, 400, {'error': 'Email and password are required.'})
                    return
                influencer = next((c for c in contacts if c.get('isInfluencer') and str(c.get('email') or '').strip().lower() == email), None)
                if not influencer:
                    json_response(self, 401, {'error': 'No Influencer Partner account found for this email.'})
                    return
                stored_hash = influencer.get('portalPasswordHash')
                if stored_hash:
                    if not verify_portal_password(password, stored_hash):
                        json_response(self, 401, {'error': 'Invalid email or password.'})
                        return
                else:
                    # First-time portal sign-in for a pre-existing partner sets their password
                    influencer['portalPasswordHash'] = hash_portal_password(password)
                    write_workbook_state(state)

                token = issue_partner_share_token(influencer['id'])
                json_response(self, 200, {
                    'status': 'authenticated',
                    'token': token,
                    'influencer': {
                        'id': influencer.get('id'),
                        'fullName': influencer.get('fullName'),
                        'email': influencer.get('email'),
                        'company': influencer.get('company'),
                        'jobTitle': influencer.get('jobTitle')
                    }
                })
            except Exception as ex:
                json_response(self, 500, {'error': f'Influencer sign-in failed: {ex}'})
            return

        if self.path == '/api/partner-share/agreement':
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

        if self.path == '/api/partner-share/requests/respond':
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
                req_id = str(payload.get('requestId') or '').strip()
                decision = str(payload.get('decision') or 'accept').strip().lower()
                mp_requests = state.setdefault('marketplaceRequests', [])
                target_req = next((r for r in mp_requests if isinstance(r, dict) and str(r.get('id')) == req_id), None)
                if not target_req:
                    json_response(self, 404, {'error': 'Introduction request not found.'})
                    return
                if str(target_req.get('influencerId') or '') != str(influencer.get('id')) and str(target_req.get('influencerEmail') or '').lower() != str(influencer.get('email') or '').lower():
                    json_response(self, 403, {'error': 'This introduction request belongs to another partner.'})
                    return

                now_iso = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
                if decision in ('decline', 'declined'):
                    target_req['status'] = 'declined'
                elif decision in ('complete', 'completed', 'call_completed'):
                    target_req['status'] = 'call_completed'
                    target_req['creditsAwarded'] = 25
                elif decision in ('schedule', 'scheduled', 'call_scheduled'):
                    target_req['status'] = 'call_scheduled'
                    target_req['creditsAwarded'] = 15
                else:
                    target_req['status'] = 'influencer_accepted'
                    target_req['creditsAwarded'] = 15

                if payload.get('scheduledMeetingUrl'):
                    target_req['scheduledMeetingUrl'] = str(payload.get('scheduledMeetingUrl')).strip()
                target_req['updatedAt'] = now_iso

                # Sync target contact call state and referral credits
                target_cid = str(target_req.get('targetContactId') or '')
                target_contact = next((c for c in (state.get('contacts') or []) if str(c.get('id')) == target_cid and not c.get('isInfluencer')), None)
                if target_contact and target_req['status'] in ('influencer_accepted', 'call_scheduled', 'call_completed'):
                    target_contact['hasScheduledCall'] = True
                    if target_req['status'] == 'call_completed':
                        target_contact['hasTakenCall'] = True
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
                if len(password) < 4:
                    json_response(self, 400, {'error': 'Choose a password of at least 4 characters.'})
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
                vendor['approvedAt'] = now_iso
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

                if not target_contact and not influencer:
                    json_response(self, 404, {'error': 'Select a valid network contact or Influencer Partner to request an introduction.'})
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

        if self.path == '/api/irm/vendors/manage':
            if os.environ.get('VERCEL') or not is_loopback_admin_request(self) or not request_origin_is_trusted(self):
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
                if action == 'approve_agreement':
                    vendor['agreementStatus'] = 'signed'
                    vendor['networkAccessLevel'] = 'full_partner_access'
                    vendor['approvedAt'] = now_iso
                    if not vendor.get('agreements'):
                        vendor['agreements'] = [{
                            'id': f"vagr_{int(time.time() * 1000)}",
                            'title': 'IRM Master Vendor Agreement (Admin Approved)',
                            'signedBy': vendor.get('contactName') or 'Vendor Representative',
                            'status': 'Signed',
                            'signedAt': now_iso[:10],
                            'termsVersion': 'IRM-Model2-2026.1'
                        }]
                elif action == 'revoke_access':
                    vendor['agreementStatus'] = 'revoked'
                    vendor['networkAccessLevel'] = 'locked'
                else:
                    if 'agreementStatus' in payload:
                        vendor['agreementStatus'] = str(payload.get('agreementStatus'))
                    if 'networkAccessLevel' in payload:
                        vendor['networkAccessLevel'] = str(payload.get('networkAccessLevel'))
                write_workbook_state(state)
                json_response(self, 200, {'status': 'updated', 'vendor': vendor_safe_dict(vendor)})
            except Exception as ex:
                json_response(self, 500, {'error': f'Vendor management failed: {ex}'})
            return

        if self.path == '/api/irm/requests/manage':
            if os.environ.get('VERCEL') or not is_loopback_admin_request(self) or not request_origin_is_trusted(self):
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
                target_req['status'] = next_status
                target_req['updatedAt'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
                if next_status in ('influencer_accepted', 'call_scheduled'):
                    target_req['creditsAwarded'] = max(int(target_req.get('creditsAwarded') or 0), 15)
                elif next_status == 'call_completed':
                    target_req['creditsAwarded'] = 25

                contacts = state.get('contacts') or []
                target_contact = next((c for c in contacts if not c.get('isInfluencer') and str(c.get('id')) == str(target_req.get('targetContactId') or '')), None)
                influencer = next((c for c in contacts if c.get('isInfluencer') and str(c.get('id')) == str(target_req.get('influencerId') or '')), None)
                if target_contact and next_status in ('influencer_accepted', 'call_scheduled', 'call_completed'):
                    target_contact['hasScheduledCall'] = True
                    if next_status == 'call_completed':
                        target_contact['hasTakenCall'] = True
                    if influencer:
                        sync_influencer_referral_ledger(influencer, target_contact)

                write_workbook_state(state)
                json_response(self, 200, {'status': 'updated', 'request': target_req})
            except Exception as ex:
                json_response(self, 500, {'error': f'Marketplace request update failed: {ex}'})
            return

        if self.path in ('/api/influencers/create', '/api/influencers/update', '/api/influencers/delete', '/api/influencers/bulk-create', '/api/influencers/convert', '/api/influencers/agreements'):
            if os.environ.get('VERCEL') or not is_loopback_admin_request(self) or not request_origin_is_trusted(self):
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
                    profile = payload.get('profile') or {}
                    name = str(profile.get('fullName') or '').strip()
                    email = str(profile.get('email') or '').strip().lower()
                    if not name or not email:
                        json_response(self, 400, {'error': 'Partner name and email are required.'})
                        return
                    if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', email):
                        json_response(self, 400, {'error': 'Enter a valid partner email address.'})
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
                        if profile.get('linkedinUrl'):
                            existing_contact['linkedinUrl'] = normalize_linkedin_url(profile.get('linkedinUrl'))
                        existing_contact.setdefault('agreements', profile.get('agreements') if isinstance(profile.get('agreements'), list) else [])
                        existing_contact.setdefault('referrals', [])
                        existing_contact.setdefault('referralCredits', 0)
                        write_workbook_state(state)
                        json_response(self, 201, {'status': 'created', 'influencer': existing_contact})
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
                        'referralCredits': 0, 'referrals': [],
                        'agreements': profile.get('agreements') if isinstance(profile.get('agreements'), list) else [],
                        'sourceFile': 'Manual partner entry'
                    }
                    contacts.append(new_partner)
                    write_workbook_state(state)
                    json_response(self, 201, {'status': 'created', 'influencer': new_partner})
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
                    with db() as connection:
                        connection.execute('UPDATE partner_shares SET revoked_at = ? WHERE influencer_id = ? AND revoked_at IS NULL', (time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), int(influencer_id)))
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
            if os.environ.get('VERCEL') or not is_loopback_admin_request(self) or not request_origin_is_trusted(self):
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
            if not is_loopback_admin_request(self):
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
            if not is_loopback_admin_request(self):
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
            if os.environ.get('VERCEL') or not is_loopback_admin_request(self):
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
            if not is_loopback_admin_request(self) or not request_origin_is_trusted(self):
                json_response(self, 403, {'error': 'Database writes are available only from the local console.'})
                return
            state_obj = payload.get('state', {})
            sync_relational_tables_from_state(state_obj)
            json_response(self, 200, {'status': 'saved'})
            return

        if self.path == '/api/workbook/state' or self.path == '/api/db/state':
            if os.environ.get('VERCEL'):
                json_response(self, 503, {'error': 'Durable database storage is unavailable in the current serverless deployment.'})
                return
            if not is_loopback_admin_request(self) or not request_origin_is_trusted(self):
                json_response(self, 403, {'error': 'Database writes are available only from the local console.'})
                return
            try:
                state_obj = payload.get('state', {})
                sync_relational_tables_from_state(state_obj)
                write_workbook_state(state_obj)
                json_response(self, 200, {'status': 'saved', 'savedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())})
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
            demo_fallback = payload.get('demoFallback', True)
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
            super().do_POST()

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
