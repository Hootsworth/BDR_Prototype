import io
import json
import os
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

import server


class PortalDeduplicationTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        root = Path(self.temp_dir.name)
        self.paths = patch.multiple(
            server,
            DB_PATH=str(root / "app.sqlite3"),
            DATA_DIR=str(root),
            WORKBOOK_PATH=str(root / "state.xlsx")
        )
        self.paths.start()

        # Seed initial state with 1 influencer having 1 referral and 1 direct enterprise contact
        state = server.default_workbook_state()
        state["contacts"] = [
            {
                "id": 100,
                "fullName": "Sarah Partner",
                "email": "sarah@apex.vc",
                "company": "Apex VC",
                "jobTitle": "Managing Partner",
                "isInfluencer": True,
                "referrals": [
                    {
                        "id": 1001,
                        "fullName": "John Executive",
                        "email": "john@targetcorp.com",
                        "company": "Target Corp",
                        "jobTitle": "CTO",
                        "strength": "strong"
                    }
                ]
            },
            {
                "id": 1001,
                "fullName": "John Executive",
                "email": "john@targetcorp.com",
                "company": "Target Corp",
                "jobTitle": "CTO",
                "isInfluencer": False,
                "partnerId": "partner_100",
                "influencerId": 100,
                "referredBy": "Sarah Partner"
            },
            {
                "id": 2001,
                "fullName": "Direct Sourced Lead",
                "email": "lead@directenterprise.com",
                "company": "Direct Corp",
                "jobTitle": "VP Eng",
                "isInfluencer": False
            }
        ]
        server.write_workbook_state(state)
        self.token = server.issue_partner_share_token(100)

    def tearDown(self):
        self.paths.stop()
        self.temp_dir.cleanup()

    def do_request(self, method, path, data=None, auth_token=None):
        body = json.dumps(data).encode("utf-8") if data is not None else b""
        headers = {
            "Content-Type": "application/json",
            "Content-Length": str(len(body))
        }
        if auth_token:
            headers["Authorization"] = f"Bearer {auth_token}"

        captured = {}

        class Harness(server.ProxyHTTPRequestHandler):
            def __init__(self):
                self.path = path
                self.rfile = io.BytesIO(body)
                self.wfile = io.BytesIO()
                self.headers = headers
                self.client_address = ("127.0.0.1", 12345)
                self.server = type("ServerStub", (), {"server_name": "localhost", "server_port": 8001})()

            def send_response(self, code, message=None):
                captured["status"] = code

            def send_header(self, keyword, value):
                captured.setdefault("headers", {})[keyword] = value

            def end_headers(self):
                pass

        harness = Harness()
        if method == "GET":
            harness.do_GET()
        elif method == "POST":
            harness.do_POST()

        raw_output = harness.wfile.getvalue().decode("utf-8")
        try:
            return captured.get("status"), json.loads(raw_output)
        except Exception:
            return captured.get("status"), raw_output

    def test_admin_prospects_does_not_duplicate_influencer_contacts_under_direct_enterprise(self):
        status, res = self.do_request("GET", "/api/admin/prospects")
        self.assertEqual(status, 200)
        self.assertTrue(res.get("success"))
        prospects = res.get("data", [])

        # There should be exactly 2 prospects: John Executive (Apex VC) and Direct Sourced Lead (Direct Enterprise Sourcing)
        self.assertEqual(len(prospects), 2)

        john_entries = [p for p in prospects if p.get("email") == "john@targetcorp.com"]
        self.assertEqual(len(john_entries), 1, "John Executive must only appear once, not duplicated under Direct Enterprise Sourcing")
        self.assertEqual(john_entries[0]["partnerName"], "Sarah Partner")

        direct_entries = [p for p in prospects if p.get("partnerName") == "Direct Enterprise Sourcing"]
        self.assertEqual(len(direct_entries), 1)
        self.assertEqual(direct_entries[0]["email"], "lead@directenterprise.com")

    def test_go_relationships_deduplication(self):
        # Adding a contact with the same email as an existing referral should deduplicate
        payload = {
            "fullName": "John Executive",
            "email": "john@targetcorp.com",
            "company": "Target Corp",
            "jobTitle": "CTO",
            "relationshipStrength": "strong"
        }
        status, res = self.do_request("POST", "/api/go/relationships", data=payload, auth_token=self.token)
        self.assertEqual(status, 200)
        self.assertTrue(res.get("success"))
        self.assertTrue(res.get("deduplicated"))

        # Verify state did not duplicate
        state = server.read_workbook_state()
        partner = next(c for c in state["contacts"] if c.get("id") == 100)
        matching_refs = [r for r in partner.get("referrals", []) if r.get("email") == "john@targetcorp.com"]
        self.assertEqual(len(matching_refs), 1)

    def test_go_outreach_email_deduplication(self):
        # Seed an email outreach activity
        state = server.read_workbook_state()
        state.setdefault("outreachActivities", []).append({
            "id": "gmail_msg_12345",
            "partnerId": "partner_100",
            "prospectId": 1001,
            "channel": "email",
            "recipientEmail": "john@targetcorp.com",
            "subject": "Introduction to ConnectEM",
            "content": "Hi John, check this out.",
            "adminCcEnforced": "nextbdr@gmail.com",
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        })
        server.write_workbook_state(state)

        # Attempt sending the exact same email immediately
        payload = {
            "prospectId": 1001,
            "subject": "Introduction to ConnectEM",
            "body": "Hi John, check this out."
        }
        status, res = self.do_request("POST", "/api/go/outreach/email", data=payload, auth_token=self.token)
        self.assertEqual(status, 200)
        self.assertTrue(res.get("success"))
        self.assertTrue(res.get("deduplicated"))
        self.assertEqual(res.get("providerId"), "gmail_msg_12345")


if __name__ == "__main__":
    unittest.main()
