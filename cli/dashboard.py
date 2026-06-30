import os

# ANSI color codes
BLUE = "\033[94m"
GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
CYAN = "\033[96m"
MAGENTA = "\033[95m"
BOLD = "\033[1m"
RESET = "\033[0m"

def clear_screen():
    os.system('cls' if os.name == 'nt' else 'clear')

def draw_header(status_message="STANDBY"):
    width = 110
    print(f"{BLUE}{BOLD}╔" + "═" * (width - 2) + "╗{RESET}")
    print(f"{BLUE}{BOLD}║{RESET}  {CYAN}{BOLD}⚡ AUTONOMOUS BDR GTM PLATFORM v1.0 (LangGraph-orchestrated) ⚡{RESET}" + " " * (width - 66) + f"{BLUE}{BOLD}║{RESET}")
    status_fmt = f"{GREEN}{BOLD}● ACTIVE RUNNING" if "RUNNING" in status_message else (f"{YELLOW}{BOLD}⏸ WAITING APPROVAL" if "WAITING" in status_message else f"{BLUE}{BOLD}■ STANDBY")
    print(f"{BLUE}{BOLD}║{RESET}  Status: {status_fmt}{RESET}" + " " * (width - 10 - len(status_message) - 15) + f"{BLUE}{BOLD}║{RESET}")
    print(f"{BLUE}{BOLD}╚" + "═" * (width - 2) + "╝{RESET}")

def render_dashboard(state):
    clear_screen()
    
    # Calculate values from state
    metrics = state.get("metrics", {})
    logs = state.get("logs", [])
    active_agent = state.get("current_agent", "None")
    approval_queue = state.get("human_approval_queue", [])
    pending_approvals = [item for item in approval_queue if item["status"] == "pending"]
    crm = state.get("crm_records", {})
    
    # Status context
    status = "STANDBY"
    if pending_approvals:
        status = "WAITING FOR APPROVALS"
    elif active_agent != "None":
        status = f"RUNNING [{active_agent}]"
        
    draw_header(status)
    
    width = 110
    
    # Grid Layout: Left Panel (Cheklists) & Right Panel (Metrics / Pipeline)
    # Left column: width 50, Right column: width 55, spacing 5
    
    print(f"{BOLD}┌─ BDR DAILY WORKFLOW CHECKLIST ──────────────┐   ┌─ CAMPAIGN PIPELINE PERFORMANCE ─────────────┐{RESET}")
    
    # Line 1: Morning Check vs Enriched Contacts
    morning_check = "✓" if metrics.get("accounts_identified", 0) > 0 else "○"
    line_left = f" {GREEN if morning_check == '✓' else RESET}{morning_check} Review CRM Tasks & Email Replies{RESET}"
    line_left = f"{line_left:<54}"
    
    line_right = f" Accounts Discovered: {CYAN}{metrics.get('accounts_identified', 0)}{RESET}"
    line_right = f"{line_right:<52}"
    print(f"│{line_left}│   │{line_right}│")
    
    # Line 2: Prospecting vs Contacts Enriched
    prospecting_check = "✓" if metrics.get("contacts_enriched", 0) > 0 else "○"
    line_left = f" {GREEN if prospecting_check == '✓' else RESET}{prospecting_check} Prospecting: Target ICP mapped & signals checked{RESET}"
    line_left = f"{line_left:<54}"
    
    line_right = f" Contacts Enriched:   {CYAN}{metrics.get('contacts_enriched', 0)}{RESET}"
    line_right = f"{line_right:<52}"
    print(f"│{line_left}│   │{line_right}│")

    # Line 3: Data validation vs Clean Contacts
    dq_check = "✓" if metrics.get("clean_contacts", 0) > 0 else "○"
    line_left = f" {GREEN if dq_check == '✓' else RESET}{dq_check} Data Quality: Emails verified via ZeroBounce{RESET}"
    line_left = f"{line_left:<54}"
    
    line_right = f" Verified Safe Emails: {GREEN}{metrics.get('clean_contacts', 0)}{RESET} (Rejected: {RED}{metrics.get('risky_contacts_removed', 0)}{RESET})"
    line_right = f"{line_right:<52}"
    print(f"│{line_left}│   │{line_right}│")

    # Line 4: Personalization vs Emails Sent
    pers_check = "✓" if len(state.get("sequences", {})) > 0 else "○"
    line_left = f" {GREEN if pers_check == '✓' else RESET}{pers_check} Personalization: Tailored email copy generated{RESET}"
    line_left = f"{line_left:<54}"
    
    line_right = f" Emails Sent (Lemlist): {BLUE}{metrics.get('emails_sent', 0)}{RESET}"
    line_right = f"{line_right:<52}"
    print(f"│{line_left}│   │{line_right}│")
    
    # Line 5: Outreach vs Opens/Clicks
    outreach_check = "✓" if metrics.get("emails_sent", 0) > 0 else "○"
    line_left = f" {GREEN if outreach_check == '✓' else RESET}{outreach_check} Outreach: Email sequences active{RESET}"
    line_left = f"{line_left:<54}"
    
    line_right = f" Email Engagement:    {GREEN}◉ {metrics.get('email_opens', 0)} Opens{RESET}  |  {YELLOW}✦ {metrics.get('email_clicks', 0)} Clicks{RESET}"
    line_right = f"{line_right:<52}"
    print(f"│{line_left}│   │{line_right}│")

    # Line 6: Social Engagement vs Replies
    linkedin_check = "✓" if metrics.get("linkedin_touches_completed", 0) > 0 else "○"
    line_left = f" {GREEN if linkedin_check == '✓' else RESET}{linkedin_check} LinkedIn Engagement: Likes & InMails active{RESET}"
    line_left = f"{line_left:<54}"
    
    line_right = f" Positive Replies:    {MAGENTA}✉ {metrics.get('email_replies', 0)}{RESET}"
    line_right = f"{line_right:<52}"
    print(f"│{line_left}│   │{line_right}│")
    
    # Line 7: CRM Sync vs Deals created
    crm_check = "✓" if metrics.get("crm_contacts_synced", 0) > 0 else "○"
    line_left = f" {GREEN if crm_check == '✓' else RESET}{crm_check} CRM Sync: HubSpot hygiene checked{RESET}"
    line_left = f"{line_left:<54}"
    
    line_right = f" Opportunity Deals:   {GREEN}{metrics.get('deals_created', 0)}{RESET}"
    line_right = f"{line_right:<52}"
    print(f"│{line_left}│   │{line_right}│")

    # Line 8: Pipeline Value vs Meetings Booked
    pipeline_val = metrics.get("pipeline_value", 0)
    line_left = f" {'✓' if pipeline_val > 0 else '○'} AE Handoff: Meetings Booked & Opportunities{RESET}"
    line_left = f"{line_left:<54}"
    
    line_right = f" Pipeline Influenced:  {GREEN}${pipeline_val:,} ARR{RESET}"
    line_right = f"{line_right:<52}"
    print(f"│{line_left}│   │{line_right}│")
    
    print(f"{BOLD}└─────────────────────────────────────────────┘   └─────────────────────────────────────────────┘{RESET}")
    
    # Draw Graph Flowchart
    print(f"\n{BOLD}┌─ LANGGRAPH AGENT ORCHESTRATION PIPELINE ──────────────────────────────────────────────────────┐{RESET}")
    
    # Phase 1
    p1_nodes = ["icp_discovery", "contact_intelligence", "data_quality"]
    p1_disp = []
    for node in p1_nodes:
        name = node.replace("_", " ").title()
        if active_agent.lower().replace(" agent", "").replace(" ", "_") == node or (active_agent == "Contact Intelligence Agent" and node == "contact_intelligence"):
            p1_disp.append(f"{GREEN}[{name}]{RESET}")
        else:
            p1_disp.append(f"{RESET}{name}{RESET}")
    print(f"│  {BOLD}Discovery:{RESET}   " + " ➔ ".join(p1_disp) + " " * (94 - sum(len(n) for n in p1_disp) + 24) + "│")
    
    # Phase 2
    p2_nodes = ["personalization", "campaign_launch", "deliverability"]
    p2_disp = []
    for node in p2_nodes:
        name = node.replace("_", " ").title()
        if active_agent.lower().replace(" agent", "").replace(" ", "_") == node:
            p2_disp.append(f"{GREEN}[{name}]{RESET}")
        else:
            p2_disp.append(f"{RESET}{name}{RESET}")
    print(f"│  {BOLD}Engagement:{RESET}  " + " ➔ ".join(p2_disp) + " " * (94 - sum(len(n) for n in p2_disp) + 24) + "│")

    # Phase 3 & 4
    p3_nodes = ["engagement_monitoring", "intent_detection", "linkedin_engagement", "qualification"]
    p3_disp = []
    for node in p3_nodes:
        name = node.replace("_", " ").title()
        if active_agent.lower().replace(" agent", "").replace(" ", "_") == node:
            p3_disp.append(f"{GREEN}[{name}]{RESET}")
        else:
            p3_disp.append(f"{RESET}{name}{RESET}")
    print(f"│  {BOLD}Qualify:{RESET}     " + " ➔ ".join(p3_disp) + " " * (94 - sum(len(n) for n in p3_disp) + 32) + "│")

    # Phase 5
    p4_nodes = ["meeting_scheduler", "crm_intelligence"]
    p4_disp = []
    for node in p4_nodes:
        name = node.replace("_", " ").title()
        if active_agent.lower().replace(" agent", "").replace(" ", "_") == node:
            p4_disp.append(f"{GREEN}[{name}]{RESET}")
        else:
            p4_disp.append(f"{RESET}{name}{RESET}")
    print(f"│  {BOLD}Pipeline:{RESET}    " + " ➔ ".join(p4_disp) + " " * (94 - sum(len(n) for n in p4_disp) + 16) + "│")

    print(f"{BOLD}└───────────────────────────────────────────────────────────────────────────────────────────────┘{RESET}")
    
    # Human Review Queue Section
    if pending_approvals:
        print(f"\n{YELLOW}{BOLD}⚠ HUMAN-IN-THE-LOOP INTERRUPT: {len(pending_approvals)} PENDING REVIEWS{RESET}")
        print(f"{BOLD}┌" + "─" * 108 + "┐{RESET}")
        for idx, item in enumerate(pending_approvals[:3]):
            contact = item["contact"]
            c_name = f"{contact['first_name']} {contact['last_name']} ({contact['company_name']})"
            t_name = f"{BLUE}[{item['type'].upper()} APPROVAL]{RESET}"
            preview = item['content'].replace('\n', ' ')[:70] + "..."
            print(f"│  [{idx+1}] {t_name:<25} {c_name:<35} | {preview:<45} │")
        if len(pending_approvals) > 3:
            print(f"│  ... and {len(pending_approvals)-3} more pending items.                                                           │")
        print(f"{BOLD}└" + "─" * 108 + "┘{RESET}")
        
    # Latest Log output
    print(f"\n{BOLD}┌─ LATEST SYSTEM EVENT LOGS ────────────────────────────────────────────────────────────────────┐{RESET}")
    for log in logs[-4:]:
        # Truncate to match box size
        clean_log = log[:104]
        print(f"│ {CYAN}ℹ{RESET} {clean_log:<105} │")
    for _ in range(max(0, 4 - len(logs))):
        print(f"│                                                                                               │")
    print(f"{BOLD}└───────────────────────────────────────────────────────────────────────────────────────────────┘{RESET}")
