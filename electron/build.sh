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
if [ ! -f dist/resources/engine ]; then
    if command -v go >/dev/null 2>&1 && command -v make >/dev/null 2>&1; then
        echo "Building playback engine..."
        npm run build:drm && npm run build:go
    else
        echo "WARNING: Go or Make is missing! Playback engine (dist/resources/engine) could not be built."
        echo "Lossless (ALAC) playback and in-process DRM require Go and build-essential."
    fi
fi

# ── Bundle VLC libs (audio-only subset; no-op when already bundled) ──────────
bash ../scripts/bundle-vlc.sh

# ── Use bundled Electron from node_modules ────────────────────────────────────
ELECTRON=node_modules/.bin/electron

echo "Launching with bundled Electron $("$ELECTRON" --version 2>/dev/null)..."
exec "$ELECTRON" --no-sandbox . "$@"
