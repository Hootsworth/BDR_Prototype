import random

class ClayMock:
    def __init__(self):
        # Database of buying signals mapped to company domains
        self.mock_signals = {
            "apexfcu.org": {
                "funding": "No recent funding (Credit Union)",
                "job_changes": ["Marcus Chen promoted to Head of Data & Analytics 3 months ago"],
                "ai_initiatives": "Launched 'CreditScoreAI' initiative to automate loan risk evaluation using machine learning.",
                "news_mentions": "Apex FCU wins 'Digital Innovation in Banking' Award for 2026.",
                "trigger_event": "Digital Innovation award and active 'CreditScoreAI' initiative"
            },
            "beaconcb.com": {
                "funding": "Raised $10M Series A on Feb 2026 to scale customer service ops.",
                "job_changes": ["David Miller hired as CTO 1 month ago from a larger fintech company"],
                "ai_initiatives": "CTO announced plans on LinkedIn to integrate large language models for customer support automation.",
                "news_mentions": "Beacon Community Bank partners with local fintechs to deliver automated advisory tools.",
                "trigger_event": "New CTO hired with public mandate to integrate LLMs for advisory tools"
            },
            "summitmutual.com": {
                "funding": "Publicly traded (NYSE: SUMM)",
                "job_changes": ["VP of Data Engineering Aisha Patel spoke at Snowflake Summit recently"],
                "ai_initiatives": "Building custom underwriters using deep learning; currently migrating legacy risk models to Snowflake.",
                "news_mentions": "Summit Mutual expands underwriting capacity in midwest states.",
                "trigger_event": "Migrating legacy insurance risk models to Snowflake"
            },
            "novaalliancecu.org": {
                "funding": "No recent funding (Credit Union)",
                "job_changes": ["Chloe Wang promoted to Lead Analytics Engineer"],
                "ai_initiatives": "Evaluating customer churn models using Python and Snowflake.",
                "news_mentions": "Nova Alliance merges with local community credit union.",
                "trigger_event": "Evaluating customer churn models on Snowflake post-merger"
            },
            "clearviewins.com": {
                "funding": "Acquired by larger insurance group (transaction closed last month)",
                "job_changes": ["Thomas Grate appointed CTO by new parent company board"],
                "ai_initiatives": "Consolidating 3 legacy claims analysis systems into a centralized analytics platform.",
                "news_mentions": "Clearview completes transition under parent group.",
                "trigger_event": "Consolidating multiple legacy claims analysis systems under new CTO"
            }
        }

    def get_company_signals(self, domain):
        """
        Fetch buying signals for a target domain.
        """
        signals = self.mock_signals.get(domain, {
            "funding": "No major updates",
            "job_changes": [],
            "ai_initiatives": "Evaluating general predictive analytics solutions.",
            "news_mentions": "Standard operations.",
            "trigger_event": "General interest in data operations scaling"
        })
        return signals.copy()

    def get_contact_signals(self, email):
        """
        Fetch contact-specific signals (like job change, recent LinkedIn posts, etc.)
        """
        # Generate some random, realistic-sounding posts or updates if domain signal exists
        domain = email.split("@")[-1] if "@" in email else ""
        signals = self.get_company_signals(domain)
        
        posts = [
            f"Looking to hire senior data engineers with experience in LangChain/LangGraph.",
            f"Excited to attend the upcoming GTM Summit in Boston next month!",
            f"Sharing a great article on why clean data is the foundation of any AI strategy."
        ]
        
        return {
            "recent_linkedin_post": random.choice(posts),
            "hiring_signals": "Looking for data/analytics talent",
            "company_trigger": signals.get("trigger_event", "General scaling")
        }
