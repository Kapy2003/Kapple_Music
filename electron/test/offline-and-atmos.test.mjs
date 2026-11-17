import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const dir = path.dirname(fileURLToPath(import.meta.url));
const offlineHtml = readFileSync(path.join(dir, '..', 'offline.html'), 'utf8');
const mainSrc = readFileSync(path.join(dir, '..', 'main.mjs'), 'utf8');
const pbSrc = readFileSync(path.join(dir, '..', 'src', 'engine-playback.js'), 'utf8');

test('offline.html is branded as Kapple Music with offline player controls', () => {
    assert.match(offlineHtml, /<title>Kapple Music<\/title>/);
    assert.match(offlineHtml, /<h1 id="title">Kapple Music<\/h1>/);
    assert.doesNotMatch(offlineHtml, />Adam</);
    assert.match(offlineHtml, /id="offline-player"/);
    assert.match(offlineHtml, /id="track-list"/);
    assert.match(offlineHtml, /id="audio-el"/);
    assert.match(offlineHtml, /media-src file: blob:;/);
});

test('main.mjs allows downloads:list from offline.html only', () => {
    function extractFn(src, name) {
        const m = new RegExp('function\\s+' + name + '\\s*\\(').exec(src);
        if (!m) throw new Error('function not found: ' + name);
        const open = src.indexOf('{', m.index);
        let depth = 0;
        for (let j = open; j < src.length; j++) {
            const ch = src[j];
            if (ch === '{') depth++;
            else if (ch === '}' && --depth === 0) return src.slice(m.index, j + 1);
        }
        throw new Error('unbalanced braces');
    }
    function extractConst(src, name) {
        const m = new RegExp('const\\s+' + name + '\\s*=').exec(src);
        return src.slice(m.index, src.indexOf('\n', m.index) + 1);
    }
    const mainWc = { id: 'main' }, miniWc = { id: 'mini' };
    const code = `
        const win = { isDestroyed: () => false, webContents: __mainWc };
        const miniWin = { isDestroyed: () => false, webContents: __miniWc };
    `;
    const ctx = { URL, Set, __mainWc: mainWc, __miniWc: miniWc };
    vm.createContext(ctx);
    vm.runInContext(code + extractConst(mainSrc, '_MINI_CHANNELS') + extractFn(mainSrc, '_httpsHost') +
        extractFn(mainSrc, '_senderAllowed') + ';globalThis.f=_senderAllowed;', ctx);
    const ev = (sender, url) => ({ sender, senderFrame: { url } });

    assert.equal(ctx.f(ev(mainWc, 'file:///app/offline.html'), 'downloads:list'), true);
    assert.equal(ctx.f(ev(mainWc, 'file:///app/other.html'), 'downloads:list'), false);
    assert.equal(ctx.f(ev(miniWc, 'file:///app/offline.html'), 'downloads:list'), false);
    assert.equal(ctx.f(ev(mainWc, 'file:///app/offline.html'), 'store:write'), false);
});

test('engine-playback.js wires Dolby Atmos capabilities to session requests', () => {
    assert.match(pbSrc, /let _atmosEnabled\s*=\s*true/);
    assert.match(pbSrc, /atmos:\s*!isVideo && _atmosEnabled && Boolean\(_engineCaps\.atmos\)/);
    assert.match(pbSrc, /atmos:\s*_atmosEnabled && Boolean\(_engineCaps\.atmos\)/);
});

test('vision-glass.js hides floating navigation in fullscreen and modal modes', () => {
    const vgSrc = readFileSync(path.join(dir, '..', 'src', 'vision-glass.js'), 'utf8');
    assert.match(vgSrc, /:fullscreen #kapple-sidebar-floating-nav/);
    assert.match(vgSrc, /body:has\(\[data-testid="lyrics-fullscreen-modal"\]\) #kapple-sidebar-floating-nav/);
    assert.match(vgSrc, /body\.kapple-fullscreen #kapple-sidebar-floating-nav\s*\{[^}]*display:\s*none\s*!important/);
    assert.match(vgSrc, /document\.addEventListener\('fullscreenchange'/);
});
