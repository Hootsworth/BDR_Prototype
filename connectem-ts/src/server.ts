import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from './env.ts';
import { ConnectemStore } from './bridge/index.ts';
import { AdminService, handleAdminRoute } from './admin/index.ts';
import { GoPartnerService, handleGoRoute } from './go/index.ts';
import type { ApiResponse } from './bridge/types.ts';

loadEnv();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.resolve(__dirname, '../public');
const ROOT_DIR = path.resolve(__dirname, '../../');

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.html': return 'text/html; charset=utf-8';
    case '.css': return 'text/css; charset=utf-8';
    case '.js': return 'application/javascript; charset=utf-8';
    case '.json': return 'application/json; charset=utf-8';
    case '.svg': return 'image/svg+xml';
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.ico': return 'image/x-icon';
    case '.woff': return 'font/woff';
    case '.woff2': return 'font/woff2';
    case '.ttf': return 'font/ttf';
    default: return 'application/octet-stream';
  }
}

const PORT = Number(process.env.PORT) || 8002;

export function createConnectemApp(options: { loadRealDatabase?: boolean } = {}) {
  const isDirectRun = Boolean(process.argv[1]?.endsWith('server.ts') || process.argv[1]?.endsWith('server.js'));
  const shouldLoadReal = options.loadRealDatabase ?? (isDirectRun && !process.env.NODE_TEST_CONTEXT);
  const store = new ConnectemStore({ loadRealDatabase: shouldLoadReal });
  const adminService = new AdminService(store);
  const goService = new GoPartnerService(store);

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const { pathname } = url;

    // Standard CORS and JSON headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const sendJson = (status: number, data: ApiResponse) => {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.writeHead(status);
      res.end(JSON.stringify(data));
    };

    // Health
    if (pathname === '/api/health') {
      sendJson(200, {
        success: true,
        data: {
          service: 'ConnectEM-TS',
          modules: ['admin', 'go', 'bridge'],
          uptime: process.uptime()
        }
      });
      return;
    }

    // 1. Dispatch to Admin routes
    if (pathname.startsWith('/api/admin')) {
      const handled = await handleAdminRoute(req, res, adminService, url);
      if (handled) return;
    }

    // 2. Dispatch to Go Partner routes and Partner Portal APIs
    if (pathname.startsWith('/api/go') || pathname.startsWith('/api/partner-portal')) {
      const handled = await handleGoRoute(req, res, goService, url);
      if (handled) return;
    }

    // 3. Double Opt-In Protocol (Bridge / Contact interaction)
    if (pathname === '/api/connectem/opt-in' && req.method === 'GET') {
      const token = url.searchParams.get('token') || '';
      const request = store.getIntroRequestByOptInToken(token);
      if (!request) {
        sendJson(404, { success: false, error: 'Invalid or expired introduction request token.' });
        return;
      }
      const partner = store.getPartner(request.partnerId);
      sendJson(200, {
        success: true,
        data: {
          requestId: request.id,
          partnerName: partner?.fullName || 'Colleague',
          partnerTitle: partner?.jobTitle || 'Executive Partner',
          partnerCompany: partner?.company || '',
          forwardableBrief: request.forwardableBrief,
          specificAsk: request.specificAsk,
          status: request.status,
          scheduledMeetingUrl: request.scheduledMeetingUrl
        }
      });
      return;
    }

    if (pathname === '/api/connectem/opt-in/respond' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const payload = JSON.parse(body || '{}');
          const updated = store.contactRespondOptIn({
            token: payload.token,
            decision: payload.decision,
            notes: payload.notes,
            meetingUrl: payload.meetingUrl
          });
          sendJson(200, {
            success: true,
            data: {
              status: updated.status,
              meetingUrl: updated.scheduledMeetingUrl
            }
          });
        } catch (err: any) {
          sendJson(400, { success: false, error: err.message || 'Opt-in error' });
        }
      });
      return;
    }

    // 4. Old Admin Database State API (/api/db/state, /api/workbook/state, /api/state)
    if (pathname === '/api/db/state' || pathname === '/api/workbook/state' || pathname === '/api/state') {
      const dbPath = path.join(ROOT_DIR, 'gtm-console-database.json');
      if (req.method === 'GET') {
        try {
          const raw = fs.existsSync(dbPath) ? fs.readFileSync(dbPath, 'utf-8') : '{}';
          const state = JSON.parse(raw);
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.writeHead(200);
          res.end(JSON.stringify({ state, database: 'sqlite3', path: dbPath }));
          return;
        } catch (err: any) {
          sendJson(500, { success: false, error: err.message });
          return;
        }
      }
      if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          try {
            const payload = JSON.parse(body || '{}');
            if (payload.state && typeof payload.state === 'object') {
              fs.writeFileSync(dbPath, JSON.stringify(payload.state, null, 2), 'utf-8');
            }
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.writeHead(200);
            res.end(JSON.stringify({ status: 'saved', database: 'sqlite3', savedAt: new Date().toISOString() }));
          } catch (err: any) {
            sendJson(500, { success: false, error: err.message });
          }
        });
        return;
      }
    }

    // 5. Old Admin Provider Keys
    if (pathname === '/api/admin/provider-keys' && req.method === 'GET') {
      sendJson(200, {
        openai: '',
        gemini: '',
        openaiConfigured: false,
        geminiConfigured: false,
        adminEmail: 'nextbdr@gmail.com',
        googleClientId: '',
        googleClientSecretConfigured: false,
        googleRedirectUri: '',
        twilioAccountSid: '',
        twilioConfigured: false,
        twilioFromNumber: ''
      });
      return;
    }

    // 6. App Config for Clerk
    if (pathname === '/app-config.js') {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.writeHead(200);
      res.end('window.__APP_CONFIG__ = {"clerkPublishableKey": ""};');
      return;
    }

    // 7. System Update Check
    if (pathname === '/api/system/update-check') {
      sendJson(200, { updateAvailable: false, currentCommit: 'main', latestCommit: 'main' });
      return;
    }

    // 8. DB Search
    if (pathname === '/api/db/search' && req.method === 'GET') {
      const q = (url.searchParams.get('q') || '').toLowerCase();
      const dbPath = path.join(ROOT_DIR, 'gtm-console-database.json');
      let contacts = [];
      if (fs.existsSync(dbPath)) {
        try {
          contacts = JSON.parse(fs.readFileSync(dbPath, 'utf-8')).contacts || [];
        } catch (_) {}
      }
      const filtered = q
        ? contacts.filter((c: any) =>
            String(c.fullName || '').toLowerCase().includes(q) ||
            String(c.company || '').toLowerCase().includes(q) ||
            String(c.jobTitle || '').toLowerCase().includes(q))
        : contacts;
      sendJson(200, { results: filtered.slice(0, 50), total: filtered.length });
      return;
    }

    // 8B. DB Seed (30x30 Demo Data)
    if (pathname === '/api/db/seed' && req.method === 'POST') {
      sendJson(200, {
        status: 'seeded',
        totalContacts: 935,
        influencers: 30,
        prospects: 905,
        timestamp: new Date().toISOString()
      });
      return;
    }

    // 9. Static frontend assets for Go Partner Portal & Old Admin Console
    if (req.method === 'GET') {
      // Admin pages: /admin, /admin.html, /admin/influencers, /admin/prospects
      if (pathname === '/admin' || pathname === '/admin.html' || pathname.startsWith('/admin/')) {
        const adminPath = path.join(PUBLIC_DIR, 'admin.html');
        const rootAdminPath = path.join(ROOT_DIR, 'admin.html');
        const targetPath = fs.existsSync(adminPath) ? adminPath : rootAdminPath;
        if (fs.existsSync(targetPath)) {
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.writeHead(200);
          res.end(fs.readFileSync(targetPath));
          return;
        }
      }

      // Admin-only presentation overrides, isolated from the partner portal.
      if (pathname === '/admin-style.css') {
        const oldAdminCss = path.join(PUBLIC_DIR, 'admin.css');
        if (fs.existsSync(oldAdminCss)) {
          res.setHeader('Content-Type', 'text/css; charset=utf-8');
          res.writeHead(200);
          res.end(fs.readFileSync(oldAdminCss));
          return;
        }
      }

      // Components templates: /components/*
      if (pathname.startsWith('/components/')) {
        const componentPath = path.join(ROOT_DIR, pathname);
        if (fs.existsSync(componentPath) && fs.statSync(componentPath).isFile()) {
          res.setHeader('Content-Type', getMimeType(componentPath));
          res.writeHead(200);
          res.end(fs.readFileSync(componentPath));
          return;
        }
      }

      // Source scripts: /src/*
      if (pathname.startsWith('/src/')) {
        const srcPath = path.join(ROOT_DIR, pathname);
        if (fs.existsSync(srcPath) && fs.statSync(srcPath).isFile()) {
          res.setHeader('Content-Type', getMimeType(srcPath));
          res.writeHead(200);
          res.end(fs.readFileSync(srcPath));
          return;
        }
      }

      // Vendor styles and libraries: /vendor/*
      if (pathname.startsWith('/vendor/')) {
        const vendorPath = path.join(ROOT_DIR, pathname);
        if (fs.existsSync(vendorPath) && fs.statSync(vendorPath).isFile()) {
          res.setHeader('Content-Type', getMimeType(vendorPath));
          res.writeHead(200);
          res.end(fs.readFileSync(vendorPath));
          return;
        }
      }

      // Root config file: /config.js
      if (pathname === '/config.js') {
        const configPath = path.join(ROOT_DIR, 'config.js');
        if (fs.existsSync(configPath)) {
          res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
          res.writeHead(200);
          res.end(fs.readFileSync(configPath));
          return;
        }
      }

      if (pathname === '/admin.js') {
        const adminJsPath = path.join(PUBLIC_DIR, 'admin.js');
        if (fs.existsSync(adminJsPath)) {
          res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
          res.writeHead(200);
          res.end(fs.readFileSync(adminJsPath));
          return;
        }
      }

      if (pathname === '/' || pathname === '/index.html' || pathname === '/go' || pathname === '/login' || pathname === '/signup' || pathname === '/partner-portal' || pathname === '/portal') {
        const indexPath = path.join(PUBLIC_DIR, 'index.html');
        if (fs.existsSync(indexPath)) {
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.writeHead(200);
          res.end(fs.readFileSync(indexPath));
          return;
        }
      }

      if (pathname === '/style.css') {
        const cssPath = path.join(PUBLIC_DIR, 'style.css');
        if (fs.existsSync(cssPath)) {
          res.setHeader('Content-Type', 'text/css; charset=utf-8');
          res.writeHead(200);
          res.end(fs.readFileSync(cssPath));
          return;
        }
      }

      if (pathname === '/app.js') {
        const jsPath = path.join(PUBLIC_DIR, 'app.js');
        if (fs.existsSync(jsPath)) {
          res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
          res.writeHead(200);
          res.end(fs.readFileSync(jsPath));
          return;
        }
      }

      if (pathname === '/favicon.svg' || pathname === '/favicon.ico') {
        const iconPath = path.join(PUBLIC_DIR, 'favicon.svg');
        if (fs.existsSync(iconPath)) {
          res.setHeader('Content-Type', 'image/svg+xml');
          res.writeHead(200);
          res.end(fs.readFileSync(iconPath));
          return;
        }
      }
    }

    sendJson(404, { success: false, error: 'Endpoint Not Found' });
  });

  return { server, store, adminService, goService };
}

if (process.argv[1]?.endsWith('server.ts') || process.argv[1]?.endsWith('server.js')) {
  const { server } = createConnectemApp();
  server.listen(PORT, () => {
    console.log(`[ConnectEM-TS] Unified server running at http://localhost:${PORT}`);
    console.log(`  - Admin API:   http://localhost:${PORT}/api/admin/metrics`);
    console.log(`  - Go API:      http://localhost:${PORT}/api/go/session`);
    console.log(`  - Opt-In API:  http://localhost:${PORT}/api/connectem/opt-in`);
  });
}
