import * as esbuild from 'esbuild';
import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const electronDir = path.dirname(fileURLToPath(import.meta.url));

async function run() {
    await esbuild.build({
        entryPoints: [path.join(electronDir, 'src/engine-playback.js')],
        outfile: path.join(electronDir, 'engine-bundle.js'),
        bundle: true,
        format: 'iife',
        logLevel: 'warning',
    });

    await esbuild.build({
        entryPoints: [path.join(electronDir, 'src/engine-sse.js')],
        outfile: path.join(electronDir, 'engine-sse-bundle.js'),
        bundle: true,
        format: 'iife',
        globalName: '_kappleSSEMod',
        logLevel: 'warning',
    });

    await esbuild.build({
        entryPoints: [path.join(electronDir, 'src/smart-cache.js')],
        outfile: path.join(electronDir, 'smart-cache-bundle.js'),
        bundle: true,
        format: 'iife',
        logLevel: 'warning',
    });

    copyFileSync(
        path.join(electronDir, 'src/vision-glass.js'),
        path.join(electronDir, 'vision-bundle.js')
    );

    // Verify no stray module syntax leaked into plain scripts
    for (const b of ['engine-bundle.js', 'engine-sse-bundle.js', 'smart-cache-bundle.js']) {
        const code = readFileSync(path.join(electronDir, b), 'utf8');
        if (/^\s*(import\s.+\sfrom\s|export\s)/m.test(code)) {
            console.error(`error: ${b} still contains import/export`);
            process.exit(1);
        }
    }

    const unpacked = path.join(electronDir, 'dist', 'linux-unpacked', 'resources');
    if (existsSync(unpacked)) {
        for (const f of ['engine-bundle.js', 'engine-sse-bundle.js', 'smart-cache-bundle.js', 'vision-bundle.js']) {
            copyFileSync(path.join(electronDir, f), path.join(unpacked, f));
        }
    }

    console.log('renderer bundles built');
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
