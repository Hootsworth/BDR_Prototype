class HubSpotMock:
    def __init__(self):
        # Database of HubSpot contacts
        # Key: email, Value: dict
        self.contacts = {}
        # Database of HubSpot deals (opportunities)
        self.deals = []
        # Database of activities logged against contacts
        self.activities = {}
        # Database of tasks
        self.tasks = []

    def upsert_contact(self, email, properties):
        """
        Create or update a contact record in HubSpot CRM.
        """
        if email not in self.contacts:
            self.contacts[email] = {
                "email": email,
                "first_name": properties.get("first_name", ""),
                "last_name": properties.get("last_name", ""),
                "title": properties.get("title", ""),
                "company_name": properties.get("company_name", ""),
                "lifecycle_stage": properties.get("lifecycle_stage", "Prospect"),
                "lead_score": properties.get("lead_score", 0),
                "phone": properties.get("phone", ""),
                "owner": "Autonomous Agent 12",
                "notes": []
            }
            self.activities[email] = []
        else:
            # Update provided fields
            for key, val in properties.items():
                if key in self.contacts[email]:
                    self.contacts[email][key] = val
                    
        return self.contacts[email].copy()

    def update_lifecycle_stage(self, email, stage):
        """
        Update the contact's GTM lifecycle stage
        """
        if email in self.contacts:
            old_stage = self.contacts[email]["lifecycle_stage"]
            self.contacts[email]["lifecycle_stage"] = stage
            self.log_activity(email, "lifecycle_change", f"Lifecycle stage changed from {old_stage} to {stage}")
            return True
        return False

    def log_activity(self, email, activity_type, description):
        """
        Log an outbound/engagement action (email open, call, meeting booked)
        """
        if email not in self.activities:
            self.activities[email] = []
            
        activity = {
            "type": activity_type,
            "description": description,
            "timestamp": "2026-06-16T20:00:00" # Placeholder timestamp
        }
        self.activities[email].append(activity)
        
        # Trigger lead scoring updates automatically based on CRM Automation rules:
        if email in self.contacts:
            if activity_type == "email_open":
                self.contacts[email]["lead_score"] += 5
            elif activity_type == "email_click":
                self.contacts[email]["lead_score"] += 15
            elif activity_type == "website_visit":
                self.contacts[email]["lead_score"] += 20
            elif activity_type == "meeting_booked":
                self.contacts[email]["lead_score"] += 50
                
        return True

    def create_deal(self, email, deal_name, amount, stage="Discovery Scheduled"):
        """
        Create a pipeline Opportunity deal in HubSpot.
        """
        contact = self.contacts.get(email)
        company = contact["company_name"] if contact else "Unknown Co"
        
        deal = {
            "deal_id": len(self.deals) + 1001,
            "name": deal_name,
            "amount": amount,
            "stage": stage,
            "associated_contact": email,
            "associated_company": company,
            "owner": "AE Sales Representative"
        }
        self.deals.append(deal)
        
        # Log to contact activity
        self.log_activity(email, "deal_created", f"Created opportunity deal: {deal_name} (${amount})")
        return deal

    def create_task(self, email, title, due_date="Tomorrow"):
        """
        Create an SDR follow up task in HubSpot
        """
        task = {
            "task_id": len(self.tasks) + 5001,
            "associated_contact": email,
            "title": title,
            "due_date": due_date,
            "status": "Not Started"
        }
        self.tasks.append(task)
        return task

    def get_contact(self, email):
        return self.contacts.get(email)

    def get_all_contacts(self):
        return list(self.contacts.values())

    def get_all_deals(self):
        return self.deals

    def get_all_tasks(self):
        return self.tasks
