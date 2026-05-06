#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_SRC="$ROOT/skills/brainmaster"
DEST_ROOT="${AGENT_SKILLS_DIR:-$HOME/.agents/skills}"
DEST="$DEST_ROOT/brainmaster"
BIN_DIR="${AGENT_BIN_DIR:-$HOME/.local/bin}"

mkdir -p "$DEST_ROOT" "$BIN_DIR"
rm -rf "$DEST"
cp -R "$SKILL_SRC" "$DEST"
chmod +x "$DEST/scripts/brainmaster.py"
ln -sf "$DEST/scripts/brainmaster.py" "$BIN_DIR/brainmaster"

python3 - <<'PY'
try:
    import requests  # noqa: F401
except Exception:
    raise SystemExit("Python package 'requests' is required. Install with: python3 -m pip install requests")
PY

echo "Installed brainmaster skill to $DEST"
echo "CLI linked at $BIN_DIR/brainmaster"
echo "Try: brainmaster login --email you@example.com"
