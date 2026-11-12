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

    def test_update_contact_outreach_record_all_channels(self):
        state = {
            'contacts': [
                {
                    'id': '1',
                    'fullName': 'Alice Smith',
                    'email': 'alice@enterprise.com',
                    'isInfluencer': False,
                    'emailsSent': 0,
                    'callsCount': 0,
                    'linkedinSent': 0,
                    'touchpoints': []
                }
            ]
        }
        # 1. Email outreach
        matched = server.update_contact_outreach_record(state, '1', 'email', influencer={'fullName': 'Bob Partner', 'id': '901'}, details={'subject': 'Intro'})
        self.assertTrue(matched)
        contact = state['contacts'][0]
        self.assertEqual(contact['emailsSent'], 1)
        self.assertTrue(contact['hasEmailSent'])
        self.assertEqual(contact['outreachStatus'], 'Email Sent')
        self.assertEqual(contact['lastContactedBy'], 'Bob Partner')
        self.assertEqual(contact['lastChannel'], 'email')
        self.assertEqual(len(contact['touchpoints']), 1)

        # 2. Call outreach
        server.update_contact_outreach_record(state, '1', 'call', influencer={'fullName': 'Bob Partner', 'id': '901'}, details={'outcome': 'Connected'})
        self.assertEqual(contact['callsCount'], 1)
        self.assertTrue(contact['hasCallMade'])
        self.assertTrue(contact['hasTakenCall'])
        self.assertEqual(contact['outreachStatus'], 'Call Connected')
        self.assertEqual(len(contact['touchpoints']), 2)

        # 3. LinkedIn outreach
        server.update_contact_outreach_record(state, '1', 'linkedin', influencer={'fullName': 'Bob Partner', 'id': '901'}, details={'notes': 'Sent InMail'})
        self.assertEqual(contact['linkedinSent'], 1)
        self.assertTrue(contact['hasLinkedInSent'])
        self.assertEqual(contact['outreachStatus'], 'LinkedIn Sent')
        self.assertEqual(len(contact['touchpoints']), 3)

    def test_parse_reply_and_calendar_intent_heuristics(self):
        # 1. Out of Office
        ooo = server.parse_reply_and_calendar_intent("I am currently out of office on annual leave until next Monday.")
        self.assertTrue(ooo['isReply'])
        self.assertEqual(ooo['sentiment'], 'out_of_office')
        self.assertFalse(ooo['hasCalendarIntent'])

        # 2. Not Interested
        opt_out = server.parse_reply_and_calendar_intent("Please unsubscribe and remove me from your list. Not interested.")
        self.assertTrue(opt_out['isReply'])
        self.assertEqual(opt_out['sentiment'], 'not_interested')
        self.assertFalse(opt_out['hasCalendarIntent'])

        # 3. Meeting requested with day and time
        cal = server.parse_reply_and_calendar_intent(
            "Thanks for reaching out! Sounds good, let's schedule a call on Tuesday at 2:00 PM EST. Please send an invite.",
            prospect={'fullName': 'Alice Smith', 'company': 'Tech Corp'}
        )
        self.assertTrue(cal['isReply'])
        self.assertEqual(cal['sentiment'], 'meeting_requested')
        self.assertTrue(cal['hasCalendarIntent'])
        self.assertIn('Tuesday', cal['suggestedTime'])
        self.assertIn('2:00 pm est', cal['suggestedTime'].lower())

        # 4. General interest without calendar time
        interest = server.parse_reply_and_calendar_intent("This sounds interesting, happy to connect and learn more details.")
        self.assertTrue(interest['isReply'])
        self.assertEqual(interest['sentiment'], 'interested')
        self.assertFalse(interest['hasCalendarIntent'])

    def test_sync_prospect_calendar_event(self):
        state = {'contacts': [], 'meetings': []}
        prospect = {
            'id': '10',
            'fullName': 'Marcus Vance',
            'email': 'marcus@globalfintech.com',
            'company': 'Global Fintech',
            'jobTitle': 'Chief Technology Officer'
        }
        parsed_intent = {
            'hasCalendarIntent': True,
            'suggestedTime': 'Thursday at 3:00 PM EST',
            'meetingTitle': 'Briefing with Marcus Vance',
            'notes': 'Discuss advisory partnership'
        }
        meeting = server.sync_prospect_calendar_event(state, prospect, influencer={'fullName': 'Sarah Jenkins', 'id': 'inf_1', 'email': 'sarah@connectem.ai'}, parsed_intent=parsed_intent)
        self.assertEqual(meeting['contactName'], 'Marcus Vance')
        self.assertEqual(meeting['contactEmail'], 'marcus@globalfintech.com')
        self.assertEqual(meeting['influencerName'], 'Sarah Jenkins')
        self.assertEqual(meeting['timeString'], 'Thursday at 3:00 PM EST')
        self.assertEqual(len(state['meetings']), 1)
        self.assertTrue(prospect['hasScheduledMeeting'])
        self.assertEqual(prospect['outreachStatus'], 'Meeting Scheduled')
        self.assertIn('meetingUrl', prospect['meetingDetails'])

    def test_admin_sync_outreach_endpoint(self):
        handler = DummyHandler(headers={'authorization': 'Bearer admin-test-token'}, path='/api/admin/sync-outreach')
        test_state = {
            'contacts': [
                {
                    'id': '101',
                    'fullName': 'David Warner',
                    'email': 'david@sunrisers.com',
                    'company': 'Sunrisers',
                    'jobTitle': 'VP Growth',
                    'isInfluencer': False,
                    'referrals': []
                }
            ],
            'meetings': []
        }
        with patch('server.read_workbook_state', return_value=test_state), \
             patch('server.write_workbook_state') as mock_write, \
             patch('server.json_response') as mock_json:
            payload = {
                'prospectId': '101',
                'messageText': "Hi Team, thanks for the intro! Let's do a meeting this Friday at 11:00 AM EST to discuss."
            }
            result = server.handle_admin_api_routes(handler, 'POST', '/api/admin/sync-outreach', payload=payload)
            self.assertTrue(result)
            mock_json.assert_called_once()
            code, data = mock_json.call_args[0][1], mock_json.call_args[0][2]
            self.assertEqual(code, 200)
            self.assertTrue(data['success'])
            self.assertEqual(data['updatedProspects'], 1)
            self.assertEqual(data['newReplies'], 1)
            self.assertEqual(data['newMeetings'], 1)
            mock_write.assert_called_once()
            updated_p = test_state['contacts'][0]
            self.assertTrue(updated_p['hasReply'])
            self.assertEqual(updated_p['replySentiment'], 'meeting_requested')
            self.assertEqual(updated_p['outreachStatus'], 'Meeting Scheduled')


if __name__ == '__main__':
    unittest.main()
