# Connectem Partner Portal (V2 Redesign)

A flat, minimalistic black-and-white material workspace designed specifically for executive advisors, industry influencers, and partner networks.

## Design System
- **Pure Monochromatic Aesthetics**: High-contrast black (`#000000`) and stark white (`#ffffff`) palette, subtle graphite borders, and crisp tabular numbers.
- **Flat Material Architecture**: Strict geometric elevation, razor-sharp 1px borders, zero distracting multi-colored gradients, and modern typography (`Space Grotesk` + `Inter` + `JetBrains Mono`).
- **Contrast Toggle**: Instant B/W inverted contrast mode (Light / Dark).

---

## Features

1. **Executive Sign In & Sign Up (Firebase Auth)**:
   - **Google Single Sign-On**: 1-click authentication using official Firebase Google OAuth provider.
   - **Work Email & Password**: Real account creation (`createUserWithEmailAndPassword`) and sign in (`signInWithEmailAndPassword`) with password reset dispatch (`sendPasswordResetEmail`).
   - Seamless session persistence through `onAuthStateChanged`.
   - Comprehensive onboarding fields: Full Legal Name, Company / Advisory Firm, Title, Work Email, Password, LinkedIn Profile, and Industry Focus.
2. **Standardized Partner Network Agreement**:
   - Digital agreement preview modal with terms, commercial fee schedule, confidentiality, and mutual NDA.
   - Digital signature capture with cryptographic verification hash generation (`#IRM-XXXXX-VERIFIED`).
3. **Executive Introductions & Referrals Engine**:
   - **Single Introduction Form**: Executive Name, Company, Title, Email, LinkedIn, Warmth Context, and Deal Notes.
   - **Bulk CSV Intake**: Quick import of comma-separated executive rosters with automatic column mapping.
   - **Live Introductions Roster**: Real-time table with search, status filtering, and dynamic milestone status updates:
     - `Intro Submitted` (+200 pts)
     - `Call Scheduled`
     - `Meeting Verified` (+600 pts)
     - `Opportunity` (+1,000 pts)
     - `Customer Closed` (+5,000 pts)
4. **Direct Introduction Scheduling**:
   - Integrated quick-action button connecting to executive Calendly / meeting link.
5. **Points & Rewards Ledger**:
   - Real-time approved points balance tracking.
   - Transparent milestone reward fee schedule.
   - **Points Redemption Modal**: Payout requests via Direct ACH / Bank Wire (USD), Corporate Cards, Charitable Contributions, or Advisory Credits.
   - Audited chronological transaction ledger with timestamps.

---

## How to Host Separately

This directory is 100% self-contained (`index.html`, `style.css`, `app.js`). It requires **zero build steps** and can be deployed anywhere in 30 seconds.

### Option 1: Deploy to Vercel (Independent Project)
1. Go to [Vercel Dashboard](https://vercel.com/new).
2. Import your GitHub repository.
3. In **Root Directory**, click "Edit" and choose `partner-portal`.
4. Click **Deploy**.
5. Assign your custom domain (e.g. `go.connectem.ai`).

### Option 2: Deploy to Netlify
1. Drag and drop the `partner-portal` folder onto [Netlify Drop](https://app.netlify.com/drop).
2. Set your custom domain.

### Option 3: Deploy to Cloudflare Pages
1. Go to Cloudflare Dashboard &rarr; **Workers & Pages** &rarr; **Create application**.
2. Select Pages &rarr; Connect to Git.
3. Set **Build output directory** to `partner-portal`.
4. Deploy.

### Option 4: Local Preview
Run any local static server inside this directory:
```bash
cd partner-portal
python3 -m http.server 8080
```
Open [http://localhost:8080](http://localhost:8080) in your browser.
