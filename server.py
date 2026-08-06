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
try:
    from cryptography.fernet import Fernet, InvalidToken
    HAS_CRYPTOGRAPHY = True
except ImportError:
    Fernet = None
    InvalidToken = Exception
    HAS_CRYPTOGRAPHY = False

PORT = 8001

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
    connection.execute('CREATE TABLE IF NOT EXISTS sent_emails (id INTEGER PRIMARY KEY AUTOINCREMENT, fingerprint TEXT UNIQUE NOT NULL, recipient TEXT NOT NULL, subject TEXT NOT NULL, provider_id TEXT, sent_at TEXT NOT NULL)')
    connection.commit()
    return connection

def persist_state(key, value):
    with db() as connection:
        connection.execute('INSERT INTO app_state(key, value, updated_at) VALUES(?, ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at', (key, json.dumps(value), time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())))

def read_state(key):
    with db() as connection:
        row = connection.execute('SELECT value FROM app_state WHERE key = ?', (key,)).fetchone()
        return json.loads(row['value']) if row else None

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
            with urllib.request.urlopen(request, timeout=30) as response:
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

class ProxyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Same-origin is the normal path; restrict cross-origin calls to local development.
        origin = self.headers.get('Origin')
        if origin in ('http://localhost:8001', 'http://127.0.0.1:8001'):
            self.send_header('Access-Control-Allow-Origin', origin)
            self.send_header('Access-Control-Allow-Credentials', 'true')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
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
            json_response(self, 200, {'state': read_state('database') or {}})
            return

        super().do_GET()

    def do_POST(self):
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length)
        try:
            payload = json.loads(post_data.decode('utf-8')) if post_data else {}
        except json.JSONDecodeError:
            json_response(self, 400, {'error': 'Request body must be valid JSON.'})
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

        if self.path == '/api/state':
            persist_state('database', payload.get('state', {}))
            json_response(self, 200, {'status': 'saved'})
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

        # Transactional outbound over HTTPS; this uses Resend, not SMTP.
        if self.path == '/api/email/send':
            api_key = os.environ.get('RESEND_API_KEY')
            sender = os.environ.get('RESEND_FROM_EMAIL')
            recipient = payload.get('to')
            subject = payload.get('subject')
            body = payload.get('body')
            if not api_key or not sender:
                json_response(self, 503, {'error': 'RESEND_API_KEY and RESEND_FROM_EMAIL must be configured.'})
                return
            if not recipient or not subject or not body:
                json_response(self, 400, {'error': 'to, subject, and body are required.'})
                return
            try:
                status, result = post_json(
                    'https://api.resend.com/emails',
                    {'from': sender, 'to': [recipient], 'subject': subject, 'text': body},
                    {'Authorization': f'Bearer {api_key}'}
                )
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
                with urllib.request.urlopen(req) as response:
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
    server = http.server.HTTPServer(('0.0.0.0', PORT), ProxyHTTPRequestHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server.")
