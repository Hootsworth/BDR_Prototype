from typing import TypedDict, List, Dict, Any, Annotated
import operator

class BDRState(TypedDict):
    # Inputs / Settings
    icp_definition: Dict[str, Any]
    
    # Discovery phase data
    accounts: List[Dict[str, Any]]
    contacts: List[Dict[str, Any]]
    
    # Active Sequences & Communications
    sequences: Dict[str, Any]
    email_outbox: List[Dict[str, Any]]
    linkedin_actions: List[Dict[str, Any]]
    
    # Qualification & Intent tracking
    intent_scores: Dict[str, int]
    qualification_status: Dict[str, Dict[str, Any]]
    
    # HubSpot mirror
    crm_records: Dict[str, Any]
    
    # Human in the Loop approvals
    # Format: {"id": str, "type": "email"|"linkedin"|"deal", "contact": dict, "content": str, "status": "pending"|"approved"|"rejected"}
    human_approval_queue: List[Dict[str, Any]]
    
    # Metrics accumulator
    # We use Annotated + operator.add to allow updates to merge or append logs/metrics if needed,
    # but simple dict reassignment works fine if we update values programmatically in nodes.
    metrics: Dict[str, Any]
    
    # Activity logging
    # List of logs representing steps
    logs: Annotated[List[str], operator.add]
    
    # Executing Agent tracking
    current_agent: str
