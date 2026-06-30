import os
import sys
import time

# Add workspace directory to python path to avoid import errors
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from agents.graph import create_bdr_graph
from cli.dashboard import render_dashboard, BOLD, RESET, CYAN, GREEN, YELLOW, RED, BLUE, MAGENTA
from tools import lemlist, hubspot, linkedin

# Initialize compiled graph
graph = create_bdr_graph()
config = {"configurable": {"thread_id": "bdr_pipeline_run"}}

# Initial state setup
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
    "metrics": {
        "accounts_identified": 0,
        "contacts_discovered": 0,
        "contacts_enriched": 0,
        "clean_contacts": 0,
        "risky_contacts_removed": 0,
        "emails_sent": 0,
        "email_opens": 0,
        "email_clicks": 0,
        "email_replies": 0,
        "linkedin_touches_completed": 0,
        "meetings_booked": 0,
        "deals_created": 0,
        "pipeline_value": 0
    },
    "logs": ["Autonomous GTM Engine initialized. Target definition: Credit Unions, Community Banks, Insurance Firms in North America."],
    "current_agent": "None"
}

def get_current_state():
    """
    Get the latest state from LangGraph MemorySaver checkpointer.
    Returns initial_state if graph hasn't started.
    """
    state_snapshot = graph.get_state(config)
    if not state_snapshot or not state_snapshot.values:
        return initial_state
    return state_snapshot.values

def update_current_state(updated_values):
    """
    Update memory checkpointer state directly.
    """
    graph.update_state(config, updated_values)

def run_step():
    """
    Run the LangGraph until the next interrupt (breakpoint) or completion.
    """
    state = get_current_state()
    
    # If the graph has not started running (i.e. snapshot values are empty),
    # invoke with initial_state. Otherwise, invoke with None to resume.
    state_snapshot = graph.get_state(config)
    if not state_snapshot or not state_snapshot.values:
        print(f"\n{BLUE}🚀 Launching discovery phase...{RESET}")
        graph.invoke(initial_state, config)
    else:
        # Check what the next node is
        next_nodes = state_snapshot.next
        if not next_nodes:
            print(f"\n{GREEN}✓ Graph execution has completed. Reset state to run again.{RESET}")
            time.sleep(1.5)
            return
            
        print(f"\n{BLUE}▶ Resuming graph execution from: {next_nodes}...{RESET}")
        graph.invoke(None, config)

def run_auto():
    """
    Run steps continuously until we are blocked by approvals or completion.
    """
    while True:
        state = get_current_state()
        pending_approvals = [item for item in state.get("human_approval_queue", []) if item["status"] == "pending"]
        
        if pending_approvals:
            print(f"\n{YELLOW}⏸ Stopped: Pending approvals in review queue.{RESET}")
            time.sleep(2)
            break
            
        state_snapshot = graph.get_state(config)
        if state_snapshot and not state_snapshot.next:
            print(f"\n{GREEN}✓ Completed all phases.{RESET}")
            time.sleep(2)
            break
            
        run_step()
        time.sleep(1)

def review_approvals():
    """
    Human-in-the-loop review interface.
    """
    state = get_current_state()
    queue = state.get("human_approval_queue", [])
    pending = [item for item in queue if item["status"] == "pending"]
    
    if not pending:
        print(f"\n{GREEN}✓ No pending approvals in queue!{RESET}")
        time.sleep(1.5)
        return
        
    while True:
        # Re-fetch state & pending
        state = get_current_state()
        queue = state.get("human_approval_queue", [])
        pending = [item for item in queue if item["status"] == "pending"]
        if not pending:
            break
            
        render_dashboard(state)
        print(f"\n{BOLD}🔔 PENDING HUMAN REVIEWS ({len(pending)} remaining):{RESET}")
        for idx, item in enumerate(pending):
            c = item["contact"]
            print(f"  {BOLD}[{idx+1}]{RESET} {CYAN}{item['type'].upper()}{RESET} for {c['first_name']} {c['last_name']} ({c['company_name']})")
            
        print(f"  {BOLD}[b]{RESET} Back to Main Menu")
        
        choice = input(f"\n{BOLD}Select an item index to review: {RESET}").strip()
        if choice.lower() == 'b':
            break
            
        try:
            val = int(choice) - 1
            if 0 <= val < len(pending):
                item = pending[val]
                c = item["contact"]
                
                # Show full details
                print(f"\n{BOLD}╔═ Reviewing: {item['type'].upper()} ═════════════════════════════════════════════════{RESET}")
                print(f"  Prospect: {c['first_name']} {c['last_name']} ({c['title']})")
                print(f"  Company:  {c['company_name']}")
                print(f"  Trigger:  {c.get('trigger_event', 'None')}")
                print(f"{BOLD}╠═ Content Preview ══════════════════════════════════════════════════════════{RESET}")
                print(item["content"])
                print(f"{BOLD}╚════════════════════════════════════════════════════════════════════════════{RESET}")
                
                action = input(f"{BOLD}Choose Action: [a]pprove, [r]eject, [e]dit content, or [c]ancel: {RESET}").strip().lower()
                
                if action == 'a':
                    item["status"] = "approved"
                    # Log event
                    log_msg = f"SDR approved {item['type']} touchpoint for {c['first_name']} {c['last_name']} at {c['company_name']}."
                    state["logs"].append(log_msg)
                    update_current_state({"human_approval_queue": queue, "logs": state["logs"]})
                    print(f"{GREEN}✓ Approved!{RESET}")
                    time.sleep(1)
                    
                elif action == 'r':
                    item["status"] = "rejected"
                    log_msg = f"SDR rejected {item['type']} touchpoint for {c['first_name']} {c['last_name']} at {c['company_name']}."
                    state["logs"].append(log_msg)
                    update_current_state({"human_approval_queue": queue, "logs": state["logs"]})
                    print(f"{RED}✖ Rejected!{RESET}")
                    time.sleep(1)
                    
                elif action == 'e':
                    print(f"\n{BOLD}Current Content:{RESET}\n{item['content']}\n")
                    new_content = []
                    print(f"{BLUE}Enter new content (Press Enter on empty line to finish):{RESET}")
                    while True:
                        line = input()
                        if line == "":
                            break
                        new_content.append(line)
                    
                    if new_content:
                        item["content"] = "\n".join(new_content)
                        item["status"] = "approved"
                        log_msg = f"SDR edited & approved {item['type']} touchpoint for {c['first_name']} {c['last_name']} at {c['company_name']}."
                        state["logs"].append(log_msg)
                        update_current_state({"human_approval_queue": queue, "logs": state["logs"]})
                        print(f"{GREEN}✓ Content edited and approved!{RESET}")
                        time.sleep(1)
            else:
                print(f"{RED}Invalid index.{RESET}")
                time.sleep(1)
        except ValueError:
            print(f"{RED}Invalid entry.{RESET}")
            time.sleep(1)

def simulate_engagement():
    """
    Simulation interface: triggers events like Email Opens, Clicks, or Replies on active campaigns.
    """
    state = get_current_state()
    email_outbox = state.get("email_outbox", [])
    
    if not email_outbox:
        print(f"\n{RED}⚠ No outreach emails have been sent yet. Run graph steps first!{RESET}")
        time.sleep(1.5)
        return
        
    while True:
        render_dashboard(state)
        print(f"\n{BOLD}🎯 SELECT PROSPECT TO SIMULATE OUTBOUND ENGAGEMENT:{RESET}")
        
        # Filter for running sequences
        active_recipients = list(set([item["recipient"] for item in email_outbox]))
        
        for idx, email in enumerate(active_recipients):
            seq = lemlist.get_sequence(email)
            status_desc = f"Sent (Opens: {seq['opens']}, Clicks: {seq['clicks']}, Replies: {seq['replies']})"
            print(f"  [{idx+1}] {email:<30} | Status: {status_desc}")
            
        print(f"  [b] Back to Main Menu")
        
        choice = input(f"\n{BOLD}Select index to trigger event: {RESET}").strip()
        if choice.lower() == 'b':
            break
            
        try:
            val = int(choice) - 1
            if 0 <= val < len(active_recipients):
                target_email = active_recipients[val]
                
                print(f"\n{BOLD}Choose event for {target_email}:{RESET}")
                print(f"  [1] Email Open (+5 HubSpot score)")
                print(f"  [2] Link Click (+15 HubSpot score)")
                print(f"  [3] Positive Reply (+30 HubSpot score + triggers Qualification Agent)")
                
                event_choice = input(f"{BOLD}Select event index: {RESET}").strip()
                
                if event_choice == '1':
                    lemlist.trigger_engagement(target_email, "open")
                    log_msg = f"Simulated: {target_email} opened outreach email."
                    state["logs"].append(log_msg)
                    update_current_state({"logs": state["logs"]})
                    print(f"{GREEN}✓ Email open simulated.{RESET}")
                    time.sleep(1)
                    
                elif event_choice == '2':
                    lemlist.trigger_engagement(target_email, "click")
                    log_msg = f"Simulated: {target_email} clicked link in email."
                    state["logs"].append(log_msg)
                    update_current_state({"logs": state["logs"]})
                    print(f"{GREEN}✓ Email click simulated.{RESET}")
                    time.sleep(1)
                    
                elif event_choice == '3':
                    # Optional custom reply text
                    reply_text = input(f"{BOLD}Custom reply text (or leave blank for positive default): {RESET}").strip()
                    lemlist.trigger_engagement(target_email, "reply", reply_text if reply_text else None)
                    log_msg = f"Simulated: {target_email} replied to campaign."
                    state["logs"].append(log_msg)
                    update_current_state({"logs": state["logs"]})
                    print(f"{GREEN}✓ Reply simulated. Next Qualification steps are active.{RESET}")
                    time.sleep(1)
                    break
            else:
                print(f"{RED}Invalid index.{RESET}")
                time.sleep(1)
        except ValueError:
            print(f"{RED}Invalid entry.{RESET}")
            time.sleep(1)

def show_hubspot_records():
    """
    View HubSpot mock CRM Database tables.
    """
    clear_screen()
    print(f"{GREEN}{BOLD}════ HUBSPOT CRM DATABASE VIEW ════{RESET}\n")
    
    contacts = hubspot.get_all_contacts()
    deals = hubspot.get_all_deals()
    tasks = hubspot.get_all_tasks()
    
    print(f"{BOLD}👥 Contacts Database ({len(contacts)} records):{RESET}")
    print(f"  {'Name':<25} | {'Company':<25} | {'Stage':<25} | {'Score':<10}")
    print("  " + "-" * 90)
    for c in contacts:
        name = f"{c['first_name']} {c['last_name']}"
        print(f"  {name:<25} | {c['company_name']:<25} | {c['lifecycle_stage']:<25} | {c['lead_score']:<10}")
        # Print logs for each contact
        for act in hubspot.activities.get(c["email"], [])[-2:]:
            print(f"    ↳ {BLUE}{act['type'].upper()}{RESET}: {act['description']}")
            
    print(f"\n{BOLD}💼 Pipeline Opportunities (Deals - {len(deals)}):{RESET}")
    print(f"  {'Deal Name':<40} | {'Company':<25} | {'Amount':<10} | {'Stage':<15}")
    print("  " + "-" * 98)
    for d in deals:
        print(f"  {d['name']:<40} | {d['associated_company']:<25} | {GREEN}${d['amount']:,}{RESET} | {d['stage']:<15}")
        
    print(f"\n{BOLD}📋 Tasks logged ({len(tasks)}):{RESET}")
    for t in tasks:
        print(f"  - [{t['status']}] {t['title']} (Due: {t['due_date']}) for {t['associated_contact']}")
        
    input(f"\n{BOLD}Press Enter to return to Dashboard...{RESET}")

def main():
    while True:
        state = get_current_state()
        render_dashboard(state)
        
        # Display command menu
        print(f"\n{BOLD}🎮 COMMAND CONTROLS:{RESET}")
        print(f"  {GREEN}[r]{RESET} Step Graph (Run next agent node)")
        print(f"  {GREEN}[e]{RESET} Run Auto (Continuous execution until breakpoint/end)")
        print(f"  {YELLOW}[a]{RESET} Review Approval Queue ({len([i for i in state.get('human_approval_queue', []) if i['status'] == 'pending'])} pending)")
        print(f"  {CYAN}[s]{RESET} Simulate Prospect Engagement Telemetry (Clicks/Opens/Replies)")
        print(f"  {BLUE}[c]{RESET} View HubSpot CRM Database Records")
        print(f"  {RED}[x]{RESET} Reset Platform State")
        print(f"  {BOLD}[q]{RESET} Quit Simulator")
        
        cmd = input(f"\n{BOLD}Select an action: {RESET}").strip().lower()
        
        if cmd == 'r':
            run_step()
        elif cmd == 'e':
            run_auto()
        elif cmd == 'a':
            review_approvals()
        elif cmd == 's':
            simulate_engagement()
        elif cmd == 'c':
            show_hubspot_records()
        elif cmd == 'x':
            # Reset Checkpoint by clearing thread context and tools database
            # We can change thread_id to reset, or call write to graph.
            # But the easiest way is to overwrite memory variables and update graph state
            global hubspot, lemlist, linkedin
            from tools import apollo, clay, zerobounce, inboxkit
            
            # Reset tool states
            hubspot.__init__()
            lemlist.__init__()
            linkedin.__init__()
            apollo.__init__()
            clay.__init__()
            zerobounce.__init__()
            inboxkit.__init__()
            
            # Update checkpointer state
            update_current_state(initial_state)
            
            print(f"\n{GREEN}✓ State checkpointer and tools reset successfully.{RESET}")
            time.sleep(1)
        elif cmd == 'q':
            print(f"\n{BLUE}Exiting BDR Platform simulator. Goodbye!{RESET}")
            break
        else:
            print(f"{RED}Unknown command.{RESET}")
            time.sleep(1)

if __name__ == "__main__":
    main()
