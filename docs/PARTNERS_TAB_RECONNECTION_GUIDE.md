# Partners (Influencers / IRM) Tab Disconnection & Reconnection Guide

## Context & Status
As directed, the **Partners** (`influencers`) tab has been completely disconnected from the ConnectEM Admin application (`admin.connectem.ai`).
The codebase, database schemas, API routes, and templates have been **100% preserved** in place. No business logic or partner data has been removed.

---

## Defense-in-Depth Disconnection Architecture
To guarantee that the tab **cannot be reached even via client cache, URL query strings, saved bookmarks, or browser history**, multiple defensive layers were implemented:

1. **Sidebar Navigation**:
   - The `#cat-group-influencers` element was commented out of `#app-nav-bar` in both `index.html` and `admin.html`.
2. **Tab Container Markup**:
   - The `<section id="tab-panel-influencers">` container was commented out of `<main>` in both `index.html` and `admin.html`.
3. **Template Fetch Barrier**:
   - In `src/main.js`, `'influencers': 'components/influencers.html'` was commented out in `componentsList`. Even if the container existed, `components/influencers.html` is never fetched or injected into the DOM.
4. **URL & History Sanitization**:
   - On app bootstrap (`bootstrapApp()` in `src/main.js`), any request containing `?tab=influencers` has the parameter stripped via `window.history.replaceState`.
   - Any URL hash matching `#influencers` or `#tab-panel-influencers` is immediately redirected to `#dashboard`.
5. **Runtime Navigation Guard**:
   - At the entry of `switchTab(tabId)` (in `src/main.js` and `app.js`), if `tabId === 'influencers'`, the request is intercepted and redirected to `'dashboard'`.
6. **Command Palette Exemption**:
   - The "Influencer Portal" entry was removed from the Cmd+K command palette in `src/main.js`.
7. **Fail-Safe CSS Shield**:
   - A strict fail-safe rule in `style.css` forces `#tab-panel-influencers`, `#cat-group-influencers`, and `#tab-btn-influencers` to `display: none !important; visibility: hidden !important; pointer-events: none !important; opacity: 0 !important;` so stale or cached DOM fragments cannot be displayed or clicked.

---

## Preserved Codebase Assets
The following files remain intact and ready for reconnection:
- **UI Markup**: `components/influencers.html`
- **Frontend Controller**: `src/components/influencers.js`
- **Backend API Routes**: `/api/influencers/create`, `/api/influencers/list`, `/api/portal/influencer`, etc. in `server.py`
- **Data Persistence**: `gtm-console-database.json` (`influencers` and `contacts` with `isInfluencer: true`)

---

## How to Reconnect the Partners Tab (Step-by-Step)

If an administrator or future developer wishes to restore the Partners tab, follow these steps:

### 1. Re-enable in `src/main.js`
- **Line ~8**: In `componentsList`, uncomment:
  ```javascript
  'influencers': 'components/influencers.html',
  ```
- **Line ~240**: In `bootstrapApp()`, remove or adjust the URL parameter cleaner if you want `?tab=influencers` to be honored.
- **Line ~295**: In `switchTab(tabId)`, remove the guard:
  ```javascript
  if (tabId === 'influencers') {
    tabId = 'dashboard';
  }
  ```
- **Line ~628**: In `handleCommandPaletteSearch()`, uncomment the `Influencer Portal` object in `tabCommands`.

### 2. Re-enable in `index.html` and `admin.html`
- **Sidebar**: Locate `[PARTNERS TAB DISCONNECTED]` inside `#app-nav-bar` and uncomment `<div class="nav-category-group direct-tab" id="cat-group-influencers">...</div>`.
- **Main Section**: Locate `[PARTNERS TAB DISCONNECTED]` inside `<main>` and uncomment `<section class="tab-content" id="tab-panel-influencers"></section>`.

### 3. Re-enable in `style.css`
- Scroll to the bottom of `style.css` and remove the `PARTNERS TAB DISCONNECTED - FAIL-SAFE BLOCK` rule for `#tab-panel-influencers`.

### 4. Build & Deploy
1. Run the Firebase sync script:
   ```bash
   python3 scripts/build_firebase_public.py
   ```
2. Run test verification:
   ```bash
   python3 -m unittest discover -s tests -q
   ```
3. Commit and deploy:
   ```bash
   git add -A && git commit -m "feat: reconnect partners tab"
   git push origin main
   npx vercel --prod --yes
   ```
