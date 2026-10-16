"use client";

import { Airplane20Regular } from "@fluentui/react-icons/headless/svg/airplane";
import { Beaker20Regular } from "@fluentui/react-icons/headless/svg/beaker";
import { Book20Regular } from "@fluentui/react-icons/headless/svg/book";
import { Bookmark20Regular } from "@fluentui/react-icons/headless/svg/bookmark";
import { Bot20Regular } from "@fluentui/react-icons/headless/svg/bot";
import { Bug20Regular } from "@fluentui/react-icons/headless/svg/bug";
import { Calendar20Regular } from "@fluentui/react-icons/headless/svg/calendar";
import { Camera20Regular } from "@fluentui/react-icons/headless/svg/camera";
import { Cloud20Regular } from "@fluentui/react-icons/headless/svg/cloud";
import { Code20Regular } from "@fluentui/react-icons/headless/svg/code";
import { Flag20Regular } from "@fluentui/react-icons/headless/svg/flag";
import { Flash20Regular } from "@fluentui/react-icons/headless/svg/flash";
import { Gift20Regular } from "@fluentui/react-icons/headless/svg/gift";
import { Globe20Regular } from "@fluentui/react-icons/headless/svg/globe";
import { Heart20Regular } from "@fluentui/react-icons/headless/svg/heart";
import { Home20Regular } from "@fluentui/react-icons/headless/svg/home";
import { Key20Regular } from "@fluentui/react-icons/headless/svg/key";
import { LeafOne20Regular } from "@fluentui/react-icons/headless/svg/leaf-one";
import { Lightbulb20Regular } from "@fluentui/react-icons/headless/svg/lightbulb";
import { Mail20Regular } from "@fluentui/react-icons/headless/svg/mail";
import { MusicNote220Regular } from "@fluentui/react-icons/headless/svg/music-note";
import { People20Regular } from "@fluentui/react-icons/headless/svg/people";
import { Planet20Regular } from "@fluentui/react-icons/headless/svg/planet";
import { Rocket20Regular } from "@fluentui/react-icons/headless/svg/rocket";
import { Search20Regular } from "@fluentui/react-icons/headless/svg/search";
import { Shield20Regular } from "@fluentui/react-icons/headless/svg/shield";
import { Sparkle20Regular } from "@fluentui/react-icons/headless/svg/sparkle";
import { Star20Regular } from "@fluentui/react-icons/headless/svg/star";
import { Target20Regular } from "@fluentui/react-icons/headless/svg/target";
import { Trophy20Regular } from "@fluentui/react-icons/headless/svg/trophy";
import { Wrench20Regular } from "@fluentui/react-icons/headless/svg/wrench";
import { useMemo, useState } from "react";
import { Icon, type IconGlyph } from "@/components/ui/icon";
import {
    AlertDialog,
    AlertDialogBody,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import {
    CHAT_COLORS,
    CHAT_COLOR_HEX,
    COLLECTION_ICONS,
    createCollection,
    updateCollection,
    type ChatCollection,
    type ChatColor,
    type CollectionIcon,
} from "@/lib/sidebar/chat-list-meta";

export const COLLECTION_GLYPH: Record<CollectionIcon, IconGlyph> = {
    star: Star20Regular,
    flag: Flag20Regular,
    bookmark: Bookmark20Regular,
    rocket: Rocket20Regular,
    lightbulb: Lightbulb20Regular,
    beaker: Beaker20Regular,
    code: Code20Regular,
    book: Book20Regular,
    heart: Heart20Regular,
    target: Target20Regular,
    home: Home20Regular,
    people: People20Regular,
    calendar: Calendar20Regular,
    camera: Camera20Regular,
    cloud: Cloud20Regular,
    globe: Globe20Regular,
    mail: Mail20Regular,
    shield: Shield20Regular,
    bug: Bug20Regular,
    gift: Gift20Regular,
    key: Key20Regular,
    trophy: Trophy20Regular,
    bot: Bot20Regular,
    sparkle: Sparkle20Regular,
    planet: Planet20Regular,
    flash: Flash20Regular,
    music: MusicNote220Regular,
    leaf: LeafOne20Regular,
    wrench: Wrench20Regular,
    airplane: Airplane20Regular,
};

/**
 * The icons a search narrows down to.
 *
 * An empty query is every icon rather than none: the grid is a picker, so a field the user
 * has not typed in yet must not read as "no results".
 */
const findIcons = (query: string) => {
    const needle = query.trim().toLowerCase();
    return COLLECTION_ICONS.filter((id) => !needle || id.includes(needle));
};

/** The title of a step, so the three of them are written where they are read. */
const stepTitle = (step: number) =>
    step === 0 ? "Name the collection" : step === 1 ? "Choose an icon" : "Choose a color";

/**
 * The confirm button's label.
 *
 * The last step is the one that writes, so it names what it does: save an existing
 * collection, or create the new one the dialog was opened for.
 */
const confirmLabel = (step: number, existing?: ChatCollection | null) =>
    step === 2 ? (existing ? "Save" : "Create") : "Next";

/** The name a collection is written under: what was typed, or the name it already had. */
const chosenName = (value: string, fallback: string) => value.trim() || fallback;

/**
 * Writes what the dialog collected.
 *
 * Creating needs at least one chat: a collection with no chats is a name and nothing else,
 * and the call is skipped rather than failing inside the store.
 */
const saveCollection = ({
    existing,
    chatIds,
    name,
    icon,
    color,
}: {
    existing?: ChatCollection | null;
    chatIds: string[];
    name: string;
    icon: CollectionIcon;
    color: ChatColor;
}) => {
    if (existing) {
        updateCollection(existing.id, { name: chosenName(name, existing.name), icon, color });
    } else if (chatIds.length > 0) {
        createCollection({ name: chosenName(name, "Collection"), icon, color, chatIds });
    }
};

/**
 * The dialog's draft, seeded from the collection it edits.
 *
 * Held in one hook because every field falls back to the same `existing` value, and three
 * separate initializers would each repeat that fallback.
 */
const useCollectionDraft = (existing?: ChatCollection | null) => {
    const [name, setName] = useState(existing ? existing.name : "");
    const [icon, setIcon] = useState<CollectionIcon>(existing ? existing.icon : "star");
    const [color, setColor] = useState<ChatColor>(existing ? existing.color : "blue");
    return { name, setName, icon, setIcon, color, setColor };
};

/**
 * Closes the dialog when it is dismissed.
 *
 * An alert dialog's `onOpenChange` reports both directions, so the open case is filtered
 * here instead of at the call site.
 */
const closeOnDismiss = (onClose: () => void) => (next: boolean) => {
    if (!next) onClose();
};

/** The first step: the name, which also takes Enter as the way forward. */
const NameStep = ({
    name,
    onChange,
    onEnter,
}: {
    name: string;
    onChange: (value: string) => void;
    onEnter: () => void;
}) => (
    <input
        autoFocus
        value={name}
        placeholder="Collection name"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
            if (event.key === "Enter") onEnter();
        }}
        className="h-9 rounded-md bg-transparent px-2 text-sm text-text-primary outline-none ring-1 ring-border"
    />
);

/**
 * The second step: search, then the grid of icons.
 *
 * The pressed icon is marked with `aria-pressed` as well as the committed fill, because the
 * fill alone says nothing to a screen reader.
 */
const IconStep = ({
    query,
    onQuery,
    icon,
    color,
    onPick,
}: {
    query: string;
    onQuery: (value: string) => void;
    icon: CollectionIcon;
    color: ChatColor;
    onPick: (icon: CollectionIcon) => void;
}) => {
    const icons = useMemo(() => findIcons(query), [query]);

    return (
        <>
            <div className="flex items-center gap-2 rounded-md px-2 ring-1 ring-border">
                <Icon icon={Search20Regular} className="icon-sm text-text-muted" />
                <input
                    autoFocus
                    value={query}
                    placeholder="Search icons"
                    onChange={(event) => onQuery(event.target.value)}
                    className="h-9 min-w-0 flex-1 bg-transparent text-sm text-text-primary outline-none"
                />
            </div>
            <div className="grid max-h-52 grid-cols-6 gap-1 overflow-y-auto">
                {icons.map((id) => (
                    <button
                        key={id}
                        type="button"
                        aria-label={id}
                        aria-pressed={icon === id}
                        onClick={() => onPick(id)}
                        className={cn(
                            "flex h-9 items-center justify-center rounded-md hover:bg-[var(--btn-hover)]",
                            icon === id && "bg-[var(--btn-open)] hover:bg-[var(--btn-open-hover)]",
                        )}
                    >
                        <Icon icon={COLLECTION_GLYPH[id]} className="icon-sm" style={{ color: CHAT_COLOR_HEX[color] }} />
                    </button>
                ))}
            </div>
        </>
    );
};

/**
 * The third step: the swatches.
 *
 * The ring needs both offsets, or the selected swatch would ring the dialog's own surface
 * instead of the swatch beside it.
 */
const ColorStep = ({
    color,
    onPick,
}: {
    color: ChatColor;
    onPick: (color: ChatColor) => void;
}) => (
    <div className="flex flex-wrap gap-2 py-2">
        {CHAT_COLORS.map((entry) => (
            <button
                key={entry}
                type="button"
                aria-label={entry}
                aria-pressed={color === entry}
                onClick={() => onPick(entry)}
                className={cn(
                    "size-7 rounded-full",
                    color === entry && "ring-2 ring-text-primary ring-offset-2 ring-offset-surface-2",
                )}
                style={{ background: CHAT_COLOR_HEX[entry] }}
            />
        ))}
    </div>
);

/**
 * The body: exactly one step is on screen, and the steps keep their own state in the parent
 * so going Back does not clear what was typed.
 */
const CollectionDialogBody = ({
    step,
    draft,
    query,
    setQuery,
    color,
    onPickColor,
    onAdvance,
}: {
    step: number;
    draft: ReturnType<typeof useCollectionDraft>;
    query: string;
    setQuery: (value: string) => void;
    color: ChatColor;
    onPickColor: (color: ChatColor) => void;
    onAdvance: () => void;
}) => (
    <AlertDialogBody>
        {step === 0 ? (
            <NameStep name={draft.name} onChange={draft.setName} onEnter={onAdvance} />
        ) : null}
        {step === 1 ? (
            <IconStep
                query={query}
                onQuery={setQuery}
                icon={draft.icon}
                color={color}
                onPick={draft.setIcon}
            />
        ) : null}
        {step === 2 ? <ColorStep color={color} onPick={onPickColor} /> : null}
    </AlertDialogBody>
);

/**
 * The footer: Cancel on the first step and Back after it, then the confirm button whose
 * label says what the step will do.
 */
const CollectionDialogFooter = ({
    step,
    existing,
    onClose,
    onBack,
    onNext,
    onConfirm,
}: {
    step: number;
    existing?: ChatCollection | null;
    onClose: () => void;
    onBack: () => void;
    onNext: () => void;
    onConfirm: () => void;
}) => (
    <AlertDialogFooter>
        {step === 0 ? (
            <AlertDialogCancel onClick={onClose}>Cancel</AlertDialogCancel>
        ) : (
            <button
                type="button"
                onClick={onBack}
                className="h-8 rounded-md px-3 text-sm text-text-muted hover:bg-[var(--btn-hover)] hover:text-text-primary"
            >
                Back
            </button>
        )}
        <button
            type="button"
            onClick={() => (step === 2 ? onConfirm() : onNext())}
            className="h-8 rounded-md bg-accent px-3 text-sm text-accent-fg"
        >
            {confirmLabel(step, existing)}
        </button>
    </AlertDialogFooter>
);

/**
 * The collection dialog: name, icon and color in three steps, over one draft.
 *
 * The step lives here rather than in the body, because the footer's buttons and the body's
 * fields both move on it, and two copies of it would drift.
 */
export const CollectionDialog = ({
    chatIds,
    existing,
    onClose,
}: {
    chatIds: string[];
    existing?: ChatCollection | null;
    onClose: () => void;
}) => {
    const [step, setStep] = useState(0);
    const [query, setQuery] = useState("");
    const draft = useCollectionDraft(existing);

    return (
        <AlertDialog open onOpenChange={closeOnDismiss(onClose)}>
            <AlertDialogContent sizeClassName="max-w-md">
                <AlertDialogHeader>
                    <AlertDialogTitle>{stepTitle(step)}</AlertDialogTitle>
                </AlertDialogHeader>
                <CollectionDialogBody
                    step={step}
                    draft={draft}
                    query={query}
                    setQuery={setQuery}
                    color={draft.color}
                    onPickColor={draft.setColor}
                    onAdvance={() => setStep(1)}
                />
                <CollectionDialogFooter
                    step={step}
                    existing={existing}
                    onClose={onClose}
                    onBack={() => setStep((value) => value - 1)}
                    onNext={() => setStep((value) => value + 1)}
                    onConfirm={() =>
                        saveCollection({
                            existing,
                            chatIds,
                            name: draft.name,
                            icon: draft.icon,
                            color: draft.color,
                        })
                    }
                />
            </AlertDialogContent>
        </AlertDialog>
    );
};
