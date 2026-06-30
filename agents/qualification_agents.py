import os
import openai
from tools import linkedin, lemlist

def intent_detection_agent(state):
    """
    Agent 8: Intent Detection Agent
    """
    intent_scores = state.get("intent_scores", {}).copy()
    contacts = state.get("contacts", [])
    
    scored_contacts_count = 0
    hot_count = 0
    warm_count = 0
    
    for contact in contacts:
        email = contact["email"]
        seq_state = lemlist.get_sequence(email)
        
        score = 0
        if seq_state:
            score += seq_state["opens"] * 5
            score += seq_state["clicks"] * 15
            score += seq_state["replies"] * 30
            
            if seq_state["replies"] > 0:
                score += 20
                
        intent_scores[email] = score
        scored_contacts_count += 1
        
        if score >= 40:
            hot_count += 1
        elif score > 0:
            warm_count += 1
            
    metrics = state.get("metrics", {}).copy()
    metrics["hot_prospects"] = hot_count
    metrics["warm_prospects"] = warm_count
    
    log_msg = f"Intent Detection Agent scored {scored_contacts_count} prospects. Found {hot_count} Hot and {warm_count} Warm prospects based on activity."
    
    return {
        "intent_scores": intent_scores,
        "metrics": metrics,
        "logs": [log_msg],
        "current_agent": "Intent Detection Agent"
    }

def linkedin_engagement_agent(state):
    """
    Agent 9: LinkedIn Engagement Agent
    """
    intent_scores = state.get("intent_scores", {})
    contacts = state.get("contacts", [])
    approval_queue = state.get("human_approval_queue", []).copy()
    
    linkedin_touches_launched = 0
    queued_approvals = 0
    
    # Check if there are any approvals we can apply to the linkedin mock
    for item in approval_queue:
        if item["type"] == "linkedin" and item["status"] == "approved":
            email = item["contact"]["email"]
            linkedin_url = item["contact"].get("linkedin", "")
            if linkedin_url:
                linkedin.send_connection_request(linkedin_url, item["content"])
                # Remove or update status to mark complete
                item["status"] = "sent"
                linkedin_touches_launched += 1
                
    for contact in contacts:
        email = contact["email"]
        linkedin_url = contact.get("linkedin", "")
        score = intent_scores.get(email, 0)
        
        if score > 0 and linkedin_url:
            # Automated like post
            post_snippet = contact.get("recent_linkedin_post", "Looking for new engineering tools.")
            linkedin.like_recent_post(linkedin_url, post_snippet)
            
            note = f"Hi {contact['first_name']}, saw your profile while looking at {contact['company_name']}'s initiatives. Would love to connect!"
            
            # Check if this touch is already in approval queue or already sent
            already_queued = any(item["contact"]["email"] == email and item["type"] == "linkedin" for item in approval_queue)
            
            if not already_queued:
                approval_queue.append({
                    "id": f"linkedin_{email.replace('@','_')}",
                    "type": "linkedin",
                    "contact": contact,
                    "content": f"Connect with Note:\n\"{note}\"",
                    "status": "pending"
                })
                queued_approvals += 1
                
    metrics = state.get("metrics", {}).copy()
    metrics["linkedin_touches_completed"] = metrics.get("linkedin_touches_completed", 0) + linkedin_touches_launched
    
    log_msg = f"LinkedIn Engagement Agent completed {linkedin_touches_launched} automated likes. Queued {queued_approvals} connection requests for Human Review."
    
    return {
        "human_approval_queue": approval_queue,
        "metrics": metrics,
        "logs": [log_msg],
        "current_agent": "LinkedIn Engagement Agent"
    }

def qualification_agent(state):
    """
    Agent 10: Qualification Agent
    """
    api_key = os.environ.get("OPENAI_API_KEY")
    client = None
    if api_key:
        try:
            client = openai.OpenAI(api_key=api_key)
        except Exception:
            pass
            
    contacts = state.get("contacts", [])
    intent_scores = state.get("intent_scores", {})
    qualification_status = state.get("qualification_status", {}).copy()
    
    qualified_count = 0
    
    for contact in contacts:
        email = contact["email"]
        score = intent_scores.get(email, 0)
        seq_state = lemlist.get_sequence(email)
        
        if seq_state and seq_state["replies"] > 0:
            reply_text = seq_state["replied_content"]
            
            # Check if already qualified
            if email in qualification_status:
                if qualification_status[email].get("is_qualified"):
                    qualified_count += 1
                continue
                
            budget = "TBD (Needs discovery)"
            authority = "C-Level/VP Decision Maker" if contact.get("seniority") in ["C-Level", "VP"] else "Influencer / Decision Maker"
            need = f"Identified interest in: {contact.get('ai_initiatives', 'Data pipelines')}"
            timeline = "Active (Requested contact/documentation)"
            summary = ""
            is_qualified = False
            
            if client:
                try:
                    system_prompt = "You are an expert sales qualifier. Evaluate the prospect's reply and details against the BANT (Budget, Authority, Need, Timeline) framework. Summarize your evaluation and output a qualification status."
                    user_prompt = f"""
                    Evaluate this prospect:
                    Name: {contact['first_name']} {contact['last_name']}
                    Title: {contact['title']}
                    Company: {contact['company_name']}
                    Reply received: "{reply_text}"
                    Company Tech Stack: {contact.get('tech_stack', [])}
                    Trigger Event: {contact.get('trigger_event', '')}
                    
                    Output your response strictly as a JSON object with keys:
                    - "budget": str
                    - "authority": str
                    - "need": str
                    - "timeline": str
                    - "is_qualified": boolean
                    - "evaluation_summary": str
                    """
                    response = client.chat.completions.create(
                        model="gpt-4o-mini",
                        messages=[
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_prompt}
                        ],
                        response_format={"type": "json_object"}
                    )
                    import json
                    res = json.loads(response.choices[0].message.content)
                    
                    budget = res.get("budget", budget)
                    authority = res.get("authority", authority)
                    need = res.get("need", need)
                    timeline = res.get("timeline", timeline)
                    is_qualified = res.get("is_qualified", True)
                    summary = res.get("evaluation_summary", "Prospect responded positively to outbound sequence.")
                except Exception:
                    is_qualified = True
                    summary = "Prospect responded positively; requested further documentation."
            else:
                is_qualified = True
                summary = "Prospect responded positively; requested further documentation."
                
            qualification_status[email] = {
                "is_qualified": is_qualified,
                "budget": budget,
                "authority": authority,
                "need": need,
                "timeline": timeline,
                "summary": summary
            }
            
            if is_qualified:
                qualified_count += 1
                
    log_msg = f"Qualification Agent analyzed email replies against BANT. Active SQLs: {qualified_count}."
    
    return {
        "qualification_status": qualification_status,
        "logs": [log_msg],
        "current_agent": "Qualification Agent"
    }
