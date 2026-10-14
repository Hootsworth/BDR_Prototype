// Clerk Static Configuration for Frontend
window.ClerkConfig = {
  // Public Clerk key can be injected from the deployment environment.
  publishableKey: window.__APP_CONFIG__?.clerkPublishableKey || ""
};

// Browser-only Google OAuth client ID. This is public by design; never place a client secret here.
window.GoogleConfig = {
  clientId: ""
};

// Firestore is accessed by the server with Firebase Admin credentials.
