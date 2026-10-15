# Influencer contacts and partner sharing

## Model 2 marketplace operating controls

Keep the workflow human-reviewed: the IRM operator reviews vendors and partner records; the Vendor executes its approved Marketplace Agreement through the legal process; the IRM operator routes or declines requests; and the Influencer decides whether to accept and schedule. The portal records an acknowledgement only, not an Influencer signature. An IRM operator can mark a call complete only after it is scheduled. Admin approval must never be treated as a substitute for a participant's agreement or response.

The canonical hosted partner page uses Clerk for sign-in and the same Firestore-backed API state as the admin Marketplace. New partner profiles, introductions, status, approved reward points, and redemption requests share one source of truth. A standalone legacy portal is retired and redirects to the canonical page. The separate local demo portal files must not be deployed as another app.

The portal records agreement acknowledgements separately from executed agreements. It does not provide legally qualified electronic signatures, identity or organization verification, invoicing, or payout processing. Obtain and store executed agreements through the approved legal process and manually fulfill reward requests until those workflows are implemented. Live Vendor signup uses the Firestore-backed state path; end-to-end creation against production data still needs a controlled account test.

## Managing partner records

The Influencer Portal supports creating, editing, and removing partner profiles. Select a partner to add an individual referral, import a CSV, or edit and remove linked contacts. CSV import recognizes common headers for name, email, company, job title, phone, location, and industry. Email is the duplicate key; existing records are skipped and reported. Imported records receive the partner's stable influencer ID.

Removing a partner retains their contact records and clears the partner relationship. Removing a referred contact deletes that contact record. The owner can export aggregate chart data without exporting contact names, email addresses, or phone numbers.

## Private partner links

Create or revoke private partner links from the admin console. A link is a bearer credential: anyone who receives it can view that partner's real contact name, work email, company, title, phone, and call status, and can submit referrals. Known synthetic seed contacts are excluded. The API returns only those allowlisted fields; internal notes, email/LinkedIn content, outreach history, and other partners' contacts are not included. The raw random token is stored in Firestore only as a SHA-256 hash. Only one link remains active per partner; creating a replacement revokes the previous link.

Vercel uses Firestore for shared application state and partner-link token hashes. Admin list/link management requires an allowlisted Clerk operator. The current production environment is missing that allowlist and the `CLERK_BACKEND_AUTH_REQUIRED` / `HOSTED_API_ONLY` settings; the connected implementation is in Preview until those are set and verified.

## Separate referral charts

Open `reports/referral-analytics.html` separately from the app. In the app, choose **Export chart data**, then load the generated JSON file in the report. Synthetic seed contacts are excluded. The report runs locally in the browser and accepts aggregate counts only; it does not upload the data.
