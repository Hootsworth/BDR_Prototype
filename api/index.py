"""Vercel adapter for the existing local HTTP API.

Vercel invokes Python functions from api/*.py. The local app's server.py is
still the source of truth; this adapter preserves the original route path
after vercel.json rewrites /api/* here.
"""
from http.server import BaseHTTPRequestHandler
import hmac
import os
from urllib.parse import parse_qs, urlsplit, urlencode

from firebase_backend import set_vercel_oidc_token
from server import ProxyHTTPRequestHandler


class handler(ProxyHTTPRequestHandler):
    def _is_trusted_bridge_request(self):
        if not os.environ.get("VERCEL") or urlsplit(self.path).path != "/_python":
            return True
        expected = str(os.environ.get("VERCEL_BACKEND_BRIDGE_SECRET") or "")
        supplied = str(self.headers.get("x-connectem-bridge-secret") or "")
        return bool(expected and supplied and hmac.compare_digest(expected, supplied))

    def _restore_route(self):
        parsed = urlsplit(self.path)
        query = parse_qs(parsed.query, keep_blank_values=True)
        route = query.pop("route", [""])[0]
        if not route:
            route = parsed.path.removeprefix("/api/")
        original_query = urlencode(query, doseq=True)
        self.path = "/app-config.js" if route == "app-config.js" else "/api/" + route.lstrip("/")
        if original_query:
            self.path += "?" + original_query

    def do_GET(self):
        if not self._is_trusted_bridge_request():
            self.send_error(404)
            return
        set_vercel_oidc_token(self.headers.get("x-connectem-oidc-token"))
        try:
            self._restore_route()
            return ProxyHTTPRequestHandler.do_GET(self)
        finally:
            set_vercel_oidc_token("")

    def do_POST(self):
        if not self._is_trusted_bridge_request():
            self.send_error(404)
            return
        set_vercel_oidc_token(self.headers.get("x-connectem-oidc-token"))
        try:
            self._restore_route()
            return ProxyHTTPRequestHandler.do_POST(self)
        finally:
            set_vercel_oidc_token("")
