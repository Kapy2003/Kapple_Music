import test from 'node:test';
import assert from 'node:assert/strict';
import { isNewerVersion, checkAppUpdate, applyAppImageUpdate } from '../updater.mjs';
import { writeFileSync, mkdirSync, rmSync, existsSync, statSync, readFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

test('isNewerVersion compares semver strings accurately', () => {
    assert.equal(isNewerVersion('v1.2.0', '1.1.1'), true);
    assert.equal(isNewerVersion('1.1.2', '1.1.1'), true);
    assert.equal(isNewerVersion('2.0.0', '1.9.9'), true);
    assert.equal(isNewerVersion('1.1.1', '1.1.1'), false);
    assert.equal(isNewerVersion('1.1.0', '1.1.1'), false);
    assert.equal(isNewerVersion('1.0.9', '1.1.0'), false);
    assert.equal(isNewerVersion('v1.1.1-alpha.1', '1.1.1'), false);
    assert.equal(isNewerVersion('v1.1.2-alpha.1', '1.1.1'), true);
    assert.equal(isNewerVersion('', '1.1.1'), false);
    assert.equal(isNewerVersion('v1.2.0', ''), false);
});

test('checkAppUpdate detects newer release and selects matching asset', async () => {
    const mockRelease = {
        tag_name: 'v1.2.0',
        html_url: 'https://github.com/Kapy2003/Kapple_Music/releases/tag/v1.2.0',
        body: 'Release notes here',
        assets: [
            {
                name: 'kapple-music.run',
                browser_download_url: 'https://example.com/kapple-music.run',
                size: 120000000,
            },
            {
                name: 'Kapple-Music-1.2.0-x86_64.AppImage',
                browser_download_url: 'https://example.com/Kapple-Music-1.2.0-x86_64.AppImage',
                size: 130000000,
            },
        ],
    };

    let fetchCount = 0;
    const mockFetch = async () => {
        fetchCount++;
        return {
            ok: true,
            status: 200,
            json: async () => mockRelease,
        };
    };

    const res = await checkAppUpdate({
        currentVersion: '1.1.1',
        netFetch: mockFetch,
        force: true,
        envAppImage: '/tmp/test.AppImage',
    });

    assert.equal(res.hasUpdate, true);
    assert.equal(res.currentVersion, '1.1.1');
    assert.equal(res.latestVersion, '1.2.0');
    assert.equal(res.assetName, 'Kapple-Music-1.2.0-x86_64.AppImage');
    assert.equal(res.assetUrl, 'https://example.com/Kapple-Music-1.2.0-x86_64.AppImage');
    assert.equal(res.isAppImage, true);
    assert.equal(fetchCount, 1);

    // Throttled: subsequent non-forced check returns cached info without re-fetching
    const cached = await checkAppUpdate({
        currentVersion: '1.1.1',
        netFetch: mockFetch,
        force: false,
        envAppImage: '/tmp/test.AppImage',
    });
    assert.equal(cached.latestVersion, '1.2.0');
    assert.equal(fetchCount, 1);
});

test('checkAppUpdate handles network failure gracefully', async () => {
    const failingFetch = async () => {
        throw new Error('Connection refused');
    };

    const res = await checkAppUpdate({
        currentVersion: '1.1.1',
        netFetch: failingFetch,
        force: true,
    });

    assert.equal(res.hasUpdate, false);
    assert.match(res.error, /Connection refused/);
});

test('applyAppImageUpdate streams and atomically replaces target AppImage', async () => {
    const tmpDir = path.join(os.tmpdir(), `kapple-updater-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    const fakeAppImage = path.join(tmpDir, 'test.AppImage');
    writeFileSync(fakeAppImage, 'old binary content', 'utf8');

    const newBinaryContent = 'new binary v1.2.0 content';
    const mockFetch = async () => ({
        ok: true,
        body: new ReadableStream({
            start(controller) {
                controller.enqueue(new TextEncoder().encode(newBinaryContent));
                controller.close();
            },
        }),
    });

    try {
        const res = await applyAppImageUpdate({
            assetUrl: 'https://example.com/update.AppImage',
            envAppImage: fakeAppImage,
            netFetch: mockFetch,
        });

        assert.equal(res.ok, true);
        assert.equal(res.path, fakeAppImage);
        assert.equal(readFileSync(fakeAppImage, 'utf8'), newBinaryContent);

        // Check executable permission
        const mode = statSync(fakeAppImage).mode;
        assert.ok((mode & 0o111) !== 0, 'AppImage must be executable');
    } finally {
        if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
    }
});

test('applyAppImageUpdate returns not-appimage when running unpacked or outside AppImage', async () => {
    const res = await applyAppImageUpdate({
        assetUrl: 'https://example.com/update.AppImage',
        envAppImage: null,
    });
    assert.equal(res.ok, false);
    assert.equal(res.reason, 'not-appimage');
});
