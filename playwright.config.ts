import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";

/**
 * Browser Preview + agent QA suite. See `e2e/README.md` for the full guide.
 *
 * Quick start:
 *   npm run test:e2e     # this config (auto-starts the dev server)
 *   npm run qa           # same, plus an agent-friendly summary
 *
 * By default tests run against `npm run dev:browser` (Next dev + mocked
 * Tauri IPC). Set `E2E_STATIC=1` to run against the production static
 * export instead (`npm run build:preview` first) — that is what the PR
 * preview workflow does before deploying.
 */

const PORT = process.env.PORT ?? "48921";
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${PORT}`;
const useStatic = process.env.E2E_STATIC === "1";

/**
 * Resolve a Chromium executable. Order:
 *   1. `PLAYWRIGHT_CHROMIUM_PATH` — explicit override (any environment).
 *   2. Playwright's own downloaded browser (`npx playwright install chromium`).
 *   3. `@sparticuz/chromium` — an npm-registry-hosted Chromium build, for
 *      sandboxes/CI images where the Playwright browser CDN is unreachable.
 *      Set `PLAYWRIGHT_SANDBOX_LIBS` to a directory of shared libraries
 *      (libnss3/libnspr4) to prepend to LD_LIBRARY_PATH if the host lacks them.
 */
function resolveChromium(): { executablePath?: string; args?: string[] } {
    if (process.env.PLAYWRIGHT_CHROMIUM_PATH) {
        return { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH };
    }
    try {
        // playwright-core is a dependency of @playwright/test; use it only to
        // ask where its bundled Chromium would live.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { chromium } = require("playwright-core") as typeof import("playwright-core");
        if (existsSync(chromium.executablePath())) return {};
    } catch {
        /* fall through to the sandbox build */
    }
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const sparticuzModule = require("@sparticuz/chromium") as {
            default?: { args: string[] };
        };
        if (!sparticuzModule.default) return {};
        const executablePath = execFileSync(
            process.execPath,
            [
                "-e",
                "require('@sparticuz/chromium').default.executablePath().then((p) => process.stdout.write(p))",
            ],
            { encoding: "utf8", cwd: __dirname },
        ).trim();
        if (process.env.PLAYWRIGHT_SANDBOX_LIBS) {
            const existing = process.env.LD_LIBRARY_PATH;
            process.env.LD_LIBRARY_PATH = existing
                ? `${process.env.PLAYWRIGHT_SANDBOX_LIBS}:${existing}`
                : process.env.PLAYWRIGHT_SANDBOX_LIBS;
        }
        // Deliberately NOT sparticuz's full Lambda arg set: `--single-process`
        // makes the browser process unresponsive under a heavy dev bundle.
        // Playwright supplies sane defaults; add only sandbox essentials.
        return {
            executablePath,
            args: ["--no-sandbox", "--disable-dev-shm-usage", "--enable-unsafe-swiftshader"],
        };
    } catch {
        return {};
    }
}

const chromiumResolution = resolveChromium();

export default defineConfig({
    testDir: "./e2e",
    testMatch: "**/*.spec.ts",
    timeout: 90_000,
    expect: { timeout: 20_000 },
    // One worker: the app is a single heavy Next dev server / static bundle,
    // and deterministic seeds matter more than wall-clock speed here.
    workers: 1,
    retries: process.env.CI ? 1 : 0,
    reporter: [
        ["list"],
        ["html", { open: "never" }],
        ["json", { outputFile: "test-results/results.json" }],
    ],
    use: {
        baseURL,
        viewport: { width: 1440, height: 900 },
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
        video: "off",
        launchOptions: chromiumResolution,
    },
    projects: [
        {
            name: "chromium",
            use: { browserName: "chromium" },
        },
    ],
    webServer: process.env.PLAYWRIGHT_BASE_URL
        ? undefined
        : {
              command: useStatic ? "npm run preview:browser" : "npm run dev:browser",
              url: baseURL,
              reuseExistingServer: !process.env.CI,
              timeout: 300_000,
          },
});
