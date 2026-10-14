import { test, expect, expectPreviewActive, gotoRoute, ROUTES } from "./fixtures";

/**
 * @smoke, every app route must boot in a plain browser with the mocked
 * Tauri bridge: no uncaught errors, the route shell renders, and the
 * preview seed is the one the fixture asked for. This is the fastest
 * signal that a change broke app startup.
 */
test.describe("@smoke routes boot", () => {
    for (const route of ROUTES) {
        test(`${route.name} (${route.path}) loads without page errors`, async ({
            page,
            seedMode,
            expectNoPageErrors,
        }) => {
            await gotoRoute(page, route.path);
            await expectPreviewActive(page, seedMode);

            // Route shells from app/client-layout.tsx.
            const shell = page.locator(
                "#bettershape-workbench, #bettershape-settings, #bettershape-popout",
            );
            await expect(shell.first()).toBeVisible();

            expectNoPageErrors();
        });
    }

    test("document title names the product", async ({ page }) => {
        await gotoRoute(page, "/");
        await expect(page).toHaveTitle(/BetterShape/);
    });
});
