// --- CLERK AUTHENTICATION CONTROLLER ---

function loadClerkSDK() {
  const pubKey = (window.ClerkConfig && window.ClerkConfig.publishableKey) || "";

  if (!pubKey || pubKey.includes("placeholder")) {
    console.log("[AUTH] Running in local offline mode (Clerk SDK bypassed).");
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

  const script = document.createElement("script");
  script.src = "https://cdn.jsdelivr.net/npm/@clerk/clerk-js@5/dist/clerk.browser.js";
  script.async = true;
  script.crossOrigin = "anonymous";
  script.setAttribute("data-clerk-publishable-key", pubKey);

  script.onload = () => {
    initClerkAuth(pubKey);
  };

  document.head.appendChild(script);
}

async function initClerkAuth(publishableKey) {
  if (!window.Clerk) {
    console.error("Clerk JS SDK script not resolved yet.");
    // Hide loader if Clerk fails to load script
    const loader = document.getElementById("app-loading-screen");
    if (loader) loader.remove();
    return;
  }

  try {
    await window.Clerk.load({
      publishableKey: publishableKey
    });

    // Listen to auth state transitions
    window.Clerk.addListener(({ user }) => {
      updateClerkUIState();
    });

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

  if (window.Clerk && window.Clerk.user) {
    // User is signed in via Clerk
    if (authGate) authGate.style.display = "none";
    if (mainApp) mainApp.style.display = "flex";

    if (signInBtn) signInBtn.style.display = "none";
    if (userProfileWrap) userProfileWrap.style.display = "flex";

    if (nameEl) nameEl.textContent = window.Clerk.user.fullName || window.Clerk.user.username || "Authenticated User";
    if (emailEl) emailEl.textContent = window.Clerk.user.primaryEmailAddress ? window.Clerk.user.primaryEmailAddress.emailAddress : "user@clerk.com";

    fetchClerkGoogleOAuthToken();
  } else if (!window.Clerk) {
    // Offline mode is available only when Clerk is not configured.
    if (authGate) authGate.style.display = "none";
    if (mainApp) mainApp.style.display = "flex";

    if (signInBtn) signInBtn.style.display = "block";
    if (userProfileWrap) userProfileWrap.style.display = "none";
    if (nameEl) nameEl.textContent = "GTM Operator";
    if (emailEl) emailEl.textContent = "demo@gtmconsole.internal";

  } else {
    // A configured Clerk instance must authenticate before the app is usable.
    if (authGate) authGate.style.display = "flex";
    if (mainApp) mainApp.style.display = "none";
    if (signInBtn) signInBtn.style.display = "block";
    if (userProfileWrap) userProfileWrap.style.display = "none";
    if (nameEl) nameEl.textContent = "Sign in required";
    if (emailEl) emailEl.textContent = "Authenticate to continue";

    if (signinContainer && signinContainer.dataset.mounted !== "true") {
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

  if (window.Clerk && window.Clerk.openSignIn) {
    try {
      window.Clerk.openSignIn({
        afterSignInUrl: window.location.href,
        afterSignUpUrl: window.location.href
      });
    } catch (e) {
      console.warn("Clerk openSignIn error:", e);
    }
  } else if (!window.Clerk) {
    if (authGate) authGate.style.display = "none";
    if (mainApp) mainApp.style.display = "flex";
  }
}

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

  // Role Restriction: Influencer accounts are locked to Influencer Portal
  if (currentRole === "Influencer / Creator") {
    if (typeof switchTab === "function") switchTab("influencer-portal");
  }
}

window.loadClerkSDK = loadClerkSDK;
window.initClerkAuth = initClerkAuth;
window.updateClerkUIState = updateClerkUIState;
window.triggerClerkSignIn = triggerClerkSignIn;
window.fetchClerkGoogleOAuthToken = fetchClerkGoogleOAuthToken;
window.setUserRole = setUserRole;
window.enforceRbacPermissions = enforceRbacPermissions;
