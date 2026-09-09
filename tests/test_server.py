import os
import tempfile
import unittest
from unittest.mock import patch

import server


class ServerSafetyTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.temp_dir.name, "test.sqlite3")
        self.data_dir = self.temp_dir.name
        self.db_patch = patch.multiple(server, DB_PATH=self.db_path, DATA_DIR=self.data_dir)
        self.db_patch.start()
        fernet_key = server.Fernet.generate_key().decode() if server.Fernet else "mock-fernet-key-32bytes-base64encoded="
        self.env_patch = patch.dict(os.environ, {"PROTOTYPE_DAILY_SEND_LIMIT": "2", "TOKEN_ENCRYPTION_KEY": fernet_key})
        self.env_patch.start()

    def tearDown(self):
        self.env_patch.stop()
        self.db_patch.stop()
        self.temp_dir.cleanup()

    def test_send_requires_approval_and_blocks_suppression(self):
        base = {"to": "prospect@example.com", "subject": "Hello", "body": "Message"}
        self.assertIn("approval", server.check_send_guardrails({**base, "approved": False}))
        self.assertIn("suppressed", server.check_send_guardrails({**base, "approved": True, "suppressed": True}))

    def test_duplicate_message_is_rejected_after_recording(self):
        payload = {"to": "prospect@example.com", "subject": "Hello", "body": "Message", "approved": True}
        self.assertIsNone(server.check_send_guardrails(payload))
        server.record_sent_email(payload, "gmail-message-1")
        self.assertIn("already", server.check_send_guardrails(payload))

    def test_token_round_trip(self):
        token = "access-token-value"
        encrypted = server.encrypt_token(token)
        self.assertNotEqual(encrypted, token)
        self.assertEqual(server.decrypt_token(encrypted), token)

    def test_local_version_detection(self):
        info = server.get_local_version_info()
        self.assertIn("sha", info)
        self.assertIn("version", info)
        self.assertTrue(len(info["sha"]) > 0)


class WorkbookPersistenceTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.workbook_path = os.path.join(self.temp_dir.name, "gtm-console-database.xlsx")
        self.workbook_patch = patch.multiple(server, WORKBOOK_PATH=self.workbook_path)
        self.workbook_patch.start()

    def tearDown(self):
        self.workbook_patch.stop()
        self.temp_dir.cleanup()

    def test_missing_workbook_returns_default_state(self):
        state = server.read_workbook_state()
        self.assertEqual(state["contacts"], [])
        self.assertEqual(state["currentOutboundSubtab"], "influencers")

    def test_round_trips_contacts_including_isInfluencer_boolean(self):
        if not server.HAS_OPENPYXL:
            self.skipTest("openpyxl is not installed")
        state = server.default_workbook_state()
        state["contacts"] = [
            {"id": 1, "email": "prospect@example.com", "fullName": "Prospect One", "isInfluencer": False, "company": "Acme"},
            {"id": 2, "email": "influencer@example.com", "fullName": "Influencer One", "isInfluencer": True, "company": "Acme"},
        ]

        server.write_workbook_state(state)
        self.assertTrue(os.path.exists(self.workbook_path))

        reloaded = server.read_workbook_state()
        self.assertEqual(len(reloaded["contacts"]), 2)
        by_email = {c["email"]: c for c in reloaded["contacts"]}
        self.assertIs(by_email["prospect@example.com"]["isInfluencer"], False)
        self.assertIs(by_email["influencer@example.com"]["isInfluencer"], True)

    def test_round_trips_events_and_settings(self):
        if not server.HAS_OPENPYXL:
            self.skipTest("openpyxl is not installed")
        state = server.default_workbook_state()
        state["contacts"] = [{"id": 1, "email": "a@example.com", "isInfluencer": False}]
        state["events"] = {"gac_dinner": [{"fullName": "Attendee One"}]}
        state["stats"] = {"emailsSent": 3, "linkedinSent": 1, "callsMade": 0, "enrichedCount": 1}
        state["autoEnrich"] = True

        server.write_workbook_state(state)
        reloaded = server.read_workbook_state()

        self.assertEqual(reloaded["events"]["gac_dinner"][0]["fullName"], "Attendee One")
        self.assertEqual(reloaded["stats"]["emailsSent"], 3)
        self.assertTrue(reloaded["autoEnrich"])


if __name__ == "__main__":
    unittest.main()
