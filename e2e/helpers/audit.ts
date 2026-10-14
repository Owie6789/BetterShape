import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, type TestInfo } from "@playwright/test";

/**
 * Audit helpers for the agent QA crawl (`e2e/audit.spec.ts`): axe WCAG
 * scans, full-page screenshots, console/IPC inventories, and navigation
 * timings — everything an agent (or a human reviewer) needs to judge a
 * route without opening it by hand.
 */

export interface RouteAudit {
    route: string;
    title: string;
    axeViolations: Array<{ id: string; impact: string | null; nodes: number }>;
    consoleErrors: string[];
    pageErrors: string[];
    unknownIpcCommands: string[];
    ipcCommandCount: number;
    timings: { domContentLoadedMs: number; loadMs: number } | null;
}

/** Run axe (WCAG 2.x AA) and return every violation found. */
export async function runAxeAudit(page: Page) {
    const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();
    return results.violations;
}

export type A11yBaseline = Record<string, Record<string, number>>;

/**
 * Ratchet gate: fail only on NEW or INCREASED critical/serious violations
 * versus `e2e/a11y-baseline.json`. Pre-existing debt is pinned there (with
 * node counts) so adopting automated a11y checks does not require fixing
 * the whole app in one PR — but regressions can never sneak in. Lower the
 * baseline numbers as violations get fixed.
 */
export function assertA11yWithinBaseline(
    violations: Awaited<ReturnType<typeof runAxeAudit>>,
    route: string,
    baseline: A11yBaseline,
) {
    const allowed = baseline[route] ?? {};
    const regressions = violations
        .filter((v) => v.impact === "critical" || v.impact === "serious")
        .filter((v) => v.nodes.length > (allowed[v.id] ?? 0))
        .map(
            (v) =>
                `${v.id} (${v.impact}) — ${v.nodes.length} node(s), baseline allows ${allowed[v.id] ?? 0}: ${v.help}`,
        );
    expect(
        regressions,
        `${route}: new/increased accessibility violations vs e2e/a11y-baseline.json. ` +
            "Fix the UI, or if this is deliberate, raise the baseline in the same PR with a reason.",
    ).toEqual([]);
}

/** Read the preview bridge's IPC inventory (installed by lib/preview). */
export async function collectIpcInventory(page: Page) {
    return page.evaluate(() => {
        const preview = (window as unknown as {
            __BETTERSHAPE_PREVIEW__?: {
                invokes: Array<{ cmd: string }>;
                unknownCommands: () => string[];
            };
        }).__BETTERSHAPE_PREVIEW__;
        if (!preview) return { count: 0, unknown: [] as string[] };
        return { count: preview.invokes.length, unknown: preview.unknownCommands() };
    });
}

export async function collectTimings(page: Page) {
    return page.evaluate(() => {
        const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
        if (!nav) return null;
        return {
            domContentLoadedMs: Math.round(nav.domContentLoadedEventEnd),
            loadMs: Math.round(nav.loadEventEnd),
        };
    });
}

/** Screenshot a route for human/agent review and attach it to the report. */
export async function captureRoute(page: Page, testInfo: TestInfo, name: string) {
    const path = testInfo.outputPath(`audit-${name}.png`);
    await page.screenshot({ path, fullPage: true, animations: "disabled" });
    await testInfo.attach(`audit-${name}`, { path, contentType: "image/png" });
    return path;
}
