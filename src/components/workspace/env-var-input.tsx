"use client";

import type { EnvFile } from "@/lib/environments";
import { cn } from "@/lib/utils";
import { useCallback, useMemo, useRef, useState } from "react";

// ── Variable status resolution ──────────────────────────

export type VarStatus = "active" | "inactive" | "missing";

export interface VarInfo {
    status: VarStatus;
    envName: string | null;
    value?: string;
}

/**
 * Resolve the status of a `{{varName}}` reference across all environment files.
 *
 * - "active"   → variable exists in an enabled env file AND the variable itself is enabled (green)
 * - "inactive" → variable exists somewhere but either the env file or the variable is disabled (yellow)
 * - "missing"  → variable key doesn't exist in any env file (red)
 */
export function resolveVar(varName: string, environments: EnvFile[]): VarInfo {
    for (const env of environments) {
        if (!env.isEnabled) continue;
        for (const v of env.variables) {
            if (v.key === varName && v.enabled) {
                return { status: "active", envName: env.name, value: v.value };
            }
        }
    }

    for (const env of environments) {
        for (const v of env.variables) {
            if (v.key === varName) {
                return { status: "inactive", envName: env.name, value: v.value };
            }
        }
    }

    return { status: "missing", envName: null };
}

interface TextSegment {
    kind: "text";
    value: string;
}

interface VarSegment {
    kind: "var";
    varName: string;
    raw: string; // e.g. "{{base_url}}"
}

type Segment = TextSegment | VarSegment;

function parseSegments(text: string): Segment[] {
    const regex = /\{\{([^}]+)\}\}/g;
    const segments: Segment[] = [];
    let last = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
        if (match.index > last) {
            segments.push({ kind: "text", value: text.slice(last, match.index) });
        }
        segments.push({ kind: "var", varName: match[1], raw: match[0] });
        last = match.index + match[0].length;
    }
    if (last < text.length) {
        segments.push({ kind: "text", value: text.slice(last) });
    }
    return segments;
}

const STATUS_STYLES: Record<VarStatus, string> = {
    active:
        "bg-emerald-500/15 text-emerald-700 ring-emerald-500/30 dark:text-emerald-400 dark:bg-emerald-500/10",
    inactive:
        "bg-amber-500/15 text-amber-700 ring-amber-500/30 dark:text-amber-400 dark:bg-amber-500/10",
    missing:
        "bg-red-500/15 text-red-700 ring-red-500/30 dark:text-red-400 dark:bg-red-500/10",
};

const STATUS_TOOLTIP: Record<VarStatus, string> = {
    active: "Active",
    inactive: "Inactive — variable or environment is disabled",
    missing: "Not defined in any environment",
};

interface EnvVarBadgeProps {
    varName: string;
    environments: EnvFile[];
    onOpenEnvTab?: (envName: string) => void;
    className?: string;
}

export function EnvVarBadge({ varName, environments, onOpenEnvTab, className }: EnvVarBadgeProps) {
    const info = useMemo(() => resolveVar(varName, environments), [varName, environments]);

    const handleClick = useCallback(
        (e: React.MouseEvent) => {
            e.stopPropagation();
            e.preventDefault();
            if (info.envName && onOpenEnvTab) {
                onOpenEnvTab(info.envName);
            }
        },
        [info.envName, onOpenEnvTab]
    );

    const tooltip =
        info.status === "active"
            ? `${varName} = ${info.value} (${info.envName})`
            : info.status === "inactive"
                ? `${varName} — disabled (${info.envName})`
                : `${varName} — ${STATUS_TOOLTIP.missing}`;

    return (
        <span
            title={tooltip}
            onClick={info.envName ? handleClick : undefined}
            className={cn(
                "inline-flex items-center rounded px-1 py-px text-[11px] font-mono font-medium ring-1 whitespace-nowrap",
                "transition-all duration-150",
                info.envName && "cursor-pointer hover:brightness-110",
                STATUS_STYLES[info.status],
                className
            )}
        >
            {`{{${varName}}}`}
        </span>
    );
}

interface EnvVarInputProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
    environments: EnvFile[];
    onOpenEnvTab?: (envName: string) => void;
}

export function EnvVarInput({
    value,
    onChange,
    placeholder,
    className,
    environments,
    onOpenEnvTab,
}: EnvVarInputProps) {
    const [isFocused, setIsFocused] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const segments = useMemo(() => parseSegments(value), [value]);
    const hasVars = segments.some((s) => s.kind === "var");

    return (
        <div className={cn("relative", className)}>
            <input
                ref={inputRef}
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                placeholder={placeholder}
                className={cn(
                    "w-full rounded-lg border border-border bg-background px-3 py-1.5 text-[13px] outline-none transition-shadow duration-150 focus:ring-1 focus:ring-ring/40",
                    !isFocused && hasVars && "text-transparent caret-transparent"
                )}
            />
            {!isFocused && hasVars && (
                <div
                    className="pointer-events-auto absolute inset-0 flex items-center overflow-hidden px-3 py-1.5 text-[13px]"
                    onClick={(e) => {
                        if ((e.target as HTMLElement).closest("[data-env-badge]")) return;
                        inputRef.current?.focus();
                    }}
                >
                    <span className="truncate">
                        {segments.map((seg, i) =>
                            seg.kind === "text" ? (
                                <span key={i} className="text-foreground">{seg.value}</span>
                            ) : (
                                <span key={i} data-env-badge>
                                    <EnvVarBadge
                                        varName={seg.varName}
                                        environments={environments}
                                        onOpenEnvTab={onOpenEnvTab}
                                    />
                                </span>
                            )
                        )}
                    </span>
                </div>
            )}
        </div>
    );
}

interface EnvVarTextProps {
    text: string;
    environments: EnvFile[];
    onOpenEnvTab?: (envName: string) => void;
    className?: string;
}

export function EnvVarText({ text, environments, onOpenEnvTab, className }: EnvVarTextProps) {
    const segments = useMemo(() => parseSegments(text), [text]);
    const hasVars = segments.some((s) => s.kind === "var");

    if (!hasVars) return null;

    return (
        <span className={cn("inline", className)}>
            {segments.map((seg, i) =>
                seg.kind === "text" ? (
                    <span key={i}>{seg.value}</span>
                ) : (
                    <span key={i} data-env-badge>
                        <EnvVarBadge
                            varName={seg.varName}
                            environments={environments}
                            onOpenEnvTab={onOpenEnvTab}
                        />
                    </span>
                )
            )}
        </span>
    );
}
