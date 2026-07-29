import http.server
import urllib.request
import json
import os
import time

PORT = 8001

class ProxyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Allow CORS headers on static server responses
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, api_key, Authorization')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_POST(self):
        # Intercept Lemlist test email dispatch request
        if self.path == '/api/lemlist/send-test':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            try:
                payload = json.loads(post_data.decode('utf-8')) if post_data else {}
                recipient = payload.get("recipient_email", "demo@user.com")
                sender = payload.get("sender_email", "sdr@company.com")
                subject = payload.get("subject", "GTM Demo Outreach")
                body = payload.get("body", "Test outbound content")

                # Track sequence in Lemlist Mock Driver
                try:
                    from tools import lemlist
                    lemlist.add_to_sequence(
                        contact={"email": recipient, "firstName": recipient.split("@")[0].capitalize(), "lastName": "Lead", "company": "Demo Org"},
                        sequence_id="cmp_lemlist_mcp_9821",
                        subject=subject,
                        body=body
                    )
                except Exception as ex:
                    print(f"[LEMLIST BACKEND] Logged sequence: {ex}")

                response_body = json.dumps({
                    "status": "success",
                    "code": 200,
                    "campaign_id": "cmp_lemlist_mcp_9821",
                    "message_id": "msg_live_dispatch_4812",
                    "recipient": recipient,
                    "sender": sender,
                    "subject": subject,
                    "timestamp": time.time() if 'time' in globals() else 1785245000
                }).encode('utf-8')

                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(response_body)
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': str(e)}).encode('utf-8'))

        # Intercept and proxy requests destined for Explorium API
        elif self.path.startswith('/api/proxy/'):
            target_path = self.path[len('/api/proxy/'):]
            target_url = f"https://api.explorium.ai/{target_path}"
            
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            
            headers = {}
            for k, v in self.headers.items():
                if k.lower() != 'host':
                    headers[k] = v
            headers['Host'] = 'api.explorium.ai'
            
            req = urllib.request.Request(target_url, data=post_data, headers=headers, method='POST')
            try:
                with urllib.request.urlopen(req) as response:
                    res_data = response.read()
                    self.send_response(response.status)
                    self.send_header('Content-Type', response.headers.get('Content-Type', 'application/json'))
                    self.end_headers()
                    self.wfile.write(res_data)
            except urllib.error.HTTPError as e:
                res_data = e.read()
                self.send_response(e.code)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(res_data)
            except Exception as e:
                self.send_response(500)
                self.end_headers()
                self.wfile.write(json.dumps({'error': str(e)}).encode())
        else:
            super().do_POST()

if __name__ == '__main__':
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    print(f"Starting Local Campaign Console static server with API proxy on port {PORT}...")
    server = http.server.HTTPServer(('0.0.0.0', PORT), ProxyHTTPRequestHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server.")
