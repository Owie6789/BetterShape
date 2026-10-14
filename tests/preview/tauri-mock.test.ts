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
        const isKnownInvoke = (cmd: string): boolean => known.has(cmd);
        expect(handle("plugin:app|version")).toBe("1.0.3-preview");
        expect(isKnownInvoke("plugin:app|version")).toBe(true);
        expect(isKnownInvoke("plugin:event|listen")).toBe(true);
        expect(isKnownInvoke("plugin:dialog|message")).toBe(true);
        expect(isKnownInvoke("plugin:dialog|messag")).toBe(false);
        // Not modeled: returns a safe default AND is flagged unknown.
        expect(handle("plugin:opener|open")).toBeNull();
        expect(isKnownInvoke("plugin:opener|open")).toBe(false);
    });
});

describe("backend-parity state transitions (CodeAnt)", () => {
    it("switching projects directly closes the previous project's tabs", () => {
        const { handle, projectState } = createPreviewInvokeHandler("project");
        const stateOf = () => projectState() as {
            project_path: string | null;
            open_files: Array<{ path: string }>;
            active_file: string | null;
        };
        handle("open_file", { path: "/tmp/other.ts", name: "other.ts" });
        handle("set_project_path", { path: "/tmp/project-b" });
        expect(stateOf().project_path).toBe("/tmp/project-b");
        expect(stateOf().open_files).toEqual([]);
        expect(stateOf().active_file).toBeNull();
        handle("set_project_path", {});
        expect(stateOf().project_path).toBeNull();
    });

    it("closing the active tab activates the last remaining file (Rust close_file)", () => {
        const { handle, projectState } = createPreviewInvokeHandler("project");
        const activeOf = () => (projectState() as { active_file: string | null }).active_file;
        handle("open_file", { path: "/tmp/a.ts", name: "a.ts" });
        handle("open_file", { path: "/tmp/b.ts", name: "b.ts" });
        // active = b.ts (most recently opened); closing it → last remaining
        handle("close_file", { path: "/tmp/b.ts" });
        expect(activeOf()).toBe("/tmp/a.ts");
        handle("close_file", { path: "/tmp/a.ts" });
        expect(activeOf()).toBe(PREVIEW_PROJECT_PATH + "/README.md");
    });
});

describe("event delivery (CodeAnt)", () => {
    it("plugin:event|emit reaches tracked listeners; unlisten stops it", () => {
        const delivered: Array<{ event: string; payload: unknown }> = [];
        const { handle, emit } = createPreviewInvokeHandler("welcome");
        // Callback id and subscription id deliberately differ (CodeAnt).
        const subscriptionId = handle("plugin:event|listen", {
            event: "project-state-update",
            handler: 7,
        }) as number;
        expect(typeof subscriptionId).toBe("number");
        expect(subscriptionId).not.toBe(7);
        const internals = (
            window as unknown as { __TAURI_INTERNALS__: { runCallback: (id: number, e: unknown) => void } }
        ).__TAURI_INTERNALS__;
        const original = internals.runCallback;
        internals.runCallback = (id: number, e: unknown) => {
            if (id === 7) delivered.push(e as { event: string; payload: unknown });
        };
        try {
            handle("plugin:event|emit", { event: "project-state-update", payload: { ok: 1 } });
            expect(delivered).toEqual([{ event: "project-state-update", id: expect.any(Number), payload: { ok: 1 } }]);
            delivered.length = 0;
            handle("plugin:event|unlisten", {
                event: "project-state-update",
                eventId: subscriptionId,
            });
            emit("project-state-update", { ok: 2 });
            expect(delivered).toEqual([]);
        } finally {
            internals.runCallback = original;
        }
    });
});
