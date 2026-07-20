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

window.saveExploriumKey = saveExploriumKey;
window.saveLLMHelperKey = saveLLMHelperKey;
window.saveGeminiKey = saveGeminiKey;
window.saveGeminiModel = saveGeminiModel;
window.saveGeminiSearchGrounding = saveGeminiSearchGrounding;
window.syncExploriumKeyFromSettings = syncExploriumKeyFromSettings;
window.syncOpenAIKeyFromSettings = syncOpenAIKeyFromSettings;
window.saveLemlistMcpConfig = saveLemlistMcpConfig;
window.checkEnrichButtonState = checkEnrichButtonState;
window.togglePasswordVisibility = togglePasswordVisibility;
window.saveLLMSettings = saveLLMSettings;
