from tools import hubspot
import random

def meeting_scheduler_agent(state):
    """
    Agent 11: Meeting Scheduling Agent
    Mission: Convert qualified leads into meetings.
    """
    qualification_status = state.get("qualification_status", {})
    contacts = state.get("contacts", [])
    approval_queue = state.get("human_approval_queue", []).copy()
    crm_records = state.get("crm_records", {}).copy()
    
    booked_meetings = crm_records.get("booked_meetings", [])
    queued_invites = 0
    
    # Process approvals from the queue
    for item in approval_queue:
        if item["type"] == "calendar" and item["status"] == "approved":
            email = item["contact"]["email"]
            if email not in booked_meetings:
                booked_meetings.append(email)
                
    for contact in contacts:
        email = contact["email"]
        q_status = qualification_status.get(email, {})
        
        # If prospect is qualified, propose a meeting
        if q_status.get("is_qualified"):
            already_scheduled = email in booked_meetings
            already_queued = any(item["contact"]["email"] == email and item["type"] == "calendar" for item in approval_queue)
            
            if not already_scheduled and not already_queued:
                meeting_time = "Next Wednesday at 2:00 PM EST"
                invite_body = f"Discovery Call: {contact['company_name']} x SaaS Platform\nDate: {meeting_time}\nAttendees: {contact['first_name']} {contact['last_name']}, AE Representative\nAgenda: Discuss {q_status.get('need', 'data pipelines')} and evaluate product fit."
                
                approval_queue.append({
                    "id": f"calendar_{email.replace('@','_')}",
                    "type": "calendar",
                    "contact": contact,
                    "content": invite_body,
                    "meeting_time": meeting_time,
                    "status": "pending"
                })
                queued_invites += 1
                
    crm_records["booked_meetings"] = booked_meetings
    
    metrics = state.get("metrics", {}).copy()
    metrics["queued_calendar_invites"] = queued_invites
    
    log_msg = f"Meeting Scheduling Agent prepared {queued_invites} calendar invitations. Sent to Human Approval Queue."
    
    return {
        "human_approval_queue": approval_queue,
        "crm_records": crm_records,
        "metrics": metrics,
        "logs": [log_msg],
        "current_agent": "Meeting Scheduling Agent"
    }

def crm_intelligence_agent(state):
    """
    Agent 12: CRM Intelligence Agent
    Mission: Maintain HubSpot CRM hygiene.
    """
    contacts = state.get("contacts", [])
    sequences = state.get("sequences", {})
    qualification_status = state.get("qualification_status", {})
    crm_records = state.get("crm_records", {}).copy()
    
    booked_meetings = crm_records.get("booked_meetings", [])
    total_pipeline_value = crm_records.get("total_pipeline_value", 0)
    
    contacts_synced = 0
    deals_created_count = 0
    
    for contact in contacts:
        email = contact["email"]
        seq = sequences.get(email, {})
        q_status = qualification_status.get(email, {})
        
        # 1. Sync contact properties to HubSpot
        properties = {
            "first_name": contact["first_name"],
            "last_name": contact["last_name"],
            "title": contact["title"],
            "company_name": contact["company_name"],
            "phone": contact.get("phone", ""),
            "lead_score": contact.get("email_score", 90)
        }
        
        hubspot.upsert_contact(email, properties)
        contacts_synced += 1
        
        # 2. Update lifecycle stage
        stage = "Prospect"
        if seq:
            stage = "Engaged"
            if seq.get("status") == "running":
                hubspot.log_activity(email, "outreach_sent", "Outreach email sent via Lemlist")
                
        if q_status.get("is_qualified"):
            stage = "Sales Qualified Lead"
            
        # Check if meeting was booked
        # We check both local state and the approved status in state
        is_meeting_approved = False
        meeting_time = None
        for item in state.get("human_approval_queue", []):
            if item["contact"]["email"] == email and item["type"] == "calendar" and item["status"] == "approved":
                is_meeting_approved = True
                meeting_time = item["meeting_time"]
                break
                
        if (is_meeting_approved or email in booked_meetings) and email not in booked_meetings:
            booked_meetings.append(email)
            
        if email in booked_meetings:
            stage = "Discovery Scheduled"
            # Ensure it is logged in HubSpot mock
            contact_record = hubspot.get_contact(email)
            if contact_record and contact_record["lifecycle_stage"] != "Discovery Scheduled":
                hubspot.log_activity(email, "meeting_booked", "Discovery call scheduled")
                
                # Create deal
                deal_name = f"{contact['company_name']} - Data Automation Platform"
                deal_value = random.randint(3, 12) * 5000 
                hubspot.create_deal(email, deal_name, deal_value)
                
                deals_created_count += 1
                total_pipeline_value += deal_value
                
        hubspot.update_lifecycle_stage(email, stage)
        
    hubspot_contacts = hubspot.get_all_contacts()
    hubspot_deals = hubspot.get_all_deals()
    
    crm_records["contacts"] = hubspot_contacts
    crm_records["deals"] = hubspot_deals
    crm_records["booked_meetings"] = booked_meetings
    crm_records["total_pipeline_value"] = total_pipeline_value
    
    # Update metrics
    metrics = state.get("metrics", {}).copy()
    metrics["crm_contacts_synced"] = contacts_synced
    metrics["meetings_booked"] = len(booked_meetings)
    metrics["deals_created"] = len(hubspot_deals)
    metrics["pipeline_value"] = total_pipeline_value
    
    log_msg = f"CRM Intelligence Agent updated HubSpot CRM. Synced {contacts_synced} contacts. Logged {len(booked_meetings)} meetings. Created {deals_created_count} deals. Total Pipeline: ${total_pipeline_value:,} ARR."
    
    return {
        "crm_records": crm_records,
        "metrics": metrics,
        "logs": [log_msg],
        "current_agent": "CRM Intelligence Agent"
    }
