#!/usr/bin/env bash
# build-renderer.sh — builds every bundle injected into the Apple Music page from its
# source in electron/src/, so none of them can be packaged stale:
#
#   engine-bundle.js      esbuild  src/engine-playback.js (+ src/engine/*.js)
#   engine-sse-bundle.js  esbuild  src/engine-sse.js
#   smart-cache-bundle.js esbuild  src/smart-cache.js
#   vision-bundle.js      verbatim copy of src/vision-glass.js
#
# main.mjs prefers a bundle in <resources>/ over the one in app.asar, so when an unpacked
# build exists its copies are refreshed too.
#
# Usage: scripts/build-renderer.sh

set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
exec node "$REPO/electron/build-renderer.mjs"
