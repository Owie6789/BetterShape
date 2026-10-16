"use client";

import React, { useEffect } from "react";
import type { FileInfo } from "@/lib/backend/types";
import { usePathname } from "next/navigation";
import Main from "@/components/layout/main";
import { Titlebar } from "@/features/agent/workbench";
import { LoadingProvider } from "@/features/loading/context";
import { NotificationProvider } from "@/components/ui/notification";
import { GlobalContextMenu } from "@/core/providers/menu";
import { ChatStreamProvider } from "@/features/chat/lib/chat-stream-store";
import { initSettings } from "@/lib/settings";
import { initGitHubAuth } from "@/lib/github/store";
import { CheckpointRestoreDialog } from "@/features/chat/ui/shell/checkpoint-restore-dialog";
import { installBenignErrorFilters } from "@/lib/editor/benign-errors";
import { FilterProvider } from "@/features/git/ui/manager/filter-context";
import { SuppressNativeTooltips } from "@/components/ui/suppress-native-tooltips";
import { CommandPaletteBridge } from "@/features/agent/palette";
import { DesignPreviewCaptureHost } from "@/features/chat/ui/design-capture";
import { WebviewReconnect } from "@/components/layout/webview-reconnect";
import { PreviewCrash } from "@/components/layout/error/preview-crash";

/**
 * A route base matches its own path and anything under it. The prod static export serves
 * trailing slashes (`/settings/`), so both forms have to match.
 */
const pathMatches = (pathname: string | null, base: string) => {
    if (!pathname) return false;
    return pathname === base || pathname === `${base}/` || pathname.startsWith(`${base}/`);
};

/** The shell the three route kinds share: providers, tooltip suppression, the menu host. */
const ProviderShell = ({ children }: { children: React.ReactNode }) => (
    <LoadingProvider>
        <NotificationProvider>
            <SuppressNativeTooltips />
            <GlobalContextMenu>{children}</GlobalContextMenu>
        </NotificationProvider>
    </LoadingProvider>
);

/**
 * The popout window a panel opens into.
 *
 * Popouts are chromeless: the titlebar is the only chrome, so the frame fills the window
 * and the overlays host stays inside it rather than at the document root.
 */
const PopoutShell = ({ children }: { children: React.ReactNode }) => (
    <ProviderShell>
        <div
            id="bettershape-popout"
            className="relative flex h-screen w-full flex-col overflow-hidden bg-titlebar font-sans text-sm text-text-primary select-none"
        >
            <Titlebar focus />
            <main className="min-h-0 flex-1 overflow-hidden bg-editor">{children}</main>
            <CommandPaletteBridge />
            <div id="bettershape-overlays" />
        </div>
    </ProviderShell>
);

/**
 * Settings and the Git manager, which are the same window with a different title.
 *
 * The Git route is the only one that needs the Git filter provider, so it wraps the body
 * instead of the shell keeping two copies of the frame.
 */
const SettingsShell = ({ kind, children }: { kind: "Git" | "Settings"; children: React.ReactNode }) => {
    const body = (
        <div id="bettershape-settings" className="relative flex h-screen w-full flex-col overflow-hidden bg-background font-sans text-sm text-text-primary select-none">
            <Titlebar settings title={kind} />
            <main className="min-h-0 flex-1 overflow-hidden bg-background">{children}</main>
            <div id="bettershape-overlays" />
        </div>
    );
    return <ProviderShell>{kind === "Git" ? <FilterProvider>{body}</FilterProvider> : body}</ProviderShell>;
};

/**
 * The workbench frame, and the last of the three shells to add anything to the window.
 *
 * The overlays host is the last child on purpose: menus and the command palette portal
 * into it, so it has to paint above the panes rather than sit between them.
 */
const Content = ({ children }: { children: React.ReactNode }) => {
    return (
        <div
            id="bettershape-workbench"
            className="relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-background select-none"
        >
            <div className="relative z-10 flex min-h-0 w-full flex-1 flex-col">
                <Main>{children}</Main>
                <CheckpointRestoreDialog />
                <CommandPaletteBridge />
                <DesignPreviewCaptureHost />
            </div>
            <WebviewReconnect />
            {/* Preview-only: `?crash=global` throws above the page boundary so the root
                error boundary can be inspected. Inert in a real build. */}
            <PreviewCrash scope="global" />
            <div id="bettershape-overlays" />
        </div>
    );
};

/** What a close request should do once the unsaved work has been accounted for. */
type CloseDecision = "allow" | "hide" | "continue";

/**
 * Starts an effect's async work and ends its promise here.
 *
 * An effect body cannot be async: React reads a returned promise as a cleanup function and
 * the next teardown breaks. The work still has to own its rejection, so it ends in this one
 * place instead of surfacing as an unhandled rejection on the window.
 */
function runEffectWork(work: () => Promise<void>): void {
    work().catch(() => undefined);
}

/**
 * Boots the parts of the app that are not tied to a route: settings, GitHub auth, the AI
 * config sync and the MCP registry.
 *
 * Sequenced rather than fired in parallel, because each step writes the settings the next
 * one reads, and the MCP sync is the only one allowed to fail: a malformed `mcp.json` must
 * not take the window down with it.
 */
async function bootstrapApp(): Promise<void> {
    await initSettings();
    initGitHubAuth();
    const { initAiConfigSync } = await import("@/lib/ai/sync");
    initAiConfigSync();

    // MCP: sync user mcp.json so the agent sees tools without visiting Settings.
    try {
        const { syncActiveMcpServers } = await import("@/lib/mcp/registry");
        await syncActiveMcpServers();
    } catch {
        /* registry unavailable: the agent runs without MCP tools */
    }
}

/**
 * Reveals the main window once its settings are in.
 *
 * The window is created hidden and shown here, so the first frame the user sees is painted
 * rather than empty. A window that is not the main one never came up hidden and is left as
 * it is.
 */
async function revealMainWindow(): Promise<void> {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");

    try {
        const currentWindow = getCurrentWindow();
        if (currentWindow.label !== "main") return;

        const { initSettings } = await import("@/lib/settings");
        await initSettings();
        await currentWindow.show();
    } catch (e) {
        console.error("Failed to manage window flow:", e);
    }
}

/**
 * Marks the given files clean and drops their buffers.
 *
 * The buffers have to go with the close, otherwise the next open of the same path restores
 * the dirty text the user just chose to discard.
 */
async function discardDirtyBuffers(files: FileInfo[]): Promise<void> {
    const { clearDirtyBuffer } = await import("@/lib/workspace/dirty-buffers");
    const { commands } = await import("@/lib/backend");
    for (const file of files) {
        clearDirtyBuffer(file.path);
        await commands.markFileDirty(file.path, false);
    }
}

/**
 * The line the confirm dialog asks with: the file when one is unsaved, the count when more
 * than one is, because a list of twenty paths fits in no dialog.
 */
function unsavedPrompt(files: FileInfo[]): string {
    const [first] = files;
    if (files.length === 1 && first) return `Save changes to ${first.name || first.path} before closing?`;
    return `Save changes to ${files.length} files before closing?`;
}

/**
 * Answers a close request.
 *
 * A generating chat hides the window rather than ending the run, an unsaved buffer asks
 * first, and `allow` is the one answer that leaves the close event untouched, which is what
 * lets the caller return before it calls `preventDefault`.
 */
async function resolveCloseRequest(): Promise<CloseDecision> {
    const { hasGeneratingChats } = await import("@/features/chat/lib/generating-chats");
    if (hasGeneratingChats()) return "hide";

    const { getProjectSnapshot } = await import("@/lib/backend");
    const dirty = getProjectSnapshot().open_files.filter((file) => file.is_dirty);
    if (dirty.length === 0) return "allow";

    const { confirm } = await import("@tauri-apps/plugin-dialog");
    const save = await confirm(
        unsavedPrompt(dirty),
        {
            title: "Unsaved changes",
            kind: "warning",
            okLabel: "Save",
            cancelLabel: "Don't save",
        },
    );

    if (!save) {
        await discardDirtyBuffers(dirty);
        return "continue";
    }

    window.dispatchEvent(new Event("save-all-request"));
    // Give save-all a moment; then close.
    await new Promise((resolve) => setTimeout(resolve, 400));
    return "continue";
}

/**
 * Picks the window shell from the route and bootstraps the app once per window.
 *
 * The three shells differ only in chrome, so the choice is made here and every shell
 * under it is a separate component: the branches below stay one line each, and the
 * effects are keyed to the window rather than the route so a navigation never re-inits
 * settings or re-registers the close listener.
 */
const ClientLayout = ({ children }: { children: React.ReactNode }) => {
    const pathname = usePathname();
    const isSettings = pathMatches(pathname, "/settings");
    const isBranch = pathMatches(pathname, "/branch") || pathMatches(pathname, "/git");

    const isPopout = pathMatches(pathname, "/popout");

    useEffect(() => {
        runEffectWork(bootstrapApp);
    }, []);

    // Re-ensure benign error filters (idempotent; instrumentation-client runs earlier).
    useEffect(() => {
        installBenignErrorFilters();
    }, []);

    useEffect(() => {
        if (isSettings || isBranch || isPopout) return undefined;
        let unlisten: (() => void) | undefined;
        let cancelled = false;

        runEffectWork(async () => {
            try {
                const { getCurrentWindow } = await import("@tauri-apps/api/window");
                const win = getCurrentWindow();
                if (win.label !== "main") return;

                unlisten = await win.onCloseRequested(async (event) => {
                    const decision = await resolveCloseRequest();
                    if (decision === "allow") return;
                    event.preventDefault();
                    if (decision === "hide") {
                        await win.hide();
                        return;
                    }
                    if (!cancelled) await win.destroy();
                });
            } catch {
                /* browser / non-tauri */
            }
        });

        return () => {
            cancelled = true;
            unlisten?.();
        };
    }, [isSettings, isBranch, isPopout]);

    // Block the native WebView context menu without breaking Radix menus.
    // Must be bubble phase: Radix opens on the target first; capture+preventDefault
    // made Radix skip open (it ignores events that are already defaultPrevented).
    useEffect(() => {
        const blockNative = (e: Event) => {
            e.preventDefault();
        };
        window.addEventListener("contextmenu", blockNative, false);
        return () => window.removeEventListener("contextmenu", blockNative, false);
    }, []);

    useEffect(() => {
        runEffectWork(revealMainWindow);
    }, []);

    if (isPopout) return <PopoutShell>{children}</PopoutShell>;
    if (isBranch) return <SettingsShell kind="Git">{children}</SettingsShell>;
    if (isSettings) return <SettingsShell kind="Settings">{children}</SettingsShell>;

    return (
        <LoadingProvider>
            <NotificationProvider>
                <SuppressNativeTooltips />
                <GlobalContextMenu>
                    <ChatStreamProvider>
                        <Content>{children}</Content>
                    </ChatStreamProvider>
                </GlobalContextMenu>
            </NotificationProvider>
        </LoadingProvider>
    );
};

export default ClientLayout;
