#!/usr/bin/env python3
# Tells the Lights page what the Music app is playing, so Album Art can use its cover without screen sharing.
# Run it on the Mac:  python3 now-playing.py   (leave the window open; Ctrl+C stops it)
# The first time, macOS asks to let Terminal control Music: choose OK.
#
#   GET /now  ->  {"playing": true, "id": "...", "title": "...", "artist": "...", "album": "..."}
#   GET /art  ->  the current song's cover (JPEG or PNG)
#
# Only answers on this computer (127.0.0.1). Uses only what comes with macOS and Python.
import json, os, subprocess, tempfile, threading, time, urllib.parse, urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = 47800
SEP = "␟"
ART_FILE = os.path.join(tempfile.gettempdir(), "lights-now-playing-art")

NOW_SCRIPT = f'''
if application "Music" is not running then return "stopped"
tell application "Music"
  if player state is not playing then return "stopped"
  set t to current track
  set pid to ""
  try
    set pid to persistent ID of t
  end try
  return "playing" & "{SEP}" & pid & "{SEP}" & (name of t) & "{SEP}" & (artist of t) & "{SEP}" & (album of t)
end tell
'''

# Writes the cover the Music app has for the current song to ART_FILE. Streamed songs sometimes have none.
ART_SCRIPT = f'''
tell application "Music"
  set t to current track
  if (count of artworks of t) = 0 then return "none"
  set d to raw data of artwork 1 of t
end tell
set f to open for access (POSIX file "{ART_FILE}") with write permission
set eof f to 0
write d to f
close access f
return "ok"
'''

def osa(script):
    r = subprocess.run(["osascript", "-e", script], capture_output=True, text=True, timeout=10)
    if r.returncode:
        raise RuntimeError(r.stderr.strip())
    return r.stdout.strip()

def now_playing():
    parts = osa(NOW_SCRIPT).split(SEP)
    if parts[0] != "playing":
        return {"playing": False}
    _, pid, title, artist, album = (parts + [""] * 5)[:5]
    return {"playing": True, "id": pid or f"{artist}|{album}|{title}", "title": title, "artist": artist, "album": album}

lock = threading.Lock()
cache = {"id": None, "art": None}

def cover():
    """The current song's cover as (bytes, content type): from the Music app, else looked up on the iTunes Store."""
    song = now_playing()
    if not song["playing"]:
        return None
    with lock:
        if cache["id"] == song["id"]:
            return cache["art"]
        art = None
        try:
            if osa(ART_SCRIPT) == "ok":
                with open(ART_FILE, "rb") as f:
                    data = f.read()
                art = (data, "image/png" if data[:4] == b"\x89PNG" else "image/jpeg")
        except Exception as e:
            print("Couldn't read the cover from Music:", e)
        if not art:
            art = lookup(song)
        cache.update(id=song["id"], art=art)
        return art

def lookup(song):
    q = urllib.parse.urlencode({"term": f'{song["artist"]} {song["album"] or song["title"]}', "entity": "album", "limit": 1})
    try:
        with urllib.request.urlopen("https://itunes.apple.com/search?" + q, timeout=8) as r:
            results = json.load(r).get("results", [])
        if not results:
            return None
        url = results[0]["artworkUrl100"].replace("100x100bb", "600x600bb")
        with urllib.request.urlopen(url, timeout=8) as r:
            return (r.read(), "image/jpeg")
    except Exception as e:
        print("Couldn't look up the cover online:", e)
        return None

class Handler(BaseHTTPRequestHandler):
    def headers_out(self, status, ctype=None):
        self.send_response(status)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Cache-Control", "no-store")
        if ctype:
            self.send_header("Content-Type", ctype)

    def do_OPTIONS(self):
        self.headers_out(204)
        self.send_header("Access-Control-Allow-Methods", "GET")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.end_headers()

    def do_GET(self):
        path = self.path.split("?")[0]
        try:
            if path == "/now":
                body, ctype = json.dumps(now_playing()).encode(), "application/json"
            elif path == "/art":
                art = cover()
                if not art:
                    self.headers_out(404); self.end_headers(); return
                body, ctype = art
            else:
                self.headers_out(404); self.end_headers(); return
        except Exception as e:
            body, ctype = json.dumps({"playing": False, "error": str(e)}).encode(), "application/json"
            print("Music didn't answer:", e)
        self.headers_out(200, ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass

if __name__ == "__main__":
    print(f"Sharing what Music is playing with the Lights page (port {PORT}). Leave this open; Ctrl+C to stop.")
    try:
        print("Now:", now_playing())
    except Exception as e:
        print("Couldn't ask Music yet:", e)
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
