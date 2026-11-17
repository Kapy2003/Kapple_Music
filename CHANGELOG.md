# Changelog

All notable changes to Kapple Music, from the first release. The format follows Keep a
Changelog, and releases are numbered MAJOR.MINOR.PATCH.

## [1.1.7] - 2026-11-17

### Added
- **Updates**: added "Check for Updates…" directly into the system tray / taskbar context menu with native dialog feedback.
- **Settings**: promoted the Updates section with current client version and update check button to the top of the Settings dialog.

### Fixed
- **UI & Navigation**: fixed floating sidebar expander disappearing when collapsing the sidebar; enforced direct inline styling and JS display management in `_syncSidebarDOM`.
- **Fullscreen & Takeover**: eliminated false fullscreen triggers in `checkFullscreenState`; properly hides the floating navigation in active full-window lyrics mode and video takeover while preserving visibility during normal browsing.
- **Wayland / KDE Transparency**: restricted window transparency to compositors providing native blur-behind (Hyprland and KDE X11), preventing completely transparent window voids on KDE Wayland.
- **Preload**: resolved synchronous application version retrieval via IPC to prevent module load failures on startup.

## [1.1.6] - 2026-11-17

### Added
- **Updater**: added native zero-dependency in-place OTA updater via GitHub Releases for AppImage builds.
- **Miniplayer**: added floating miniplayer toggle button to collapsed sidebar navigation.

### Security
- **Dependencies**: updated Electron to v43.8.10 with security fixes (including CVE-2026-2212).

## [1.1.5] - 2026-11-17

### Added
- **Playback**: added offline player fallback page (`offline.html`) when network connectivity is lost, with offline playback controls.
- **Audio**: wired Dolby Atmos capabilities detection and requests.

### Fixed
- **Branding**: replaced leftover legacy strings and log statements with Kapple Music branding.
- **UI**: initial floating navigation bar integration for collapsed sidebar mode.

## [1.1.4] - 2026-11-09

### Fixed
- **Playback**: isolated VLC mute actions strictly to speaker control clicks (`amp-volume-control`, `[aria-label*="volume"]`, `[aria-label*="mute"]`) and mute keybinds, preventing track initialization from auto-muting audio on song clicks.
- **Miniplayer**: fixed play/pause and volume icon state desynchronization when switching tracks; miniplayer volume now mirrors user mute state instead of dummy audio element state.
- **Documentation**: overhauled README with verified build targets, accurate project tree, and Apple Account modal sheet documentation.

## [1.1.3] - 2026-11-09

### Fixed
- **UI**: unblocked click and scroll events in the collapsed sidebar margin, setting pointer-events to none when the sidebar is retracted.

## [1.1.2] - 2026-11-09

### Added
- **Authentication**: added macOS-styled modal account sheet for Apple ID sign-in, verification code entry, and lossless FairPlay activation.

### Fixed
- **UI**: centered main page content and zeroed layout offsets when the sidebar is collapsed; eliminated black screen flash and transition lag during sidebar toggle.
- **Navigation**: restored working back/forward sidebar navigation buttons.
- **Miniplayer**: fixed favorite (love) button action in the miniplayer.
- **Settings**: set "Show in Up Next" toggle to off by default.
- **Packaging**: ensured desktop application menu icon and taskbar icon are correctly installed and displayed.

## [1.1.1] - 2026-11-08

### Fixed
- **Miniplayer**: prevented volume auto-muting by preserving volume state across track transitions and disabling Chromium native window occlusion.
- **Build**: dynamically synchronized application version from git tag in GitHub release workflow and build scripts.

## [1.1.0] - 2026-11-08

### Added
- **Installer**: added self-extracting `.run` installer script (`kapple-music.run`) for rootless user installs.
- **UI**: added collapsible sidebar and glass UI performance optimizations.

### Fixed
- **Playback**: eliminated 2-second playback stutter on track start and ensured reliable FairPlay ALAC session initialization.
- **DRM**: automated Android stub compilation, fixed international phone number formatting for 2FA, and ensured robust session status detection.

## [1.0.2] - 2026-11-08

### Added
- **UI**: native window dragging and streamlined desktop UI with direct VLC ALAC playback.

## [1.0.1] - 2026-11-08

### Changed
- **Architecture**: transitioned to a pure Linux-focused client; stripped dead Windows platform code and Flatpak manifests for a lean codebase.

## [1.0.0] - 2026-11-07

### Added
- **Release**: initial release of Kapple Music for Linux, featuring lossless ALAC up to 192kHz, visionOS glass UI, AppImage packaging, and automated CI/CD.
