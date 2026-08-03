import unittest

from agents.graph import create_bdr_graph
from agents.discovery_agents import icp_discovery_agent
from agents.campaign_agents import personalization_agent


class WorkflowPrototypeTests(unittest.TestCase):
    def test_graph_has_expected_interrupts(self):
        graph = create_bdr_graph()
        self.assertEqual(
            set(graph.get_graph().nodes),
            {
                "__start__", "__end__", "icp_discovery", "contact_intelligence",
                "data_quality", "personalization", "campaign_launch", "deliverability",
                "engagement_monitoring", "intent_detection", "linkedin_engagement",
                "qualification", "meeting_scheduler", "crm_intelligence",
            },
        )

    def test_discovery_is_deterministic_with_mock_provider(self):
        state = {
            "icp_definition": {
                "industries": ["Credit Unions"],
                "employee_range": [50, 500],
                "geography": "North America",
            },
            "metrics": {},
        }
        result = icp_discovery_agent(state)
        self.assertGreater(len(result["accounts"]), 0)
        self.assertEqual(result["metrics"]["accounts_identified"], len(result["accounts"]))
        self.assertEqual(result["metrics"]["contacts_discovered"], len(result["contacts"]))

    def test_high_value_contacts_require_approval(self):
        contact = {
            "email": "test@example.com",
            "first_name": "Test",
            "last_name": "Prospect",
            "title": "CTO",
            "company_name": "Example Bank",
            "company_score": 99,
        }
        result = personalization_agent({
            "contacts": [contact],
            "sequences": {},
            "human_approval_queue": [],
        })
        self.assertEqual(result["sequences"][contact["email"]]["status"], "pending_approval")
        self.assertEqual(len(result["human_approval_queue"]), 1)


if __name__ == "__main__":
    unittest.main()
