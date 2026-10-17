# Connectem Partner Portal

The supported portal is served from the repository root at `/partner-portal` through the rewrite in `vercel.json`. Both `partner-portal.html` and this folder's `index.html` load the shared Clerk portal implementation from `/partner-portal.js` and the deployment-provided public configuration from `/app-config.js`.

Clerk handles sign-in, sign-up, and password recovery. The backend verifies Clerk sessions, associates an authenticated user with a partner profile, and issues a scoped partner token for referral, agreement, and reward operations. Firestore is used only by the server-side Admin SDK for persistent application data; Firebase Auth is not part of the partner sign-in flow.

Do not deploy this folder as an independent static project. It depends on the shared app configuration and same-origin API routes provided by the main Vercel project.
