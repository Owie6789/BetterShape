"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
const DEFAULT_WORKSPACE_WIDTH = 560;
const SPLASH_KEY = "bettershape-agent-splash-seen";
const ZEN_KEY = "bettershape-zen-mode";
const WORKSPACE_STORE_KEY = "bettershape-agent-workspace";
const SIDEBAR_STORE_KEY = "bettershape-agent-sidebar";
const WORKSPACE_WIDTH_KEY = "bettershape-agent-workspace-width";
/** The sidebar's exit animation runs before its hover flyout unmounts. */
const PEEK_EXIT_MS = 200;
/** Long enough for the pointer to cross the gap between the rail and the flyout. */
const FLYOUT_EXIT_MS = 180;
/** The overlay's nav slot is filled by a portal that mounts after the effect runs. */
const NAV_SLOT_POLL_MS = 30;
const NAV_SLOT_GIVE_UP_MS = 1500;
const SPLASH_HOLD_MS = 700;
const SPLASH_FADE_MS = 280;
/** The tab strip reads the shared event on its next pass, not in the dispatching one. */
const TAB_SETTLE_MS = 80;

/** Ids that mean "toggle the sidebar", in the spelling each caller uses. */
const SIDEBAR_TOGGLE_IDS = ["primary-sidebar", "agent-sidebar"];
/** Ids that mean "toggle the workspace column", in the spelling each caller uses. */
const WORKSPACE_TOGGLE_IDS = ["secondary-sidebar", "agent-workspace"];
/** Ids that mean "close whatever the workspace is showing", not a column at all. */
const OVERLAY_TOGGLE_IDS = ["panel", "terminal"];
/** Ids for the workspace's file tab, which is opened rather than just unoverlaid. */
const FILE_TOGGLE_IDS = ["files-mode", "explorer"];
/** Every tab id the layout answers to, whether the menu sends a label or a slug. */
const WORKSPACE_TAB_IDS = [
    "files",
    "explorer",
    "preview",
    "browser",
    "source",
    "graph",
    "git",
    "prs",
    "pulls",
    "agents",
];

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

/** The window's width, with a desktop default for the server pass where there is none. */
const viewportWidth = () => (typeof window === "undefined" ? 1280 : window.innerWidth);

/**
 * The clamped workspace width for a window of `winW` pixels.
 *
 * Both limits apply: the chat keeps its own minimum, and the workspace stops at a fraction
 * of the window. A window too narrow for even the soft minimum returns 0, which the caller
 * reads as "there is no room for this column".
 */
const clampWorkspaceWidth = (x: number, winW: number, sidebarOpen: boolean) => {
    const sidebar = sidebarOpen ? SIDEBAR_EXPANDED : 0;
    const maxByChat = Math.max(0, winW - sidebar - MIN_CHAT - WORKSPACE_GUTTER);
    const maxByRatio = Math.min(MAX_WORKSPACE_PX, Math.floor(winW * MAX_WORKSPACE_RATIO));
    const max = Math.min(maxByChat, maxByRatio);
    if (max < MIN_WORKSPACE_SOFT) return 0;
    return Math.min(max, Math.max(MIN_WORKSPACE_SOFT, x));
};

/** Saves a preference, swallowing the throw a browser in private mode raises on write. */
const writeStored = (key: string, value: string) => {
    try {
        localStorage.setItem(key, value);
    } catch {
        /* private mode */
    }
};

/**
 * Reads a stored flag. Anything except the literal "false" counts as on, and a storage
 * refusal answers with the default rather than throwing into the mount effect.
 */
const readStoredFlag = (key: string, fallback: boolean) => {
    try {
        const raw = localStorage.getItem(key);
        return raw === null ? fallback : raw !== "false";
    } catch {
        return fallback;
    }
};

/** Zen mode is stored as "1"/"0" rather than as the boolean string the flags use. */
const readStoredZen = () => {
    try {
        return localStorage.getItem(ZEN_KEY) === "1";
    } catch {
        return false;
    }
};

/** The stored width, or `undefined` when it is absent or outside the allowed band. */
const readStoredWidth = () => {
    try {
        const stored = Number(localStorage.getItem(WORKSPACE_WIDTH_KEY));
        if (stored >= MIN_WORKSPACE && stored <= MAX_WORKSPACE_PX) return stored;
        return undefined;
    } catch {
        return undefined;
    }
};

/** Whether the splash has already played in this tab; a storage refusal counts as played. */
const hasSeenSplash = () => {
    try {
        return sessionStorage.getItem(SPLASH_KEY) === "1";
    } catch {
        return true;
    }
};

/** Records that this tab has played the splash, so a reload does not replay it. */
const markSplashSeen = () => {
    try {
        sessionStorage.setItem(SPLASH_KEY, "1");
    } catch {
        /* private mode */
    }
};

/**
 * The workspace's tab strip listens for this on its next pass, so the dispatch is deferred
 * to after the commit that changed the layout.
 */
const selectWorkspaceTab = (tabId: string) => {
    window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent("bettershape-set-active-tab", { detail: tabId }));
    }, TAB_SETTLE_MS);
};

/** Whether the workspace column is drawn at all: it needs a project and no overlay. */
const workspaceVisible = (projectPath: string | null, overlayOpen: boolean) =>
    Boolean(projectPath) && !overlayOpen;

/** Whether the workspace column is at its full width, which zen mode and the window veto. */
const workspaceExpanded = (
    visible: boolean,
    workspaceOpen: boolean,
    fits: boolean,
    zenMode: boolean,
) => visible && workspaceOpen && fits && !zenMode;

/** Whether the sidebar is drawn. Zen mode hides it without touching the stored layout. */
const sidebarVisible = (sidebarOpen: boolean, zenMode: boolean) => sidebarOpen && !zenMode;

/** The width wrapper around the workspace: its gutter is part of the animated width. */
const workspacePaneStyle = (expanded: boolean, width: number) => ({
    width: expanded ? width + WORKSPACE_GUTTER : 0,
    flex: "0 0 auto" as const,
});

/** The width wrapper's classes: it pads only while the column is open, and eases only when
 * the width is not being dragged, because a drag already writes a width per frame. */
const workspacePaneClass = (expanded: boolean, isResizing: boolean) =>
    cn(
        "h-full min-w-0 overflow-hidden",
        expanded ? "py-2 pr-2" : "pointer-events-none p-0",
        !isResizing && "transition-[width] duration-[var(--spring-quick-dur)] ease-[var(--spring-quick)]",
    );

/** The drag handle's classes: it only answers the pointer while its column is open. */
const resizeHandleClass = (enabled: boolean) =>
    cn("group relative z-30 w-0 shrink-0", !enabled && "pointer-events-none opacity-0");

/** The hairline inside the handle, lit on hover and while a drag is live. */
const resizeHairlineClass = (enabled: boolean, active: boolean) =>
    cn(
        "pointer-events-none absolute inset-y-3 left-0 w-px transition-colors duration-[var(--spring-tap-dur)] ease-[var(--spring-tap)]",
        enabled && "group-hover:bg-accent/40",
        active && "bg-accent/60",
    );

/** The flyout's classes: it grows out of the rail's edge rather than fading in place. */
const peekShellClass = (shown: boolean) =>
    cn(
        "fixed z-30 flex w-82 flex-col overflow-visible origin-left",
        // Comes out of the rail button rather than fading in at a fixed spot:
        // the layer grows from the edge the pointer is on and travels the last
        // few pixels, which is what makes the rail feel like a handle.
        "transition-[opacity,transform,translate] duration-[var(--spring-quick-dur)] ease-[var(--spring-quick)]",
        shown ? "opacity-100 translate-x-0" : "pointer-events-none opacity-0 -translate-x-1.5",
    );

/** The splash overlay's classes: a mark over the shell, faded by the same flag it fades on. */
const splashShellClass = (visible: boolean) =>
    cn(
        "pointer-events-none absolute inset-0 z-[100] flex items-center justify-center bg-transparent",
        // Ambient, not interactive: the splash is not something the user drives, so it
        // keeps the bezier. See the Motion block in globals.css.
        "transition-opacity duration-300 ease-[var(--ease-out)]",
        visible ? "opacity-100" : "opacity-0",
    );

/** The mark's own classes: it runs a longer fade than the layer it sits on. */
const splashMarkClass = (visible: boolean) =>
    cn(
        "logo-invert transition-opacity duration-500 ease-[var(--ease-out)]",
        visible ? "opacity-100" : "opacity-0",
    );

/**
 * Keeps a layer mounted for the length of its exit.
 *
 * The layer mounts on the way in and is dropped by a timer after `shown` goes false, so the
 * exit animation still has a node to run on.
 */
const useExitDelay = (shown: boolean, delayMs: number) => {
    const [mounted, setMounted] = useState(shown);
    // Opening from hidden must mount the layer too, so a later hide can run its exit delay.
    // Adjusted during render instead of in an effect.
    if (shown && !mounted) setMounted(true);

    useEffect(() => {
        if (shown) return undefined;
        const exitTimer = window.setTimeout(() => setMounted(false), delayMs);
        return () => window.clearTimeout(exitTimer);
    }, [shown, delayMs]);

    return mounted;
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
    const [host, setHost] = useState<HTMLElement>();
    const mounted = useExitDelay(shown, PEEK_EXIT_MS);
    /** The portal host is state rather than a ref: the list renders into it, so it has to
     * be part of the render that mounts the list. */
    const attachHost = useCallback((el: HTMLDivElement | null) => setHost(el ?? undefined), []);
    // Leaving onto the toggle itself is not leaving the flyout: the toggle is the way back.
    const leaveUnlessToggle = (e: React.MouseEvent) => {
        if (isFlyoutUiTarget(e.relatedTarget)) return;
        onLeave();
    };

    return (
        <div
            ref={attachHost}
            data-sidebar-peek=""
            className={peekShellClass(shown)}
            style={{ top: 0, bottom: 8, left: 8 }}
            onMouseEnter={onEnter}
            onMouseLeave={leaveUnlessToggle}
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

/** The start-up mark, drawn over the shell while the layout settles. */
const AgentSplash = ({ visible }: { visible: boolean }) => (
    <div className={splashShellClass(visible)} aria-hidden>
        <Image
            src="/logos/logo.png"
            alt="BetterShape"
            width={52}
            height={52}
            priority
            style={{ width: 52, height: 52 }}
            className={splashMarkClass(visible)}
        />
    </div>
);

/** The separator between the chat and the workspace. It starts the drag, nothing else. */
const WorkspaceResizeHandle = ({
    enabled,
    active,
    onStart,
}: {
    enabled: boolean;
    active: boolean;
    onStart: () => void;
}) => (
    <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize workspace"
        className={resizeHandleClass(enabled)}
        onMouseDown={(e) => {
            if (!enabled) return;
            e.preventDefault();
            onStart();
        }}
    >
        <div className="absolute inset-y-3 -left-1.5 w-3 cursor-col-resize" />
        {/* Matches the panel separators: a hairline that lights up on
            hover and stays lit while the drag is live. */}
        <div aria-hidden className={resizeHairlineClass(enabled, active)} />
    </div>
);

/** The workspace column: the animated width, and the panel inside it. */
const AgentWorkspaceColumn = ({
    expanded,
    width,
    projectPath,
    isResizing,
    onStartDrag,
    onExpand,
}: {
    expanded: boolean;
    width: number;
    projectPath: string;
    isResizing: boolean;
    onStartDrag: () => void;
    onExpand: () => void;
}) => (
    <>
        <WorkspaceResizeHandle enabled={expanded} active={isResizing} onStart={onStartDrag} />
        <div
            style={workspacePaneStyle(expanded, width)}
            className={workspacePaneClass(expanded, isResizing)}
            aria-hidden={!expanded}
        >
            {expanded ? (
                <div
                    style={{ width }}
                    className="relative flex h-full overflow-hidden rounded-xl bg-sidebar border border-border-subtle"
                >
                    <AgentWorkspace projectPath={projectPath} expanded onExpand={onExpand} />
                </div>
            ) : null}
        </div>
    </>
);

/** The center column's content: the overlay if one is open, the chat if a project is, and
 * the welcome content otherwise. The dock rides with the chat it belongs to. */
const AgentCenterContent = ({
    overlay,
    projectPath,
    navSlot,
    sidebarOpen,
    onCloseOverlay,
    children,
}: {
    overlay: AgentOverlay;
    projectPath: string | null;
    navSlot: HTMLElement | null;
    sidebarOpen: boolean;
    onCloseOverlay: () => void;
    children: ReactNode;
}) => (
    <>
        {overlay ? (
            <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
                <AgentOverlayView
                    overlay={overlay}
                    onClose={onCloseOverlay}
                    navPortalTarget={navSlot}
                    sidebarExpanded={sidebarOpen}
                />
            </div>
        ) : projectPath ? (
            <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
                <Chat key={normalizePath(projectPath).toLowerCase()} className="bg-transparent" />
            </div>
        ) : (
            <div className="h-full overflow-hidden bg-transparent" data-tauri-drag-region>
                {children}
            </div>
        )}
        {projectPath ? <TerminalDock /> : null}
    </>
);

/** The window buttons the desktop shell draws outside the panel, on Windows and Linux. */
const ShellWindowControls = ({
    isMac,
    isMaximized,
    onMinimize,
    onToggleMaximize,
    onClose,
}: {
    isMac: boolean;
    isMaximized: boolean;
    onMinimize: () => void;
    onToggleMaximize: () => void;
    onClose: () => void;
}) =>
    isMac ? null : (
        <WindowControls
            isMaximized={isMaximized}
            onMinimize={onMinimize}
            onToggleMaximize={onToggleMaximize}
            onClose={onClose}
            surface="panel"
            spacer={false}
        />
    );

/** The middle column: the chrome strip, the content, the workspace beside it, the status bar. */
const AgentCenterColumn = ({
    chrome,
    workspace,
    content,
    projectPath,
}: {
    chrome: ReactNode;
    workspace: ReactNode;
    content: ReactNode;
    projectPath: string | null;
}) => (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-panel rounded-xl border-l border-border">
        {chrome}
        <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
            <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
                <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                    {content}
                </div>
            </div>
            {workspace}
        </div>
        {projectPath ? <Status /> : null}
    </div>
);

/**
 * The layout preferences, read from storage once after mount.
 *
 * The read is an effect rather than a state initialiser because the server has no storage:
 * painting the stored layout on the first client pass would hydrate a tree the server never
 * sent.
 */
const useStoredLayout = () => {
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [workspaceOpen, setWorkspaceOpen] = useState(true);
    const [zenMode, setZenMode] = useState(false);
    const [splash, setSplash] = useState(false);
    const [storedWidth, setStoredWidth] = useState<number | undefined>(undefined);

    useEffect(() => {
        setStoredWidth(readStoredWidth());
        setSidebarOpen(readStoredFlag(SIDEBAR_STORE_KEY, true));
        setWorkspaceOpen(readStoredFlag(WORKSPACE_STORE_KEY, true));
        setZenMode(readStoredZen());
        setSplash(!hasSeenSplash());
    }, []);

    return {
        sidebarOpen,
        setSidebarOpen,
        workspaceOpen,
        setWorkspaceOpen,
        zenMode,
        setZenMode,
        splash,
        setSplash,
        storedWidth,
    };
};

/**
 * The workspace column's width, the drag that changes it, and the room left for it.
 *
 * The width is held in a ref as well as state: a drag delivers a move per frame, so the ref
 * carries the value between frames and the state write is only what the layout reads.
 */
const useWorkspaceWidth = (sidebarOpen: boolean, storedWidth: number | undefined) => {
    const [width, setWidth] = useState(DEFAULT_WORKSPACE_WIDTH);
    const [fits, setFits] = useState(true);
    const [isResizing, setIsResizing] = useState(false);
    const widthRef = useRef(DEFAULT_WORKSPACE_WIDTH);
    const dragging = useRef(false);

    /** A move only counts mid-drag, and a width that would starve the chat is refused. */
    const onMove = useCallback(
        (e: MouseEvent) => {
            if (!dragging.current) return;
            const next = clampWorkspaceWidth(window.innerWidth - e.clientX, window.innerWidth, sidebarOpen);
            if (next < MIN_WORKSPACE_SOFT) return;
            widthRef.current = next;
            setWidth(next);
        },
        [sidebarOpen],
    );

    /** Ends the drag wherever the pointer is, and releases the body flags the start set. */
    const endDrag = useCallback(() => {
        if (!dragging.current) return;
        dragging.current = false;
        setIsResizing(false);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        writeStored(WORKSPACE_WIDTH_KEY, String(widthRef.current));
    }, []);

    useEffect(() => {
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", endDrag);
        return () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", endDrag);
        };
    }, [onMove, endDrag]);

    /** Re-fits the column after the window changes size, and records whether any width is
     * left for it at all. */
    const fitToWindow = useCallback(() => {
        const next = clampWorkspaceWidth(widthRef.current, viewportWidth(), sidebarOpen);
        setFits(next > 0);
        if (next > 0) setWidth((prev) => (prev === next ? prev : next));
    }, [sidebarOpen]);

    useEffect(() => {
        // The stored width arrives one render after the prefs are read, so the fit pass is
        // what applies it: a stored value only survives if the window still has room.
        if (storedWidth !== undefined) widthRef.current = storedWidth;
        fitToWindow();
        window.addEventListener("resize", fitToWindow);
        let unlisten: (() => void) | undefined;
        let cancelled = false;
        import("@tauri-apps/api/window")
            .then(async ({ getCurrentWindow }) => {
                // The desktop shell reports its own resizes too, and a maximised window
                // reports them for the same reasons the browser does.
                const stop = await getCurrentWindow().listen("tauri://resize", fitToWindow);
                if (cancelled) {
                    stop();
                    return;
                }
                unlisten = stop;
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
            window.removeEventListener("resize", fitToWindow);
            unlisten?.();
        };
    }, [fitToWindow, sidebarOpen, storedWidth]);

    /** The separator takes the pointer, so the cursor and the selection lock out for the drag. */
    const startDrag = useCallback(() => {
        dragging.current = true;
        setIsResizing(true);
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
    }, []);

    /** Window ▸ Reset Layout returns the column to the width it ships with. */
    const resetWidth = useCallback(() => {
        widthRef.current = DEFAULT_WORKSPACE_WIDTH;
        setWidth(DEFAULT_WORKSPACE_WIDTH);
        setFits(true);
    }, []);

    return { width, fits, isResizing, startDrag, resetWidth };
};

/**
 * Grows the window to the minimum the open columns ask for.
 *
 * The floor is applied to the window rather than to the columns, because a window smaller
 * than its own content clips the chat, which is the column that must not shrink. The
 * cancelled check runs after every await: the columns can close again while the shell is
 * being resized.
 */
const fitWindowToColumns = async (minWidth: number, isCancelled: () => boolean) => {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const { LogicalSize } = await import("@tauri-apps/api/dpi");
    const win = getCurrentWindow();
    await win.setMinSize(new LogicalSize(minWidth, WINDOW_MIN_HEIGHT));
    const maximized = await win.isMaximized().catch(() => false);
    if (isCancelled() || maximized) return;
    const factor = await win.scaleFactor();
    const inner = await win.innerSize();
    const logicalW = inner.width / factor;
    const logicalH = inner.height / factor;
    if (logicalW + 1 < minWidth) {
        await win.setSize(new LogicalSize(minWidth, logicalH));
    }
};

/** Applies the columns' minimum to the window whenever the open columns change. */
const useWindowMinSize = (
    sidebarOpen: boolean,
    workspaceOpen: boolean,
    projectPath: string | null,
) => {
    useEffect(() => {
        const wantWorkspace = workspaceOpen && Boolean(projectPath);
        let cancelled = false;
        fitWindowToColumns(
            layoutMinWidth(sidebarOpen, wantWorkspace),
            () => cancelled,
        ).catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, [projectPath, sidebarOpen, workspaceOpen]);
};

/**
 * The element the overlay portals its nav into.
 *
 * The portal mounts after this effect runs, so the node is looked for on an interval rather
 * than resolved once; the interval and its give-up timer are both cleared on the way out.
 * The sidebar is a dependency because toggling it remounts the portal target.
 */
const useNavSlot = (overlay: AgentOverlay, sidebarOpen: boolean) => {
    const [navSlot, setNavSlot] = useState<HTMLElement | null>(null);

    useEffect(() => {
        if (!overlay) {
            setNavSlot(null);
            return undefined;
        }
        const find = () => document.getElementById(AGENT_SIDEBAR_NAV_SLOT);
        setNavSlot(find());
        const id = window.setInterval(() => {
            const el = find();
            if (!el) return;
            setNavSlot(el);
            window.clearInterval(id);
        }, NAV_SLOT_POLL_MS);
        const stop = window.setTimeout(() => window.clearInterval(id), NAV_SLOT_GIVE_UP_MS);
        return () => {
            window.clearInterval(id);
            window.clearTimeout(stop);
        };
    }, [overlay, sidebarOpen]);

    return navSlot;
};

/**
 * Runs the splash once per tab: fade in, hold, then mark the tab as seen.
 *
 * The two timers are chained, so the longer one is only scheduled once the fade has started,
 * and both are cleared if the effect tears down mid-run.
 */
const useSplashSequence = (splash: boolean, setSplash: (next: boolean) => void) => {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        if (!splash) return undefined;
        let seenTimer: number | undefined;
        const raf = requestAnimationFrame(() => setVisible(true));
        const hideTimer = window.setTimeout(() => {
            setVisible(false);
            seenTimer = window.setTimeout(() => {
                markSplashSeen();
                setSplash(false);
            }, SPLASH_FADE_MS);
        }, SPLASH_HOLD_MS);
        return () => {
            cancelAnimationFrame(raf);
            if (hideTimer !== undefined) window.clearTimeout(hideTimer);
            if (seenTimer !== undefined) window.clearTimeout(seenTimer);
        };
    }, [splash, setSplash]);

    return visible;
};

/**
 * The hover flyout behind the collapsed sidebar.
 *
 * The close is delayed so the pointer can cross the gap between the rail and the panel,
 * and opening clears that timer so a re-entry does not inherit a pending close.
 */
const useSidebarFlyout = () => {
    const [open, setOpen] = useState(false);
    const closeTimer = useRef<number | null>(null);

    /** A re-entry clears the pending close instead of inheriting it. */
    const openFlyout = useCallback(() => {
        if (closeTimer.current) window.clearTimeout(closeTimer.current);
        closeTimer.current = null;
        setOpen(true);
    }, []);

    /** The close waits out the gap between the rail and the flyout's own edge. */
    const closeFlyout = useCallback(() => {
        if (closeTimer.current) window.clearTimeout(closeTimer.current);
        closeTimer.current = window.setTimeout(() => setOpen(false), FLYOUT_EXIT_MS);
    }, []);

    return { openFlyout, closeFlyout, flyoutOpen: open };
};

/** What a layout event is allowed to change, so a handler cannot reach past the layout. */
type LayoutActions = {
    toggleSidebar: () => void;
    setWorkspace: (next: boolean) => void;
    toggleWorkspace: () => void;
    closeOverlay: () => void;
    /** Shows the workspace beside the chat, leaving the tab strip where it is. */
    openWorkspace: () => void;
    /** Shows the workspace on its file tab, which is what the file-mode ids ask for. */
    openFiles: () => void;
};

/** A workspace toggle with a value sets that value; one without flips what is open now. */
const setWorkspaceFromToggle = (value: boolean | undefined, actions: LayoutActions) => {
    if (value === false) actions.setWorkspace(false);
    else if (value === true) actions.setWorkspace(true);
    else actions.toggleWorkspace();
};

/**
 * Routes one layout toggle to the column it names.
 *
 * Four id families arrive on the same event, and each names its column differently: the
 * titlebar sends `primary-sidebar` where the keyboard shortcut sends `agent-sidebar`.
 */
const applyLayoutToggle = (
    id: string | undefined,
    value: boolean | undefined,
    actions: LayoutActions,
) => {
    if (id === undefined) return;
    if (SIDEBAR_TOGGLE_IDS.includes(id)) {
        actions.toggleSidebar();
        return;
    }
    if (WORKSPACE_TOGGLE_IDS.includes(id)) {
        setWorkspaceFromToggle(value, actions);
        return;
    }
    applyColumnControl(id, actions);
};

/** The two id families that close what a column shows rather than toggling the column. */
const applyColumnControl = (id: string, actions: LayoutActions) => {
    if (OVERLAY_TOGGLE_IDS.includes(id)) {
        actions.closeOverlay();
        return;
    }
    if (FILE_TOGGLE_IDS.includes(id)) actions.openFiles();
};

/**
 * Opens the workspace for one tab id.
 *
 * Both the file ids and the workspace tab ids mean the same thing here, and the id arrives
 * as a label from the menu, so it is lower-cased before it is matched. An id with no project
 * behind it is dropped, so the stored layout keeps matching the screen.
 */
const openWorkspaceForTab = (
    tabId: string | undefined,
    projectPath: string | null,
    actions: LayoutActions,
) => {
    if (!tabId || !projectPath) return;
    if (WORKSPACE_TAB_IDS.includes(tabId)) actions.openWorkspace();
};

/** What an overlay request needs: it either closes, shows, or routes to the graph tab. */
type OverlayActions = {
    closeOverlay: () => void;
    showOverlay: (overlay: AgentOverlay) => void;
    openGraphTab: () => void;
};

/**
 * Applies one overlay request.
 *
 * A payload without a type is a dismissal, which is what a surface with nothing to restore
 * sends. A git payload goes to the workspace's graph tab instead of the overlay: the overlay
 * only exists for what has no tab of its own.
 */
const applyOverlayRequest = (detail: AgentOverlay, actions: OverlayActions) => {
    if (!detail || !detail.type) {
        actions.closeOverlay();
        return;
    }
    if (detail.type === "git") {
        actions.openGraphTab();
        return;
    }
    actions.showOverlay(detail);
};

/**
 * Wires the window events that drive the layout.
 *
 * Every handler goes through the same action bag, so a handler added here cannot reach past
 * the layout's own state, and the four listeners share one teardown.
 */
const useLayoutEvents = (
    projectPath: string | null,
    actions: LayoutActions,
    overlayActions: OverlayActions,
    openPullRequests: () => void,
) => {
    useEffect(() => {
        // The id arrives as a label from the menu, so it is lower-cased before matching.
        const onTab = (e: Event) =>
            openWorkspaceForTab(
                (e as CustomEvent<string>).detail?.toLowerCase(),
                projectPath,
                actions,
            );
        const onToggle = (e: Event) => {
            const detail = (e as CustomEvent<{ id?: string; value?: boolean }>).detail;
            applyLayoutToggle(detail?.id, detail?.value, actions);
        };
        const onOverlay = (e: Event) =>
            applyOverlayRequest((e as CustomEvent<AgentOverlay>).detail, overlayActions);
        window.addEventListener("bettershape-set-active-tab", onTab);
        window.addEventListener("bettershape-layout-toggle", onToggle);
        window.addEventListener("bettershape-agent-overlay", onOverlay);
        window.addEventListener("bettershape-open-pull-requests", openPullRequests);
        return () => {
            window.removeEventListener("bettershape-set-active-tab", onTab);
            window.removeEventListener("bettershape-layout-toggle", onToggle);
            window.removeEventListener("bettershape-agent-overlay", onOverlay);
            window.removeEventListener("bettershape-open-pull-requests", openPullRequests);
        };
    }, [projectPath, actions, overlayActions, openPullRequests]);
};

/**
 * The center-view requests: a view name, or a file diff, each of which clears whatever
 * overlay the workspace is showing before the layout is persisted.
 *
 * The payload is narrowed here rather than in the caller, because the same event carries
 * view names this panel does not own, and only `editor` and `chat` clear the overlay.
 */
const useCenterViewEvents = (setOverlay: (overlay: AgentOverlay) => void, openWorkspace: () => void) => {
    useEffect(() => {
        const onView = (e: Event) => {
            const view = (e as CustomEvent<string>).detail;
            if (view === "editor" || view === "chat") {
                setOverlay(null);
                if (view === "editor") openWorkspace();
            }
        };
        window.addEventListener("bettershape-center-view", onView);
        window.addEventListener("bettershape-open-file-diff", openWorkspace);
        return () => {
            window.removeEventListener("bettershape-center-view", onView);
            window.removeEventListener("bettershape-open-file-diff", openWorkspace);
        };
    }, [setOverlay, openWorkspace]);
};

/**
 * The two requests that open the workspace's file tab: design mode and the browser open
 * into it, and both need a project to open into.
 */
const useWorkspaceRequestEvents = (projectPath: string | null, openWorkspace: () => void) => {
    useEffect(() => {
        if (!projectPath) return undefined;
        window.addEventListener("bettershape-toggle-design-mode", openWorkspace);
        window.addEventListener("bettershape-open-browser", openWorkspace);
        return () => {
            window.removeEventListener("bettershape-toggle-design-mode", openWorkspace);
            window.removeEventListener("bettershape-open-browser", openWorkspace);
        };
    }, [projectPath, openWorkspace]);
};

/**
 * Whether a terminal shortcut asks for the terminal.
 *
 * An empty action is the toggle case: the menu item that focuses the terminal sends no
 * payload at all.
 */
const wantsTerminal = (action: string | undefined) =>
    !action || action === "open" || action === "toggle";

/** Opens the workspace's terminal, from the button or from either keyboard path. */
const useTerminalShortcutEvents = (openTerminal: () => void) => {
    useEffect(() => {
        const onShortcut = (e: Event) => {
            if (wantsTerminal((e as CustomEvent<{ action?: string }>).detail?.action)) {
                openTerminal();
            }
        };
        window.addEventListener("bettershape-open-workspace-terminal", openTerminal);
        window.addEventListener("bettershape-terminal-shortcut", onShortcut);
        return () => {
            window.removeEventListener("bettershape-open-workspace-terminal", openTerminal);
            window.removeEventListener("bettershape-terminal-shortcut", onShortcut);
        };
    }, [openTerminal]);
};

/** The window menu's own commands, which rewrite the stored preferences. */
const useWindowMenuEvents = (resetLayout: () => void, toggleZen: () => void) => {
    useEffect(() => {
        window.addEventListener("bettershape-layout-reset", resetLayout);
        window.addEventListener("bettershape-toggle-zen-mode", toggleZen);
        return () => {
            window.removeEventListener("bettershape-layout-reset", resetLayout);
            window.removeEventListener("bettershape-toggle-zen-mode", toggleZen);
        };
    }, [resetLayout, toggleZen]);
};

/**
 * Opens the workspace when the active file changes.
 *
 * The previous path is kept in a ref: the event is dispatched for a change, so re-running
 * for the same path would reopen it after the user moved away.
 */
const useActiveFileEvents = (
    activeFile: string | null,
    setOverlay: (overlay: AgentOverlay) => void,
    openWorkspace: () => void,
) => {
    const previousFile = useRef<string | null>(null);

    useEffect(() => {
        if (!activeFile || activeFile === previousFile.current) {
            previousFile.current = activeFile;
            return undefined;
        }
        previousFile.current = activeFile;
        setOverlay(null);
        openWorkspace();
        window.dispatchEvent(
            new CustomEvent("bettershape-open-workspace-file", { detail: { path: activeFile } }),
        );
        return undefined;
    }, [activeFile, setOverlay, openWorkspace]);
};

/**
 * The agent surface: the sidebar, the chat column and the workspace panel around them.
 *
 * The three columns are measured here rather than left to CSS, because the window's own
 * minimum, the workspace clamp and the chat's minimum all constrain each other.
 */
export const AgentLayout = ({ children }: { children: React.ReactNode }) => {
    const { project_path, active_file } = useProjectState();
    const [overlay, setOverlay] = useState<AgentOverlay>(null);
    const {
        sidebarOpen,
        setSidebarOpen,
        workspaceOpen,
        setWorkspaceOpen,
        zenMode,
        setZenMode,
        splash,
        setSplash,
        storedWidth,
    } = useStoredLayout();
    const { width, fits, isResizing, startDrag, resetWidth } = useWorkspaceWidth(
        sidebarOpen,
        storedWidth,
    );
    const { openFlyout, closeFlyout, flyoutOpen } = useSidebarFlyout();
    const splashVisible = useSplashSequence(splash, setSplash);
    const navSlot = useNavSlot(overlay, sidebarOpen);
    const { isMaximized, minimize, toggleMaximize, close } = useWindowControls();
    const isMac = usePlatform() === "macos";

    /** Persists the workspace column's open state together with the state itself. */
    const persistWorkspace = useCallback(
        (next: boolean) => {
            setWorkspaceOpen(next);
            writeStored(WORKSPACE_STORE_KEY, String(next));
        },
        [setWorkspaceOpen],
    );

    /** The stored flag is written from the same updater that flips the state, so the two
     * cannot disagree about what the next session opens with. */
    const toggleSidebar = useCallback(() => {
        setSidebarOpen((prev) => {
            const next = !prev;
            writeStored(SIDEBAR_STORE_KEY, String(next));
            return next;
        });
    }, [setSidebarOpen]);

    /** A workspace with no project behind it has nothing to show, so it is left closed. */
    const toggleWorkspace = useCallback(() => {
        if (!project_path) return;
        setWorkspaceOpen((prev) => {
            const next = !prev;
            writeStored(WORKSPACE_STORE_KEY, String(next));
            return next;
        });
    }, [project_path, setWorkspaceOpen]);

    /** The three calls that mean "show the workspace beside the chat". */
    const openWorkspace = useCallback(() => {
        setOverlay(null);
        persistWorkspace(true);
    }, [persistWorkspace]);

    /** The file tab and the graph tab both live in the workspace's strip, so both defer. */
    const openFiles = useCallback(() => {
        openWorkspace();
        selectWorkspaceTab("files");
    }, [openWorkspace]);

    /** The graph is a tab in the workspace's strip, told after the layout has committed. */
    const openGraph = useCallback(() => {
        openWorkspace();
        selectWorkspaceTab("graph");
    }, [openWorkspace]);

    /** The pull-request view is a tab in the strip, and it is told in the same pass. */
    const openPullRequests = useCallback(() => {
        openWorkspace();
        window.dispatchEvent(new CustomEvent("bettershape-set-active-tab", { detail: "prs" }));
    }, [openWorkspace]);

    /** The terminal is a toggle the dock listens for, not state this component keeps. */
    const openWorkspaceTerminal = useCallback(() => {
        setOverlay(null);
        window.dispatchEvent(
            new CustomEvent("bettershape-layout-toggle", { detail: { id: "terminal", value: true } }),
        );
    }, []);

    /** Window ▸ Reset Layout: back to the default panes, widths and no zen. */
    const resetLayout = useCallback(() => {
        setZenMode(false);
        resetWidth();
        persistWorkspace(true);
        setSidebarOpen(true);
        writeStored(ZEN_KEY, "0");
        writeStored(SIDEBAR_STORE_KEY, "true");
        try {
            localStorage.removeItem(WORKSPACE_WIDTH_KEY);
        } catch {
            /* private mode */
        }
    }, [persistWorkspace, resetWidth, setSidebarOpen, setZenMode]);

    /** The zen flag is written beside the state, so the two cannot diverge. */
    const toggleZen = useCallback(() => {
        setZenMode((prev) => {
            const next = !prev;
            writeStored(ZEN_KEY, next ? "1" : "0");
            return next;
        });
    }, [setZenMode]);

    /** Closing is the same call from the chrome, from the overlay itself, and from a
     * layout event, so it is one callback rather than an inline arrow at each site. */
    const closeOverlay = useCallback(() => setOverlay(null), []);
    const actions = useMemo<LayoutActions>(
        () => ({
            toggleSidebar,
            setWorkspace: persistWorkspace,
            toggleWorkspace,
            closeOverlay,
            openWorkspace,
            openFiles,
        }),
        [closeOverlay, openFiles, openWorkspace, persistWorkspace, toggleSidebar, toggleWorkspace],
    );
    const overlayActions = useMemo<OverlayActions>(
        () => ({ closeOverlay, showOverlay: setOverlay, openGraphTab: openGraph }),
        [closeOverlay, openGraph],
    );

    useLayoutEvents(project_path, actions, overlayActions, openPullRequests);
    useCenterViewEvents(setOverlay, openWorkspace);
    useWorkspaceRequestEvents(project_path, openWorkspace);
    useTerminalShortcutEvents(openWorkspaceTerminal);
    useWindowMenuEvents(resetLayout, toggleZen);
    useActiveFileEvents(active_file, setOverlay, openWorkspace);
    useWindowMinSize(sidebarOpen, workspaceOpen, project_path);
    useEffect(() => startAgentBackgroundExitToasts(), []);

    // Warm start-command + route map when a project opens (or fingerprint changes).
    useEffect(() => {
        if (!project_path) return undefined;
        import("@/features/preview/lib/project-warm")
            .then(({ warmProjectAnalysis }) => warmProjectAnalysis(project_path))
            .catch(() => undefined);
        return undefined;
    }, [project_path]);

    const showWorkspace = workspaceVisible(project_path, overlay != null);
    const rightExpanded = workspaceExpanded(showWorkspace, workspaceOpen, fits, zenMode);
    const sidebarShown = sidebarVisible(sidebarOpen, zenMode);

    return (
        <div className="relative flex h-full min-h-0 w-full overflow-hidden bg-sidebar">
            <DevRunHost />
            <ProjectQuickPickHost />
            <NewFilePromptHost />
            {splash ? <AgentSplash visible={splashVisible} /> : null}

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
                <SidebarPeek shown={flyoutOpen} onEnter={openFlyout} onLeave={closeFlyout} />
            )}

            <AgentCenterColumn
                workspace={
                    showWorkspace && project_path ? (
                        <AgentWorkspaceColumn
                            expanded={rightExpanded}
                            width={width}
                            projectPath={project_path}
                            isResizing={isResizing}
                            onStartDrag={startDrag}
                            onExpand={() => persistWorkspace(true)}
                        />
                    ) : null
                }
                content={
                    <AgentCenterContent
                        overlay={overlay}
                        projectPath={project_path}
                        navSlot={navSlot}
                        sidebarOpen={sidebarOpen}
                        onCloseOverlay={closeOverlay}
                    >
                        {children}
                    </AgentCenterContent>
                }
                projectPath={project_path}
                chrome={
                    <AgentChrome
                        rightOpen={rightExpanded}
                        onToggleRight={toggleWorkspace}
                        canToggleRight={showWorkspace}
                        showRightToggle={overlay == null}
                        padWindowControls
                        sidebarOpen={sidebarOpen}
                        onToggleSidebar={toggleSidebar}
                        onSidebarHoverStart={openFlyout}
                        onSidebarHoverEnd={closeFlyout}
                        windowControls={{
                            isMaximized,
                            onMinimize: minimize,
                            onToggleMaximize: toggleMaximize,
                            onClose: close,
                        }}
                    />
                }
            />
            <ShellWindowControls
                isMac={isMac}
                isMaximized={isMaximized}
                onMinimize={minimize}
                onToggleMaximize={toggleMaximize}
                onClose={close}
            />
        </div>
    );
};
