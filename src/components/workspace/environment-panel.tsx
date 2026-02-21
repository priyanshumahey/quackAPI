"use client";

import type { EnvFile } from "@/lib/environments";
import { cn } from "@/lib/utils";
import { Globe, MoreHorizontal, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

interface EnvironmentPanelProps {
    environments: EnvFile[];
    activeEnvName: string | null;
    onSelectEnv: (name: string) => void;
    onToggleEnv: (name: string) => void;
    onCreateEnv: (name: string) => void;
    onRenameEnv: (oldName: string, newName: string) => void;
    onDeleteEnv: (name: string) => void;
}

export function EnvironmentPanel({
    environments,
    activeEnvName,
    onSelectEnv,
    onToggleEnv,
    onCreateEnv,
    onRenameEnv,
    onDeleteEnv,
}: EnvironmentPanelProps) {
    const [search, setSearch] = useState("");
    const [isCreating, setIsCreating] = useState(false);
    const [createName, setCreateName] = useState("");
    const [renamingEnv, setRenamingEnv] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState("");
    const [menuOpenEnv, setMenuOpenEnv] = useState<string | null>(null);
    const createInputRef = useRef<HTMLInputElement>(null);
    const renameInputRef = useRef<HTMLInputElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    const filtered = search.trim()
        ? environments.filter((e) => e.name.toLowerCase().includes(search.toLowerCase()))
        : environments;

    useEffect(() => {
        if (isCreating) createInputRef.current?.focus();
    }, [isCreating]);

    useEffect(() => {
        if (renamingEnv) renameInputRef.current?.focus();
    }, [renamingEnv]);

    useEffect(() => {
        if (!menuOpenEnv) return;
        const handler = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setMenuOpenEnv(null);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [menuOpenEnv]);

    const commitCreate = useCallback(() => {
        const name = createName.trim();
        if (name) onCreateEnv(name);
        setIsCreating(false);
        setCreateName("");
    }, [createName, onCreateEnv]);

    const commitRename = useCallback(() => {
        const newName = renameValue.trim();
        if (newName && renamingEnv && newName !== renamingEnv) {
            onRenameEnv(renamingEnv, newName);
        }
        setRenamingEnv(null);
        setRenameValue("");
    }, [renameValue, renamingEnv, onRenameEnv]);

    return (
        <div className="flex h-full flex-col border-r border-border bg-background select-none">
            <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
                <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">
                    Environments
                </span>
                <button
                    title="New Environment"
                    onClick={() => {
                        setIsCreating(true);
                        setCreateName("");
                    }}
                    className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors duration-150 cursor-pointer"
                >
                    <Plus className="size-3.5" />
                </button>
            </div>
            <div className="px-2.5 py-2">
                <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5 focus-within:ring-1 focus-within:ring-ring/40 transition-shadow duration-150">
                    <Search className="size-3.5 shrink-0 text-muted-foreground/50" />
                    <input
                        type="text"
                        placeholder="Search environments…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="h-4 w-full bg-transparent text-[13px] placeholder:text-muted-foreground/40 outline-none"
                    />
                </div>
            </div>
            <div className="flex-1 overflow-y-auto px-1.5 py-1 scrollbar-none">
                {/* Inline create row */}
                {isCreating && (
                    <div className="flex items-center gap-2 rounded-lg px-2 py-2 mb-0.5 bg-muted/50">
                        <Globe className="size-3.5 shrink-0 text-violet-500" />
                        <input
                            ref={createInputRef}
                            type="text"
                            placeholder="environment name"
                            value={createName}
                            onChange={(e) => setCreateName(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") commitCreate();
                                if (e.key === "Escape") {
                                    setIsCreating(false);
                                    setCreateName("");
                                }
                            }}
                            onBlur={commitCreate}
                            className="h-5 w-full rounded bg-background px-1.5 text-[13px] font-medium outline-none ring-1 ring-ring/40"
                        />
                    </div>
                )}

                {filtered.length === 0 && !isCreating ? (
                    <p className="px-3 py-6 text-center text-xs text-muted-foreground/60 italic">No environments</p>
                ) : (
                    <div className="space-y-0.5">
                        {filtered.map((env) => {
                            const isEnabled = env.isEnabled;
                            const isRenaming = renamingEnv === env.name;
                            return (
                                <div
                                    key={env.name}
                                    className={cn(
                                        "group relative flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[13px]",
                                        "transition-colors duration-150",
                                        "hover:bg-accent",
                                        activeEnvName === env.name && "bg-accent text-accent-foreground"
                                    )}
                                >
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onToggleEnv(env.name);
                                        }}
                                        title={isEnabled ? "Disable environment" : "Enable environment"}
                                        className={cn(
                                            "flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors duration-200 cursor-pointer",
                                            isEnabled ? "bg-emerald-500" : "bg-muted-foreground/20"
                                        )}
                                    >
                                        <div
                                            className={cn(
                                                "h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200",
                                                isEnabled && "translate-x-4"
                                            )}
                                        />
                                    </button>

                                    {isRenaming ? (
                                        <div className="flex min-w-0 flex-1 items-center gap-2">
                                            <Globe className={cn(
                                                "size-3.5 shrink-0 transition-colors duration-150",
                                                isEnabled ? "text-violet-500" : "text-muted-foreground/40"
                                            )} />
                                            <input
                                                ref={renameInputRef}
                                                type="text"
                                                value={renameValue}
                                                onChange={(e) => setRenameValue(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter") commitRename();
                                                    if (e.key === "Escape") {
                                                        setRenamingEnv(null);
                                                        setRenameValue("");
                                                    }
                                                }}
                                                onBlur={commitRename}
                                                className="h-5 w-full rounded bg-background px-1.5 text-[13px] font-medium outline-none ring-1 ring-ring/40"
                                            />
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => onSelectEnv(env.name)}
                                            className="flex min-w-0 flex-1 items-center gap-2 cursor-pointer"
                                        >
                                            <Globe className={cn(
                                                "size-3.5 shrink-0 transition-colors duration-150",
                                                isEnabled ? "text-violet-500" : "text-muted-foreground/40"
                                            )} />
                                            <div className="min-w-0 flex-1">
                                                <p className={cn(
                                                    "truncate font-medium transition-colors duration-150",
                                                    isEnabled ? "text-foreground/90" : "text-muted-foreground/50"
                                                )}>
                                                    {env.name}
                                                </p>
                                                <p className="text-[11px] text-muted-foreground/50">
                                                    {env.variables.length} variable{env.variables.length !== 1 && "s"}
                                                </p>
                                            </div>
                                        </button>
                                    )}

                                    {/* Context menu trigger */}
                                    {!isRenaming && (
                                        <div className="relative">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setMenuOpenEnv(menuOpenEnv === env.name ? null : env.name);
                                                }}
                                                className={cn(
                                                    "flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/40 hover:bg-accent hover:text-accent-foreground transition-colors duration-150 cursor-pointer",
                                                    "opacity-0 group-hover:opacity-100",
                                                    menuOpenEnv === env.name && "opacity-100"
                                                )}
                                            >
                                                <MoreHorizontal className="size-3.5" />
                                            </button>

                                            {menuOpenEnv === env.name && (
                                                <div
                                                    ref={menuRef}
                                                    className="absolute right-0 top-7 z-50 min-w-[140px] rounded-lg border border-border bg-popover p-1 shadow-lg"
                                                >
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setMenuOpenEnv(null);
                                                            setRenamingEnv(env.name);
                                                            setRenameValue(env.name);
                                                        }}
                                                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-foreground/80 hover:bg-accent hover:text-accent-foreground transition-colors duration-150 cursor-pointer"
                                                    >
                                                        <Pencil className="size-3.5" />
                                                        Rename
                                                    </button>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setMenuOpenEnv(null);
                                                            onDeleteEnv(env.name);
                                                        }}
                                                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-destructive hover:bg-destructive/10 hover:text-destructive transition-colors duration-150 cursor-pointer"
                                                    >
                                                        <Trash2 className="size-3.5" />
                                                        Delete
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
