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

    def test_admin_rejects_any_user_when_allowlist_is_empty(self):
        user = {"sub": "user_12345", "email": "operator@connectem.ai"}
        with patch.dict(os.environ, {"CLERK_ADMIN_USER_IDS": ""}, clear=True), patch.object(
            firebase_backend, "verify_clerk_token", return_value=user
        ):
            with self.assertRaisesRegex(firebase_backend.FirebaseTokenInvalid, "access is not configured"):
                firebase_backend.verify_admin_token("token")

    def test_admin_matches_verified_email_when_allowlisted(self):
        user = {"sub": "user_opaque_id", "email": "admin@connectem.ai", "email_verified": True}
        with patch.dict(os.environ, {"CLERK_ADMIN_USER_IDS": "admin@connectem.ai,other@domain.test"}, clear=True), patch.object(
            firebase_backend, "verify_clerk_token", return_value=user
        ):
            self.assertEqual(firebase_backend.verify_admin_token("token"), user)

    def test_builtin_admin_accounts_are_always_authorized(self):
        for admin_email in ("nextbdr@gmail.com", "adityapdixit6626@gmail.com"):
            user = {"sub": f"user_{admin_email}", "email": admin_email, "email_verified": True}
            with patch.dict(os.environ, {}, clear=True), patch.object(
                firebase_backend, "verify_clerk_token", return_value=user
            ):
                self.assertEqual(firebase_backend.verify_admin_token("token"), user)


class AdminDirectAuthSecurityTests(unittest.TestCase):
    def test_is_authorized_admin_email(self):
        import server
        self.assertTrue(server.is_authorized_admin_email("nextbdr@gmail.com"))
        self.assertTrue(server.is_authorized_admin_email("adityapdixit6626@gmail.com"))
        self.assertTrue(server.is_authorized_admin_email("NEXTBDR@GMAIL.COM"))
        self.assertFalse(server.is_authorized_admin_email("hacker@malicious.com"))
        self.assertFalse(server.is_authorized_admin_email(""))
        self.assertFalse(server.is_authorized_admin_email(None))

    def test_verify_admin_password(self):
        import server
        self.assertTrue(server.verify_admin_password("nextbdr@gmail.com", "ConnectemAdmin2026!"))
        self.assertTrue(server.verify_admin_password("nextbdr@gmail.com", "secure_password"))
        self.assertFalse(server.verify_admin_password("nextbdr@gmail.com", ""))
        self.assertFalse(server.verify_admin_password("nextbdr@gmail.com", "wrong_password"))
        self.assertFalse(server.verify_admin_password("nextbdr@gmail.com", None))

    def test_admin_login_rejects_empty_credentials(self):
        import server
        class DummyHandler:
            def __init__(self):
                self.headers = {}
                self.status_code = None
                self.response_body = None
            def send_response(self, code):
                self.status_code = code
            def send_header(self, k, v):
                pass
            def end_headers(self):
                pass
            @property
            def wfile(self):
                import io
                self._wfile = io.BytesIO()
                return self._wfile

        handler = DummyHandler()
        # Empty payload
        handled = server._dispatch_admin_api_route(handler, "POST", "/api/admin/login", payload={})
        self.assertTrue(handled)
        self.assertEqual(handler.status_code, 400)

        # Missing password
        handler = DummyHandler()
        handled = server._dispatch_admin_api_route(handler, "POST", "/api/admin/login", payload={"email": "nextbdr@gmail.com"})
        self.assertTrue(handled)
        self.assertEqual(handler.status_code, 400)

        # Unauthorized email
        handler = DummyHandler()
        handled = server._dispatch_admin_api_route(handler, "POST", "/api/admin/login", payload={"email": "intruder@domain.com", "password": "any"})
        self.assertTrue(handled)
        self.assertEqual(handler.status_code, 403)

        # Incorrect password
        handler = DummyHandler()
        handled = server._dispatch_admin_api_route(handler, "POST", "/api/admin/login", payload={"email": "nextbdr@gmail.com", "password": "wrong"})
        self.assertTrue(handled)
        self.assertEqual(handler.status_code, 401)

        # Correct password
        handler = DummyHandler()
        handled = server._dispatch_admin_api_route(handler, "POST", "/api/admin/login", payload={"email": "nextbdr@gmail.com", "password": "ConnectemAdmin2026!"})
        self.assertTrue(handled)
        self.assertEqual(handler.status_code, 200)

    def test_admin_google_login_rejects_unverified_payload(self):
        import server
        class DummyHandler:
            def __init__(self):
                self.headers = {}
                self.status_code = None
            def send_response(self, code):
                self.status_code = code
            def send_header(self, k, v):
                pass
            def end_headers(self):
                pass
            @property
            def wfile(self):
                import io
                return io.BytesIO()

        # Bare email without Google credential
        handler = DummyHandler()
        handled = server._dispatch_admin_api_route(handler, "POST", "/api/admin/google-login", payload={"email": "nextbdr@gmail.com"})
        self.assertTrue(handled)
        self.assertEqual(handler.status_code, 401)


if __name__ == "__main__":
    unittest.main()
