class InboxKitMock:
    def __init__(self):
        # Database of sender inbox reputations
        self.mock_inboxes = {
            "sdr1@gtm-engine-outreach.com": {
                "domain": "gtm-engine-outreach.com",
                "spam_score": 0.8,         # Scale 0-10, lower is better
                "reputation": "excellent",
                "warmup_days": 45,
                "daily_send_limit": 50,
                "sent_today": 12,
                "bounce_rate": 0.015,
                "status": "healthy"
            },
            "sdr2@gtm-engine-outreach.com": {
                "domain": "gtm-engine-outreach.com",
                "spam_score": 1.2,
                "reputation": "good",
                "warmup_days": 35,
                "daily_send_limit": 50,
                "sent_today": 8,
                "bounce_rate": 0.021,
                "status": "healthy"
            },
            "rep@outbound-scale.net": {
                "domain": "outbound-scale.net",
                "spam_score": 4.5,         # Needs warning or rotation
                "reputation": "average",
                "warmup_days": 15,
                "daily_send_limit": 25,
                "sent_today": 22,
                "bounce_rate": 0.078,
                "status": "warning"
            }
        }

    def get_inbox_health(self, email):
        """
        Check health stats for a sending inbox
        """
        if email in self.mock_inboxes:
            return self.mock_inboxes[email].copy()
        return {
            "domain": email.split("@")[-1] if "@" in email else "unknown.com",
            "spam_score": 2.0,
            "reputation": "good",
            "warmup_days": 30,
            "daily_send_limit": 30,
            "sent_today": 0,
            "bounce_rate": 0.03,
            "status": "healthy"
        }

    def get_healthy_sending_inboxes(self):
        """
        Return list of inboxes currently marked as healthy and below their send limit.
        """
        healthy = []
        for email, stats in self.mock_inboxes.items():
            if stats["status"] == "healthy" and stats["sent_today"] < stats["daily_send_limit"]:
                healthy.append(email)
        return healthy

    def log_send(self, email):
        """
        Increment the sent count for an inbox and update spam risk if overused.
        """
        if email in self.mock_inboxes:
            self.mock_inboxes[email]["sent_today"] += 1
            # Overuse penalty simulation
            if self.mock_inboxes[email]["sent_today"] >= self.mock_inboxes[email]["daily_send_limit"]:
                self.mock_inboxes[email]["status"] = "cooldown"
            return True
        return False
