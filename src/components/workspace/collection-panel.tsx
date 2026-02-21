"use client";

import type {
    CollectionEntry,
    CollectionFolder,
    CollectionRequestSummary,
    CollectionTreeItem,
} from "@/lib/collections";
import { cn } from "@/lib/utils";
import {
    DndContext,
    DragOverlay,
    PointerSensor,
    pointerWithin,
    useDraggable,
    useDroppable,
    useSensor,
    useSensors,
    type DragEndEvent,
    type DragStartEvent,
} from "@dnd-kit/core";
import {
    BookOpen,
    ChevronRight,
    Download,
    FileJson,
    FolderClosed,
    FolderOpen,
    FolderPlus,
    GripVertical,
    MoreHorizontal,
    Pencil,
    Plus,
    Search,
    SendHorizontal,
    Trash2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

const METHOD_COLORS: Record<string, string> = {
    GET: "text-emerald-600",
    POST: "text-amber-600",
    PUT: "text-blue-600",
    PATCH: "text-violet-600",
    DELETE: "text-red-600",
    HEAD: "text-muted-foreground",
    OPTIONS: "text-muted-foreground",
};

// ── DnD data carried on drag items ─────────────────────

interface DragItemData {
    relPath: string;
    itemType: "folder" | "collection" | "request";
    name: string;
    /** Only set when itemType === "request" */
    requestId?: string;
    /** Only set when itemType === "request" — the relPath of the parent collection */
    collectionRelPath?: string;
    /** HTTP method — only set when itemType === "request" */
    method?: string;
}

// ── Context menu ───────────────────────────────────────

function ItemContextMenu({
    isOpen,
    onClose,
    onRename,
    onDelete,
    onAddRequest,
    onOpenDocs,
    menuRef,
}: {
    isOpen: boolean;
    onClose: () => void;
    onRename: () => void;
    onDelete: () => void;
    onAddRequest?: () => void;
    onOpenDocs?: () => void;
    menuRef: React.RefObject<HTMLDivElement | null>;
}) {
    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [isOpen, onClose, menuRef]);

    if (!isOpen) return null;
    return (
        <div
            ref={menuRef}
            className="absolute right-0 top-7 z-50 min-w-[160px] rounded-lg border border-border bg-popover p-1 shadow-lg"
        >
            {onAddRequest && (
                <button
                    onClick={(e) => { e.stopPropagation(); onClose(); onAddRequest(); }}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-foreground/80 hover:bg-accent hover:text-accent-foreground transition-colors duration-150 cursor-pointer"
                >
                    <SendHorizontal className="size-3.5" /> New Request
                </button>
            )}
            {onOpenDocs && (
                <button
                    onClick={(e) => { e.stopPropagation(); onClose(); onOpenDocs(); }}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-foreground/80 hover:bg-accent hover:text-accent-foreground transition-colors duration-150 cursor-pointer"
                >
                    <BookOpen className="size-3.5" /> Open Docs
                </button>
            )}
            <button
                onClick={(e) => { e.stopPropagation(); onClose(); onRename(); }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-foreground/80 hover:bg-accent hover:text-accent-foreground transition-colors duration-150 cursor-pointer"
            >
                <Pencil className="size-3.5" /> Rename
            </button>
            <button
                onClick={(e) => { e.stopPropagation(); onClose(); onDelete(); }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-destructive hover:bg-destructive/10 hover:text-destructive transition-colors duration-150 cursor-pointer"
            >
                <Trash2 className="size-3.5" /> Delete
            </button>
        </div>
    );
}

function InlineRenameInput({
    defaultValue,
    onCommit,
    onCancel,
}: {
    defaultValue: string;
    onCommit: (name: string) => void;
    onCancel: () => void;
}) {
    const [value, setValue] = useState(defaultValue);
    const ref = useRef<HTMLInputElement>(null);
    useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);

    const commit = () => {
        const trimmed = value.trim();
        if (trimmed && trimmed !== defaultValue) onCommit(trimmed);
        else onCancel();
    };

    return (
        <input
            ref={ref}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
                if (e.key === "Enter") commit();
                if (e.key === "Escape") onCancel();
            }}
            onClick={(e) => e.stopPropagation()}
            className="h-5 w-full min-w-0 rounded bg-background px-1.5 text-[13px] font-medium outline-none ring-1 ring-ring/40"
        />
    );
}

function InlineCreateRow({
    depth,
    icon,
    placeholder,
    onCommit,
    onCancel,
}: {
    depth: number;
    icon: React.ReactNode;
    placeholder: string;
    onCommit: (name: string) => void;
    onCancel: () => void;
}) {
    const [value, setValue] = useState("");
    const ref = useRef<HTMLInputElement>(null);
    useEffect(() => { ref.current?.focus(); }, []);

    const commit = () => {
        const trimmed = value.trim();
        if (trimmed) onCommit(trimmed);
        else onCancel();
    };

    return (
        <div
            className="flex items-center gap-1.5 rounded-lg bg-muted/50 px-2 py-1.5 text-[13px]"
            style={{ paddingLeft: `${depth * 14 + 10}px` }}
        >
            {icon}
            <input
                ref={ref}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                    if (e.key === "Enter") commit();
                    if (e.key === "Escape") onCancel();
                }}
                placeholder={placeholder}
                className="h-5 w-full min-w-0 rounded bg-background px-1.5 text-[13px] font-medium outline-none ring-1 ring-ring/40"
            />
        </div>
    );
}

function DraggableRow({
    id,
    data,
    disabled,
    children,
}: {
    id: string;
    data: DragItemData;
    disabled?: boolean;
    children: (props: { dragRef: (el: HTMLElement | null) => void; handleRef: (el: HTMLElement | null) => void; isDragging: boolean }) => React.ReactNode;
}) {
    const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({
        id,
        data,
        disabled,
    });

    return (
        <div ref={setNodeRef} {...attributes} {...listeners}>
            {children({
                dragRef: setNodeRef,
                handleRef: setActivatorNodeRef,
                isDragging,
            })}
        </div>
    );
}

function DroppableZone({
    id,
    data,
    children,
    className,
}: {
    id: string;
    data?: Record<string, unknown>;
    children: React.ReactNode;
    className?: string;
}) {
    const { isOver, setNodeRef } = useDroppable({ id, data });

    return (
        <div
            ref={setNodeRef}
            className={cn(className, isOver && "bg-accent/30 ring-1 ring-accent rounded-lg")}
        >
            {children}
        </div>
    );
}

function RequestItem({
    item,
    depth,
    isSelected,
    onSelect,
    renamingId,
    onStartRename,
    onCommitRename,
    onCancelRename,
    onDelete,
}: {
    item: CollectionRequestSummary;
    depth: number;
    isSelected: boolean;
    onSelect: (id: string) => void;
    renamingId: string | null;
    onStartRename: (id: string) => void;
    onCommitRename: (newName: string) => void;
    onCancelRename: () => void;
    onDelete: (requestId: string, collectionRelPath: string) => void;
}) {
    const isRenaming = renamingId === item.id;
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    return (
        <DraggableRow
            id={`drag-req-${item.id}`}
            data={{
                relPath: item.collectionFile,
                itemType: "request",
                name: item.name,
                requestId: item.id,
                collectionRelPath: item.collectionFile,
                method: item.method,
            }}
            disabled={isRenaming}
        >
            {({ isDragging }) => (
                <div
                    className={cn(
                        "group relative flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px]",
                        "transition-colors duration-150 cursor-pointer",
                        "hover:bg-accent",
                        isSelected && "bg-accent text-accent-foreground",
                        isDragging && "opacity-40"
                    )}
                    style={{ paddingLeft: `${depth * 14 + 10}px` }}
                >
                    <button
                        onClick={() => onSelect(item.id)}
                        className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer"
                    >
                        <span className={cn("shrink-0 text-[10px] font-bold uppercase w-9 tracking-wide", METHOD_COLORS[item.method])}>
                            {item.method}
                        </span>
                        {isRenaming ? (
                            <InlineRenameInput
                                defaultValue={item.name}
                                onCommit={onCommitRename}
                                onCancel={onCancelRename}
                            />
                        ) : (
                            <span className="truncate text-foreground/80">{item.name}</span>
                        )}
                    </button>
                    {!isRenaming && (
                        <div className="relative">
                            <button
                                onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
                                className={cn(
                                    "flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/40 hover:bg-muted hover:text-foreground transition-colors duration-150 cursor-pointer",
                                    "opacity-0 group-hover:opacity-100",
                                    menuOpen && "opacity-100"
                                )}
                            >
                                <MoreHorizontal className="size-3.5" />
                            </button>
                            <ItemContextMenu
                                isOpen={menuOpen}
                                onClose={() => setMenuOpen(false)}
                                onRename={() => onStartRename(item.id)}
                                onDelete={() => onDelete(item.id, item.collectionFile)}
                                menuRef={menuRef}
                            />
                        </div>
                    )}
                </div>
            )}
        </DraggableRow>
    );
}

function CollectionItem({
    item,
    depth,
    selectedId,
    onSelect,
    openFolders,
    onToggleFolder,
    onSelectCollection,
    renamingId,
    onStartRename,
    onCommitRename,
    onCancelRename,
    onDelete,
    onAddRequest,
}: {
    item: CollectionEntry;
    depth: number;
    selectedId: string | null;
    onSelect: (id: string) => void;
    openFolders: Set<string>;
    onToggleFolder: (id: string) => void;
    onSelectCollection?: (relPath: string, name: string, description: string | null) => void;
    renamingId: string | null;
    onStartRename: (id: string) => void;
    onCommitRename: (newName: string) => void;
    onCancelRename: () => void;
    onDelete: (id: string, collectionRelPath?: string) => void;
    onAddRequest: (collectionRelPath: string) => void;
}) {
    const isOpen = openFolders.has(item.id);
    const isRenaming = renamingId === item.id;
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    return (
        <DraggableRow
            id={`drag-${item.id}`}
            data={{ relPath: item.relPath, itemType: "collection", name: item.name }}
            disabled={isRenaming}
        >
            {({ isDragging }) => (
                <DroppableZone id={`drop-col-${item.id}`} data={{ relPath: item.relPath, dropType: "collection" }}>
                    <div className={cn(isDragging && "opacity-40")}>
                        <div
                            className={cn(
                                "group relative flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-[13px]",
                                "hover:bg-accentransition-colors duration-150",
                            )}
                            style={{ paddingLeft: `${depth * 14 + 10}px` }}
                        >
                                <button
                                    onClick={(e) => { e.stopPropagation(); onToggleFolder(item.id); }}
                                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground/60 hover:text-muted-foreground cursor-pointer"
                                >
                                    <ChevronRight
                                        className={cn(
                                            "size-3.5 transition-transform duration-150",
                                            isOpen && "rotate-90"
                                        )}
                                    />
                                </button>
                                <button
                                    onClick={() => onToggleFolder(item.id)}
                                    className="flex items-center gap-1.5 min-w-0 flex-1 cursor-pointer"
                                >
                                    {isOpen ? (
                                        <FolderOpen className="size-3.5 shrink-0 text-muted-foreground" />
                                    ) : (
                                        <FolderClosed className="size-3.5 shrink-0 text-muted-foreground" />
                                    )}
                                    {isRenaming ? (
                                        <InlineRenameInput
                                            defaultValue={item.name}
                                            onCommit={onCommitRename}
                                            onCancel={onCancelRename}
                                        />
                                    ) : (
                                        <span className="truncate font-medium text-foreground/90">{item.name}</span>
                                    )}
                                    {!isRenaming && (
                                        <span className="ml-auto shrink-0 rounded-full bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">
                                            {item.requests.length}
                                        </span>
                                    )}
                                </button>
                            {!isRenaming && (
                                <div className="relative">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
                                        className={cn(
                                            "flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/40 hover:bg-accent hover:text-accent-foreground transition-colors duration-150 cursor-pointer",
                                            "opacity-0 group-hover:opacity-100",
                                            menuOpen && "opacity-100"
                                        )}
                                    >
                                        <MoreHorizontal className="size-3.5" />
                                    </button>
                                    <ItemContextMenu
                                        isOpen={menuOpen}
                                        onClose={() => setMenuOpen(false)}
                                        onRename={() => onStartRename(item.id)}
                                        onDelete={() => onDelete(item.relPath)}
                                        onAddRequest={() => onAddRequest(item.relPath)}
                                        onOpenDocs={() => onSelectCollection?.(item.relPath, item.name, item.description)}
                                        menuRef={menuRef}
                                    />
                                </div>
                            )}
                        </div>
                        {isOpen && (
                            <div className="mt-0.5">
                                {item.requests.map((req) => (
                                    <RequestItem
                                        key={req.id}
                                        item={req}
                                        depth={depth + 1}
                                        isSelected={selectedId === req.id}
                                        onSelect={onSelect}
                                        renamingId={renamingId}
                                        onStartRename={onStartRename}
                                        onCommitRename={onCommitRename}
                                        onCancelRename={onCancelRename}
                                        onDelete={onDelete}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                </DroppableZone>
            )}
        </DraggableRow>
    );
}

function FolderItem({
    item,
    depth,
    selectedId,
    onSelect,
    openFolders,
    onToggleFolder,
    onSelectFolder,
    onSelectCollection,
    renamingId,
    onStartRename,
    onCommitRename,
    onCancelRename,
    onDelete,
    onAddRequest,
    creating,
    onCreateCommit,
    onCreateCancel,
}: {
    item: CollectionFolder;
    depth: number;
    selectedId: string | null;
    onSelect: (id: string) => void;
    openFolders: Set<string>;
    onToggleFolder: (id: string) => void;
    onSelectFolder?: (relPath: string, name: string) => void;
    onSelectCollection?: (relPath: string, name: string, description: string | null) => void;
    renamingId: string | null;
    onStartRename: (id: string) => void;
    onCommitRename: (newName: string) => void;
    onCancelRename: () => void;
    onDelete: (id: string, collectionRelPath?: string) => void;
    onAddRequest: (collectionRelPath: string) => void;
    creating: { parentId: string; kind: "folder" | "collection" } | null;
    onCreateCommit: (name: string) => void;
    onCreateCancel: () => void;
}) {
    const isOpen = openFolders.has(item.id);
    const isRenaming = renamingId === item.id;
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    return (
        <DraggableRow
            id={`drag-${item.id}`}
            data={{ relPath: item.relPath, itemType: "folder", name: item.name }}
            disabled={isRenaming}
        >
            {({ isDragging }) => (
                <DroppableZone id={`drop-${item.id}`} data={{ relPath: item.relPath, dropType: "folder" }}>
                    <div className={cn(isDragging && "opacity-40")}>
                        <div
                            className={cn(
                                "group relative flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-[13px]",
                                "hover:bg-accent transition-colors duration-150",
                            )}
                            style={{ paddingLeft: `${depth * 14 + 10}px` }}
                        >
                                <button
                                    onClick={(e) => { e.stopPropagation(); onToggleFolder(item.id); }}
                                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground/60 hover:text-muted-foreground cursor-pointer"
                                >
                                    <ChevronRight
                                        className={cn(
                                            "size-3.5 transition-transform duration-150",
                                            isOpen && "rotate-90"
                                        )}
                                    />
                                </button>
                                <button
                                    onClick={() => onToggleFolder(item.id)}
                                    className="flex items-center gap-1.5 min-w-0 flex-1 cursor-pointer"
                                >
                                {isOpen ? (
                                    <FolderOpen className="size-3.5 shrink-0 text-amber-500/70" />
                                ) : (
                                    <FolderClosed className="size-3.5 shrink-0 text-amber-500/70" />
                                )}
                                {isRenaming ? (
                                    <InlineRenameInput
                                        defaultValue={item.name}
                                        onCommit={onCommitRename}
                                        onCancel={onCancelRename}
                                    />
                                ) : (
                                    <span className="truncate font-medium text-foreground/90">{item.name}</span>
                                )}
                                {!isRenaming && (
                                    <span className="ml-auto shrink-0 rounded-full bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">
                                        {item.children.length}
                                    </span>
                                )}
                                </button>
                            {!isRenaming && (
                                <div className="relative">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
                                        className={cn(
                                            "flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/40 hover:bg-accent hover:text-accent-foreground transition-colors duration-150 cursor-pointer",
                                            "opacity-0 group-hover:opacity-100",
                                            menuOpen && "opacity-100"
                                        )}
                                    >
                                        <MoreHorizontal className="size-3.5" />
                                    </button>
                                    <ItemContextMenu
                                        isOpen={menuOpen}
                                        onClose={() => setMenuOpen(false)}
                                        onRename={() => onStartRename(item.id)}
                                        onDelete={() => onDelete(item.relPath)}
                                        onOpenDocs={() => onSelectFolder?.(item.relPath, item.name)}
                                        menuRef={menuRef}
                                    />
                                </div>
                            )}
                        </div>
                        {isOpen && (
                            <div className="mt-0.5">
                                {creating?.parentId === item.id && (
                                    <InlineCreateRow
                                        depth={depth + 1}
                                        icon={creating.kind === "folder"
                                            ? <FolderClosed className="size-3.5 shrink-0 text-amber-500/70" />
                                            : <FolderClosed className="size-3.5 shrink-0 text-muted-foreground" />}
                                        placeholder={creating.kind === "folder" ? "Folder name…" : "Collection name…"}
                                        onCommit={onCreateCommit}
                                        onCancel={onCreateCancel}
                                    />
                                )}
                                {item.children.map((child) => (
                                    <TreeItem
                                        key={child.id}
                                        item={child}
                                        depth={depth + 1}
                                        selectedId={selectedId}
                                        onSelect={onSelect}
                                        openFolders={openFolders}
                                        onToggleFolder={onToggleFolder}
                                        onSelectFolder={onSelectFolder}
                                        onSelectCollection={onSelectCollection}
                                        renamingId={renamingId}
                                        onStartRename={onStartRename}
                                        onCommitRename={onCommitRename}
                                        onCancelRename={onCancelRename}
                                        onDelete={onDelete}
                                        onAddRequest={onAddRequest}
                                        creating={creating}
                                        onCreateCommit={onCreateCommit}
                                        onCreateCancel={onCreateCancel}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                </DroppableZone>
            )}
        </DraggableRow>
    );
}

function TreeItem({
    item,
    depth,
    selectedId,
    onSelect,
    openFolders,
    onToggleFolder,
    onSelectFolder,
    onSelectCollection,
    renamingId,
    onStartRename,
    onCommitRename,
    onCancelRename,
    onDelete,
    onAddRequest,
    creating,
    onCreateCommit,
    onCreateCancel,
}: {
    item: CollectionTreeItem;
    depth: number;
    selectedId: string | null;
    onSelect: (id: string) => void;
    openFolders: Set<string>;
    onToggleFolder: (id: string) => void;
    onSelectFolder?: (relPath: string, name: string) => void;
    onSelectCollection?: (relPath: string, name: string, description: string | null) => void;
    renamingId: string | null;
    onStartRename: (id: string) => void;
    onCommitRename: (newName: string) => void;
    onCancelRename: () => void;
    onDelete: (id: string, collectionRelPath?: string) => void;
    onAddRequest: (collectionRelPath: string) => void;
    creating: { parentId: string; kind: "folder" | "collection" } | null;
    onCreateCommit: (name: string) => void;
    onCreateCancel: () => void;
}) {
    if (item.type === "folder") {
        return (
            <FolderItem
                item={item}
                depth={depth}
                selectedId={selectedId}
                onSelect={onSelect}
                openFolders={openFolders}
                onToggleFolder={onToggleFolder}
                onSelectFolder={onSelectFolder}
                onSelectCollection={onSelectCollection}
                renamingId={renamingId}
                onStartRename={onStartRename}
                onCommitRename={onCommitRename}
                onCancelRename={onCancelRename}
                onDelete={onDelete}
                onAddRequest={onAddRequest}
                creating={creating}
                onCreateCommit={onCreateCommit}
                onCreateCancel={onCreateCancel}
            />
        );
    }
    return (
        <CollectionItem
            item={item}
            depth={depth}
            selectedId={selectedId}
            onSelect={onSelect}
            openFolders={openFolders}
            onToggleFolder={onToggleFolder}
            onSelectCollection={onSelectCollection}
            renamingId={renamingId}
            onStartRename={onStartRename}
            onCommitRename={onCommitRename}
            onCancelRename={onCancelRename}
            onDelete={onDelete}
            onAddRequest={onAddRequest}
        />
    );
}

function filterTree(items: CollectionTreeItem[], query: string): CollectionTreeItem[] {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.reduce<CollectionTreeItem[]>((acc, item) => {
        if (item.type === "folder") {
            const filtered = filterTree(item.children, query);
            if (filtered.length > 0 || item.name.toLowerCase().includes(q)) {
                acc.push({ ...item, children: filtered });
            }
        } else {
            const matchingReqs = item.requests.filter((r) => r.name.toLowerCase().includes(q));
            if (matchingReqs.length > 0 || item.name.toLowerCase().includes(q)) {
                acc.push({ ...item, requests: matchingReqs.length > 0 ? matchingReqs : item.requests });
            }
        }
        return acc;
    }, []);
}

function collectAllIds(items: CollectionTreeItem[]): string[] {
    const ids: string[] = [];
    for (const item of items) {
        ids.push(item.id);
        if (item.type === "folder") {
            ids.push(...collectAllIds(item.children));
        }
    }
    return ids;
}

function DragOverlayContent({ data }: { data: DragItemData }) {
    if (data.itemType === "request") {
        return (
            <div className="flex items-center gap-1.5 rounded-lg border border-border bg-popover px-3 py-1.5 text-[13px] font-medium shadow-lg">
                <GripVertical className="size-3 text-muted-foreground/40" />
                <span className={cn("shrink-0 text-[10px] font-bold uppercase w-9 tracking-wide", METHOD_COLORS[data.method ?? "GET"])}>
                    {data.method ?? "GET"}
                </span>
                <span className="truncate">{data.name}</span>
            </div>
        );
    }
    const isFolder = data.itemType === "folder";
    return (
        <div className="flex items-center gap-1.5 rounded-lg border border-border bg-popover px-3 py-1.5 text-[13px] font-medium shadow-lg">
            <GripVertical className="size-3 text-muted-foreground/40" />
            {isFolder ? (
                <FolderClosed className="size-3.5 text-amber-500/70" />
            ) : (
                <FolderClosed className="size-3.5 text-muted-foreground" />
            )}
            <span className="truncate">{data.name}</span>
        </div>
    );
}

interface CollectionPanelProps {
    collections: CollectionTreeItem[];
    selectedRequestId: string | null;
    onSelectRequest: (id: string) => void;
    onSelectFolder?: (relPath: string, name: string) => void;
    onSelectCollection?: (relPath: string, name: string, description: string | null) => void;
    onCreateFolder: (parentRelPath: string, name: string) => void;
    onCreateCollection: (parentRelPath: string, name: string) => void;
    onRenameFolder: (relPath: string, newName: string) => void;
    onRenameCollection: (relPath: string, newName: string) => void;
    onRenameRequest: (requestId: string, collectionRelPath: string, newName: string) => void;
    onDeleteItem: (relPath: string) => void;
    onDeleteRequest: (requestId: string, collectionRelPath: string) => void;
    onMoveItem: (itemRelPath: string, destParentRelPath: string) => void;
    onMoveRequest: (requestId: string, sourceCollectionRelPath: string, destCollectionRelPath: string) => void;
    onAddRequest: (collectionRelPath: string) => void;
}

export function CollectionPanel({
    collections,
    selectedRequestId,
    onSelectRequest,
    onSelectFolder,
    onSelectCollection,
    onCreateFolder,
    onCreateCollection,
    onRenameFolder,
    onRenameCollection,
    onRenameRequest,
    onDeleteItem,
    onDeleteRequest,
    onMoveItem,
    onMoveRequest,
    onAddRequest,
}: CollectionPanelProps) {
    const [search, setSearch] = useState("");
    const [openFolders, setOpenFolders] = useState<Set<string>>(() => new Set<string>());
    const [plusMenuOpen, setPlusMenuOpen] = useState(false);
    const plusMenuRef = useRef<HTMLDivElement>(null);
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [creating, setCreating] = useState<{ parentId: string; kind: "folder" | "collection"; parentRelPath: string } | null>(null);
    const [activeDrag, setActiveDrag] = useState<DragItemData | null>(null);
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    );
    useEffect(() => {
        if (!plusMenuOpen) return;
        const handler = (e: MouseEvent) => {
            if (plusMenuRef.current && !plusMenuRef.current.contains(e.target as Node)) {
                setPlusMenuOpen(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [plusMenuOpen]);

    const toggleFolder = (id: string) => {
        setOpenFolders((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const filtered = filterTree(collections, search);
    const effectiveOpenFolders = search.trim()
        ? new Set(collectAllIds(filtered))
        : openFolders;

    const findItem = useCallback((items: CollectionTreeItem[], id: string): CollectionTreeItem | CollectionRequestSummary | null => {
        for (const item of items) {
            if (item.id === id) return item;
            if (item.type === "folder") {
                const found = findItem(item.children, id);
                if (found) return found;
            } else if (item.type === "collection") {
                const req = item.requests.find(r => r.id === id);
                if (req) return req;
            }
        }
        return null;
    }, []);

    const handleCommitRename = useCallback((newName: string) => {
        if (!renamingId) return;
        const item = findItem(collections, renamingId);
        if (!item) { setRenamingId(null); return; }
        if ("type" in item) {
            if (item.type === "folder") onRenameFolder(item.relPath, newName);
            else onRenameCollection(item.relPath, newName);
        } else {
            onRenameRequest(item.id, item.collectionFile, newName);
        }
        setRenamingId(null);
    }, [renamingId, collections, findItem, onRenameFolder, onRenameCollection, onRenameRequest]);

    const handleDelete = useCallback((idOrRelPath: string, collectionRelPath?: string) => {
        if (collectionRelPath) {
            onDeleteRequest(idOrRelPath, collectionRelPath);
        } else {
            onDeleteItem(idOrRelPath);
        }
    }, [onDeleteItem, onDeleteRequest]);

    const handleCreateCommit = useCallback((name: string) => {
        if (!creating) return;
        if (creating.kind === "folder") onCreateFolder(creating.parentRelPath, name);
        else onCreateCollection(creating.parentRelPath, name);
        setCreating(null);
    }, [creating, onCreateFolder, onCreateCollection]);

    const startRootCreate = (kind: "folder" | "collection") => {
        setPlusMenuOpen(false);
        setCreating({ parentId: "__root__", kind, parentRelPath: "" });
    };
    const handleDragStart = useCallback((event: DragStartEvent) => {
        const data = event.active.data.current as DragItemData | undefined;
        if (data) setActiveDrag(data);
    }, []);

    const handleDragEnd = useCallback((event: DragEndEvent) => {
        setActiveDrag(null);
        const { active, over } = event;
        if (!over) return;

        const dragData = active.data.current as DragItemData | undefined;
        if (!dragData) return;

        const dropData = over.data.current as { relPath?: string; dropType?: string } | undefined;
        const destRelPath = dropData?.relPath ?? "";

        if (dragData.itemType === "request") {
            // Requests can only be dropped onto collections
            if (dropData?.dropType !== "collection") return;
            // Don't drop onto the same collection
            if (!dragData.requestId || !dragData.collectionRelPath) return;
            if (!destRelPath) return;
            if (dragData.collectionRelPath === destRelPath) return;
            onMoveRequest(dragData.requestId, dragData.collectionRelPath, destRelPath);
        } else {
            // Collections and folders are dropped onto folders (or root)
            if (!dragData.relPath) return;
            if (dragData.relPath === destRelPath) return;
            // Don't allow dropping a collection/folder onto a collection
            if (dropData?.dropType === "collection") return;
            onMoveItem(dragData.relPath, destRelPath);
        }
    }, [onMoveItem, onMoveRequest]);

    const handleDragCancel = useCallback(() => {
        setActiveDrag(null);
    }, []);

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={pointerWithin}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
        >
            <div className="flex h-full flex-col border-r border-border bg-background select-none">
                <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
                    <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">
                        Collections
                    </span>
                    <div className="flex items-center gap-1">
                        <div className="relative">
                            <button
                                title="New…"
                                onClick={() => setPlusMenuOpen(!plusMenuOpen)}
                                className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors duration-150 cursor-pointer"
                            >
                                <Plus className="size-3.5" />
                            </button>
                            {plusMenuOpen && (
                                <div
                                    ref={plusMenuRef}
                                    className="absolute right-0 top-7 z-50 min-w-[160px] rounded-lg border border-border bg-popover p-1 shadow-lg"
                                >
                                    <button
                                        onClick={() => startRootCreate("collection")}
                                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-foreground/80 hover:bg-accent hover:text-accent-foreground transition-colors duration-150 cursor-pointer"
                                    >
                                        <FileJson className="size-3.5" /> New Collection
                                    </button>
                                    <button
                                        onClick={() => startRootCreate("folder")}
                                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-foreground/80 hover:bg-accent hover:text-accent-foreground transition-colors duration-150 cursor-pointer"
                                    >
                                        <FolderPlus className="size-3.5" /> New Folder
                                    </button>
                                </div>
                            )}
                        </div>
                        <button
                            title="Import"
                            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/60 hover:bg-muted/60 hover:text-foreground transition-colors duration-150 cursor-pointer"
                        >
                            <Download className="size-3.5" />
                        </button>
                    </div>
                </div>

                <div className="px-2.5 py-2">
                    <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5 focus-within:ring-1 focus-within:ring-ring/40 transition-shadow duration-150">
                        <Search className="size-3.5 shrink-0 text-muted-foreground/50" />
                        <input
                            type="text"
                            placeholder="Search collections…"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="h-4 w-full bg-transparent text-[13px] placeholder:text-muted-foreground/40 outline-none"
                        />
                    </div>
                </div>

                <DroppableZone
                    id="drop-root"
                    data={{ relPath: "", dropType: "folder" }}
                    className="flex-1 overflow-y-auto px-1.5 py-1 scrollbar-none"
                >
                    {/* Root-level create row */}
                    {creating?.parentId === "__root__" && (
                        <InlineCreateRow
                            depth={0}
                            icon={creating.kind === "folder"
                                ? <FolderClosed className="size-3.5 shrink-0 text-amber-500/70" />
                                : <FolderClosed className="size-3.5 shrink-0 text-muted-foreground" />}
                            placeholder={creating.kind === "folder" ? "Folder name…" : "Collection name…"}
                            onCommit={handleCreateCommit}
                            onCancel={() => setCreating(null)}
                        />
                    )}
                    {filtered.length === 0 && !creating ? (
                        <p className="px-3 py-6 text-center text-xs text-muted-foreground/60 italic">No results</p>
                    ) : (
                        <div className="space-y-0.5">
                            {filtered.map((item) => (
                                <TreeItem
                                    key={item.id}
                                    item={item}
                                    depth={0}
                                    selectedId={selectedRequestId}
                                    onSelect={onSelectRequest}
                                    openFolders={effectiveOpenFolders}
                                    onToggleFolder={toggleFolder}
                                    onSelectFolder={onSelectFolder}
                                    onSelectCollection={onSelectCollection}
                                    renamingId={renamingId}
                                    onStartRename={setRenamingId}
                                    onCommitRename={handleCommitRename}
                                    onCancelRename={() => setRenamingId(null)}
                                    onDelete={handleDelete}
                                    onAddRequest={onAddRequest}
                                    creating={creating}
                                    onCreateCommit={handleCreateCommit}
                                    onCreateCancel={() => setCreating(null)}
                                />
                            ))}
                        </div>
                    )}
                </DroppableZone>

                <DragOverlay dropAnimation={null}>
                    {activeDrag ? <DragOverlayContent data={activeDrag} /> : null}
                </DragOverlay>
            </div>
        </DndContext>
    );
}
