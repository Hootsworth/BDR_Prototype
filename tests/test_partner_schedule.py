import io
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import server


class PartnerScheduleTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        root = Path(self.temp_dir.name)
        self.paths = patch.multiple(server, DB_PATH=str(root / "app.sqlite3"), DATA_DIR=str(root), WORKBOOK_PATH=str(root / "state.xlsx"))
        self.paths.start()
        state = server.default_workbook_state()
        state["contacts"] = [
            {"id": 20, "fullName": "Avery Partner", "email": "avery@example.test", "isInfluencer": True},
            {"id": 21, "fullName": "Morgan Contact", "email": "morgan@example.test", "company": "Example Co", "influencerId": 20, "influencerEmail": "avery@example.test", "referredBy": "Avery Partner"},
        ]
        server.write_workbook_state(state)
        self.token = server.issue_partner_share_token(20)
        self.env = patch.dict(os.environ, {
            "PARTNER_SCHEDULE_ADMIN_EMAIL": "admin@example.test",
            "RESEND_API_KEY": "test-resend-key", "RESEND_FROM_EMAIL": "notifications@example.test",
            "PARTNER_SCHEDULE_DAILY_LIMIT": "10",
        }, clear=False)
        self.env.start()

    def tearDown(self):
        self.env.stop()
        self.paths.stop()
        self.temp_dir.cleanup()

    def request(self, path, data, post_json_mock, google_session=None, google_api_mock=None, provider_keys=None):
        body = json.dumps(data).encode("utf-8")
        headers = {"Content-Type": "application/json", "Content-Length": str(len(body)), "Authorization": f"Bearer {self.token}"}

        class Harness(server.ProxyHTTPRequestHandler):
            def __init__(self):
                self.path = path
                self.rfile = io.BytesIO(body)
                self.wfile = io.BytesIO()
                self.headers = headers
                self.client_address = ("127.0.0.1", 12345)
                self.server = type("ServerStub", (), {"server_name": "localhost", "server_port": 8001})()
                self.responses = []

            def send_response(self, status, message=None):
                self.responses.append(status)

            def send_header(self, *_args):
                pass

            def end_headers(self):
                pass

            def log_message(self, *_args):
                pass

        handler = Harness()
        key_values = provider_keys if provider_keys is not None else {"openai": "openai-test-key", "gemini": "gemini-test-key"}
        with patch.object(server, "provider_secret", side_effect=lambda name: key_values.get(name)), \
             patch.object(server, "is_irm_admin_request", return_value=True), \
             patch.object(server, "post_json", side_effect=post_json_mock), \
             patch.object(server, "restore_connected_google_session", return_value=google_session), \
             patch.object(server, "google_api", side_effect=google_api_mock or (lambda *_args: ({}, {"id": "google-event-test"}))), \
             patch.object(server, "google_api_get", return_value=({}, {"id": "google-event-test"})):
            handler.do_POST()
        return handler.responses[-1], json.loads(handler.wfile.getvalue().decode("utf-8"))

    def test_schedule_validates_with_both_models_ccs_admin_and_is_idempotent(self):
        calls = []

        def provider(url, payload, headers):
            calls.append((url, payload, headers))
            if "openai.com" in url:
                result = {"choices": [{"message": {"content": json.dumps({"is_meeting_invitation": True, "duration_minutes": 45})}}]}
            elif "generativelanguage.googleapis.com" in url:
                result = {"candidates": [{"content": {"parts": [{"text": json.dumps({"is_meeting_invitation": True})}]}}]}
            else:
                result = {"id": "email-test-123"}
            return {}, result

        payload = {"contactId": 21, "datetime": "2099-05-04T15:00:00+05:30", "subject": "Intro call", "body": "Please join me for a call."}
        status, response = self.request("/api/partner-share/schedule", payload, provider)
        self.assertEqual(status, 201)
        self.assertEqual(["openai.com" in call[0] for call in calls].count(True), 1)
        self.assertEqual(["generativelanguage.googleapis.com" in call[0] for call in calls].count(True), 1)
        email_call = next(call for call in calls if "resend.com" in call[0])
        self.assertEqual(email_call[1]["cc"], ["admin@example.test"])
        self.assertTrue(email_call[2]["Idempotency-Key"].startswith("partner-schedule/"))
        self.assertEqual(response["meeting"]["status"], "Call Scheduled")
        self.assertEqual(response["meeting"]["aiValidation"]["geminiModel"], "gemini-3.5-flash-lite")

        second_status, second_response = self.request("/api/partner-share/schedule", payload, provider)
        self.assertEqual(second_status, 200)
        self.assertTrue(second_response["duplicate"])
        self.assertEqual(len(calls), 3, "an idempotent retry must not repeat AI or email calls")

    def test_scheduling_accepts_when_one_configured_model_confirms(self):
        def provider(url, _payload, _headers):
            if "resend.com" in url:
                return {}, {"id": "email-one-ai-confirmed"}
            if "openai.com" in url:
                result = {"choices": [{"message": {"content": json.dumps({"is_meeting_invitation": True})}}]}
            else:
                result = {"candidates": [{"content": {"parts": [{"text": json.dumps({"is_meeting_invitation": False})}]}}]}
            return {}, result

        status, response = self.request("/api/partner-share/schedule", {
            "contactId": 21, "datetime": "2099-05-04T15:00:00+05:30", "subject": "Intro call", "body": "Please join me for a call."
        }, provider)
        self.assertEqual(status, 201)
        self.assertEqual(response["meeting"]["aiValidation"]["validatedBy"], ["openai"])

    def test_rejects_when_all_configured_models_decline_the_invitation(self):
        def provider(url, _payload, _headers):
            if "openai.com" in url:
                result = {"choices": [{"message": {"content": json.dumps({"is_meeting_invitation": False})}}]}
            else:
                result = {"candidates": [{"content": {"parts": [{"text": json.dumps({"is_meeting_invitation": False})}]}}]}
            return {}, result

        status, response = self.request("/api/partner-share/schedule", {
            "contactId": 21, "datetime": "2099-05-04T15:00:00+05:30", "subject": "Intro call", "body": "Please join me for a call."
        }, provider)
        self.assertEqual(status, 422)
        self.assertIn("No email was sent", response["error"])
        self.assertEqual(server.read_workbook_state()["meetings"], [])

    def test_scheduling_works_with_only_an_openai_key(self):
        calls = []

        def provider(url, _payload, _headers):
            calls.append(url)
            if "openai.com" in url:
                return {}, {"choices": [{"message": {"content": json.dumps({"is_meeting_invitation": True})}}]}
            return {}, {"id": "email-openai-only"}

        status, result = self.request("/api/partner-share/schedule", {
            "contactId": 21, "datetime": "2099-05-04T15:00:00+05:30", "subject": "Intro call", "body": "Please join me for a call."
        }, provider, provider_keys={"openai": "openai-test-key", "gemini": ""})
        self.assertEqual(status, 201)
        self.assertTrue(any("openai.com" in url for url in calls))
        self.assertFalse(any("generativelanguage.googleapis.com" in url for url in calls))
        self.assertEqual(result["meeting"]["aiValidation"]["validatedBy"], ["openai"])
        self.assertIsNone(result["meeting"]["aiValidation"]["geminiModel"])

    def test_scheduling_works_with_only_a_gemini_key(self):
        calls = []

        def provider(url, _payload, _headers):
            calls.append(url)
            if "generativelanguage.googleapis.com" in url:
                return {}, {"candidates": [{"content": {"parts": [{"text": json.dumps({"is_meeting_invitation": True})}]}}]}
            return {}, {"id": "email-gemini-only"}

        status, result = self.request("/api/partner-share/schedule", {
            "contactId": 21, "datetime": "2099-05-04T15:00:00+05:30", "subject": "Intro call", "body": "Please join me for a call."
        }, provider, provider_keys={"openai": "", "gemini": "gemini-test-key"})
        self.assertEqual(status, 201)
        self.assertTrue(any("generativelanguage.googleapis.com" in url for url in calls))
        self.assertFalse(any("openai.com" in url for url in calls))
        self.assertEqual(result["meeting"]["aiValidation"]["validatedBy"], ["gemini"])
        self.assertIsNone(result["meeting"]["aiValidation"]["openaiModel"])

    def test_connected_google_calendar_receives_a_valid_event_window(self):
        def provider(url, _payload, _headers):
            if "openai.com" in url:
                result = {"choices": [{"message": {"content": json.dumps({"is_meeting_invitation": True, "duration_minutes": 45})}}]}
            elif "generativelanguage.googleapis.com" in url:
                result = {"candidates": [{"content": {"parts": [{"text": json.dumps({"is_meeting_invitation": True})}]}}]}
            else:
                result = {"id": "email-test-google"}
            return {}, result

        calendar_calls = []

        def calendar_api(method, url, _access_token, event):
            calendar_calls.append((method, url, event))
            return {}, {"id": event["id"], "hangoutLink": "https://meet.google.test/example"}

        status, response = self.request("/api/partner-share/schedule", {
            "contactId": 21, "datetime": "2099-05-04T15:00:00+05:30", "subject": "Intro call", "body": "Please join me for a call."
        }, provider, google_session={"access_token": "google-test-token"}, google_api_mock=calendar_api)
        self.assertEqual(status, 201)
        self.assertEqual(len(calendar_calls), 1)
        method, url, event = calendar_calls[0]
        self.assertEqual(method, "POST")
        self.assertIn("sendUpdates=all", url)
        self.assertEqual(event["start"]["dateTime"], "2099-05-04T15:00:00+05:30")
        self.assertEqual(event["end"]["dateTime"], "2099-05-04T15:45:00+05:30")
        self.assertEqual(response["meeting"]["googleCalendarSyncStatus"], "synced")
        self.assertEqual(response["meeting"]["meetingUrl"], "https://meet.google.test/example")

    def test_ai_draft_uses_gemini_and_returns_structured_content(self):
        calls = []

        def provider(url, payload, headers):
            calls.append((url, payload, headers))
            return {}, {"candidates": [{"content": {"parts": [{"text": json.dumps({"subject": "A real subject", "body": "A real AI generated draft."})}]}}]}

        status, result = self.request("/api/ai/draft", {
            "instructions": "Keep it warm and concise.",
            "contact": {"fullName": "Morgan Contact", "company": "Example Co", "jobTitle": "COO"},
            "isBulk": False,
            "geminiModel": "gemini-3.5-flash-lite"
        }, provider)
        self.assertEqual(status, 200)
        self.assertEqual(result["provider"], "gemini")
        self.assertEqual(result["subject"], "A real subject")
        self.assertEqual(result["body"], "A real AI generated draft.")
        self.assertIn("gemini-3.5-flash-lite:generateContent", calls[0][0])
        self.assertNotIn("apiKey", calls[0][0])

    def test_ai_draft_uses_openai_when_gemini_fails_and_never_substitutes_a_template(self):
        calls = []

        def provider(url, _payload, _headers):
            calls.append(url)
            if "generativelanguage.googleapis.com" in url:
                raise RuntimeError("Gemini unavailable")
            return {}, {"choices": [{"message": {"content": json.dumps({"subject": "OpenAI subject", "body": "OpenAI draft body."})}}]}

        status, result = self.request("/api/ai/draft", {"instructions": "Use OpenAI fallback."}, provider)
        self.assertEqual(status, 200)
        self.assertEqual(result["provider"], "openai")
        self.assertEqual(result["body"], "OpenAI draft body.")
        self.assertEqual(len(calls), 2)

    def test_linkedin_ai_draft_uses_real_provider_and_enforces_note_shape(self):
        def provider(_url, _payload, _headers):
            return {}, {"candidates": [{"content": {"parts": [{"text": json.dumps({"note": "Hello Morgan, I would enjoy connecting."})}]}}]}

        status, result = self.request("/api/ai/draft", {
            "channel": "linkedin", "contact": {"fullName": "Morgan Contact", "company": "Example Co"}
        }, provider)
        self.assertEqual(status, 200)
        self.assertEqual(result["provider"], "gemini")
        self.assertEqual(result["note"], "Hello Morgan, I would enjoy connecting.")

    def test_email_gateway_never_returns_success_for_a_demo_send(self):
        with patch.dict(os.environ, {"RESEND_API_KEY": "", "RESEND_FROM_EMAIL": ""}):
            status, result = self.request("/api/email/send", {
                "to": "morgan@example.test", "subject": "Hello", "body": "Real email only."
            }, lambda *_args: self.fail("provider must not be called without configuration"))
        self.assertEqual(status, 503)
        self.assertIn("No email was sent", result["error"])

    def test_linkedin_endpoint_reports_profile_handoff_instead_of_claiming_sent(self):
        status, result = self.request("/api/linkedin/send", {
            "recipientName": "Morgan Contact",
            "linkedinUrl": "https://www.linkedin.com/in/morgan-contact",
            "message": "Hello Morgan, I would enjoy connecting."
        }, lambda *_args: self.fail("profile handoff does not call a message API"))
        self.assertEqual(status, 200)
        self.assertEqual(result["status"], "prepared")
        self.assertEqual(result["provider"], "linkedin_profile_handoff")
        self.assertNotIn("id", result)


if __name__ == "__main__":
    unittest.main()
