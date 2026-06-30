from tools import apollo, clay, zerobounce
import random

def icp_discovery_agent(state):
    """
    Agent 1: ICP Discovery Agent
    Mission: Continuously identify accounts matching Ideal Customer Profile.
    """
    icp = state.get("icp_definition", {})
    industries = icp.get("industries", ["Credit Unions", "Community Banks", "Insurance Firms"])
    emp_range = icp.get("employee_range", [50, 500])
    geography = icp.get("geography", "North America")
    
    # 1. Search accounts matching ICP
    discovered_companies = apollo.search_accounts(
        industries=industries, 
        employee_range=emp_range, 
        geography=geography
    )
    
    # 2. Map buying committee (CIO, CTO, Head of Data, Analytics Director)
    buying_committee_roles = ["CIO", "CTO", "Head of Data", "Analytics Director"]
    new_contacts = []
    
    for company in discovered_companies:
        domain = company["domain"]
        company_contacts = apollo.find_contacts(domain, roles=buying_committee_roles)
        for c in company_contacts:
            c["company_name"] = company["name"]
            c["company_score"] = company["score"]
            c["industry"] = company["industry"]
            new_contacts.append(c)
            
    # Update metrics
    metrics = state.get("metrics", {}).copy()
    metrics["accounts_identified"] = len(discovered_companies)
    metrics["contacts_discovered"] = len(new_contacts)
    
    log_msg = f"ICP Discovery Agent identified {len(discovered_companies)} accounts matching ICP and mapped {len(new_contacts)} buying committee contacts."
    
    return {
        "accounts": discovered_companies,
        "contacts": new_contacts,
        "metrics": metrics,
        "logs": [log_msg],
        "current_agent": "ICP Discovery Agent"
    }

def contact_intelligence_agent(state):
    """
    Agent 2: Contact Intelligence Agent
    Mission: Build account intelligence and enrich contacts.
    """
    enriched_contacts = []
    for contact in state.get("contacts", []):
        email = contact["email"]
        domain = email.split("@")[-1] if "@" in email else ""
        
        # Enrich contact from Apollo (get phone, seniority, etc.)
        apollo_enriched = apollo.enrich_contact(email) or {}
        contact.update(apollo_enriched)
        
        # Enrich signals from Clay (recent promotions, job changes, funding, tech, AI initiatives)
        clay_signals = clay.get_company_signals(domain)
        contact_signals = clay.get_contact_signals(email)
        
        contact["ai_initiatives"] = clay_signals.get("ai_initiatives", "")
        contact["funding_status"] = clay_signals.get("funding", "")
        contact["job_changes"] = clay_signals.get("job_changes", [])
        contact["trigger_event"] = clay_signals.get("trigger_event", "")
        contact["recent_linkedin_post"] = contact_signals.get("recent_linkedin_post", "")
        
        enriched_contacts.append(contact)
        
    metrics = state.get("metrics", {}).copy()
    metrics["contacts_enriched"] = len(enriched_contacts)
    
    log_msg = f"Contact Intelligence Agent gathered job changes, funding records, and tech signals for {len(enriched_contacts)} contacts."
    
    return {
        "contacts": enriched_contacts,
        "metrics": metrics,
        "logs": [log_msg],
        "current_agent": "Contact Intelligence Agent"
    }

def data_quality_agent(state):
    """
    Agent 3: Data Quality Agent
    Mission: Ensure outreach data quality by validating emails and filtering risky contacts.
    """
    clean_contacts = []
    removed_contacts = []
    
    test_contacts = state.get("contacts", []).copy()
    
    # If this is the first run, inject invalid/risky contacts to demonstrate validation logic
    if not any(c["email"].startswith("spamtrap") or c["email"].startswith("abuse") for c in test_contacts):
        test_contacts.append({
            "first_name": "Spam", "last_name": "Tester", 
            "email": "spamtrap@beaconcb.com", "title": "Tester", "role": "QA",
            "company_name": "Beacon Community Bank", "linkedin": ""
        })
        test_contacts.append({
            "first_name": "Abuse", "last_name": "Reporter", 
            "email": "abuse@summitmutual.com", "title": "Admin", "role": "Admin",
            "company_name": "Summit Mutual Insurance", "linkedin": ""
        })
        test_contacts.append({
            "first_name": "Invalid", "last_name": "User", 
            "email": "test_invalid@apexfcu.org", "title": "Unknown", "role": "Unknown",
            "company_name": "Apex Federal Credit Union", "linkedin": ""
        })

    for contact in test_contacts:
        email = contact["email"]
        validation = zerobounce.validate_email(email)
        
        contact["email_status"] = validation["status"]
        contact["email_score"] = validation["score"]
        
        if validation["status"] == "valid":
            clean_contacts.append(contact)
        else:
            removed_contacts.append(f"{email} ({validation['status']})")
            
    metrics = state.get("metrics", {}).copy()
    metrics["clean_contacts"] = len(clean_contacts)
    metrics["risky_contacts_removed"] = len(removed_contacts)
    
    log_msg = f"Data Quality Agent validated emails using ZeroBounce. Passed: {len(clean_contacts)}. Rejected: {len(removed_contacts)} ({', '.join(removed_contacts)})."
    
    return {
        "contacts": clean_contacts,
        "metrics": metrics,
        "logs": [log_msg],
        "current_agent": "Data Quality Agent"
    }
