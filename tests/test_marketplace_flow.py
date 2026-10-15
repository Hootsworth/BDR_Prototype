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
        self.assertEqual(status, 403, "network access remains gated before IRM approval")

        status, _ = self.request("/api/marketplace/requests", "POST", {
            "targetContactId": 21, "influencerId": 20, "vendorPitch": "Request before approval"
        }, token=vendor_token)
        self.assertEqual(status, 403, "pending vendors cannot create requests")

        status, _ = self.request("/api/irm/vendors/manage", "POST", {
            "vendorId": signup["vendor"]["id"], "action": "approve_vendor"
        })
        self.assertEqual(status, 200)

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
        self.assertEqual(status, 409, "IRM must route requests before an influencer can act")
        status, _ = self.request("/api/irm/requests/manage", "POST", {
            "requestId": request_id, "status": "irm_approved",
        })
        self.assertEqual(status, 200)
        status, _ = self.request("/api/partner-share/requests/respond", "POST", {
            "requestId": request_id, "decision": "schedule",
        }, token=influencer_token)
        self.assertEqual(status, 200)
        status, _ = self.request("/api/partner-share/requests/respond", "POST", {
            "requestId": request_id, "decision": "complete",
        }, token=influencer_token)
        self.assertEqual(status, 409, "influencers cannot self-verify completed meetings")

        status, network = self.request("/api/marketplace/network", token=vendor_token)
        self.assertEqual(status, 200)
        unlocked = next(c for c in network["contacts"] if str(c["id"]) == "21")
        self.assertTrue(unlocked["piiUnlocked"])
        self.assertEqual(unlocked["email"], "morgan@company.test")
        self.assertEqual(unlocked["phone"], "+1 415 555 0100")
        self.assertEqual(network["requests"][0]["status"], "call_scheduled")

        premature = self.request("/api/irm/requests/manage", "POST", {
            "requestId": request_id, "status": "call_completed",
        })
        self.assertEqual(premature[0], 400, "meeting completion requires buyer evidence")
        completed = self.request("/api/irm/requests/manage", "POST", {
            "requestId": request_id, "status": "call_completed", "evidence": "Buyer confirmed meeting held on 2026-10-09."
        })
        self.assertEqual(completed[0], 200)

        # Evidence-backed points can only be awarded by an IRM administrator.
        awarded = self.request("/api/irm/requests/manage", "POST", {
            "requestId": request_id, "status": "award_milestone",
            "milestone": "warm_introduction", "evidence": "Buyer confirmed the permissioned email handoff."
        })
        self.assertEqual(awarded[0], 200)
        self.assertEqual(awarded[1]["rewardEvent"]["points"], 200)
        duplicate = self.request("/api/irm/requests/manage", "POST", {
            "requestId": request_id, "status": "award_milestone",
            "milestone": "warm_introduction", "evidence": "Buyer confirmed the permissioned email handoff."
        })
        self.assertEqual(duplicate[0], 200)
        self.assertEqual(len(server.read_workbook_state()["rewardLedger"]), 1)

        redemption = self.request("/api/partner-share/rewards/redeem", "POST", {
            "rewardType": "vip_dinner", "points": 150, "details": "Prefer west coast event"
        }, token=influencer_token)
        self.assertEqual(redemption[0], 201)
        excessive = self.request("/api/partner-share/rewards/redeem", "POST", {
            "rewardType": "cash", "points": 100, "details": ""
        }, token=influencer_token)
        self.assertEqual(excessive[0], 409)

    def test_vendor_signup_validates_password_and_legacy_partner_signup_is_retired(self):
        short_password = self.request("/api/marketplace/vendors/signup", "POST", {
            "companyName": "Short Password", "contactName": "Taylor Vendor",
            "email": "short@vendor.test", "password": "short",
        })
        self.assertEqual(short_password[0], 400)
        legacy_signup = self.request("/api/partner-portal/signup", "POST", {
            "fullName": "New Influencer", "email": "new@example.test",
            "company": "New Advisory", "password": "A-long-password-2026!",
            "acceptAgreement": False,
        })
        self.assertEqual(legacy_signup[0], 410)
        self.assertIn("Clerk", legacy_signup[1]["error"])

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

    def test_partner_portal_sync_partner_and_intros_show_up_in_admin_influencer_portal(self):
        # 1. Partner registers and submits intros in partner portal
        status, res = self.request("/api/partner-portal/sync-partner", "POST", {
            "partner": {
                "uid": "fb_user_9988",
                "fullName": "Elena Rostova",
                "email": "elena.rostova@advisorycapital.test",
                "company": "Rostova Capital Advisory",
                "jobTitle": "Managing Partner & FinTech Lead",
                "domain": "Fintech & Banking",
                "linkedin": "https://linkedin.com/in/elena-rostova",
                "phone": "+1 (415) 555-9876",
                "location": "San Francisco, CA",
                "points": 400
            },
            "intros": [
                {
                    "id": 17290001,
                    "name": "Marcus Vance",
                    "company": "Apex Global Bank",
                    "title": "Chief Technology Officer",
                    "email": "marcus.vance@apexbank.test",
                    "phone": "+1 415 555 4321",
                    "linkedin": "https://linkedin.com/in/marcus-vance",
                    "location": "New York, NY",
                    "status": "Call Scheduled",
                    "meetingDate": "2026-10-25",
                    "meetingTime": "14:00",
                    "context": "Direct introduction for enterprise LLM guardrails.",
                    "pointsAwarded": 200
                }
            ]
        })
        self.assertEqual(status, 200)
        self.assertEqual(res["status"], "synced")
        influencer = res["influencer"]
        self.assertEqual(influencer["fullName"], "Elena Rostova")
        self.assertEqual(influencer["company"], "Rostova Capital Advisory")
        self.assertEqual(influencer["jobTitle"], "Managing Partner & FinTech Lead")
        self.assertEqual(influencer["domain"], "Fintech & Banking")
        self.assertEqual(influencer["phone"], "+1 (415) 555-9876")
        self.assertEqual(influencer["location"], "San Francisco, CA")
        self.assertEqual(influencer["linkedinUrl"], "https://linkedin.com/in/elena-rostova")
        self.assertTrue(influencer["isInfluencer"])

        # 2. Verify state in workbook / DB for admin console
        state = server.read_workbook_state()
        admin_influencer = next((c for c in state["contacts"] if c.get("isInfluencer") and c.get("email") == "elena.rostova@advisorycapital.test"), None)
        self.assertIsNotNone(admin_influencer)
        self.assertEqual(admin_influencer["domain"], "Fintech & Banking")
        self.assertEqual(admin_influencer["phone"], "+1 (415) 555-9876")
        self.assertEqual(admin_influencer["location"], "San Francisco, CA")

        # 3. Verify referred contact exists with correct referral linkage
        referred_contact = next((c for c in state["contacts"] if c.get("email") == "marcus.vance@apexbank.test"), None)
        self.assertIsNotNone(referred_contact)
        self.assertEqual(referred_contact["referredBy"], "Elena Rostova")
        self.assertEqual(referred_contact["referredByEmail"], "elena.rostova@advisorycapital.test")
        self.assertEqual(referred_contact["influencerId"], admin_influencer["id"])
        self.assertTrue(referred_contact["hasScheduledCall"])

        # 4. Verify GET /api/partner-portal/sync-partner returns partner & referrals
        status_get, res_get = self.request("/api/partner-portal/sync-partner?email=elena.rostova@advisorycapital.test", "GET")
        self.assertEqual(status_get, 200)
        self.assertEqual(res_get["influencer"]["fullName"], "Elena Rostova")
        self.assertEqual(len(res_get["referrals"]), 1)
        self.assertEqual(res_get["referrals"][0]["fullName"], "Marcus Vance")


if __name__ == "__main__":
    unittest.main()
