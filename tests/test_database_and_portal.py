import tempfile
import unittest
from pathlib import Path

import server


class TestDatabaseSearchAndPortal(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.orig_db_file = server.DB_PATH
        self.orig_wb_path = server.WORKBOOK_PATH
        server.DB_PATH = str(Path(self.temp_dir.name) / "test_gtm.sqlite3")
        server.WORKBOOK_PATH = str(Path(self.temp_dir.name) / "gtm-console-database.xlsx")
        server.seed_synthetic_database(force=True)

    def tearDown(self):
        server.DB_PATH = self.orig_db_file
        server.WORKBOOK_PATH = self.orig_wb_path
        self.temp_dir.cleanup()

    def test_synthetic_30x30_dataset_structure(self):
        state = server.read_state("database")
        self.assertIsNotNone(state)
        contacts = state["contacts"]
        influencers = [c for c in contacts if c.get("isInfluencer")]
        referrals = [c for c in contacts if not c.get("isInfluencer")]

        self.assertEqual(len(influencers), 30)
        self.assertEqual(len(referrals), 900)
        self.assertEqual(len(contacts), 930)

        kim = next((i for i in influencers if i["fullName"] == "Kim Beluzo"), None)
        self.assertIsNotNone(kim)
        kim_refs = [c for c in referrals if c.get("referredBy") == "Kim Beluzo"]
        self.assertEqual(len(kim_refs), 30)
        kim_calls = [c for c in kim_refs if c.get("hasTakenCall") and c.get("hasScheduledCall")]
        self.assertEqual(len(kim_calls), 15)

    def test_natural_language_search_kim_beluzo_calls_taken(self):
        result = server.search_database_nl(
            "Find me all the contact referrals of Kim Beluzo that have taken a call"
        )
        self.assertEqual(result["total"], 15)
        self.assertIn("Kim Beluzo", result["explanation"])
        self.assertIn("Taken a Call", result["explanation"])
        for contact in result["results"]:
            self.assertEqual(contact["referredBy"], "Kim Beluzo")
            self.assertTrue(contact["hasTakenCall"])

    def test_influencer_portal_add_referral_persists_and_is_searchable(self):
        added = server.add_referral_via_portal(
            influencer_email="kim.beluzo@beluzoadvisory.com",
            prospect_data={
                "fullName": "investor Demo Prospect",
                "email": "demo.prospect@pacificcu.org",
                "company": "Pacific Federal Credit Union",
                "jobTitle": "Chief Executive Officer",
                "phone": "+1 (415) 555-0199",
                "hasScheduledCall": True,
                "hasTakenCall": True,
            },
        )
        self.assertEqual(added["contact"]["referredBy"], "Kim Beluzo")
        self.assertTrue(added["contact"]["hasTakenCall"])

        after_search = server.search_database_nl(
            "Find me all the contact referrals of Kim Beluzo that have taken a call"
        )
        self.assertEqual(after_search["total"], 16)

    def test_bulk_add_and_multi_record_edit_referrals(self):
        state = server.read_state("database")
        kim = next(c for c in state["contacts"] if c.get("isInfluencer") and c["fullName"] == "Kim Beluzo")
        existing_ref = next(c for c in state["contacts"] if not c.get("isInfluencer") and c.get("referredBy") == "Kim Beluzo" and not c.get("hasTakenCall"))

        summary = server.apply_partner_bulk_records(
            state,
            kim,
            [
                {
                    "id": existing_ref["id"],
                    "fullName": existing_ref["fullName"],
                    "email": existing_ref["email"],
                    "company": "Updated Credit Union",
                    "jobTitle": "EVP Strategy",
                    "status": "completed",
                },
                {
                    "fullName": "Bulk Prospect One",
                    "email": "bulk.one@pacificcu.org",
                    "company": "Pacific Crest CU",
                    "jobTitle": "Chief Lending Officer",
                    "status": "completed",
                },
                {
                    "fullName": "Bulk Prospect Two",
                    "email": "bulk.two@redwoodcu.org",
                    "company": "Redwood Credit Union",
                    "jobTitle": "VP Operations",
                    "status": "scheduled",
                },
            ],
            source="Bulk Editor",
            allow_internal_notes=True,
        )
        server.sync_relational_tables_from_state(state)

        self.assertEqual(summary["updated"], 1)
        self.assertEqual(summary["created"], 2)

        after_search = server.search_database_nl(
            "Find me all the contact referrals of Kim Beluzo that have taken a call"
        )
        # 15 original + 1 updated existing_ref + 1 Bulk Prospect One = 17
        self.assertEqual(after_search["total"], 17)

    def test_bulk_edit_recomputes_referral_credits_without_double_counting(self):
        state = server.read_state("database")
        kim = next(c for c in state["contacts"] if c.get("isInfluencer") and c["fullName"] == "Kim Beluzo")
        referral = next(c for c in state["contacts"] if not c.get("isInfluencer") and c.get("referredBy") == "Kim Beluzo" and not c.get("hasTakenCall"))
        summary = server.apply_partner_bulk_records(state, kim, [{
            "id": referral["id"], "fullName": referral["fullName"], "email": referral["email"],
            "company": referral["company"], "status": "scheduled"
        }])
        self.assertEqual(summary["updated"], 1)
        self.assertEqual(server.compute_contact_referral_credits(referral), 15)
        row = next(r for r in kim["referrals"] if str(r.get("id")) == str(referral["id"]))
        self.assertEqual(row["credits"], 15)
        self.assertEqual(kim["referralCredits"], sum(r.get("credits", 0) for r in kim["referrals"]))


if __name__ == "__main__":
    unittest.main()
