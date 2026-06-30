import random

class ApolloMock:
    def __init__(self):
        # Database of mock accounts matching different industries and criteria
        self.mock_companies = [
            {
                "name": "Apex Federal Credit Union",
                "domain": "apexfcu.org",
                "industry": "Credit Unions",
                "employees": 150,
                "revenue": "45M",
                "geography": "North America",
                "tech_stack": ["Salesforce", "AWS", "Datadog", "React"],
                "score": 85
            },
            {
                "name": "Beacon Community Bank",
                "domain": "beaconcb.com",
                "industry": "Community Banks",
                "employees": 85,
                "revenue": "20M",
                "geography": "North America",
                "tech_stack": ["HubSpot", "Azure", "Snowflake", "Angular"],
                "score": 92
            },
            {
                "name": "Summit Mutual Insurance",
                "domain": "summitmutual.com",
                "industry": "Insurance Firms",
                "employees": 450,
                "revenue": "120M",
                "geography": "North America",
                "tech_stack": ["HubSpot", "AWS", "BigQuery", "React"],
                "score": 88
            },
            {
                "name": "Nova Alliance Credit Union",
                "domain": "novaalliancecu.org",
                "industry": "Credit Unions",
                "employees": 120,
                "revenue": "35M",
                "geography": "North America",
                "tech_stack": ["Salesforce", "Google Cloud", "Redshift"],
                "score": 79
            },
            {
                "name": "Clearview Insurance Co",
                "domain": "clearviewins.com",
                "industry": "Insurance Firms",
                "employees": 900,
                "revenue": "300M",
                "geography": "Europe",
                "tech_stack": ["HubSpot", "Azure", "Snowflake", "Vue"],
                "score": 82
            }
        ]

        # Database of target personas at these companies (Buying Committee)
        self.mock_contacts = {
            "apexfcu.org": [
                {"first_name": "Sarah", "last_name": "Jenkins", "title": "Chief Information Officer", "role": "CIO", "email": "sjenkins@apexfcu.org", "linkedin": "linkedin.com/in/sarah-jenkins-apex"},
                {"first_name": "Marcus", "last_name": "Chen", "title": "Head of Data & Analytics", "role": "Head of Data", "email": "mchen@apexfcu.org", "linkedin": "linkedin.com/in/marcus-chen-data"}
            ],
            "beaconcb.com": [
                {"first_name": "David", "last_name": "Miller", "title": "Chief Technology Officer", "role": "CTO", "email": "dmiller@beaconcb.com", "linkedin": "linkedin.com/in/david-miller-tech"},
                {"first_name": "Elena", "last_name": "Rostova", "title": "Director of Analytics", "role": "Analytics Director", "email": "erostova@beaconcb.com", "linkedin": "linkedin.com/in/elena-rostova-analytics"}
            ],
            "summitmutual.com": [
                {"first_name": "Robert", "last_name": "Vance", "title": "Chief Information Officer", "role": "CIO", "email": "rvance@summitmutual.com", "linkedin": "linkedin.com/in/robert-vance-cio"},
                {"first_name": "Aisha", "last_name": "Patel", "title": "VP of Data Engineering", "role": "Head of Data", "email": "apatel@summitmutual.com", "linkedin": "linkedin.com/in/aisha-patel-data"}
            ],
            "novaalliancecu.org": [
                {"first_name": "James", "last_name": "O'Connor", "title": "VP of Information Technology", "role": "CIO", "email": "joconnor@novaalliancecu.org", "linkedin": "linkedin.com/in/james-oconnor-it"},
                {"first_name": "Chloe", "last_name": "Wang", "title": "Lead Analytics Engineer", "role": "Analytics Director", "email": "cwang@novaalliancecu.org", "linkedin": "linkedin.com/in/chloe-wang-analytics"}
            ],
            "clearviewins.com": [
                {"first_name": "Thomas", "last_name": "Grate", "title": "Chief Technology Officer", "role": "CTO", "email": "tgrate@clearviewins.com", "linkedin": "linkedin.com/in/thomas-grate-tech"},
                {"first_name": "Fiona", "last_name": "Gallagher", "title": "Director of Data Operations", "role": "Head of Data", "email": "fgallagher@clearviewins.com", "linkedin": "linkedin.com/in/fiona-gallagher-data"}
            ]
        }

    def search_accounts(self, industries=None, employee_range=None, geography=None, tech_stack=None):
        """
        Simulate search endpoint for companies
        """
        results = []
        for company in self.mock_companies:
            match = True
            
            # Filter by Industry
            if industries and company["industry"] not in industries:
                match = False
                
            # Filter by Employee count
            if employee_range and match:
                min_emp, max_emp = employee_range
                if not (min_emp <= company["employees"] <= max_emp):
                    match = False
                    
            # Filter by Geography
            if geography and match:
                if company["geography"] != geography:
                    match = False
                    
            # Filter by Tech Stack (any overlap)
            if tech_stack and match:
                overlap = set(company["tech_stack"]).intersection(set(tech_stack))
                if not overlap:
                    match = False
                    
            if match:
                results.append(company.copy())
                
        return results

    def find_contacts(self, domain, roles=None):
        """
        Simulate contact lookup for a specific company domain
        """
        contacts = self.mock_contacts.get(domain, [])
        if not roles:
            return [c.copy() for c in contacts]
            
        results = []
        for contact in contacts:
            if contact["role"] in roles:
                results.append(contact.copy())
        return results

    def enrich_contact(self, email):
        """
        Simulate direct contact enrichment API
        """
        for domain, contacts in self.mock_contacts.items():
            for contact in contacts:
                if contact["email"].lower() == email.lower():
                    # Add enriched fields
                    enriched = contact.copy()
                    enriched["phone"] = f"+1 (555) {random.randint(100, 999)}-{random.randint(1000, 9999)}"
                    enriched["company_domain"] = domain
                    enriched["seniority"] = "Director" if "Director" in contact["title"] else ("VP" if "VP" in contact["title"] else "C-Level")
                    return enriched
        return None
