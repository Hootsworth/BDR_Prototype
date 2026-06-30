import os
import sys

# Add directory to python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from agents.graph import create_bdr_graph
from tools import lemlist, hubspot

def run_verification_test():
    print("🧪 Starting Autonomous BDR Platform Automated Verification Test...")
    
    # 1. Compile the graph
    try:
        graph = create_bdr_graph()
        print("✅ LangGraph compiled successfully.")
    except Exception as e:
        print(f"❌ LangGraph compilation failed: {e}")
        sys.exit(1)
        
    config = {"configurable": {"thread_id": "verify_thread"}}
    
    initial_state = {
        "icp_definition": {
            "industries": ["Credit Unions", "Community Banks", "Insurance Firms"],
            "employee_range": [50, 500],
            "geography": "North America"
        },
        "accounts": [],
        "contacts": [],
        "sequences": {},
        "email_outbox": [],
        "linkedin_actions": [],
        "intent_scores": {},
        "qualification_status": {},
        "crm_records": {
            "contacts": [],
            "deals": [],
            "booked_meetings": [],
            "total_pipeline_value": 0
        },
        "human_approval_queue": [],
        "metrics": {},
        "logs": ["Verification test initialized."],
        "current_agent": "None"
    }
    
    # 2. Invoke Phase 1: Discovery
    print("\n➡️ Executing Discovery Phase (ICP -> Contact Intel -> Data Quality -> Personalization)...")
    try:
        # We invoke the graph. It should run through:
        # - icp_discovery
        # - contact_intelligence
        # - data_quality
        # - personalization
        # And stop at "campaign_launch" because of interrupt_before
        graph.invoke(initial_state, config)
    except Exception as e:
        print(f"❌ Execution failed during first run: {e}")
        sys.exit(1)
        
    state = graph.get_state(config)
    print(f"✅ Breakpoint hit. Next node: {state.next}")
    print(f"Discovered Accounts: {len(state.values['accounts'])}")
    print(f"Discovered Contacts: {len(state.values['contacts'])}")
    print(f"Human Approval Queue size: {len(state.values['human_approval_queue'])}")
    
    assert len(state.values['accounts']) > 0, "No accounts discovered!"
    assert len(state.values['contacts']) > 0, "No contacts mapped!"
    assert len(state.values['human_approval_queue']) > 0, "No high-value emails queued for approval!"
    print("✅ Discovery Phase output validation passed.")
    
    # 3. Simulate Human Approval
    print("\n➡️ Simulating Human Approvals for email copy...")
    queue = state.values['human_approval_queue']
    for item in queue:
        if item["type"] == "email":
            item["status"] = "approved"
            print(f"  Approved email copy for {item['contact']['email']}")
            
    # Update state
    graph.update_state(config, {"human_approval_queue": queue})
    print("✅ Memory checkpointer updated with approvals.")
    
    # 4. Resume execution to Campaign Launch
    print("\n➡️ Resuming campaign launch...")
    graph.invoke(None, config)
    state = graph.get_state(config)
    print(f"✅ Breakpoint hit. Next node: {state.next}")
    print(f"Emails Sent: {state.values['metrics'].get('emails_sent', 0)}")
    
    assert state.values['metrics'].get('emails_sent', 0) > 0, "No emails sent!"
    print("✅ Campaign Launch and Deliverability validation passed.")
    
    # 5. Simulate Telemetry Engagement (prospect opening and replying)
    print("\n➡️ Simulating email telemetry engagement (Opens and Reply)...")
    email_outbox = state.values['email_outbox']
    recipients = [item["recipient"] for item in email_outbox]
    
    # Trigger events in shared lemlist singleton
    target_contact = recipients[0]
    lemlist.trigger_engagement(target_contact, "open")
    lemlist.trigger_engagement(target_contact, "reply", "Hi, this is Marcus. I saw your LLM compliance message and we are looking at this next week. Let's schedule something.")
    print(f"  Logged open & reply for contact: {target_contact}")
    
    # 6. Resume execution to Intent and LinkedIn engagement
    print("\n➡️ Resuming through Intent Detection & LinkedIn Engagement...")
    graph.invoke(None, config)
    state = graph.get_state(config)
    print(f"✅ Breakpoint hit. Next node: {state.next}")
    print(f"Hot prospects: {state.values['metrics'].get('hot_prospects', 0)}")
    print(f"Approval Queue size (LinkedIn / Calendar): {len(state.values['human_approval_queue'])}")
    
    # 7. Approve LinkedIn request and Calendar booking
    print("\n➡️ Simulating approvals for LinkedIn request & calendar invites...")
    queue = state.values['human_approval_queue']
    for item in queue:
        if item["status"] == "pending":
            item["status"] = "approved"
            print(f"  Approved {item['type']} touchpoint for {item['contact']['email']}")
            
    graph.update_state(config, {"human_approval_queue": queue})
    
    # 8. Resume to final pipeline creation (HubSpot deal update)
    print("\n➡️ Resuming final Pipeline and CRM Integration stage...")
    graph.invoke(None, config)
    state = graph.get_state(config)
    
    print("\n✅ Verification complete. Final CRM statistics:")
    contacts = hubspot.get_all_contacts()
    deals = hubspot.get_all_deals()
    print(f"  Synced CRM Contacts count: {len(contacts)}")
    print(f"  Deals in Pipeline: {len(deals)}")
    print(f"  Pipeline ARR Generated: ${state.values['metrics'].get('pipeline_value', 0):,}")
    
    assert len(contacts) > 0, "No CRM contacts synced!"
    assert len(deals) > 0, "No Opportunity deals created!"
    print("\n🌟 ALL TESTS PASSED SUCCESSFULLY! 🌟")

if __name__ == "__main__":
    run_verification_test()
