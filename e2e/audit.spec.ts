import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect, expectPreviewActive, gotoRoute, ROUTES } from "./fixtures";
import {
    assertA11yWithinBaseline,
    captureRoute,
    collectIpcInventory,
    collectTimings,
    runAxeAudit,
    waitForIpcQuiet,
    type A11yBaseline,
    type RouteAudit,
} from "./helpers/audit";

const a11yBaseline = JSON.parse(
    readFileSync(join(__dirname, "a11y-baseline.json"), "utf8"),
) as A11yBaseline;

/**
 * @audit, the agent QA crawl. For every route: load it, scan it with axe
 * (WCAG 2.x AA, checked against e2e/a11y-baseline.json), screenshot it, and inventory
 * console errors, page errors, and IPC usage (including commands the
 * fixture does not mock yet). Produces `browser-audit.json` + one PNG per
 * route in the test artifacts, so an agent can review UI state from a CI
 * run without opening a browser.
 *
 * Run it directly with: npm run qa:audit
 */
test.describe("@audit route crawl", () => {
    const audits: RouteAudit[] = [];

    for (const route of ROUTES) {
        test(`audit ${route.name} (${route.path})`, async ({
            page,
            seedMode,
            pageErrors,
            consoleErrors,
        }, testInfo) => {
            await gotoRoute(page, route.path);
            await expectPreviewActive(page, seedMode);
            // Let post-mount effects (settings, git, chat loads) settle:
            // wait for a quiet IPC window rather than a fixed sleep.
            await waitForIpcQuiet(page);

            const violations = await runAxeAudit(page);
            assertA11yWithinBaseline(violations, route.path, a11yBaseline);
            await captureRoute(page, testInfo, route.name);

            const ipc = await collectIpcInventory(page);
            audits.push({
                route: route.path,
                title: await page.title(),
                axeViolations: violations.map((v) => ({
                    id: v.id,
                    impact: v.impact ?? null,
                    nodes: v.nodes.length,
                })),
                consoleErrors: [...consoleErrors],
                pageErrors: [...pageErrors],
                unknownIpcCommands: ipc.unknown,
                ipcCommandCount: ipc.count,
                timings: await collectTimings(page),
            });

            expect(pageErrors, `${route.name}: uncaught page errors`).toEqual([]);
        });
    }

    // Playwright requires a destructured fixtures arg even when the hook
    // only needs testInfo; `browser` is worker-scoped so it is legal (and
    // already running) in afterAll.
    test.afterAll(async ({ browser: _browser }, testInfo) => {
        // A real file (not just a report attachment) so agents/tooling can
        // diff audits across runs: test-results/browser-audit.json.
        const body = JSON.stringify(audits, null, 2);
        try {
            mkdirSync("test-results", { recursive: true });
            writeFileSync(join("test-results", "browser-audit.json"), body);
        } catch {
            /* attachment below still carries the data */
        }
        await testInfo.attach("browser-audit.json", {
            body,
            contentType: "application/json",
        });
    });
});
