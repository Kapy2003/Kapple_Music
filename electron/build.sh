#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

# ── Install deps only when missing ───────────────────────────────────────────
if [ ! -f node_modules/.bin/electron ]; then
    npm install --save-dev electron electron-builder 2>/dev/null || true
fi

# ── Build renderer bundles injected into Apple Music ─────────────────────────
bash ../scripts/build-renderer.sh

# ── Build playback engine if missing and tools are available ──────────────────
if [ ! -f dist/resources/engine ] && command -v go >/dev/null 2>&1 && command -v make >/dev/null 2>&1; then
    echo "Building playback engine..."
    (npm run build:drm && npm run build:go) || echo "Playback engine build skipped; using Apple web playback fallback."
fi

# ── Bundle VLC libs (audio-only subset; no-op when already bundled) ──────────
bash ../scripts/bundle-vlc.sh 2>/dev/null || true

# ── Use bundled Electron from node_modules ────────────────────────────────────
ELECTRON=node_modules/.bin/electron

echo "Launching with bundled Electron $("$ELECTRON" --version 2>/dev/null)..."
exec "$ELECTRON" --no-sandbox . "$@"
