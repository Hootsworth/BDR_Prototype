# Firebase and hosted backend setup

> **Hosting direction:** the current deployment target is Vercel, with `connectem.ai` for the main app and `go.connectem.ai` for the Influencer Portal. Follow [VERCEL_HOSTING_SETUP.md](VERCEL_HOSTING_SETUP.md) for the active setup. This document records the earlier Firebase Hosting + Cloud Run approach only; do not use its deployment steps for the Vercel project.

## What is connected

- Firebase project: `bdrcreek` (existing user project with Firestore provisioned).
- Firestore is accessed server-side through Firebase Admin; no Firebase web app or Firebase Auth is required.
- Clerk handles browser sign-in and attaches Clerk session tokens to same-origin `/api/*` calls.
- `firebase_backend.py` verifies Clerk session JWTs for backend authorization and uses Firebase Admin credentials only for Firestore snapshots and partner-link token hashes.
- `server.py` rejects hosted API requests by default, allows participant-token routes, and requires an allowlisted Clerk administrator for operator APIs.
- New Vendor accounts remain pending until an IRM administrator approves them; a signed agreement alone no longer unlocks the network. Self-registered Influencers are also pending review, and Marketplace request actions require IRM routing. Partner-share and Vendor sessions expire after 30 days, and hosted email has no simulated-success fallback.
- `Dockerfile` runs an API-only Cloud Run container. `.dockerignore` and `.gcloudignore` exclude the checked-in local data snapshot and other local artifacts from the build context.
- `scripts/build_firebase_public.py` builds an allowlist of public frontend files; `scripts/prepare_firebase_hosting.py` configures Firebase Hosting to rewrite `/api/**` to Cloud Run.

This is a **prototype compatibility bridge**: it stores the app's complete JSON state as a compressed, chunked Firestore snapshot so existing API flows can be brought online. It is not the final normalized multi-tenant schema. The pilot should keep a single operator instance/concurrency while this store is used, as the current state API submits whole-state snapshots.

## Historical Firebase Hosting + Cloud Run setup

The app is currently being prepared for Vercel hosting. The steps below describe an earlier Firebase Hosting + Cloud Run option and are not required for the current Vercel deployment.

## Remaining setup for the historical option

The Clerk development instance is linked to this repository, and its development publishable and secret keys have been pulled into the ignored local `.env`. The app receives the publishable key through `/app-config.js`; Firebase Hosting must rewrite that path to Cloud Run. The active instance is `modern-albacore-79.clerk.accounts.dev`; no account in the linked instance matches the signed-in Clerk dashboard email yet. Production Clerk instance is not configured. The operator should enable Email/password and Google sign-in in Clerk, then add the app's Clerk user ID to `CLERK_ADMIN_USER_IDS` for hosted IRM access.

The owner reports Firestore has been set up and supplied successful CLI output confirming the existing `(default)` database and a successful deployment of its Firestore rules and indexes. This does not configure server runtime credentials or grant a Vercel workload identity Firestore access.

`firebase-tools` is installed as a project dev dependency. The global `clerk` CLI is linked and authenticated. `gcloud` is not installed, so Cloud Run deployment has not been performed. Firebase Hosting → Cloud Run requires a Cloud Billing account and upgrades the Firebase project to the Blaze usage-based plan. Cloud Run has a no-cost usage allowance, but Cloud Build, Artifact Registry, database reads/writes, network transfer, and usage beyond free allowances can incur charges. Review [Cloud Run pricing](https://cloud.google.com/run/pricing) and the [Firebase Hosting to Cloud Run requirements](https://firebase.google.com/docs/hosting/cloud-run) before enabling billing.

## After the region and administrator are confirmed

1. Confirm the existing Firestore `(default)` database location and keep browser clients denied direct access. The backend uses Application Default Credentials.
2. Configure Email/password and Google sign-in in Clerk and add the production domain to Clerk's allowed origins.
4. Build the hosting allowlist with `npm run build:firebase`.
5. Generate `firebase.json` with `FIREBASE_REGION=<chosen-region> python3 scripts/prepare_firebase_hosting.py`.
6. Deploy `trusted-influence-api` to Cloud Run in that region with max instances `1`, concurrency `1`, and these environment values (the Cloud Run service must allow Firebase Hosting to invoke it; application-level Clerk session verification protects the API):
   - `FIREBASE_PROJECT_ID=bdrcreek`
   - `FIREBASE_USE_FIRESTORE=true`
   - `CLERK_BACKEND_AUTH_REQUIRED=true`
   - `CLERK_ISSUER=<Clerk JWT issuer URL>`
   - `CLERK_ADMIN_USER_IDS=<comma-separated allowed Clerk user IDs>`
   - `HOSTED_API_ONLY=true`
   - `PROTOTYPE_DATA_DIR=/tmp/gtm-data`
   - `PORT=8080`
   - Add `CLERK_PUBLISHABLE_KEY` as a normal environment variable; the browser key is public. The API verifies Clerk JWTs using the configured issuer's JWKS and does not need `CLERK_SECRET_KEY`.
   - `gcloud run deploy trusted-influence-api --source . --project bdrcreek --region "$FIREBASE_REGION" --allow-unauthenticated --max 1 --concurrency 1 --set-env-vars FIREBASE_PROJECT_ID=bdrcreek,FIREBASE_USE_FIRESTORE=true,CLERK_BACKEND_AUTH_REQUIRED=true,CLERK_ISSUER="$CLERK_ISSUER",CLERK_PUBLISHABLE_KEY="$CLERK_PUBLISHABLE_KEY",HOSTED_API_ONLY=true,PORT=8080,PROTOTYPE_DATA_DIR=/tmp/gtm-data,CLERK_ADMIN_USER_IDS="$CLERK_ADMIN_USER_IDS"`
7. Deploy Firestore rules and Firebase Hosting, then verify `/api/health`, Clerk token verification, operator state read/write, Vendor signup/login, Influencer signup/login, and request lifecycle in staging.

Do not set `CLERK_BACKEND_AUTH_REQUIRED=false` in a hosted environment. Do not create or download a Firebase service-account JSON key; Cloud Run should use its attached service identity with least-privilege Firestore permissions.

## Production hardening after the pilot foundation

Before opening public signup, add rate limiting and abuse controls, fix the vendor/influencer review and request transition rules documented in the investor plan, move from whole-state snapshots to normalized tenant-owned records and immutable audit/reward ledgers, configure backups and a restore drill, and complete a targeted security review.
