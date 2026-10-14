/**
 * Browser Preview mocks for the Tauri IPC surface.
 *
 * BetterShape is a Tauri 2 desktop app: in a plain browser every
 * `invoke()` / `listen()` from `@tauri-apps/api` fails because there is no
 * `window.__TAURI_INTERNALS__`. This module installs the official
 * `@tauri-apps/api/mocks` IPC bridge with a deterministic, in-memory fake
 * backend (fake project, files, Git repo, conversations) so the full UI can
 * be launched, clicked through, screenshot, and audited in any browser —
 * locally, in Playwright, and in deployed PR previews.
 *
 * Safety: installation is doubly gated.
 *   1. Build-time: `NEXT_PUBLIC_BROWSER_PREVIEW=1` must be set (only the
 *      `dev:browser` / `build:preview` scripts and preview CI do this).
 *   2. Runtime: if a real Tauri runtime is present (`__TAURI_INTERNALS__`
 *      already exists) installation is a no-op, so a desktop build can
 *      never be mocked even if the flag leaks into its environment.
 *
 * Test/debug surface: after install, `window.__BETTERSHAPE_PREVIEW__`
 * exposes `{ seed, invokes, unknownCommands(), clearInvokes() }` so
 * Playwright specs (and humans in devtools) can assert which IPC commands
 * the UI issued. It never exists in a real desktop build.
 */

import { mockConvertFileSrc, mockIPC, mockWindows } from "@tauri-apps/api/mocks";

export type PreviewSeedMode = "welcome" | "project";

export interface PreviewInvokeRecord {
    cmd: string;
    args: Record<string, unknown> | undefined;
    unknown: boolean;
    at: number;
}

export interface BrowserPreviewHandle {
    seed: PreviewSeedMode;
    invokes: PreviewInvokeRecord[];
    unknownCommands: () => string[];
    clearInvokes: () => void;
}

declare global {
    interface Window {
        __BETTERSHAPE_PREVIEW__?: BrowserPreviewHandle;
        __BETTERSHAPE_PREVIEW_SEED__?: string;
    }
}

/** Fake project used by the `project` seed. Obviously fake data only. */
export const PREVIEW_PROJECT_PATH = "/preview/bettershape-demo";

const PREVIEW_FILES: Record<string, string> = {
    [`${PREVIEW_PROJECT_PATH}/README.md`]: [
        "# bettershape-demo (preview fixture)",
        "",
        "This project does not exist on disk. It is seeded by",
        "`lib/preview/tauri-mock.ts` so the workbench can be exercised",
        "in a browser without the Tauri backend.",
        "",
    ].join("\n"),
    [`${PREVIEW_PROJECT_PATH}/package.json`]: `${JSON.stringify(
        { name: "bettershape-demo", version: "0.0.0-preview", private: true },
        null,
        2,
    )}\n`,
    [`${PREVIEW_PROJECT_PATH}/src/App.tsx`]: [
        "export default function App() {",
        '    return <main className="app">Hello from the preview fixture</main>;',
        "}",
        "",
    ].join("\n"),
    [`${PREVIEW_PROJECT_PATH}/src/main.ts`]: [
        'import App from "./App";',
        "",
        "export function boot() {",
        "    return App;",
        "}",
        "",
    ].join("\n"),
};

const PREVIEW_DIRS: Record<string, Array<{ name: string; is_dir: boolean }>> = {
    [PREVIEW_PROJECT_PATH]: [
        { name: "src", is_dir: true },
        { name: "README.md", is_dir: false },
        { name: "package.json", is_dir: false },
    ],
    [`${PREVIEW_PROJECT_PATH}/src`]: [
        { name: "App.tsx", is_dir: false },
        { name: "main.ts", is_dir: false },
    ],
};

function previewLogEntries() {
    const now = Date.now();
    return [3, 2, 1].map((n) => ({
        hash: `preview000${n}00000000000000000000000000`,
        message: ["preview: seeded commit history", "preview: wire browser QA fixtures", "preview: initial commit"][3 - n],
        author: "Preview Fixture",
        author_email: "preview@example.invalid",
        date: new Date(now - (3 - n) * 86_400_000).toISOString(),
        files_changed: n,
        insertions: n * 12,
        deletions: n * 3,
        refs: n === 3 ? ["main"] : [],
        parent_count: n === 1 ? 0 : 1,
        parents: n === 1 ? [] : [`preview000${n - 1}00000000000000000000000000`],
    }));
}

function resolveSeedMode(): PreviewSeedMode {
    if (typeof window === "undefined") return "welcome";
    const fromGlobal = window.__BETTERSHAPE_PREVIEW_SEED__;
    if (fromGlobal === "project" || fromGlobal === "welcome") return fromGlobal;
    try {
        const fromQuery = new URLSearchParams(window.location.search).get("seed");
        if (fromQuery === "project" || fromQuery === "welcome") return fromQuery;
    } catch {
        /* ignore */
    }
    try {
        const fromStorage = window.localStorage.getItem("bettershape:preview-seed");
        if (fromStorage === "project" || fromStorage === "welcome") return fromStorage;
    } catch {
        /* ignore */
    }
    return "welcome";
}

/**
 * Pure IPC handler factory — exported separately from the installer so the
 * Vitest suite can exercise seed state transitions without a browser IPC
 * bridge. Returns a value (or throws) exactly like a Tauri command would.
 */
export function createPreviewInvokeHandler(seed: PreviewSeedMode) {
    const state = {
        projectPath: seed === "project" ? PREVIEW_PROJECT_PATH : null as string | null,
        openFiles: seed === "project"
            ? [{ path: `${PREVIEW_PROJECT_PATH}/README.md`, name: "README.md", is_dirty: false }]
            : [] as Array<{ path: string; name: string; is_dirty: boolean; is_pinned?: boolean }>,
        activeFile: seed === "project" ? `${PREVIEW_PROJECT_PATH}/README.md` : null as string | null,
        files: { ...PREVIEW_FILES },
        branch: "main",
    };
    const listeners = new Map<string, Set<number>>();
    let nextEventId = 1;

    const projectState = () => ({
        project_path: state.projectPath,
        open_files: state.openFiles.map((f) => ({ ...f })),
        active_file: state.activeFile,
    });

    /** Deliver a Tauri event to callbacks registered via `listen()`. */
    function emit(event: string, payload: unknown) {
        const ids = listeners.get(event);
        if (!ids || typeof window === "undefined") return;
        const internals = (window as unknown as {
            __TAURI_INTERNALS__?: { runCallback: (id: number, event: unknown) => void };
        }).__TAURI_INTERNALS__;
        if (!internals?.runCallback) return;
        ids.forEach((id) => {
            try {
                internals.runCallback(id, { event, id: nextEventId, payload });
            } catch {
                /* listener gone — ignore */
            }
        });
    }

    const emitProjectState = () => emit("project-state-update", projectState());

    const handlers: Record<string, (args: Record<string, unknown>) => unknown> = {
        // ── project / files ──────────────────────────────────────────────
        get_project_state: () => projectState(),
        set_project_path: (args) => {
            state.projectPath = typeof args.path === "string" ? args.path : null;
            if (!state.projectPath) {
                state.openFiles = [];
                state.activeFile = null;
            }
            emitProjectState();
            return null;
        },
        set_extra_workspace_folders: () => null,
        grant_ipc_path: () => null,
        is_fresh_window: () => true,
        is_workspace_trusted: () => true,
        set_workspace_trusted: () => null,
        home_dir: () => "/preview/home",
        ls_dir: (args) => {
            const path = String(args.path ?? "");
            const entries = PREVIEW_DIRS[path] ?? [];
            return entries.map((e) => ({ name: e.name, path: `${path}/${e.name}`, is_dir: e.is_dir }));
        },
        read_file: (args) => state.files[String(args.path ?? "")] ?? "# Preview fixture\n\nNo seeded content for this path.\n",
        read_file_within: (args) => state.files[String(args.path ?? "")] ?? "",
        read_file_bytes: () => [],
        save_file: (args) => {
            if (typeof args.path === "string" && typeof args.content === "string") {
                state.files[args.path] = args.content;
            }
            return null;
        },
        save_file_bytes: () => null,
        open_file: (args) => {
            const path = String(args.path ?? "");
            const name = String(args.name ?? path.split("/").pop() ?? path);
            if (path && !state.openFiles.some((f) => f.path === path)) {
                state.openFiles.push({ path, name, is_dirty: false });
            }
            state.activeFile = path || state.activeFile;
            emitProjectState();
            return null;
        },
        close_file: (args) => {
            const path = String(args.path ?? "");
            state.openFiles = state.openFiles.filter((f) => f.path !== path);
            if (state.activeFile === path) state.activeFile = state.openFiles[0]?.path ?? null;
            emitProjectState();
            return null;
        },
        close_all_files: () => {
            state.openFiles = [];
            state.activeFile = null;
            emitProjectState();
            return null;
        },
        set_active_file: (args) => {
            state.activeFile = typeof args.path === "string" ? args.path : null;
            emitProjectState();
            return null;
        },
        pin_file: () => null,
        mark_file_dirty: () => null,
        reorder_files: () => null,
        close_to_right: () => null,
        close_saved: () => null,
        create_file: () => null,
        create_dir: () => null,
        delete_path: () => null,
        trash_path: () => null,
        rename_path: () => null,
        copy_path: () => null,
        reveal_path: () => null,
        open_in_app: () => null,
        open_url_external: () => null,
        ensure_path_within: () => null,
        get_rust_deps: () => [],

        // ── git ──────────────────────────────────────────────────────────
        git_discover_repos: () => [{ path: PREVIEW_PROJECT_PATH, name: "bettershape-demo", isBare: false }],
        git_resolve_repo_for_file: () => PREVIEW_PROJECT_PATH,
        git_status: () => [
            { path: "src/App.tsx", status: "modified", staged: false },
            { path: "README.md", status: "modified", staged: true },
        ],
        git_branches: () => ["main", "preview/browser-qa"],
        git_current_branch: () => state.branch,
        git_branch_details: () => [
            { name: "main", author: "Preview Fixture", authorEmail: "preview@example.invalid", date: new Date().toISOString(), ahead: 0, behind: 0 },
            { name: "preview/browser-qa", author: "Preview Fixture", authorEmail: "preview@example.invalid", date: new Date().toISOString(), ahead: 1, behind: 0 },
        ],
        git_remote_branches: () => [],
        git_list_remotes: () => [],
        git_has_remote: () => false,
        git_remote_url: () => null,
        git_sync_status: () => ({ ahead: 0, behind: 0 }),
        git_log: () => previewLogEntries(),
        git_log_stream_start: () => null,
        git_log_stream_next: () => previewLogEntries(),
        git_log_stream_stop: () => null,
        git_branch_graph: () => ({
            nodes: [{
                name: "main", commit: "preview000300000000000000000000000000", author: "Preview Fixture",
                date: new Date().toISOString(), ahead: 0, x: 0, y: 0, parents: [], isCurrent: true, isRemote: false,
            }],
            width: 1, height: 1, currentBranch: "main", total: 1, truncated: false,
        }),
        git_diff: () => "diff --git a/src/App.tsx b/src/App.tsx\n+// preview fixture change\n",
        git_file_diff: () => "diff --git a/src/App.tsx b/src/App.tsx\n+// preview fixture change\n",
        git_list_hunks: (args) => ({ path: String(args.path ?? ""), staged: false, hunks: [] }),
        git_stash_list: () => [],
        git_list_tags: () => [],
        git_in_progress: () => null,
        git_activity_timeline: () => [],

        // ── chat / AI ────────────────────────────────────────────────────
        get_conversations: () => [{
            id: "preview-conversation",
            title: "Preview fixture chat",
            project_path: PREVIEW_PROJECT_PATH,
            timestamp: Date.now(),
            history: [
                { role: "user", content: "What does this fixture do?", timestamp: Date.now() - 60_000 },
                { role: "assistant", content: "It seeds a deterministic project so the workbench can be audited in a browser.", timestamp: Date.now() - 59_000 },
            ],
        }],
        get_conversation_messages: () => [
            { role: "user", content: "What does this fixture do?", timestamp: Date.now() - 60_000 },
            { role: "assistant", content: "It seeds a deterministic project so the workbench can be audited in a browser.", timestamp: Date.now() - 59_000 },
        ],
        get_chat_history: () => [],
        get_chat_title: () => "Preview fixture chat",
        get_current_conversation_id: () => "preview-conversation",
        get_ai_config: () => ({
            providers: [],
            defaultModel: "auto",
            embeddingModel: "",
            search: { provider: "", apiKey: "" },
            composio: { apiKey: "", userId: "" },
        }),
        ai_provider_status: () => [],
        ai_load_keys: () => ({}),
        ai_vault_supported: () => false,
        get_chat_generation_state: () => ({
            isGenerating: false,
            turnId: null,
            conversationId: null,
            partialContent: null,
            activityLabel: null,
        }),
        get_compaction_state: () => null,

        // ── GitHub / MCP / misc services ─────────────────────────────────
        github_auth_status: () => ({ loggedIn: false, username: null, avatarUrl: null, provider: "none" }),
        get_mcp_status: () => [],
        get_mcp_tools: () => [],
        get_mcp_config_path: () => `${PREVIEW_PROJECT_PATH}/.preview/mcp.json`,
        ensure_mcp_config: () => `${PREVIEW_PROJECT_PATH}/.preview/mcp.json`,
        sync_mcp_servers: () => [],
        set_ai_config: () => null,
        read_mcp_config: () => "{}",
        get_index_status: () => ({ state: "idle", indexed_files: 0, total_files: 0 }),
        get_project_stats: () => null,
        discover_tests: () => ({ tests: [], framework: null }),
        search_project_files: () => [],
        search_content: () => [],
        search_codebase: () => [],
        browser_tabs: () => ({ tabs: [], activeId: null }),
        browser_history: () => [],
        pty_available_shells: () => [],
        get_package_info: () => null,
        get_outline: () => null,
    };

    /** Safe fallback for any command without an explicit handler. */
    function fallback(cmd: string): unknown {
        if (cmd.startsWith("plugin:")) return pluginFallback(cmd);
        // Plural getters/listers return collections; singular getters fall
        // back to null (returning [] for a string/object-typed command
        // crashes callers, e.g. `title.trim()`).
        if (/^(get|list|load|search|discover|fetch)_.+s$/.test(cmd)) return [];
        if (cmd.startsWith("is_") || cmd.startsWith("has_") || cmd.startsWith("can_")) return false;
        return null;
    }

    function pluginFallback(cmd: string): unknown {
        // Event plugin: track listeners so `emit()` above can deliver.
        if (cmd === "plugin:event|listen") return nextEventId++;
        if (cmd === "plugin:event|emit" || cmd === "plugin:event|unlisten") return null;
        if (cmd === "plugin:app|version") return "1.0.3-preview";
        if (cmd === "plugin:app|name") return "BetterShape (Browser Preview)";
        if (cmd === "plugin:store|load") return 1;
        if (cmd === "plugin:store|get") return null;
        if (cmd === "plugin:store|keys") return [];
        if (cmd === "plugin:store|entries") return [];
        if (cmd === "plugin:store|length") return 0;
        if (cmd === "plugin:dialog|open" || cmd === "plugin:dialog|save") return null;
        if (cmd.startsWith("plugin:dialog|")) return false;
        if (cmd === "plugin:notification|is_permission_granted") return false;
        if (cmd === "plugin:deep-link|get_current") return null;
        return null;
    }

    function handle(cmd: string, args?: Record<string, unknown>): unknown {
        if (cmd === "plugin:event|listen" && args && typeof args.event === "string") {
            const handlerId = (args as { handler?: unknown }).handler;
            if (typeof handlerId === "number") {
                if (!listeners.has(args.event)) listeners.set(args.event, new Set());
                listeners.get(args.event)?.add(handlerId);
            }
        }
        const handler = handlers[cmd];
        if (handler) return handler(args ?? {});
        return fallback(cmd);
    }

    return { handle, projectState, emit };
}

/**
 * Install the mocked Tauri IPC bridge in the current page. See the module
 * header for the two safety gates. Returns true when mocks were installed.
 */
export function installBrowserPreviewMocks(): boolean {
    if (typeof window === "undefined") return false;
    if (process.env.NEXT_PUBLIC_BROWSER_PREVIEW !== "1") return false;
    if ("__TAURI_INTERNALS__" in window) return false;
    if (window.__BETTERSHAPE_PREVIEW__) return false;

    const seed = resolveSeedMode();
    const { handle } = createPreviewInvokeHandler(seed);
    const invokes: PreviewInvokeRecord[] = [];

    // Synchronous install: this module is only imported from
    // `instrumentation-client.ts`, which runs before the app becomes
    // interactive, so the bridge exists before the first `invoke()` /
    // `listen()` call. (`@tauri-apps/api/mocks` ships in the client bundle
    // but stays inert unless the build-time flag above is set.)
    mockWindows("main");
    mockConvertFileSrc("windows");
    mockIPC((cmd, args) => {
        const unknown = !cmd.startsWith("plugin:") && !KNOWN_COMMANDS.has(cmd);
        const recordArgs = args as Record<string, unknown> | undefined;
        invokes.push({ cmd, args: recordArgs, unknown, at: Date.now() });
        if (invokes.length > 500) invokes.shift();
        return handle(cmd, recordArgs);
    });
    window.__BETTERSHAPE_PREVIEW__ = {
        seed,
        invokes,
        unknownCommands: () => [...new Set(invokes.filter((i) => i.unknown).map((i) => i.cmd))].sort(),
        clearInvokes: () => {
            invokes.length = 0;
        },
    };
    document.documentElement.dataset.bettershapePreview = seed;
    return true;
}

/**
 * Commands with explicit handlers in `createPreviewInvokeHandler`, plus the
 * plugin surface. Used only to flag "unknown" invokes for QA reports — an
 * unknown command is not an error (it receives a safe default), but listing
 * them shows where fixture fidelity should grow next.
 */
const KNOWN_COMMANDS = new Set([
    "get_project_state", "set_project_path", "set_extra_workspace_folders", "grant_ipc_path",
    "is_fresh_window", "is_workspace_trusted", "set_workspace_trusted", "home_dir", "ls_dir",
    "read_file", "read_file_within", "read_file_bytes", "save_file", "save_file_bytes",
    "open_file", "close_file", "close_all_files", "set_active_file", "pin_file",
    "mark_file_dirty", "reorder_files", "close_to_right", "close_saved", "create_file",
    "create_dir", "delete_path", "trash_path", "rename_path", "copy_path", "reveal_path",
    "open_in_app", "open_url_external", "ensure_path_within", "get_rust_deps",
    "git_discover_repos", "git_resolve_repo_for_file", "git_status", "git_branches",
    "git_current_branch", "git_branch_details", "git_remote_branches", "git_list_remotes",
    "git_has_remote", "git_remote_url", "git_sync_status", "git_log", "git_log_stream_start",
    "git_log_stream_next", "git_log_stream_stop", "git_branch_graph", "git_diff",
    "git_file_diff", "git_list_hunks", "git_stash_list", "git_list_tags", "git_in_progress",
    "git_activity_timeline", "get_conversations", "get_conversation_messages",
    "get_chat_history", "get_chat_title", "get_current_conversation_id", "get_ai_config", "ai_provider_status",
    "ai_load_keys", "ai_vault_supported", "get_chat_generation_state", "get_compaction_state",
    "github_auth_status", "get_mcp_status", "get_mcp_tools", "get_mcp_config_path",
    "ensure_mcp_config", "sync_mcp_servers", "set_ai_config",
    "read_mcp_config", "get_index_status", "get_project_stats", "discover_tests",
    "search_project_files", "search_content", "search_codebase", "browser_tabs",
    "browser_history", "pty_available_shells", "get_package_info", "get_outline",
]);
