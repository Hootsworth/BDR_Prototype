# Influencer contacts and partner sharing

## Managing partner records

The Influencer Portal supports creating, editing, and removing partner profiles. Select a partner to add an individual referral, import a CSV, or edit and remove linked contacts. CSV import recognizes common headers for name, email, company, job title, phone, location, and industry. Email is the duplicate key; existing records are skipped and reported. Imported records receive the partner's stable influencer ID.

Removing a partner retains their contact records and clears the partner relationship. Removing a referred contact deletes that contact record. The owner can export aggregate chart data without exporting contact names, email addresses, or phone numbers.

## Private partner links

Create a private link from the local console. It is a bearer link: anyone who receives it can view that partner's real contact name, work email, company, title, phone, and call status, and can submit referrals. Known synthetic seed contacts are excluded. The API returns only those allowlisted fields; internal notes, email/LinkedIn content, outreach history, and other partners' contacts are not included. The raw random token is stored in the database only as a SHA-256 hash. Only one link remains active per partner; creating a replacement revokes the previous link, and the owner can revoke it from the local console at any time.

The local SQLite database must remain on a reachable, persistent server. A `localhost` link works only on the computer running the app. To share with someone elsewhere, set `GTM_PUBLIC_BASE_URL` in `.env` to the HTTPS address that routes to this same persistent local server. Keep the server and secure reverse proxy running. Forward the original client address in `X-Forwarded-For`; owner-only database and management APIs reject requests that arrive from non-loopback clients. Only one link remains active per influencer; creating a replacement revokes the previous link, and the owner can revoke it from the local console at any time.

The current Vercel adapter uses temporary `/tmp` storage and is not suitable for durable shared contact data. Link creation and owner CRUD therefore return an explanatory error on Vercel rather than pretending the records are safely persisted. A hosted deployment needs a durable shared database and authenticated owner-management endpoints before these features can be enabled there.

## Separate referral charts

Open `reports/referral-analytics.html` separately from the app. In the app, choose **Export chart data**, then load the generated JSON file in the report. Synthetic seed contacts are excluded. The report runs locally in the browser and accepts aggregate counts only; it does not upload the data.
