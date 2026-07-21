// --- CLERK AUTHENTICATION CONTROLLER ---

function loadClerkSDK() {
  const pubKey = (window.ClerkConfig && window.ClerkConfig.publishableKey) || "pk_test_placeholder_app_3FqQEx4A7KVzwjvvEh3hdo6Q5l5";

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
    // User is signed in: show app, hide login gate
    if (authGate) authGate.style.display = "none";
    if (mainApp) mainApp.style.display = "flex";

    if (signInBtn) signInBtn.style.display = "none";
    if (userProfileWrap) userProfileWrap.style.display = "flex";

    if (nameEl) nameEl.textContent = window.Clerk.user.fullName || window.Clerk.user.username || "Authenticated User";
    if (emailEl) emailEl.textContent = window.Clerk.user.primaryEmailAddress ? window.Clerk.user.primaryEmailAddress.emailAddress : "user@clerk.com";

    // Attempt to automatically retrieve Clerk Google OAuth Token for Calendar & Gmail
    fetchClerkGoogleOAuthToken();

    // Unmount signin widget if it was mounted
    if (signinContainer && signinContainer.dataset.mounted === "true") {
      try {
        window.Clerk.unmountSignIn(signinContainer);
      } catch (e) {
        console.warn("Error unmounting sign-in:", e);
      }
      signinContainer.dataset.mounted = "false";
      signinContainer.innerHTML = "";
    }

    // Mount user button inside sidebar (only once)
    if (userBtnContainer && userBtnContainer.dataset.mounted !== "true") {
      userBtnContainer.innerHTML = "";
      try {
        window.Clerk.mountUserButton(userBtnContainer);
        userBtnContainer.dataset.mounted = "true";
      } catch (e) {
        console.error("Error mounting user button:", e);
      }
    }
  } else {
    // User is signed out: hide app, show login gate
    if (mainApp) mainApp.style.display = "none";
    if (authGate) authGate.style.display = "flex";

    if (signInBtn) signInBtn.style.display = "block";
    if (userProfileWrap) userProfileWrap.style.display = "none";

    // Unmount user button if it was mounted
    if (userBtnContainer && userBtnContainer.dataset.mounted === "true") {
      try {
        window.Clerk.unmountUserButton(userBtnContainer);
      } catch (e) {
        console.warn("Error unmounting user button:", e);
      }
      userBtnContainer.dataset.mounted = "false";
      userBtnContainer.innerHTML = "";
    }

    // Mount the Clerk Sign-In Widget inside the Auth Gate Card (only once)
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
        console.error("Error mounting sign-in widget:", e);
      }
    }
  }
}

function triggerClerkSignIn() {
  if (window.Clerk) {
    window.Clerk.openSignIn({
      afterSignInUrl: window.location.href,
      afterSignUpUrl: window.location.href
    });
  }
}

async function fetchClerkGoogleOAuthToken() {
  if (window.Clerk && window.Clerk.user) {
    try {
      const tokens = await window.Clerk.user.getOauthAccessToken('oauth_google');
      if (tokens && tokens.length > 0 && tokens[0].token) {
        database.googleAccessToken = tokens[0].token;
        localStorage.setItem("gtm_google_access_token", tokens[0].token);
        if (typeof checkGoogleCalendarStatus === "function") {
          checkGoogleCalendarStatus();
        }
        addLogConsole("enrich", `[CLERK AUTH] Linked Google account session. Calendar & Gmail APIs connected!`, "success");
      }
    } catch (err) {
      // Quietly ignore if session is not signed in via Google OAuth provider
    }
  }
}

window.loadClerkSDK = loadClerkSDK;
window.initClerkAuth = initClerkAuth;
window.updateClerkUIState = updateClerkUIState;
window.triggerClerkSignIn = triggerClerkSignIn;
window.fetchClerkGoogleOAuthToken = fetchClerkGoogleOAuthToken;
