from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver

from agents.state import BDRState
from agents.discovery_agents import icp_discovery_agent, contact_intelligence_agent, data_quality_agent
from agents.campaign_agents import personalization_agent, campaign_launch_agent, deliverability_agent, engagement_monitoring_agent
from agents.qualification_agents import intent_detection_agent, linkedin_engagement_agent, qualification_agent
from agents.pipeline_agents import meeting_scheduler_agent, crm_intelligence_agent

def create_bdr_graph():
    # 1. Initialize the StateGraph with our custom BDRState
    builder = StateGraph(BDRState)
    
    # 2. Add all 12 BDR agent nodes
    builder.add_node("icp_discovery", icp_discovery_agent)
    builder.add_node("contact_intelligence", contact_intelligence_agent)
    builder.add_node("data_quality", data_quality_agent)
    builder.add_node("personalization", personalization_agent)
    builder.add_node("campaign_launch", campaign_launch_agent)
    builder.add_node("deliverability", deliverability_agent)
    builder.add_node("engagement_monitoring", engagement_monitoring_agent)
    builder.add_node("intent_detection", intent_detection_agent)
    builder.add_node("linkedin_engagement", linkedin_engagement_agent)
    builder.add_node("qualification", qualification_agent)
    builder.add_node("meeting_scheduler", meeting_scheduler_agent)
    builder.add_node("crm_intelligence", crm_intelligence_agent)
    
    # 3. Connect the workflow sequentially based on GTM phases
    # Phase 1: Discovery
    builder.add_edge(START, "icp_discovery")
    builder.add_edge("icp_discovery", "contact_intelligence")
    builder.add_edge("contact_intelligence", "data_quality")
    
    # Phase 2: Engagement
    builder.add_edge("data_quality", "personalization")
    builder.add_edge("personalization", "campaign_launch")
    builder.add_edge("campaign_launch", "deliverability")
    
    # Phase 3: Signal Analysis
    builder.add_edge("deliverability", "engagement_monitoring")
    builder.add_edge("engagement_monitoring", "intent_detection")
    
    # Phase 4: Qualification
    builder.add_edge("intent_detection", "linkedin_engagement")
    builder.add_edge("linkedin_engagement", "qualification")
    
    # Phase 5: Pipeline Creation
    builder.add_edge("qualification", "meeting_scheduler")
    builder.add_edge("meeting_scheduler", "crm_intelligence")
    builder.add_edge("crm_intelligence", END)
    
    # 4. Set up Human-in-the-loop (breakpoints)
    # We interrupt execution BEFORE:
    # - campaign_launch (to review personalized emails for high-value accounts)
    # - linkedin_engagement (to review personalized connection request messages)
    # - crm_intelligence (to review deal sizes and meeting details before CRM lock-in)
    memory = MemorySaver()
    
    compiled_graph = builder.compile(
        checkpointer=memory,
        interrupt_before=["campaign_launch", "linkedin_engagement", "crm_intelligence"]
    )
    
    return compiled_graph
