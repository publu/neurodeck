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

echo "Installed Neurodeck skill to $DEST"
echo "CLI linked at $BIN_DIR/neurodeck"
echo "Try: neurodeck login --email you@example.com"
