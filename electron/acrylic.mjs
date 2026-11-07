// Windows host backdrop settings, rendered by the per-window Windows Composition effect.
export const ACRYLIC_MATERIALS = Object.freeze(['gaussian']);
// Height of the strip the page reserves for dragging; matches the caption height Windows draws its buttons in.
export const ACRYLIC_TITLEBAR_HEIGHT = 32;
export const ACRYLIC_THEMES = Object.freeze(['system', 'light', 'dark']);
// Dark by default because Kapple Music's interface is dark-styled; System and Light stay available. The tint and
// luminosity layers start at 0, so what the user sees is the compositor's own blurred, saturated backdrop; the
// luminosity layer uses the theme's base colour (dark #202020, light #f3f3f3) and the tint any colour on top.
export const ACRYLIC_DEFAULTS = Object.freeze({
    material: 'gaussian', theme: 'dark', tintColor: '#000000', tintOpacity: 0, lumOpacity: 0,
    blurRadius: 0.6792668, saturation: 1.25, noise: 0.025,
});

const BUILD_RE = /^10\.0\.(\d+)/;

// Which Windows this is, from os.release() ("10.0.<build>"): 'win11', 'win10', or null for anything else.
export function windowsVersion(release, plat = process.platform) {
    const m = plat === 'win32' ? BUILD_RE.exec(String(release)) : null;
    return m ? (Number(m[1]) >= 22000 ? 'win11' : 'win10') : null;
}

// Windows 10 and 11 both use the same per-window Windows Composition Gaussian effect.
export function acrylicBackend(release, plat = process.platform) {
    if (!windowsVersion(release, plat)) return null;
    return { kind: 'composition', materials: ACRYLIC_MATERIALS };
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const unit = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback);

// Anything stored or received from the page becomes a valid settings object; bad fields fall back to the default.
// The settings object stays compatible with the saved acrylic preference while its material field migrates.
export function normalizeAcrylic(raw, materials = ACRYLIC_MATERIALS) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const d = ACRYLIC_DEFAULTS;
    return {
        material: materials.includes(r.material) ? r.material : d.material,
        theme: ACRYLIC_THEMES.includes(r.theme) ? r.theme : d.theme,
        tintColor: typeof r.tintColor === 'string' && HEX_COLOR.test(r.tintColor) ? r.tintColor.toLowerCase() : d.tintColor,
        tintOpacity: unit(r.tintOpacity, d.tintOpacity),
        lumOpacity: unit(r.lumOpacity, d.lumOpacity),
        blurRadius: unit(r.blurRadius, d.blurRadius),
        saturation: typeof r.saturation === 'number' && Number.isFinite(r.saturation) ? Math.min(2, Math.max(0, r.saturation)) : d.saturation,
        noise: Math.min(0.1, unit(r.noise, d.noise)),
    };
}

// The two overlay layers sit behind the interface (z-index -1, like the other background layers) and are
// hidden in the accent and custom-CSS themes, which paint their own opaque background. The luminosity layer
// is the theme's base colour; "none" turns it fully opaque so the window is a plain solid colour.
export const ACRYLIC_CSS = `
:root { --kapple-acrylic-lum: #202020; --kapple-acrylic-lum-opacity: 0; --kapple-acrylic-tint: rgba(0,0,0,0); --kapple-acrylic-noise: 0; }
@media (prefers-color-scheme: light) { :root { --kapple-acrylic-lum: #f3f3f3; } }
#_kappleAcrylicLum, #_kappleAcrylicTint { position: fixed; inset: 0; pointer-events: none; z-index: -1; }
#_kappleAcrylicLum { background: var(--kapple-acrylic-lum); opacity: var(--kapple-acrylic-lum-opacity); }
#_kappleAcrylicNoise { position: fixed; inset: 0; pointer-events: none; z-index: 0; opacity: var(--kapple-acrylic-noise); mix-blend-mode: soft-light;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E"); }
/* Windows hit-tests this transparent strip as HTCAPTION so DWM handles move, restore, and snap. */
#_kappleAcrylicDrag { position: fixed; top: 0; left: 0; width: 100%;
    height: ${ACRYLIC_TITLEBAR_HEIGHT}px; -webkit-app-region: drag; z-index: 2147483000; }
#_kappleAcrylicTint { background: var(--kapple-acrylic-tint); }
html[data-kapple-acrylic-material="none"] #_kappleAcrylicLum { opacity: 1 !important; }
body[data-kapple-mode="accent"] #_kappleAcrylicLum, body[data-kapple-mode="accent"] #_kappleAcrylicTint,
body[data-kapple-mode="custom"] #_kappleAcrylicLum, body[data-kapple-mode="custom"] #_kappleAcrylicTint { display: none !important; }
`;

// Page script that creates the layers on first use and updates them afterwards (safe to run any number of times).
// The main window has no native title bar, so it also gets the drag strip; a window with its own drag area (the
// mini player) passes { drag: false }.
export function acrylicOverlayScript(settings, { drag = true } = {}) {
    const s = normalizeAcrylic(settings);
    const n = parseInt(s.tintColor.slice(1), 16);
    const tint = `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${s.tintOpacity})`;
    return `(function(){
        if (!document.body) return;
        if (!document.getElementById('_kappleAcrylicStyle')) {
            const st = document.createElement('style'); st.id = '_kappleAcrylicStyle';
            st.textContent = ${JSON.stringify(ACRYLIC_CSS)};
            document.documentElement.appendChild(st);
        }
        if (!document.getElementById('_kappleAcrylicLum')) {
            const lum = document.createElement('div'); lum.id = '_kappleAcrylicLum';
            const tint = document.createElement('div'); tint.id = '_kappleAcrylicTint';
            document.body.prepend(tint); document.body.prepend(lum);
        }
        if (!document.getElementById('_kappleAcrylicNoise')) {
            const noise = document.createElement('div'); noise.id = '_kappleAcrylicNoise';
            document.body.appendChild(noise);
        }
        if (${drag === true} && !document.getElementById('_kappleAcrylicDrag')) {
            const drag = document.createElement('div'); drag.id = '_kappleAcrylicDrag';
            document.body.appendChild(drag);
        }
        const r = document.documentElement;
        r.style.setProperty('--kapple-acrylic-lum-opacity', ${JSON.stringify(String(s.lumOpacity))});
        r.style.setProperty('--kapple-acrylic-tint', ${JSON.stringify(tint)});
        const radius = 30 * Math.pow(${JSON.stringify(s.blurRadius)}, 1.25);
        r.style.setProperty('--kapple-acrylic-noise', ${JSON.stringify(String(s.noise))} * (1 - Math.exp(-radius / 4)));
        r.setAttribute('data-kapple-acrylic-material', ${JSON.stringify(s.material)});
    })()`;
}
