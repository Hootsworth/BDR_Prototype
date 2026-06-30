from tools.apollo_mock import ApolloMock
from tools.clay_mock import ClayMock
from tools.zerobounce_mock import ZeroBounceMock
from tools.inboxkit_mock import InboxKitMock
from tools.lemlist_mock import LemlistMock
from tools.hubspot_mock import HubSpotMock
from tools.linkedin_mock import LinkedInMock

# Shared singletons for consistency across agent nodes
apollo = ApolloMock()
clay = ClayMock()
zerobounce = ZeroBounceMock()
inboxkit = InboxKitMock()
lemlist = LemlistMock()
hubspot = HubSpotMock()
linkedin = LinkedInMock()
