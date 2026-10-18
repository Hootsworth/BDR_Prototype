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

    def test_admin_allows_verified_clerk_user_when_allowlist_is_empty(self):
        user = {"sub": "user_12345", "email": "operator@connectem.ai"}
        with patch.dict(os.environ, {"CLERK_ADMIN_USER_IDS": ""}, clear=True), patch.object(
            firebase_backend, "verify_clerk_token", return_value=user
        ):
            self.assertEqual(firebase_backend.verify_admin_token("token"), user)

    def test_admin_matches_by_email_when_allowlisted(self):
        user = {"sub": "user_opaque_id", "email": "admin@connectem.ai"}
        with patch.dict(os.environ, {"CLERK_ADMIN_USER_IDS": "admin@connectem.ai,other@domain.test"}, clear=True), patch.object(
            firebase_backend, "verify_clerk_token", return_value=user
        ):
            self.assertEqual(firebase_backend.verify_admin_token("token"), user)


if __name__ == "__main__":
    unittest.main()
