import { describe, expect, it } from "vitest";
import {
    createPreviewInvokeHandler,
    MODELED_PLUGIN_COMMANDS,
    PREVIEW_PROJECT_PATH,
} from "@/lib/preview/tauri-mock";

/**
 * The Browser Preview IPC handler is the fake backend every Playwright spec
 * (and every deployed PR preview) runs against — pin its contract here so a
 * mock regression fails fast in Vitest instead of in a browser.
 */
describe("preview invoke handler", () => {
    it("welcome seed starts with no project open", () => {
        const { handle } = createPreviewInvokeHandler("welcome");
        expect(handle("get_project_state")).toEqual({
            project_path: null,
            open_files: [],
            active_file: null,
        });
    });

    it("project seed opens the fake project with README active", () => {
        const { handle } = createPreviewInvokeHandler("project");
        const state = handle("get_project_state") as {
            project_path: string;
            open_files: Array<{ name: string }>;
            active_file: string;
        };
        expect(state.project_path).toBe(PREVIEW_PROJECT_PATH);
        expect(state.open_files.map((f) => f.name)).toEqual(["README.md"]);
        expect(state.active_file).toBe(`${PREVIEW_PROJECT_PATH}/README.md`);
    });

    it("set_project_path / open_file mutate observable project state", () => {
        const { handle, projectState } = createPreviewInvokeHandler("welcome");
        handle("set_project_path", { path: PREVIEW_PROJECT_PATH });
        handle("open_file", { path: `${PREVIEW_PROJECT_PATH}/src/App.tsx`, name: "App.tsx" });
        expect(projectState().project_path).toBe(PREVIEW_PROJECT_PATH);
        expect(projectState().active_file).toBe(`${PREVIEW_PROJECT_PATH}/src/App.tsx`);
        handle("close_all_files");
        expect(projectState().open_files).toEqual([]);
    });

    it("serves the seeded file tree and contents", () => {
        const { handle } = createPreviewInvokeHandler("project");
        const entries = handle("ls_dir", { path: PREVIEW_PROJECT_PATH }) as Array<{ name: string }>;
        expect(entries.map((e) => e.name)).toContain("src");
        expect(handle("read_file", { path: `${PREVIEW_PROJECT_PATH}/README.md` })).toContain(
            "preview fixture",
        );
    });

    it("serves seeded git state", () => {
        const { handle } = createPreviewInvokeHandler("project");
        expect(handle("git_branches", { path: PREVIEW_PROJECT_PATH })).toContain("main");
        expect(handle("git_current_branch", { path: PREVIEW_PROJECT_PATH })).toBe("main");
        const log = handle("git_log", { path: PREVIEW_PROJECT_PATH }) as Array<{ hash: string }>;
        expect(log.length).toBeGreaterThan(0);
        expect(log[0].hash).toContain("preview");
    });

    it("never throws for unmocked commands — safe defaults by shape", () => {
        const { handle } = createPreviewInvokeHandler("welcome");
        expect(handle("get_unmocked_items")).toEqual([]);
        expect(handle("get_something_unmocked")).toBeNull();
        expect(handle("is_something_unmocked")).toBe(false);
        expect(handle("do_something_unmocked")).toBeNull();
        expect(handle("plugin:app|version")).toBe("1.0.3-preview");
        expect(typeof handle("plugin:event|listen", { event: "x", handler: 1 })).toBe("number");
    });
});

describe("plugin fallback modeling (CodeAnt)", () => {
    it("modeled plugin commands are known; unmodeled ones stay visible as fidelity gaps", () => {
        const { handle, commands } = createPreviewInvokeHandler("welcome");
        const known = new Set([...commands, ...MODELED_PLUGIN_COMMANDS]);
        const isKnownInvoke = (cmd: string): boolean =>
            known.has(cmd) || cmd.startsWith("plugin:dialog|");
        expect(handle("plugin:app|version")).toBe("1.0.3-preview");
        expect(isKnownInvoke("plugin:app|version")).toBe(true);
        expect(isKnownInvoke("plugin:event|listen")).toBe(true);
        expect(isKnownInvoke("plugin:dialog|message")).toBe(true);
        // Not modeled: returns a safe default AND is flagged unknown.
        expect(handle("plugin:opener|open")).toBeNull();
        expect(isKnownInvoke("plugin:opener|open")).toBe(false);
    });
});
