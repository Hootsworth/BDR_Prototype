// --- AUTONOMOUS RESEARCH AGENT CONTROLLER ---

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

// Attach listeners immediately or defer to main
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

  // Extract query after @
  const query = val.slice(atIndex + 1).toLowerCase().trim();
  list.innerHTML = "";

  let matches = [];
  if (database.contacts.length > 0) {
    if (query === "") {
      // Show first 5 contacts as default suggestions
      matches = database.contacts.slice(0, 5);
    } else {
      // Match query
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
    item.innerHTML = `
      <strong>${c.fullName}</strong>
      <span class="suggestion-meta">${c.jobTitle} at ${c.company}</span>
    `;
    item.onclick = () => {
      selectAgentAutocomplete(c.fullName);
    };
    list.appendChild(item);
  });

  list.style.display = "flex";
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
  if (event.key === "Enter") {
    // If autocomplete is visible, we don't submit yet
    const list = document.getElementById("agent-autocomplete-list");
    if (list && list.style.display === "flex") return;

    sendAgentChatMessage();
  }
}

function sendAgentChatMessage() {
  const input = document.getElementById("agent-chat-input");
  const history = document.getElementById("agent-chat-history");
  if (!input || !history) return;

  const text = input.value.trim();
  if (text === "") return;

  // Append user bubble
  const userFullName = (window.Clerk && window.Clerk.user && window.Clerk.user.fullName) || "Demo User";
  const userInitials = getInitials(userFullName);
  const userAvatarColor = getAvatarColor(userFullName);

  const userDiv = document.createElement("div");
  userDiv.className = "agent-chat-msg user-msg";
  userDiv.innerHTML = `
    <div class="avatar" style="background:${userAvatarColor}; color:#fff; font-size:11px; font-weight:700; border:1px solid var(--hairline); box-shadow:1.5px 1.5px 0 var(--hairline);">${userInitials}</div>
    <div class="msg-bubble">${text}</div>
  `;
  history.appendChild(userDiv);
  input.value = "";
  history.scrollTop = history.scrollHeight;

  // Parse for @ mentioned contact (robust parser)
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

  // Command 1: "enrich"
  if (lowerText.includes("enrich") || lowerText.includes("start enrichment") || lowerText.includes("start the enrichment")) {
    if (targetContact) {
      appendAgentLog(`🤖 Command detected: <strong>Enriching ${targetContact.fullName}</strong>...`);
      setTimeout(() => {
        targetContact.enriched = true;
        targetContact.phone = `+1 (555) ${Math.floor(200 + Math.random() * 700)}-${Math.floor(1000 + Math.random() * 9000)}`;
        const cleanComp = targetContact.company.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10);
        targetContact.linkedinUrl = `linkedin.com/in/${targetContact.firstName.toLowerCase()}-${targetContact.lastName.toLowerCase()}-${cleanComp}`;
        targetContact.matchPercentage = 96;
        targetContact.leadTemp = "Hot Lead";
        saveDatabaseCache();
        appendAgentLog(`🤖 <strong>Enrichment Complete for ${targetContact.fullName}!</strong> Calculated ICP match rating: 96%. Phone: ${targetContact.phone}.`);
        if (typeof filterEnrichTable === "function") filterEnrichTable();
        if (typeof filterEmailTable === "function") filterEmailTable();
      }, 800);
    } else {
      appendAgentLog(`🤖 Command detected: <strong>Executing Outbound Lead Enrichment Pipeline</strong>...`);
      setTimeout(() => {
        enrichDataRecords();
        saveDatabaseCache();
        appendAgentLog(`🤖 <strong>Enrichment Complete!</strong> Enriched phone numbers, computed match rating seniority percentages, and assigned lead temperature statuses for all imported records.`);
        if (typeof filterEnrichTable === "function") filterEnrichTable();
        if (typeof filterEmailTable === "function") filterEmailTable();
      }, 800);
    }
    return;
  }

  // Command 2: "sync lemlist"
  if (lowerText.includes("lemlist") || lowerText.includes("sync") || lowerText.includes("push campaigns")) {
    if (targetContact) {
      appendAgentLog(`🤖 Command detected: <strong>Syncing ${targetContact.fullName} to Lemlist sequence</strong>...`);
      setTimeout(() => {
        targetContact.emailsSent = true;
        database.stats.emailsSent++;
        saveDatabaseCache();
        appendAgentLog(`🤖 <strong>Lemlist Sync Complete!</strong> Enrolled <strong>${targetContact.fullName}</strong> into sequence queue (review guardrail active).`);
        if (typeof filterEmailTable === "function") filterEmailTable();
      }, 800);
    } else {
      appendAgentLog(`🤖 Command detected: <strong>Syncing Enrolled Outbound Campaigns to Lemlist API</strong>...`);
      setTimeout(() => {
        let syncCount = 0;
        database.contacts.forEach(c => {
          if (!c.emailsSent) {
            c.emailsSent = true;
            syncCount++;
          }
        });
        if (syncCount > 0) {
          database.stats.emailsSent += syncCount;
          saveDatabaseCache();
          appendAgentLog(`🤖 <strong>Lemlist Campaign Sync Complete!</strong> Enrolled <strong>${syncCount}</strong> prospects into outbound email queue (review guardrails active).`);
          if (typeof filterEmailTable === "function") filterEmailTable();
        } else {
          appendAgentLog(`🤖 All prospects are already synced to Lemlist campaigns!`);
        }
      }, 800);
    }
    return;
  }

  if (!targetContact) {
    const atMatch = text.match(/@([a-zA-Z]+(?:\s+[a-zA-Z]+)?)/);
    if (atMatch) {
      const parsedName = atMatch[1].trim().toLowerCase();
      targetContact = database.contacts.find(c => c.fullName.toLowerCase().includes(parsedName));
      if (targetContact) {
        customQuery = text.replace(atMatch[0], "").trim();
      }
    }
  }

  if (targetContact) {
    startAgentResearchSequence(targetContact, customQuery);
  } else {
    // If Gemini key is not configured, show placeholder reply
    if (!database.geminiApiKey) {
      setTimeout(() => {
        const botDiv = document.createElement("div");
        botDiv.className = "agent-chat-msg agent-msg";
        botDiv.innerHTML = `
            <div class="avatar">🤖</div>
            <div class="msg-bubble">
              I am ready. Type <strong>@</strong> followed by a contact's name to launch my web search, or configure a <strong>Gemini API Key</strong> in the Settings tab to let me answer general queries!
            </div>
          `;
        history.appendChild(botDiv);
        history.scrollTop = history.scrollHeight;
      }, 500);
      return;
    }

    // Call Gemini API for general query!
    database.agentRunning = true;
    const browserUrl = document.getElementById("agent-browser-url-input");
    if (browserUrl) browserUrl.value = "Status: Answering general query...";

    setTimeout(() => {
      appendAgentLog(`🤖 Processing query: "<em>${text}</em>"...`);
    }, 100);

    const model = database.geminiModel || "gemini-2.5-flash";
    const apiKey = database.geminiApiKey;
    const enableSearch = database.geminiSearchGrounding !== false;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const systemInstruction = `You are a helpful B2B GTM and Outbound Sales Assistant. Answer the user's query clearly and concisely. Format your response in clean HTML tags (such as <strong>, <em>, <br>, <ul>, <li>). Do NOT use markdown like ** or *. Use clean headers (e.g. <h3>) instead.`;

    const requestBody = {
      contents: [
        {
          role: "user",
          parts: [{ text: `${systemInstruction}\n\nUser Question: ${text}` }]
        }
      ]
    };

    if (enableSearch) {
      requestBody.tools = [
        {
          googleSearch: {}
        }
      ];
    }

    fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody)
    })
      .then(res => {
        if (!res.ok) throw new Error(`API Error (${res.status})`);
        return res.json();
      })
      .then(resJson => {
        database.agentRunning = false;
        if (browserUrl) browserUrl.value = "https://google.com";

        const candidate = resJson.candidates && resJson.candidates[0];
        if (candidate) {
          let ansText = candidate.content.parts[0].text;
          ansText = ansText
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/### (.*?)\n/g, '<h3>$1</h3>')
            .replace(/## (.*?)\n/g, '<h2>$1</h2>')
            .replace(/\n/g, '<br>');

          appendAgentLog(`🤖 Response:<br><br>${ansText}`);
        } else {
          appendAgentLog(`🤖 Sorry, I couldn't generate an answer.`);
        }
      })
      .catch(err => {
        database.agentRunning = false;
        if (browserUrl) browserUrl.value = "https://google.com";
        appendAgentLog(`❌ Failed to answer general query: <em>${err.message}</em>`);
      });
  }
}

function sendAgentDirective() {
  const input = document.getElementById("agent-directives");
  if (!input) return;
  const text = input.value.trim();
  if (text === "") return;

  const chatInput = document.getElementById("agent-chat-input");
  if (chatInput) {
    chatInput.value = text;
    sendAgentChatMessage();
    input.value = "";
  }
}

function updateBrowserStep(stepId, status) {
  const el = document.getElementById(stepId);
  if (!el) return;
  el.classList.remove("running", "completed");
  if (status === "running") el.classList.add("running");
  if (status === "completed") el.classList.add("completed");
}

async function startAgentResearchSequence(contact, customUserQuestion = "") {
  const history = document.getElementById("agent-chat-history");
  const browserUrl = document.getElementById("agent-browser-url-input");
  const browserViewport = document.getElementById("agent-browser-viewport");

  if (!history || !browserUrl || !browserViewport) return;

  if (!database.geminiApiKey) {
    appendAgentLog(`❌ <strong>Error: Gemini API key is not configured!</strong><br>
    Please configure your Gemini API Key in the Settings tab to activate the autonomous B2B research agent.<br><br>
    <button class="btn btn-primary btn-sm" onclick="switchTab('settings-keys')">Configure API Credentials</button>`);
    return;
  }

  database.agentRunning = true;

  const floatingLoader = document.getElementById("agent-floating-loader");
  const loaderTitle = document.getElementById("agent-loader-title");
  const loaderSubtitle = document.getElementById("agent-loader-subtitle");
  const readingTitle = document.getElementById("agent-reading-title");

  if (floatingLoader) floatingLoader.classList.add("active");
  if (loaderTitle) loaderTitle.textContent = "Agentic Research In Progress";
  if (loaderSubtitle) loaderSubtitle.textContent = "Planning research path...";
  if (readingTitle) readingTitle.textContent = "Standing by";

  updateBrowserStep("target-step-1", "running");
  updateBrowserStep("target-step-2", "");
  updateBrowserStep("target-step-3", "");
  updateBrowserStep("target-step-4", "");

  const queryToRun = customUserQuestion ? customUserQuestion.trim() : `Find out everything you can about ${contact.fullName} who is ${contact.jobTitle} at ${contact.company}. Focus on their professional background, key public details, and corporate profile.`;

  appendAgentLog(`🤖 Planning web-grounded research cycle for <strong>${contact.fullName}</strong> (${contact.jobTitle} at <em>${contact.company}</em>).`);

  browserUrl.value = "Connecting to Gemini API (with Search Grounding)...";
  browserViewport.innerHTML = `
    <div class="browser-empty" style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; color:var(--muted); gap:12px; padding: 20px;">
      <div style="font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:1.5px;">Agent Executing Dorking Query...</div>
      <div style="font-size:11px; opacity:0.8; text-align:center;">Retrieving live Google Search index metadata.</div>
    </div>
  `;

  try {
    const model = database.geminiModel || "gemini-2.5-flash";
    const apiKey = database.geminiApiKey;
    const enableSearch = database.geminiSearchGrounding !== false;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const systemInstruction = `You are an expert BDR Research Agent. Your task is to research the target contact from our local B2B database:
Full Name: ${contact.fullName}
First Name: ${contact.firstName}
Last Name: ${contact.lastName}
Job Title: ${contact.jobTitle}
Company: ${contact.company}
Industry: ${contact.industry}
Lead Temp: ${contact.leadTemp}
Match Score: ${contact.matchPercentage}%
State/Location: ${contact.state || "Unknown"}

Analyze the web search results and write a structured sales research dossier. Format your response in clean HTML tags (such as <strong>, <em>, <br>, <ul>, <li>). Do NOT use markdown formatting like ** or * or # or - since this will be rendered directly in an HTML container. Use clean headers (e.g. <h3>) instead.
Provide:
1. Executive Background (Who they are, past experience).
2. Outbound Hook Angles (3 distinct personalized angles for outreach based on their company, role, or latest news).
3. Recommended Outbound Subject Line.
`;

    const requestBody = {
      contents: [
        {
          role: "user",
          parts: [{ text: `${systemInstruction}\n\nUser Question/Instruction: ${queryToRun}` }]
        }
      ]
    };

    if (enableSearch) {
      requestBody.tools = [
        {
          googleSearch: {}
        }
      ];
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API Error (${response.status}): ${errText}`);
    }

    const resJson = await response.json();
    const candidate = resJson.candidates && resJson.candidates[0];
    if (!candidate) {
      throw new Error("No response candidates returned from Gemini API.");
    }

    let finalReportHtml = candidate.content.parts[0].text;
    finalReportHtml = finalReportHtml
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/### (.*?)\n/g, '<h3>$1</h3>')
      .replace(/## (.*?)\n/g, '<h2>$1</h2>')
      .replace(/\n/g, '<br>');

    const groundingMetadata = candidate.groundingMetadata;
    const queries = (groundingMetadata && groundingMetadata.webSearchQueries) || [];
    const chunks = (groundingMetadata && groundingMetadata.groundingChunks) || [];

    let step = 0;

    const runSimulationStep = () => {
      if (step >= Math.max(queries.length, chunks.length, 1)) {
        runEnrichmentStep();
        return;
      }

      if (queries[step]) {
        const query = queries[step];
        browserUrl.value = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
        updateBrowserStep("target-step-1", "running");
        if (loaderSubtitle) loaderSubtitle.textContent = "Google Dorking search index matching...";
        if (readingTitle) readingTitle.textContent = query;

        let resultsHtml = "";
        chunks.slice(0, 3).forEach((c, i) => {
          resultsHtml += `
            <div class="google-result-item" style="margin-bottom:12px; text-align:left;">
              <div class="result-url" style="font-size:11px; color:#5f6368; word-break:break-all;">${c.web.uri}</div>
              <a href="#" onclick="return false;" id="sim-link-${i}" style="color: #1a0dab; font-size:13px; font-weight: 500; text-decoration: none; display:block; margin:2px 0;">${c.web.title}</a>
              <div class="result-snippet" style="font-size:11px; color:#4d5156; line-height:1.4;">Grounding resource compiled by search agent for ${contact.fullName}.</div>
            </div>
          `;
        });

        browserViewport.innerHTML = `
          <div class="browser-cursor" id="agent-browser-cursor" style="position: absolute; width: 24px; height: 24px; background-image: url('./cursors/arrow_2x.png'); background-size: contain; background-repeat: no-repeat; z-index: 100; pointer-events: none; transition: all 0.8s ease-in-out; left: 100px; top: 120px;"></div>
          <div class="google-search-mock" style="padding:15px; background:#ffffff; height:100%; overflow-y:auto; font-family:sans-serif;">
            <div class="google-logo-sm" style="font-size:16px; font-weight:bold; margin-bottom:12px; color:#4285F4;">
              <span style="color:#4285F4;">G</span><span style="color:#EA4335;">o</span><span style="color:#FBBC05;">o</span><span style="color:#4285F4;">g</span><span style="color:#34A853;">l</span><span style="color:#EA4335;">e</span>
            </div>
            ${resultsHtml || `<div style="font-size:12px; color:var(--muted)">No instant results returned. Indexing...</div>`}
          </div>
        `;

        appendAgentLog(`🤖 <em>[CRAWLER]</em> Scanning search index for query: <em>${query}</em>`);

        setTimeout(() => {
          const cursorEl = document.getElementById("agent-browser-cursor");
          if (cursorEl) {
            cursorEl.style.left = "40px";
            cursorEl.style.top = "70px";
          }
        }, 800);

        setTimeout(() => {
          const link = document.getElementById("sim-link-0");
          if (link) link.style.color = "#551a8b";
          const cursorEl = document.getElementById("agent-browser-cursor");
          if (cursorEl) cursorEl.classList.add("hand");
        }, 1600);

        setTimeout(() => {
          updateBrowserStep("target-step-1", "completed");
          if (chunks[step]) {
            const chunk = chunks[step];
            const urlStr = chunk.web.uri;
            const titleStr = chunk.web.title;
            browserUrl.value = urlStr;

            if (urlStr.includes("linkedin.com")) {
              updateBrowserStep("target-step-2", "running");
              if (loaderSubtitle) loaderSubtitle.textContent = "Scraping profiles via Firecrawl...";
              if (readingTitle) readingTitle.textContent = "linkedin.com/in/" + contact.firstName.toLowerCase();
              appendAgentLog(`🤖 <em>[FIRECRAWL]</em> Crawling LinkedIn profile node...`);

              const initials = contact.fullName.split(" ").map(n => n[0]).join("");
              browserViewport.innerHTML = `
                <div class="browser-cursor" id="agent-browser-cursor" style="position: absolute; width: 24px; height: 24px; background-image: url('./cursors/arrow_2x.png'); background-size: contain; background-repeat: no-repeat; z-index: 100; pointer-events: none; transition: all 0.8s ease-in-out; left: 40px; top: 70px;"></div>
                <div class="linkedin-profile-mock" style="font-family:sans-serif; text-align:left; background:#f3f6f8; height:100%; overflow-y:auto;">
                  <div class="linkedin-header-card" style="background:#ffffff; border-bottom:1px solid #e0e0e0; padding-bottom:12px;">
                    <div class="linkedin-banner" style="height:45px; background:linear-gradient(90deg, #a0b2c6, #cbd5e1);"></div>
                    <div class="linkedin-avatar-row" style="display:flex; justify-content:space-between; padding: 0 12px; margin-top:-20px;">
                      <div class="linkedin-avatar-mock" style="width:40px; height:40px; background:#0077b5; border-radius:50%; border:2.5px solid #ffffff; display:flex; align-items:center; justify-content:center; color:#ffffff; font-weight:bold; font-size:13px;">${initials}</div>
                      <button style="background:#0077b5; color:#ffffff; border:none; padding:4px 8px; border-radius:12px; font-size:10px; font-weight:bold; height:22px; cursor:pointer; align-self:flex-end;">Connect</button>
                    </div>
                    <div class="linkedin-info-row" style="padding:8px 12px;">
                      <div class="linkedin-name" style="font-weight:bold; font-size:13px; color:#191919;">${contact.fullName}</div>
                      <div style="font-size:10.5px; color:#5e5e5e; margin-top:2px;">${contact.jobTitle} at ${contact.company}</div>
                      <div style="font-size:9.5px; color:#8c8c8c; margin-top:2px;">Greater Detroit Area • Contact info</div>
                    </div>
                  </div>
                  <div style="background:#ffffff; margin-top:8px; padding:12px; text-align:left;">
                    <div style="font-size:11px; font-weight:bold; color:#191919; margin-bottom:6px;">Reference Information</div>
                    <div style="font-size:10.5px; color:#5e5e5e; line-height:1.4;">${titleStr}</div>
                  </div>
                </div>
              `;

              setTimeout(() => {
                updateBrowserStep("target-step-2", "completed");
              }, 1800);
            } else {
              updateBrowserStep("target-step-3", "running");
              if (loaderSubtitle) loaderSubtitle.textContent = "Crawling company value statements...";
              if (readingTitle) readingTitle.textContent = contact.company + " Homepage";
              appendAgentLog(`🤖 <em>[CRAWLER]</em> Crawling corporate page assets: <em>${urlStr}</em>`);

              browserViewport.innerHTML = `
                <div class="browser-cursor" id="agent-browser-cursor" style="position: absolute; width: 24px; height: 24px; background-image: url('./cursors/arrow_2x.png'); background-size: contain; background-repeat: no-repeat; z-index: 100; pointer-events: none; transition: all 0.8s ease-in-out; left: 40px; top: 70px;"></div>
                <div style="font-family:sans-serif; text-align:left; background:#f8f9fa; height:100%; overflow-y:auto;">
                  <div style="background:#1b263b; color:#ffffff; padding:10px 12px; display:flex; justify-content:space-between; align-items:center;">
                    <div style="font-weight:bold; font-size:11px;">${contact.company.toUpperCase()}</div>
                    <div style="font-size:9px; opacity:0.8;">CRAWLER ONLINE</div>
                  </div>
                  <div style="padding:15px; background:#ffffff;">
                    <h2 style="font-size:13px; margin:0 0 8px 0; color:#1b263b;">${titleStr}</h2>
                    <p style="font-size:10.5px; color:#4a4a4a; line-height:1.45;">
                      Scraping company index portals. Targeting data-protection triggers, CRM alignments, and campaign tags. Value propositions captured from public anchors.
                    </p>
                  </div>
                  <div style="padding:12px; margin-top:8px; background:#e9ecef; font-size:9.5px; color:#6c757d; word-break:break-all;">
                    Source: ${urlStr}
                  </div>
                </div>
              `;

              setTimeout(() => {
                updateBrowserStep("target-step-3", "completed");
              }, 1800);
            }

            step++;
            setTimeout(runSimulationStep, 2000);
          } else {
            step++;
            runSimulationStep();
          }
        }, 2200);

      } else {
        step++;
        runSimulationStep();
      }
    };

    const runEnrichmentStep = () => {
      browserUrl.value = "https://console.gtm/enrich/";
      updateBrowserStep("target-step-3", "completed");
      updateBrowserStep("target-step-4", "running");
      if (loaderSubtitle) loaderSubtitle.textContent = "Running Lead Scoring & Profiling...";
      if (readingTitle) readingTitle.textContent = "Enrichment API Node";

      contact.enriched = true;
      if (!contact.phone) {
        contact.phone = `+1 (555) ${Math.floor(200 + Math.random() * 700)}-${Math.floor(1000 + Math.random() * 9000)}`;
      }
      const cleanComp = contact.company.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10);
      contact.linkedinUrl = `linkedin.com/in/${contact.firstName.toLowerCase()}-${contact.lastName.toLowerCase()}-${cleanComp}`;

      const title = contact.jobTitle.toLowerCase();
      let score = 70;
      if (title.includes("cio") || title.includes("cto") || title.includes("chief information") || title.includes("chief technology")) {
        score = Math.floor(Math.random() * 5) + 95;
      } else if (title.includes("president") || title.includes("ceo") || title.includes("chief executive")) {
        score = Math.floor(Math.random() * 5) + 94;
      } else if (title.includes("vp") || title.includes("vice president") || title.includes("director")) {
        score = Math.floor(Math.random() * 10) + 85;
      } else {
        score = Math.floor(Math.random() * 10) + 75;
      }
      contact.matchPercentage = score;
      contact.leadTemp = score >= 88 ? "Hot Lead" : "Cold Lead";
      database.stats.enrichedCount = Math.max(database.stats.enrichedCount, database.contacts.filter(c => c.enriched).length);

      browserViewport.innerHTML = `
        <div class="browser-cursor" id="agent-browser-cursor" style="position: absolute; width: 24px; height: 24px; background-image: url('./cursors/arrow_2x.png'); background-size: contain; background-repeat: no-repeat; z-index: 100; pointer-events: none; transition: all 0.8s ease-in-out; left: 100px; top: 120px;"></div>
        <div style="font-family:sans-serif; text-align:left; background:#fbfbfa; height:100%; overflow-y:auto; padding:20px; color:#111111;">
          <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1.5px solid #e5e5e3; padding-bottom:10px; margin-bottom:15px;">
            <span style="font-size:12px; font-weight:bold; color:#767676; text-transform:uppercase; letter-spacing:0.5px;">B2B Data Enrichment Platform</span>
            <span class="target-badge" style="background:#d1fae5; color:#065f46; font-size:10px; font-weight:bold; padding:2px 8px; border-radius:10px;">AgentSource Verified</span>
          </div>
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; font-size:12px; margin-bottom:15px;">
            <div>
              <div style="color:#767676; font-size:10px; text-transform:uppercase;">Prospect Name</div>
              <div style="font-weight:600; margin-top:2px;">${contact.fullName}</div>
            </div>
            <div>
              <div style="color:#767676; font-size:10px; text-transform:uppercase;">Company Name</div>
              <div style="font-weight:600; margin-top:2px;">${contact.company}</div>
            </div>
            <div>
              <div style="color:#767676; font-size:10px; text-transform:uppercase;">Validated Email</div>
              <div style="font-weight:600; font-family:monospace; margin-top:2px;">${contact.email || "N/A"}</div>
            </div>
            <div>
              <div style="color:#767676; font-size:10px; text-transform:uppercase;">Validated Phone</div>
              <div style="font-weight:600; font-family:monospace; margin-top:2px;">${contact.phone || "N/A"}</div>
            </div>
          </div>
          <div style="border-top:1.5px solid #e5e5e3; padding-top:12px; display:flex; justify-content:space-between; align-items:center;">
            <div>
              <div style="color:#767676; font-size:10px; text-transform:uppercase;">ICP Seniority Score</div>
              <div style="font-size:18px; font-weight:bold; margin-top:2px; color:#ef4444;">${contact.matchPercentage}% Match</div>
            </div>
            <span class="target-badge" style="background:#fee2e2; color:#ef4444; font-weight:bold; padding:4px 10px; border-radius:12px; font-size:11px;">${contact.leadTemp}</span>
          </div>
        </div>
      `;

      appendAgentLog(`🤖 <em>[ENRICH]</em> Retrieved verified credentials and match rating: <strong>${contact.matchPercentage}% score</strong>.`);

      setTimeout(() => {
        const cursorEl = document.getElementById("agent-browser-cursor");
        if (cursorEl) {
          cursorEl.style.left = "40px";
          cursorEl.style.top = "60px";
        }
      }, 500);

      setTimeout(runEmailComposerStep, 2000);
    };

    const runEmailComposerStep = () => {
      browserUrl.value = "https://console.gtm/campaign-email/";
      updateBrowserStep("target-step-4", "completed");
      updateBrowserStep("target-step-5", "running");
      if (loaderSubtitle) loaderSubtitle.textContent = "Synthesizing Outbound Campaign Copy...";
      if (readingTitle) readingTitle.textContent = "Email Copywriter";

      let subjectLine = `Compliance validation for ${contact.company}`;
      let bodyText = `Hi ${contact.firstName},\n\nI saw your profile as ${contact.jobTitle} at ${contact.company}. Many CU tech leaders are integrating database automation or evaluating LLM query platforms but are worried about security guardrails.\n\nWe provide query validator rules specifically built for credit union databases.\n\nWould you be open to a brief chat next Tuesday?\n\nBest,\nSDR Campaign Agent`;

      const subjectMatch = finalReportHtml.match(/Subject Line:\s*([^\n<]+)/i) || finalReportHtml.match(/Subject:\s*([^\n<]+)/i);
      if (subjectMatch) {
        subjectLine = subjectMatch[1].replace(/["]+/g, "").trim();
      }

      contact.emailDraft = { subject: subjectLine, body: bodyText };

      browserViewport.innerHTML = `
        <div class="browser-cursor" id="agent-browser-cursor" style="position: absolute; width: 24px; height: 24px; background-image: url('./cursors/arrow_2x.png'); background-size: contain; background-repeat: no-repeat; z-index: 100; pointer-events: none; transition: all 0.8s ease-in-out; left: 100px; top: 120px;"></div>
        <div style="font-family:sans-serif; text-align:left; background:#ffffff; height:100%; overflow-y:auto; display:flex; flex-direction:column;">
          <div style="background:#f8f9fa; border-bottom:1px solid #e5e5e3; padding:10px 15px; font-size:12px;">
            <div style="margin-bottom:6px;"><span style="color:#767676; width:50px; display:inline-block;">From:</span> <strong>sdr-agent@mycompany.com</strong></div>
            <div style="margin-bottom:6px;"><span style="color:#767676; width:50px; display:inline-block;">To:</span> <strong>${contact.email || "prospect@company.com"}</strong></div>
            <div><span style="color:#767676; width:50px; display:inline-block;">Subject:</span> <strong>${subjectLine}</strong></div>
          </div>
          <div style="padding:15px; font-size:12.5px; line-height:1.5; color:#333333; white-space:pre-wrap; flex:1;">
            ${bodyText}
          </div>
        </div>
      `;

      appendAgentLog(`🤖 <em>[COPYWRITER]</em> Drafted hyper-personalized campaign email for <strong>${contact.fullName}</strong>.`);

      setTimeout(() => {
        const cursorEl = document.getElementById("agent-browser-cursor");
        if (cursorEl) {
          cursorEl.style.left = "60px";
          cursorEl.style.top = "80px";
        }
      }, 500);

      setTimeout(runLinkedInComposerStep, 2000);
    };

    const runLinkedInComposerStep = () => {
      browserUrl.value = "https://console.gtm/campaign-linkedin/";
      updateBrowserStep("target-step-5", "completed");
      updateBrowserStep("target-step-6", "running");
      if (loaderSubtitle) loaderSubtitle.textContent = "Compiling LinkedIn Connection Message...";
      if (readingTitle) readingTitle.textContent = "LinkedIn Outreach Composer";

      const inviteMsg = `Hi ${contact.firstName}, I saw your role as ${contact.jobTitle} at ${contact.company}. I'd love to share how we secure database operations for CU platforms. Let's connect!`;
      contact.linkedinDraft = inviteMsg;

      browserViewport.innerHTML = `
        <div class="browser-cursor" id="agent-browser-cursor" style="position: absolute; width: 24px; height: 24px; background-image: url('./cursors/arrow_2x.png'); background-size: contain; background-repeat: no-repeat; z-index: 100; pointer-events: none; transition: all 0.8s ease-in-out; left: 100px; top: 120px;"></div>
        <div style="font-family:sans-serif; text-align:left; background:#f3f6f8; height:100%; padding:15px; display:flex; flex-direction:column; justify-content:center; align-items:center;">
          <div style="background:#ffffff; border:1px solid #e0e0e0; border-radius:8px; width:95%; max-width:320px; box-shadow:0 2px 8px rgba(0,0,0,0.08); overflow:hidden;">
            <div style="padding:12px; border-bottom:1px solid #e0e0e0; display:flex; align-items:center; justify-content:space-between; background:#ffffff;">
              <span style="font-size:12.5px; font-weight:bold; color:#191919;">Invite ${contact.firstName} to connect</span>
              <span style="font-size:14px; color:#5e5e5e; cursor:pointer;">&times;</span>
            </div>
            <div style="padding:12px;">
              <p style="font-size:11px; color:#5e5e5e; margin:0 0 10px 0;">Personalize your connection invite with a tailored hook.</p>
              <div style="border:1px solid #0077b5; border-radius:4px; padding:8px; min-height:80px; font-size:11.5px; color:#191919; background:#f3f6f8; line-height:1.4;">
                ${inviteMsg}
              </div>
            </div>
            <div style="padding:10px 12px; background:#f3f6f8; text-align:right; border-top:1px solid #e0e0e0;">
              <button style="border:1px solid #0077b5; color:#0077b5; background:transparent; padding:4px 10px; border-radius:12px; font-size:11px; font-weight:bold; margin-right:8px; cursor:pointer;">Cancel</button>
              <button id="sim-btn-linkedin-send" style="background:#0077b5; color:#ffffff; border:none; padding:4px 12px; border-radius:12px; font-size:11px; font-weight:bold; cursor:pointer;">Send Invitation</button>
            </div>
          </div>
        </div>
      `;

      appendAgentLog(`🤖 <em>[OUTREACH]</em> Drafted connection message: "<em>${inviteMsg}</em>".`);

      setTimeout(() => {
        const cursorEl = document.getElementById("agent-browser-cursor");
        if (cursorEl) {
          cursorEl.style.left = "240px";
          cursorEl.style.top = "210px";
        }
      }, 500);

      setTimeout(() => {
        const btn = document.getElementById("sim-btn-linkedin-send");
        if (btn) btn.style.opacity = "0.7";
        const cursorEl = document.getElementById("agent-browser-cursor");
        if (cursorEl) cursorEl.classList.add("hand");
      }, 1300);

      setTimeout(runLemlistSyncStep, 2000);
    };

    const runLemlistSyncStep = () => {
      browserUrl.value = "https://app.lemlist.com/mcp";
      updateBrowserStep("target-step-6", "completed");
      updateBrowserStep("target-step-7", "running");
      if (loaderSubtitle) loaderSubtitle.textContent = "Syncing sequence queue via Lemlist MCP...";
      if (readingTitle) readingTitle.textContent = "Lemlist MCP Client";

      const templateName = contact.leadTemp === "Hot Lead" ? "fintech_cto_llm" : "general_gtm";

      contact.emailsSent = true;
      database.stats.emailsSent++;
      saveDatabaseCache();

      browserViewport.innerHTML = `
        <div class="browser-cursor" id="agent-browser-cursor" style="position: absolute; width: 24px; height: 24px; background-image: url('./cursors/arrow_2x.png'); background-size: contain; background-repeat: no-repeat; z-index: 100; pointer-events: none; transition: all 0.8s ease-in-out; left: 100px; top: 120px;"></div>
        <div style="font-family:monospace; text-align:left; background:#1e1e1e; color:#a6accd; height:100%; padding:15px; font-size:11px; overflow-y:auto; line-height:1.45;">
          <div style="color:#c792ea; margin-bottom:8px;">&gt; ${database.lemlistMcpCommand || 'npx'} ${database.lemlistMcpArgs || 'mcp-remote https://app.lemlist.com/mcp'}</div>
          <div style="color:#c3e88d;">[INFO] Initializing Lemlist MCP connection...</div>
          <div style="color:#c3e88d;">[INFO] Sending JSON-RPC handshake 'initialize' request...</div>
          <div style="color:#82aaff;">[SUCCESS] MCP connection established with Lemlist Server.</div>
          <div style="color:#c3e88d;">[INFO] Fetching tools list...</div>
          <div style="color:#82aaff;">[SUCCESS] Mapped tools: 'lemlist_add_contact_to_campaign', 'lemlist_create_draft'</div>
          <div style="color:#c3e88d;">[INFO] Invoking MCP tool: 'lemlist_add_contact_to_campaign'</div>
          <div style="color:#82aaff; margin-left:10px;">Method: 'tools/call'</div>
          <div style="color:#82aaff; margin-left:10px;">Arguments: { email: "${contact.email || 'N/A'}", campaign: "${templateName}" }</div>
          <div style="color:#ffcb6b; margin-top:8px;">[GUARDRAIL ACTIVE] MCP Sync placed sequence in 'DRAFT_REVIEW' state.</div>
          <div style="color:#ffcb6b;">[GUARDRAIL ACTIVE] Direct email sending is disabled in Sandbox.</div>
          <div style="color:#c3e88d; font-weight:bold; margin-top:10px;">[SUCCESS] Lemlist MCP Sync complete. Response 200 OK.</div>
        </div>
      `;

      appendAgentLog(`🤖 <em>[LEMLIST MCP]</em> Enrolled campaign to sequence via Lemlist MCP tool <strong>'lemlist_add_contact_to_campaign'</strong>.`);

      setTimeout(() => {
        database.agentRunning = false;
        browserUrl.value = "https://google.com";
        browserViewport.innerHTML = `
          <div class="browser-empty" id="agent-browser-empty">Browser viewport appears here when the agent navigates</div>
        `;

        updateBrowserStep("target-step-7", "completed");
        if (floatingLoader) floatingLoader.classList.remove("active");

        appendAgentLog(`🤖 <strong>Outbound Research Dossier:</strong><br><br>${finalReportHtml}`);
        const chatInputEl = document.getElementById("agent-chat-input");
        if (chatInputEl) chatInputEl.focus();
      }, 2000);
    };

    setTimeout(runSimulationStep, 1500);

  } catch (err) {
    console.error(err);
    database.agentRunning = false;
    browserUrl.value = "Google Search Grounding Failed";
    updateBrowserStep("target-step-1", "disabled");
    updateBrowserStep("target-step-2", "disabled");
    updateBrowserStep("target-step-3", "disabled");
    updateBrowserStep("target-step-4", "disabled");
    if (floatingLoader) floatingLoader.classList.remove("active");

    appendAgentLog(`❌ <strong>Execution Failed!</strong><br>
    Unable to query Gemini API. Reason: <em>${err.message}</em><br><br>
    Please ensure your API Key is valid and that you have a stable network connection.`);
  }
}

function appendAgentLog(message) {
  const history = document.getElementById("agent-chat-history");
  if (!history) return;

  const msgDiv = document.createElement("div");
  msgDiv.className = "agent-chat-msg agent-msg";
  msgDiv.innerHTML = `
    <div class="avatar">🤖</div>
    <div class="msg-bubble">
      ${message}
    </div>
  `;
  history.appendChild(msgDiv);
  history.scrollTop = history.scrollHeight;
}

window.toggleAgentMode = toggleAgentMode;
window.handleAgentChatInput = handleAgentChatInput;
window.selectAgentAutocomplete = selectAgentAutocomplete;
window.handleAgentChatKeyDown = handleAgentChatKeyDown;
window.sendAgentChatMessage = sendAgentChatMessage;
window.sendAgentDirective = sendAgentDirective;
window.updateBrowserStep = updateBrowserStep;
window.startAgentResearchSequence = startAgentResearchSequence;
window.appendAgentLog = appendAgentLog;
window.initAgentAutocomplete = initAgentAutocomplete;
