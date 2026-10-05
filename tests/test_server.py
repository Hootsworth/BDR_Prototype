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

    def test_linkedin_url_validation_and_normalization(self):
        self.assertEqual(
            server.normalize_linkedin_url("linkedin.com/in/jordan-vance"),
            "https://www.linkedin.com/in/jordan-vance",
        )
        self.assertTrue(server.is_valid_linkedin_profile_url("https://www.linkedin.com/in/jordan-vance"))
        self.assertTrue(server.is_valid_linkedin_profile_url("linkedin.com/company/acme-corp"))
        self.assertFalse(server.is_valid_linkedin_profile_url(""))
        self.assertFalse(server.is_valid_linkedin_profile_url("https://example.com/in/jordan-vance"))
        self.assertFalse(server.is_valid_linkedin_profile_url("https://www.linkedin.com/feed/"))

    def test_standardized_referral_credits_and_partner_contacts_parity(self):
        c_shared = {"fullName": "A", "hasScheduledCall": False, "hasTakenCall": False}
        c_sched = {"fullName": "B", "hasScheduledCall": True, "hasTakenCall": False}
        c_taken = {"fullName": "C", "hasScheduledCall": True, "hasTakenCall": True}
        self.assertEqual(server.compute_contact_referral_credits(c_shared), 10)
        self.assertEqual(server.compute_contact_referral_credits(c_sched), 15)
        self.assertEqual(server.compute_contact_referral_credits(c_taken), 25)

        state = {
            "contacts": [
                {"id": 10, "fullName": "Kim Beluzo", "email": "kim@beluzo.com", "isInfluencer": True},
                {"id": 101, "fullName": "Ref By Name", "email": "r1@example.com", "isInfluencer": False, "referredBy": "Kim Beluzo"},
                {"id": 102, "fullName": "Ref By Id", "email": "r2@example.com", "isInfluencer": False, "influencerId": 10},
            ]
        }
        matched = server.partner_contacts_for_influencer(state, state["contacts"][0])
        self.assertEqual(len(matched), 2)

    def test_model2_marketplace_vendor_and_pii_masking(self):
        # Password hashing & verification
        pw_hash = server.hash_portal_password("secret123")
        self.assertTrue(server.verify_portal_password("secret123", pw_hash))
        self.assertFalse(server.verify_portal_password("wrong", pw_hash))

        # PII masking before vs after Influencer acceptance
        contact = {
            "id": 501,
            "fullName": "Jordan Vance",
            "email": "jordan@pacificcu.org",
            "company": "Pacific Crest Credit Union",
            "jobTitle": "Chief Lending Officer",
            "phone": "+1 415 555 0192",
            "linkedin": "https://www.linkedin.com/in/jordan-vance",
            "location": "San Diego, CA",
            "hasScheduledCall": False,
            "hasTakenCall": False,
        }
        influencer = {"id": 10, "fullName": "Kim Beluzo", "company": "Beluzo Advisory"}
        masked = server.mask_contact_for_marketplace(contact, influencer, unlocked_contact_ids=set())
        self.assertEqual(masked["fullName"], "Jordan V.")
        self.assertIn("***@pacificcu.org", masked["email"])
        self.assertEqual(masked["phone"], "Protected by IRM until intro accepted")
        self.assertFalse(masked["piiUnlocked"])

        unlocked = server.mask_contact_for_marketplace(contact, influencer, unlocked_contact_ids={"501"})
        self.assertEqual(unlocked["fullName"], "Jordan Vance")
        self.assertEqual(unlocked["email"], "jordan@pacificcu.org")
        self.assertEqual(unlocked["phone"], "+1 415 555 0192")
        self.assertTrue(unlocked["piiUnlocked"])

        # Token lookup & persistence of vendors + marketplaceRequests
        token = "vtok-test-token-123"
        token_hash = server.hashlib.sha256(token.encode("utf-8")).hexdigest()
        state = server.default_workbook_state()
        state["vendors"] = [
            {
                "id": "vnd-1",
                "companyName": "Aegis AI",
                "contactName": "Sam Carter",
                "email": "sam@aegis.ai",
                "agreementStatus": "signed",
                "networkAccessLevel": "unlocked",
                "agreements": [{"id": "vagr-1", "title": "Master Agreement", "status": "Signed"}],
                "sessionTokenHash": token_hash,
            }
        ]
        state["marketplaceRequests"] = [
            {
                "id": "mreq-1",
                "vendorId": "vnd-1",
                "vendorName": "Aegis AI",
                "influencerId": "10",
                "influencerName": "Kim Beluzo",
                "contactId": "501",
                "targetCompany": "Pacific Crest Credit Union",
                "status": "requested",
            }
        ]
        found_vendor = server.vendor_from_token(state, token)
        self.assertIsNotNone(found_vendor)
        self.assertEqual(found_vendor["companyName"], "Aegis AI")
        safe_v = server.vendor_safe_dict(found_vendor)
        self.assertEqual(safe_v["agreementStatus"], "signed")
        self.assertEqual(safe_v["networkAccessLevel"], "unlocked")
        self.assertNotIn("sessionTokenHash", safe_v)

        if server.HAS_OPENPYXL:
            server.write_workbook_state(state)
            reloaded = server.read_workbook_state()
            self.assertEqual(len(reloaded["vendors"]), 1)
            self.assertEqual(reloaded["vendors"][0]["companyName"], "Aegis AI")
            self.assertEqual(len(reloaded["marketplaceRequests"]), 1)
            self.assertEqual(reloaded["marketplaceRequests"][0]["id"], "mreq-1")


if __name__ == "__main__":
    unittest.main()

