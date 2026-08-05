import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class FrontendContractTests(unittest.TestCase):
    def read(self, path):
        return (ROOT / path).read_text(encoding="utf-8")

    def test_all_email_actions_use_browser_google_sender(self):
        outbound = self.read("src/components/outbound.js")
        self.assertNotIn("/api/google/gmail/send", outbound)
        self.assertGreaterEqual(outbound.count("sendGoogleGmail({"), 2)

    def test_configured_clerk_does_not_auto_unlock(self):
        auth = self.read("src/auth.js")
        self.assertNotIn("Demo Mode Auto-Unlock", auth)
        self.assertIn("A configured Clerk instance must authenticate", auth)

    def test_provider_secrets_are_not_restored_from_browser_storage(self):
        main = self.read("src/main.js")
        settings = self.read("src/components/settings.js")
        for secret_key in ("gtm_key_explorium", "gtm_key_llm_helper", "gtm_key_gemini", "gtm_lemlist_api_key", "gtm_slack_webhook_url"):
            self.assertNotIn(f'localStorage.getItem("{secret_key}")', main)
            self.assertNotIn(f'localStorage.setItem("{secret_key}"', settings)

    def test_user_provider_credential_controls_exist(self):
        settings = self.read("components/settings-keys.html")
        self.assertIn("settings-twilio-account-sid", settings)
        self.assertIn("settings-twilio-auth-token", settings)
        self.assertIn("settings-linkedin-client-id", settings)
        self.assertIn("settings-linkedin-client-secret", settings)


if __name__ == "__main__":
    unittest.main()
