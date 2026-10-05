import json
import tempfile
import unittest
import io
from pathlib import Path
from unittest.mock import patch

import server


class MarketplaceHttpFlowTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        root = Path(self.temp_dir.name)
        self.patches = patch.multiple(
            server,
            DB_PATH=str(root / "app.sqlite3"),
            DATA_DIR=str(root),
            WORKBOOK_PATH=str(root / "marketplace.xlsx"),
        )
        self.patches.start()
        state = server.default_workbook_state()
        state["contacts"] = [
            {
                "id": 20,
                "fullName": "Avery Influencer",
                "email": "avery@example.test",
                "company": "Avery Advisory",
                "isInfluencer": True,
                "agreements": [{"id": "agr-1", "status": "Signed", "name": "Partner Agreement"}],
                "referrals": [],
            },
            {
                "id": 21,
                "fullName": "Morgan Executive",
                "email": "morgan@company.test",
                "phone": "+1 415 555 0100",
                "company": "Example Bank",
                "jobTitle": "Chief Operating Officer",
                "influencerId": 20,
                "influencerEmail": "avery@example.test",
                "referredBy": "Avery Influencer",
                "isInfluencer": False,
            },
        ]
        server.write_workbook_state(state)
        self.base_url = "http://127.0.0.1"

    def tearDown(self):
        self.patches.stop()
        self.temp_dir.cleanup()

    def request(self, path, method="GET", data=None, token=None):
        body = b"" if data is None else json.dumps(data).encode("utf-8")
        headers = {"Content-Type": "application/json", "Content-Length": str(len(body))}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        class Harness(server.ProxyHTTPRequestHandler):
            def __init__(self, request_path, request_method, request_body, request_headers):
                self.path = request_path
                self.command = request_method
                self.rfile = io.BytesIO(request_body)
                self.wfile = io.BytesIO()
                self.headers = request_headers
                self.client_address = ("127.0.0.1", 12345)
                self.server = type("ServerStub", (), {"server_name": "localhost", "server_port": 8001})()
                self.responses = []
                self._headers = {}

            def send_response(self, status, message=None):
                self.responses.append(status)

            def send_header(self, key, value):
                self._headers[key] = value

            def end_headers(self):
                pass

            def log_message(self, *_args):
                pass

        handler = Harness(path, method, body, headers)
        if method == "POST":
            handler.do_POST()
        else:
            handler.do_GET()
        response_body = handler.wfile.getvalue()
        return handler.responses[-1], json.loads(response_body.decode("utf-8"))

    def test_vendor_to_influencer_marketplace_lifecycle(self):
        status, signup = self.request("/api/marketplace/vendors/signup", "POST", {
            "companyName": "Launch Vendor", "contactName": "Taylor Vendor",
            "email": "taylor@vendor.test", "password": "A-long-password-2026!",
        })
        self.assertEqual(status, 201)
        vendor_token = signup["token"]

        status, _ = self.request("/api/marketplace/network", token=vendor_token)
        self.assertEqual(status, 403, "network access remains gated before vendor agreement")

        status, agreement = self.request("/api/marketplace/vendor/agreement", "POST", {
            "signerName": "Taylor Vendor", "acceptedTerms": True,
        }, token=vendor_token)
        self.assertEqual(status, 200)
        self.assertEqual(agreement["vendor"]["agreementStatus"], "signed")

        status, network = self.request("/api/marketplace/network", token=vendor_token)
        self.assertEqual(status, 200)
        self.assertEqual(len(network["contacts"]), 1)
        self.assertFalse(network["contacts"][0]["piiUnlocked"])
        self.assertNotEqual(network["contacts"][0]["email"], "morgan@company.test")

        status, intro = self.request("/api/marketplace/requests", "POST", {
            "targetContactId": 21, "influencerId": 20,
            "vendorPitch": "Relevant product and a clear reason for the introduction.",
        }, token=vendor_token)
        self.assertEqual(status, 201)
        request_id = intro["request"]["id"]

        influencer_token = server.issue_partner_share_token(20)
        status, portal = self.request("/api/partner-share", token=influencer_token)
        self.assertEqual(status, 200)
        self.assertEqual(len(portal["marketplaceRequests"]), 1)
        status, _ = self.request("/api/partner-share/requests/respond", "POST", {
            "requestId": request_id, "decision": "schedule",
        }, token=influencer_token)
        self.assertEqual(status, 200)

        status, network = self.request("/api/marketplace/network", token=vendor_token)
        self.assertEqual(status, 200)
        unlocked = next(c for c in network["contacts"] if str(c["id"]) == "21")
        self.assertTrue(unlocked["piiUnlocked"])
        self.assertEqual(unlocked["email"], "morgan@company.test")
        self.assertEqual(unlocked["phone"], "+1 415 555 0100")
        self.assertEqual(network["requests"][0]["status"], "call_scheduled")

    def test_signup_rejects_short_password_and_unaccepted_agreement(self):
        short_password = self.request("/api/marketplace/vendors/signup", "POST", {
            "companyName": "Short Password", "contactName": "Taylor Vendor",
            "email": "short@vendor.test", "password": "short",
        })
        self.assertEqual(short_password[0], 400)
        unsigned = self.request("/api/partner-portal/signup", "POST", {
            "fullName": "New Influencer", "email": "new@example.test",
            "company": "New Advisory", "password": "A-long-password-2026!",
            "acceptAgreement": False,
        })
        self.assertEqual(unsigned[0], 400)

    def test_irm_cannot_fake_influencer_acceptance_or_complete_unscheduled_call(self):
        state = server.read_workbook_state()
        state["vendors"] = [{
            "id": 51, "companyName": "Operator Test Vendor", "contactName": "Taylor",
            "email": "ops@vendor.test", "agreementStatus": "signed",
            "networkAccessLevel": "full_partner_access", "sessionTokenHash": "x",
        }]
        state["marketplaceRequests"] = [{
            "id": 70, "vendorId": 51, "influencerId": 20, "targetContactId": 21,
            "status": "requested", "creditsAwarded": 0,
        }]
        server.write_workbook_state(state)
        # Local-only administrative routes normally require a loopback origin;
        # this in-memory handler is loopback and has no browser Origin header.
        accepted = self.request("/api/irm/requests/manage", "POST", {
            "requestId": 70, "status": "accepted",
        })
        self.assertEqual(accepted[0], 400)
        completed = self.request("/api/irm/requests/manage", "POST", {
            "requestId": 70, "status": "call_completed",
        })
        self.assertEqual(completed[0], 409)

        # Admin vendor approval cannot forge the participant's signed agreement.
        unsigned_vendor = self.request("/api/marketplace/vendors/signup", "POST", {
            "companyName": "Unsigned Vendor", "contactName": "Riley",
            "email": "riley@vendor.test", "password": "A-long-password-2026!",
        })[1]
        approved = self.request("/api/irm/vendors/manage", "POST", {
            "vendorId": unsigned_vendor["vendor"]["id"], "action": "approve_vendor",
        })
        self.assertEqual(approved[0], 200)
        self.assertEqual(approved[1]["vendor"]["agreementStatus"], "none")


if __name__ == "__main__":
    unittest.main()
