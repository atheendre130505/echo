#!/usr/bin/env python3
"""Echo downloader: fetches a YouTube video as MP3 audio or MP4 video with yt-dlp.

Two ways to run it:
  python echo_dl.py --id VIDEO_ID --kind audio --out out/    # one download (used by GitHub Actions)
  python echo_dl.py --serve                                   # local helper for the Echo app on 127.0.0.1:8977
"""
import argparse
import glob
import json
import os
import re
import shutil
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

import yt_dlp

ID_RE = re.compile(r'^[\w-]{11}$')


def download(vid, kind, out):
    if not ID_RE.match(vid or ''):
        raise ValueError('bad video id')
    os.makedirs(out, exist_ok=True)
    opts = {
        'outtmpl': os.path.join(out, '%(title).120B [%(id)s].%(ext)s'),
        'noplaylist': True,
        'quiet': True,
        'no_warnings': True,
        'writethumbnail': kind == 'audio',
        'postprocessors': [],
    }
    has_ffmpeg = shutil.which('ffmpeg') is not None
    if kind == 'audio' and has_ffmpeg:
        opts['format'] = 'bestaudio/best'
        opts['postprocessors'] += [
            {'key': 'FFmpegExtractAudio', 'preferredcodec': 'mp3', 'preferredquality': '192'},
            {'key': 'FFmpegMetadata'},
            {'key': 'EmbedThumbnail'},
        ]
    elif kind == 'audio':  # no ffmpeg: keep YouTube's own M4A audio, no conversion needed
        opts['format'] = 'bestaudio[ext=m4a]/bestaudio'
        opts['writethumbnail'] = False
    elif has_ffmpeg:
        opts['format'] = 'bv*[height<=720][ext=mp4]+ba[ext=m4a]/b[height<=720][ext=mp4]/bv*[height<=720]+ba/b'
        opts['merge_output_format'] = 'mp4'
        opts['postprocessors'] += [{'key': 'FFmpegMetadata'}]
    else:  # no ffmpeg: a single file that already has video + audio
        opts['format'] = 'b[ext=mp4][height<=720]/b[ext=mp4]/b'
    with yt_dlp.YoutubeDL(opts) as y:
        info = y.extract_info('https://www.youtube.com/watch?v=' + vid, download=True)
    files = [f for f in glob.glob(os.path.join(glob.escape(out), f'*[[]{vid}[]].*'))
             if os.path.splitext(f)[1].lower() in ('.mp3', '.m4a', '.webm', '.opus', '.mp4')]
    if not files:
        raise RuntimeError('download produced no file')
    files.sort(key=os.path.getmtime)
    return files[-1], info.get('title') or vid


MIME = {'.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.opus': 'audio/ogg', '.webm': 'audio/webm', '.mp4': 'video/mp4'}


def default_out():
    termux = os.path.expanduser('~/storage/downloads')
    return os.path.join(termux if os.path.isdir(termux) else os.path.expanduser('~/Downloads'), 'Echo')


class Handler(BaseHTTPRequestHandler):
    out = default_out()

    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Private-Network', 'true')
        self.send_header('Access-Control-Allow-Headers', '*')
        self.send_header('Access-Control-Expose-Headers', 'Content-Disposition, Content-Length')

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self._cors()
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        u = urlparse(self.path)
        q = parse_qs(u.query)
        if u.path == '/ping':
            return self._json(200, {'ok': True, 'app': 'echo-dl', 'yt_dlp': yt_dlp.version.__version__})
        if u.path != '/download':
            return self._json(404, {'error': 'not found'})
        try:
            path, _ = download(q.get('id', [''])[0], q.get('kind', ['audio'])[0], self.out)
        except Exception as e:  # report the reason to the app
            return self._json(500, {'error': str(e)})
        self.send_response(200)
        self._cors()
        self.send_header('Content-Type', MIME.get(os.path.splitext(path)[1].lower(), 'application/octet-stream'))
        self.send_header('Content-Length', str(os.path.getsize(path)))
        self.end_headers()
        with open(path, 'rb') as f:
            while chunk := f.read(1 << 16):
                self.wfile.write(chunk)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--id')
    ap.add_argument('--kind', default='audio', choices=['audio', 'video'])
    ap.add_argument('--out', default=None, help='folder for files (default: Downloads/Echo when serving, ./out otherwise)')
    ap.add_argument('--serve', action='store_true')
    ap.add_argument('--port', type=int, default=8977)
    a = ap.parse_args()
    if a.serve:
        if a.out:
            Handler.out = a.out
        print(f'Echo downloader on http://127.0.0.1:{a.port} (files also saved to {Handler.out})')
        ThreadingHTTPServer(('127.0.0.1', a.port), Handler).serve_forever()
    else:
        path, title = download(a.id, a.kind, a.out or 'out')
        print(json.dumps({'file': path, 'title': title}))


if __name__ == '__main__':
    main()
