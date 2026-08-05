// --- ANALYTICS CHATBOT CONTROLLER ---
// Note: addLogConsole is defined in database.js (shared utility)

async function sendAnalyseChatMessage() {
  const input = document.getElementById("analyse-chat-input");
  if (!input || !input.value.trim()) return;

  const query = input.value.trim();
  input.value = "";

  appendAnalyseMessage("user", query);

  // Show loading
  const loadingId = appendAnalyseMessage("bot", "Analyzing data, please hold...", true);

  // Run analytic query
  setTimeout(async () => {
    const answer = await processAnalyseQuery(query);
    removeAnalyseLoading(loadingId, answer);
  }, 600);
}

function sendSuggestedQuery(text) {
  const input = document.getElementById("analyse-chat-input");
  if (input) {
    input.value = text;
    sendAnalyseChatMessage();
  }
}

function appendAnalyseMessage(sender, text, isLoading = false) {
  const container = document.getElementById("analyse-chat-messages");
  if (!container) return "";

  const wrapper = document.createElement("div");
  wrapper.className = `chat-message-row ${sender}`;
  wrapper.style = "display: flex; gap: 10px; align-items: flex-start; margin-bottom: 12px;";
  if (sender === "user") {
    wrapper.style.justifyContent = "flex-end";
    wrapper.style.flexDirection = "row-reverse";
  }

  const avatar = document.createElement("div");
  avatar.className = "chat-avatar";
  avatar.style = "width: 30px; height: 30px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.15); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; flex-shrink: 0; background: rgba(255,255,255,0.08); color: var(--on-dark); box-shadow: 1.5px 1.5px 0 rgba(0,0,0,0.15);";
  
  if (sender === "user") {
    const userFullName = (window.Clerk && window.Clerk.user && window.Clerk.user.fullName) || "GTM Operator";
    avatar.innerText = getInitials(userFullName);
    avatar.style.background = "var(--primary)";
    avatar.style.color = "#ffffff";
    avatar.style.borderColor = "var(--primary-active)";
  } else {
    avatar.innerText = "🤖";
  }

  const bubble = document.createElement("div");
  const msgId = "msg-" + Math.random().toString(36).slice(2, 9);
  bubble.id = msgId;
  bubble.className = `chat-bubble ${sender}`;
  bubble.innerHTML = text;

  wrapper.appendChild(avatar);
  wrapper.appendChild(bubble);

  container.appendChild(wrapper);
  container.scrollTop = container.scrollHeight;
  return msgId;
}

function removeAnalyseLoading(msgId, finalText) {
  const el = document.getElementById(msgId);
  if (el) {
    el.innerHTML = finalText;
    const container = document.getElementById("analyse-chat-messages");
    if (container) container.scrollTop = container.scrollHeight;
  }
}

// Fast analytics search engine
async function processAnalyseQuery(query) {
  if (database.contacts.length === 0) {
    return "The database is empty. Please go to the <strong>Upload</strong> tab and load your list database first.";
  }

  const q = query.toLowerCase();

  // 1. Total records count
  if (q.includes("how many total") || q.includes("total contacts") || q.includes("how many contacts") || q.includes("how many rows")) {
    return `There are exactly <strong>${database.contacts.length.toLocaleString()}</strong> contacts loaded in the active GTM pipeline database.`;
  }

  // 2. CIO/CTO/IT roles filter
  if (q.includes("cio") || q.includes("cto") || q.includes("it director") || q.includes("project manager") || q.includes("vp of tech") || q.includes("job title")) {
    const cios = database.contacts.filter(c => {
      const j = c.jobTitle.toLowerCase();
      return j.includes("cio") || j.includes("cto") || j.includes("technology") || j.includes("it") || j.includes("data") || j.includes("analytics") || j.includes("project management") || j.includes("president") || j.includes("ceo");
    });
    return `Found <strong>${cios.length.toLocaleString()}</strong> contacts matching technology leadership roles (President, CEO, CIO, CTO, VP of IT/Technology, VP of Data/Analytics, or VP of Project Management) in the CSV.`;
  }

  // 3. Industry breakdown
  if (q.includes("industry") || q.includes("industries") || q.includes("breakdown of industry")) {
    const counts = {};
    database.contacts.forEach(c => {
      const ind = c.industry || "Unknown";
      counts[ind] = (counts[ind] || 0) + 1;
    });
    let result = "<strong>Target Industry Distribution:</strong><br><br>";
    Object.keys(counts).sort((a, b) => counts[b] - counts[a]).slice(0, 5).forEach(k => {
      result += `- <strong>${k}:</strong> ${counts[k].toLocaleString()} contacts (${((counts[k] / database.contacts.length) * 100).toFixed(1)}%)<br>`;
    });
    return result;
  }

  // 4. Asset sizes
  if (q.includes("asset size") || q.includes("average asset") || q.includes("assets")) {
    const assets = database.contacts.map(c => {
      if (!c.assetSize) return null;
      // Extract numeric value (e.g. $1,240,500 or 123456)
      const num = parseFloat(c.assetSize.replace(/[^0-9.]/g, ""));
      return isNaN(num) ? null : num;
    }).filter(Boolean);

    if (assets.length === 0) {
      return "The loaded CSV does not contain standard numeric Asset Size records for evaluation.";
    }

    const avg = assets.reduce((sum, val) => sum + val, 0) / assets.length;
    const maxVal = Math.max(...assets);

    return `Calculated asset size parameters for target organizations:<br><br>` +
      `- <strong>Reporting contacts:</strong> ${assets.length.toLocaleString()} companies<br>` +
      `- <strong>Average asset size:</strong> $${Math.round(avg).toLocaleString()}<br>` +
      `- <strong>Max asset organization:</strong> $${maxVal.toLocaleString()}`;
  }

  // 5. States density
  if (q.includes("states") || q.includes("state") || q.includes("michigan")) {
    const states = {};
    database.contacts.forEach(c => {
      if (c.state && c.state.trim() !== "N/A" && c.state.trim() !== "") {
        const s = c.state.trim().toUpperCase();
        states[s] = (states[s] || 0) + 1;
      }
    });

    const sortedStates = Object.keys(states).sort((a, b) => states[b] - states[a]);
    if (sortedStates.length === 0) {
      return "No geographical state properties found in the current sheet columns.";
    }

    let result = "<strong>Top Targeted States Density:</strong><br><br>";
    sortedStates.slice(0, 6).forEach(k => {
      result += `- <strong>${k}:</strong> ${states[k].toLocaleString()} contacts<br>`;
    });
    return result;
  }

  // 6. Attended dinners / Visited booth
  if (q.includes("attended") || q.includes("dinner") || q.includes("booth") || q.includes("visited")) {
    return `<strong>Campaign Event Attendees Analysis:</strong><br><br>` +
      `- <strong>GAC 2023 Dinner Attendees:</strong> ${database.events.gac_dinner.length} contacts mapped.<br>` +
      `- <strong>SymWest 2026 Booth Visitors:</strong> ${database.events.symwest_booth.length} contacts mapped.`;
  }

  // 7. General fallback: Ask LLM helper if configured
  if (database.llmHelperKey) {
    try {
      const summary = {
        totalRecords: database.contacts.length,
        topIndustries: Object.entries(database.contacts.reduce((acc, c) => ({ ...acc, [c.industry]: (acc[c.industry] || 0) + 1 }), {})).sort((a, b) => b[1] - a[1]).slice(0, 3),
        topJobTitles: Object.entries(database.contacts.reduce((acc, c) => ({ ...acc, [c.jobTitle]: (acc[c.jobTitle] || 0) + 1 }), {})).sort((a, b) => b[1] - a[1]).slice(0, 5),
        sampleStates: Object.keys(database.contacts.reduce((acc, c) => ({ ...acc, [c.state]: 1 }), {})).slice(0, 8).filter(Boolean)
      };

      const prompt = `You are a helpful B2B data analyst. You are answering a question about a GTM prospect list.
The list has:
- Total contacts: ${summary.totalRecords}
- Top industries: ${JSON.stringify(summary.topIndustries)}
- Top job titles: ${JSON.stringify(summary.topJobTitles)}
- Targeted states include: ${JSON.stringify(summary.sampleStates)}

Question: ${query}

Write a natural, helpful, and concise response in markdown table/bullet form directly answering the query based on this metadata.`;

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${database.llmHelperKey}`
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: "You are a helpful GTM campaign assistant." },
            { role: "user", content: prompt }
          ]
        })
      });

      if (response.ok) {
        const json = await response.json();
        return json.choices[0].message.content.replace(/\n/g, "<br>");
      } else {
        const error = await response.text();
        console.error(error);
        return `[LLM Error] API request returned status ${response.status}. Falling back to default list diagnostics.`;
      }
    } catch (err) {
      console.error(err);
      return `Failed to invoke the LLM integration for custom querying. Check your network or API key configs.`;
    }
  }

  return `I recognize the query, but I need an LLM API key for non-standard queries. Based on local processing, we have loaded <strong>${database.contacts.length.toLocaleString()}</strong> contacts. Try querying role keywords like "CIO" or stats like "asset size".`;
}

// --- CATEGORY 5A: FULL-FUNNEL ATTRIBUTION SEGMENT FILTER ---
function filterFunnelSegment(segment) {
  const bar1 = document.getElementById("funnel-bar-1");
  const bar2 = document.getElementById("funnel-bar-2");
  const bar3 = document.getElementById("funnel-bar-3");
  const bar4 = document.getElementById("funnel-bar-4");
  const bar5 = document.getElementById("funnel-bar-5");
  const bar6 = document.getElementById("funnel-bar-6");
  if (!bar1) return;

  const filters = {
    "credit-union": contact => /credit union/i.test(contact.industry || contact.company || ""),
    banking: contact => /bank/i.test(contact.industry || contact.company || ""),
    insurance: contact => /insurance/i.test(contact.industry || contact.company || ""),
    all: () => true
  };
  const contacts = (database.contacts || []).filter(filters[segment] || filters.all);
  const total = contacts.length;
  const pct = value => total ? Math.round((value / total) * 100) : 0;
  const enriched = contacts.filter(c => c.enriched).length;
  const intent = contacts.filter(c => Number(c.matchPercentage || 0) >= 80 || c.leadTemp === "Hot Lead").length;
  const outbound = contacts.filter(c => c.emailsSent || c.linkedinSent).length;
  const replied = contacts.filter(c => Array.isArray(c.replyHistory) && c.replyHistory.length > 0).length;
  const booked = (database.meetings || []).filter(meeting => contacts.some(c => c.email === meeting.contactEmail)).length;
  const choice = {
    b1: `${pct(total)}%`, t1: `${total.toLocaleString()} Accounts (${pct(total)}%)`,
    b2: `${pct(enriched)}%`, t2: `${enriched.toLocaleString()} Enriched (${pct(enriched)}%)`,
    b3: `${pct(intent)}%`, t3: `${intent.toLocaleString()} Intent Scored (${pct(intent)}%)`,
    b4: `${pct(outbound)}%`, t4: `${outbound.toLocaleString()} Dispatched (${pct(outbound)}%)`,
    b5: `${pct(replied)}%`, t5: `${replied.toLocaleString()} Replies (${pct(replied)}%)`,
    b6: `${pct(booked)}%`, t6: `${booked.toLocaleString()} Meetings (${pct(booked)}%)`
  };
  bar1.style.width = choice.b1; bar1.textContent = choice.t1;
  bar2.style.width = choice.b2; bar2.textContent = choice.t2;
  bar3.style.width = choice.b3; bar3.textContent = choice.t3;
  bar4.style.width = choice.b4; bar4.textContent = choice.t4;
  bar5.style.width = choice.b5; bar5.textContent = choice.t5;
  bar6.style.width = choice.b6; bar6.textContent = choice.t6;
}

window.sendAnalyseChatMessage = sendAnalyseChatMessage;
window.sendSuggestedQuery = sendSuggestedQuery;
window.appendAnalyseMessage = appendAnalyseMessage;
window.removeAnalyseLoading = removeAnalyseLoading;
window.processAnalyseQuery = processAnalyseQuery;
window.filterFunnelSegment = filterFunnelSegment;
