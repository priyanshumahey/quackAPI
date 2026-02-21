"use client";

import { cn } from "@/lib/utils";
import { Globe, Plus } from "lucide-react";
import type { MockEnvironment, MockEnvironmentVariable } from "./mock-data";

function VariableRow({ variable }: { variable: MockEnvironmentVariable }) {
    return (
        <div
            className={cn(
                "grid grid-cols-[40px_1fr_1fr_1fr] border-t border-border transition-opacity duration-150",
                !variable.enabled && "opacity-40"
            )}
        >
            <div className="flex items-center justify-center border-r border-border">
                <input
                    type="checkbox"
                    defaultChecked={variable.enabled}
                    className="size-3.5 cursor-pointer accent-primary"
                />
            </div>
            <input
                className="border-r border-border bg-transparent px-3 py-2.5 text-[13px] font-medium outline-none placeholder:text-muted-foreground/30 focus:bg-muted/30 transition-colors"
                placeholder="Variable name"
                defaultValue={variable.key}
            />
            <input
                className="border-r border-border bg-transparent px-3 py-2.5 text-[13px] font-mono outline-none placeholder:text-muted-foreground/30 focus:bg-muted/30 transition-colors"
                placeholder="Value"
                defaultValue={variable.value}
            />
            <div className="flex items-center px-3 py-2.5">
                <span className="text-[11px] text-muted-foreground/40 italic">—</span>
            </div>
        </div>
    );
}

function EmptyRow() {
    return (
        <div className="grid grid-cols-[40px_1fr_1fr_1fr] border-t border-border opacity-50 hover:opacity-70 transition-opacity">
            <div className="flex items-center justify-center border-r border-border">
                <input type="checkbox" disabled className="size-3.5 accent-primary" />
            </div>
            <input
                className="border-r border-border bg-transparent px-3 py-2.5 text-[13px] outline-none placeholder:text-muted-foreground/30 focus:bg-muted/30 transition-colors"
                placeholder="New variable…"
            />
            <input
                className="border-r border-border bg-transparent px-3 py-2.5 text-[13px] font-mono outline-none placeholder:text-muted-foreground/30 focus:bg-muted/30 transition-colors"
                placeholder="Value"
            />
            <div className="flex items-center px-3 py-2.5" />
        </div>
    );
}

interface EnvironmentEditorProps {
    environment: MockEnvironment | null;
}

export function EnvironmentEditor({ environment }: EnvironmentEditorProps) {
    if (!environment) {
        return (
            <div className="flex h-full items-center justify-center select-none">
                <div className="text-center">
                    <p className="text-base font-medium text-foreground/60">No environment selected</p>
                    <p className="mt-1.5 text-sm text-muted-foreground/50">
                        Select an environment from the sidebar to view its variables.
                    </p>
                </div>
            </div>
        );
    }

    const enabledCount = environment.variables.filter((v) => v.enabled).length;

    return (
        <div className="flex h-full flex-col select-none">
            <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
                <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10">
                        <Globe className="size-4 text-violet-500" />
                    </div>
                    <div>
                        <h2 className="text-sm font-semibold text-foreground">{environment.name}</h2>
                        <p className="text-[11px] text-muted-foreground/60">
                            {enabledCount} of {environment.variables.length} variables active
                        </p>
                    </div>
                </div>
                <button className="flex h-7 items-center gap-1.5 rounded-lg border border-border px-3 text-[12px] font-medium text-muted-foreground/70 hover:bg-muted/50 hover:text-foreground transition-colors duration-150 cursor-pointer">
                    <Plus className="size-3" />
                    Add Variable
                </button>
            </div>
            <div className="flex-1 overflow-auto">
                <div className="overflow-hidden border-b border-border">
                    <div className="grid grid-cols-[40px_1fr_1fr_1fr] bg-muted/30 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/50">
                        <div className="flex items-center justify-center border-r border-border px-2 py-2">
                            <span title="Enabled">✓</span>
                        </div>
                        <div className="border-r border-border px-3 py-2">Variable</div>
                        <div className="border-r border-border px-3 py-2">Value</div>
                        <div className="px-3 py-2">Description</div>
                    </div>
                    {environment.variables.map((variable, i) => (
                        <VariableRow key={`${environment.id}-${i}`} variable={variable} />
                    ))}
                    <EmptyRow />
                </div>
            </div>
            <div className="flex items-center justify-between border-t border-border px-5 py-2.5">
                <p className="text-[11px] text-muted-foreground/40">
                    Variables are available as <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">{"{{variable_name}}"}</code> in requests
                </p>
                <div className="flex items-center gap-2">
                    <span
                        className={cn(
                            "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
                            environment.isActive
                                ? "bg-emerald-500/10 text-emerald-600"
                                : "bg-muted text-muted-foreground/50"
                        )}
                    >
                        {environment.isActive ? "Active" : "Inactive"}
                    </span>
                </div>
            </div>
        </div>
    );
}
