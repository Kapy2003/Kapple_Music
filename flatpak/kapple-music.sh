#!/bin/sh
# zypak runs Electron's Chromium sandbox through the Flatpak sandbox.
exec zypak-wrapper.sh /app/kapple-music/kapple-music --ozone-platform-hint=auto "$@"
