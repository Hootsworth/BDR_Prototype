import json
import os
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
                "passwordHash": server.hash_portal_password("welcomebdr123!"),
                "mustChangePassword": True,
                "passwordChanged": False,
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
        login_status, login = self.request("/api/partner-portal/login", "POST", {
            "email": "avery@example.test", "password": "welcomebdr123!",
        })
        self.assertEqual(login_status, 200)
        partner_token = login["token"]

        # 1. Authenticated partner submits intros in partner portal
        status, res = self.request("/api/partner-portal/sync-partner", "POST", {
            "partner": {
                "uid": "legacy_user_9988",
                "fullName": "Avery Influencer",
                "email": "avery@example.test",
                "company": "Rostova Capital Advisory",
                "jobTitle": "Managing Partner & FinTech Lead",
                "domain": "Fintech & Banking",
                "linkedin": "https://linkedin.com/in/elena-rostova",
                "phone": "+1 (415) 555-9876",
                "location": "San Francisco, CA",
                "points": 999999
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
        }, token=partner_token)
        self.assertEqual(status, 200)
        self.assertEqual(res["status"], "synced")
        influencer = res["influencer"]
        self.assertEqual(influencer["fullName"], "Avery Influencer")
        self.assertEqual(influencer["company"], "Rostova Capital Advisory")
        self.assertEqual(influencer["jobTitle"], "Managing Partner & FinTech Lead")
        self.assertEqual(influencer["domain"], "Fintech & Banking")
        self.assertEqual(influencer["phone"], "+1 (415) 555-9876")
        self.assertEqual(influencer["location"], "San Francisco, CA")
        self.assertEqual(influencer["linkedinUrl"], "https://linkedin.com/in/elena-rostova")
        self.assertTrue(influencer["isInfluencer"])

        # 2. Verify state in workbook / DB for admin console
        state = server.read_workbook_state()
        admin_influencer = next((c for c in state["contacts"] if c.get("isInfluencer") and c.get("email") == "avery@example.test"), None)
        self.assertIsNotNone(admin_influencer)
        self.assertEqual(admin_influencer["domain"], "Fintech & Banking")
        self.assertEqual(admin_influencer["phone"], "+1 (415) 555-9876")
        self.assertEqual(admin_influencer["location"], "San Francisco, CA")
        self.assertEqual(admin_influencer.get("referralCredits", 0), 0)

        # 3. Verify referred contact exists with correct referral linkage
        referred_contact = next((c for c in state["contacts"] if c.get("email") == "marcus.vance@apexbank.test"), None)
        self.assertIsNotNone(referred_contact)
        self.assertEqual(referred_contact["referredBy"], "Avery Influencer")
        self.assertEqual(referred_contact["referredByEmail"], "avery@example.test")
        self.assertEqual(referred_contact["influencerId"], admin_influencer["id"])
        self.assertTrue(referred_contact["hasScheduledCall"])

        # 4. Verify GET /api/partner-portal/sync-partner returns partner & referrals
        status_get, res_get = self.request("/api/partner-portal/sync-partner?email=avery@example.test", "GET", token=partner_token)
        self.assertEqual(status_get, 200)
        self.assertEqual(res_get["influencer"]["fullName"], "Avery Influencer")
        self.assertEqual(len(res_get["referrals"]), 2)
        self.assertEqual({r["fullName"] for r in res_get["referrals"]}, {"Marcus Vance", "Morgan Executive"})

    def test_partner_portal_sync_partner_allowed_in_hosted_mode(self):
        with patch.dict(os.environ, {"HOSTED_API_ONLY": "true"}):
            self.assertTrue(server.hosted_api_request_allowed(None, "GET", "/api/partner-portal/sync-partner"))
            self.assertTrue(server.hosted_api_request_allowed(None, "POST", "/api/partner-portal/sync-partner"))
            self.assertTrue(server.hosted_api_request_allowed(None, "POST", "/api/partner-portal/login"))
            self.assertTrue(server.hosted_api_request_allowed(None, "POST", "/api/partner-portal/change-password"))

    def test_partner_portal_sync_requires_own_share_token_and_rejects_forged_points(self):
        status, _ = self.request("/api/partner-portal/sync-partner", "POST", {
            "partner": {"fullName": "Attacker", "email": "victim@example.test", "points": 500000},
            "intros": [],
        })
        self.assertEqual(status, 401)
        read_status, _ = self.request("/api/partner-portal/sync-partner?email=avery@example.test")
        self.assertEqual(read_status, 401)

    def test_legacy_partner_password_is_hashed_after_successful_login(self):
        state = server.read_workbook_state()
        state["contacts"].append({
            "id": 29, "fullName": "Legacy Partner", "email": "legacy@example.test",
            "isInfluencer": True, "defaultPassword": "old-plaintext-password",
            "mustChangePassword": True, "passwordChanged": False,
        })
        server.write_workbook_state(state)
        status, response = self.request("/api/partner-portal/login", "POST", {
            "email": "legacy@example.test", "password": "old-plaintext-password",
        })
        self.assertEqual(status, 200)
        self.assertNotIn("passwordHash", response["partner"])
        saved = next(c for c in server.read_workbook_state()["contacts"] if c["email"] == "legacy@example.test")
        self.assertTrue(server.verify_portal_password("old-plaintext-password", saved["passwordHash"]))
        self.assertFalse(saved.get("defaultPassword"))

    def test_influencer_creation_and_partner_login_flow(self):
        # 1. Admin must provision a unique password for the influencer.
        create_status, create_res = self.request("/api/influencers/create", "POST", {
            "fullName": "Sarah Jenkins",
            "email": "sarah.jenkins@partner.test",
            "company": "Jenkins Advisory",
            "jobTitle": "Fintech Strategy Director"
        })
        self.assertEqual(create_status, 400)
        create_status, create_res = self.request("/api/influencers/create", "POST", {
            "fullName": "Sarah Jenkins",
            "email": "sarah.jenkins@partner.test",
            "company": "Jenkins Advisory",
            "jobTitle": "Fintech Strategy Director",
            "password": "Initial-Password-2026!",
        })
        self.assertEqual(create_status, 201)
        self.assertTrue(create_res["success"])
        self.assertNotIn("defaultPassword", create_res["influencer"])
        self.assertNotIn("passwordHash", create_res["influencer"])
        self.assertTrue(create_res["influencer"]["mustChangePassword"])

        # 2. Partner portal signup is disabled (returns 410)
        signup_status, signup_res = self.request("/api/partner-portal/signup", "POST", {
            "fullName": "Sarah Jenkins",
            "email": "sarah.jenkins@partner.test",
            "password": "SomePassword!",
        })
        self.assertEqual(signup_status, 410)

        # 3. Partner logs in with the provisioned one-time password.
        login_status, login_res = self.request("/api/partner-portal/login", "POST", {
            "email": "sarah.jenkins@partner.test",
            "password": "Initial-Password-2026!",
        })
        self.assertEqual(login_status, 200)
        self.assertTrue(login_res["success"])
        self.assertTrue(login_res["mustChangePassword"])
        self.assertEqual(login_res["influencer"]["fullName"], "Sarah Jenkins")
        self.assertNotIn("passwordHash", login_res["influencer"])

        missing_current_status, _ = self.request("/api/partner-portal/change-password", "POST", {
            "email": "sarah.jenkins@partner.test",
            "newPassword": "MyNewSecurePassword2026!",
        }, token=login_res["token"])
        self.assertEqual(missing_current_status, 400)

        # 4. Partner changes password to custom secure password
        change_status, change_res = self.request("/api/partner-portal/change-password", "POST", {
            "email": "sarah.jenkins@partner.test",
            "currentPassword": "Initial-Password-2026!",
            "newPassword": "MyNewSecurePassword2026!"
        }, token=login_res["token"])
        self.assertEqual(change_status, 200)
        self.assertTrue(change_res["success"])
        self.assertFalse(change_res["influencer"]["mustChangePassword"])
        self.assertNotIn("defaultPassword", change_res["influencer"])
        self.assertNotIn("passwordHash", change_res["influencer"])
        stored = next(c for c in server.read_workbook_state()["contacts"] if c["email"] == "sarah.jenkins@partner.test")
        self.assertTrue(server.verify_portal_password("MyNewSecurePassword2026!", stored["passwordHash"]))
        self.assertNotIn("defaultPassword", stored)

        # 5. Partner logs in with old password (now rejected)
        old_status, old_res = self.request("/api/partner-portal/login", "POST", {
            "email": "sarah.jenkins@partner.test",
            "password": "Initial-Password-2026!",
        })
        self.assertEqual(old_status, 401)

        # 6. Partner logs in with new custom password (accepted, mustChangePassword=False)
        new_status, new_res = self.request("/api/partner-portal/login", "POST", {
            "email": "sarah.jenkins@partner.test",
            "password": "MyNewSecurePassword2026!",
        })
        self.assertEqual(new_status, 200)
        self.assertTrue(new_res["success"])
        self.assertFalse(new_res["mustChangePassword"])

    def test_auto_generated_temporary_password_and_mandatory_change_flow(self):
        # Admin provisions partner without specifying password; system auto-generates temporary password
        with patch.dict(os.environ, {"RESEND_API_KEY": "test-resend-key", "RESEND_FROM_EMAIL": "notifications@example.test"}), \
             patch.object(server, "post_json", return_value=(200, {"id": "resend-invite-test"})):
            create_status, create_res = self.request("/api/influencers/create", "POST", {
                "profile": {
                    "fullName": "Marcus Vance",
                    "email": "marcus.vance@cu-growth.test",
                    "company": "Vance Advisory",
                    "jobTitle": "Strategic Advisor"
                },
                "autoGeneratePassword": True,
                "sendInvite": True
            })
        self.assertEqual(create_status, 201)
        self.assertTrue(create_res["success"])
        temp_pwd = create_res["temporaryPassword"]
        self.assertTrue(len(temp_pwd) >= 12)
        self.assertTrue(create_res["invitation"]["sent"])

        # Partner logs in with the temporary password
        login_status, login_res = self.request("/api/partner-portal/login", "POST", {
            "email": "marcus.vance@cu-growth.test",
            "password": temp_pwd,
        })
        self.assertEqual(login_status, 200)
        self.assertTrue(login_res["mustChangePassword"])
        portal_token = login_res["token"]

        # Changing password rejects same temporary password
        same_status, same_res = self.request("/api/partner-portal/change-password", "POST", {
            "email": "marcus.vance@cu-growth.test",
            "currentPassword": temp_pwd,
            "newPassword": temp_pwd
        }, token=portal_token)
        self.assertEqual(same_status, 400)

        # Changing password to new permanent password
        change_status, change_res = self.request("/api/partner-portal/change-password", "POST", {
            "email": "marcus.vance@cu-growth.test",
            "currentPassword": temp_pwd,
            "newPassword": "MarcusPermanent2026!"
        }, token=portal_token)
        self.assertEqual(change_status, 200)
        self.assertTrue(change_res["success"])
        self.assertFalse(change_res["influencer"]["mustChangePassword"])

        # Re-login with permanent password
        relog_status, relog_res = self.request("/api/partner-portal/login", "POST", {
            "email": "marcus.vance@cu-growth.test",
            "password": "MarcusPermanent2026!",
        })
        self.assertEqual(relog_status, 200)
        self.assertFalse(relog_res["mustChangePassword"])

    def test_influencer_create_with_query_params_and_update_check_behavior(self):
        # 1. Influencer create matches even when query parameters are present on the URL
        status, res = self.request("/api/influencers/create?origin=admin&v=1.0", "POST", {
            "profile": {
                "fullName": "Query Param Test Partner",
                "email": "query.partner@cu-test.org",
                "company": "Query Advisory",
            },
            "autoGeneratePassword": True,
            "sendInvite": True
        })
        self.assertEqual(status, 201)
        self.assertTrue(res["success"])

        # 2. check_for_updates returns update_available=False on Vercel
        import os
        from server import check_for_updates
        orig_vercel = os.environ.get("VERCEL")
        try:
            os.environ["VERCEL"] = "1"
            info = check_for_updates()
            self.assertFalse(info["update_available"])
            self.assertEqual(info["current_commit"], "production")
        finally:
            if orig_vercel is None:
                os.environ.pop("VERCEL", None)
            else:
                os.environ["VERCEL"] = orig_vercel


if __name__ == "__main__":
    unittest.main()

