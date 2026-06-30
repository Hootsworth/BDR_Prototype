import random

class ZeroBounceMock:
    def __init__(self):
        # Database of known email addresses and their deliverability status
        # Simulate some invalid emails or spamtrap/abuse risks to show the data quality agent working
        self.validation_cache = {
            "sjenkins@apexfcu.org": {"status": "valid", "sub_status": "", "domain_status": "active", "score": 98},
            "mchen@apexfcu.org": {"status": "valid", "sub_status": "", "domain_status": "active", "score": 96},
            "dmiller@beaconcb.com": {"status": "valid", "sub_status": "", "domain_status": "active", "score": 97},
            "erostova@beaconcb.com": {"status": "valid", "sub_status": "", "domain_status": "active", "score": 94},
            "rvance@summitmutual.com": {"status": "valid", "sub_status": "", "domain_status": "active", "score": 99},
            "apatel@summitmutual.com": {"status": "valid", "sub_status": "", "domain_status": "active", "score": 95},
            "joconnor@novaalliancecu.org": {"status": "valid", "sub_status": "", "domain_status": "active", "score": 92},
            "cwang@novaalliancecu.org": {"status": "valid", "sub_status": "", "domain_status": "active", "score": 91},
            "tgrate@clearviewins.com": {"status": "valid", "sub_status": "", "domain_status": "active", "score": 97},
            "fgallagher@clearviewins.com": {"status": "valid", "sub_status": "", "domain_status": "active", "score": 93},
            # Some test emails that are risky/invalid
            "test_invalid@apexfcu.org": {"status": "invalid", "sub_status": "mailbox_not_found", "domain_status": "active", "score": 0},
            "spamtrap@beaconcb.com": {"status": "spamtrap", "sub_status": "honey_pot", "domain_status": "active", "score": 10},
            "abuse@summitmutual.com": {"status": "abuse", "sub_status": "complainer", "domain_status": "active", "score": 15}
        }

    def validate_email(self, email):
        """
        Verify if email is safe to send. Returns validation payload.
        """
        if email in self.validation_cache:
            return self.validation_cache[email].copy()
            
        # Default behavior for non-cached emails:
        # If it looks like a standard name format, return valid.
        # Otherwise, assign a random state or mark invalid.
        domain = email.split("@")[-1] if "@" in email else ""
        
        # Let's say if the email starts with info, sales, contact, etc. it's "catch-all" or "role-based"
        local_part = email.split("@")[0].lower() if "@" in email else ""
        if local_part in ["info", "sales", "contact", "support", "jobs"]:
            return {
                "status": "catch-all",
                "sub_status": "role_based",
                "domain_status": "active",
                "score": 60
            }
        
        # Simulate some minor chance of failure for unexpected names (e.g. 5%)
        if random.random() < 0.05:
            return {
                "status": "invalid",
                "sub_status": "mailbox_not_found",
                "domain_status": "active",
                "score": 0
            }
            
        return {
            "status": "valid",
            "sub_status": "",
            "domain_status": "active",
            "score": random.randint(85, 100)
        }
