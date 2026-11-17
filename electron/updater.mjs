import path from 'path';
import { createWriteStream, chmodSync, renameSync, existsSync, accessSync, unlinkSync, constants as fsConstants } from 'fs';
import { Readable } from 'stream';

/**
 * Compare two semver-like version strings (e.g. 'v1.2.0' vs '1.1.1').
 * Returns true if remote is strictly newer than local.
 */
export function isNewerVersion(remote, local) {
    if (!remote || !local) return false;
    const clean = s => String(s).replace(/^v/, '').split('-')[0].trim();
    const r = clean(remote).split('.').map(n => parseInt(n, 10) || 0);
    const l = clean(local).split('.').map(n => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(r.length, l.length); i++) {
        const rv = r[i] || 0, lv = l[i] || 0;
        if (rv > lv) return true;
        if (rv < lv) return false;
    }
    return false;
}

/**
 * Detect how the app was packaged and launched:
 * - 'appimage': running from a portable .AppImage file
 * - 'installed': running an installed build (resources/BUILD_INFO present, e.g. ~/.local/lib/kapple-music)
 * - 'dev': running unpacked from git/source via electron .
 */
export function detectInstallMode({ envAppImage = process.env.APPIMAGE, execPath = process.execPath } = {}) {
    if (envAppImage) {
        return { mode: 'appimage', path: envAppImage };
    }
    const dir = path.dirname(execPath || '');
    if (existsSync(path.join(dir, 'resources', 'BUILD_INFO'))) {
        return { mode: 'installed', path: execPath, dir };
    }
    return { mode: 'dev', path: execPath };
}

let _cachedUpdateInfo = null;
let _lastUpdateCheckMs = 0;

/**
 * Check for newer releases via GitHub Releases API.
 * Throttled to once per 24 hours unless force = true.
 */
export async function checkAppUpdate({ currentVersion, netFetch, force = false, envAppImage = process.env.APPIMAGE, execPath = process.execPath }) {
    const now = Date.now();
    if (!force && _cachedUpdateInfo && (now - _lastUpdateCheckMs < 24 * 60 * 60 * 1000)) {
        return _cachedUpdateInfo;
    }
    try {
        const fetchFn = netFetch || globalThis.fetch;
        const res = await fetchFn('https://api.github.com/repos/Kapy2003/Kapple_Music/releases/latest', {
            headers: {
                'User-Agent': `Kapple-Music/${currentVersion}`,
                'Accept': 'application/vnd.github.v3+json',
            },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const tag = data.tag_name || '';
        const newer = isNewerVersion(tag, currentVersion);

        const install = detectInstallMode({ envAppImage, execPath });
        let asset = null;
        if (Array.isArray(data.assets)) {
            if (install.mode === 'appimage') {
                asset = data.assets.find(a => a.name?.endsWith('.AppImage'));
            } else if (install.mode === 'installed') {
                asset = data.assets.find(a => a.name?.endsWith('.run')) || data.assets.find(a => a.name?.endsWith('.AppImage'));
            } else {
                asset = data.assets.find(a => a.name?.endsWith('.run')) || data.assets.find(a => a.name?.endsWith('.AppImage'));
            }
        }

        _lastUpdateCheckMs = now;
        _cachedUpdateInfo = {
            hasUpdate: newer,
            currentVersion,
            latestVersion: tag.replace(/^v/, ''),
            releaseUrl: data.html_url || 'https://github.com/Kapy2003/Kapple_Music/releases/latest',
            releaseNotes: data.body || '',
            assetName: asset?.name || null,
            assetUrl: asset?.browser_download_url || null,
            assetSize: asset?.size || 0,
            installMode: install.mode,
            isAppImage: install.mode === 'appimage',
            isInstalled: install.mode === 'installed',
            isDev: install.mode === 'dev',
        };
        return _cachedUpdateInfo;
    } catch (err) {
        return { hasUpdate: false, currentVersion, error: err.message };
    }
}

/**
 * Downloads an update asset in the background to targetPath with progress reporting.
 */
export async function downloadAsset({ assetUrl, targetPath, netFetch, onProgress }) {
    const fetchFn = netFetch || globalThis.fetch;
    const resp = await fetchFn(assetUrl);
    if (!resp.ok) throw new Error(`Download failed: HTTP ${resp.status}`);

    const total = parseInt(resp.headers?.get?.('content-length') || '0', 10);
    let downloaded = 0;

    const fileStream = createWriteStream(targetPath);
    try {
        await new Promise((resolve, reject) => {
            const stream = Readable.fromWeb(resp.body);
            stream.on('data', chunk => {
                downloaded += chunk.length;
                if (onProgress) onProgress({ downloaded, total });
            });
            stream.pipe(fileStream);
            stream.on('error', reject);
            fileStream.on('finish', resolve);
            fileStream.on('error', reject);
        });
        chmodSync(targetPath, 0o755);
        return { ok: true, path: targetPath, downloaded, total };
    } catch (err) {
        try { unlinkSync(targetPath); } catch (_) {}
        throw err;
    }
}

/**
 * Downloads the updated AppImage, verifies writeability, and atomically replaces the running AppImage.
 */
export async function applyAppImageUpdate({ assetUrl, envAppImage = process.env.APPIMAGE, netFetch, onProgress }) {
    if (!envAppImage || !existsSync(envAppImage)) {
        return { ok: false, reason: 'not-appimage' };
    }
    const dir = path.dirname(envAppImage);
    try {
        accessSync(dir, fsConstants.W_OK);
    } catch (_) {
        return { ok: false, reason: 'dir-not-writable' };
    }

    const partPath = `${envAppImage}.update-${Date.now()}`;
    await downloadAsset({ assetUrl, targetPath: partPath, netFetch, onProgress });

    chmodSync(partPath, 0o755);
    renameSync(partPath, envAppImage);
    return { ok: true, path: envAppImage };
}
