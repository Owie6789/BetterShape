"use client";


import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode, RefObject } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { type IconGlyph, Icon } from "@/components/ui/icon";

import { cn } from "@/lib/utils";
import {
    BETTERSHAPE_MODAL_PANEL_CLASS,
    BETTERSHAPE_OVERLAY_CLASS,
    BETTERSHAPE_OVERLAY_CONTENT_CLASS,
} from "@/lib/ui/modal-overlay";
import { useOverlayRoot } from "@/lib/ui/overlay-root";

export type QuickPickItem = {
    id: string;
    label: string;
    description?: string;
    icon?: IconGlyph;
    iconNode?: ReactNode;
    /** Right-side muted hint */
    hint?: string;
};

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title?: string;
    placeholder?: string;
    /** When set, shows a filterable text field (command-palette style). */
    query?: string;
    onQueryChange?: (value: string) => void;
    items: QuickPickItem[];
    onSelect: (item: QuickPickItem) => void;
    /** Optional: submit query on Enter when no item selected / empty list */
    onSubmitQuery?: (query: string) => void;
    emptyText?: string;
};

/**
 * The key map of the palette.
 *
 * Arrows cycle the highlight and never reach the list underneath, and Enter first offers
 * the typed query to the caller: a palette filtering a server-side search has nothing to
 * pick from until the query is submitted, so picking a row only wins when the submit
 * declines it. `submit` reports whether it took the query, which is why it is not a void.
 */
const handlePaletteKey = (
    event: KeyboardEvent<HTMLDivElement>,
    actions: { move: (delta: number) => void; confirm: () => void; submit: () => boolean },
) => {
    if (event.key === "ArrowDown") {
        event.preventDefault();
        actions.move(1);
        return;
    }
    if (event.key === "ArrowUp") {
        event.preventDefault();
        actions.move(-1);
        return;
    }
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (!actions.submit()) actions.confirm();
};

/**
 * The row's leading slot: a caller-drawn node, then an icon glyph, then nothing.
 *
 * The node wins over the glyph because a caller that draws its own mark is usually showing
 * something the icon set cannot express, such as a file-type colour.
 */
const QuickPickLeading = ({ item }: { item: QuickPickItem }) => {
    if (item.iconNode) {
        return <span className="flex size-4 shrink-0 items-center justify-center">{item.iconNode}</span>;
    }
    if (item.icon) return <Icon icon={item.icon} className="shrink-0 text-text-muted" />;
    return null;
};

/**
 * The row's own classes.
 *
 * Only colour changes with the highlight: the press target and the layout have to stay put
 * while the arrow keys walk the list, or the row under the pointer moves as it is hovered.
 */
const quickPickRowClass = (selected: boolean) =>
    cn(
        "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm",
        selected
            ? "bg-panel-hover text-text-primary"
            : "text-text-secondary hover:bg-[var(--row-hover)]",
    );

/** One option. The label keeps its own truncation, so a long hint cannot squeeze it. */
const QuickPickRow = ({
    item,
    selected,
    onHover,
    onPick,
}: {
    item: QuickPickItem;
    selected: boolean;
    onHover: () => void;
    onPick: () => void;
}) => (
    <button
        type="button"
        onMouseEnter={onHover}
        onClick={onPick}
        className={quickPickRowClass(selected)}
    >
        <QuickPickLeading item={item} />
        <span className="min-w-0 flex-1 truncate font-medium text-text-primary">
            {item.label}
            {item.description ? (
                <span className="ml-2 font-normal text-text-muted">{item.description}</span>
            ) : null}
        </span>
        {item.hint ? <span className="shrink-0 text-xs text-text-muted">{item.hint}</span> : null}
    </button>
);

/**
 * The index the highlight moves to, wrapping at both ends.
 *
 * An empty list answers with the index it was given rather than 0, because the modulo of
 * nothing is NaN and that would put the highlight nowhere at all.
 */
const cycleIndex = (current: number, delta: number, length: number) =>
    length === 0 ? current : (current + delta + length) % length;

/**
 * Offers the typed query to the caller and reports whether it was taken.
 *
 * Blank queries and callers that cannot submit are both declines, which is what lets the
 * Enter key fall through to the highlighted row.
 */
const submitPaletteQuery = (query: string | undefined, onSubmitQuery?: (query: string) => void) => {
    const trimmed = query?.trim();
    if (!trimmed || !onSubmitQuery) return false;
    onSubmitQuery(trimmed);
    return true;
};

/** The dialog's name, falling back in this order because a palette has one of the three. */
const paletteTitle = (title?: string, placeholder?: string) => title || placeholder || "Quick pick";

/** The dialog's description, which the placeholder doubles as while the field is shown. */
const paletteDescription = (placeholder?: string) => placeholder || "Select an option";

/** The heading row, which is only there when the caller gave a title. */
const QuickPickTitle = ({ title }: { title?: string }) =>
    title ? <div className="px-2.5 py-1.5 text-center text-sm text-text-primary">{title}</div> : null;

/**
 * The dialog's heading: the title, then either the filter field or the placeholder line.
 *
 * The field is shown by the presence of both the value and its setter, so a caller that
 * passed a read-only query keeps the plain heading. The placeholder line doubles as the
 * subtitle while filtering, which is why the two cases share one element and differ only
 * in the padding below it.
 */
const QuickPickHeading = ({
    title,
    placeholder,
    query,
    onQueryChange,
    inputRef,
}: {
    title?: string;
    placeholder?: string;
    query?: string;
    onQueryChange?: (value: string) => void;
    inputRef: RefObject<HTMLInputElement | null>;
}) => {
    if (query !== undefined && onQueryChange !== undefined) {
        return (
            <>
                <QuickPickTitle title={title} />
                <div className="px-2 pb-1.5 pt-1">
                    <input
                        ref={inputRef}
                        value={query}
                        onChange={(e) => onQueryChange(e.target.value)}
                        placeholder={placeholder}
                        className="w-full bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
                        aria-label={placeholder}
                    />
                </div>
            </>
        );
    }
    return (
        <>
            <QuickPickTitle title={title} />
            {placeholder ? (
                <div className={cn("px-2.5 text-sm text-text-muted", title ? "pb-2" : "py-2")}>
                    {placeholder}
                </div>
            ) : null}
        </>
    );
};

/** The scroll body: the empty answer, or the rows. */
const QuickPickList = ({
    items,
    selected,
    emptyText,
    onHover,
    onPick,
}: {
    items: QuickPickItem[];
    selected: number;
    emptyText: string;
    onHover: (index: number) => void;
    onPick: (index: number) => void;
}) => (
    <div className="max-h-[min(320px,50vh)] overflow-y-auto custom-scrollbar">
        {items.length === 0 ? (
            <div className="px-2.5 py-3 text-sm text-text-muted">{emptyText}</div>
        ) : (
            items.map((item, index) => (
                <QuickPickRow
                    key={item.id}
                    item={item}
                    selected={index === selected}
                    onHover={() => onHover(index)}
                    onPick={() => onPick(index)}
                />
            ))
        )}
    </div>
);

/**
 * Floating command-palette / quick-pick dialog (Cursor/VS Code style).
 *
 * The highlight is index state rather than a focused row, so the arrows and the pointer
 * drive the same value and the dialog keeps the browser focus for its own key handling.
 */
export const QuickPick = ({
    open,
    onOpenChange,
    title,
    placeholder = "Type to filter…",
    query,
    onQueryChange,
    items,
    onSelect,
    onSubmitQuery,
    emptyText = "No results",
}: Props) => {
    const overlayRoot = useOverlayRoot();
    const [selected, setSelected] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (open) {
            setSelected(0);
            requestAnimationFrame(() => inputRef.current?.focus());
        }
    }, [open, items.length]);

    useEffect(() => {
        setSelected(0);
    }, [query]);

    /** Wraps at both ends, so a held arrow key cycles the list instead of parking. */
    const move = (delta: number) => setSelected((i) => cycleIndex(i, delta, items.length));

    /** Hands the typed query to the caller; false when there was nothing to hand over. */
    const submitQuery = () => submitPaletteQuery(query, onSubmitQuery);

    // With no item at `index` the typed query is submitted when the caller handles it,
    // which is what lets the palette act as a search box for an empty result.
    const confirm = (index = selected) => {
        const item = items[index];
        if (item) onSelect(item);
        else submitQuery();
    };

    return (
        <Dialog.Root open={open} onOpenChange={onOpenChange}>
            <Dialog.Portal container={overlayRoot}>
                <Dialog.Overlay className={cn(BETTERSHAPE_OVERLAY_CLASS, "z-[200]")} />
                <Dialog.Content
                    className={cn(
                        BETTERSHAPE_OVERLAY_CONTENT_CLASS,
                        "absolute left-1/2 top-[14%] z-[201] w-[min(520px,calc(100%-2rem))] -translate-x-1/2 outline-none",
                    )}
                    aria-describedby={undefined}
                    onKeyDown={(e) => handlePaletteKey(e, { move, confirm, submit: submitQuery })}
                >
                    <Dialog.Title className="sr-only">
                        {paletteTitle(title, placeholder)}
                    </Dialog.Title>
                    <Dialog.Description className="sr-only">
                        {paletteDescription(placeholder)}
                    </Dialog.Description>
                    <div className={cn(BETTERSHAPE_MODAL_PANEL_CLASS, "overflow-hidden p-1.5")}>
                        <QuickPickHeading
                            title={title}
                            placeholder={placeholder}
                            query={query}
                            onQueryChange={onQueryChange}
                            inputRef={inputRef}
                        />
                        <QuickPickList
                            items={items}
                            selected={selected}
                            emptyText={emptyText}
                            onHover={setSelected}
                            onPick={confirm}
                        />
                    </div>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
};
