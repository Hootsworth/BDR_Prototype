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

    def test_fresh_app_has_no_seeded_workflow_data(self):
        main = self.read("src/main.js")
        dashboard = self.read("src/components/dashboard.js")
        self.assertIn('database.contacts = [];', main)
        self.assertNotIn("Populate default database", main)
        self.assertNotIn("Simulated sandbox databases initialized", dashboard)

    def test_influencer_add_prospect_and_affiliated_referrals(self):
        outbound = self.read("src/components/outbound.js")
        dialogs = self.read("components/dialogs.html")
        influencers = self.read("src/components/influencers.js")

        self.assertIn("openAddProspectForInfluencer", outbound)
        self.assertIn("openAddProspectForInfluencer", influencers)
        self.assertIn("+ Add Prospect", outbound)
        self.assertIn("influencer-affiliated-row", outbound)
        self.assertIn("outbound-modal-referred-tag", dialogs)
        self.assertIn("modal-info-referred-by", dialogs)
        self.assertIn("Add Affiliated Prospect", dialogs)

    def test_unified_upload_and_enrich_interface(self):
        upload_html = self.read("components/upload.html")
        tables_js = self.read("src/components/tables.js")
        enrich_js = self.read("src/components/enrich.js")

        self.assertIn("upload-dropzone", upload_html)
        self.assertIn("btn-run-enrich", upload_html)
        self.assertIn("enrich-console-box", upload_html)
        self.assertIn("table-upload-data", upload_html)
        self.assertIn("upload-kpi-total", upload_html)
        self.assertIn("upload-kpi-enriched", upload_html)
        self.assertIn("updateUploadEnrichKPIs", tables_js)
        self.assertIn("renderEnrichmentFieldOptions", enrich_js)

    def test_campaign_outbound_navigation_and_import_contacts_restructure(self):
        index_html = self.read("index.html")
        outbound_html = self.read("components/campaign-outbound.html")
        upload_html = self.read("components/upload.html")
        events_list_html = self.read("components/events-list.html")
        dialogs_html = self.read("components/dialogs.html")
        main_js = self.read("src/main.js")
        tables_js = self.read("src/components/tables.js")
        events_js = self.read("src/components/events.js")
        upload_js = self.read("src/components/upload.js")
        outbound_js = self.read("src/components/outbound.js")

        # Sidebar & App Branding
        self.assertIn("<span class=\"brand-name\">Campaign Outbound</span>", index_html)
        self.assertIn("<span class=\"nav-label\">Search</span>", index_html)
        self.assertNotIn("cat-group-contacts", index_html)
        self.assertNotIn("cat-group-events", index_html)

        # Outbound screen header & navigation buttons (called "Import" not "Events")
        self.assertNotIn("Omnichannel Outbound &amp; Referral Engine", outbound_html)
        self.assertNotIn("Coordinate influencer networks, manage warm referrals", outbound_html)
        self.assertIn("switchTab('agent-mode')", outbound_html)
        self.assertIn("switchTab('dashboard')", outbound_html)
        self.assertNotIn("outbound-btn-events", outbound_html)
        self.assertNotIn("openImportContactsTab('events')", outbound_html)
        self.assertIn("openImportContactsTab('csv')", outbound_html)
        self.assertIn("Import\n", outbound_html)

        # Unified Import screen (Direct Add / CSV + Events) & Add Influencer options
        self.assertIn("import-contacts-mode-csv", upload_html)
        self.assertIn("import-contacts-mode-events", upload_html)
        self.assertIn("quick-direct-add-form", upload_html)
        self.assertIn("openAddInfluencerFromImport()", upload_html)
        self.assertIn("toggleQuickDirectAddForm(true, 'influencer')", upload_html)
        self.assertIn("csv-import-role-select", upload_html)
        self.assertIn("filter-upload-role", upload_html)
        self.assertIn("openAddContactFromEventModal('influencer')", upload_html)
        self.assertIn("openAddContactFromEventModal('influencer')", events_list_html)
        self.assertIn("mapper-import-role-select", dialogs_html)
        self.assertIn("input-reg-as-influencer", dialogs_html)
        self.assertIn("select-event-view", upload_html)
        self.assertIn("table-events-attendees", upload_html)

        # Contact -> Influencer conversion & Add Influencer handlers
        self.assertIn("openImportContactsTab", main_js)
        self.assertIn("switchImportContactsMode", main_js)
        self.assertIn("convertContactToInfluencer", tables_js)
        self.assertIn("openAddInfluencerFromImport", tables_js)
        self.assertIn("updateQuickDirectAddRoleUI", tables_js)
        self.assertIn("convertEventAttendeeToInfluencer", events_js)
        self.assertIn("updateEventAddContactRoleUI", events_js)
        self.assertIn("mapper-import-role-select", upload_js)
        self.assertIn("convertContactToInfluencer", outbound_js)

    def test_fullscreen_outreach_and_influencer_portal_split_layout(self):
        dialogs_html = self.read("components/dialogs.html")
        influencers_html = self.read("components/influencers.html")
        influencers_js = self.read("src/components/influencers.js")
        outbound_js = self.read("src/components/outbound.js")
        style_css = self.read("style.css")

        # Full-screen outreach workspace instead of small popup
        self.assertIn("outbound-fullscreen-dialog", dialogs_html)
        self.assertIn("outbound-fullscreen-container", dialogs_html)
        self.assertIn("← Back", dialogs_html)
        self.assertIn("dialog.outbound-fullscreen-dialog", style_css)
        self.assertIn("100vw !important", style_css)
        self.assertIn("100dvh !important", style_css)

        # Influencer portal separate left (contacts given by influencer) & right (contacted status & outreach)
        self.assertIn("partner-split-workspace", influencers_html)
        self.assertIn("partner-split-left", influencers_html)
        self.assertIn("partner-split-right", influencers_html)
        self.assertIn("Contacts Given by Influencer", influencers_html)
        self.assertIn("Contacted Status &amp; Outreach", influencers_html)
        self.assertIn("partner-contact-status-panel", influencers_html)
        self.assertIn("partner-contact-status-body", influencers_html)

        # Click on any contact name to show outreach options (email, linkedin, call, etc.)
        self.assertIn("selectPortalReferralContact", influencers_js)
        self.assertIn("openPortalContactOutreach", influencers_js)
        self.assertIn("renderPortalContactStatusPanel", influencers_js)
        self.assertIn("portal-contact-name-btn", influencers_js)
        self.assertIn("portal-inline-outreach-drawer", influencers_js)
        self.assertIn("toggleOutboundQuickOutreach", outbound_js)


if __name__ == "__main__":
    unittest.main()

