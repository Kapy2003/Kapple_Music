import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const srcPath = path.join(dir, '..', 'src', 'vision-glass.js');
const src = readFileSync(srcPath, 'utf8');

test('floatingNav has inline styles and direct JS display management in _syncSidebarDOM', () => {
    // 1. floatingNav created with inline styles so it does not rely solely on constructable stylesheets
    assert.match(src, /floatingNav\.style\.cssText\s*=\s*'[^']*position:fixed/);
    assert.match(src, /floatingNav\.style\.cssText\s*=\s*'[^']*z-index:99999/);

    // 2. _syncSidebarDOM must directly manage floatingNav display
    assert.match(src, /function _syncSidebarDOM\(collapsed\)\s*\{[\s\S]*floatingNav\.style\.setProperty\('display',\s*'flex',\s*'important'\)/);
    assert.match(src, /function _syncSidebarDOM\(collapsed\)\s*\{[\s\S]*floatingNav\.style\.setProperty\('display',\s*'none',\s*'important'\)/);

    // 3. CSS must not hide floatingNav unconditionally in fullscreen checks
    assert.match(src, /:fullscreen #kapple-sidebar-floating-nav/);
    assert.match(src, /body:has\(amp-playback-controls-exit\)\[data-kapple-fullscreen="true"\]/);
    assert.match(src, /body:has\(amp-window-takeover\)\[data-kapple-fullscreen="true"\]/);
    assert.match(src, /body:has\(\[data-testid="lyrics-fullscreen-modal"\]\)\[data-kapple-fullscreen="true"\]/);
    assert.match(src, /body\.kapple-fullscreen #kapple-sidebar-floating-nav\s*\{[^}]*display:\s*none\s*!important/);

    // 4. checkFullscreenState must check visibility & computed style, not just element existence or raw offsetHeight
    assert.match(src, /window\.getComputedStyle\(container\)\.visibility\s*!==\s*'hidden'/);
    assert.match(src, /window\.getComputedStyle\(exitBtn\)\.visibility\s*!==\s*'hidden'/);
    assert.match(src, /st\.display\s*!==\s*'none'\s*&&\s*st\.visibility\s*!==\s*'hidden'/);

    // 5. checkFullscreenState maintains floatingNav inline display state
    assert.match(src, /const checkFullscreenState\s*=\s*\(\)\s*=>\s*\{[\s\S]*floatingNav\.style\.setProperty\('display',\s*'flex',\s*'important'\)/);
    assert.match(src, /const checkFullscreenState\s*=\s*\(\)\s*=>\s*\{[\s\S]*floatingNav\.style\.setProperty\('display',\s*'none',\s*'important'\)/);

    // 6. MutationObserver reconnects floatingNav if detached
    assert.match(src, /!floatingNav\.isConnected\s*\|\|\s*!document\.getElementById\('kapple-sidebar-floating-nav'\)/);
});
