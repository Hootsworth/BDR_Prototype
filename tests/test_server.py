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
        self.env_patch = patch.dict(os.environ, {"PROTOTYPE_DAILY_SEND_LIMIT": "2", "TOKEN_ENCRYPTION_KEY": server.Fernet.generate_key().decode()})
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


if __name__ == "__main__":
    unittest.main()
