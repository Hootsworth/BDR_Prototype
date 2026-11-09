// Clerk Static Configuration for Frontend
window.ClerkConfig = {
  // Public Clerk key can be injected from the deployment environment.
  publishableKey: window.__APP_CONFIG__?.clerkPublishableKey || ""
};

// Firebase Configuration for bdrcreek
window.FirebaseConfig = {
  apiKey: "AIzaSyBYND-VnhlE9GY7ePGpCM50IdnggfZKqao",
  authDomain: "bdrcreek.firebaseapp.com",
  projectId: "bdrcreek",
  storageBucket: "bdrcreek.firebasestorage.app",
  messagingSenderId: "963692172559",
  appId: "1:963692172559:web:b64288c9c84637b310da7a",
  measurementId: "G-EJCHQLTSNQ"
};

// Browser-only Google OAuth client ID.
window.GoogleConfig = {
  clientId: "963692172559-web.apps.googleusercontent.com"
};

// Firestore is accessed as the authoritative database.
