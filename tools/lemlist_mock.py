import random

class LemlistMock:
    def __init__(self):
        # Database of active prospect sequences
        # Key: contact_email, Value: sequence status data
        self.active_sequences = {}
        
        # General templates available
        self.templates = {
            "credit_union_risk": {
                "subject": "Securing data platforms at {company_name}",
                "body": "Hi {first_name},\n\nI saw Apex FCU's recent award for Digital Innovation. I was curious if Marcus or your Head of Data is evaluating how to automate analytics pipelines without risking compliance. We help Credit Unions scale their data warehouses securely.\n\nBest,\nSDR Team"
            },
            "fintech_cto_llm": {
                "subject": "Leveraging LLMs safely at {company_name}",
                "body": "Hi {first_name},\n\nCongrats on the new CTO role at Beacon CB! I noticed your post about integrating LLMs for customer advisory. Many banking leaders are worried about hallucinated data and financial compliance. We provide query validation guardrails specifically built for financial platforms.\n\nBest,\nSDR Team"
            },
            "general_gtm": {
                "subject": "Scaling data ops at {company_name}",
                "body": "Hi {first_name},\n\nI read about {company_name}'s recent initiatives. Our platform automates data warehousing operations and integrates natively with your stack. Would love to share how we helped similar firms save 15+ engineering hours per week.\n\nBest,\nSDR Team"
            }
        }

    def add_to_sequence(self, contact, sequence_id, subject, body):
        """
        Enroll a contact in an email campaign sequence.
        """
        email = contact["email"]
        self.active_sequences[email] = {
            "contact": contact.copy(),
            "sequence_id": sequence_id,
            "subject": subject,
            "body": body,
            "status": "active",
            "sent_count": 1,
            "opens": 0,
            "clicks": 0,
            "replies": 0,
            "replied_content": None,
            "last_action": "Email 1 Sent"
        }
        return True

    def get_sequence(self, email):
        """
        Get sequence state for an email
        """
        return self.active_sequences.get(email)

    def trigger_engagement(self, email, event_type, reply_text=None):
        """
        Simulate a prospect interaction (Open, Click, Reply).
        Used to drive testing flow.
        """
        if email not in self.active_sequences:
            return False
            
        seq = self.active_sequences[email]
        if event_type == "open":
            seq["opens"] += 1
            seq["last_action"] = "Opened Email"
        elif event_type == "click":
            seq["opens"] += 1
            seq["clicks"] += 1
            seq["last_action"] = "Clicked Link"
        elif event_type == "reply":
            seq["opens"] += 1
            seq["clicks"] += 1
            seq["replies"] += 1
            seq["status"] = "replied"
            seq["last_action"] = "Replied to Email"
            seq["replied_content"] = reply_text or "This looks interesting. Can you send over a 1-pager or some more technical documentation? Let's check times next week."
        return True

    def get_all_active_sequences(self):
        return self.active_sequences.copy()
