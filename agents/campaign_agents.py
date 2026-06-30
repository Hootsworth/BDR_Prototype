import os
import openai
import random
from tools import lemlist, inboxkit

def personalization_agent(state):
    """
    Agent 4: Personalization Agent
    Mission: Generate highly personalized outreach.
    """
    api_key = os.environ.get("OPENAI_API_KEY")
    client = None
    if api_key:
        try:
            client = openai.OpenAI(api_key=api_key)
        except Exception:
            pass
            
    contacts = state.get("contacts", [])
    sequences = state.get("sequences", {}).copy()
    approval_queue = state.get("human_approval_queue", []).copy()
    
    personalized_count = 0
    human_reviews_created = 0
    
    for contact in contacts:
        email = contact["email"]
        company = contact["company_name"]
        first_name = contact["first_name"]
        trigger = contact.get("trigger_event", "General growth")
        ai_init = contact.get("ai_initiatives", "")
        linkedin_post = contact.get("recent_linkedin_post", "")
        company_score = contact.get("company_score", 80)
        
        subject = ""
        body = ""
        
        if "CTO" in contact["title"] or "Information" in contact["title"]:
            template_key = "fintech_cto_llm"
        elif "Data" in contact["title"] or "Analytics" in contact["title"]:
            template_key = "credit_union_risk"
        else:
            template_key = "general_gtm"
            
        tpl = lemlist.templates[template_key]
        
        if client:
            try:
                system_prompt = "You are an expert outbound BDR specializing in sales development for SaaS enterprise platforms. Generate a short, direct, highly personalized email outreach copy (1-2 paragraphs max, no generic fluff)."
                user_prompt = f"""
                Draft a personalized outreach email for the following prospect:
                Name: {first_name} {contact['last_name']}
                Title: {contact['title']}
                Company: {company}
                Trigger Event/Signals: {trigger}
                AI Initiatives: {ai_init}
                LinkedIn Post: {linkedin_post}
                
                Base Subject Idea: {tpl['subject'].format(company_name=company)}
                Base Body Structure: {tpl['body'].format(first_name=first_name, company_name=company)}
                
                Output your response strictly as a JSON object with keys "subject" and "body".
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
                res_content = json.loads(response.choices[0].message.content)
                subject = res_content.get("subject", tpl["subject"].format(company_name=company))
                body = res_content.get("body", tpl["body"].format(first_name=first_name, company_name=company))
            except Exception as e:
                subject = tpl["subject"].format(company_name=company)
                body = tpl["body"].format(first_name=first_name, company_name=company)
        else:
            subject = tpl["subject"].format(company_name=company)
            body = tpl["body"].format(first_name=first_name, company_name=company)
            if trigger:
                body = body.replace("recent initiatives.", f"recent initiatives around: '{trigger}'.")
            if linkedin_post:
                body = body.replace("Best,", f"I saw your recent LinkedIn post about '{linkedin_post[:35]}...' and found it very relevant.\n\nBest,")
                
        is_high_value = company_score >= 88
        
        # Check if this copy was edited or approved in state already to preserve changes
        existing_seq = sequences.get(email, {})
        if existing_seq and existing_seq.get("status") in ["running", "approved"]:
            continue
            
        sequences[email] = {
            "subject": subject,
            "body": body,
            "is_high_value": is_high_value,
            "status": "pending_approval" if is_high_value else "approved"
        }
        
        if is_high_value:
            if not any(item["contact"]["email"] == email and item["type"] == "email" for item in approval_queue):
                approval_queue.append({
                    "id": f"email_{email.replace('@','_')}",
                    "type": "email",
                    "contact": contact,
                    "content": f"Subject: {subject}\n\n{body}",
                    "status": "pending"
                })
                human_reviews_created += 1
        else:
            personalized_count += 1
            
    log_msg = f"Personalization Agent generated {len(contacts)} tailored emails. Scheduled {personalized_count} automated sequences and routed {human_reviews_created} high-value accounts to the Human Approval Queue."
    
    return {
        "sequences": sequences,
        "human_approval_queue": approval_queue,
        "logs": [log_msg],
        "current_agent": "Personalization Agent"
    }

def campaign_launch_agent(state):
    """
    Agent 5: Campaign Launch Agent
    Mission: Deploy outreach campaigns.
    """
    sequences = state.get("sequences", {})
    contacts = state.get("contacts", [])
    email_outbox = state.get("email_outbox", []).copy()
    
    # Check if there are any approvals we can apply to the sequences dictionary
    approval_queue = state.get("human_approval_queue", [])
    for item in approval_queue:
        if item["type"] == "email" and item["status"] == "approved":
            email = item["contact"]["email"]
            if email in sequences and sequences[email]["status"] == "pending_approval":
                # Extract subject and body from approved content
                content_lines = item["content"].split("\n\n", 1)
                subject = content_lines[0].replace("Subject: ", "")
                body = content_lines[1] if len(content_lines) > 1 else ""
                
                sequences[email]["subject"] = subject
                sequences[email]["body"] = body
                sequences[email]["status"] = "approved"
                
    launched_count = 0
    skipped_high_value = 0
    
    inboxes = inboxkit.get_healthy_sending_inboxes()
    if not inboxes:
        return {
            "logs": ["Campaign Launch Agent error: No healthy sending inboxes available!"],
            "current_agent": "Campaign Launch Agent"
        }
        
    for contact in contacts:
        email = contact["email"]
        seq_config = sequences.get(email, {})
        
        if not seq_config:
            continue
            
        if seq_config.get("is_high_value") and seq_config.get("status") == "pending_approval":
            skipped_high_value += 1
            continue
            
        subject = seq_config["subject"]
        body = seq_config["body"]
        
        if seq_config.get("status") == "approved":
            sender_inbox = random_inbox_selection(inboxes)
            
            if not lemlist.get_sequence(email):
                lemlist.add_to_sequence(contact, "seq_gtm_v1", subject, body)
                inboxkit.log_send(sender_inbox)
                
                email_outbox.append({
                    "recipient": email,
                    "sender": sender_inbox,
                    "subject": subject,
                    "body": body,
                    "status": "sent"
                })
                
                sequences[email]["status"] = "running"
                launched_count += 1
            
    metrics = state.get("metrics", {}).copy()
    metrics["emails_sent"] = metrics.get("emails_sent", 0) + launched_count
    
    log_msg = f"Campaign Launch Agent deployed {launched_count} active Lemlist sequences. Skipped {skipped_high_value} pending high-value accounts."
    
    return {
        "email_outbox": email_outbox,
        "sequences": sequences,
        "metrics": metrics,
        "logs": [log_msg],
        "current_agent": "Campaign Launch Agent"
    }

def random_inbox_selection(inboxes):
    return random.choice(inboxes) if inboxes else "sdr1@gtm-engine-outreach.com"

def deliverability_agent(state):
    """
    Agent 6: Deliverability Agent
    """
    warned_domains = []
    healthy_inboxes = []
    
    for sender_email in ["sdr1@gtm-engine-outreach.com", "sdr2@gtm-engine-outreach.com", "rep@outbound-scale.net"]:
        health = inboxkit.get_inbox_health(sender_email)
        if health["status"] == "warning" or health["spam_score"] > 4.0:
            warned_domains.append(f"{sender_email} (Spam Score: {health['spam_score']})")
        else:
            healthy_inboxes.append(sender_email)
            
    metrics = state.get("metrics", {}).copy()
    metrics["healthy_senders"] = len(healthy_inboxes)
    metrics["sender_warnings"] = len(warned_domains)
    
    log_msg = f"Deliverability Agent checked sender reputations. Healthy inboxes: {len(healthy_inboxes)}. Warnings: {len(warned_domains)} ({', '.join(warned_domains)})."
    
    return {
        "metrics": metrics,
        "logs": [log_msg],
        "current_agent": "Deliverability Agent"
    }

def engagement_monitoring_agent(state):
    """
    Agent 7: Engagement Monitoring Agent
    """
    active_sequences = lemlist.get_all_active_sequences()
    
    opens_count = 0
    clicks_count = 0
    replies_count = 0
    
    engagement_log = []
    
    for email, seq in active_sequences.items():
        opens_count += seq["opens"]
        clicks_count += seq["clicks"]
        replies_count += seq["replies"]
        
        if seq["opens"] > 0 or seq["clicks"] > 0 or seq["replies"] > 0:
            engagement_log.append(f"{email}: Op={seq['opens']}, Clk={seq['clicks']}, Rep={seq['replies']}")
            
    metrics = state.get("metrics", {}).copy()
    metrics["email_opens"] = opens_count
    metrics["email_clicks"] = clicks_count
    metrics["email_replies"] = replies_count
    
    log_msg = f"Engagement Monitoring Agent tracked telemetry. Total Opens: {opens_count}, Clicks: {clicks_count}, Replies: {replies_count}. Activity: {', '.join(engagement_log) if engagement_log else 'None'}."
    
    return {
        "metrics": metrics,
        "logs": [log_msg],
        "current_agent": "Engagement Monitoring Agent"
    }
