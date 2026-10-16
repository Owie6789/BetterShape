"use client";

import { useMemo, useState } from "react";

import { Panel } from "@/features/panels";
import { QuickPick } from "@/components/ui/quick-pick";
import { useFilter } from "@/features/git/ui/manager/filter-context";
import { useCopyToClipboard } from "@/lib/ui/use-copy";
import { useGitRepos } from "@/lib/git/repos";
import { createBranchActions } from "./actions";
import {
    BRANCH_LIST_CAP,
    capRemoteGroups,
    countRemoteRows,
    countVisibleRows,
    filterNeedle,
    findBranchItem,
    localBranchItems,
    remoteBranchGroups,
    type BranchItem,
} from "./data";
import { BranchDetailPane, type BranchDetailView } from "./detail";
import { useBranchLists, useCompareSession, useWorkspaceRoot } from "./hooks";
import { BranchListPane, type BranchListView } from "./list";

/**
 * The palette's one suggestion, which is the typed value quoted back.
 *
 * An empty field offers nothing: the palette's own submit is what carries a query, and an
 * entry that repeats it would only be a second way to press the same button.
 */
const suggestion = (query: string, label: (value: string) => string, id: string) => {
    const value = query.trim();
    return value ? [{ id, label: label(value) }] : [];
};

/** The placeholder the list pane stands in for while no project is open. */
const NoProjectNotice = () => (
    <div className="flex h-full items-center justify-center text-sm text-text-muted">
        Open a project to manage branches.
    </div>
);

/** The placeholder the detail pane stands in for while no branch is selected. */
const NoSelectionNotice = () => (
    <div className="flex h-full items-center justify-center px-6 text-center text-sm text-text-muted">
        Select a branch
    </div>
);

/**
 * The branch panel: every ref in the repository, the tip of the selected one, and a
 * comparison against HEAD.
 *
 * The window owns the state and passes two flat views down, one per pane. The decisions live
 * beside the data they read: what a row shows is in `list.tsx`, how the lists are derived is
 * in `data.ts`, what a write does is in `actions.ts`, and each read is a hook.
 */
export const BranchWindow = ({ active = true }: { active?: boolean }) => {
    const { query: filter } = useFilter();
    const workspaceRoot = useWorkspaceRoot();
    const { scmRepoPath } = useGitRepos(workspaceRoot);
    const projectPath = scmRepoPath ?? workspaceRoot;

    const lists = useBranchLists(projectPath);
    const { currentBranch, detailByName, localNames, remoteNames, selectedName } = lists;
    const compare = useCompareSession({
        projectPath,
        currentBranch,
        selectedName,
        setSelectedName: lists.setSelectedName,
    });

    const [newBranchName, setNewBranchName] = useState("");
    const [localOpen, setLocalOpen] = useState(true);
    const [remoteOpen, setRemoteOpen] = useState(true);
    const [collapsedRemotes, setCollapsedRemotes] = useState<ReadonlySet<string>>(() => new Set());
    const [renameTarget, setRenameTarget] = useState<string | null>(null);
    const [renameQuery, setRenameQuery] = useState("");
    const [upstreamTarget, setUpstreamTarget] = useState<string | null>(null);
    const [upstreamQuery, setUpstreamQuery] = useState("");
    const { copiedText, copy } = useCopyToClipboard();

    const needle = filterNeedle(filter);
    const localItems = useMemo(
        () => localBranchItems({ names: localNames, details: detailByName, needle }),
        [localNames, detailByName, needle],
    );
    const remoteGroups = useMemo(
        () => remoteBranchGroups({ names: remoteNames, details: detailByName, needle }),
        [remoteNames, detailByName, needle],
    );
    const remoteSlices = useMemo(() => capRemoteGroups(remoteGroups, BRANCH_LIST_CAP), [remoteGroups]);
    const localVisible = useMemo(() => localItems.slice(0, BRANCH_LIST_CAP), [localItems]);
    const remoteTotal = useMemo(() => countRemoteRows(remoteGroups), [remoteGroups]);
    const remoteVisible = useMemo(() => countVisibleRows(remoteSlices), [remoteSlices]);
    const selectedItem = useMemo(
        () => findBranchItem({ name: selectedName, locals: localItems, groups: remoteGroups }),
        [selectedName, localItems, remoteGroups],
    );

    const actions = createBranchActions({
        projectPath,
        currentBranch,
        selectedItem,
        selectedName,
        setSelectedName: lists.setSelectedName,
        refresh: lists.refresh,
    });

    /** The local section's disclosure, which is its own state and nothing else's. */
    const toggleLocal = () => setLocalOpen((open) => !open);
    /** The remote section's disclosure, the same way. */
    const toggleRemote = () => setRemoteOpen((open) => !open);
    /** One remote's group collapses on its own, so the set is keyed by remote name. */
    const toggleRemoteGroup = (remote: string) => {
        setCollapsedRemotes((previous) => {
            const next = new Set(previous);
            if (next.has(remote)) next.delete(remote);
            else next.add(remote);
            return next;
        });
    };

    /** Selecting a row drops the comparison, which belonged to the previous selection. */
    const selectItem = (item: BranchItem) => {
        lists.setSelectedName(item.name);
        compare.clear();
    };
    /** Checking out a row is the row menu's shortcut to what the detail pane's button does. */
    const checkoutItem = (item: BranchItem) => actions.switchTo(item.name);
    /** Copying a row's name reuses the panel's one clipboard write, so a refusal shows. */
    const copyItem = (item: BranchItem) => copy(item.name, item.name);
    /** Comparing a row reads the branch it names against the checked-out one. */
    const compareItem = (item: BranchItem) => compare.compareWith(item.name);
    /** Renaming opens the palette with the current name, which is what most renames edit. */
    const renameItem = (item: BranchItem) => {
        setRenameTarget(item.name);
        setRenameQuery(item.name);
    };
    /** Upstream defaults to the same branch on origin, which is the common intent. */
    const upstreamItem = (item: BranchItem) => {
        setUpstreamTarget(item.name);
        setUpstreamQuery(`origin/${item.name}`);
    };
    /** Deleting goes through the action, which asks for the confirmation itself. */
    const deleteItem = (item: BranchItem) => actions.remove(item.name);

    /** Applies the typed name to the branch the palette was opened for. */
    const submitRename = (next: string) => {
        if (renameTarget) actions.rename(renameTarget, next);
    };
    /** Applies the typed upstream to the branch the palette was opened for. */
    const submitUpstream = (next: string) => {
        if (upstreamTarget) actions.setUpstream(upstreamTarget, next);
    };

    if (!projectPath) return <NoProjectNotice />;

    const listView: BranchListView = {
        active,
        loading: lists.loading,
        local: {
            items: localItems,
            visible: localVisible,
            truncated: localItems.length - localVisible.length,
            open: localOpen,
        },
        remote: {
            slices: remoteSlices,
            total: remoteTotal,
            visible: remoteVisible,
            truncated: remoteTotal - remoteVisible,
            open: remoteOpen,
        },
        currentBranch,
        selectedName,
        newBranchName,
        collapsedRemotes,
        actions,
        onNameChange: setNewBranchName,
        onCreate: () => actions.create(newBranchName),
        onToggleLocal: toggleLocal,
        onToggleRemote: toggleRemote,
        onToggleRemoteGroup: toggleRemoteGroup,
        onSelectItem: selectItem,
        onCheckoutItem: checkoutItem,
        onCopyItem: copyItem,
        onCompareItem: compareItem,
        onRenameItem: renameItem,
        onUpstreamItem: upstreamItem,
        onDeleteItem: deleteItem,
    };

    /**
     * The detail pane's view, built for the item it shows.
     *
     * The pane unmounts with no selection, so every callback here binds the name the pane was
     * built for rather than reading a selection that may have moved on.
     */
    const detailView = (item: BranchItem): BranchDetailView => ({
        active,
        item,
        currentBranch,
        sideBySide: compare.sideBySide,
        compare: {
            files: compare.files,
            file: compare.file,
            original: compare.original,
            modified: compare.modified,
            loading: compare.loading,
            diffLoading: compare.diffLoading,
        },
        copied: copiedText === item.name,
        onCheckout: () => actions.switchTo(item.name),
        onCompare: () => compare.compareWith(item.name),
        onCopy: () => copy(item.name, item.name),
        onOpenRemote: actions.openRemote,
        onDelete: () => actions.remove(item.name),
        onClearCompare: compare.clear,
        onOpenCompareFile: compare.openFile,
        onToggleLayout: compare.toggleLayout,
    });

    return (
        <div className="flex h-full min-h-0 w-full overflow-hidden">
            <Panel
                direction="horizontal"
                paneGap="var(--workbench-gap)"
                storageKey="git-branches-split"
                hideSeparator
                className="h-full min-h-0 flex-1"
                panes={[
                    {
                        id: "branches-list",
                        flexible: true,
                        minSize: 200,
                        maxSize: 420,
                        snap: true,
                        children: <BranchListPane view={listView} />,
                    },
                    {
                        id: "branches-detail",
                        preferredSize: 420,
                        minSize: 280,
                        snap: true,
                        visible: Boolean(selectedItem),
                        children: selectedItem ? (
                            <BranchDetailPane view={detailView(selectedItem)} />
                        ) : (
                            <NoSelectionNotice />
                        ),
                    },
                ]}
            />

            <QuickPick
                open={renameTarget != null}
                onOpenChange={(open) => {
                    if (!open) setRenameTarget(null);
                }}
                title="Rename branch"
                placeholder="New branch name"
                query={renameQuery}
                onQueryChange={setRenameQuery}
                items={suggestion(renameQuery, (value) => `Rename to “${value}”`, "rename")}
                onSelect={() => submitRename(renameQuery)}
                onSubmitQuery={submitRename}
                emptyText="Type a new branch name"
            />
            <QuickPick
                open={upstreamTarget != null}
                onOpenChange={(open) => {
                    if (!open) setUpstreamTarget(null);
                }}
                title="Set upstream"
                placeholder="origin/main"
                query={upstreamQuery}
                onQueryChange={setUpstreamQuery}
                items={suggestion(upstreamQuery, (value) => `Set upstream to “${value}”`, "upstream")}
                onSelect={() => submitUpstream(upstreamQuery)}
                onSubmitQuery={submitUpstream}
                emptyText="Type an upstream (e.g. origin/main)"
            />
        </div>
    );
};
