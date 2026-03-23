"""
Example Python extension — a simple agent dashboard.

This is a minimal ASGI app (no framework dependencies) that the
Conduit gateway can proxy to. It reads PORT and HOST from the
environment (set automatically by the gateway's ProcessManager).

For a real dashboard you'd use FastAPI, Flask, or Starlette and
connect to your agent via the LangGraph Python SDK.
"""

import json
import os
from http.server import HTTPServer, BaseHTTPRequestHandler


class DashboardHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/api/status":
            self._json_response(200, {
                "status": "ok",
                "runtime": "python",
                "agent_url": os.environ.get("LANGGRAPH_API_URL", "not set"),
            })
        elif self.path == "/":
            self._html_response(200, """
            <!DOCTYPE html>
            <html>
            <head><title>Agent Dashboard</title></head>
            <body>
                <h1>Agent Dashboard</h1>
                <p>This is a Python extension served through the Conduit gateway.</p>
                <pre id="status">Loading...</pre>
                <script>
                    fetch('./api/status')
                        .then(r => r.json())
                        .then(d => document.getElementById('status').textContent = JSON.stringify(d, null, 2));
                </script>
            </body>
            </html>
            """)
        else:
            self._json_response(404, {"error": "not found"})

    def _json_response(self, status, data):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _html_response(self, status, html):
        body = html.encode()
        self.send_response(status)
        self.send_header("Content-Type", "text/html")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        print(f"[dashboard] {format % args}")


if __name__ == "__main__":
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "8001"))
    server = HTTPServer((host, port), DashboardHandler)
    print(f"Dashboard listening on {host}:{port}")
    server.serve_forever()
