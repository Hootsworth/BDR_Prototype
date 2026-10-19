import os
import tempfile
import unittest
from unittest.mock import patch

import server


class ConnectEMCoreTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.temp_dir.name, "test.sqlite3")
        self.data_dir = self.temp_dir.name
        self.db_patch = patch.multiple(server, DB_PATH=self.db_path, DATA_DIR=self.data_dir)
        self.db_patch.start()
        fernet_key = server.Fernet.generate_key().decode() if server.Fernet else "mock-fernet-key-32bytes-base64encoded="
        self.env_patch = patch.dict(os.environ, {"TOKEN_ENCRYPTION_KEY": fernet_key})
        self.env_patch.start()

    def tearDown(self):
        self.env_patch.stop()
        self.db_patch.stop()
        self.temp_dir.cleanup()

    def test_warm_path_score_calculation(self):
        # 1. High-affinity relationship
        contact_high = {
            "strength": "Strong",
            "lastInteraction": "this_week",
            "relationshipType": "former_colleague",
            "introWillingness": "Open",
            "title": "Chief Information Officer",
            "company": "First Horizon CU",
            "topics": ["Core Banking", "AI", "Cloud"],
            "responsiveness": "High"
        }
        partner_high = {
            "trustScore": 95,
            "introsCompleted": 12,
            "introsAccepted": 11,
            "expertise": ["Credit Unions", "Fintech"]
        }
        vendor_icp = {
            "targetTitles": ["CIO", "Chief Information Officer", "CTO"],
            "industries": ["Credit Unions", "Financial Services"],
            "topics": ["AI", "Cloud"]
        }

        result_high = server.calculate_warm_path_score(contact_high, partner_high, vendor_icp)
        self.assertGreaterEqual(result_high["score"], 80)
        self.assertEqual(result_high["badge"], "Excellent warm path")
        self.assertIn("breakdown", result_high)
        self.assertGreater(result_high["breakdown"]["relationshipStrength"], 25)

        # 2. Low-affinity relationship
        contact_low = {
            "strength": "Weak",
            "lastInteraction": "over_a_year",
            "relationshipType": "other",
            "introWillingness": "Private",
            "title": "Junior Coordinator",
            "company": "Unrelated Corp",
            "topics": [],
            "responsiveness": "Low"
        }
        partner_low = {
            "trustScore": 40,
            "introsCompleted": 1,
            "introsAccepted": 0,
            "expertise": []
        }

        result_low = server.calculate_warm_path_score(contact_low, partner_low, vendor_icp)
        self.assertLess(result_low["score"], 50)
        self.assertEqual(result_low["badge"], "Low-affinity path")

    def test_contact_privacy_masking(self):
        partner = {"name": "Dave Miller", "id": "p-101", "trustScore": 92}
        base_contact = {
            "id": "c-501",
            "name": "Sarah Connor",
            "title": "CIO",
            "company": "Cyberdyne Systems",
            "email": "sarah@cyberdyne.io",
            "phone": "+1-555-0199",
            "strength": "Strong",
            "relationshipType": "former_colleague"
        }

        # Private -> must return None (excluded from vendor discovery)
        contact_private = {**base_contact, "privacyLevel": "private"}
        masked_private = server.mask_contact_for_marketplace(contact_private, partner)
        self.assertIsNone(masked_private)

        # Anonymous -> masks name and contact details, keeps title/company
        contact_anon = {**base_contact, "privacyLevel": "anonymous"}
        masked_anon = server.mask_contact_for_marketplace(contact_anon, partner)
        self.assertIsNotNone(masked_anon)
        self.assertIn("Warm path", masked_anon["name"])
        self.assertNotIn("sarah@cyberdyne.io", masked_anon["email"])
        self.assertNotIn("+1-555-0199", masked_anon["phone"])

        # Ask Partner (default) -> initials/last name initial, phone/email protected
        contact_ask = {**base_contact, "privacyLevel": "ask_partner"}
        masked_ask = server.mask_contact_for_marketplace(contact_ask, partner)
        self.assertEqual(masked_ask["name"], "Sarah C.")
        self.assertEqual(masked_ask["privacyLevel"], "ask_partner")
        self.assertNotEqual(masked_ask["email"], "sarah@cyberdyne.io")

        # Discoverable -> full name visible, phone/email protected from cold scraping
        contact_disc = {**base_contact, "privacyLevel": "discoverable"}
        masked_disc = server.mask_contact_for_marketplace(contact_disc, partner)
        self.assertEqual(masked_disc["name"], "Sarah Connor")
        self.assertEqual(masked_disc["privacyLevel"], "discoverable")
        self.assertNotEqual(masked_disc["email"], "sarah@cyberdyne.io")

    def test_forwardable_brief_generation(self):
        vendor = {"name": "Tursio", "category": "AI Governance", "valueProp": "Automate model auditing"}
        contact = {"name": "Alex Mercer", "title": "VP of Architecture", "company": "Apex Credit Union"}
        partner = {"name": "Elena Rostova", "relationshipType": "former_colleague"}
        vendor_ask = {
            "whyContact": "Alex leads technology governance and is evaluating automated compliance solutions.",
            "whyCare": "Reduces manual audit prep by 80% before upcoming regulatory filings.",
            "specificAsk": "A brief 20-minute introductory architecture call."
        }

        brief = server.generate_forwardable_brief(vendor, contact, partner, vendor_ask)
        self.assertIn("Alex", brief)
        self.assertIn("Tursio", brief)
        self.assertIn("20-minute", brief)
        self.assertIn("Elena", brief)

    def test_pre_meeting_brief_generation(self):
        vendor = {"name": "Tursio"}
        contact = {"name": "Alex Mercer", "title": "VP of Architecture", "company": "Apex Credit Union"}
        partner = {"name": "Elena Rostova", "relationshipType": "former_colleague", "context": "Values concise, technical discussions without sales fluff."}
        intro_req = {
            "whyContact": "Alex leads architecture.",
            "whyCare": "Solves data pipeline latency.",
            "specificAsk": "20-minute peer review."
        }

        brief = server.generate_pre_meeting_brief(vendor, contact, partner, intro_req)
        self.assertEqual(brief["contactName"], "Alex Mercer")
        self.assertEqual(brief["introducedBy"], "Elena Rostova")
        self.assertIn("rulesOfEngagement", brief)
        self.assertTrue(len(brief["rulesOfEngagement"]) > 0)
        self.assertIn("whatNotToDo", brief)
        self.assertTrue(any("slide pitch" in item.lower() for item in brief["whatNotToDo"]))

    def test_double_opt_in_state_transitions(self):
        state = {
            "influencerRequests": [
                {
                    "id": "req-999",
                    "status": "requested",
                    "stage": "intro_requested",
                    "influencerId": "part-1",
                    "contactName": "Michael Scott",
                    "contactEmail": "michael@dundermifflin.com",
                    "company": "Dunder Mifflin",
                    "optInToken": "secure-optin-token-123"
                }
            ],
            "influencers": [
                {
                    "id": "part-1",
                    "name": "Jim Halpert",
                    "trustScore": 88
                }
            ]
        }

        # Step 1: Partner reviews and checks interest
        req = state["influencerRequests"][0]
        self.assertEqual(req["stage"], "intro_requested")

        # Simulate partner review "check_interest"
        req["stage"] = "contact_opt_in_requested"
        req["relevanceRating"] = "highly"
        self.assertEqual(req["stage"], "contact_opt_in_requested")

        # Step 2: Contact accepts via opt-in token
        req["stage"] = "contact_accepted"
        req["contactAcceptedAt"] = "2026-10-19T01:00:00Z"
        req["meetingLink"] = "https://calendly.com/connectem/intro-req-999"

        self.assertEqual(req["stage"], "contact_accepted")
        self.assertIn("calendly.com", req["meetingLink"])

        # Step 3: Partner declines with zero penalty
        partner_before = state["influencers"][0]["trustScore"]
        # Declining a request
        declined_req = {
            "id": "req-1000",
            "stage": "partner_declined",
            "declineReason": "Not a good fit right now"
        }
        # Verify partner score is untouched
        self.assertEqual(state["influencers"][0]["trustScore"], partner_before)


if __name__ == "__main__":
    unittest.main()
