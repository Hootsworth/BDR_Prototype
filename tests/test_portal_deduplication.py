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
        elif method == "PUT":
            harness.do_PUT()
        elif method == "DELETE":
            harness.do_DELETE()

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

    def test_admin_influencer_update_and_delete(self):
        # 1. Update influencer (PUT /api/admin/partners/100)
        update_payload = {
            "fullName": "Sarah Jenkins Updated",
            "company": "Apex Capital Group",
            "jobTitle": "Senior Partner",
            "phone": "+1 555-123-4567",
            "referralCredits": 250
        }
        status, res = self.do_request("PUT", "/api/admin/partners/100", data=update_payload)
        self.assertEqual(status, 200)
        self.assertTrue(res.get("success"))
        self.assertEqual(res["data"]["fullName"], "Sarah Jenkins Updated")
        self.assertEqual(res["data"]["company"], "Apex Capital Group")
        self.assertEqual(res["data"]["referralCredits"], 250)

        # Verify state reflected update and propagated referredBy
        state = server.read_workbook_state()
        inf = next(c for c in state["contacts"] if c.get("id") == 100)
        self.assertEqual(inf["fullName"], "Sarah Jenkins Updated")
        self.assertEqual(inf["company"], "Apex Capital Group")
        contact = next(c for c in state["contacts"] if c.get("id") == 1001)
        self.assertEqual(contact.get("referredBy"), "Sarah Jenkins Updated")

        # 2. Delete influencer (DELETE /api/admin/partners/100)
        status, res = self.do_request("DELETE", "/api/admin/partners/100")
        self.assertEqual(status, 200)
        self.assertTrue(res.get("success"))
        self.assertTrue(res["data"]["deleted"])

        # Verify influencer removed and contact reassigned to Direct Enterprise Sourcing
        state = server.read_workbook_state()
        inf_exists = any(c.get("id") == 100 for c in state["contacts"])
        self.assertFalse(inf_exists)
        contact = next(c for c in state["contacts"] if c.get("id") == 1001)
        self.assertEqual(contact.get("referredBy"), "Direct Enterprise Sourcing")

    def test_admin_prospect_update_and_delete(self):
        # 1. Update prospect (PUT /api/admin/prospects/1001)
        update_payload = {
            "fullName": "Jonathan Executive Jr.",
            "company": "Enterprise Global",
            "jobTitle": "Chief Technology Officer",
            "relationshipStrength": "moderate",
            "outreachStatus": "Meeting Scheduled"
        }
        status, res = self.do_request("PUT", "/api/admin/prospects/1001", data=update_payload)
        self.assertEqual(status, 200)
        self.assertTrue(res.get("success"))
        self.assertEqual(res["data"]["fullName"], "Jonathan Executive Jr.")
        self.assertEqual(res["data"]["company"], "Enterprise Global")
        self.assertEqual(res["data"]["outreachStatus"], "Meeting Scheduled")

        # Verify state and influencer referrals updated
        state = server.read_workbook_state()
        c = next(x for x in state["contacts"] if x.get("id") == 1001)
        self.assertEqual(c["fullName"], "Jonathan Executive Jr.")
        partner = next(x for x in state["contacts"] if x.get("id") == 100)
        ref = next(r for r in partner.get("referrals", []) if r.get("id") == 1001)
        self.assertEqual(ref["fullName"], "Jonathan Executive Jr.")
        self.assertEqual(ref["outreachStatus"], "Meeting Scheduled")

        # 2. Delete prospect (DELETE /api/admin/prospects/1001)
        status, res = self.do_request("DELETE", "/api/admin/prospects/1001")
        self.assertEqual(status, 200)
        self.assertTrue(res.get("success"))
        self.assertTrue(res["data"]["deleted"])

        # Verify prospect removed from contacts and referrals
        state = server.read_workbook_state()
        c_exists = any(x.get("id") == 1001 for x in state["contacts"])
        self.assertFalse(c_exists)
        partner = next(x for x in state["contacts"] if x.get("id") == 100)
        ref_exists = any(r.get("id") == 1001 for r in partner.get("referrals", []))
        self.assertFalse(ref_exists)

    def test_go_relationship_update_and_delete(self):
        # 1. Update contact via influencer portal (PUT /api/go/relationships/1001)
        update_payload = {
            "fullName": "John Executive III",
            "company": "Target Corp International",
            "jobTitle": "VP of Architecture",
            "relationshipStrength": "strong",
            "relationshipContext": "Quarterly executive advisory catchup"
        }
        status, res = self.do_request("PUT", "/api/go/relationships/1001", data=update_payload, auth_token=self.token)
        self.assertEqual(status, 200)
        self.assertTrue(res.get("success"))
        self.assertEqual(res["data"]["fullName"], "John Executive III")
        self.assertEqual(res["data"]["company"], "Target Corp International")

        # Verify state
        state = server.read_workbook_state()
        partner = next(x for x in state["contacts"] if x.get("id") == 100)
        ref = next(r for r in partner.get("referrals", []) if r.get("id") == 1001)
        self.assertEqual(ref["fullName"], "John Executive III")
        self.assertEqual(ref["company"], "Target Corp International")

        # 2. Delete contact via influencer portal (DELETE /api/go/relationships/1001)
        status, res = self.do_request("DELETE", "/api/go/relationships/1001", auth_token=self.token)
        self.assertEqual(status, 200)
        self.assertTrue(res.get("success"))
        self.assertTrue(res["data"]["deleted"])

        # Verify referral removed
        state = server.read_workbook_state()
        partner = next(x for x in state["contacts"] if x.get("id") == 100)
        ref_exists = any(r.get("id") == 1001 for r in partner.get("referrals", []))
        self.assertFalse(ref_exists)


if __name__ == "__main__":
    unittest.main()
