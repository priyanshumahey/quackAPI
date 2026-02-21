"use client";

import { cn } from "@/lib/utils";
import {
    ChevronRight,
    Download,
    FolderClosed,
    FolderOpen,
    Plus,
    Search,
} from "lucide-react";
import { useState } from "react";
import {
    MOCK_COLLECTIONS,
    type MockFolder,
    type MockRequest,
    type MockTreeItem,
} from "./mock-data";

const METHOD_COLORS: Record<string, string> = {
    GET: "text-emerald-600",
    POST: "text-amber-600",
    PUT: "text-blue-600",
    PATCH: "text-violet-600",
    DELETE: "text-red-600",
    HEAD: "text-muted-foreground",
    OPTIONS: "text-muted-foreground",
};

function RequestItem({
    item,
    depth,
    isSelected,
    onSelect,
}: {
    item: MockRequest;
    depth: number;
    isSelected: boolean;
    onSelect: (id: string) => void;
}) {
    return (
        <button
            onClick={() => onSelect(item.id)}
            className={cn(
                "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px]",
                "transition-colors duration-150 cursor-pointer",
                "hover:bg-muted/50",
                isSelected && "bg-muted text-foreground"
            )}
            style={{ paddingLeft: `${depth * 14 + 10}px` }}
        >
            <span className={cn("shrink-0 text-[10px] font-bold uppercase w-9 tracking-wide", METHOD_COLORS[item.method])}>
                {item.method}
            </span>
            <span className="truncate text-foreground/80">{item.name}</span>
        </button>
    );
}

function FolderItem({
    item,
    depth,
    selectedId,
    onSelect,
    openFolders,
    onToggleFolder,
}: {
    item: MockFolder;
    depth: number;
    selectedId: string | null;
    onSelect: (id: string) => void;
    openFolders: Set<string>;
    onToggleFolder: (id: string) => void;
}) {
    const isOpen = openFolders.has(item.id);

    return (
        <div>
            <button
                onClick={() => onToggleFolder(item.id)}
                className={cn(
                    "flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-[13px]",
                    "hover:bg-muted/50 transition-colors duration-150 cursor-pointer"
                )}
                style={{ paddingLeft: `${depth * 14 + 10}px` }}
            >
                <ChevronRight
                    className={cn(
                        "size-3.5 shrink-0 text-muted-foreground/60 transition-transform duration-150",
                        isOpen && "rotate-90"
                    )}
                />
                {isOpen ? (
                    <FolderOpen className="size-3.5 shrink-0 text-muted-foreground" />
                ) : (
                    <FolderClosed className="size-3.5 shrink-0 text-muted-foreground" />
                )}
                <span className="truncate font-medium text-foreground/90">{item.name}</span>
                <span className="ml-auto shrink-0 rounded-full bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">
                    {item.children.length}
                </span>
            </button>
            {isOpen && (
                <div className="mt-0.5">
                    {item.children.map((child) => (
                        <TreeItem
                            key={child.id}
                            item={child}
                            depth={depth + 1}
                            selectedId={selectedId}
                            onSelect={onSelect}
                            openFolders={openFolders}
                            onToggleFolder={onToggleFolder}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

function TreeItem({
    item,
    depth,
    selectedId,
    onSelect,
    openFolders,
    onToggleFolder,
}: {
    item: MockTreeItem;
    depth: number;
    selectedId: string | null;
    onSelect: (id: string) => void;
    openFolders: Set<string>;
    onToggleFolder: (id: string) => void;
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
            />
        );
    }
    return (
        <RequestItem
            item={item}
            depth={depth}
            isSelected={selectedId === item.id}
            onSelect={onSelect}
        />
    );
}


interface CollectionPanelProps {
    selectedRequestId: string | null;
    onSelectRequest: (id: string) => void;
}

export function CollectionPanel({ selectedRequestId, onSelectRequest }: CollectionPanelProps) {
    const [search, setSearch] = useState("");
    const [openFolders, setOpenFolders] = useState<Set<string>>(
        () => new Set(MOCK_COLLECTIONS.filter((c) => c.isOpen).map((c) => c.id))
    );

    const toggleFolder = (id: string) => {
        setOpenFolders((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const filterTree = (items: MockTreeItem[]): MockTreeItem[] => {
        if (!search.trim()) return items;
        const q = search.toLowerCase();
        return items.reduce<MockTreeItem[]>((acc, item) => {
            if (item.type === "request") {
                if (item.name.toLowerCase().includes(q)) acc.push(item);
            } else {
                const filtered = filterTree(item.children);
                if (filtered.length > 0 || item.name.toLowerCase().includes(q)) {
                    acc.push({ ...item, children: filtered, isOpen: true });
                }
            }
            return acc;
        }, []);
    };

    const filteredCollections = filterTree(MOCK_COLLECTIONS);

    return (
        <div className="flex h-full flex-col border-r border-border bg-sidebar select-none">
            <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
                <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">
                    Collections
                </span>
                <div className="flex items-center gap-1">
                    <button
                        title="New Request"
                        className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/60 hover:bg-muted/60 hover:text-foreground transition-colors duration-150 cursor-pointer"
                    >
                        <Plus className="size-3.5" />
                    </button>
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

            <div className="flex-1 overflow-y-auto px-1.5 py-1 scrollbar-none">
                {filteredCollections.length === 0 ? (
                    <p className="px-3 py-6 text-center text-xs text-muted-foreground/60 italic">No results</p>
                ) : (
                    <div className="space-y-0.5">
                        {filteredCollections.map((item) => (
                            <TreeItem
                                key={item.id}
                                item={item}
                                depth={0}
                                selectedId={selectedRequestId}
                                onSelect={onSelectRequest}
                                openFolders={search.trim() ? new Set(filteredCollections.filter((i) => i.type === "folder").map((i) => i.id)) : openFolders}
                                onToggleFolder={toggleFolder}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
