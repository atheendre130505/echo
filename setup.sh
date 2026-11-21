#!/data/data/com.termux/files/usr/bin/bash
# Echo download helper: one-time setup for Termux (Android).
# Installs Python, ffmpeg and yt-dlp, downloads echo_dl.py, and makes it
# start automatically whenever Termux opens. Run it again any time to update.
set -e
BASE="https://atheendre130505.github.io/echo"

echo "==> Installing Python, ffmpeg and yt-dlp (takes a few minutes the first time)"
pkg update -y
pkg install -y python ffmpeg
pip install -U yt-dlp

echo "==> Asking for storage access so songs can go to Downloads/Echo"
termux-setup-storage || true
sleep 3

mkdir -p "$HOME/echo"
curl -fsSL "$BASE/echo_dl.py" -o "$HOME/echo/echo_dl.py"

# start the helper whenever Termux opens (only once)
START='pgrep -f "echo_dl.py --serve" >/dev/null || (termux-wake-lock 2>/dev/null; nohup python "$HOME/echo/echo_dl.py" --serve >"$HOME/echo/helper.log" 2>&1 &)'
grep -q "echo_dl.py --serve" "$HOME/.bashrc" 2>/dev/null || echo "$START" >> "$HOME/.bashrc"

pkill -f "echo_dl.py --serve" 2>/dev/null || true
eval "$START"
sleep 2
if curl -fs http://127.0.0.1:8977/ping >/dev/null; then
  echo
  echo "Done! Go back to Echo and tap Download. Keep Termux running in the background."
else
  echo "The helper did not start. See $HOME/echo/helper.log"
fi
