class LinkedInMock:
    def __init__(self):
        # Database of logged LinkedIn interactions
        # Key: linkedin_url, Value: dict
        self.interactions = {}

    def send_connection_request(self, linkedin_url, note=None):
        """
        Send LinkedIn connection request.
        """
        if linkedin_url not in self.interactions:
            self.interactions[linkedin_url] = []
            
        self.interactions[linkedin_url].append({
            "action": "connection_request",
            "details": f"Connection request sent with note: {note}" if note else "Connection request sent without note",
            "status": "pending_approval"
        })
        return True

    def like_recent_post(self, linkedin_url, post_snippet):
        """
        Interact with a prospect's post to warm up the relationship.
        """
        if linkedin_url not in self.interactions:
            self.interactions[linkedin_url] = []
            
        self.interactions[linkedin_url].append({
            "action": "like_post",
            "details": f"Liked post snippet: '{post_snippet[:40]}...'",
            "status": "completed"
        })
        return True

    def send_inmail(self, linkedin_url, message_body):
        """
        Send direct LinkedIn InMail or DM.
        """
        if linkedin_url not in self.interactions:
            self.interactions[linkedin_url] = []
            
        self.interactions[linkedin_url].append({
            "action": "inmail_message",
            "details": f"Message body: {message_body}",
            "status": "sent"
        })
        return True

    def get_history(self, linkedin_url):
        return self.interactions.get(linkedin_url, [])
