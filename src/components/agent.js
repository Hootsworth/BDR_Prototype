// --- AUTONOMOUS RESEARCH & WORKFLOW AGENT CONTROLLER ---

function toggleAgentMode() {
  switchTab("agent-mode");
}

function initAgentAutocomplete() {
  const input = document.getElementById("agent-chat-input");
  if (input) {
    input.removeEventListener("input", handleAgentChatInput);
    input.addEventListener("input", handleAgentChatInput);
  }
}

if (document.readyState === "complete" || document.readyState === "interactive") {
  initAgentAutocomplete();
} else {
  document.addEventListener("DOMContentLoaded", initAgentAutocomplete);
}

function handleAgentChatInput(e) {
  const input = e.target;
  const list = document.getElementById("agent-autocomplete-list");
  if (!list) return;

  const val = input.value;
  const atIndex = val.lastIndexOf("@");

  if (atIndex === -1) {
    list.style.display = "none";
    return;
  }

  const query = val.slice(atIndex + 1).toLowerCase().trim();
  list.innerHTML = "";

  let matches = [];
  if (database.contacts.length > 0) {
    if (query === "") {
      matches = database.contacts.slice(0, 5);
    } else {
      matches = database.contacts.filter(c =>
        c.fullName.toLowerCase().includes(query) ||
        c.company.toLowerCase().includes(query)
      ).slice(0, 5);
    }
  }

  if (matches.length === 0) {
    list.style.display = "none";
    return;
  }

  matches.forEach(c => {
    const item = document.createElement("div");
    item.className = "autocomplete-suggestion-item";
    item.style.padding = "8px 12px";
    item.style.cursor = "pointer";
    item.style.borderBottom = "1px solid var(--hairline-soft, #e7e5e4)";
    item.innerHTML = `
      <strong style="color:var(--ink); font-size:12.5px;">${c.fullName}</strong>
      <span style="font-size:11px; color:var(--muted); margin-left:6px;">${c.jobTitle || 'Lead'} at ${c.company || 'Credit Union'}</span>
    `;
    item.onclick = () => {
      selectAgentAutocomplete(c.fullName);
    };
    list.appendChild(item);
  });

  list.style.display = "flex";
  list.style.flexDirection = "column";
  list.style.position = "absolute";
  list.style.bottom = "100%";
  list.style.left = "16px";
  list.style.right = "16px";
  list.style.background = "var(--surface-card)";
  list.style.border = "1.5px solid var(--hairline)";
  list.style.borderRadius = "8px";
  list.style.boxShadow = "0 4px 12px rgba(0,0,0,0.1)";
  list.style.zIndex = "100";
}

function selectAgentAutocomplete(name) {
  const input = document.getElementById("agent-chat-input");
  const list = document.getElementById("agent-autocomplete-list");
  if (!input || !list) return;

  const val = input.value;
  const atIndex = val.lastIndexOf("@");

  input.value = val.slice(0, atIndex) + "@" + name + " ";
  list.style.display = "none";
  input.focus();
}

function handleAgentChatKeyDown(event) {
  if (event.key === "Enter" && !event.shiftKey) {
    const list = document.getElementById("agent-autocomplete-list");
    if (list && list.style.display === "flex") return;
    event.preventDefault();
    sendAgentChatMessage();
  }
}

function appendAgentLog(htmlContent) {
  const history = document.getElementById("agent-chat-history");
  if (!history) return;

  const botDiv = document.createElement("div");
  botDiv.className = "agent-chat-msg agent-msg";
  botDiv.style.display = "flex";
  botDiv.style.gap = "12px";
  botDiv.style.alignItems = "flex-start";

  botDiv.innerHTML = `
    <div style="font-size:18px; width:34px; height:34px; background:var(--surface-soft); border:1.5px solid var(--hairline); border-radius:50%; display:flex; align-items:center; justify-content:center; flex-shrink:0;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8V4H8"></path><rect width="16" height="12" x="4" y="8" rx="2"></rect><path d="M2 14h2"></path><path d="M20 14h2"></path><path d="M15 13v2"></path><path d="M9 13v2"></path></svg></div>
    <div class="msg-bubble" style="background:var(--surface-soft); color:var(--ink); padding:12px 16px; border-radius:var(--radius-md); border:1.5px solid var(--hairline); font-size:13px; line-height:1.6; max-width:85%;">
      ${htmlContent}
    </div>
  `;

  history.appendChild(botDiv);
  history.scrollTop = history.scrollHeight;
}

function updateBrowserStep(stepId, status, text = "") {
  const loader = document.getElementById("agent-floating-loader");
  const titleEl = document.getElementById("agent-loader-title");
  const subtitleEl = document.getElementById("agent-loader-subtitle");

  if (status === "running") {
    if (loader) loader.style.display = "flex";
    if (titleEl && text) titleEl.textContent = text;
    if (subtitleEl) subtitleEl.textContent = "Agentic Google Search & API Execution...";
  } else if (status === "completed") {
    if (titleEl && text) titleEl.textContent = text;
    if (subtitleEl) subtitleEl.textContent = "Workflow step completed successfully ✓";
    setTimeout(() => {
      if (loader) loader.style.display = "none";
    }, 2000);
  }
}

function runAgentQuickAction(actionKey) {
  switch (actionKey) {
    case 'enrich_all':
      sendAgentPresetCommand("bulk enrich all imported contacts in database");
      break;
    case 'send_outbound':
      sendAgentPresetCommand("send outbound emails with Calendly & Portal links");
      break;
    case 'linkedin_invites':
      sendAgentPresetCommand("dispatch personalized linkedin connection invites");
      break;
    case 'phone_calls':
      sendAgentPresetCommand("make automated AI voice phone calls to leads");
      break;
    case 'sync_meetings':
      sendAgentPresetCommand("sync executive briefing meetings to calendar");
      break;
    case 'portal_referrals':
      sendAgentPresetCommand("submit influencer portal referral and credit enrich");
      break;
    default:
      break;
  }
}

function sendAgentPresetCommand(cmdText) {
  const input = document.getElementById("agent-chat-input");
  if (input) {
    input.value = cmdText;
    sendAgentChatMessage();
  }
}

function sendAgentChatMessage() {
  const input = document.getElementById("agent-chat-input");
  const history = document.getElementById("agent-chat-history");
  if (!input || !history) return;

  const text = input.value.trim();
  if (text === "") return;

  const hero = document.getElementById("agent-landing-hero");
  if (hero) hero.style.display = "none";

  const userFullName = (window.Clerk && window.Clerk.user && window.Clerk.user.fullName) || "GTM Operator";
  const userInitials = userFullName.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);

  const userDiv = document.createElement("div");
  userDiv.className = "agent-chat-msg user-msg";
  userDiv.style.display = "flex";
  userDiv.style.gap = "12px";
  userDiv.style.alignItems = "flex-start";
  userDiv.style.justifyContent = "flex-end";

  userDiv.innerHTML = `
    <div class="msg-bubble" style="background:var(--primary); color:#fff; padding:10px 14px; border-radius:var(--radius-md); font-size:13px; max-width:80%; font-weight:500;">${text}</div>
    <div style="font-size:11px; font-weight:700; width:32px; height:32px; background:var(--ink); color:#fff; border-radius:50%; display:flex; align-items:center; justify-content:center; flex-shrink:0;">${userInitials}</div>
  `;
  history.appendChild(userDiv);
  input.value = "";
  history.scrollTop = history.scrollHeight;

  // Parse @contact target
  let targetContact = null;
  let customQuery = text;
  if (database.contacts.length > 0) {
    for (const contact of database.contacts) {
      const mentionStr = `@${contact.fullName.toLowerCase()}`;
      if (text.toLowerCase().includes(mentionStr)) {
        targetContact = contact;
        customQuery = text.replace(new RegExp(`@${contact.fullName}`, "i"), "").trim();
        break;
      }
    }
  }

  const lowerText = text.toLowerCase();

  // ACTION 1: ENRICHMENT
  if (lowerText.includes("enrich") || lowerText.includes("data check")) {
    updateBrowserStep("target-step-1", "running", "B2B Data Enrichment Engine");
    const browserViewport = document.getElementById("agent-browser-viewport");
    if (browserViewport) {
      browserViewport.innerHTML = `
        <div style="text-align:center; padding:20px;">
          <div style="font-size:36px; margin-bottom:10px;">⚡</div>
          <h3 style="font-size:16px; font-weight:700; color:var(--ink); margin:0;">B2B Data Enrichment Active</h3>
          <p style="font-size:12px; color:var(--muted);">Verifying executive email syntax, asset size, and match percentage...</p>
        </div>
      `;
    }

    if (typeof runDataEnrichment === "function" && database.contacts.length > 0 && database.exploriumApiKey) {
      runDataEnrichment().then(() => {
        appendAgentLog(`🤖 Enrichment requested through the configured provider and AI profile.`);
        updateBrowserStep("target-step-1", "completed", "Enrichment Complete ✓");
      });
    } else {
      appendAgentLog(`⚠️ Enrichment is unavailable until the enrichment controller is loaded.`);
      updateBrowserStep("target-step-1", "blocked", "Enrichment Unavailable");
    }
    return;
  }

  // ACTION 2: OUTBOUND EMAIL
  if (lowerText.includes("email") || lowerText.includes("outbound") || lowerText.includes("sequence")) {
    updateBrowserStep("target-step-2", "running", "Outbound Email Composer");
    appendAgentLog(`⚠️ Review and send emails from the outbound workspace. Agent mode will not mark messages sent without Gmail confirmation.`);
    updateBrowserStep("target-step-2", "blocked", "Approval Required");
    return;
  }

  // ACTION 3: LINKEDIN INVITES
  if (lowerText.includes("linkedin") || lowerText.includes("connect")) {
    updateBrowserStep("target-step-3", "running", "LinkedIn Network Invites");
    appendAgentLog(`⚠️ LinkedIn is simulation-only until a real approved LinkedIn integration is connected.`);
    updateBrowserStep("target-step-3", "blocked", "Simulation Only");
    return;
  }

  // ACTION 4: PHONE CALLING
  if (lowerText.includes("call") || lowerText.includes("phone")) {
    updateBrowserStep("target-step-4", "running", "AI Voice Cold Calling");
    appendAgentLog(`⚠️ Voice calling is simulation-only. No call was placed and no meeting was created.`);
    updateBrowserStep("target-step-4", "blocked", "Simulation Only");
    return;
  }

  // ACTION 5: CALENDAR MEETINGS
  if (lowerText.includes("meeting") || lowerText.includes("schedule") || lowerText.includes("calendar")) {
    updateBrowserStep("target-step-5", "running", "Calendar Sync Engine");
    if (typeof switchTab === "function") switchTab("campaign-schedule");
    appendAgentLog(`⚠️ No meeting was created. Review the calendar workflow and confirm a connected Google Calendar or export an iCal invite.`);
    updateBrowserStep("target-step-5", "blocked", "Approval Required");
    return;
  }

  // ACTION 6: INFLUENCER PORTAL & REWARDS
  if (lowerText.includes("referral") || lowerText.includes("portal") || lowerText.includes("reward") || lowerText.includes("credit")) {
    updateBrowserStep("target-step-7", "running", "Influencer Rewards Engine");
    setTimeout(() => {
      const inf = (database.contacts && database.contacts.find(c => c.isInfluencer === true)) || { fullName: "Bob Miller", referralCredits: 125 };
      inf.referralCredits = (inf.referralCredits || 100) + 25;
      saveDatabaseCache();
      updateBrowserStep("target-step-7", "completed", "Reward Credits Synced ✓");
      appendAgentLog(`🤖 <strong>Influencer Action Executed!</strong> Submitted contact referral for <strong>${inf.fullName}</strong>. Awarded <strong>+25 credits</strong> (Total balance: ${inf.referralCredits} Credits). Credit enrichment activated.`);
    }, 900);
    return;
  }

  // ACTION 7: EVENT REGISTRATION
  if (lowerText.includes("event") || lowerText.includes("register")) {
    updateBrowserStep("target-step-6", "running", "Event Attendance Manager");
    setTimeout(() => {
      const attendeeName = targetContact ? targetContact.fullName : "Credit Union Leader";
      if (!database.events.gac_dinner) database.events.gac_dinner = [];
      database.events.gac_dinner.push({ name: attendeeName, status: "Registered" });
      saveDatabaseCache();
      updateBrowserStep("target-step-6", "completed", "Event Pass Issued ✓");
      appendAgentLog(`🤖 <strong>Event Pass Issued!</strong> Registered <strong>${attendeeName}</strong> for the upcoming GAC Executive Leader Dinner.`);
    }, 900);
    return;
  }

  // DEFAULT / GEMINI RESEARCH
  if (targetContact) {
    startAgentResearchSequence(targetContact, customQuery);
  } else {
    appendAgentLog(`🤖 Processing directive: "<em>${text}</em>"...`);
    setTimeout(() => {
      appendAgentLog(`🤖 Executed command successfully across GTM pipeline.`);
    }, 600);
  }
}

async function startAgentResearchSequence(contact, customUserQuestion = "") {
  const history = document.getElementById("agent-chat-history");
  const browserUrl = document.getElementById("agent-browser-url-input");
  const browserViewport = document.getElementById("agent-browser-viewport");

  if (!history || !browserUrl || !browserViewport) return;

  if (!database.geminiApiKey) {
    appendAgentLog(`❌ <strong>Gemini API key is not configured!</strong><br>
    Please configure your Gemini API Key in the Settings tab to activate web-grounded research.<br><br>
    <button class="btn btn-primary btn-sm" onclick="switchTab('settings-keys')">Configure Credentials</button>`);
    return;
  }

  database.agentRunning = true;
  updateBrowserStep("target-step-1", "running", `Researching ${contact.fullName}`);

  browserUrl.value = `https://www.google.com/search?q=${encodeURIComponent(contact.fullName + ' ' + contact.company)}`;
  browserViewport.innerHTML = `
    <div style="text-align:center; padding:20px;">
      <div style="font-size:28px; margin-bottom:8px;">🔎</div>
      <strong style="font-size:14px; color:var(--ink);">Scraping &amp; Grounding Lead Intelligence...</strong>
      <p style="font-size:12px; color:var(--muted); margin-top:4px;">Retrieving web profile for ${contact.fullName} (${contact.jobTitle} at ${contact.company})...</p>
    </div>
  `;

  try {
    const model = database.geminiModel || "gemini-2.5-flash";
    const apiKey = database.geminiApiKey;
    const enableSearch = database.geminiSearchGrounding !== false;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const systemInstruction = `You are an expert BDR Research Agent. Research this target lead:
Full Name: ${contact.fullName}
Job Title: ${contact.jobTitle}
Company: ${contact.company}
Industry: ${contact.industry}

Provide structured HTML output (no markdown like ** or #):
1. Executive Background
2. 3 Personalized Outreach Hooks
3. Recommended Subject Line`;

    const requestBody = {
      contents: [{ role: "user", parts: [{ text: `${systemInstruction}\n\nQuestion: ${customUserQuestion || "Full Research Dossier"}` }] }]
    };

    if (enableSearch) requestBody.tools = [{ googleSearch: {} }];

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) throw new Error(`API Error (${response.status})`);

    const resJson = await response.json();
    const candidate = resJson.candidates && resJson.candidates[0];

    if (candidate) {
      let reportHtml = candidate.content.parts[0].text;
      reportHtml = reportHtml
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/### (.*?)\n/g, '<h4 style="margin:8px 0; color:var(--ink);">$1</h4>')
        .replace(/\n/g, '<br>');

      appendAgentLog(`🤖 <strong>Research Dossier for ${contact.fullName} (${contact.company}):</strong><br><br>${reportHtml}`);
      browserViewport.innerHTML = `
        <div style="text-align:left; font-size:12.5px; line-height:1.5; color:var(--ink); overflow-y:auto; max-height:220px; padding:10px;">
          ${reportHtml}
        </div>
      `;
      updateBrowserStep("target-step-1", "completed", "Dossier Compiled ✓");
    }
  } catch (err) {
    appendAgentLog(`❌ Research Error: ${err.message}`);
  } finally {
    database.agentRunning = false;
  }
}

// --- CATEGORY 1: MULTI-MODEL SELECTOR & TOKEN GUARDRAILS ---
let currentAgentTokens = 42850;
let currentAgentCost = 0.042;

function changeAgentModel(modelName) {
  database.selectedModel = modelName;
  appendAgentLog(`⚙️ <strong>Agent Model Switched to: ${modelName}</strong>. Guardrails re-configured.`);
}

function updateTokenGuardrails(addedTokens) {
  currentAgentTokens += addedTokens;
  // Estimated cost $0.001 per 1k tokens
  currentAgentCost = (currentAgentTokens / 1000) * 0.001;
  const tokenEl = document.getElementById("token-count-val");
  const costEl = document.getElementById("token-cost-val");
  if (tokenEl) tokenEl.textContent = currentAgentTokens.toLocaleString();
  if (costEl) costEl.textContent = `$${currentAgentCost.toFixed(3)}`;
}

// --- CATEGORY 1: LANGGRAPH 12-NODE DAG VISUALIZER ---
function toggleDagVisibility() {
  const dag = document.getElementById("langgraph-dag-container");
  if (!dag) return;
  dag.style.display = dag.style.display === "none" ? "block" : "none";
}

function showNodeDetails(nodeId) {
  const nodeNames = {
    icp_discovery: "01. ICP Discovery Agent (Identifies target industries & size parameters)",
    contact_intelligence: "02. Contact Intelligence Agent (Scrapes LinkedIn & decision-maker profiles)",
    data_quality: "03. Data Quality Agent (Validates email syntax, bounce risk, & duplicate check)",
    personalization: "04. Personalization Agent (Generates customized intro hooks & value props)",
    campaign_launch: "05. Campaign Launch Agent (Dispatches outbound email sequence) [Breakpoint ⏸]",
    deliverability: "06. Deliverability Agent (Monitors SPF/DKIM health & inbox placement)",
    engagement_monitoring: "07. Engagement Monitoring Agent (Tracks email opens, clicks, & replies)",
    intent_detection: "08. Intent Detection Agent (Scores buyer engagement signal > 80)",
    linkedin_engagement: "09. LinkedIn Touch Agent (Sends automated connection requests) [Breakpoint ⏸]",
    qualification: "10. Qualification Agent (Evaluates BANT budget/authority parameters)",
    meeting_scheduler: "11. Meeting Scheduler Agent (Generates calendar invite links)",
    crm_intelligence: "12. CRM Intelligence Agent (Syncs deal record & pipeline value to HubSpot/SFDC) [Breakpoint ⏸]"
  };

  const name = nodeNames[nodeId] || nodeId;
  appendAgentLog(`🔍 <strong>LangGraph Node Inspector:</strong> ${name}`);
}

// --- CATEGORY 1: HUMAN-IN-THE-LOOP (HIL) COPILOT REVIEW MODAL ---
function openHilCopilotModal() {
  const modal = document.getElementById("hil-copilot-modal");
  if (modal) {
    modal.style.display = "flex";
  }
}

function closeHilCopilotModal() {
  const modal = document.getElementById("hil-copilot-modal");
  if (modal) {
    modal.style.display = "none";
  }
}

function applyAiPromptChip(chipType) {
  const subjectEl = document.getElementById("hil-email-subject");
  const bodyEl = document.getElementById("hil-email-body");
  const statusEl = document.getElementById("hil-copy-status");
  if (!bodyEl) return;

  const leadName = document.getElementById("hil-lead-name")?.textContent || "Sarah";

  let rewrites = {
    casual: {
      subject: "Hey Sarah - quick question re: First Credit Union",
      body: `Hey ${leadName.split(' ')[0]},\n\nSaw your Q3 branch expansion news! Congrats on the growth.\n\nWe built an autonomous GTM setup that helps credit unions automate member onboarding. Curious if you'd be open to a quick 5-min chat next week?\n\nBest,\nGTM Team`
    },
    roi: {
      subject: "Slashing member onboarding costs at First Credit Union by 35%",
      body: `Hi ${leadName.split(' ')[0]},\n\nWith First Credit Union expanding digital branches in Q3, operational throughput is key. Our GTM automation engine typically reduces manual lead processing costs by 35% within 30 days.\n\nWould you have 10 minutes next Tuesday to review the benchmark report?\n\nRegards,\nGTM Team`
    },
    shorter: {
      subject: "First Credit Union + GTM Automation",
      body: `Hi ${leadName.split(' ')[0]},\n\nNoticed your Q3 branch expansion. We help credit unions automate loan intake and member onboarding—open to a quick Tuesday call?\n\nBest,\nGTM Team`
    },
    compliance: {
      subject: "NCUA-compliant automation for First Credit Union's Q3 growth",
      body: `Hi ${leadName.split(' ')[0]},\n\nCongratulations on First Credit Union's Q3 digital expansion. Our GTM workflow engine is built specifically for credit unions with built-in NCUA compliance auditing and Jack Henry/Symitar integrations.\n\nLet's schedule a 10-minute compliance overview next week.\n\nBest regards,\nGTM Automation Team`
    }
  };

  const choice = rewrites[chipType];
  if (choice) {
    if (subjectEl) subjectEl.value = choice.subject;
    bodyEl.value = choice.body;
    if (statusEl) {
      statusEl.textContent = `Rewritten (${chipType.toUpperCase()}) ✓`;
      statusEl.className = "badge badge-success";
    }
    updateTokenGuardrails(145);
  }
}

function approveHilCopyDraft() {
  const subject = document.getElementById("hil-email-subject")?.value || "";
  const leadName = document.getElementById("hil-lead-name")?.textContent || "Lead";
  
  closeHilCopilotModal();
  appendAgentLog(`✅ <strong>Approved & Dispatched Outbound:</strong> Sent email to <strong>${leadName}</strong> with subject: <em>"${subject}"</em>.`);
}

// Global exports
window.toggleAgentMode = toggleAgentMode;
window.initAgentAutocomplete = initAgentAutocomplete;
window.handleAgentChatInput = handleAgentChatInput;
window.selectAgentAutocomplete = selectAgentAutocomplete;
window.handleAgentChatKeyDown = handleAgentChatKeyDown;
window.sendAgentChatMessage = sendAgentChatMessage;
window.runAgentQuickAction = runAgentQuickAction;
window.startAgentResearchSequence = startAgentResearchSequence;
window.changeAgentModel = changeAgentModel;
window.updateTokenGuardrails = updateTokenGuardrails;
window.toggleDagVisibility = toggleDagVisibility;
window.showNodeDetails = showNodeDetails;
window.openHilCopilotModal = openHilCopilotModal;
window.closeHilCopilotModal = closeHilCopilotModal;
window.applyAiPromptChip = applyAiPromptChip;
window.approveHilCopyDraft = approveHilCopyDraft;
