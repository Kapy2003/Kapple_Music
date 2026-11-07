#!/usr/bin/env bash
# Kapple Music — self-extracting installer
# Usage: ./kapple-music.run [--force] [--system] [--no-lossless] [--uninstall]
#
# Options:
# --system       install to /opt/kapple-music + /usr/local/bin (needs sudo)
# --force        overwrite an existing installation without prompting
# --no-lossless  skip fetching Apple's Android FairPlay libraries
# --uninstall    remove installed files and desktop entry
set -euo pipefail

VERSION="__VERSION__"
SYSTEM_INSTALL=0
FORCE=0
SKIP_LOSSLESS=0
UNINSTALL=0
INSTALL_DIR="${XDG_DATA_HOME:-$HOME/.local/lib}/kapple-music"
BIN_DIR="${XDG_BIN_HOME:-$HOME/.local/bin}"
DESKTOP_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
ICON_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor/512x512/apps"

for arg in "$@"; do
    case "$arg" in
        --system)      SYSTEM_INSTALL=1 ;;
        --force)       FORCE=1 ;;
        --no-lossless) SKIP_LOSSLESS=1 ;;
        --uninstall)   UNINSTALL=1 ;;
        -h|--help)
            echo "Usage: $0 [--force] [--system] [--no-lossless] [--uninstall]"
            exit 0
            ;;
        *) echo "Unknown option: $arg" >&2; exit 2 ;;
    esac
done

# The command is installed as `kapple-music`. The standard home for user executables is
# ~/.local/bin, which modern distributions (Ubuntu 20.04+, Fedora, Arch) put on PATH
# out of the box via /etc/profile or systemd environment.d.
#
# If neither is set, we still place it in ~/.local/bin and warn the user.
pick_user_bin() {
    # 1. User's explicit XDG_BIN_HOME
    if [ -n "${XDG_BIN_HOME:-}" ] && [ -d "$XDG_BIN_HOME" ]; then
        echo "$XDG_BIN_HOME"; return
    fi
    # 2. ~/.local/bin — preferred modern standard
    if [ -d "$HOME/.local/bin" ]; then
        echo "$HOME/.local/bin"; return
    fi
    # 3. ~/bin — traditional fallback
    if [ -d "$HOME/bin" ]; then
        echo "$HOME/bin"; return
    fi
    # Default to ~/.local/bin (will be created)
    echo "$HOME/.local/bin"
}

if [ "$SYSTEM_INSTALL" -eq 1 ]; then
    INSTALL_DIR="/opt/kapple-music"
    BIN_DIR="/usr/local/bin"
    DESKTOP_DIR="/usr/share/applications"
    ICON_DIR="/usr/share/icons/hicolor/512x512/apps"
    if [ "$(id -u)" -ne 0 ]; then
        echo "Error: --system requires root (run with sudo)" >&2
        exit 1
    fi
else
    BIN_DIR="$(pick_user_bin)"
fi

if [ "$UNINSTALL" -eq 1 ]; then
    rm -rf "$INSTALL_DIR"
    # Clean up launcher from wherever it might have been installed
    for d in "$BIN_DIR" "$HOME/.local/bin" "$HOME/bin" "/usr/local/bin"; do
        if [ -f "$d/kapple-music" ] && grep -qF "$INSTALL_DIR/kapple-music" "$d/kapple-music" 2>/dev/null; then
            rm -f "$d/kapple-music"
        fi
    done
    rm -f  "$DESKTOP_DIR/kapple-music.desktop"
    rm -f  "$ICON_DIR/kapple-music.png"
    update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true
    echo "Uninstalled Kapple Music."
    exit 0
fi

# Detect existing installation
if [ -d "$INSTALL_DIR" ] && [ "$FORCE" -eq 0 ]; then
    INSTALLED_VER=""
    [ -f "$INSTALL_DIR/resources/BUILD_INFO" ] && \
        INSTALLED_VER=$(grep '^version=' "$INSTALL_DIR/resources/BUILD_INFO" | cut -d= -f2 || true)
    if [ "$INSTALLED_VER" = "$VERSION" ]; then
        echo "Kapple Music $VERSION is already installed."
        echo "Run: kapple-music   or pass --force to reinstall."
        exit 0
    elif [ -n "$INSTALLED_VER" ]; then
        echo "Upgrading Kapple Music from $INSTALLED_VER to $VERSION..."
    fi
fi

# Pre-flight: make sure we have the tools needed to unpack
for tool in tar zstd; do
    if ! command -v "$tool" >/dev/null 2>&1; then
        echo "Error: '$tool' is required to extract this installer." >&2
        case "$tool" in
            zstd) echo "Install it with: sudo apt install zstd  (or dnf install zstd / pacman -S zstd)" >&2 ;;
        esac
        exit 1
    fi
done

# We run with set -e, so any tar/zstd error will abort before we touch
# launchers or desktop entries.
echo "Installing Kapple Music $VERSION..."
mkdir -p "$INSTALL_DIR"
mkdir -p "$BIN_DIR" "$DESKTOP_DIR" "$ICON_DIR"

# Extract payload (everything after __PAYLOAD_BELOW__)
PAYLOAD_LINE=$(grep -a -n '^__PAYLOAD_BELOW__$' "$0" | cut -d: -f1)
tail -n +"$((PAYLOAD_LINE + 1))" "$0" | zstd -d -q | tar -xf - -C "$INSTALL_DIR" --strip-components=1

# Ensure main binaries are executable
chmod +x \
    "$INSTALL_DIR/kapple-music" \
    "$INSTALL_DIR/chrome-sandbox" \
    "$INSTALL_DIR/resources/engine" \
    2>/dev/null || true

# chrome-sandbox needs root:root 4755 for SUID sandbox, otherwise electron
# falls back to user namespaces (fine on modern kernels).
if [ "$SYSTEM_INSTALL" -eq 1 ]; then
    chown root:root "$INSTALL_DIR/chrome-sandbox" 2>/dev/null || true
    chmod 4755 "$INSTALL_DIR/chrome-sandbox" 2>/dev/null || true
fi

# Create launcher wrapper (needed because electron without SUID sandbox needs --no-sandbox
# on kernels where unprivileged user namespaces are disabled, e.g. Debian/AppArmor)
cat > "$BIN_DIR/kapple-music" <<EOF
#!/usr/bin/env sh
exec "$INSTALL_DIR/kapple-music" --no-sandbox "\$@"
EOF
chmod +x "$BIN_DIR/kapple-music"

# Install icon: look inside resources/ for the bundled icon
APP_ICON=""
for icon_candidate in \
    "$INSTALL_DIR/resources/icon.png" \
    "$INSTALL_DIR/resources/app.asar.unpacked/icon.png" \
    "$INSTALL_DIR/icon.png"; do
    if [ -f "$icon_candidate" ]; then
        APP_ICON="$icon_candidate"
        break
    fi
done
if [ -n "$APP_ICON" ]; then
    cp "$APP_ICON" "$ICON_DIR/kapple-music.png" 2>/dev/null || true
fi

# Install desktop entry
# StartupWMClass matches the Chromium window class so GNOME/KDE pin to this entry.
# MimeType registers all Apple Music link schemes + our own kapple-music://.
cat > "$DESKTOP_DIR/kapple-music.desktop" <<EOF
[Desktop Entry]
Name=Kapple Music
Comment=Apple Music desktop player
GenericName=Music Player
Exec=$INSTALL_DIR/kapple-music --no-sandbox %u
Icon=kapple-music
Type=Application
Categories=AudioVideo;Audio;Player;
StartupWMClass=Kapple Music
MimeType=x-scheme-handler/kapple-music;x-scheme-handler/kapple;x-scheme-handler/music;x-scheme-handler/musics;x-scheme-handler/itms;x-scheme-handler/itmss;x-scheme-handler/itunes;x-scheme-handler/itals;x-scheme-handler/italss;x-scheme-handler/itvls;x-scheme-handler/itvlss;x-scheme-handler/itsradio;x-scheme-handler/itunesradio;x-scheme-handler/daap;x-scheme-handler/itpc;x-scheme-handler/ame;
Terminal=false
Keywords=music;apple;player;streaming;audio;
EOF
chmod 644 "$DESKTOP_DIR/kapple-music.desktop"

# Register kapple-music:// scheme handler
xdg-mime default kapple-music.desktop x-scheme-handler/kapple-music 2>/dev/null || true
xdg-mime default kapple-music.desktop x-scheme-handler/kapple 2>/dev/null || true

# Post-install: FairPlay libraries
# Apple's Android FairPlay libraries cannot be redistributed with Kapple Music, so they are
# fetched from an official Apple APK by fetch-fairplay-libs.sh.
FETCH_SCRIPT="$INSTALL_DIR/resources/fetch-fairplay-libs.sh"
if [ "$SKIP_LOSSLESS" -eq 0 ] && [ -x "$FETCH_SCRIPT" ]; then
    echo "Fetching FairPlay libraries for lossless playback..."
    if ! "$FETCH_SCRIPT"; then
        echo ""
        echo "Notice: FairPlay library download was not completed."
        echo "Lossless playback is off for now; Kapple Music will retry on its next launch,"
        echo "or you can run it manually:"
        echo "  $FETCH_SCRIPT"
        echo ""
    fi
fi

update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true
gtk-update-icon-cache -f -t "$(dirname "$ICON_DIR")" 2>/dev/null || true

echo ""
echo "Kapple Music $VERSION installed to $INSTALL_DIR"
echo "Launcher: $BIN_DIR/kapple-music"

# Check if launcher is reachable on PATH
if ! command -v kapple-music >/dev/null 2>&1; then
    echo ""
    echo "Note: $BIN_DIR is not on your PATH in this session, so 'kapple-music' will not be"
    echo "found until you add it. Add this to your ~/.bashrc or ~/.zshrc:"
    echo ""
    echo "    export PATH=\"$BIN_DIR:\$PATH\""
    echo ""
    echo "Until then:  $BIN_DIR/kapple-music"
fi

echo ""
echo "Run with: kapple-music"
exit 0

__PAYLOAD_BELOW__
