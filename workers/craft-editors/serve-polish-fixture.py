"""Read-only localhost fixture server for an exact unpacked native CI artifact."""
import argparse
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import mimetypes
from pathlib import Path
import re
from urllib.parse import unquote, urlsplit


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--package', required=True, type=Path)
    parser.add_argument('--wasm-sha256', required=True)
    parser.add_argument('--port', type=int, default=8935)
    args = parser.parse_args()
    package = args.package.resolve(strict=True)
    wasm = list(package.glob('*.wasm'))
    if not re.fullmatch(r'[a-f0-9]{64}', args.wasm_sha256) or len(wasm) != 1:
        parser.error('Supply one native package and its exact CI WASM SHA256')
    if hashlib.sha256(wasm[0].read_bytes()).hexdigest() != args.wasm_sha256:
        parser.error('Native WASM differs from the accepted CI artifact')
    fixtures = Path(__file__).resolve().parent / 'fixtures' / 'edm-polish'

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            path = unquote(urlsplit(self.path).path)
            if path.startswith('/native/'):
                base, relative = package, path[len('/native/'):]
            elif path in ['/', '/index.html', '/design.json', '/capabilities.json']:
                base, relative = fixtures, 'index.html' if path == '/' else path[1:]
            else:
                self.send_error(404)
                return
            target = (base / relative).resolve()
            if base not in target.parents or not target.is_file():
                self.send_error(404)
                return
            data = target.read_bytes()
            self.send_response(200)
            self.send_header('Content-Type', 'application/wasm' if target.suffix == '.wasm' else mimetypes.guess_type(target.name)[0] or 'application/octet-stream')
            self.send_header('Content-Length', str(len(data)))
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.end_headers()
            self.wfile.write(data)

    print(f'Local fixture http://127.0.0.1:{args.port}/ ; WASM {args.wasm_sha256}', flush=True)
    ThreadingHTTPServer(('127.0.0.1', args.port), Handler).serve_forever()


if __name__ == '__main__':
    main()
