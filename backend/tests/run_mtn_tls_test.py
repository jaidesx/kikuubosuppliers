"""Run the existing MTN client test against the local PHP mock over verified TLS."""
import http.client
import http.server
import os
from pathlib import Path
import socket
import ssl
import subprocess
import tempfile
import threading
import time

root = Path(__file__).resolve().parents[2]
with tempfile.TemporaryDirectory(prefix='kikuubo-mtn-') as directory:
    directory = Path(directory)
    cert, key = directory / 'cert.pem', directory / 'key.pem'
    subprocess.run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
                    '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1',
                    '-keyout', str(key), '-out', str(cert)], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    with socket.socket() as probe:
        probe.bind(('127.0.0.1', 0))
        port = probe.getsockname()[1]
    php = subprocess.Popen(['php', '-S', f'127.0.0.1:{port}', str(root / 'backend/tests/mtn_mock_router.php')], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    class Proxy(http.server.BaseHTTPRequestHandler):
        def handle_request(self):
            connection = http.client.HTTPConnection('127.0.0.1', port)
            body = self.rfile.read(int(self.headers.get('Content-Length', 0)))
            connection.request(self.command, self.path, body, dict(self.headers))
            result = connection.getresponse()
            self.send_response(result.status)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(result.read())
            connection.close()
        do_GET = handle_request
        do_POST = handle_request
        def log_message(self, *args):
            pass
    server = None
    try:
        for _ in range(50):
            try:
                with socket.create_connection(('127.0.0.1', port), timeout=.1):
                    break
            except OSError:
                time.sleep(.05)
        server = http.server.ThreadingHTTPServer(('127.0.0.1', 18443), Proxy)
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.load_cert_chain(cert, key)
        server.socket = context.wrap_socket(server.socket, server_side=True)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        subprocess.run(['php', '-d', f'curl.cainfo={cert}', 'backend/tests/mtn_client_test.php'], cwd=root, check=True)
    finally:
        if server:
            server.shutdown()
            server.server_close()
        php.terminate()
        php.wait(timeout=5)
