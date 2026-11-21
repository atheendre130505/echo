#!/usr/bin/env python3
"""Echo laptop service.

Runs on your laptop (starts with Windows) and:
  1. Reads your Echo likes, listening history and download requests from your
     private sync gist (the phone and the laptop both write to it).
  2. Downloads every one of those songs as MP3 into Music/Echo (yt-dlp).
  3. Puts the MP3s your phone doesn't have yet into an "inbox" in your private
     GitHub repo (echo-music, branch "inbox"). Echo on the phone downloads them
     from there into its own storage, so they play offline. Once the phone reports
     it has a song, it's removed from the inbox again, so the repo only ever holds
     songs that are still on their way to the phone.
  4. Serves the files to Echo in this laptop's own browser (127.0.0.1:8977).

Needs: Python with yt-dlp, ffmpeg (for MP3) and the GitHub CLI (gh) logged in
with the "gist" and "repo" scopes. Logs go to ~/.echo/laptop.log.
"""
import base64
import json
import os
import secrets
import subprocess
import sys
import threading
import time
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import echo_dl  # noqa: E402

HOME = Path.home() / '.echo'
MUSIC = Path.home() / 'Music' / 'Echo'
CFG = HOME / 'config.json'
LOG = HOME / 'laptop.log'
PORT = 8977
GIST_DESC = 'Echo sync (private)'
GIST_FILE = 'echo-sync.json'
REPO_NAME = 'echo-music'
INBOX_MAX = 400          # songs waiting for the phone at most (about 2 GB)
NOWIN = 0x08000000 if os.name == 'nt' else 0  # don't flash console windows


def log(*a):
    line = time.strftime('%Y-%m-%d %H:%M:%S ') + ' '.join(str(x) for x in a)
    try:
        if LOG.exists() and LOG.stat().st_size > 2_000_000:
            LOG.replace(LOG.with_suffix('.old.log'))
        with open(LOG, 'a', encoding='utf-8') as f:
            f.write(line + '\n')
    except Exception:
        pass
    try:
        if sys.stdout:
            print(line, flush=True)
    except Exception:
        pass


def load_cfg():
    HOME.mkdir(parents=True, exist_ok=True)
    c = json.loads(CFG.read_text()) if CFG.exists() else {}
    c.setdefault('blobs', {})          # video id -> blob sha already uploaded to the inbox
    return c


def save_cfg(c):
    CFG.write_text(json.dumps(c, indent=1))


# ---------- GitHub (through the gh CLI, which holds the login) ----------
def gh(*args, data=None):
    r = subprocess.run(['gh', 'api', *args] + (['--input', '-'] if data is not None else []),
                       input=json.dumps(data) if data is not None else None,
                       capture_output=True, text=True, encoding='utf-8', creationflags=NOWIN, timeout=300)
    if r.returncode:
        raise RuntimeError('gh ' + args[0] + ': ' + (r.stderr or r.stdout)[:200])
    return json.loads(r.stdout) if r.stdout.strip() else None


def me(c):
    if not c.get('user'):
        c['user'] = gh('user')['login']
        save_cfg(c)
    return c['user']


def find_gist(c):
    if c.get('gist'):
        return c['gist']
    for g in gh('gists?per_page=100') or []:
        if g.get('description') == GIST_DESC and GIST_FILE in g.get('files', {}):
            c['gist'] = g['id']
            break
    else:
        c['gist'] = gh('gists', '--method', 'POST', data={'description': GIST_DESC, 'public': False, 'files': {GIST_FILE: {'content': json.dumps({'v': 1})}}})['id']
        log('created sync gist', c['gist'])
    save_cfg(c)
    return c['gist']


def read_gist(gid):
    g = gh('gists/' + gid)
    f = g['files'].get(GIST_FILE) or {}
    text = f.get('content') or '{}'
    if f.get('truncated') and f.get('raw_url'):
        text = urllib.request.urlopen(f['raw_url'], timeout=60).read().decode('utf-8')
    try:
        return json.loads(text)
    except Exception:
        return {}


def write_gist(gid, data):
    gh('gists/' + gid, '--method', 'PATCH', data={'files': {GIST_FILE: {'content': json.dumps(data, separators=(',', ':'))}}})


def ensure_repo(c):
    repo = f'{me(c)}/{REPO_NAME}'
    try:
        gh('repos/' + repo)
    except Exception:
        gh('user/repos', '--method', 'POST', data={'name': REPO_NAME, 'private': True, 'description': 'Private MP3 inbox for the Echo app (personal use)', 'auto_init': True})
        log('created private repo', repo)
    return repo


# ---------- what you want on your devices ----------
def wanted(data):
    """Songs you liked, finished, played without skipping, or asked to download, newest first."""
    likes = {i for i, v in (data.get('likes') or {}).items() if v and v[0]}
    skipped, played, order = set(), set(), []
    for e in data.get('ev') or []:
        i, k = e[0], e[2]
        if k == 'skip':
            skipped.add(i)
        elif k in ('done', 'play', 'pick'):
            played.add(i)
            if k == 'done':
                skipped.discard(i)
        order.append(i)
    req = {i for ids in (data.get('req') or {}).values() for i in ids}
    ids = likes | req | {i for i in played if i not in skipped}
    rank = {i: n for n, i in enumerate(order)}
    return sorted((i for i in ids if echo_dl.ID_RE.match(i or '')), key=lambda i: (i not in req, -rank.get(i, 1e9)))


def on_all_phones(data):
    """Songs every phone (devices without their own downloader) already has."""
    phones = [set(d.get('ids') or []) for d in (data.get('have') or {}).values() if not d.get('local')]
    return set.intersection(*phones) if phones else set()


# ---------- the inbox ----------
def update_inbox(c, repo, data):
    """Upload songs the phone still needs and point the inbox branch at exactly that set."""
    done = on_all_phones(data)
    offer = [i for i in wanted(data) if i not in done and echo_dl.existing(i, str(MUSIC))][:INBOX_MAX]
    inbox = {}
    for i in offer:
        if i not in c['blobs']:
            path = echo_dl.existing(i, str(MUSIC))
            with open(path, 'rb') as f:
                content = base64.b64encode(f.read()).decode()
            c['blobs'][i] = gh(f'repos/{repo}/git/blobs', '--method', 'POST', data={'content': content, 'encoding': 'base64'})['sha']
            save_cfg(c)
            log('uploaded to inbox', os.path.basename(path))
        inbox[i] = c['blobs'][i]
    cur = (data.get('store') or {}).get('inbox') or {}
    if inbox == cur and (data.get('store') or {}).get('repo') == repo:
        return False
    # a fresh commit with no history each time, so removed songs don't pile up in the repo
    if not c.get('readme_blob'):
        c['readme_blob'] = gh(f'repos/{repo}/git/blobs', '--method', 'POST', data={'content': 'Songs waiting to be copied to Echo on your phone. Managed automatically.\n', 'encoding': 'utf-8'})['sha']
    tree = [{'path': 'README.md', 'mode': '100644', 'type': 'blob', 'sha': c['readme_blob']}]
    tree += [{'path': f'{i}.mp3', 'mode': '100644', 'type': 'blob', 'sha': sha} for i, sha in inbox.items()]
    t = gh(f'repos/{repo}/git/trees', '--method', 'POST', data={'tree': tree})['sha']
    commit = gh(f'repos/{repo}/git/commits', '--method', 'POST', data={'message': f'inbox: {len(inbox)} songs', 'tree': t, 'parents': []})['sha']
    try:
        gh(f'repos/{repo}/git/refs/heads/inbox', '--method', 'PATCH', data={'sha': commit, 'force': True})
    except Exception:
        gh(f'repos/{repo}/git/refs', '--method', 'POST', data={'ref': 'refs/heads/inbox', 'sha': commit})
    for i in list(c['blobs']):
        if i not in inbox:
            del c['blobs'][i]   # gone from the inbox; GitHub cleans up the file
    save_cfg(c)
    data['store'] = {'repo': repo, 'inbox': inbox}
    log(f'inbox now has {len(inbox)} songs')
    return True


def sync_loop(c):
    gid = repo = None
    while True:
        try:
            gid = gid or find_gist(c)
            repo = repo or ensure_repo(c)
            data = read_gist(gid)
            todo = [i for i in wanted(data) if not echo_dl.existing(i, str(MUSIC))]
            if todo:
                log(f'{len(todo)} songs to download')
            for i in todo[:25]:  # a batch per round; the next round continues
                try:
                    path, _ = echo_dl.download(i, 'audio', str(MUSIC))
                    log('downloaded', os.path.basename(path))
                except Exception as e:
                    log('download failed', i, str(e)[:160])
                time.sleep(2)
            data = read_gist(gid)  # fresh copy before writing back
            changed = update_inbox(c, repo, data)
            laptop = {'name': os.environ.get('COMPUTERNAME', 'laptop'), 'at': int(time.time() * 1000)}
            if changed or time.time() * 1000 - (data.get('laptop') or {}).get('at', 0) > 10 * 60e3:
                data['laptop'] = laptop
                write_gist(gid, data)
        except Exception as e:
            log('sync error:', e)
        time.sleep(90)


# ---------- Echo in this laptop's own browser ----------
class Handler(echo_dl.Handler):
    out = str(MUSIC)

    def authorized(self, q):  # only this laptop's own browser can reach 127.0.0.1
        return True

    def log_message(self, *a):
        pass


def serve():
    MUSIC.mkdir(parents=True, exist_ok=True)
    ThreadingHTTPServer(('127.0.0.1', PORT), Handler).serve_forever()


def main():
    c = load_cfg()
    c.pop('key', None)
    log('Echo laptop service starting; music folder:', MUSIC)
    threading.Thread(target=serve, daemon=True).start()
    sync_loop(c)


if __name__ == '__main__':
    main()
