import { test, expect, expectPreviewActive, gotoRoute } from "./fixtures";

/**
 * Settings window route (/settings). Runs in the same mocked-browser
 * harness as the main window — no Tauri multi-window needed.
 */
test.describe("settings", () => {
    test.beforeEach(async ({ page }) => {
        await gotoRoute(page, "/settings");
        await expectPreviewActive(page, "welcome");
        await expect(page.locator("#bettershape-settings")).toBeVisible();
    });

    test("renders the settings navigation", async ({ page, expectNoPageErrors }) => {
        await expect(page.getByText("Providers", { exact: true }).first()).toBeVisible();
        await expect(page.getByText("Models", { exact: true }).first()).toBeVisible();
        await expect(page.getByText("Editor", { exact: true }).first()).toBeVisible();
        expectNoPageErrors();
    });

    test("switching sections changes the visible panel", async ({ page, expectNoPageErrors }) => {
        await page.getByText("Providers", { exact: true }).first().click();
        // Providers section: bring-your-own-key copy / provider list area.
        await expect(page.locator("#bettershape-settings main")).not.toBeEmpty();
        expectNoPageErrors();
    });

    test("a switch control toggles", async ({ page, expectNoPageErrors }) => {
        await page.getByText("Editor", { exact: true }).first().click();
        const firstSwitch = page.getByRole("switch").first();
        await expect(firstSwitch).toBeVisible();
        const before = await firstSwitch.getAttribute("aria-checked");
        await firstSwitch.click();
        await expect(firstSwitch).toHaveAttribute("aria-checked", before === "true" ? "false" : "true");
        expectNoPageErrors();
    });
});
