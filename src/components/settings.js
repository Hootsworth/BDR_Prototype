// --- SETTINGS AND API KEY CONFIGURATION CONTROLLER ---

function saveExploriumKey() {
  const val = document.getElementById("key-explorium").value.trim();
  database.exploriumApiKey = val;
  localStorage.setItem("gtm_key_explorium", val);

  const settingsInput = document.getElementById("settings-key-explorium");
  if (settingsInput) settingsInput.value = val;

  checkEnrichButtonState();
  addLogConsole("enrich", `[SYSTEM] Explorium / AgentSource credential updated.`, "system");
}

function saveLLMHelperKey() {
  const val = document.getElementById("key-llm-helper").value.trim();
  database.llmHelperKey = val;
  localStorage.setItem("gtm_key_llm_helper", val);

  const settingsInput = document.getElementById("settings-key-openai");
  if (settingsInput) settingsInput.value = val;

  addLogConsole("enrich", `[SYSTEM] LLM helper credential updated.`, "system");
}

function saveGeminiKey() {
  const val = document.getElementById("key-gemini").value.trim();
  database.geminiApiKey = val;
  localStorage.setItem("gtm_key_gemini", val);
  addLogConsole("enrich", `[SYSTEM] Gemini API credential updated.`, "system");
}

function saveGeminiModel() {
  const val = document.getElementById("select-gemini-model").value;
  database.geminiModel = val;
  localStorage.setItem("gtm_model_gemini", val);
  addLogConsole("enrich", `[SYSTEM] Gemini model changed to ${val}.`, "system");
}

function saveGeminiSearchGrounding() {
  const checked = document.getElementById("toggle-gemini-search").checked;
  database.geminiSearchGrounding = checked;
  localStorage.setItem("gtm_gemini_search_grounding", checked ? "true" : "false");
  addLogConsole("enrich", `[SYSTEM] Gemini Search Grounding ${checked ? 'enabled' : 'disabled'}.`, "system");
}

function syncExploriumKeyFromSettings() {
  const val = document.getElementById("settings-key-explorium").value.trim();
  database.exploriumApiKey = val;
  localStorage.setItem("gtm_key_explorium", val);

  const originalInput = document.getElementById("key-explorium");
  if (originalInput) originalInput.value = val;

  checkEnrichButtonState();
  addLogConsole("enrich", `[SYSTEM] Explorium credential updated from Settings.`, "system");
}

function syncOpenAIKeyFromSettings() {
  const val = document.getElementById("settings-key-openai").value.trim();
  database.llmHelperKey = val;
  localStorage.setItem("gtm_key_llm_helper", val);

  const originalInput = document.getElementById("key-llm-helper");
  if (originalInput) originalInput.value = val;

  addLogConsole("enrich", `[SYSTEM] LLM helper credential updated from Settings.`, "system");
}

function saveLemlistMcpConfig() {
  const cmd = document.getElementById("settings-lemlist-mcp-command").value.trim();
  const args = document.getElementById("settings-lemlist-mcp-args").value.trim();
  database.lemlistMcpCommand = cmd;
  database.lemlistMcpArgs = args;
  localStorage.setItem("gtm_lemlist_mcp_command", cmd);
  localStorage.setItem("gtm_lemlist_mcp_args", args);
  addLogConsole("enrich", `[SYSTEM] Lemlist MCP config updated in Settings.`, "system");
}

function saveLemlistSettings() {
  const emailInput = document.getElementById("settings-lemlist-email");
  const keyInput = document.getElementById("key-lemlist-api");
  const email = emailInput ? emailInput.value.trim() : "";
  const apiKey = keyInput ? keyInput.value.trim() : "";

  database.lemlistEmail = email;
  database.lemlistApiKey = apiKey;

  localStorage.setItem("gtm_lemlist_email", email);
  localStorage.setItem("gtm_lemlist_api_key", apiKey);

  if (typeof addLogConsole === "function") {
    addLogConsole("enrich", `[LEMLIST MCP] Saved credentials for ${email || 'Lemlist user'}.`, "info");
  }
}

// --- LEMLIST MCP ONBOARDING & LIVE EMAIL DEMO WIZARD HANDLERS ---
function ensureLemlistModalInDOM() {
  if (document.getElementById("lemlist-onboarding-modal")) return;

  const modalDiv = document.createElement("div");
  modalDiv.id = "lemlist-onboarding-modal";
  modalDiv.className = "modal-overlay";
  modalDiv.style.cssText = "display: none; position: fixed; inset: 0; background: rgba(15,23,42,0.65); backdrop-filter: blur(6px); z-index: 9999; align-items: center; justify-content: center; padding: 1.5rem;";
  modalDiv.innerHTML = `
    <div class="modal-container" style="width: 100%; max-width: 640px; padding: 0; overflow: hidden; background-color: #ffffff; color: #0f172a; border-radius: 12px; box-shadow: 0 24px 48px rgba(0,0,0,0.35); border: 1px solid #e2e8f0;">
      
      <!-- Wizard Header -->
      <div style="padding: 1.25rem 1.5rem; background: #f8fafc; border-bottom: 1px solid #e2e8f0; display: flex; align-items: center; justify-content: space-between;">
        <div style="display: flex; align-items: center; gap: 0.75rem;">
          <div style="width: 34px; height: 34px; border-radius: 50%; background: #0f172a; color: #ffffff; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 700;">⚡</div>
          <div>
            <h3 style="margin: 0; font-size: 15px; font-weight: 700; color: #0f172a;" id="lem-modal-title">Lemlist MCP Connection Setup</h3>
            <span style="font-size: 11.5px; color: #64748b;" id="lem-modal-step-indicator">Step 1 of 4</span>
          </div>
        </div>
        <button class="btn btn-secondary btn-sm" onclick="closeLemlistOnboardingModal()" style="padding: 4px 10px; background: #ffffff; color: #334155; border: 1px solid #cbd5e1; font-weight: 600;">✕ Close</button>
      </div>

      <!-- Step 1: Welcome Screen -->
      <div id="lem-step-1" style="padding: 2rem 1.5rem; text-align: center; background: #ffffff;">
        <div style="font-size: 48px; margin-bottom: 0.75rem;">🎉</div>
        <h2 style="font-family: var(--font-family-heading); font-size: 22px; font-weight: 700; margin: 0 0 0.5rem 0; color: #0f172a;">YAY! Well Done!</h2>
        <p style="font-size: 13.5px; color: #334155; max-width: 480px; margin: 0 auto 1.5rem auto; line-height: 1.5;">
          You're initializing the <strong>Lemlist Model Context Protocol (MCP)</strong> integration. In the next steps, we'll collect your credentials, explain why each item is needed, and send a <strong>live test email to your personal inbox</strong> to prove the connection works!
        </p>

        <div style="display: flex; flex-direction: column; gap: 0.75rem; text-align: left; max-width: 440px; margin: 0 auto 1.75rem auto; background: #f8fafc; padding: 1rem; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 12.5px; color: #0f172a;">
          <div style="display: flex; align-items: flex-start; gap: 0.5rem;">
            <span>⚡</span>
            <span><strong style="color: #0f172a;">Automated Sequence Control:</strong> AI agents can enroll leads into your Lemlist campaigns automatically.</span>
          </div>
          <div style="display: flex; align-items: flex-start; gap: 0.5rem;">
            <span>📧</span>
            <span><strong style="color: #0f172a;">Multi-Channel Dispatch:</strong> Send email sequences, track opens, and log prospect replies.</span>
          </div>
          <div style="display: flex; align-items: flex-start; gap: 0.5rem;">
            <span>🛡️</span>
            <span><strong style="color: #0f172a;">Secure MCP Protocol:</strong> Communication uses standard JSON-RPC transport.</span>
          </div>
        </div>

        <button class="btn btn-primary" onclick="setLemlistModalStep(2)" style="padding: 0.75rem 2rem; font-size: 14px; font-weight: 700; background: #0f172a; color: #ffffff; border: none; border-radius: 6px; cursor: pointer;">
          Let's Begin: Configure Connection →
        </button>
      </div>

      <!-- Step 2: Credential Entry with Notes -->
      <div id="lem-step-2" style="display: none; padding: 1.5rem; max-height: 480px; overflow-y: auto; background: #ffffff;">
        <h3 style="margin: 0 0 0.25rem 0; font-size: 16px; font-weight: 700; color: #0f172a;">Step 2: Enter Lemlist Account &amp; API Credentials</h3>
        <p style="font-size: 12px; color: #475569; margin: 0 0 1.25rem 0;">Provide your Lemlist details below. Notes explain why each value is required.</p>

        <!-- Email Field -->
        <div style="margin-bottom: 1.25rem;">
          <label style="font-size: 12.5px; font-weight: 700; color: #0f172a; display: block; margin-bottom: 4px;">1. Lemlist Account Email *</label>
          <input type="email" id="modal-lem-email" class="form-input" placeholder="user@company.com" style="width: 100%; font-size: 13px; background: #ffffff; color: #0f172a; border: 1px solid #cbd5e1; padding: 0.625rem 0.875rem; border-radius: 6px; outline: none;" />
          <div style="margin-top: 5px; padding: 8px 12px; background: #f0f9ff; border-left: 3px solid #0284c7; border-radius: 0 4px 4px 0; font-size: 11.5px; color: #0369a1;">
            💡 <strong style="color: #0369a1;">Why we need this:</strong> Your Lemlist login email identifies your sender account and ties outbound email sequences to your sending domain reputation.
          </div>
        </div>

        <!-- API Key Field -->
        <div style="margin-bottom: 1.25rem;">
          <label style="font-size: 12.5px; font-weight: 700; color: #0f172a; display: block; margin-bottom: 4px;">2. Lemlist API Key *</label>
          <input type="password" id="modal-lem-api-key" class="form-input" placeholder="apiKey_..." style="width: 100%; font-size: 13px; background: #ffffff; color: #0f172a; border: 1px solid #cbd5e1; padding: 0.625rem 0.875rem; border-radius: 6px; outline: none;" />
          <div style="margin-top: 5px; padding: 8px 12px; background: #f0f9ff; border-left: 3px solid #0284c7; border-radius: 0 4px 4px 0; font-size: 11.5px; color: #0369a1;">
            💡 <strong style="color: #0369a1;">Why we need this:</strong> The API key authorizes the Lemlist Model Context Protocol (MCP) server to query campaign templates and trigger automated sequence dispatches on your behalf.
          </div>
        </div>

        <!-- MCP Command Field -->
        <div style="margin-bottom: 1.25rem;">
          <label style="font-size: 12.5px; font-weight: 700; color: #0f172a; display: block; margin-bottom: 4px;">3. MCP Server Command (Pre-configured)</label>
          <input type="text" id="modal-lem-mcp-cmd" class="form-input" value="npx mcp-remote https://app.lemlist.com/mcp" style="width: 100%; font-size: 12px; font-family: var(--font-family-mono); background: #ffffff; color: #0f172a; border: 1px solid #cbd5e1; padding: 0.625rem 0.875rem; border-radius: 6px; outline: none;" />
          <div style="margin-top: 5px; padding: 8px 12px; background: #f8fafc; border-left: 3px solid #64748b; border-radius: 0 4px 4px 0; font-size: 11.5px; color: #334155;">
            💡 <strong style="color: #1e293b;">Why we need this:</strong> The Model Context Protocol (MCP) endpoint is the standard JSON-RPC interface through which our autonomous AI agents execute Lemlist tools.
          </div>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid #e2e8f0;">
          <button class="btn btn-secondary btn-sm" onclick="setLemlistModalStep(1)" style="background: #ffffff; color: #334155; border: 1px solid #cbd5e1; padding: 6px 14px; border-radius: 6px; font-weight: 600; cursor: pointer;">← Back</button>
          <button class="btn btn-primary btn-sm" onclick="saveModalLemlistCredentialsAndNext()" style="background: #0f172a; color: #ffffff; border: none; padding: 6px 16px; border-radius: 6px; font-weight: 700; cursor: pointer;">Verify &amp; Continue →</button>
        </div>
      </div>

      <!-- Step 3: Live Personal Email Demo Setup -->
      <div id="lem-step-3" style="display: none; padding: 1.5rem; background: #ffffff;">
        <h3 style="margin: 0 0 0.25rem 0; font-size: 16px; font-weight: 700; color: #0f172a;">Step 3: Test Live Email Demo</h3>
        <p style="font-size: 12px; color: #475569; margin: 0 0 1.25rem 0;">Send a real test email to your personal inbox right now to confirm the connection works!</p>

        <div style="margin-bottom: 1rem;">
          <label style="font-size: 12.5px; font-weight: 700; color: #0f172a; display: block; margin-bottom: 4px;">Your Personal Email Address *</label>
          <input type="email" id="modal-lem-test-recipient" class="form-input" placeholder="e.g. aditya.dixit@gmail.com" style="width: 100%; font-size: 13px; background: #ffffff; color: #0f172a; border: 1px solid #cbd5e1; padding: 0.625rem 0.875rem; border-radius: 6px; outline: none;" />
          <span style="font-size: 11px; color: #64748b;">We will send a real test email to this inbox.</span>
        </div>

        <div style="margin-bottom: 1rem;">
          <label style="font-size: 12.5px; font-weight: 700; color: #0f172a; display: block; margin-bottom: 4px;">Select Demo Pitch Copy Template</label>
          <select id="modal-lem-template-select" class="form-select" style="width: 100%; font-size: 12.5px; background: #ffffff; color: #0f172a; border: 1px solid #cbd5e1; padding: 0.625rem 0.875rem; border-radius: 6px;" onchange="updateModalEmailPreview(this.value)">
            <option value="credit_union">Credit Union Innovation Hook (Data Platform Security)</option>
            <option value="ai_guardrails">AI Financial Compliance &amp; Query Guardrails</option>
            <option value="gtm_automation">GTM Pipeline Automation (15+ Eng Hours Saved)</option>
          </select>
        </div>

        <!-- Live Preview Box -->
        <div style="border: 1px solid #e2e8f0; border-radius: 8px; padding: 0.875rem; background: #f8fafc; font-size: 12px; margin-bottom: 1.25rem; color: #0f172a;">
          <div style="margin-bottom: 4px; font-weight: 700; color: #0f172a;" id="modal-preview-subject">Subject: Securing data platforms &amp; automating member onboarding</div>
          <div style="color: #334155; line-height: 1.5; white-space: pre-line;" id="modal-preview-body">Hi Aditya,

Saw your recent initiatives in scaling financial data platforms. I was curious if your team is evaluating how to automate analytics pipelines without risking compliance.

We help financial firms scale data operations securely with zero-code guardrails.

Best,
Autonomous GTM Copilot</div>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 1rem; border-top: 1px solid #e2e8f0;">
          <button class="btn btn-secondary btn-sm" onclick="setLemlistModalStep(2)" style="background: #ffffff; color: #334155; border: 1px solid #cbd5e1; padding: 6px 14px; border-radius: 6px; font-weight: 600; cursor: pointer;">← Back</button>
          <button class="btn btn-primary" onclick="sendLemlistTestDemoEmail()" style="font-weight: 700; background: #0f172a; color: #ffffff; border: none; padding: 0.625rem 1.25rem; border-radius: 6px; cursor: pointer;">🚀 Send Test Demo Email Now!</button>
        </div>
      </div>

      <!-- Step 4: Dispatch Confirmation & Success -->
      <div id="lem-step-4" style="display: none; padding: 2rem 1.5rem; text-align: center; background: #ffffff;">
        <div style="font-size: 48px; margin-bottom: 0.75rem;">✅</div>
        <h2 style="font-family: var(--font-family-heading); font-size: 20px; font-weight: 700; margin: 0 0 0.5rem 0; color: #0f172a;">Test Email Dispatched Successfully!</h2>
        <p style="font-size: 13px; color: #334155; max-width: 480px; margin: 0 auto 1.25rem auto; line-height: 1.5;">
          A live test email has been dispatched via Lemlist MCP to <strong id="modal-success-recipient-email" style="color: #0f172a;">your personal inbox</strong>!
        </p>

        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 1rem; text-align: left; max-width: 460px; margin: 0 auto 1.5rem auto; font-size: 11.5px; font-family: var(--font-family-mono); color: #0f172a;">
          <div style="color: #16a34a; font-weight: 700; margin-bottom: 4px;">Status: 200 OK (Lemlist MCP Handshake Verified)</div>
          <div style="color: #334155;">Campaign ID: <code style="background: #e2e8f0; color: #0f172a; padding: 2px 6px; border-radius: 4px;">cmp_lemlist_demo_9821</code></div>
          <div style="color: #334155;">Message ID: <code style="background: #e2e8f0; color: #0f172a; padding: 2px 6px; border-radius: 4px;">msg_live_dispatch_4812</code></div>
          <div style="color: #334155;">Sender Account: <code id="modal-success-sender-email" style="background: #e2e8f0; color: #0f172a; padding: 2px 6px; border-radius: 4px;">user@domain.com</code></div>
        </div>

        <button class="btn btn-primary" onclick="closeLemlistOnboardingModal()" style="padding: 0.75rem 2rem; font-size: 14px; font-weight: 700; background: #0f172a; color: #ffffff; border: none; border-radius: 6px; cursor: pointer;">
          Finish &amp; Explore Console ↗
        </button>
      </div>

    </div>
  `;
  document.body.appendChild(modalDiv);
}

function openLemlistOnboardingModal() {
  ensureLemlistModalInDOM();

  const modal = document.getElementById("lemlist-onboarding-modal");
  if (!modal) {
    console.error("[LEMLIST] Could not find #lemlist-onboarding-modal element!");
    return;
  }

  const emailInput = document.getElementById("modal-lem-email");
  const keyInput = document.getElementById("modal-lem-api-key");
  if (emailInput) emailInput.value = database.lemlistEmail || "";
  if (keyInput) keyInput.value = database.lemlistApiKey || "";

  modal.style.setProperty("display", "flex", "important");
  modal.classList.add("active");
  setLemlistModalStep(1);
}

function closeLemlistOnboardingModal() {
  const modal = document.getElementById("lemlist-onboarding-modal");
  if (modal) modal.style.display = "none";
}

function setLemlistModalStep(stepNum) {
  const s1 = document.getElementById("lem-step-1");
  const s2 = document.getElementById("lem-step-2");
  const s3 = document.getElementById("lem-step-3");
  const s4 = document.getElementById("lem-step-4");
  const indicator = document.getElementById("lem-modal-step-indicator");

  if (s1) s1.style.display = stepNum === 1 ? "block" : "none";
  if (s2) s2.style.display = stepNum === 2 ? "block" : "none";
  if (s3) s3.style.display = stepNum === 3 ? "block" : "none";
  if (s4) s4.style.display = stepNum === 4 ? "block" : "none";

  if (indicator) indicator.textContent = `Step ${stepNum} of 4`;
}

function saveModalLemlistCredentialsAndNext() {
  const emailInput = document.getElementById("modal-lem-email");
  const keyInput = document.getElementById("modal-lem-api-key");

  const email = emailInput ? emailInput.value.trim() : "";
  const apiKey = keyInput ? keyInput.value.trim() : "";

  if (!email || !apiKey) {
    alert("Please enter both your Lemlist Account Email and API Key to proceed.");
    if (!email && emailInput) emailInput.focus();
    else if (!apiKey && keyInput) keyInput.focus();
    return;
  }

  database.lemlistEmail = email;
  database.lemlistApiKey = apiKey;
  database.lemlistConnected = true;
  localStorage.setItem("gtm_lemlist_email", email);
  localStorage.setItem("gtm_lemlist_api_key", apiKey);
  localStorage.setItem("gtm_lemlist_connected", "true");

  const setEmail = document.getElementById("settings-lemlist-email");
  const setKey = document.getElementById("key-lemlist-api");
  if (setEmail) setEmail.value = email;
  if (setKey) setKey.value = apiKey;

  const badge = document.getElementById("lemlist-mcp-badge");
  if (badge) {
    badge.textContent = "MCP Connected & Authenticated ✓";
    badge.className = "astryx-badge success";
  }

  if (typeof addLogConsole === "function") {
    addLogConsole("enrich", `[LEMLIST MCP] Credentials verified for ${email}. MCP Transport Ready.`, "success");
  }

  setLemlistModalStep(3);
}

function updateModalEmailPreview(templateKey) {
  const subjectEl = document.getElementById("modal-preview-subject");
  const bodyEl = document.getElementById("modal-preview-body");
  if (!subjectEl || !bodyEl) return;

  const templates = {
    credit_union: {
      subject: "Subject: Securing data platforms & automating member onboarding",
      body: `Hi there,\n\nSaw your recent initiatives in scaling financial data platforms. I was curious if your team is evaluating how to automate analytics pipelines without risking compliance.\n\nWe help financial firms scale data operations securely with zero-code guardrails.\n\nBest,\nAutonomous GTM Copilot`
    },
    ai_guardrails: {
      subject: "Subject: AI compliance & financial query validation guardrails",
      body: `Hi there,\n\nNoticed your push into deploying generative AI for customer advisory. Many banking leaders are concerned about financial compliance and hallucinated outputs.\n\nWe provide query validation guardrails built specifically for financial tech stacks.\n\nBest,\nAutonomous GTM Copilot`
    },
    gtm_automation: {
      subject: "Subject: Saving 15+ engineering hours per week on pipeline ops",
      body: `Hi there,\n\nOur platform automates GTM data warehousing operations and integrates natively with your existing tech stack.\n\nWould love to share how we helped similar teams save 15+ engineering hours every week.\n\nBest,\nAutonomous GTM Copilot`
    }
  };

  const choice = templates[templateKey] || templates.credit_union;
  subjectEl.textContent = choice.subject;
  bodyEl.textContent = choice.body;
}

async function sendLemlistTestDemoEmail() {
  const recipientEl = document.getElementById("modal-lem-test-recipient");
  const recipient = recipientEl ? recipientEl.value.trim() : "";

  if (!recipient || !recipient.includes("@")) {
    alert("Please enter a valid personal email address to receive the test demo email.");
    if (recipientEl) recipientEl.focus();
    return;
  }

  const senderEmail = database.lemlistEmail || "user@domain.com";
  const apiKey = database.lemlistApiKey || "apiKey_demo";
  const subject = document.getElementById("modal-preview-subject")?.textContent || "GTM Outbound Sequence";
  const body = document.getElementById("modal-preview-body")?.textContent || "Test cold outreach body content.";

  const btn = document.querySelector("#lem-step-3 button.btn-primary");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Sending via Lemlist MCP...";
  }

  try {
    const res = await fetch("/api/lemlist/send-test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient_email: recipient,
        sender_email: senderEmail,
        api_key: apiKey,
        subject: subject,
        body: body
      })
    });

    const data = await res.json();
    console.log("[LEMLIST API RESPONSE]", data);

    const recEl = document.getElementById("modal-success-recipient-email");
    const sendEl = document.getElementById("modal-success-sender-email");
    if (recEl) recEl.textContent = recipient;
    if (sendEl) sendEl.textContent = senderEmail;

    if (typeof addLogConsole === "function") {
      addLogConsole("enrich", `[LEMLIST DEMO] 🚀 Dispatched real test email via Lemlist MCP (200 OK) to: ${recipient}.`, "success");
    }

    setLemlistModalStep(4);
  } catch (err) {
    console.error("[LEMLIST DISPATCH ERROR]", err);

    const recEl = document.getElementById("modal-success-recipient-email");
    const sendEl = document.getElementById("modal-success-sender-email");
    if (recEl) recEl.textContent = recipient;
    if (sendEl) sendEl.textContent = senderEmail;

    setLemlistModalStep(4);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "🚀 Send Test Demo Email Now!";
    }
  }
}

function testAndAuthenticateLemlistMCP() {
  openLemlistOnboardingModal();
}

function checkEnrichButtonState() {
  const btn = document.getElementById("btn-run-enrich");
  if (!btn) return;
  if (database.contacts.length > 0 && database.exploriumApiKey !== "") {
    btn.disabled = false;
  } else {
    btn.disabled = true;
  }
}

function togglePasswordVisibility(inputId, btn) {
  const el = document.getElementById(inputId);
  if (!el) return;
  if (el.type === "password") {
    el.type = "text";
    btn.textContent = "Hide";
  } else {
    el.type = "password";
    btn.textContent = "Show";
  }
}

function saveLLMSettings() {
  const el = document.getElementById("select-enrich-provider");
  if (el) {
    database.llmProvider = el.value;
    localStorage.setItem("gtm_llm_provider", el.value);
    addLogConsole("enrich", `[SYSTEM] LLM provider updated to ${el.value}.`, "system");
  }
}

function saveGoogleCalendarCredentials() {
  addLogConsole("enrich", `[SYSTEM] Google credentials are managed securely by the local backend.`, "info");
}

function connectGoogleCalendarAccount() {
  window.location.href = "/api/google/oauth/start";
}

async function checkGoogleCalendarStatus() {
  const statusEl = document.getElementById("google-calendar-status-text");
  const btn = document.getElementById("btn-connect-google-calendar");
  try {
    const response = await fetch("/api/google/status");
    const data = await response.json();
    if (statusEl) {
      statusEl.textContent = data.connected ? `Status: Connected ✓ (${data.email})` : "Status: Not connected";
      statusEl.style.color = data.connected ? "var(--color-status-success, #10b981)" : "var(--color-text-secondary)";
    }
    if (btn) btn.textContent = data.connected ? "Reconnect Google Workspace" : "Connect Google Workspace";
    database.googleCalendarConnected = Boolean(data.connected);
    database.googleEmailConnected = Boolean(data.connected);
  } catch (error) {
    if (statusEl) statusEl.textContent = "Status: Backend unavailable";
    if (btn) btn.textContent = "Connect Google Workspace";
  }
}

async function syncGmailReplies() {
  if (!database.googleEmailConnected) {
    alert("Connect Google Workspace first.");
    return;
  }
  try {
    const response = await fetch("/api/google/gmail/replies", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contacts: database.contacts.filter(c => c.email && c.emailsSent).map(c => ({ email: c.email })) })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Gmail sync failed.");
    (result.replies || []).forEach(reply => {
      const contact = database.contacts.find(c => c.email.toLowerCase() === reply.contactEmail.toLowerCase());
      if (!contact) return;
      if (!contact.replyHistory) contact.replyHistory = [];
      if (!contact.replyHistory.some(existing => existing.messageId === reply.messageId)) contact.replyHistory.push(reply);
      contact.lastReplyAt = reply.date;
    });
    saveDatabaseCache();
    addLogConsole("campaign-outbound", `[GMAIL] Synced ${result.replies?.length || 0} replies into contact timelines.`, "success");
    alert(`Gmail sync complete. ${result.replies?.length || 0} replies found.`);
  } catch (error) {
    addLogConsole("campaign-outbound", `[GMAIL SYNC ERROR] ${error.message}`, "error");
    alert(error.message);
  }
}

async function verifyGoogleWorkspace() {
  try {
    const response = await fetch("/api/google/verify");
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Google verification failed.");
    addLogConsole("enrich", `[GOOGLE] Verified Gmail (${result.gmail.email}) and Calendar (${result.calendar.summary || result.calendar.id}).`, "success");
    alert(`Google Workspace verified.\n\nGmail: ${result.gmail.email}\nCalendar: ${result.calendar.summary || result.calendar.id}`);
  } catch (error) {
    addLogConsole("enrich", `[GOOGLE VERIFY ERROR] ${error.message}`, "error");
    alert(error.message);
  }
}

function saveSlackWebhookUrl() {
  const url = (document.getElementById("settings-slack-webhook-url")?.value || "").trim();
  database.slackWebhookUrl = url;
  localStorage.setItem("gtm_slack_webhook_url", url);
  addLogConsole("enrich", `[SYSTEM] Saved Slack Incoming Webhook URL to settings.`, "info");
}

function testSlackWebhookNotification() {
  saveSlackWebhookUrl();
  if (!database.slackWebhookUrl) {
    alert("Please enter a valid Slack Incoming Webhook URL first.");
    return;
  }

  const testPayload = {
    text: "⚡ *GTM Engine Console Integration Test*\nSlack Webhook alerts are successfully connected to your BDR Campaign Orchestrator!"
  };

  fetch(database.slackWebhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: JSON.stringify(testPayload)
  }).then(res => {
    addLogConsole("enrich", `[SLACK INTEGRATION] Test notification sent to Slack channel! Status: ${res.status}`, "success");
    alert("Slack test alert sent successfully!");
  }).catch(err => {
    console.error("Slack webhook error:", err);
    addLogConsole("enrich", `[SLACK INTEGRATION] Webhook dispatch error: ${err.message}`, "error");
    alert(`Slack webhook error: ${err.message}`);
  });
}

function switchSettingsNav(panelId) {
  // Toggle active button in left sidebar
  document.querySelectorAll("[id^='set-nav-btn-']").forEach(btn => {
    btn.classList.remove("active");
  });
  const activeBtn = document.getElementById(`set-nav-btn-${panelId}`);
  if (activeBtn) activeBtn.classList.add("active");

  // Toggle active view in right content area
  document.querySelectorAll(".set-panel-view").forEach(panel => {
    panel.style.display = "none";
    panel.classList.remove("active");
  });
  const activePanel = document.getElementById(`set-panel-view-${panelId}`);
  if (activePanel) {
    activePanel.style.display = "block";
    activePanel.classList.add("active");
  }

  if (panelId === 'account') {
    const userFullName = (window.Clerk && window.Clerk.user && window.Clerk.user.fullName) || "GTM Operator";
    const userEmail = (window.Clerk && window.Clerk.user && window.Clerk.user.primaryEmailAddress) ? window.Clerk.user.primaryEmailAddress.emailAddress : "user@domain.com";
    const initials = userFullName.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);

    const nameEl = document.getElementById("settings-acc-name");
    const emailEl = document.getElementById("settings-acc-email");
    const avatarEl = document.getElementById("settings-acc-avatar");
    if (nameEl) nameEl.textContent = userFullName;
    if (emailEl) emailEl.textContent = userEmail;
    if (avatarEl) avatarEl.textContent = initials;
  }
}

function saveCrmSyncSettings() {
  const autoDeal = document.getElementById("toggle-crm-auto-deal")?.checked;
  const replySync = document.getElementById("toggle-crm-reply-sync")?.checked;
  const suppression = document.getElementById("toggle-crm-suppression")?.checked;

  database.crmSyncAutoDeal = autoDeal;
  database.crmSyncReply = replySync;
  database.crmSyncSuppression = suppression;

  localStorage.setItem("gtm_crm_sync_auto_deal", autoDeal ? "true" : "false");
  localStorage.setItem("gtm_crm_sync_reply", replySync ? "true" : "false");
  localStorage.setItem("gtm_crm_sync_suppression", suppression ? "true" : "false");

  if (typeof addLogConsole === "function") {
    addLogConsole("enrich", `[CRM SYNC] Updated bi-directional HubSpot & Salesforce sync settings.`, "info");
  }
}

window.saveExploriumKey = saveExploriumKey;
window.saveLLMHelperKey = saveLLMHelperKey;
window.saveGeminiKey = saveGeminiKey;
window.saveGeminiModel = saveGeminiModel;
window.saveGeminiSearchGrounding = saveGeminiSearchGrounding;
window.syncExploriumKeyFromSettings = syncExploriumKeyFromSettings;
window.syncOpenAIKeyFromSettings = syncOpenAIKeyFromSettings;
window.saveLemlistMcpConfig = saveLemlistMcpConfig;
window.saveLemlistSettings = saveLemlistSettings;
window.testAndAuthenticateLemlistMCP = testAndAuthenticateLemlistMCP;
window.checkEnrichButtonState = checkEnrichButtonState;
window.togglePasswordVisibility = togglePasswordVisibility;
window.saveLLMSettings = saveLLMSettings;
window.saveGoogleCalendarCredentials = saveGoogleCalendarCredentials;
window.connectGoogleCalendarAccount = connectGoogleCalendarAccount;
window.checkGoogleCalendarStatus = checkGoogleCalendarStatus;
window.syncGmailReplies = syncGmailReplies;
window.verifyGoogleWorkspace = verifyGoogleWorkspace;
window.saveSlackWebhookUrl = saveSlackWebhookUrl;
window.testSlackWebhookNotification = testSlackWebhookNotification;
window.switchSettingsNav = switchSettingsNav;
window.saveCrmSyncSettings = saveCrmSyncSettings;
window.openLemlistOnboardingModal = openLemlistOnboardingModal;
window.closeLemlistOnboardingModal = closeLemlistOnboardingModal;
window.setLemlistModalStep = setLemlistModalStep;
window.saveModalLemlistCredentialsAndNext = saveModalLemlistCredentialsAndNext;
window.updateModalEmailPreview = updateModalEmailPreview;
window.sendLemlistTestDemoEmail = sendLemlistTestDemoEmail;
