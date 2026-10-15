# Connectem Partner Portal

This folder is retired as a standalone app. The former page used a separate Firebase Auth and browser-stored points ledger, which could diverge from the admin marketplace. Its index now redirects to the canonical hosted portal at [go.connectem.ai/partner-portal](https://go.connectem.ai/partner-portal).

The canonical page is `../partner-portal.html`; it uses Clerk for identity and the shared backend APIs/Firestore state for partner profiles, referrals, statuses, approved reward points, and reward requests. Deploy it with the repository's root Vercel project so the API and UI stay on the same backend.
