// --- FIREBASE AUTHENTICATION ENGINE ---

let firebaseAuthInstance = null;

function initFirebaseAuth() {
  if (typeof firebase === "undefined" || !firebase.auth) {
    console.warn("[FIREBASE AUTH] Firebase JS SDK scripts not loaded yet. Waiting...");
    return;
  }

  const savedApiKey = localStorage.getItem("gtm_firebase_api_key");
  const savedAuthDomain = localStorage.getItem("gtm_firebase_auth_domain");
  const savedProjectId = localStorage.getItem("gtm_firebase_project_id");

  const defaultConfig = window.FirebaseConfig || {
    apiKey: "AIzaSyAlCR4PGybj3pgudpAEc1TgJ_8DwAicnA8",
    authDomain: "auth-bdr.firebaseapp.com",
    projectId: "auth-bdr",
    storageBucket: "auth-bdr.firebasestorage.app",
    messagingSenderId: "606984570287",
    appId: "1:606984570287:web:57745476f12046fc6d9b5a",
    measurementId: "G-ZCX6B0FQ1H"
  };

  const config = {
    ...defaultConfig,
    apiKey: savedApiKey || defaultConfig.apiKey,
    authDomain: savedAuthDomain || defaultConfig.authDomain,
    projectId: savedProjectId || defaultConfig.projectId
  };

  try {
    if (!firebase.apps.length) {
      firebase.initializeApp(config);
    }
    firebaseAuthInstance = firebase.auth();

    // Listen to real-time auth state changes
    firebaseAuthInstance.onAuthStateChanged((user) => {
      updateFirebaseAuthUI(user);
    });

    console.log("[FIREBASE AUTH] Connected to Firebase project:", config.projectId);
  } catch (err) {
    console.error("[FIREBASE AUTH] Initialization error:", err);
  }
}

function updateFirebaseAuthUI(user) {
  const authGate = document.getElementById("clerk-auth-gate");
  const mainApp = document.getElementById("app-layout-main");
  const nameEl = document.getElementById("clerk-user-name");
  const emailEl = document.getElementById("clerk-user-email");
  const signInBtn = document.getElementById("btn-clerk-signin");
  const userProfileWrap = document.getElementById("clerk-user-profile");

  if (user) {
    // User is signed in with Firebase
    const displayName = user.displayName || user.email.split("@")[0];
    const email = user.email;

    localStorage.setItem("gtm_local_user_name", displayName);
    localStorage.setItem("gtm_local_user_email", email);
    if (user.photoURL) localStorage.setItem("gtm_local_user_picture", user.photoURL);

    if (authGate) authGate.style.display = "none";
    if (mainApp) mainApp.style.display = "flex";

    if (signInBtn) signInBtn.style.display = "none";
    if (userProfileWrap) userProfileWrap.style.display = "flex";

    if (nameEl) nameEl.textContent = displayName;
    if (emailEl) emailEl.textContent = email;

    if (typeof addLogConsole === "function") {
      addLogConsole("enrich", `[FIREBASE AUTH] Logged in as ${displayName} (${email}) [UID: ${user.uid}]`, "success");
    }
  } else {
    // User is signed out - check if running local single-user mode or auth gate
    const localUser = localStorage.getItem("gtm_local_user_name");
    const localEmail = localStorage.getItem("gtm_local_user_email");

    if (localUser && localEmail) {
      if (authGate) authGate.style.display = "none";
      if (mainApp) mainApp.style.display = "flex";

      if (signInBtn) signInBtn.style.display = "flex";
      if (userProfileWrap) userProfileWrap.style.display = "flex";
      if (nameEl) nameEl.textContent = localUser;
      if (emailEl) emailEl.textContent = localEmail;
    } else {
      if (authGate) authGate.style.display = "flex";
      if (mainApp) mainApp.style.display = "none";

      if (signInBtn) signInBtn.style.display = "flex";
      if (userProfileWrap) userProfileWrap.style.display = "none";
    }
  }
}

function formatFirebaseAuthError(err) {
  if (!err) return "Authentication error occurred.";
  const msg = err.message || String(err);
  if (msg.includes("api-key-not-valid") || msg.includes("invalid-api-key") || msg.includes("AIzaSyDemoConfigKey")) {
    return `Invalid Firebase API Key. Please enter your valid Firebase API key below or <a href="#" onclick="openFirebaseConfigModal(); return false;" style="color:#b91c1c; font-weight:700; text-decoration:underline;">Click here to configure Firebase Keys</a>.`;
  }
  if (msg.includes("unauthorized-domain")) {
    return "Domain unauthorized for Firebase Auth. Add 'localhost' or your domain to Authorized Domains in Firebase Console.";
  }
  return msg;
}

async function firebaseSignUpWithEmail(email, password, displayName) {
  if (!firebaseAuthInstance) initFirebaseAuth();
  if (!firebaseAuthInstance) throw new Error("Firebase Auth is not ready.");

  try {
    const userCredential = await firebaseAuthInstance.createUserWithEmailAndPassword(email, password);
    if (displayName && userCredential.user) {
      await userCredential.user.updateProfile({ displayName: displayName });
    }
    updateFirebaseAuthUI(userCredential.user);
    return userCredential.user;
  } catch (err) {
    console.error("[FIREBASE SIGN UP ERROR]", err);
    throw new Error(formatFirebaseAuthError(err));
  }
}

async function firebaseSignInWithEmail(email, password) {
  if (!firebaseAuthInstance) initFirebaseAuth();
  if (!firebaseAuthInstance) throw new Error("Firebase Auth is not ready.");

  try {
    const userCredential = await firebaseAuthInstance.signInWithEmailAndPassword(email, password);
    updateFirebaseAuthUI(userCredential.user);
    return userCredential.user;
  } catch (err) {
    console.error("[FIREBASE SIGN IN ERROR]", err);
    throw new Error(formatFirebaseAuthError(err));
  }
}

async function firebaseSignInWithGoogle() {
  if (!firebaseAuthInstance) initFirebaseAuth();
  if (!firebaseAuthInstance) throw new Error("Firebase Auth is not ready.");

  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.addScope("email");
    provider.addScope("profile");
    // Full Read & Write scopes for Gmail
    provider.addScope("https://www.googleapis.com/auth/gmail.modify");
    provider.addScope("https://www.googleapis.com/auth/gmail.send");
    provider.addScope("https://www.googleapis.com/auth/gmail.compose");
    provider.addScope("https://www.googleapis.com/auth/gmail.readonly");
    // Full Read & Write scopes for Google Calendar
    provider.addScope("https://www.googleapis.com/auth/calendar");
    provider.addScope("https://www.googleapis.com/auth/calendar.events");
    provider.addScope("https://www.googleapis.com/auth/calendar.freebusy");

    const result = await firebaseAuthInstance.signInWithPopup(provider);
    if (result.credential && result.credential.accessToken) {
      database.googleAccessToken = result.credential.accessToken;
      database.googleCalendarConnected = true;
      database.googleEmailConnected = true;
      if (typeof checkGoogleCalendarStatus === "function") checkGoogleCalendarStatus();
    }
    updateFirebaseAuthUI(result.user);
    return result.user;
  } catch (err) {
    console.error("[FIREBASE GOOGLE SIGN IN ERROR]", err);
    throw new Error(formatFirebaseAuthError(err));
  }
}

async function firebaseSignOut() {
  if (!firebaseAuthInstance) initFirebaseAuth();
  if (firebaseAuthInstance) {
    try {
      await firebaseAuthInstance.signOut();
    } catch (err) {
      console.warn("Firebase signout warning:", err);
    }
  }

  localStorage.removeItem("gtm_local_user_name");
  localStorage.removeItem("gtm_local_user_email");
  localStorage.removeItem("gtm_local_user_picture");

  const authGate = document.getElementById("clerk-auth-gate");
  const mainApp = document.getElementById("app-layout-main");
  if (authGate) authGate.style.display = "flex";
  if (mainApp) mainApp.style.display = "none";

  if (typeof addLogConsole === "function") {
    addLogConsole("enrich", "[FIREBASE AUTH] User signed out.", "info");
  }
}

let currentFirebaseAuthMode = "signin";

function switchFirebaseAuthTab(mode) {
  currentFirebaseAuthMode = mode;
  const tabSignIn = document.getElementById("tab-fb-signin");
  const tabSignUp = document.getElementById("tab-fb-signup");
  const nameGroup = document.getElementById("fb-group-name");
  const submitBtn = document.getElementById("btn-fb-submit");
  const titleEl = document.getElementById("fb-auth-title");
  const subtitleEl = document.getElementById("fb-auth-subtitle");
  const errorBanner = document.getElementById("fb-auth-error-banner");

  if (errorBanner) errorBanner.style.display = "none";

  if (mode === "signup") {
    if (tabSignIn) { tabSignIn.style.background = "transparent"; tabSignIn.style.color = "var(--color-text-secondary)"; tabSignIn.style.boxShadow = "none"; }
    if (tabSignUp) { tabSignUp.style.background = "#ffffff"; tabSignUp.style.color = "var(--color-text-primary)"; tabSignUp.style.boxShadow = "0 1px 2px rgba(0,0,0,0.05)"; }
    if (nameGroup) nameGroup.style.display = "block";
    if (submitBtn) submitBtn.textContent = "Create Account ↗";
    if (titleEl) titleEl.textContent = "Create Your Account";
    if (subtitleEl) subtitleEl.textContent = "Register with Firebase Auth to start orchestrating campaigns";
  } else {
    if (tabSignUp) { tabSignUp.style.background = "transparent"; tabSignUp.style.color = "var(--color-text-secondary)"; tabSignUp.style.boxShadow = "none"; }
    if (tabSignIn) { tabSignIn.style.background = "#ffffff"; tabSignIn.style.color = "var(--color-text-primary)"; tabSignIn.style.boxShadow = "0 1px 2px rgba(0,0,0,0.05)"; }
    if (nameGroup) nameGroup.style.display = "none";
    if (submitBtn) submitBtn.textContent = "Sign In to Console ↗";
    if (titleEl) titleEl.textContent = "Welcome to GTM Console";
    if (subtitleEl) subtitleEl.textContent = "Sign in or create an account to get started";
  }
}

async function handleFirebaseAuthSubmit(event) {
  event.preventDefault();
  const errorBanner = document.getElementById("fb-auth-error-banner");
  if (errorBanner) errorBanner.style.display = "none";

  const email = (document.getElementById("fb-input-email")?.value || "").trim();
  const password = document.getElementById("fb-input-password")?.value || "";
  const name = (document.getElementById("fb-input-name")?.value || "").trim();

  if (!email || !password) return;

  try {
    if (currentFirebaseAuthMode === "signup") {
      await firebaseSignUpWithEmail(email, password, name);
    } else {
      await firebaseSignInWithEmail(email, password);
    }
  } catch (err) {
    if (errorBanner) {
      errorBanner.innerHTML = err.message || "Authentication failed.";
      errorBanner.style.display = "block";
    }
  }
}

async function handleFirebaseGoogleSignIn() {
  const errorBanner = document.getElementById("fb-auth-error-banner");
  if (errorBanner) errorBanner.style.display = "none";

  try {
    await firebaseSignInWithGoogle();
  } catch (err) {
    if (errorBanner) {
      errorBanner.innerHTML = err.message || "Google Sign-In failed.";
      errorBanner.style.display = "block";
    }
  }
}

function openFirebaseConfigModal() {
  let modal = document.getElementById("firebase-config-modal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "firebase-config-modal";
    modal.className = "modal-overlay";
    modal.style.cssText = "display: flex; position: fixed; inset: 0; background: rgba(15,23,42,0.65); backdrop-filter: blur(6px); z-index: 9999; align-items: center; justify-content: center; padding: 1.5rem;";
    modal.innerHTML = `
      <div class="modal-container" style="width: 100%; max-width: 520px; background: #ffffff; color: #0f172a; border-radius: 12px; padding: 1.5rem; box-shadow: 0 20px 40px rgba(0,0,0,0.3); border: 1px solid #cbd5e1;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; border-bottom: 1px solid #e2e8f0; padding-bottom: 0.75rem;">
          <h3 style="margin: 0; font-size: 16px; font-weight: 700; color: #0f172a;">Configure Firebase Credentials</h3>
          <button class="btn btn-secondary btn-sm" onclick="closeFirebaseConfigModal()" style="padding: 2px 8px; font-weight: 600;">✕</button>
        </div>
        <p style="font-size: 12.5px; color: #475569; margin: 0 0 1.25rem 0; line-height: 1.5;">
          Enter your Web App credentials from the <a href="https://console.firebase.google.com/" target="_blank" style="color:#0284c7; text-decoration:underline;">Firebase Console</a> (Project Settings &gt; General &gt; Your apps):
        </p>

        <div style="margin-bottom: 1rem;">
          <label style="font-size: 12px; font-weight: 700; color: #0f172a; display: block; margin-bottom: 4px;">1. Firebase API Key *</label>
          <input type="text" id="fb-config-api-key" class="form-input" value="${localStorage.getItem("gtm_firebase_api_key") || ""}" placeholder="AIzaSy..." style="width: 100%; font-size: 12.5px; font-family: var(--font-family-mono); padding: 0.6rem 0.75rem; border: 1px solid #cbd5e1; border-radius: 6px; color: #0f172a;" />
        </div>

        <div style="margin-bottom: 1rem;">
          <label style="font-size: 12px; font-weight: 700; color: #0f172a; display: block; margin-bottom: 4px;">2. Firebase Auth Domain</label>
          <input type="text" id="fb-config-auth-domain" class="form-input" value="${localStorage.getItem("gtm_firebase_auth_domain") || ""}" placeholder="your-project.firebaseapp.com" style="width: 100%; font-size: 12.5px; font-family: var(--font-family-mono); padding: 0.6rem 0.75rem; border: 1px solid #cbd5e1; border-radius: 6px; color: #0f172a;" />
        </div>

        <div style="margin-bottom: 1.25rem;">
          <label style="font-size: 12px; font-weight: 700; color: #0f172a; display: block; margin-bottom: 4px;">3. Firebase Project ID</label>
          <input type="text" id="fb-config-project-id" class="form-input" value="${localStorage.getItem("gtm_firebase_project_id") || ""}" placeholder="your-project-id" style="width: 100%; font-size: 12.5px; font-family: var(--font-family-mono); padding: 0.6rem 0.75rem; border: 1px solid #cbd5e1; border-radius: 6px; color: #0f172a;" />
        </div>

        <div style="display: flex; justify-content: space-between; gap: 0.5rem;">
          <button class="btn btn-secondary btn-sm" onclick="closeFirebaseConfigModal()">Cancel</button>
          <div style="display: flex; gap: 0.5rem;">
            <button class="btn btn-secondary btn-sm" onclick="closeFirebaseConfigModal(); bypassAuthToLocalConsole();" style="background: #f1f5f9; color: #0f172a;">Continue to Console (Offline)</button>
            <button class="btn btn-primary btn-sm" onclick="saveFirebaseCredentials()" style="background: #0f172a; color: #ffffff; font-weight: 700; border: none; padding: 0.5rem 1rem; border-radius: 6px;">Save &amp; Reload ✓</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  } else {
    modal.style.display = "flex";
  }
}

function closeFirebaseConfigModal() {
  const modal = document.getElementById("firebase-config-modal");
  if (modal) modal.style.display = "none";
}

function saveFirebaseCredentials() {
  const apiKey = (document.getElementById("fb-config-api-key")?.value || "").trim();
  const authDomain = (document.getElementById("fb-config-auth-domain")?.value || "").trim();
  const projectId = (document.getElementById("fb-config-project-id")?.value || "").trim();

  if (apiKey) localStorage.setItem("gtm_firebase_api_key", apiKey);
  if (authDomain) localStorage.setItem("gtm_firebase_auth_domain", authDomain);
  if (projectId) localStorage.setItem("gtm_firebase_project_id", projectId);

  closeFirebaseConfigModal();
  window.location.reload();
}

function bypassAuthToLocalConsole() {
  localStorage.setItem("gtm_local_user_name", "GTM Operator");
  localStorage.setItem("gtm_local_user_email", "demo@gtmconsole.internal");
  const authGate = document.getElementById("clerk-auth-gate");
  const mainApp = document.getElementById("app-layout-main");
  if (authGate) authGate.style.display = "none";
  if (mainApp) mainApp.style.display = "flex";
}

// Global Exports
window.initFirebaseAuth = initFirebaseAuth;
window.updateFirebaseAuthUI = updateFirebaseAuthUI;
window.firebaseSignUpWithEmail = firebaseSignUpWithEmail;
window.firebaseSignInWithEmail = firebaseSignInWithEmail;
window.firebaseSignInWithGoogle = firebaseSignInWithGoogle;
window.firebaseSignOut = firebaseSignOut;
window.switchFirebaseAuthTab = switchFirebaseAuthTab;
window.handleFirebaseAuthSubmit = handleFirebaseAuthSubmit;
window.handleFirebaseGoogleSignIn = handleFirebaseGoogleSignIn;
window.openFirebaseConfigModal = openFirebaseConfigModal;
window.closeFirebaseConfigModal = closeFirebaseConfigModal;
window.saveFirebaseCredentials = saveFirebaseCredentials;
window.bypassAuthToLocalConsole = bypassAuthToLocalConsole;
