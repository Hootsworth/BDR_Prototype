const { getVercelOidcToken } = require('@vercel/oidc');

const HOP_BY_HOP_HEADERS = new Set([
  'accept-encoding',
  'connection',
  'content-encoding',
  'content-length',
  'host',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

module.exports = async function handler(req, res) {
  try {
    const requestUrl = new URL(req.url || '/', `https://${req.headers.host || 'localhost'}`);
    const route = requestUrl.searchParams.get('route') || '';
    if (!route || route.startsWith('_python')) {
      res.statusCode = 404;
      res.end('Not found.');
      return;
    }
    const bridgeSecret = process.env.VERCEL_BACKEND_BRIDGE_SECRET;
    if (!bridgeSecret) throw new Error('The backend bridge is not configured.');

    // Vercel exposes its short-lived OIDC token through its Node request context.
    // The Python runtime cannot read that context, so pass it server-to-server.
    const oidcToken = await getVercelOidcToken();
    const host = process.env.VERCEL_URL || req.headers.host || 'localhost:8001';
    const protocol = host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https';
    const forwardedUrl = new URL(`${protocol}://${host}/_python`);
    for (const [key, value] of requestUrl.searchParams) {
      forwardedUrl.searchParams.append(key, value);
    }

    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) {
      if (!value || HOP_BY_HOP_HEADERS.has(name.toLowerCase())) continue;
      headers.set(name, Array.isArray(value) ? value.join(', ') : value);
    }
    // Explicitly request uncompressed content from upstream Python to avoid double/mismatched compression
    headers.set('accept-encoding', 'identity');
    // Vercel reserves and strips x-vercel-* headers on internal fetches.
    // Carry the signed token in an app-specific header instead.
    headers.set('x-connectem-oidc-token', oidcToken);
    headers.set('x-connectem-bridge-secret', bridgeSecret);
    if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
      headers.set('x-vercel-protection-bypass', process.env.VERCEL_AUTOMATION_BYPASS_SECRET);
    }

    let body;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const chunks = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      body = Buffer.concat(chunks);
    }

    const upstream = await fetch(forwardedUrl, {
      method: req.method,
      headers,
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(55000),
    });
    res.statusCode = upstream.status;
    upstream.headers.forEach((value, name) => {
      const lower = name.toLowerCase();
      if (!HOP_BY_HOP_HEADERS.has(lower) && lower !== 'content-encoding' && lower !== 'content-length') {
        res.setHeader(name, value);
      }
    });
    res.end(Buffer.from(await upstream.arrayBuffer()));
  } catch (error) {
    console.error('Vercel OIDC backend bridge failed:', error?.message || 'unknown error');
    res.statusCode = 502;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'The hosted backend could not complete its identity exchange.' }));
  }
};
