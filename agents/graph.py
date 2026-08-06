try:
    from langgraph.graph import StateGraph, START, END
    from langgraph.checkpoint.memory import MemorySaver
    HAS_LANGGRAPH = True
except ImportError:
    HAS_LANGGRAPH = False
    START = "__start__"
    END = "__end__"

    class MemorySaver:
        def __init__(self):
            self.states = {}

    class MockGraphInstance:
        def __init__(self, nodes, edges, interrupt_before):
            self.nodes = nodes
            self.edges = edges
            self.interrupt_before = interrupt_before
            self.node_list = [
                "icp_discovery", "contact_intelligence", "data_quality", "personalization",
                "campaign_launch", "deliverability", "engagement_monitoring", "intent_detection",
                "linkedin_engagement", "qualification", "meeting_scheduler", "crm_intelligence"
            ]
            self.state = {}
            self.current_step = 0
            self.paused_node = None

        def get_graph(self):
            class MockInnerGraph:
                def __init__(self, nodes):
                    self.nodes = set(nodes.keys()) | {"__start__", "__end__"}
            return MockInnerGraph(self.nodes)

        def invoke(self, state, config=None):
            if state is not None:
                self.state = dict(state)
                self.current_step = 0
                self.paused_node = None

            while self.current_step < len(self.node_list):
                node_name = self.node_list[self.current_step]
                if self.interrupt_before and node_name in self.interrupt_before and self.paused_node != node_name:
                    self.paused_node = node_name
                    break

                node_fn = self.nodes[node_name]
                out = node_fn(self.state)
                if isinstance(out, dict):
                    self.state.update(out)
                self.current_step += 1
                self.paused_node = None

        def get_state(self, config=None):
            class MockStateObj:
                def __init__(self, values, next_node):
                    self.values = values
                    self.next = (next_node,) if next_node else ()
            next_node = self.paused_node if self.paused_node else (self.node_list[self.current_step] if self.current_step < len(self.node_list) else None)
            return MockStateObj(self.state, next_node)

        def update_state(self, config, update_dict):
            if isinstance(update_dict, dict):
                self.state.update(update_dict)

    class StateGraph:
        def __init__(self, state_schema):
            self.state_schema = state_schema
            self.nodes = {}
            self.edges = []

        def add_node(self, name, func):
            self.nodes[name] = func

        def add_edge(self, src, dst):
            self.edges.append((src, dst))

        def compile(self, checkpointer=None, interrupt_before=None):
            return MockGraphInstance(self.nodes, self.edges, interrupt_before)

import os
import sqlite3

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
    # Use a durable SQLite checkpoint when the optional provider is installed.
    # MemorySaver remains a development fallback so the mock workflow can still
    # run before dependencies are installed.
    try:
        from langgraph.checkpoint.sqlite import SqliteSaver
        checkpoint_path = os.environ.get("PROTOTYPE_CHECKPOINT_PATH", ".prototype-data/langgraph.sqlite")
        os.makedirs(os.path.dirname(checkpoint_path) or ".", exist_ok=True)
        checkpoint_connection = sqlite3.connect(checkpoint_path, check_same_thread=False)
        memory = SqliteSaver(checkpoint_connection)
        if hasattr(memory, "setup"):
            memory.setup()
    except ImportError:
        memory = MemorySaver()
    
    compiled_graph = builder.compile(
        checkpointer=memory,
        interrupt_before=["campaign_launch", "linkedin_engagement", "crm_intelligence"]
    )
    
    return compiled_graph
