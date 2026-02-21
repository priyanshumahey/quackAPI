"use client";

import type { EnvFile, EnvVariable } from "@/lib/environments";
import { cn } from "@/lib/utils";
import { Globe, Plus } from "lucide-react";
import { useCallback, useState } from "react";

interface VariableRowProps {
    variable: EnvVariable;
    onToggle: (key: string, enabled: boolean) => void;
    onUpdate: (oldKey: string, newKey: string, newValue: string) => void;
}

function VariableRow({ variable, onToggle, onUpdate }: VariableRowProps) {
    const [localKey, setLocalKey] = useState(variable.key);
    const [localValue, setLocalValue] = useState(variable.value);

    const commitKey = () => {
        const trimmed = localKey.trim();
        if (trimmed && trimmed !== variable.key) {
            onUpdate(variable.key, trimmed, variable.value);
        } else {
            setLocalKey(variable.key);
        }
    };

    const commitValue = () => {
        if (localValue !== variable.value) {
            onUpdate(variable.key, variable.key, localValue);
        }
    };

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
                    checked={variable.enabled}
                    onChange={() => onToggle(variable.key, !variable.enabled)}
                    className="size-3.5 cursor-pointer accent-primary"
                />
            </div>
            <input
                className="border-r border-border bg-transparent px-3 py-2.5 text-[13px] font-medium outline-none placeholder:text-muted-foreground/30 focus:bg-muted/30 transition-colors"
                placeholder="Variable name"
                value={localKey}
                onChange={(e) => setLocalKey(e.target.value)}
                onBlur={commitKey}
                onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
            />
            <input
                className="border-r border-border bg-transparent px-3 py-2.5 text-[13px] font-mono outline-none placeholder:text-muted-foreground/30 focus:bg-muted/30 transition-colors"
                placeholder="Value"
                value={localValue}
                onChange={(e) => setLocalValue(e.target.value)}
                onBlur={commitValue}
                onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
            />
            <div className="flex items-center px-3 py-2.5">
                <span className="text-[11px] text-muted-foreground/40 italic">—</span>
            </div>
        </div>
    );
}


interface NewVariableRowProps {
    onAdd: (key: string, value: string) => void;
}

function NewVariableRow({ onAdd }: NewVariableRowProps) {
    const [key, setKey] = useState("");
    const [value, setValue] = useState("");

    const commit = useCallback(() => {
        const trimmedKey = key.trim();
        if (!trimmedKey) return;
        onAdd(trimmedKey, value);
        setKey("");
        setValue("");
    }, [key, value, onAdd]);

    return (
        <div className="grid grid-cols-[40px_1fr_1fr_1fr] border-t border-border opacity-60 hover:opacity-80 transition-opacity">
            <div className="flex items-center justify-center border-r border-border">
                <input type="checkbox" disabled className="size-3.5 accent-primary" />
            </div>
            <input
                className="border-r border-border bg-transparent px-3 py-2.5 text-[13px] outline-none placeholder:text-muted-foreground/30 focus:bg-muted/30 transition-colors"
                placeholder="New variable…"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                    if (e.key === "Tab" && key.trim()) {
                    }
                }}
            />
            <input
                className="border-r border-border bg-transparent px-3 py-2.5 text-[13px] font-mono outline-none placeholder:text-muted-foreground/30 focus:bg-muted/30 transition-colors"
                placeholder="Value"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
            />
            <div className="flex items-center px-3 py-2.5" />
        </div>
    );
}

interface EnvironmentEditorProps {
    environment: EnvFile | null;
    onToggleVariable: (key: string, enabled: boolean) => void;
    onAddVariable: (key: string, value: string) => void;
    onUpdateVariable: (oldKey: string, newKey: string, newValue: string) => void;
}

export function EnvironmentEditor({
    environment,
    onToggleVariable,
    onAddVariable,
    onUpdateVariable,
}: EnvironmentEditorProps) {
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
                <button
                    onClick={() => onAddVariable("NEW_VARIABLE", "")}
                    className="flex h-7 items-center gap-1.5 rounded-lg border border-border px-3 text-[12px] font-medium text-muted-foreground/70 hover:bg-muted/50 hover:text-foreground transition-colors duration-150 cursor-pointer"
                >
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
                    {environment.variables.map((variable) => (
                        <VariableRow
                            key={variable.key}
                            variable={variable}
                            onToggle={onToggleVariable}
                            onUpdate={onUpdateVariable}
                        />
                    ))}
                    <NewVariableRow onAdd={onAddVariable} />
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
                            environment.isEnabled
                                ? "bg-emerald-500/10 text-emerald-600"
                                : "bg-muted text-muted-foreground/50"
                        )}
                    >
                        {environment.isEnabled ? "Active" : "Inactive"}
                    </span>
                </div>
            </div>
        </div>
    );
}
