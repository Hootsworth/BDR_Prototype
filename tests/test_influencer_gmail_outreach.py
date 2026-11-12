import json
import os
import tempfile
import unittest
from unittest.mock import MagicMock, patch

import server


class DummyHandler:
    def __init__(self, headers=None, path='/api/go/outreach/gmail/status'):
        self.headers = headers or {}
        self.path = path
        self.responses = []
        self.response_codes = []
        self.response_headers = []

    def send_response(self, code):
        self.response_codes.append(code)

    def send_header(self, k, v):
        self.response_headers.append((k, v))

    def end_headers(self):
        pass

    def wfile_write(self, data):
        self.responses.append(data)


class InfluencerGmailOutreachTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.temp_dir.name, "test.sqlite3")
        self.data_dir = self.temp_dir.name
        self.db_patch = patch.multiple(server, DB_PATH=self.db_path, DATA_DIR=self.data_dir)
        self.db_patch.start()
        fernet_key = server.Fernet.generate_key().decode() if server.Fernet else "mock-fernet-key-32bytes-base64encoded="
        self.env_patch = patch.dict(os.environ, {
            "TOKEN_ENCRYPTION_KEY": fernet_key,
            "GOOGLE_CLIENT_ID": "mock-client-id.apps.googleusercontent.com",
            "GOOGLE_CLIENT_SECRET": "mock-client-secret",
            "GOOGLE_REDIRECT_URI": "https://admin.connectem.ai/api/google/oauth/callback"
        })
        self.env_patch.start()

    def tearDown(self):
        self.env_patch.stop()
        self.db_patch.stop()
        self.temp_dir.cleanup()

    def test_gmail_admin_cc_defaults_to_nextbdr(self):
        with patch.dict(os.environ, {}, clear=True):
            cc = server.gmail_admin_cc()
            self.assertEqual(cc, 'nextbdr@gmail.com')

    def test_gmail_status_returns_auth_url_when_disconnected(self):
        handler = DummyHandler(headers={'authorization': 'Bearer token_partner_901'})
        with patch('server.json_response') as mock_json:
            result = server.handle_go_api_routes(handler, 'GET', '/api/go/outreach/gmail/status')
            self.assertTrue(result)
            mock_json.assert_called_once()
            args = mock_json.call_args[0]
            status_code = args[1]
            data = args[2]
            self.assertEqual(status_code, 200)
            self.assertIn('authUrl', data)
            self.assertIn('/api/google/oauth/start', data['authUrl'])
            self.assertEqual(data['adminCc'], 'nextbdr@gmail.com')

    def test_gmail_connect_generates_google_consent_url(self):
        handler = DummyHandler(headers={'authorization': 'Bearer token_partner_901'})
        with patch('server.json_response') as mock_json:
            result = server.handle_go_api_routes(handler, 'POST', '/api/go/outreach/gmail/connect', payload={'returnUrl': 'https://go.connectem.ai/partner-portal'})
            self.assertTrue(result)
            mock_json.assert_called_once()
            args = mock_json.call_args[0]
            status_code = args[1]
            data = args[2]
            self.assertEqual(status_code, 200)
            self.assertTrue(data['success'])
            self.assertIn('accounts.google.com', data['authUrl'])
            self.assertIn('gmail.send', data['authUrl'])

    def test_outreach_email_requires_auth_when_not_connected(self):
        handler = DummyHandler(headers={'authorization': 'Bearer token_partner_901'})
        payload = {
            'prospectId': '1',
            'subject': 'Intro briefing',
            'body': 'Hi there'
        }
        with patch('server.json_response') as mock_json:
            result = server.handle_go_api_routes(handler, 'POST', '/api/go/outreach/email', payload=payload)
            self.assertTrue(result)
            mock_json.assert_called_once()
            args = mock_json.call_args[0]
            status_code = args[1]
            data = args[2]
            self.assertEqual(status_code, 403)
            self.assertTrue(data.get('requiresAuth'))
            self.assertIn('authUrl', data)
            self.assertIn('Google', data.get('error'))

    def test_outreach_email_sends_via_gmail_api_with_admin_cc(self):
        handler = DummyHandler(headers={'authorization': 'Bearer token_partner_901'})
        mock_google_session = {
            'session_id': 'sess_123',
            'access_token': 'ya29.mock_token',
            'email': 'influencer@customdomain.com',
            'name': 'Influencer Bob',
            'expires_at': 9999999999.0,
            'partner_owner_id': '901'
        }
        payload = {
            'prospectId': '1',
            'subject': 'Executive update',
            'body': 'Meeting request'
        }
        with patch('server.restore_partner_google_session', return_value=mock_google_session), \
             patch('server.gmail_request', return_value={'id': 'gmail_msg_12345'}) as mock_gmail, \
             patch('server.json_response') as mock_json:
            result = server.handle_go_api_routes(handler, 'POST', '/api/go/outreach/email', payload=payload)
            self.assertTrue(result)
            mock_gmail.assert_called_once()
            gmail_args = mock_gmail.call_args[0]
            gmail_payload = gmail_args[2]
            self.assertEqual(gmail_payload['cc'], 'nextbdr@gmail.com')
            self.assertEqual(gmail_payload['from'], 'influencer@customdomain.com')
            mock_json.assert_called_once()
            data = mock_json.call_args[0][2]
            self.assertEqual(mock_json.call_args[0][1], 200)
            self.assertEqual(data['adminCcEnforced'], 'nextbdr@gmail.com')
            self.assertEqual(data['providerId'], 'gmail_msg_12345')


if __name__ == '__main__':
    unittest.main()
