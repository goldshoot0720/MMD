#!/usr/bin/env python3
"""HyperStage local server for macOS / Linux.

Serves the "app" folder next to this file and opens the browser.  Unlike
`python3 -m http.server` it supports HTTP Range requests, which the browser
needs to seek inside the song.
"""
import http.server
import os
import re
import socketserver
import sys
import webbrowser

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'app')
EXTRA_TYPES = {
    '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.fbx': 'application/octet-stream',
    '.webp': 'image/webp', '.lrc': 'text/plain; charset=utf-8', '.mp3': 'audio/mpeg',
}


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, **EXTRA_TYPES}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def log_message(self, *args):
        pass

    def end_headers(self):
        self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def send_head(self):
        self.range = None
        header = self.headers.get('Range')
        path = self.translate_path(self.path)
        if not header or os.path.isdir(path) or not os.path.isfile(path):
            return super().send_head()
        match = re.match(r'bytes=(\d*)-(\d*)$', header.strip())
        if not match:
            return super().send_head()
        size = os.path.getsize(path)
        first, last = match.groups()
        if first:
            start, end = int(first), min(int(last), size - 1) if last else size - 1
        elif last:
            start, end = max(0, size - int(last)), size - 1
        else:
            return super().send_head()
        if start > end or start >= size:
            self.send_response(416)
            self.send_header('Content-Range', f'bytes */{size}')
            self.end_headers()
            return None
        f = open(path, 'rb')
        f.seek(start)
        self.range = end - start + 1
        self.send_response(206)
        self.send_header('Content-Type', self.guess_type(path))
        self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
        self.send_header('Content-Length', str(self.range))
        self.end_headers()
        return f

    def copyfile(self, source, outputfile):
        if getattr(self, 'range', None) is None:
            return super().copyfile(source, outputfile)
        remaining = self.range
        while remaining > 0:
            chunk = source.read(min(262144, remaining))
            if not chunk:
                break
            outputfile.write(chunk)
            remaining -= len(chunk)


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def main():
    if not os.path.isfile(os.path.join(ROOT, 'index.html')):
        sys.exit('找不到 app/index.html，請先完整解壓縮 ZIP。')
    for port in range(8765, 8795):
        try:
            server = Server(('127.0.0.1', port), Handler)
            break
        except OSError:
            continue
    else:
        sys.exit('無法開啟本機連接埠。')
    url = f'http://localhost:{port}/'
    print(f'\n  HyperStage 已啟動：{url}\n  關閉這個視窗（或按 Ctrl+C）即可停止。\n')
    if '--no-browser' not in sys.argv:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
