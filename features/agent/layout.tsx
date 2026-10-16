"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Chat from "@/features/chat/ui/chat";
import { useProjectState } from "@/lib/backend";
import { cn } from "@/lib/utils";
import { OverlayRootProvider } from "@/lib/ui/overlay-root";
import { AgentSidebar, AGENT_SIDEBAR_NAV_SLOT } from "./sidebar";
import { ChatList } from "./sidebar/chats";
import { AgentChrome } from "./chrome";
import { Status } from "./workbench/status";
import { AgentWorkspace } from "./workspace";
import { AgentOverlayView, type AgentOverlay } from "./overlay";
import { DevRunHost } from "@/features/terminal/dev-run-host";
import { TerminalDock } from "./terminal-dock";
import { ProjectQuickPickHost } from "@/features/chat/ui/shell/project-pick";
import { startAgentBackgroundExitToasts } from "@/features/chat/lib/agent-terminal-notify";
import { useWindowControls } from "@/features/agent/workbench/titlebar/hooks/use-window-controls";
import { WindowControls } from "@/features/agent/workbench/titlebar/ui/window-controls";
import { usePlatform } from "@/lib/platform";
import { normalizePath } from "@/lib/path/utils";
import { NewFilePromptHost } from "./workspace/new-file-prompt";

const MIN_WORKSPACE = 360;
const MIN_WORKSPACE_SOFT = 280;
const MIN_CHAT = 380;
const SIDEBAR_EXPANDED = 304;
const WORKSPACE_GUTTER = 12;
const WINDOW_MIN_HEIGHT = 500;
const WINDOW_MIN_WIDTH = 1000;
const MAX_WORKSPACE_RATIO = 0.72;
const MAX_WORKSPACE_PX = 1200;
const SPLASH_KEY = "bettershape-agent-splash-seen";
const ZEN_KEY = "bettershape-zen-mode";

/**
 * The narrowest the window may be with these columns open.
 *
 * Both floors are needed: the window has a minimum of its own, and the open columns can
 * ask for more than it by themselves.
 */
const layoutMinWidth = (sidebarOpen: boolean, workspaceOpen: boolean) => {
    const sidebar = sidebarOpen ? SIDEBAR_EXPANDED : 0;
    const workspace = workspaceOpen ? MIN_WORKSPACE + WORKSPACE_GUTTER : 0;
    return Math.max(WINDOW_MIN_WIDTH, sidebar + MIN_CHAT + workspace);
};

/**
 * Whether a pointer event landed inside the flyout or on the toggle that summons it.
 *
 * Both markers count as inside, because the toggle sits outside the panel and a click on
 * it must not be read as a click away from the flyout.
 */
const isFlyoutUiTarget = (target: EventTarget | null) => {
    if (!(target instanceof Element)) return false;
    return Boolean(target.closest("[data-sidebar-peek], [data-sidebar-peek-toggle]"));
};

/**
 * The hover rail that stands in for the sidebar while it is closed.
 *
 * The list stays mounted once it has opened, because the hide path runs an exit delay and
 * that needs the list already in the tree.
 */
const SidebarPeek = ({
    shown,
    onEnter,
    onLeave,
}: {
    shown: boolean;
    onEnter: () => void;
    onLeave: () => void;
}) => {
    // The list stays mounted for a moment after the flyout hides, so its exit can finish.
    // It is shown while `shown` is true, or until that delay ends.
    const [host, setHost] = useState<HTMLElement>();
    const [mounted, setMounted] = useState(shown);
    // Opening from hidden must mount the list too, so a later hide can run its exit delay.
    // Adjusted during render instead of in an effect.
    if (shown && !mounted) setMounted(true);
    const attachHost = useCallback((el: HTMLDivElement | null) => setHost(el ?? undefined), []);

    useEffect(() => {
        if (shown) return;
        const exitTimer = window.setTimeout(() => setMounted(false), 200);
        return () => window.clearTimeout(exitTimer);
    }, [shown]);

    return (
        <div
            ref={attachHost}
            data-sidebar-peek=""
            className={cn(
                "fixed z-30 flex w-82 flex-col overflow-visible origin-left",
                // Comes out of the rail button rather than fading in at a fixed spot:
                // the layer grows from the edge the pointer is on and travels the last
                // few pixels, which is what makes the rail feel like a handle.
                "transition-[opacity,transform,translate] duration-[var(--spring-quick-dur)] ease-[var(--spring-quick)]",
                shown ? "opacity-100 translate-x-0" : "pointer-events-none opacity-0 -translate-x-1.5",
            )}
            style={{ top: 0, bottom: 8, left: 8 }}
            onMouseEnter={onEnter}
            onMouseLeave={(e) => {
                if (isFlyoutUiTarget(e.relatedTarget)) return;
                onLeave();
            }}
        >
            <div className="h-titlebar w-10 shrink-0" aria-hidden />
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden squircle-2xl border border-border-subtle bg-sidebar shadow-md/40">
                {(shown || mounted) && host ? (
                    <OverlayRootProvider value={host}>
                        <ChatList
                            onNewChat={() => {
                                window.dispatchEvent(new Event("bettershape-chat-new"));
                                window.dispatchEvent(new Event("bettershape-chat-focus-input"));
                            }}
                        />
                    </OverlayRootProvider>
                ) : null}
            </div>
        </div>
    );
};

/**
 * Agent View, left sidebar (agent / settings / git / files nav),
 * center chrome + content; expanded workspace is full-height; rail under chrome.
 */
/**
 * The agent surface: the sidebar, the chat column and the workspace panel around them.
 *
 * The three columns are measured here rather than left to CSS, because the window's own
 * minimum, the workspace clamp and the chat's minimum all constrain each other.
 */
export const AgentLayout = ({ children }: { children: React.ReactNode }) => {
    const { project_path, active_file } = useProjectState();
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [workspaceOpen, setWorkspaceOpen] = useState(true);
    const [zenMode, setZenMode] = useState(false);
    const [overlay, setOverlay] = useState<AgentOverlay>(null);
    const [workspaceWidth, setWorkspaceWidth] = useState(560);
    const [workspaceFits, setWorkspaceFits] = useState(true);
    const [splash, setSplash] = useState(false);
    const [splashVisible, setSplashVisible] = useState(false);
    const [isResizing, setIsResizing] = useState(false);
    const [navSlot, setNavSlot] = useState<HTMLElement | null>(null);
    const [sidebarFlyout, setSidebarFlyout] = useState(false);
    const flyoutTimer = useRef<number | null>(null);
    const dragging = useRef(false);
    const widthRef = useRef(560);

    useEffect(() => {
        try {
            const stored = Number(localStorage.getItem("bettershape-agent-workspace-width"));
            if (stored >= MIN_WORKSPACE && stored <= MAX_WORKSPACE_PX) {
                setWorkspaceWidth(stored);
                widthRef.current = stored;
            }
            setWorkspaceOpen(localStorage.getItem("bettershape-agent-workspace") !== "false");
            setSidebarOpen(localStorage.getItem("bettershape-agent-sidebar") !== "false");
            setZenMode(localStorage.getItem(ZEN_KEY) === "1");
            if (sessionStorage.getItem(SPLASH_KEY) !== "1") {
                setSplash(true);
            }
        } catch {
            /* ignore */
        }
    }, []);

    // Warm start-command + route map when a project opens (or fingerprint changes).
    useEffect(() => {
        if (!project_path) return;
        void import("@/features/preview/lib/project-warm").then(({ warmProjectAnalysis }) => {
            void warmProjectAnalysis(project_path);
        });
    }, [project_path]);

    useEffect(() => startAgentBackgroundExitToasts(), []);

    // Resolve sidebar nav portal target when overlay / explorer needs it.
    useEffect(() => {
        if (!overlay) {
            setNavSlot(null);
            return;
        }
        // The slot is filled by a portal that mounts after this effect, so the lookup is
        // repeated by the interval below instead of resolved once here.
        const find = () => document.getElementById(AGENT_SIDEBAR_NAV_SLOT);
        setNavSlot(find());
        const id = window.setInterval(() => {
            const el = find();
            if (el) {
                setNavSlot(el);
                window.clearInterval(id);
            }
        }, 30);
        const stop = window.setTimeout(() => window.clearInterval(id), 1500);
        return () => {
            window.clearInterval(id);
            window.clearTimeout(stop);
        };
    }, [overlay, sidebarOpen]);

    useEffect(() => {
        if (!splash) return;
        let seenTimer: number | undefined;
        const raf = requestAnimationFrame(() => setSplashVisible(true));
        const hideTimer = window.setTimeout(() => {
            setSplashVisible(false);
            seenTimer = window.setTimeout(() => {
                try {
                    sessionStorage.setItem(SPLASH_KEY, "1");
                } catch {
                    /* ignore */
                }
                setSplash(false);
            }, 280);
        }, 700);
        return () => {
            cancelAnimationFrame(raf);
            if (hideTimer !== undefined) window.clearTimeout(hideTimer);
            if (seenTimer !== undefined) window.clearTimeout(seenTimer);
        };
    }, [splash]);

    const persistWorkspace = useCallback((next: boolean) => {
        setWorkspaceOpen(next);
        try {
            localStorage.setItem("bettershape-agent-workspace", String(next));
        } catch {
            /* ignore */
        }
    }, []);

    const clampWorkspace = useCallback(
        (x: number, winW = typeof window === "undefined" ? 1280 : window.innerWidth) => {
            const sidebar = sidebarOpen ? SIDEBAR_EXPANDED : 0;
            const maxByChat = Math.max(0, winW - sidebar - MIN_CHAT - WORKSPACE_GUTTER);
            const maxByRatio = Math.min(MAX_WORKSPACE_PX, Math.floor(winW * MAX_WORKSPACE_RATIO));
            const max = Math.min(maxByChat, maxByRatio);
            if (max < MIN_WORKSPACE_SOFT) return 0;
            return Math.min(max, Math.max(MIN_WORKSPACE_SOFT, x));
        },
        [sidebarOpen],
    );

    const prevActiveFile = useRef<string | null>(null);
    useEffect(() => {
        if (!active_file || active_file === prevActiveFile.current) {
            prevActiveFile.current = active_file;
            return;
        }
        prevActiveFile.current = active_file;
        setOverlay(null);
        persistWorkspace(true);
        window.dispatchEvent(
            new CustomEvent("bettershape-open-workspace-file", { detail: { path: active_file } }),
        );
    }, [active_file, persistWorkspace]);

    useEffect(() => {
        // The payload is narrowed here rather than in the caller: the same event carries
        // view names this panel does not own, and only `editor` clears the overlay.
        const onView = (e: Event) => {
            const view = (e as CustomEvent<string>).detail;
            if (view === "editor") {
                setOverlay(null);
                persistWorkspace(true);
            }
            if (view === "chat") setOverlay(null);
        };
        // Clears the overlay before persisting, so what is stored is the layout the diff
        // is about to open into.
        const onFileDiff = () => {
            setOverlay(null);
            persistWorkspace(true);
        };
        window.addEventListener("bettershape-center-view", onView as EventListener);
        window.addEventListener("bettershape-open-file-diff", onFileDiff as EventListener);
        return () => {
            window.removeEventListener("bettershape-center-view", onView as EventListener);
            window.removeEventListener("bettershape-open-file-diff", onFileDiff as EventListener);
        };
    }, [persistWorkspace]);

    const toggleSidebar = useCallback(() => {
        setSidebarFlyout(false);
        setSidebarOpen((prev) => {
            const next = !prev;
            try {
                localStorage.setItem("bettershape-agent-sidebar", String(next));
            } catch {
                /* ignore */
            }
            return next;
        });
    }, []);

    const openSidebarFlyout = useCallback(() => {
        if (flyoutTimer.current) window.clearTimeout(flyoutTimer.current);
        flyoutTimer.current = null;
        setSidebarFlyout(true);
    }, []);

    const closeSidebarFlyout = useCallback(() => {
        if (flyoutTimer.current) window.clearTimeout(flyoutTimer.current);
        flyoutTimer.current = window.setTimeout(() => setSidebarFlyout(false), 180);
    }, []);

    const toggleWorkspace = useCallback(() => {
        if (!project_path) return;
        setWorkspaceOpen((prev) => {
            const next = !prev;
            try {
                localStorage.setItem("bettershape-agent-workspace", String(next));
            } catch {
                /* ignore */
            }
            return next;
        });
    }, [project_path]);

    useEffect(() => {
        // A tab id can arrive with no project behind it, which is why the guard covers
        // both, and the id is lower-cased because the menu sends its label as written.
        const onTab = (e: Event) => {
            const tabId = (e as CustomEvent<string>).detail?.toLowerCase();
            if (!tabId || !project_path) return;
            if (tabId === "files" || tabId === "explorer") {
                setOverlay(null);
                persistWorkspace(true);
                return;
            }
            if (["preview", "browser", "source", "graph", "git", "prs", "pulls", "agents"].includes(tabId)) {
                setOverlay(null);
                persistWorkspace(true);
            }
        };
        // Two ids name this sidebar: the titlebar dispatches one and the keyboard
        // shortcut the other, so both have to be accepted here.
        const onToggle = (e: Event) => {
            const detail = (e as CustomEvent<{ id?: string; value?: boolean }>).detail;
            const id = detail?.id;
            if (id === "primary-sidebar" || id === "agent-sidebar") {
                toggleSidebar();
            }
            if (id === "secondary-sidebar" || id === "agent-workspace") {
                if (detail?.value === false) persistWorkspace(false);
                else if (detail?.value === true) persistWorkspace(true);
                else toggleWorkspace();
            }
            if (id === "panel" || id === "terminal") {
                setOverlay(null);
                return;
            }
            if (id === "files-mode" || id === "explorer") {
                setOverlay(null);
                persistWorkspace(true);
                window.setTimeout(() => {
                    window.dispatchEvent(
                        new CustomEvent("bettershape-set-active-tab", { detail: "files" }),
                    );
                }, 80);
            }
        };
        // A payload with no type is a close request, which is what a surface with nothing
        // to restore sends when the user dismisses it.
        const onOverlay = (e: Event) => {
            const detail = (e as CustomEvent<AgentOverlay>).detail;
            if (!detail || !detail.type) {
                setOverlay(null);
                return;
            }
            // Git Manager overlay removed, Graph lives in the right workspace tab.
            if (detail.type === "git") {
                setOverlay(null);
                persistWorkspace(true);
                window.setTimeout(() => {
                    window.dispatchEvent(
                        new CustomEvent("bettershape-set-active-tab", { detail: "graph" }),
                    );
                }, 80);
                return;
            }
            setOverlay(detail);
            setSidebarOpen(true);
            try {
                localStorage.setItem("bettershape-agent-sidebar", "true");
            } catch {
                /* ignore */
            }
        };
        // The active tab is set through the shared event and not local state: the tab
        // strip belongs to the workspace shell, which is a different subtree.
        const onPrs = () => {
            setOverlay(null);
            persistWorkspace(true);
            window.dispatchEvent(new CustomEvent("bettershape-set-active-tab", { detail: "prs" }));
        };
        window.addEventListener("bettershape-set-active-tab", onTab as EventListener);
        window.addEventListener("bettershape-layout-toggle", onToggle as EventListener);
        window.addEventListener("bettershape-agent-overlay", onOverlay as EventListener);
        window.addEventListener("bettershape-open-pull-requests", onPrs);
        return () => {
            window.removeEventListener("bettershape-set-active-tab", onTab as EventListener);
            window.removeEventListener("bettershape-layout-toggle", onToggle as EventListener);
            window.removeEventListener("bettershape-agent-overlay", onOverlay as EventListener);
            window.removeEventListener("bettershape-open-pull-requests", onPrs);
        };
    }, [project_path, persistWorkspace, toggleSidebar, toggleWorkspace]);

    useEffect(() => {
        // The width is written through the ref: a drag produces a move per frame, and a
        // state write here would re-render the whole layout on every one of them.
        const onMove = (e: MouseEvent) => {
            if (!dragging.current) return;
            const next = clampWorkspace(window.innerWidth - e.clientX);
            if (next < MIN_WORKSPACE_SOFT) return;
            widthRef.current = next;
            setWorkspaceWidth(next);
        };
        // Ends the drag wherever the pointer is, and releases the body flags the start of
        // the drag set.
        const onUp = () => {
            if (!dragging.current) return;
            dragging.current = false;
            setIsResizing(false);
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
            try {
                localStorage.setItem("bettershape-agent-workspace-width", String(widthRef.current));
            } catch {
                /* ignore */
            }
        };
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
        return () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
        };
    }, [clampWorkspace]);

    useEffect(() => {
        // Re-fits the panel after the window changes size, and records whether any width
        // is left for it at all.
        const apply = () => {
            const next = clampWorkspace(widthRef.current);
            setWorkspaceFits(next > 0);
            if (next > 0) {
                setWorkspaceWidth((prev) => (prev === next ? prev : next));
            }
        };
        apply();
        window.addEventListener("resize", apply);
        let unlisten: (() => void) | undefined;
        let cancelled = false;
        void import("@tauri-apps/api/window").then(async ({ getCurrentWindow }) => {
            const stop = await getCurrentWindow().listen("tauri://resize", apply);
            if (cancelled) {
                stop();
                return;
            }
            unlisten = stop;
        });
        return () => {
            cancelled = true;
            window.removeEventListener("resize", apply);
            unlisten?.();
        };
    }, [clampWorkspace, sidebarOpen]);

    useEffect(() => {
        const wantWorkspace = workspaceOpen && Boolean(project_path);
        const minWidth = layoutMinWidth(sidebarOpen, wantWorkspace);
        let cancelled = false;
        void import("@tauri-apps/api/window").then(async ({ getCurrentWindow }) => {
            const { LogicalSize } = await import("@tauri-apps/api/dpi");
            const win = getCurrentWindow();
            await win.setMinSize(new LogicalSize(minWidth, WINDOW_MIN_HEIGHT));
            if (cancelled) return;
            const maximized = await win.isMaximized().catch(() => false);
            if (cancelled || maximized) return;
            const factor = await win.scaleFactor();
            const inner = await win.innerSize();
            const logicalW = inner.width / factor;
            const logicalH = inner.height / factor;
            if (logicalW + 1 < minWidth) {
                await win.setSize(new LogicalSize(minWidth, logicalH));
            }
        }).catch(() => {
            /* browser / tests */
        });
        return () => {
            cancelled = true;
        };
    }, [project_path, sidebarOpen, workspaceOpen]);

    useEffect(() => {
        // Needs a project to open into; without one the event is dropped before the
        // workspace is persisted, so the stored layout keeps matching the screen.
        const onOpenFiles = () => {
            if (!project_path) return;
            persistWorkspace(true);
            window.dispatchEvent(
                new CustomEvent("bettershape-set-active-tab", { detail: "files" }),
            );
        };
        window.addEventListener("bettershape-toggle-design-mode", onOpenFiles);
        window.addEventListener("bettershape-open-browser", onOpenFiles);
        return () => {
            window.removeEventListener("bettershape-toggle-design-mode", onOpenFiles);
            window.removeEventListener("bettershape-open-browser", onOpenFiles);
        };
    }, [project_path, persistWorkspace]);

    /** Terminal lives in the chat column dock, not the right workspace. */
    const openWorkspaceTerminal = useCallback(() => {
        setOverlay(null);
        window.dispatchEvent(
            new CustomEvent("bettershape-layout-toggle", { detail: { id: "terminal", value: true } }),
        );
    }, []);

    useEffect(() => {
        // Shared by the button and the two keyboard paths, so it holds no state of its own
        // and can be dispatched from any of them.
        const onOpenTerminal = () => openWorkspaceTerminal();
        // An empty action is the toggle case: the menu item that focuses the terminal
        // sends no payload at all.
        const onShortcut = (e: Event) => {
            const detail = (e as CustomEvent<{ action?: string }>).detail;
            if (detail?.action === "open" || detail?.action === "toggle" || !detail?.action) {
                openWorkspaceTerminal();
            }
        };
        window.addEventListener("bettershape-open-workspace-terminal", onOpenTerminal);
        window.addEventListener("bettershape-terminal-shortcut", onShortcut as EventListener);
        return () => {
            window.removeEventListener("bettershape-open-workspace-terminal", onOpenTerminal);
            window.removeEventListener("bettershape-terminal-shortcut", onShortcut as EventListener);
        };
    }, [openWorkspaceTerminal]);

    useEffect(() => {
        // Window ▸ Reset Layout: back to the default panes, widths and no zen.
        const onReset = () => {
            setZenMode(false);
            setWorkspaceWidth(560);
            widthRef.current = 560;
            setWorkspaceFits(true);
            persistWorkspace(true);
            setSidebarOpen(true);
            try {
                localStorage.setItem(ZEN_KEY, "0");
                localStorage.setItem("bettershape-agent-sidebar", "true");
                localStorage.removeItem("bettershape-agent-workspace-width");
            } catch {
                /* ignore */
            }
        };
        window.addEventListener("bettershape-layout-reset", onReset);
        return () => window.removeEventListener("bettershape-layout-reset", onReset);
    }, [persistWorkspace]);

    useEffect(() => {
        // The flag is written inside the updater, so the stored value and the rendered one
        // cannot diverge, and a private-mode storage failure is swallowed.
        const onZen = () => {
            setZenMode((prev) => {
                const next = !prev;
                try {
                    localStorage.setItem(ZEN_KEY, next ? "1" : "0");
                } catch {
                    /* ignore */
                }
                return next;
            });
        };
        window.addEventListener("bettershape-toggle-zen-mode", onZen);
        return () => window.removeEventListener("bettershape-toggle-zen-mode", onZen);
    }, []);

    const overlayOpen = overlay != null;
    const showWorkspace = Boolean(project_path) && !overlayOpen;
    // Zen mode hides the side panes without touching the persisted layout prefs.
    const rightExpanded = workspaceOpen && showWorkspace && workspaceFits && !zenMode;
    const sidebarShown = sidebarOpen && !zenMode;
    const { isMaximized, minimize, toggleMaximize, close } = useWindowControls();
    const isMac = usePlatform() === "macos";

    return (
        <div className="relative flex h-full min-h-0 w-full overflow-hidden bg-sidebar">
            <DevRunHost />
            <ProjectQuickPickHost />
            <NewFilePromptHost />
            {splash ? (
                <div
                    className={cn(
                        "pointer-events-none absolute inset-0 z-[100] flex items-center justify-center bg-transparent",
                        // Ambient, not interactive: the splash is not something the user
                        // drives, so it keeps the bezier. See the Motion block in globals.css.
                        "transition-opacity duration-300 ease-[var(--ease-out)]",
                        splashVisible ? "opacity-100" : "opacity-0",
                    )}
                    aria-hidden
                >
                    <Image
src="/logos/logo.png"
                        alt="BetterShape"
                        width={52}
                        height={52}
                        priority
                        style={{ width: 52, height: 52 }}
                        className={cn(
                            "logo-invert transition-opacity duration-500 ease-[var(--ease-out)]",
                            splashVisible ? "opacity-100" : "opacity-0",
                        )}
                    />
                </div>
            ) : null}

            <AgentSidebar
                expanded
                open={sidebarShown}
                overlay={overlay}
                onToggleSidebar={toggleSidebar}
                onSearch={() => {
                    window.dispatchEvent(
                        new CustomEvent("bettershape-command-palette", {
                            detail: { placeholder: "Search…" },
                        }),
                    );
                }}
            />
            {sidebarShown ? null : (
                <SidebarPeek shown={sidebarFlyout} onEnter={openSidebarFlyout} onLeave={closeSidebarFlyout} />
            )}

            <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-panel rounded-xl border-l border-border">
                <AgentChrome
                    rightOpen={rightExpanded}
                    onToggleRight={toggleWorkspace}
                    canToggleRight={Boolean(project_path) && !overlayOpen}
                    showRightToggle={!overlayOpen}
                    padWindowControls
                    sidebarOpen={sidebarOpen}
                    onToggleSidebar={toggleSidebar}
                    onSidebarHoverStart={openSidebarFlyout}
                    onSidebarHoverEnd={closeSidebarFlyout}
                    windowControls={{
                        isMaximized,
                        onMinimize: minimize,
                        onToggleMaximize: () => void toggleMaximize(),
                        onClose: close,
                    }}
                />
                <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
                <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
                    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                            {overlay ? (
                                <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
                                    <AgentOverlayView
                                        overlay={overlay}
                                        onClose={() => setOverlay(null)}
                                        navPortalTarget={navSlot}
                                        sidebarExpanded={sidebarOpen}
                                    />
                                </div>
                            ) : project_path ? (
                                <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
                                    <Chat
                                        key={normalizePath(project_path).toLowerCase()}
                                        className="bg-transparent"
                                    />
                                </div>
                            ) : (
                                <div className="h-full overflow-hidden bg-transparent" data-tauri-drag-region>
                                    {children}
                                </div>
                            )}
                            {project_path ? <TerminalDock /> : null}
                    </div>
                </div>
                {showWorkspace && project_path ? (
                    <>
                        <div
                            role="separator"
                            aria-orientation="vertical"
                            aria-label="Resize workspace"
                            className={cn(
                                "group relative z-30 w-0 shrink-0",
                                !rightExpanded && "pointer-events-none opacity-0",
                            )}
                            onMouseDown={(e) => {
                                if (!rightExpanded) return;
                                e.preventDefault();
                                dragging.current = true;
                                setIsResizing(true);
                                document.body.style.cursor = "col-resize";
                                document.body.style.userSelect = "none";
                            }}
                        >
                            <div className="absolute inset-y-3 -left-1.5 w-3 cursor-col-resize" />
                            {/* Matches the panel separators: a hairline that lights up on
                                hover and stays lit while the drag is live. */}
                            <div
                                aria-hidden
                                className={cn(
                                    "pointer-events-none absolute inset-y-3 left-0 w-px transition-colors duration-[var(--spring-tap-dur)] ease-[var(--spring-tap)]",
                                    rightExpanded && "group-hover:bg-accent/40",
                                    isResizing && "bg-accent/60",
                                )}
                            />
                        </div>
                        <div
                            style={{
                                width: rightExpanded ? workspaceWidth + 12 : 0,
                                flex: "0 0 auto",
                            }}
                            className={cn(
                                "h-full min-w-0 overflow-hidden",
                                rightExpanded ? "py-2 pr-2" : "pointer-events-none p-0",
                                !isResizing &&
                                    "transition-[width] duration-[var(--spring-quick-dur)] ease-[var(--spring-quick)]",
                            )}
                            aria-hidden={!rightExpanded}
                        >
                            {rightExpanded ? (
                                <div
                                    style={{ width: workspaceWidth }}
                                    className="relative flex h-full overflow-hidden rounded-xl bg-sidebar border border-border-subtle"
                                >
                                    <AgentWorkspace
                                        projectPath={project_path}
                                        expanded
                                        onExpand={() => persistWorkspace(true)}
                                    />
                                </div>
                            ) : null}
                        </div>
                    </>
                ) : null}
                </div>
                {project_path ? <Status /> : null}
            </div>
            {isMac ? null : (
                <WindowControls
                    isMaximized={isMaximized}
                    onMinimize={minimize}
                    onToggleMaximize={() => void toggleMaximize()}
                    onClose={close}
                    surface="panel"
                    spacer={false}
                />
            )}
        </div>
    );
};
