import os
import unittest
from unittest.mock import patch

import firebase_backend


class ClerkTokenVerificationTests(unittest.TestCase):
    def test_clerk_token_requires_issuer(self):
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(firebase_backend.FirebaseBackendUnavailable):
                firebase_backend.verify_clerk_token("token")

    def test_admin_requires_allowlisted_clerk_subject(self):
        with patch.dict(os.environ, {"CLERK_ADMIN_USER_IDS": "user_admin"}, clear=True), patch.object(
            firebase_backend, "verify_clerk_token", return_value={"sub": "user_other"}
        ):
            with self.assertRaises(firebase_backend.FirebaseTokenInvalid):
                firebase_backend.verify_admin_token("token")

    def test_allowlisted_clerk_subject_is_admin(self):
        expected = {"sub": "user_admin", "email": "admin@example.test"}
        with patch.dict(os.environ, {"CLERK_ADMIN_USER_IDS": "user_admin"}, clear=True), patch.object(
            firebase_backend, "verify_clerk_token", return_value=expected
        ):
            self.assertEqual(firebase_backend.verify_admin_token("token"), expected)


if __name__ == "__main__":
    unittest.main()
