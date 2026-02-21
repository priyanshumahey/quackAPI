"use client";

import { cn } from "@/lib/utils";
import { Globe, Plus, Search } from "lucide-react";
import { useState } from "react";
import { MOCK_ENVIRONMENTS } from "./mock-data";

interface EnvironmentPanelProps {
    activeEnvId: string | null;
    onSelectEnv: (id: string) => void;
    enabledEnvIds: Set<string>;
    onToggleEnv: (id: string) => void;
}

export function EnvironmentPanel({
    activeEnvId,
    onSelectEnv,
    enabledEnvIds,
    onToggleEnv,
}: EnvironmentPanelProps) {
    const [search, setSearch] = useState("");

    const filtered = search.trim()
        ? MOCK_ENVIRONMENTS.filter((e) => e.name.toLowerCase().includes(search.toLowerCase()))
        : MOCK_ENVIRONMENTS;

    return (
        <div className="flex h-full flex-col border-r border-border bg-sidebar select-none">
            <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
                <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">
                    Environments
                </span>
                <button
                    title="New Environment"
                    className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/60 hover:bg-muted/60 hover:text-foreground transition-colors duration-150 cursor-pointer"
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
                {filtered.length === 0 ? (
                    <p className="px-3 py-6 text-center text-xs text-muted-foreground/60 italic">No environments</p>
                ) : (
                    <div className="space-y-0.5">
                        {filtered.map((env) => {
                            const isEnabled = enabledEnvIds.has(env.id);
                            return (
                                <div
                                    key={env.id}
                                    className={cn(
                                        "group flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[13px]",
                                        "transition-colors duration-150",
                                        "hover:bg-muted/50",
                                        activeEnvId === env.id && "bg-muted text-foreground"
                                    )}
                                >
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onToggleEnv(env.id);
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
                                    <button
                                        onClick={() => onSelectEnv(env.id)}
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
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
