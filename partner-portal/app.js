/**
 * CONNECTEM PARTNER PORTAL · REWARDS MARKETPLACE & WORKSPACE CONTROLLER
 * Pure Modern JS · Clean State Management · Uncluttered UX · 100% SVG Icons
 */

(() => {
  'use strict';

  const STORAGE_KEY_USER = 'connectem_partner_v3_user';
  const STORAGE_KEY_DATA = 'connectem_partner_v3_data';
  const STORAGE_KEY_CART = 'connectem_partner_v3_cart';
  const API_BASE = window.PARTNER_API_BASE || (window.location.origin.includes('localhost') ? '' : 'https://connectem.ai');

  // Official Firebase Project Config for 'bdrcreek'
  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyBYND-VnhlE9GY7ePGpCM50IdnggfZKqao",
    authDomain: "bdrcreek.firebaseapp.com",
    projectId: "bdrcreek",
    storageBucket: "bdrcreek.firebasestorage.app",
    messagingSenderId: "963692172559",
    appId: "1:963692172559:web:b64288c9c84637b310da7a",
    measurementId: "G-EJCHQLTSNQ"
  };

  let auth = null;
  if (typeof window !== 'undefined' && window.firebase && typeof window.firebase.initializeApp === 'function') {
    try {
      if (!window.firebase.apps || !window.firebase.apps.length) {
        window.firebase.initializeApp(FIREBASE_CONFIG);
      }
      auth = window.firebase.auth();
    } catch (err) {
      console.warn("Firebase Auth initialization:", err);
    }
  }

  // Rewards Marketplace Catalog
  const CATALOG_ITEMS = [
    {
      id: 'amazon',
      brand: 'AMZN',
      category: 'Gift Cards',
      title: 'Amazon E-Gift Card',
      desc: 'Instant digital balance for electronics, books, office supplies, and team perks.',
      denominations: [
        { label: '$25 USD', pts: 250, usd: 25 },
        { label: '$50 USD', pts: 500, usd: 50 },
        { label: '$100 USD', pts: 1000, usd: 100 }
      ]
    },
    {
      id: 'apple',
      brand: 'AAPL',
      category: 'Gift Cards',
      title: 'Apple Store & Services Card',
      desc: 'Redeem for Apple hardware, accessories, App Store, iCloud, and developer tools.',
      denominations: [
        { label: '$50 USD', pts: 500, usd: 50 },
        { label: '$100 USD', pts: 1000, usd: 100 },
        { label: '$250 USD', pts: 2500, usd: 250 }
      ]
    },
    {
      id: 'uber',
      brand: 'UBER',
      category: 'Travel & Lifestyle',
      title: 'Uber & Uber Eats Pass',
      desc: 'Reliable executive rides, airport transfers, and team catering deliveries.',
      denominations: [
        { label: '$25 USD', pts: 250, usd: 25 },
        { label: '$50 USD', pts: 500, usd: 50 },
        { label: '$100 USD', pts: 1000, usd: 100 }
      ]
    },
    {
      id: 'airbnb',
      brand: 'ABNB',
      category: 'Travel & Lifestyle',
      title: 'Airbnb Travel Voucher',
      desc: 'Luxury stays and offsite accommodations worldwide for executive retreats.',
      denominations: [
        { label: '$100 USD', pts: 1000, usd: 100 },
        { label: '$250 USD', pts: 2500, usd: 250 },
        { label: '$500 USD', pts: 5000, usd: 500 }
      ]
    },
    {
      id: 'delta',
      brand: 'DAL',
      category: 'Travel & Lifestyle',
      title: 'Delta Air Lines Travel Pass',
      desc: 'Domestic and international flight bookings, seat upgrades, and Sky Club passes.',
      denominations: [
        { label: '$250 USD', pts: 2500, usd: 250 },
        { label: '$500 USD', pts: 5000, usd: 500 }
      ]
    },
    {
      id: 'msf',
      brand: 'MSF',
      category: 'NGO Donations',
      title: 'Doctors Without Borders (MSF)',
      desc: 'Provide emergency medical humanitarian assistance to crisis and conflict zones.',
      denominations: [
        { label: '$50 Donation', pts: 500, usd: 50 },
        { label: '$100 Donation', pts: 1000, usd: 100 },
        { label: '$250 Donation', pts: 2500, usd: 250 }
      ]
    },
    {
      id: 'givedirectly',
      brand: 'GIVE',
      category: 'NGO Donations',
      title: 'GiveDirectly Direct Aid',
      desc: 'Send unconditional direct cash transfers to families in extreme poverty.',
      denominations: [
        { label: '$50 Donation', pts: 500, usd: 50 },
        { label: '$100 Donation', pts: 1000, usd: 100 },
        { label: '$250 Donation', pts: 2500, usd: 250 }
      ]
    },
    {
      id: 'wck',
      brand: 'WCK',
      category: 'NGO Donations',
      title: 'World Central Kitchen (WCK)',
      desc: 'First to the frontlines providing fresh chef-prepared meals in disaster zones.',
      denominations: [
        { label: '$50 Donation', pts: 500, usd: 50 },
        { label: '$100 Donation', pts: 1000, usd: 100 }
      ]
    },
    {
      id: 'catf',
      brand: 'CATF',
      category: 'NGO Donations',
      title: 'Clean Air Task Force',
      desc: 'Catalyze zero-carbon energy technologies and high-impact global climate policies.',
      denominations: [
        { label: '$50 Donation', pts: 500, usd: 50 },
        { label: '$100 Donation', pts: 1000, usd: 100 }
      ]
    },
    {
      id: 'ft_hbr',
      brand: 'HBR',
      category: 'Executive Perks',
      title: 'Financial Times & HBR Digital',
      desc: 'Annual executive subscriptions to premier global business and technology journalism.',
      denominations: [
        { label: '$75 (6 Mos)', pts: 750, usd: 75 },
        { label: '$150 (1 Year)', pts: 1500, usd: 150 }
      ]
    },
    {
      id: 'ach_cash',
      brand: 'ACH',
      category: 'Direct Cash',
      title: 'Direct ACH Bank Wire Transfer',
      desc: 'Direct electronic cash transfer to your designated advisory or corporate checking account.',
      denominations: [
        { label: '$100 USD Wire', pts: 1000, usd: 100 },
        { label: '$250 USD Wire', pts: 2500, usd: 250 },
        { label: '$500 USD Wire', pts: 5000, usd: 500 },
        { label: '$1,000 USD Wire', pts: 10000, usd: 1000 }
      ]
    }
  ];

  // Application State
  const state = {
    user: null,
    intros: [],
    statement: [],
    cart: [],
    activeCategory: 'ALL',
    agreement: {
      signed: true,
      signedBy: 'Verified Partner',
      signedAt: 'Oct 15, 2026',
      hash: '#IRM-88214-VERIFIED'
    },
    points: 0
  };

  // DOM Elements Cache
  const el = {
    // Nav & Theme
    themeToggle: document.getElementById('btn-theme-toggle'),
    signoutBtn: document.getElementById('btn-signout'),
    navBalancePill: document.getElementById('nav-balance-pill'),
    navPointsVal: document.getElementById('nav-points-val'),
    btnNavCart: document.getElementById('btn-nav-cart'),
    navCartCount: document.getElementById('nav-cart-count'),

    // Views
    viewAuth: document.getElementById('view-auth'),
    viewWorkspace: document.getElementById('view-workspace'),
    viewFullscreenIntro: document.getElementById('view-fullscreen-intro'),

    // Auth Forms, Google SSO & Tabs
    tabAuthSignin: document.getElementById('tab-auth-signin'),
    tabAuthSignup: document.getElementById('tab-auth-signup'),
    formSignin: document.getElementById('form-signin'),
    formSignup: document.getElementById('form-signup'),
    btnGoogleAuth: document.getElementById('btn-google-auth'),
    btnForgotPassword: document.getElementById('btn-forgot-password'),
    btnSubmitSignin: document.getElementById('btn-submit-signin'),
    btnSubmitSignup: document.getElementById('btn-submit-signup'),
    authFeedback: document.getElementById('auth-feedback'),

    // Workspace Hero & Header
    userFirstName: document.getElementById('user-first-name'),
    userSubtext: document.getElementById('user-subtext'),
    linkCalendly: document.getElementById('link-calendly-intro'),
    btnOpenAddFullscreen: document.getElementById('btn-open-add-fullscreen'),

    // KPIs
    kpiTotal: document.getElementById('kpi-total'),
    kpiScheduled: document.getElementById('kpi-scheduled'),
    kpiVerified: document.getElementById('kpi-verified'),
    kpiPoints: document.getElementById('kpi-points'),
    kpiCashEst: document.getElementById('kpi-cash-est'),

    // Subtabs
    tabSubIntros: document.getElementById('tab-sub-intros'),
    tabSubEarnings: document.getElementById('tab-sub-earnings'),
    tabSubMarketplace: document.getElementById('tab-sub-marketplace'),
    tabSubAgreement: document.getElementById('tab-sub-agreement'),
    tabIntrosCount: document.getElementById('tab-intros-count'),

    panelSubIntros: document.getElementById('subtab-panel-intros'),
    panelSubEarnings: document.getElementById('subtab-panel-earnings'),
    panelSubMarketplace: document.getElementById('subtab-panel-marketplace'),
    panelSubAgreement: document.getElementById('subtab-panel-agreement'),

    // Introductions Roster
    searchIntros: document.getElementById('search-intros'),
    filterIntroStatus: document.getElementById('filter-intro-status'),
    btnOpenBulkModal: document.getElementById('btn-open-bulk-modal'),
    introsContainer: document.getElementById('intros-container'),

    // Full-Screen Workspace Elements
    btnCloseFullscreen: document.getElementById('btn-close-fullscreen'),
    btnSubmitIntroFullscreen: document.getElementById('btn-submit-intro-fullscreen'),
    fsName: document.getElementById('fs-name'),
    fsCompany: document.getElementById('fs-company'),
    fsTitle: document.getElementById('fs-title'),
    fsSeniority: document.getElementById('fs-seniority'),
    fsEmail: document.getElementById('fs-email'),
    fsPhone: document.getElementById('fs-phone'),
    fsLinkedin: document.getElementById('fs-linkedin'),
    fsLocation: document.getElementById('fs-location'),
    fsWarmth: document.getElementById('fs-warmth'),
    fsStrength: document.getElementById('fs-strength'),
    fsHistory: document.getElementById('fs-history'),
    fsEvalRole: document.getElementById('fs-eval-role'),
    fsBudget: document.getElementById('fs-budget'),
    fsContext: document.getElementById('fs-context'),
    fsMeetingDate: document.getElementById('fs-meeting-date'),
    fsMeetingTime: document.getElementById('fs-meeting-time'),
    fsMeetingDuration: document.getElementById('fs-meeting-duration'),
    fsMeetingPlatform: document.getElementById('fs-meeting-platform'),
    fsPartnerAttendance: document.getElementById('fs-partner-attendance'),
    fsBriefing: document.getElementById('fs-briefing'),
    fsConsent: document.getElementById('fs-consent'),

    // Earnings Tab
    earningsCardBalance: document.getElementById('earnings-card-balance'),
    earningsCardUsd: document.getElementById('earnings-card-usd'),
    btnOpenPayoutModal: document.getElementById('btn-open-payout-modal'),
    statementRowsContainer: document.getElementById('statement-rows-container'),

    // Rewards Marketplace Elements
    btnOpenCartHero: document.getElementById('btn-open-cart-hero'),
    cartItemCount: document.getElementById('cart-item-count'),
    marketplaceCatalogGrid: document.getElementById('marketplace-catalog-grid'),

    // Agreement Tab
    agreementPillBadge: document.getElementById('agreement-pill-badge'),
    agreementMetaSigner: document.getElementById('agreement-meta-signer'),
    agreementMetaDate: document.getElementById('agreement-meta-date'),
    agreementMetaHash: document.getElementById('agreement-meta-hash'),
    btnReReadAgreement: document.getElementById('btn-re-read-agreement'),

    // Modals
    modalBulkCsv: document.getElementById('modal-bulk-csv'),
    bulkPasteText: document.getElementById('bulk-paste-text'),
    btnConfirmBulk: document.getElementById('btn-confirm-bulk'),

    modalAgreement: document.getElementById('modal-agreement'),
    agreementSignerField: document.getElementById('agreement-signer-field'),
    btnConfirmSignTerms: document.getElementById('btn-confirm-sign-terms'),

    // Cart Checkout Modal
    modalCartCheckout: document.getElementById('modal-cart-checkout'),
    cartAvailableBalance: document.getElementById('cart-available-balance'),
    cartTotalCost: document.getElementById('cart-total-cost'),
    cartItemsList: document.getElementById('cart-items-list'),
    cartDeliveryEmail: document.getElementById('cart-delivery-email'),
    cartBankWireSection: document.getElementById('cart-bank-wire-section'),
    cartBankDetails: document.getElementById('cart-bank-details'),
    cartOrderNotes: document.getElementById('cart-order-notes'),
    btnConfirmRedeemCart: document.getElementById('btn-confirm-redeem-cart'),
    cartBtnPoints: document.getElementById('cart-btn-points'),

    // Order Success Modal
    modalOrderSuccess: document.getElementById('modal-order-success'),
    receiptOrderHash: document.getElementById('receipt-order-hash'),
    receiptPointsRedeemed: document.getElementById('receipt-points-redeemed'),
    receiptNewBalance: document.getElementById('receipt-new-balance'),

    // Toast
    toastNotice: document.getElementById('toast-notice')
  };

  // Utilities
  function escapeHTML(str) {
    return String(str || '').replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
  }

  function showToast(message) {
    if (!el.toastNotice) return;
    el.toastNotice.textContent = message;
    el.toastNotice.style.display = 'block';
    setTimeout(() => {
      el.toastNotice.style.display = 'none';
    }, 3200);
  }

  function openModal(modalEl) {
    if (modalEl) modalEl.style.display = 'flex';
  }

  function closeAllModals() {
    document.querySelectorAll('.modal-backdrop').forEach(m => m.style.display = 'none');
  }

  // Full-Screen Workspace Controls
  function openFullscreenIntroWorkspace() {
    if (el.fsMeetingDate && !el.fsMeetingDate.value) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      el.fsMeetingDate.value = tomorrow.toISOString().split('T')[0];
    }
    if (el.viewFullscreenIntro) {
      el.viewFullscreenIntro.style.display = 'flex';
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }

  function closeFullscreenIntroWorkspace() {
    if (el.viewFullscreenIntro) {
      el.viewFullscreenIntro.style.display = 'none';
    }
  }

  // Local Storage Persistence
  function saveState() {
    if (!state.user) return;
    const keyId = state.user.uid || state.user.email;
    localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(state.user));
    localStorage.setItem(`${STORAGE_KEY_DATA}_${keyId}`, JSON.stringify({
      intros: state.intros,
      statement: state.statement,
      agreement: state.agreement,
      points: state.points
    }));
    localStorage.setItem(`${STORAGE_KEY_CART}_${keyId}`, JSON.stringify(state.cart));
  }

  function loadState(uid, email) {
    try {
      const keyId = uid || email || state.user?.uid || state.user?.email;
      if (!keyId) return false;
      const rawData = localStorage.getItem(`${STORAGE_KEY_DATA}_${keyId}`);
      if (rawData) {
        const d = JSON.parse(rawData);
        state.intros = d.intros || [];
        state.statement = d.statement || [];
        state.agreement = d.agreement || state.agreement;
        state.points = d.points !== undefined ? d.points : 0;
      } else {
        state.intros = [];
        state.statement = [];
        state.points = 0;
      }
      const rawCart = localStorage.getItem(`${STORAGE_KEY_CART}_${keyId}`);
      if (rawCart) {
        state.cart = JSON.parse(rawCart) || [];
      } else {
        state.cart = [];
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  // Theme Management
  function initTheme() {
    const saved = localStorage.getItem('partner_theme_v3') || 'light';
    document.documentElement.setAttribute('data-theme', saved);
    if (el.themeToggle) {
      el.themeToggle.addEventListener('click', () => {
        const cur = document.documentElement.getAttribute('data-theme') || 'light';
        const next = cur === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('partner_theme_v3', next);
      });
    }
  }

  // Update UI Stats, Headers & Cart Counters
  function updateUI() {
    const total = state.intros.length;
    const scheduled = state.intros.filter(i => ['Call Scheduled', 'Meeting Verified', 'Opportunity', 'Customer Closed'].includes(i.status)).length;
    const verified = state.intros.filter(i => ['Meeting Verified', 'Opportunity', 'Customer Closed'].includes(i.status)).length;
    const cashEst = (state.points * 0.1).toFixed(2);
    const cartCount = state.cart.reduce((sum, item) => sum + (item.quantity || 1), 0);

    // Header pills & cart counts
    if (el.navPointsVal) el.navPointsVal.textContent = state.points.toLocaleString();
    if (el.tabIntrosCount) el.tabIntrosCount.textContent = total;
    if (el.navCartCount) el.navCartCount.textContent = cartCount;
    if (el.cartItemCount) el.cartItemCount.textContent = cartCount;

    // Stats Strip
    if (el.kpiTotal) el.kpiTotal.textContent = total;
    if (el.kpiScheduled) el.kpiScheduled.textContent = scheduled;
    if (el.kpiVerified) el.kpiVerified.textContent = verified;
    if (el.kpiPoints) el.kpiPoints.textContent = state.points.toLocaleString();
    if (el.kpiCashEst) el.kpiCashEst.textContent = `≈ $${cashEst} USD`;

    // Earnings Card
    if (el.earningsCardBalance) el.earningsCardBalance.textContent = `${state.points.toLocaleString()} pts`;
    if (el.earningsCardUsd) el.earningsCardUsd.textContent = `Estimated Cash Value: $${cashEst} USD`;

    // Agreement Meta
    if (el.agreementMetaSigner) el.agreementMetaSigner.textContent = state.agreement.signedBy || 'Jordan Vance';
    if (el.agreementMetaDate) el.agreementMetaDate.textContent = state.agreement.signedAt || 'Oct 15, 2026';
    if (el.agreementMetaHash) el.agreementMetaHash.textContent = state.agreement.hash || '#IRM-88214-VERIFIED';
  }

  // Render Introductions Cards List
  function renderIntros() {
    if (!el.introsContainer) return;
    const query = (el.searchIntros ? el.searchIntros.value : '').trim().toLowerCase();
    const filter = el.filterIntroStatus ? el.filterIntroStatus.value : 'ALL';

    const filtered = state.intros.filter(item => {
      const matchQuery = !query || 
        item.name.toLowerCase().includes(query) ||
        item.company.toLowerCase().includes(query) ||
        item.email.toLowerCase().includes(query);
      const matchStatus = filter === 'ALL' || item.status === filter;
      return matchQuery && matchStatus;
    });

    if (filtered.length === 0) {
      el.introsContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-title">
            ${state.intros.length === 0 ? 'No introductions submitted yet' : 'No matching introductions'}
          </div>
          <div class="empty-state-desc">
            ${state.intros.length === 0 
              ? 'Introduce target executive buyers from your trusted advisory network. You will earn +200 points on submission.' 
              : 'Try clearing your search term or switching the status filter.'}
          </div>
          ${state.intros.length === 0 ? `
            <button type="button" class="btn btn-primary" onclick="document.getElementById('btn-open-add-fullscreen').click()">
              <svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" style="margin-right: 4px;"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Submit First Introduction
            </button>
          ` : ''}
        </div>
      `;
      return;
    }

    el.introsContainer.innerHTML = filtered.map(intro => {
      const initial = (intro.name || 'C').charAt(0).toUpperCase();
      const hasMeeting = intro.meetingDate ? `<span style="font-size:11px; color:var(--text-muted); font-family:var(--font-mono); display:block; margin-top:3px;">Proposed: ${escapeHTML(intro.meetingDate)} at ${escapeHTML(intro.meetingTime || '14:00')}</span>` : '';
      return `
        <div class="intro-card" data-id="${intro.id}">
          <div class="intro-info-col">
            <div class="avatar-initial">${initial}</div>
            <div>
              <div class="intro-name">
                ${escapeHTML(intro.name)}
                ${intro.linkedin ? `<a href="${escapeHTML(intro.linkedin)}" target="_blank" rel="noopener" style="margin-left:6px; font-size:11px; color:var(--text-muted); text-decoration:none;" title="LinkedIn Profile">↗</a>` : ''}
              </div>
              <div class="intro-sub">${escapeHTML(intro.title ? `${intro.title} · ${intro.company}` : intro.company)}</div>
              ${hasMeeting}
            </div>
          </div>

          <div class="intro-meta-col">
            <span class="intro-email">${escapeHTML(intro.email)}</span>
            <span class="status-badge">${escapeHTML(intro.warmth || 'Warm Network')}</span>
          </div>

          <div class="intro-status-col">
            <select class="select-input intro-status-dropdown" style="height:32px; font-size:12px; font-family:var(--font-display); width:160px;" data-id="${intro.id}">
              <option value="Intro Submitted" ${intro.status === 'Intro Submitted' ? 'selected' : ''}>Intro Submitted</option>
              <option value="Call Scheduled" ${intro.status === 'Call Scheduled' ? 'selected' : ''}>Call Scheduled</option>
              <option value="Meeting Verified" ${intro.status === 'Meeting Verified' ? 'selected' : ''}>Meeting Verified (+600)</option>
              <option value="Opportunity" ${intro.status === 'Opportunity' ? 'selected' : ''}>Opportunity (+1,000)</option>
              <option value="Customer Closed" ${intro.status === 'Customer Closed' ? 'selected' : ''}>Customer Closed (+5,000)</option>
            </select>
            <span class="points-pill">+${intro.pointsAwarded || 200} pts</span>
            <button type="button" class="btn btn-subtle btn-sm btn-delete-card" data-id="${intro.id}" title="Remove introduction" style="padding:0 8px; color:var(--text-faint);">✕</button>
          </div>
        </div>
      `;
    }).join('');

    // Attach listeners
    el.introsContainer.querySelectorAll('.intro-status-dropdown').forEach(sel => {
      sel.addEventListener('change', (e) => {
        updateIntroStatus(e.target.dataset.id, e.target.value);
      });
    });

    el.introsContainer.querySelectorAll('.btn-delete-card').forEach(btn => {
      btn.addEventListener('click', (e) => {
        deleteIntro(e.target.dataset.id);
      });
    });
  }

  // Render Statement History
  function renderStatement() {
    if (!el.statementRowsContainer) return;
    if (state.statement.length === 0) {
      el.statementRowsContainer.innerHTML = `
        <div style="padding: 32px; text-align: center; color: var(--text-muted); font-size: 13px;">
          No earnings activity recorded yet.
        </div>
      `;
      return;
    }

    el.statementRowsContainer.innerHTML = state.statement.slice().reverse().map(item => `
      <div class="statement-row">
        <div>
          <div style="font-weight: 600;">${escapeHTML(item.title)}</div>
          <div style="font-size: 12px; color: var(--text-muted);">${escapeHTML(item.date)} · ${escapeHTML(item.prospect)}</div>
        </div>
        <div style="font-family: var(--font-mono); font-weight: 700; ${item.amount > 0 ? 'color: var(--text);' : 'color: var(--text-muted);'}">
          ${item.amount > 0 ? `+${item.amount.toLocaleString()}` : item.amount.toLocaleString()} pts
        </div>
      </div>
    `).join('');
  }

  // ========================================================================
  // REWARDS MARKETPLACE CATALOG & CART LOGIC
  // ========================================================================

  function renderMarketplaceCatalog() {
    if (!el.marketplaceCatalogGrid) return;
    const cat = state.activeCategory || 'ALL';

    const filtered = CATALOG_ITEMS.filter(item => {
      if (cat === 'ALL') return true;
      if (cat === 'Gift Cards') return item.category === 'Gift Cards';
      if (cat === 'NGO Donations') return item.category === 'NGO Donations';
      if (cat === 'Travel & Lifestyle') return item.category === 'Travel & Lifestyle';
      if (cat === 'Direct Cash') return item.category === 'Direct Cash';
      return true;
    });

    el.marketplaceCatalogGrid.innerHTML = filtered.map(item => {
      const defaultDenom = item.denominations[0];
      const denomOptions = item.denominations.map((d, idx) => `
        <option value="${idx}">${escapeHTML(d.label)} · ${d.pts} pts</option>
      `).join('');

      return `
        <div class="reward-card" data-catalog-id="${item.id}">
          <div>
            <div class="reward-card-top">
              <div class="reward-brand-icon">${escapeHTML(item.brand)}</div>
              <span class="reward-card-cat">${escapeHTML(item.category)}</span>
            </div>
            <h3 class="reward-card-title">${escapeHTML(item.title)}</h3>
            <p class="reward-card-desc">${escapeHTML(item.desc)}</p>
          </div>

          <div>
            <div class="input-field-group" style="margin-bottom: 12px;">
              <label class="input-label" style="font-size: 11px;">Select Value / Tier</label>
              <select class="select-input reward-denom-select" style="height:34px; font-size:12px;" data-id="${item.id}">
                ${denomOptions}
              </select>
            </div>

            <div class="reward-card-pricing">
              <div>
                <div class="reward-pts-price" id="pts-display-${item.id}">${defaultDenom.pts} pts</div>
                <div class="reward-usd-eq" id="usd-display-${item.id}">Valued at $${defaultDenom.usd}.00 USD</div>
              </div>
              <button type="button" class="btn btn-primary btn-sm btn-add-to-cart" data-id="${item.id}">
                Add to Cart +
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Attach listeners for denomination changes
    el.marketplaceCatalogGrid.querySelectorAll('.reward-denom-select').forEach(sel => {
      sel.addEventListener('change', (e) => {
        const catalogId = e.target.dataset.id;
        const item = CATALOG_ITEMS.find(c => c.id === catalogId);
        if (!item) return;
        const selectedIndex = parseInt(e.target.value, 10);
        const denom = item.denominations[selectedIndex];
        if (denom) {
          const ptsEl = document.getElementById(`pts-display-${catalogId}`);
          const usdEl = document.getElementById(`usd-display-${catalogId}`);
          if (ptsEl) ptsEl.textContent = `${denom.pts} pts`;
          if (usdEl) usdEl.textContent = `Valued at $${denom.usd}.00 USD`;
        }
      });
    });

    // Attach listeners for Add to Cart
    el.marketplaceCatalogGrid.querySelectorAll('.btn-add-to-cart').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const catalogId = e.target.dataset.id;
        const item = CATALOG_ITEMS.find(c => c.id === catalogId);
        if (!item) return;
        const sel = el.marketplaceCatalogGrid.querySelector(`.reward-denom-select[data-id="${catalogId}"]`);
        const idx = sel ? parseInt(sel.value, 10) : 0;
        const denom = item.denominations[idx] || item.denominations[0];
        addToCart(item, denom);
      });
    });
  }

  // Add Item to Cart
  function addToCart(item, denom) {
    const existing = state.cart.find(c => c.catalogId === item.id && c.pts === denom.pts);
    if (existing) {
      existing.quantity += 1;
    } else {
      state.cart.push({
        cartId: `${item.id}_${denom.pts}_${Date.now()}`,
        catalogId: item.id,
        title: item.title,
        brand: item.brand,
        category: item.category,
        label: denom.label,
        pts: denom.pts,
        usd: denom.usd,
        quantity: 1
      });
    }

    saveState();
    updateUI();
    showToast(`Added ${item.title} (${denom.label}) to your cart.`);
  }

  // Update Cart Quantity
  function updateCartQty(cartId, delta) {
    const item = state.cart.find(c => c.cartId === cartId);
    if (!item) return;
    item.quantity += delta;
    if (item.quantity <= 0) {
      state.cart = state.cart.filter(c => c.cartId !== cartId);
    }
    saveState();
    updateUI();
    renderCartModal();
  }

  // Remove Item from Cart
  function removeCartItem(cartId) {
    state.cart = state.cart.filter(c => c.cartId !== cartId);
    saveState();
    updateUI();
    renderCartModal();
  }

  // Render Cart Modal
  function renderCartModal() {
    if (!el.cartItemsList) return;
    const totalPts = state.cart.reduce((sum, item) => sum + (item.pts * item.quantity), 0);
    const hasCashWire = state.cart.some(item => item.category === 'Direct Cash');

    if (el.cartAvailableBalance) el.cartAvailableBalance.textContent = `${state.points.toLocaleString()} pts`;
    if (el.cartTotalCost) el.cartTotalCost.textContent = `${totalPts.toLocaleString()} pts`;
    if (el.cartBtnPoints) el.cartBtnPoints.textContent = `${totalPts.toLocaleString()} pts`;

    // Show/hide bank wire section if ACH cash payout in cart
    if (el.cartBankWireSection) {
      el.cartBankWireSection.style.display = hasCashWire ? 'block' : 'none';
    }

    // Default email to user email
    if (el.cartDeliveryEmail && !el.cartDeliveryEmail.value && state.user) {
      el.cartDeliveryEmail.value = state.user.email || '';
    }

    if (state.cart.length === 0) {
      el.cartItemsList.innerHTML = `
        <div style="text-align: center; padding: 36px 16px; color: var(--text-muted); font-size: 13px;">
          Your rewards cart is empty.<br>Browse the catalog above to select gift cards, NGO donations, or cash wire transfers.
        </div>
      `;
      if (el.btnConfirmRedeemCart) el.btnConfirmRedeemCart.disabled = true;
      return;
    }

    if (el.btnConfirmRedeemCart) el.btnConfirmRedeemCart.disabled = false;

    el.cartItemsList.innerHTML = state.cart.map(item => `
      <div class="cart-item-row">
        <div>
          <div style="font-weight: 600; font-size: 14px;">${escapeHTML(item.title)}</div>
          <div style="font-size: 12px; color: var(--text-muted);">${escapeHTML(item.label)} · ${item.pts} pts each</div>
        </div>

        <div style="display: flex; align-items: center; gap: 16px;">
          <div class="cart-qty-ctrl">
            <button type="button" class="cart-qty-btn btn-cart-minus" data-id="${item.cartId}">–</button>
            <span class="cart-qty-val">${item.quantity}</span>
            <button type="button" class="cart-qty-btn btn-cart-plus" data-id="${item.cartId}">+</button>
          </div>
          <strong style="font-family: var(--font-mono); font-size: 13.5px; min-width: 70px; text-align: right;">
            ${(item.pts * item.quantity).toLocaleString()} pts
          </strong>
          <button type="button" class="btn btn-subtle btn-sm btn-cart-del" data-id="${item.cartId}" title="Remove" style="padding: 0 6px; color: var(--text-faint);">✕</button>
        </div>
      </div>
    `).join('');

    // Attach listeners
    el.cartItemsList.querySelectorAll('.btn-cart-minus').forEach(btn => {
      btn.addEventListener('click', (e) => updateCartQty(e.target.dataset.id, -1));
    });
    el.cartItemsList.querySelectorAll('.btn-cart-plus').forEach(btn => {
      btn.addEventListener('click', (e) => updateCartQty(e.target.dataset.id, 1));
    });
    el.cartItemsList.querySelectorAll('.btn-cart-del').forEach(btn => {
      btn.addEventListener('click', (e) => removeCartItem(e.target.dataset.id));
    });
  }

  // Handle Confirm Cart Checkout
  function handleConfirmCheckout() {
    const totalPts = state.cart.reduce((sum, item) => sum + (item.pts * item.quantity), 0);
    const email = el.cartDeliveryEmail.value.trim();
    const hasCashWire = state.cart.some(item => item.category === 'Direct Cash');
    const bankDetails = el.cartBankDetails.value.trim();

    if (totalPts <= 0) {
      alert('Your cart is empty. Please add items before checking out.');
      return;
    }

    if (totalPts > state.points) {
      alert(`Insufficient approved points. You have ${state.points.toLocaleString()} points, but your cart total is ${totalPts.toLocaleString()} points.`);
      return;
    }

    if (!email) {
      alert('Please enter a delivery email address for your electronic rewards and donation receipts.');
      return;
    }

    if (hasCashWire && !bankDetails) {
      alert('Please provide your bank routing and account number for the direct wire payout.');
      return;
    }

    const orderHash = `#REW-${Math.floor(10000 + Math.random() * 90000)}-CONFIRMED`;
    const summaryItems = state.cart.map(c => `${c.quantity}x ${c.title} (${c.label})`).join(', ');

    // Record ledger entry
    recordTransaction(`Rewards Redemption: ${state.cart.length} item(s)`, `${summaryItems} · Dispatched to ${email}`, -totalPts);

    // Update receipt modal
    if (el.receiptOrderHash) el.receiptOrderHash.textContent = orderHash;
    if (el.receiptPointsRedeemed) el.receiptPointsRedeemed.textContent = `${totalPts.toLocaleString()} pts ($${(totalPts * 0.1).toFixed(2)})`;
    if (el.receiptNewBalance) el.receiptNewBalance.textContent = `${state.points.toLocaleString()} pts`;

    // Clear cart
    state.cart = [];
    saveState();
    updateUI();

    closeAllModals();
    openModal(el.modalOrderSuccess);
    showToast(`Rewards order ${orderHash} processed successfully!`);
  }

  // Record Transaction in Ledger
  function recordTransaction(title, prospect, amount) {
    state.statement.push({
      id: Date.now() + Math.random(),
      title,
      prospect,
      amount,
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    });
    state.points = Math.max(0, state.points + amount);
    saveState();
    updateUI();
    renderStatement();
  }

  // Update Intro Status & Award Milestone Points
  function updateIntroStatus(id, newStatus) {
    const intro = state.intros.find(i => String(i.id) === String(id));
    if (!intro || intro.status === newStatus) return;

    intro.status = newStatus;
    let added = 0;

    if (newStatus === 'Meeting Verified' && !intro.meetingAwarded) {
      added = 600;
      intro.meetingAwarded = true;
    } else if (newStatus === 'Opportunity' && !intro.oppAwarded) {
      added = 1000;
      intro.oppAwarded = true;
    } else if (newStatus === 'Customer Closed' && !intro.closedAwarded) {
      added = 5000;
      intro.closedAwarded = true;
    }

    if (added > 0) {
      intro.pointsAwarded = (intro.pointsAwarded || 200) + added;
      recordTransaction(`Milestone: ${newStatus}`, `${intro.name} (${intro.company})`, added);
      showToast(`Milestone verified! +${added} points added to your balance.`);
    }

    saveState();
    updateUI();
    renderIntros();
  }

  // Delete Intro
  function deleteIntro(id) {
    const intro = state.intros.find(i => String(i.id) === String(id));
    if (!intro) return;
    if (!confirm(`Remove introduction for ${intro.name}?`)) return;

    state.intros = state.intros.filter(i => String(i.id) !== String(id));
    saveState();
    updateUI();
    renderIntros();
    showToast('Introduction removed from your roster.');
  }

  // Subtab Navigation Switcher
  function switchSubtab(activeTabName) {
    const tabs = [
      { name: 'intros', btn: el.tabSubIntros, panel: el.panelSubIntros },
      { name: 'earnings', btn: el.tabSubEarnings, panel: el.panelSubEarnings },
      { name: 'marketplace', btn: el.tabSubMarketplace, panel: el.panelSubMarketplace },
      { name: 'agreement', btn: el.tabSubAgreement, panel: el.panelSubAgreement }
    ];

    tabs.forEach(t => {
      const isActive = t.name === activeTabName;
      if (t.btn) t.btn.classList.toggle('active', isActive);
      if (t.panel) t.panel.style.display = isActive ? 'block' : 'none';
    });

    if (activeTabName === 'marketplace') {
      renderMarketplaceCatalog();
    }
  }

  // Handle Full-Screen Introduction Submission
  function handleSubmitFullscreenIntro() {
    const name = el.fsName.value.trim();
    const company = el.fsCompany.value.trim();
    const title = el.fsTitle.value.trim();
    const email = el.fsEmail.value.trim();
    const seniority = el.fsSeniority.value;
    const phone = el.fsPhone.value.trim();
    const linkedin = el.fsLinkedin.value.trim();
    const location = el.fsLocation.value.trim();
    const warmth = el.fsWarmth.value;
    const strength = el.fsStrength.value;
    const history = el.fsHistory.value.trim();
    const evalRole = el.fsEvalRole.value;
    const budget = el.fsBudget.value;
    const context = el.fsContext.value.trim();
    const meetingDate = el.fsMeetingDate.value;
    const meetingTime = el.fsMeetingTime.value;
    const meetingDuration = el.fsMeetingDuration.value;
    const meetingPlatform = el.fsMeetingPlatform.value;
    const partnerAttendance = el.fsPartnerAttendance.value;
    const briefing = el.fsBriefing.value.trim();

    if (!name || !company || !title || !email) {
      alert('Please fill out the Executive Full Name, Company, Title, and Work Email.');
      return;
    }

    if (!el.fsConsent.checked) {
      alert('Please confirm that you have explicit permission from this executive to coordinate this introductory discussion.');
      return;
    }

    const hasScheduledCall = Boolean(meetingDate);

    const newIntro = {
      id: Date.now(),
      name,
      company,
      title,
      seniority,
      email,
      phone,
      linkedin,
      location,
      warmth,
      strength,
      history,
      evalRole,
      budget,
      context,
      meetingDate,
      meetingTime,
      meetingDuration,
      meetingPlatform,
      partnerAttendance,
      briefing,
      status: hasScheduledCall ? 'Call Scheduled' : 'Intro Submitted',
      pointsAwarded: 200,
      createdAt: new Date().toISOString()
    };

    state.intros.unshift(newIntro);
    recordTransaction('Executive Intro & Scheduling', `${name} (${company})`, 200);

    // Reset Form fields
    el.fsName.value = '';
    el.fsCompany.value = '';
    el.fsTitle.value = '';
    el.fsEmail.value = '';
    el.fsPhone.value = '';
    el.fsLinkedin.value = '';
    el.fsLocation.value = '';
    el.fsHistory.value = '';
    el.fsContext.value = '';
    el.fsBriefing.value = '';

    closeFullscreenIntroWorkspace();
    renderIntros();
    showToast(`Introduction for ${name} submitted (+200 pts). Meeting coordination initiated.`);
  }

  // Auth Feedback Messaging
  function showAuthFeedback(msg, type = 'error') {
    if (!el.authFeedback) return;
    el.authFeedback.textContent = msg;
    el.authFeedback.style.display = 'block';
    if (type === 'error') {
      el.authFeedback.style.background = 'rgba(239, 68, 68, 0.08)';
      el.authFeedback.style.color = '#ef4444';
      el.authFeedback.style.border = '1px solid #ef4444';
    } else {
      el.authFeedback.style.background = 'var(--bg-subtle)';
      el.authFeedback.style.color = 'var(--text)';
      el.authFeedback.style.border = '1px solid var(--border)';
    }
  }

  function clearAuthFeedback() {
    if (el.authFeedback) {
      el.authFeedback.textContent = '';
      el.authFeedback.style.display = 'none';
    }
  }

  function getFriendlyAuthError(err) {
    if (!err) return 'Authentication error occurred.';
    const code = err.code || '';
    switch (code) {
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
        return 'Incorrect work email or password. Please verify your credentials.';
      case 'auth/email-already-in-use':
        return 'An account with this email address already exists. Please switch to Sign In.';
      case 'auth/weak-password':
        return 'Password must be at least 6 characters.';
      case 'auth/invalid-email':
        return 'Please enter a valid work email address.';
      case 'auth/popup-closed-by-user':
        return 'Google sign-in was cancelled.';
      case 'auth/popup-blocked':
        return 'Sign-in popup was blocked by your browser. Please allow popups for this domain.';
      case 'auth/unauthorized-domain':
        return 'Domain is not in the Firebase authorized list. Please open this app at http://localhost:8080 or use Email Sign In.';
      case 'auth/too-many-requests':
        return 'Too many sign-in attempts. Please wait a moment and try again.';
      default:
        return err.message || 'Authentication failed. Please try again.';
    }
  }

  // Firebase Auth Operations
  async function signInWithGoogle() {
    clearAuthFeedback();
    if (!auth) {
      showAuthFeedback('Firebase Auth service is unavailable.', 'error');
      return;
    }
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.addScope('email');
    provider.addScope('profile');
    try {
      if (el.btnGoogleAuth) {
        el.btnGoogleAuth.disabled = true;
        el.btnGoogleAuth.style.opacity = '0.7';
      }
      await auth.signInWithPopup(provider);
      // onAuthStateChanged triggers handleFirebaseUserSignedIn
    } catch (err) {
      console.error('Google Auth error:', err);
      showAuthFeedback(getFriendlyAuthError(err), 'error');
    } finally {
      if (el.btnGoogleAuth) {
        el.btnGoogleAuth.disabled = false;
        el.btnGoogleAuth.style.opacity = '1';
      }
    }
  }

  async function signInWithEmail(email, password) {
    clearAuthFeedback();
    if (!auth) {
      showAuthFeedback('Firebase Auth service is unavailable.', 'error');
      return;
    }
    const btn = el.btnSubmitSignin || el.formSignin?.querySelector('button[type="submit"]');
    try {
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Signing in...';
      }
      await auth.signInWithEmailAndPassword(email, password);
      // onAuthStateChanged triggers handleFirebaseUserSignedIn
    } catch (err) {
      console.error('Email sign-in error:', err);
      showAuthFeedback(getFriendlyAuthError(err), 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `
          Sign In with Email
          <svg class="icon icon-sm" viewBox="0 0 24 24" fill="none"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
        `;
      }
    }
  }

  async function signUpWithEmail(profileData) {
    clearAuthFeedback();
    if (!auth) {
      showAuthFeedback('Firebase Auth service is unavailable.', 'error');
      return;
    }
    const btn = el.btnSubmitSignup || el.formSignup?.querySelector('button[type="submit"]');
    try {
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Creating account...';
      }
      const cred = await auth.createUserWithEmailAndPassword(profileData.email, profileData.password);
      if (cred.user && profileData.fullName) {
        await cred.user.updateProfile({ displayName: profileData.fullName });
      }
      // Save custom profile metadata locally
      localStorage.setItem(`connectem_partner_meta_${cred.user.uid}`, JSON.stringify({
        fullName: profileData.fullName,
        company: profileData.company,
        jobTitle: profileData.jobTitle,
        domain: profileData.domain,
        linkedin: profileData.linkedin
      }));
      // onAuthStateChanged triggers handleFirebaseUserSignedIn
    } catch (err) {
      console.error('Email sign-up error:', err);
      showAuthFeedback(getFriendlyAuthError(err), 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `
          Create Partner Account
          <svg class="icon icon-sm" viewBox="0 0 24 24" fill="none"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
        `;
      }
    }
  }

  async function handleForgotPassword() {
    clearAuthFeedback();
    const emailField = document.getElementById('signin-email');
    const email = (emailField ? emailField.value : '').trim();
    if (!email) {
      showAuthFeedback('Please enter your work email address in the field above first.', 'error');
      if (emailField) emailField.focus();
      return;
    }
    if (!auth) {
      showAuthFeedback('Firebase Auth service is unavailable.', 'error');
      return;
    }
    try {
      await auth.sendPasswordResetEmail(email);
      showAuthFeedback(`A password reset link has been dispatched to ${email}.`, 'info');
      showToast('Password reset link sent.');
    } catch (err) {
      showAuthFeedback(getFriendlyAuthError(err), 'error');
    }
  }

  function handleFirebaseUserSignedIn(firebaseUser) {
    clearAuthFeedback();
    const uid = firebaseUser.uid;
    const email = firebaseUser.email || '';

    let meta = null;
    try {
      const raw = localStorage.getItem(`connectem_partner_meta_${uid}`);
      if (raw) meta = JSON.parse(raw);
    } catch (_) {}

    const fullName = meta?.fullName || firebaseUser.displayName || email.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || 'Executive Partner';
    const company = meta?.company || 'Advisory Partner';
    const jobTitle = meta?.jobTitle || 'Executive Partner';
    const domain = meta?.domain || 'Enterprise SaaS';

    const partnerUser = {
      uid,
      email,
      fullName,
      company,
      jobTitle,
      domain,
      photoURL: firebaseUser.photoURL || ''
    };

    loadState(uid, email);

    if (!state.agreement || !state.agreement.signedBy || state.agreement.signedBy === 'Jordan Vance') {
      state.agreement = {
        signed: true,
        signedBy: fullName,
        signedAt: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        hash: `#IRM-${uid.slice(0, 8).toUpperCase()}-VERIFIED`
      };
    }

    activateWorkspace(partnerUser);
  }

  function handleFirebaseUserSignedOut() {
    state.user = null;
    localStorage.removeItem(STORAGE_KEY_USER);
    if (el.viewAuth) el.viewAuth.style.display = 'block';
    if (el.viewWorkspace) el.viewWorkspace.style.display = 'none';
    if (el.signoutBtn) el.signoutBtn.style.display = 'none';
    if (el.navBalancePill) el.navBalancePill.style.display = 'none';
    if (el.btnNavCart) el.btnNavCart.style.display = 'none';
    closeFullscreenIntroWorkspace();
  }

  // Activate Workspace for User
  function activateWorkspace(user) {
    state.user = user;
    const firstName = (user.fullName || user.email?.split('@')[0] || 'Partner').split(' ')[0];
    if (el.userFirstName) el.userFirstName.textContent = firstName;
    if (el.userSubtext) el.userSubtext.textContent = `${user.company || 'Advisory Partner'} · ${user.jobTitle || 'Executive Partner'} · ${user.domain || 'Enterprise SaaS'}`;
    if (el.agreementSignerField) el.agreementSignerField.value = user.fullName || '';

    el.viewAuth.style.display = 'none';
    el.viewWorkspace.style.display = 'block';
    el.signoutBtn.style.display = 'inline-flex';
    el.navBalancePill.style.display = 'inline-flex';
    el.btnNavCart.style.display = 'inline-flex';

    saveState();
    updateUI();
    renderIntros();
    renderStatement();
    renderMarketplaceCatalog();
  }

  // Sign Out
  async function signout() {
    if (auth) {
      try {
        await auth.signOut();
      } catch (err) {
        console.warn('Sign out error:', err);
      }
    }
    handleFirebaseUserSignedOut();
    showToast('Signed out successfully.');
  }

  // Setup Event Listeners
  function initEvents() {
    // Auth Tab Switch
    el.tabAuthSignin.addEventListener('click', () => {
      clearAuthFeedback();
      el.tabAuthSignin.classList.add('active');
      el.tabAuthSignup.classList.remove('active');
      el.formSignin.style.display = 'block';
      el.formSignup.style.display = 'none';
    });

    el.tabAuthSignup.addEventListener('click', () => {
      clearAuthFeedback();
      el.tabAuthSignup.classList.add('active');
      el.tabAuthSignin.classList.remove('active');
      el.formSignup.style.display = 'block';
      el.formSignin.style.display = 'none';
    });

    // Google Single Sign-On
    if (el.btnGoogleAuth) {
      el.btnGoogleAuth.addEventListener('click', signInWithGoogle);
    }

    // Forgot Password Trigger
    if (el.btnForgotPassword) {
      el.btnForgotPassword.addEventListener('click', handleForgotPassword);
    }

    // Form Signin Submit
    el.formSignin.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = document.getElementById('signin-email').value.trim();
      const password = document.getElementById('signin-password').value;
      if (!email || !password) {
        showAuthFeedback('Please enter both work email and password.', 'error');
        return;
      }
      signInWithEmail(email, password);
    });

    // Form Signup Submit
    el.formSignup.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('signup-name').value.trim();
      const company = document.getElementById('signup-company').value.trim();
      const jobTitle = document.getElementById('signup-title').value.trim();
      const email = document.getElementById('signup-email').value.trim();
      const password = document.getElementById('signup-password').value;
      const domain = document.getElementById('signup-domain').value;
      const linkedin = document.getElementById('signup-linkedin') ? document.getElementById('signup-linkedin').value.trim() : '';
      const agree = document.getElementById('signup-agreement').checked;

      if (!agree) {
        showAuthFeedback('You must agree to the Standard Partner Network Agreement to create an account.', 'error');
        return;
      }
      if (password.length < 6) {
        showAuthFeedback('Password must be at least 6 characters long.', 'error');
        return;
      }

      signUpWithEmail({
        fullName: name,
        company,
        jobTitle,
        email,
        password,
        domain,
        linkedin
      });
    });

    // Sign Out
    el.signoutBtn.addEventListener('click', signout);

    // Workspace Subtabs Switchers
    el.tabSubIntros.addEventListener('click', () => switchSubtab('intros'));
    el.tabSubEarnings.addEventListener('click', () => switchSubtab('earnings'));
    el.tabSubMarketplace.addEventListener('click', () => switchSubtab('marketplace'));
    el.tabSubAgreement.addEventListener('click', () => switchSubtab('agreement'));

    // Request Payout Button in Earnings Card directly opens Marketplace
    el.btnOpenPayoutModal.addEventListener('click', () => {
      switchSubtab('marketplace');
      showToast('Welcome to the Rewards Marketplace. Pick your rewards and add to cart.');
    });

    // Marketplace Category Filters
    document.querySelectorAll('.marketplace-cat-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.marketplace-cat-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        state.activeCategory = e.target.dataset.category || 'ALL';
        renderMarketplaceCatalog();
      });
    });

    // Open Cart Modals
    el.btnNavCart.addEventListener('click', () => {
      renderCartModal();
      openModal(el.modalCartCheckout);
    });
    el.btnOpenCartHero.addEventListener('click', () => {
      renderCartModal();
      openModal(el.modalCartCheckout);
    });

    // Confirm Cart Checkout
    el.btnConfirmRedeemCart.addEventListener('click', handleConfirmCheckout);

    // Search & Filter
    el.searchIntros.addEventListener('input', renderIntros);
    el.filterIntroStatus.addEventListener('change', renderIntros);

    // Full-Screen Workspace Trigger & Close
    el.btnOpenAddFullscreen.addEventListener('click', openFullscreenIntroWorkspace);
    el.btnCloseFullscreen.addEventListener('click', closeFullscreenIntroWorkspace);
    if (el.btnSubmitIntroFullscreen) el.btnSubmitIntroFullscreen.addEventListener('click', handleSubmitFullscreenIntro);

    const btnSubmitBottom = document.getElementById('btn-submit-intro-bottom');
    if (btnSubmitBottom) btnSubmitBottom.addEventListener('click', handleSubmitFullscreenIntro);

    const btnCancelBottom = document.getElementById('btn-cancel-intro-bottom');
    if (btnCancelBottom) btnCancelBottom.addEventListener('click', closeFullscreenIntroWorkspace);

    // Modal Triggers
    el.btnOpenBulkModal.addEventListener('click', () => openModal(el.modalBulkCsv));
    el.btnReReadAgreement.addEventListener('click', () => openModal(el.modalAgreement));

    // Close Modals
    document.querySelectorAll('.modal-close').forEach(btn => {
      btn.addEventListener('click', closeAllModals);
    });

    window.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal-backdrop')) {
        closeAllModals();
      }
    });

    // Bulk CSV Confirm
    el.btnConfirmBulk.addEventListener('click', () => {
      const text = el.bulkPasteText.value.trim();
      if (!text) return;

      const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
      let count = 0;

      lines.forEach(line => {
        const parts = line.split(',').map(s => s.trim());
        if (parts.length >= 2) {
          const name = parts[0];
          const company = parts[1];
          const title = parts[2] || 'Executive';
          const email = parts[3] || `${name.toLowerCase().replace(/\s+/g, '.')}@${company.toLowerCase().replace(/[^a-z]/g, '')}.com`;
          const linkedin = parts[4] || '';

          state.intros.unshift({
            id: Date.now() + Math.random(),
            name,
            company,
            title,
            email,
            linkedin,
            warmth: 'Direct Former Colleague',
            status: 'Intro Submitted',
            pointsAwarded: 200
          });

          recordTransaction('Warm Intro (Bulk)', `${name} (${company})`, 200);
          count++;
        }
      });

      el.bulkPasteText.value = '';
      closeAllModals();
      renderIntros();
      showToast(`Imported ${count} executive introductions (+${count * 200} pts).`);
    });

    // Sign Terms Confirm
    el.btnConfirmSignTerms.addEventListener('click', () => {
      const signer = el.agreementSignerField.value.trim() || 'Partner';
      state.agreement = {
        signed: true,
        signedBy: signer,
        signedAt: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        hash: `#IRM-${Math.floor(10000 + Math.random() * 90000)}-VERIFIED`
      };
      saveState();
      updateUI();
      closeAllModals();
      showToast('Partner Network Agreement executed and recorded.');
    });
  }

  // Init
  function init() {
    initTheme();
    initEvents();

    if (auth) {
      auth.onAuthStateChanged((firebaseUser) => {
        if (firebaseUser) {
          handleFirebaseUserSignedIn(firebaseUser);
        } else {
          handleFirebaseUserSignedOut();
        }
      });
    } else {
      handleFirebaseUserSignedOut();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
