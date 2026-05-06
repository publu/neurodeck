#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_SRC="$ROOT/skills/neurodeck"
DEST_ROOT="${AGENT_SKILLS_DIR:-$HOME/.agents/skills}"
DEST="$DEST_ROOT/neurodeck"
BIN_DIR="${AGENT_BIN_DIR:-$HOME/.local/bin}"

mkdir -p "$DEST_ROOT" "$BIN_DIR"
rm -rf "$DEST"
rm -rf "$DEST_ROOT/brainmaster"
cp -R "$SKILL_SRC" "$DEST"
chmod +x "$DEST/scripts/neurodeck.py"
ln -sf "$DEST/scripts/neurodeck.py" "$BIN_DIR/neurodeck"
rm -f "$BIN_DIR/brainmaster"

python3 - <<'PY'
try:
    import requests  # noqa: F401
except Exception:
    raise SystemExit("Python package 'requests' is required. Install with: python3 -m pip install requests")
PY

if command -v npm >/dev/null 2>&1; then
  npm --prefix "$DEST" install --silent
  if [ "${NEURODECK_SKIP_BROWSER_INSTALL:-0}" != "1" ]; then
    npx --prefix "$DEST" playwright install chromium
    if [ "$(id -u)" = "0" ]; then
      npx --prefix "$DEST" playwright install-deps chromium
    else
      echo "NOTE: website QA may need OS browser libraries. If capture fails, run as root: npx --prefix $DEST playwright install-deps chromium" >&2
    fi
  fi
else
  echo "WARN: npm not found; website QA needs Node + Playwright." >&2
fi

echo "Installed Neurodeck skill to $DEST"
echo "CLI linked at $BIN_DIR/neurodeck"
echo "Try: neurodeck login --email you@example.com"
