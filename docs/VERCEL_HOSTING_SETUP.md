# Vercel hosting and Firebase Firestore

## Domain routing

The Vercel project serves the existing app at connectem.ai. A host-conditional redirect sends / on go.connectem.ai to the Influencer Portal page while keeping the go.connectem.ai host. API calls continue through the Python function. /app-config.js is routed through that function so the Clerk publishable key can be supplied at runtime.

The checkout is linked to Vercel project `bdr-prototype`. Its project Root Directory must be the repository root (the folder containing `vercel.json`, `index.html`, and `api/`). `vercel.json` sets the output directory to `.`. The Vercel framework preset was changed to Other after the Python preset caused Vercel to expose a directory listing for `/api/`. The fresh preview at `https://bdr-prototype-2wcxgnm14-aditya-p-dixit-s-projects.vercel.app` serves the app and `/partner-portal`; the earlier `bdr-prototype-henna` preview is an older deployment and still shows the listing. The current preview deployment is protected by Vercel authentication. Add connectem.ai and go.connectem.ai to that project under Settings → Domains, then apply the DNS records Vercel shows. Domain activation and DNS are left for the owner; neither domain is live until Vercel verifies it.

The repository does not yet contain a separate public marketing landing page: connectem.ai/ currently serves the existing application console. The Vendor Marketplace remains at /marketplace.html.

## Firestore source of truth

The API uses Firebase Admin on the server. Browser code must not access Firestore directly; firestore.rules denies all client reads and writes. firebase.json and firestore.indexes.json make the existing default Firestore database rules/index configuration deployable with the Firebase CLI. The app currently expects the (default) database and stores its compatibility snapshot in Firestore. It is not yet a normalized multi-tenant schema.

The Firebase Web App config supplied for `bdrcreek` is public client configuration (API key, auth domain, project ID, app ID, and measurement ID), not a backend credential. It is recorded in `.env.example` as `FIREBASE_*` values for future Firebase client SDK features. The current product does not initialize the Firebase browser SDK or Firebase Analytics: Clerk remains the authentication provider, and the backend uses Firebase Admin for Firestore. Never put a service-account private key or other server secret in browser code or a `NEXT_PUBLIC_` variable.

The owner confirmed the existing `(default)` database is `STANDARD` / `FIRESTORE_NATIVE`, and supplied successful Firebase CLI output confirming Firestore rules and indexes were deployed to it. To repeat a deployment from an authenticated terminal:

    npx -y firebase-tools@latest firestore:databases:list --project bdrcreek
    npx -y firebase-tools@latest deploy --only firestore --project bdrcreek

Do not create a second database to work around that connection failure. The backend is currently written for the existing default database.

## Vercel-to-Google credentials

Enable Vercel Secure Backend Access / OIDC federation and configure a Google Workload Identity Federation provider restricted to this Vercel team, project, and production environment. Use service-account impersonation rather than a downloaded JSON key:

1. In Google Cloud project bdrcreek, create a workload identity pool/provider that trusts the Vercel issuer and expected audience. Add an attribute condition that limits accepted tokens to this Vercel project/environment.
2. Create a dedicated runtime service account. Grant it roles/datastore.user on bdrcreek for the Firestore API operations this application uses.
3. Grant only the matching Vercel workload identity roles/iam.workloadIdentityUser on that service account.
4. Add the WIF values below to Vercel's production environment. Set the project environment values, then redeploy.

The `bdr-prototype` Vercel project is configured with Google Workload Identity Federation in Firebase project `bdrcreek`:

- Pool/provider IDs: `vercel` / `vercel`.
- Issuer and audience: `https://oidc.vercel.com/aditya-p-dixit-s-projects` / `https://vercel.com/aditya-p-dixit-s-projects`.
- Provider condition accepts only the exact `bdr-prototype` Production and Preview subjects.
- Dedicated service account: `vercel-firestore-runtime@bdrcreek.iam.gserviceaccount.com`, with `roles/datastore.user` on `bdrcreek`; only those two Vercel subjects can impersonate it.
- Vercel has the WIF settings and `FIREBASE_USE_FIRESTORE=true` in Preview and Production.

Vercel's OIDC token is available to its Node request context, not the Python request handler. `api/oidc.js` uses the official `@vercel/oidc` SDK and forwards the short-lived token server-to-server to the Python API using an application-specific request header. `firebase_backend.py` keeps the latest token in process memory so Firestore's gRPC auth callback can read it from its worker thread. No token or service-account key is persisted. Local development continues to use Application Default Credentials.

End-to-end Preview verification succeeded on 2026-10-14 at `https://bdr-prototype-onvaparpb-aditya-p-dixit-s-projects.vercel.app`: `/api/health` returned 200, the Clerk config endpoint exposed only the publishable key, and `/api/marketplace/vendor/me` returned the expected 401 for a missing vendor login after successfully reading Firestore state. A direct request to the internal Python path returned 404 without the private bridge secret. Production has not been redeployed.

## Vercel environment variables

Set these as server-side Vercel variables (do not use public/client prefixes):

| Variable | Value |
|---|---|
| FIREBASE_PROJECT_ID | bdrcreek |
| FIREBASE_USE_FIRESTORE | true |
| CLERK_PUBLISHABLE_KEY | Clerk production-instance publishable key |
| CLERK_SECRET_KEY | Clerk production-instance secret key |
| CLERK_ISSUER | Exact issuer URL for that Clerk instance |
| CLERK_BACKEND_AUTH_REQUIRED | true |
| CLERK_ADMIN_USER_IDS | Comma-separated IDs of authorized IRM operators |
| HOSTED_API_ONLY | true |
| GCP_PROJECT_NUMBER | Google Cloud project number for the WIF pool project |
| GCP_WORKLOAD_IDENTITY_POOL_ID | WIF pool ID |
| GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID | WIF provider ID |
| GCP_SERVICE_ACCOUNT_EMAIL | Dedicated Firestore runtime service account |
| VERCEL_BACKEND_BRIDGE_SECRET | Random server-only secret for the Node-to-Python OIDC bridge |
| GTM_PUBLIC_BASE_URL | https://go.connectem.ai |
| TOKEN_ENCRYPTION_KEY | A new Fernet key for encrypted integration tokens |

The Clerk Production publishable key, secret key, and issuer are staged in Vercel Production. The issuer encoded by the supplied live publishable key is `https://clerk.connectem.ai`; the Clerk secret is stored as a sensitive Vercel variable. Preview retains the development instance values. On 2026-10-14, public DNS returned no record for `clerk.connectem.ai`, so the Production deployment has not been redeployed. Add/verify the Clerk-provided DNS record and confirm the issuer's JWKS endpoint resolves before promotion. Allow the Vercel preview origin during setup and `go.connectem.ai` after its custom domain is verified.

## Firestore backups

Firestore managed scheduled backups are separate from Firebase CLI rules deployment. Google documents creating them with gcloud firestore backups schedules create; this repository includes a daily schedule script with four-week retention:

    scripts/create_firestore_backup_schedule.sh

Then verify in Cloud Shell or an authorized machine:

    gcloud firestore backups schedules list --project=bdrcreek --database='(default)'
    gcloud firestore backups list --project=bdrcreek --database='(default)'

Backup storage is billable. A read-only check found no schedule, and the Firestore API rejected schedule creation with `BILLING_DISABLED`. Enable billing for `bdrcreek` before running the script; then verify the schedule and complete a restore rehearsal to a separate database. A schedule alone does not prove recovery.

## Deployment checklist

1. Confirm the project Root Directory is the repository root. The current Preview verifies the app, `/partner-portal`, `/api/health`, and the Firestore read path.
2. Verify the Clerk Production hostname/DNS and add the authorized IRM admin user IDs in Vercel. Preview currently uses the Clerk development instance; do not reuse its test secret in Production.
3. Verify the preview app-config response contains only the Clerk publishable key; verify API calls reach the Python function and Firestore.
4. Add both custom domains in Vercel and apply the Vercel-provided DNS records when ready.
5. Verify https://connectem.ai/, https://go.connectem.ai/, partner sign-in/onboarding, API authorization, and that private local database files are absent from the deployment.
6. Create and verify scheduled Firestore backups, then complete a restore rehearsal before real pilot data is entered.

## Remaining launch work

- Add/verify the Clerk DNS record for `clerk.connectem.ai`, allow the final app domains, and add the intended IRM administrator user IDs before enabling admin-only workflows.
- Promote the verified application code to Production after Clerk DNS resolves; verify authenticated API reads and writes there.
- Add and verify the two custom domains and configure the Clerk allowed origins.
- Confirm scheduled Firestore backups and complete a restore rehearsal before real pilot data is entered.
- The project still needs a public marketing landing page if connectem.ai is intended to be a customer-facing website rather than the existing app console.
