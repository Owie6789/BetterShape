#!/usr/bin/env node
/**
 * Build the statically-exportable Browser Preview bundle into `out/`.
 *
 * Identical to the production `next build` except NEXT_PUBLIC_BROWSER_PREVIEW=1
 * is set, so the exported site installs the mocked Tauri IPC bridge and can
 * be clicked through on any static host (Vercel preview, GitHub Pages, a
 * local `preview:browser` server). Never use this bundle for Tauri releases:
 * `npm run tauri:build` runs the plain `npm run build` without the flag, and
 * the mock installer additionally refuses to run inside a real Tauri webview.
 */
import { spawnSync } from "node:child_process";

const env = { ...process.env, NEXT_PUBLIC_BROWSER_PREVIEW: "1" };

for (const args of [["run", "build:runtime"], ["run", "build"]]) {
    const result = spawnSync("npm", args, {
        stdio: "inherit",
        env,
        shell: process.platform === "win32",
    });
    if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log("[build:preview] Static Browser Preview written to out/");
