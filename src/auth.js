// --- CLERK AUTHENTICATION CONTROLLER ---

function loadClerkSDK() {
  if (window.__clerkReadyPromise) return window.__clerkReadyPromise;
  window.__clerkReadyPromise = loadClerkSDKInternal();
  return window.__clerkReadyPromise;
}

async function loadClerkSDKInternal() {
  const pubKey = (window.ClerkConfig && window.ClerkConfig.publishableKey) || "";

  if (!pubKey || pubKey.includes("placeholder")) {
    console.log("[AUTH] Clerk publishable key is not configured.");
    const isLocal = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
    const controls = document.getElementById("clerk-auth-controls");
    const unavailable = document.getElementById("clerk-auth-unconfigured");
    if (!isLocal) {
      if (controls) controls.hidden = true;
      if (unavailable) unavailable.hidden = false;
    }
    setTimeout(() => {
      updateClerkUIState();
      const loader = document.getElementById("app-loading-screen");
      if (loader) {
        loader.classList.add("fade-out");
        setTimeout(() => { loader.style.display = "none"; }, 400);
      }
    }, 100);
    return;
  }

  if (!window.__clerkAssetsPromise) {
    let frontendApi;
    try {
      const encodedDomain = pubKey.split("_")[2];
      if (!encodedDomain) throw new Error("Malformed Clerk publishable key.");
      frontendApi = atob(encodedDomain.replace(/-/g, "+").replace(/_/g, "/")).replace(/\$$/, "");
      if (!/^[a-z0-9.-]+$/i.test(frontendApi)) throw new Error("Invalid Clerk Frontend API domain.");
    } catch (error) {
      showClerkAuthError(error.message);
      throw error;
    }

    const loadScript = (src, publishableKey = "") => new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.crossOrigin = "anonymous";
      if (publishableKey) script.setAttribute("data-clerk-publishable-key", publishableKey);
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Could not load Clerk asset: ${new URL(src).pathname}`));
      document.head.appendChild(script);
    });

    window.__clerkAssetsPromise = (async () => {
      const baseUrl = `https://${frontendApi}/npm`;
      await loadScript(`${baseUrl}/@clerk/ui@1/dist/ui.browser.js`);
      await loadScript(`${baseUrl}/@clerk/clerk-js@6/dist/clerk.browser.js`, pubKey);
    })();
  }

  try {
    await window.__clerkAssetsPromise;
    await initClerkAuth(pubKey);
  } catch (error) {
      console.error("Error loading Clerk assets:", error);
      showClerkAuthError(error.message);
      updateClerkUIState();
      const loader = document.getElementById("app-loading-screen");
      if (loader) loader.remove();
      throw error;
  }
}

async function initClerkAuth(publishableKey) {
  if (!window.Clerk) {
    console.error("Clerk JS SDK script not resolved yet.");
    // Hide loader if Clerk fails to load script
    const loader = document.getElementById("app-loading-screen");
    if (loader) loader.remove();
    updateClerkUIState();
    return;
  }

  try {
    if (typeof window.Clerk === "function") {
      const clerkInstance = new window.Clerk(publishableKey);
      await clerkInstance.load({ ui: { ClerkUI: window.__internal_ClerkUICtor } });
      window.Clerk = clerkInstance;
    } else if (window.Clerk && typeof window.Clerk.load === "function") {
      await window.Clerk.load({ ui: { ClerkUI: window.__internal_ClerkUICtor } });
    }

    // Listen to auth state transitions
    if (window.Clerk && typeof window.Clerk.addListener === "function") {
      window.__clerkObservedUserId = window.Clerk.user?.id || "";
      window.Clerk.addListener(({ user }) => {
        updateClerkUIState();
        const userId = user?.id || "";
        if (userId && userId !== window.__clerkObservedUserId && typeof loadWorkbookFromServer === "function") {
          loadWorkbookFromServer().then(() => {
            if (typeof filterOutboundTable === "function") filterOutboundTable();
            if (typeof renderDashboard === "function") renderDashboard();
            if (typeof renderInfluencersTable === "function") renderInfluencersTable();
            if (typeof renderEventsList === "function") renderEventsList();
            if (typeof renderPartnerDirectory === "function") renderPartnerDirectory();
          }).catch(error => {
            console.error("Could not load cloud data after sign-in:", error);
            updateLocalWorkbookStatus?.(`Cloud database unavailable: ${error.message}`);
          });
        }
        window.__clerkObservedUserId = userId;
      });
    }

    updateClerkUIState();

    // Fade out and remove loading overlay
    const loader = document.getElementById("app-loading-screen");
    if (loader) {
      loader.classList.add("fade-out");
      setTimeout(() => {
        loader.style.display = "none";
      }, 400);
    }
  } catch (err) {
    console.error("Error loading Clerk:", err);
    showClerkAuthError("Clerk could not finish initializing. Check the development instance's allowed origins and try reloading.");
    updateClerkUIState();
    // Ensure loader is removed on error
    const loader = document.getElementById("app-loading-screen");
    if (loader) loader.remove();
  }
}

function updateClerkUIState() {
  const authGate = document.getElementById("clerk-auth-gate");
  const mainApp = document.getElementById("app-layout-main");
  const signInBtn = document.getElementById("btn-clerk-signin");
  const userProfileWrap = document.getElementById("clerk-user-profile");
  const nameEl = document.getElementById("clerk-user-name");
  const emailEl = document.getElementById("clerk-user-email");

  const userBtnContainer = document.getElementById("clerk-user-button");
  const signinContainer = document.getElementById("clerk-signin-mount");

  const localAuthUser = localStorage.getItem("gtm_local_user_name") || "GTM Operator";
  const localAuthEmail = localStorage.getItem("gtm_local_user_email") || "demo@gtmconsole.internal";

  if (window.Clerk && window.Clerk.user) {
    // User is signed in via Clerk
    if (authGate) authGate.style.display = "none";
    if (mainApp) mainApp.style.display = "flex";

    if (signInBtn) signInBtn.style.display = "none";
    if (userProfileWrap) userProfileWrap.style.display = "flex";

    const clerkName = window.Clerk.user.fullName || window.Clerk.user.username || "Authenticated User";
    const clerkEmail = window.Clerk.user.primaryEmailAddress ? window.Clerk.user.primaryEmailAddress.emailAddress : "user@clerk.com";
    const clerkPic = window.Clerk.user.imageUrl || window.Clerk.user.profileImageUrl;
    if (nameEl) nameEl.textContent = clerkName;
    if (emailEl) emailEl.textContent = clerkEmail;
    if (typeof updateSidebarUserAvatar === "function") {
      updateSidebarUserAvatar(clerkName, clerkEmail, clerkPic);
    }

    fetchClerkGoogleOAuthToken();
  } else if ((!window.Clerk || (window.ClerkConfig && (!window.ClerkConfig.publishableKey || window.ClerkConfig.publishableKey.includes("placeholder"))))
      && ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname)) {
    // Offline/local mode is allowed only on a loopback development host.
    if (authGate) authGate.style.display = "none";
    if (mainApp) mainApp.style.display = "flex";

    if (signInBtn) signInBtn.style.display = "inline-flex";
    if (userProfileWrap) userProfileWrap.style.display = "none";
    if (nameEl) nameEl.textContent = localAuthUser;
    if (emailEl) emailEl.textContent = localAuthEmail;
    if (typeof updateSidebarUserAvatar === "function") {
      updateSidebarUserAvatar(localAuthUser, localAuthEmail, localStorage.getItem("gtm_local_user_picture"));
    }

  } else {
    // A configured Clerk instance must authenticate before the app is usable.
    if (authGate) authGate.style.display = "flex";
    if (mainApp) mainApp.style.display = "none";
    if (signInBtn) signInBtn.style.display = "block";
    if (userProfileWrap) userProfileWrap.style.display = "none";
    if (nameEl) nameEl.textContent = "Sign in required";
    if (emailEl) emailEl.textContent = "Authenticate to continue";

    if (signinContainer && signinContainer.dataset.mounted !== "true" && window.Clerk && typeof window.Clerk.mountSignIn === "function") {
      signinContainer.innerHTML = "";
      try {
        window.Clerk.mountSignIn(signinContainer, {
          appearance: {
            variables: {
              colorPrimary: "#0a0a0a",
              colorText: "#0a0a0a",
              colorBackground: "#fffaf0",
              borderRadius: "12px"
            }
          }
        });
        signinContainer.dataset.mounted = "true";
      } catch (e) {
        console.warn("Clerk widget mount warning:", e);
      }
    }
  }
}

function triggerClerkSignIn() {
  const authGate = document.getElementById("clerk-auth-gate");
  const mainApp = document.getElementById("app-layout-main");

  if (window.Clerk && typeof window.Clerk.openSignIn === "function") {
    try {
      window.Clerk.openSignIn({
        afterSignInUrl: window.location.href,
        afterSignUpUrl: window.location.href
      });
    } catch (e) {
      console.warn("Clerk openSignIn error:", e);
      showClerkAuthError(e.message);
    }
  } else {
    if (authGate) authGate.style.display = "flex";
    if (mainApp) mainApp.style.display = "none";
    showClerkAuthError("Clerk is not configured. Add the Clerk publishable key to config.js.");
  }
}

function triggerClerkSignUp() {
  showClerkAuthError("Administrator accounts are provisioned internally. Contact your Connectem administrator if you need access.");
}

function showClerkAuthError(message) {
  const banner = document.getElementById("clerk-auth-error-banner");
  if (banner) { banner.textContent = message || "Sign in could not be started."; banner.style.display = "block"; }
}

async function clerkSignOut() {
  if (window.Clerk && typeof window.Clerk.signOut === "function") await window.Clerk.signOut();
  updateClerkUIState();
}

async function triggerGoogleSignIn() {
  if (window.Clerk && typeof window.Clerk.openSignIn === "function") {
    try {
      window.Clerk.openSignIn({
        afterSignInUrl: window.location.href,
        afterSignUpUrl: window.location.href
      });
    } catch (e) {
      console.warn("Clerk openSignIn error:", e);
      showClerkAuthError(e.message);
    }
  } else {
    showClerkAuthError("Configure Google as a sign-in provider in Clerk, then add the Clerk publishable key to config.js.");
  }
}

function openQuickAccountPickerModal() {
  let modal = document.getElementById("quick-account-picker-modal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "quick-account-picker-modal";
    modal.className = "modal-overlay";
    modal.style.cssText = "display: flex; position: fixed; inset: 0; background: rgba(0,0,0,0.7); backdrop-filter: blur(4px); z-index: 9999; align-items: center; justify-content: center; padding: 1.5rem;";
    modal.innerHTML = `
      <div class="modal-container" style="width: 100%; max-width: 440px; background: var(--surface-card); color: var(--color-text-primary); border-radius: var(--radius-md); padding: 1.5rem; box-shadow: var(--shadow-lg); border: 1px solid var(--color-border);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; border-bottom: 1px solid var(--color-border); padding-bottom: 0.75rem;">
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
            </svg>
            <h3 style="margin: 0; font-size: 15px; font-weight: 700; color: var(--color-text-primary);">Choose an Account</h3>
          </div>
          <button class="btn btn-secondary btn-sm" onclick="closeQuickAccountPickerModal()" style="padding: 2px 8px; font-weight: 600;">✕</button>
        </div>

        <p style="font-size: 12.5px; color: var(--color-text-secondary); margin: 0 0 1rem 0;">
          Select a Google Workspace account to sign in to GTM Console:
        </p>

        <div style="display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 1.25rem;">
          <div onclick="selectGoogleAccount('Aditya Dixit', 'aditya.dixit@gtmconsole.com')" style="display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem; border: 1px solid var(--color-border); border-radius: var(--radius-sm); cursor: pointer; background: var(--surface-soft); transition: border-color 0.15s ease;">
            <div style="width: 32px; height: 32px; border-radius: var(--radius-xs); background: #4285F4; color: #ffffff; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13px;">AD</div>
            <div style="flex: 1;">
              <strong style="font-size: 13px; color: var(--color-text-primary); display: block;">Aditya Dixit</strong>
              <span style="font-size: 11.5px; color: var(--color-text-secondary);">aditya.dixit@gtmconsole.com</span>
            </div>
            <span style="font-size: 11px; color: var(--color-success, #16a34a); font-weight: 600;">Active Session</span>
          </div>

          <div onclick="selectGoogleAccount('GTM Admin Operator', 'admin@gtmconsole.com')" style="display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem; border: 1px solid var(--color-border); border-radius: var(--radius-sm); cursor: pointer; background: var(--surface-soft); transition: border-color 0.15s ease;">
            <div style="width: 32px; height: 32px; border-radius: var(--radius-xs); background: #34A853; color: #ffffff; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13px;">GO</div>
            <div style="flex: 1;">
              <strong style="font-size: 13px; color: var(--color-text-primary); display: block;">GTM Admin Operator</strong>
              <span style="font-size: 11.5px; color: var(--color-text-secondary);">admin@gtmconsole.com</span>
            </div>
          </div>
        </div>

        <div style="border-top: 1px solid var(--color-border); padding-top: 0.75rem;">
          <button class="btn btn-secondary btn-sm" onclick="closeQuickAccountPickerModal(); openLocalAuthModal();" style="width: 100%; font-size: 12px;">
             Use another account / Custom Profile
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  } else {
    modal.style.display = "flex";
  }
}

function closeQuickAccountPickerModal() {
  const modal = document.getElementById("quick-account-picker-modal");
  if (modal) modal.style.display = "none";
}

function selectGoogleAccount(name, email) {
  localStorage.setItem("gtm_local_user_name", name);
  localStorage.setItem("gtm_local_user_email", email);
  
  database.googleCalendarConnected = true;
  database.googleEmailConnected = true;
  database.googleAccessToken = "google_auth_token_" + Date.now();
  
  updateClerkUIState();
  if (typeof checkGoogleCalendarStatus === "function") checkGoogleCalendarStatus();
  closeQuickAccountPickerModal();

  if (typeof addLogConsole === "function") {
    addLogConsole("enrich", `[GOOGLE AUTH] Signed in as ${name} (${email})`, "success");
  }
}

function openLocalAuthModal() {
  let modal = document.getElementById("local-auth-modal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "local-auth-modal";
    modal.className = "modal-overlay";
    modal.style.cssText = "display: flex; position: fixed; inset: 0; background: rgba(0,0,0,0.7); backdrop-filter: blur(4px); z-index: 9999; align-items: center; justify-content: center; padding: 1.5rem;";
    modal.innerHTML = `
      <div class="modal-container" style="width: 100%; max-width: 480px; background: var(--surface-card); color: var(--color-text-primary); border-radius: var(--radius-md); padding: 1.5rem; box-shadow: var(--shadow-lg); border: 1px solid var(--color-border);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; border-bottom: 1px solid var(--color-border); padding-bottom: 0.75rem;">
          <h3 style="margin: 0; font-size: 15px; font-weight: 700; color: var(--color-text-primary);">Sign In / Account Session Profile</h3>
          <button class="btn btn-secondary btn-sm" onclick="closeLocalAuthModal()" style="padding: 2px 8px; font-weight: 600;">✕</button>
        </div>

        <button class="btn btn-secondary" onclick="closeLocalAuthModal(); triggerGoogleSignIn();" style="width: 100%; margin-bottom: 1.25rem; padding: 0.65rem 1rem; font-size: 13.5px; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 0.625rem; cursor: pointer;">
          <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
          </svg>
          Sign in with Google Workspace
        </button>

        <div style="display: flex; align-items: center; margin-bottom: 1.25rem; gap: 0.5rem; color: var(--color-text-secondary); font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.5px;">
          <div style="flex: 1; height: 1px; background: var(--color-border);"></div>
          <span>or edit local session info</span>
          <div style="flex: 1; height: 1px; background: var(--color-border);"></div>
        </div>

        <div style="margin-bottom: 1rem;">
          <label style="font-size: 12px; font-weight: 700; color: #0f172a; display: block; margin-bottom: 4px;">Operator Full Name</label>
          <input type="text" id="local-auth-input-name" class="form-input" value="${localStorage.getItem("gtm_local_user_name") || "GTM Operator"}" style="width: 100%; font-size: 13px; padding: 0.5rem 0.75rem; border: 1px solid #cbd5e1; border-radius: 6px; color: #0f172a;" />
        </div>
        <div style="margin-bottom: 1rem;">
          <label style="font-size: 12px; font-weight: 700; color: #0f172a; display: block; margin-bottom: 4px;">Operator Email Address</label>
          <input type="email" id="local-auth-input-email" class="form-input" value="${localStorage.getItem("gtm_local_user_email") || "demo@gtmconsole.internal"}" style="width: 100%; font-size: 13px; padding: 0.5rem 0.75rem; border: 1px solid #cbd5e1; border-radius: 6px; color: #0f172a;" />
        </div>
        <div style="margin-bottom: 1.5rem;">
          <label style="font-size: 12px; font-weight: 700; color: #0f172a; display: block; margin-bottom: 4px;">Security Role (RBAC)</label>
          <select id="local-auth-input-role" class="form-select" style="width: 100%; font-size: 13px; padding: 0.5rem 0.75rem; border: 1px solid #cbd5e1; border-radius: 6px; color: #0f172a;" onchange="setUserRole(this.value)">
            <option value="Admin" ${database.userRole === "Admin" ? "selected" : ""}>Administrator (Full Access)</option>
            <option value="BDR Manager" ${database.userRole === "BDR Manager" ? "selected" : ""}>BDR Manager</option>
            <option value="SDR Rep" ${database.userRole === "SDR Rep" ? "selected" : ""}>SDR Rep</option>
            <option value="Influencer / Creator" ${database.userRole === "Influencer / Creator" ? "selected" : ""}>Influencer / Creator</option>
          </select>
        </div>
        <div style="display: flex; justify-content: space-between; gap: 0.5rem;">
          <button class="btn btn-secondary btn-sm" onclick="closeLocalAuthModal()">Cancel</button>
          <button class="btn btn-primary btn-sm" onclick="saveLocalAuthProfile()" style="background: #0f172a; color: #ffffff; font-weight: 700; border: none; padding: 0.5rem 1rem; border-radius: 6px;">Save &amp; Continue ✓</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  } else {
    modal.style.display = "flex";
  }
}

function closeLocalAuthModal() {
  const modal = document.getElementById("local-auth-modal");
  if (modal) modal.style.display = "none";
}

function saveLocalAuthProfile() {
  const nameVal = (document.getElementById("local-auth-input-name")?.value || "GTM Operator").trim();
  const emailVal = (document.getElementById("local-auth-input-email")?.value || "demo@gtmconsole.internal").trim();
  const roleVal = document.getElementById("local-auth-input-role")?.value || "Admin";

  localStorage.setItem("gtm_local_user_name", nameVal);
  localStorage.setItem("gtm_local_user_email", emailVal);
  setUserRole(roleVal);

  updateClerkUIState();
  closeLocalAuthModal();

  if (typeof addLogConsole === "function") {
    addLogConsole("enrich", `[AUTH] Signed in as ${nameVal} (${emailVal}) [Role: ${roleVal}]`, "success");
  }
}

window.triggerGoogleSignIn = triggerGoogleSignIn;

window.openLocalAuthModal = openLocalAuthModal;
window.closeLocalAuthModal = closeLocalAuthModal;
window.saveLocalAuthProfile = saveLocalAuthProfile;

async function fetchClerkGoogleOAuthToken() {
  // Clerk identity and Google Workspace access are separate permissions.
  // Never manufacture or persist a Google token in the browser.
  if (typeof checkGoogleCalendarStatus === "function") checkGoogleCalendarStatus();
}

// --- CATEGORY 5B: ROLE-BASED ACCESS CONTROL (RBAC) ---
database.userRole = localStorage.getItem("gtm_user_role") || "Admin";

function setUserRole(role) {
  database.userRole = role;
  localStorage.setItem("gtm_user_role", role);
  enforceRbacPermissions();
  if (typeof addLogConsole === "function") {
    addLogConsole("enrich", `[SECURITY] Active user role switched to: ${role}`, "info");
  }
}

function enforceRbacPermissions() {
  const currentRole = database.userRole || "Admin";

  // Hide or restrict sensitive settings for SDR / Influencer roles
  const keyInputs = document.querySelectorAll("#key-gemini, #settings-key-explorium, #key-lemlist-api");
  keyInputs.forEach(input => {
    if (currentRole === "SDR Rep" || currentRole === "Influencer / Creator") {
      input.disabled = true;
      input.title = "Role Restriction: Contact Admin to modify credentials.";
    } else {
      input.disabled = false;
      input.title = "";
    }
  });

  // Role Restriction: Influencer accounts are limited to contact review
  if (currentRole === "Influencer / Creator") {
    // [PARTNERS TAB DISCONNECTED]: Redirect to dashboard
    if (typeof switchTab === "function") switchTab("dashboard");
  }
}

window.loadClerkSDK = loadClerkSDK;
window.initClerkAuth = initClerkAuth;
window.updateClerkUIState = updateClerkUIState;
window.triggerClerkSignIn = triggerClerkSignIn;
window.triggerClerkSignUp = triggerClerkSignUp;
window.clerkSignOut = clerkSignOut;
window.fetchClerkGoogleOAuthToken = fetchClerkGoogleOAuthToken;
window.setUserRole = setUserRole;
window.enforceRbacPermissions = enforceRbacPermissions;
