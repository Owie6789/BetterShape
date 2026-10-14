#!/usr/bin/env node
// skipcq: JS-0833
/**
 * Serve the Browser Preview static export (`out/`) over HTTP.
 *
 * The production build uses `output: "export"` + `trailingSlash`, so each
 * route is a directory with an index.html (`/settings/` → `out/settings/`).
 * This dependency-free server mirrors that layout, binds 0.0.0.0 so
 * sandboxed/cloud browser previews can reach it, and 404s honestly for
 * missing assets (no SPA fallback masking broken chunks).
 *
 * Usage: npm run build:preview && npm run preview:browser
 */
import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "out");
const port = Number(process.env.PORT ?? "48921");
const host = process.env.HOST ?? "0.0.0.0";

if (!existsSync(join(root, "index.html"))) {
    console.error("[preview:browser] out/index.html not found. Run `npm run build:preview` first.");
    process.exit(1);
}

const MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".wasm": "application/wasm",
    ".txt": "text/plain; charset=utf-8",
    ".map": "application/json; charset=utf-8",
};

function resolveFile(urlPath) {
    let decoded;
    try {
        decoded = decodeURIComponent(urlPath);
    } catch {
        return null; // malformed percent-encoding → 400/404, never a crash
    }
    if (decoded.includes("\0")) return null;
    const clean = normalize(decoded).replace(/^(\.\.[/\\])+/, "");
    const direct = join(root, clean);
    // Hard containment: the resolved path must stay inside `out/`.
    if (direct !== root && !direct.startsWith(root + sep)) return null;
    if (existsSync(direct) && statSync(direct).isFile()) return direct;
    const asIndex = join(direct, "index.html");
    if (existsSync(asIndex)) return asIndex;
    return null;
}

createServer((req, res) => {
    let url;
    try {
        url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    } catch {
        res.writeHead(400, { "content-type": "text/plain" });
        res.end("Bad request\n");
        return;
    }
    const file = resolveFile(url.pathname);
    if (!file) {
        res.writeHead(404, { "content-type": "text/plain" });
        res.end(`Not found: ${url.pathname}\n`);
        return;
    }
    res.writeHead(200, {
        "content-type": MIME[extname(file)] ?? "application/octet-stream",
        "cache-control": "no-store",
    });
    createReadStream(file).pipe(res);
}).listen(port, host, () => {
    console.log(`[preview:browser] Serving out/ at http://${host}:${port}`);
});
