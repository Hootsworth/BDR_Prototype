import tempfile
import unittest
from pathlib import Path

import server


class TestDatabaseSearchAndPortal(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.orig_db_file = server.DB_PATH
        server.DB_PATH = str(Path(self.temp_dir.name) / "test_gtm.sqlite3")
        server.seed_synthetic_database(force=True)

    def tearDown(self):
        server.DB_PATH = self.orig_db_file
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


if __name__ == "__main__":
    unittest.main()
