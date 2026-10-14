"""Vercel adapter for the existing local HTTP API.

Vercel invokes Python functions from api/*.py. The local app's server.py is
still the source of truth; this adapter preserves the original route path
after vercel.json rewrites /api/* here.
"""
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlsplit, urlencode

from firebase_backend import set_vercel_oidc_token
from server import ProxyHTTPRequestHandler


class handler(ProxyHTTPRequestHandler):
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
        set_vercel_oidc_token(self.headers.get("x-vercel-oidc-token"))
        try:
            self._restore_route()
            return ProxyHTTPRequestHandler.do_GET(self)
        finally:
            set_vercel_oidc_token("")

    def do_POST(self):
        set_vercel_oidc_token(self.headers.get("x-vercel-oidc-token"))
        try:
            self._restore_route()
            return ProxyHTTPRequestHandler.do_POST(self)
        finally:
            set_vercel_oidc_token("")
