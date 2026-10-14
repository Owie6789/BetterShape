#!/usr/bin/env node
// skipcq: JS-0833
/**
 * Agent QA entry point: run the whole Playwright browser suite, then print
 * a compact machine-friendly summary (counts, failing specs, artifact
 * locations, unmocked IPC commands seen during the audit crawl).
 *
 *   npm run qa                 # smoke + functional + audit + visual
 *   npm run qa -- --grep @smoke
 *
 * Exit code is Playwright's: 0 = green. Reports land in
 * `playwright-report/` (HTML, for humans) and `test-results/results.json`
 * (JSON, for agents/tooling).
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
// `playwright/cli.js` is not an exported subpath, resolve via package.json.
// Spawning node directly avoids `npx` PATH lookup entirely.
const playwrightCli = join(dirname(require.resolve("playwright/package.json")), "cli.js");

const extraArgs = process.argv.slice(2);
const run = spawnSync(process.execPath, [playwrightCli, "test", ...extraArgs], {
    stdio: "inherit",
});

const resultsPath = "test-results/results.json";
if (existsSync(resultsPath)) {
    try {
        const report = JSON.parse(readFileSync(resultsPath, "utf8"));
        const stats = report.stats ?? {};
        console.log("\n── QA summary ─────────────────────────────────────────");
        console.log(
            `tests: ${stats.expected ?? 0} passed, ${stats.unexpected ?? 0} failed, ` +
            `${stats.flaky ?? 0} flaky, ${stats.skipped ?? 0} skipped ` +
            `(${(Number(stats.duration ?? 0) / 1000).toFixed(1)}s)`,
        );
        const failures = [];
        const walk = (suite, trail = []) => {
            for (const spec of suite.specs ?? []) {
                if (!spec.ok) failures.push([...trail, spec.title].join(" › "));
            }
            for (const child of suite.suites ?? []) walk(child, [...trail, child.title].filter(Boolean));
        };
        for (const suite of report.suites ?? []) walk(suite);
        if (failures.length) {
            console.log("failing:");
            for (const f of failures) console.log(`  ✗ ${f}`);
        }
        console.log("artifacts: playwright-report/index.html · test-results/ (traces, screenshots)");
        console.log("─────────────────────────────────────────────────────────");
    } catch {
        console.log("[qa] Could not parse test-results/results.json, see Playwright output above.");
    }
} else {
    console.log("[qa] No JSON report produced, see Playwright output above.");
}

process.exit(run.status ?? 1);
