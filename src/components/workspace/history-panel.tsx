"use client";

import {
    type HistoryEntry,
    type HistoryFilter,
    historyClear,
    historyDelete,
    historyList,
    historyReadBlob,
    tryDecodeBlobAsText,
} from "@/lib/history";
import { cn } from "@/lib/utils";
import {
    AlertCircle,
    Eye,
    Loader2,
    Play,
    RefreshCw,
    Search,
    Trash2,
    X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

export interface HistoryPanelProps {
    workspacePath: string | null;
    refreshKey: number;
    onReplay?: (entry: HistoryEntry) => void;
}

const METHOD_COLORS: Record<string, string> = {
    GET: "text-emerald-600 dark:text-emerald-400",
    POST: "text-amber-600 dark:text-amber-400",
    PUT: "text-blue-600 dark:text-blue-400",
    PATCH: "text-violet-600 dark:text-violet-400",
    DELETE: "text-rose-600 dark:text-rose-400",
};

function methodClass(m: string | null | undefined): string {
    if (!m) return "text-muted-foreground";
    return METHOD_COLORS[m.toUpperCase()] ?? "text-muted-foreground";
}

function statusClass(status: number | null): string {
    if (status == null) return "text-muted-foreground";
    if (status >= 500) return "text-rose-600 dark:text-rose-400";
    if (status >= 400) return "text-amber-600 dark:text-amber-400";
    if (status >= 300) return "text-blue-600 dark:text-blue-400";
    if (status >= 200) return "text-emerald-600 dark:text-emerald-400";
    return "text-muted-foreground";
}

function formatTime(ms: number): string {
    const d = new Date(ms);
    const today = new Date();
    const sameDay =
        d.getFullYear() === today.getFullYear() &&
        d.getMonth() === today.getMonth() &&
        d.getDate() === today.getDate();
    if (sameDay) {
        return d.toLocaleTimeString(undefined, {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
        });
    }
    return d.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function formatBytes(n: number | null): string {
    if (n == null) return "—";
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function isWs(e: HistoryEntry): boolean {
    return e.protocol === "ws";
}

export function HistoryPanel({ workspacePath, refreshKey = 0, onReplay }: HistoryPanelProps) {
    const [entries, setEntries] = useState<HistoryEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [selectedId, setSelectedId] = useState<string | null>(null);

    const reload = useCallback(async () => {
        if (!workspacePath) {
            setEntries([]);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const filter: HistoryFilter = { limit: 200 };
            const list = await historyList(workspacePath, filter);
            setEntries(list);
        } catch (e) {
            setError(String(e));
        } finally {
            setLoading(false);
        }
    }, [workspacePath]);

    useEffect(() => {
        void reload();
    }, [reload, refreshKey]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return entries;
        return entries.filter((e) => {
            return (
                e.url.toLowerCase().includes(q) ||
                (e.requestName ?? "").toLowerCase().includes(q) ||
                (e.method ?? "").toLowerCase().includes(q) ||
                (e.tags ?? "").toLowerCase().includes(q)
            );
        });
    }, [entries, search]);

    const selected = useMemo(
        () =>
            filtered.find((e) => e.id === selectedId) ??
            entries.find((e) => e.id === selectedId) ??
            null,
        [filtered, entries, selectedId],
    );

    const handleDelete = useCallback(
        async (id: string) => {
            if (!workspacePath) return;
            try {
                await historyDelete(workspacePath, id);
                setEntries((cur) => cur.filter((e) => e.id !== id));
                if (selectedId === id) setSelectedId(null);
            } catch (e) {
                setError(String(e));
            }
        },
        [workspacePath, selectedId],
    );

    const handleClear = useCallback(async () => {
        if (!workspacePath) return;
        if (!confirm("Clear ALL history for this workspace? This cannot be undone.")) return;
        try {
            await historyClear(workspacePath);
            setEntries([]);
            setSelectedId(null);
        } catch (e) {
            setError(String(e));
        }
    }, [workspacePath]);

    return (
        <div className="flex h-full flex-col border-r border-border bg-background select-none">
            <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
                <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">
                    History
                </span>
                <div className="flex items-center gap-1">
                    <button
                        title="Refresh"
                        onClick={() => void reload()}
                        className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors duration-150 cursor-pointer"
                    >
                        <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
                    </button>
                    <button
                        title="Clear all history"
                        onClick={() => void handleClear()}
                        disabled={entries.length === 0}
                        className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-rose-500 transition-colors duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        <Trash2 className="size-3.5" />
                    </button>
                </div>
            </div>

            <div className="border-b border-border px-3 py-2">
                <div className="relative">
                    <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/60" />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Filter by URL, name, method…"
                        className="w-full rounded-md border border-border bg-background py-1.5 pl-7 pr-2 text-[12px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                </div>
            </div>

            {error && (
                <div className="mx-3 my-2 flex items-start gap-2 rounded-md border border-rose-500/30 bg-rose-500/5 px-2 py-1.5 text-[11px] text-rose-600 dark:text-rose-400">
                    <AlertCircle className="mt-0.5 size-3.5 flex-shrink-0" />
                    <span className="break-words">{error}</span>
                </div>
            )}

            <div className="flex-1 overflow-y-auto">
                {loading && entries.length === 0 ? (
                    <div className="flex h-full items-center justify-center">
                        <Loader2 className="size-4 animate-spin text-muted-foreground/50" />
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="flex h-full items-center justify-center">
                        <p className="text-[13px] text-muted-foreground/50 italic">
                            {entries.length === 0 ? "No history yet" : "No matches"}
                        </p>
                    </div>
                ) : (
                    <ul className="flex flex-col">
                        {filtered.map((e) => (
                            <li key={e.id}>
                                <button
                                    onClick={() => setSelectedId(e.id)}
                                    className={cn(
                                        "group w-full border-b border-border/40 px-3 py-2 text-left transition-colors hover:bg-accent/40 focus:bg-accent/60 focus:outline-none cursor-pointer",
                                        selectedId === e.id && "bg-accent/50",
                                    )}
                                >
                                    <div className="flex items-center gap-2">
                                        {isWs(e) ? (
                                            <span className="font-mono text-[10px] font-semibold tracking-wider text-indigo-600 dark:text-indigo-400">
                                                WS
                                            </span>
                                        ) : (
                                            <span
                                                className={cn(
                                                    "font-mono text-[10px] font-semibold tracking-wider",
                                                    methodClass(e.method),
                                                )}
                                            >
                                                {e.method || "—"}
                                            </span>
                                        )}
                                        <span
                                            className={cn(
                                                "font-mono text-[10px] font-semibold",
                                                statusClass(e.status),
                                            )}
                                        >
                                            {e.status ?? (e.error ? "ERR" : e.finishedAtMs ? "—" : "…")}
                                        </span>
                                        <span className="ml-auto text-[10px] text-muted-foreground/60">
                                            {formatTime(e.startedAtMs)}
                                        </span>
                                    </div>
                                    <div className="mt-0.5 truncate text-[12px] text-foreground/90">
                                        {e.url || <span className="italic text-muted-foreground/60">(no URL)</span>}
                                    </div>
                                    {(e.requestName || e.responseTimeMs != null) && (
                                        <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground/70">
                                            {e.requestName && <span className="truncate">{e.requestName}</span>}
                                            {e.responseTimeMs != null && <span>· {e.responseTimeMs} ms</span>}
                                            {e.tags && (
                                                <span className="rounded-sm bg-accent/60 px-1 py-px font-mono">
                                                    {e.tags}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {selected && workspacePath && (
                <HistoryDetailModal
                    workspacePath={workspacePath}
                    entry={selected}
                    onClose={() => setSelectedId(null)}
                    onDelete={() => void handleDelete(selected.id)}
                    onReplay={onReplay ? () => onReplay(selected) : undefined}
                />
            )}
        </div>
    );
}


interface DetailModalProps {
    workspacePath: string;
    entry: HistoryEntry;
    onClose: () => void;
    onDelete: () => void;
    onReplay?: () => void;
}

function HistoryDetailModal({
    entry,
    workspacePath,
    onClose,
    onDelete,
    onReplay,
}: DetailModalProps) {
    const [tab, setTab] = useState<"request" | "response">("request");
    const [reqBody, setReqBody] = useState<string | null>(entry.bodyPreview);
    const [respBody, setRespBody] = useState<string | null>(entry.responsePreview);
    const [loadingBlob, setLoadingBlob] = useState(false);

    useEffect(() => {
        let cancelled = false;
        async function loadBlobs() {
            if (entry.bodyBlobSha256) {
                setLoadingBlob(true);
                try {
                    const blob = await historyReadBlob(workspacePath, entry.bodyBlobSha256);
                    if (cancelled) return;
                    setReqBody(tryDecodeBlobAsText(blob.bytesBase64) ?? "[binary payload]");
                } catch (e) {
                    if (!cancelled) setReqBody(`[failed to load blob: ${e}]`);
                }
            }
            if (entry.responseBlobSha256) {
                setLoadingBlob(true);
                try {
                    const blob = await historyReadBlob(workspacePath, entry.responseBlobSha256);
                    if (cancelled) return;
                    setRespBody(tryDecodeBlobAsText(blob.bytesBase64) ?? "[non-UTF-8 payload]");
                } catch (e) {
                    if (!cancelled) setRespBody(`[failed to load blob: ${e}]`);
                }
            }
            if (!cancelled) setLoadingBlob(false);
        }
        void loadBlobs();
        return () => {
            cancelled = true;
        };
    }, [entry, workspacePath]);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                className="flex h-[80vh] w-[min(900px,90vw)] flex-col rounded-lg border border-border bg-background shadow-2xl"
            >
                <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                    {isWs(entry) ? (
                        <span className="font-mono text-[11px] font-semibold tracking-wider text-indigo-600 dark:text-indigo-400">
                            WS
                        </span>
                    ) : (
                        <span
                            className={cn(
                                "font-mono text-[11px] font-semibold tracking-wider",
                                methodClass(entry.method),
                            )}
                        >
                            {entry.method}
                        </span>
                    )}
                    <span className={cn("font-mono text-[11px] font-semibold", statusClass(entry.status))}>
                        {entry.status ?? (entry.error ? "ERR" : "—")}
                    </span>
                    <span className="ml-1 truncate text-[12px] text-foreground/90">{entry.url}</span>
                    <div className="ml-auto flex items-center gap-1">
                        {onReplay && !isWs(entry) && (
                            <button
                                onClick={onReplay}
                                title="Replay this request"
                                className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-foreground hover:bg-accent transition-colors cursor-pointer"
                            >
                                <Play className="size-3" />
                                Replay
                            </button>
                        )}
                        <button
                            onClick={onDelete}
                            title="Delete entry"
                            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-rose-500 transition-colors cursor-pointer"
                        >
                            <Trash2 className="size-3.5" />
                        </button>
                        <button
                            onClick={onClose}
                            title="Close"
                            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent transition-colors cursor-pointer"
                        >
                            <X className="size-4" />
                        </button>
                    </div>
                </div>

                <div className="flex items-center gap-1 border-b border-border px-3 py-1.5">
                    {(["request", "response"] as const).map((t) => (
                        <button
                            key={t}
                            onClick={() => setTab(t)}
                            className={cn(
                                "rounded-md px-2.5 py-1 text-[12px] capitalize transition-colors cursor-pointer",
                                tab === t
                                    ? "bg-accent text-accent-foreground"
                                    : "text-muted-foreground hover:bg-accent/50",
                            )}
                        >
                            {t}
                        </button>
                    ))}
                    <span className="ml-auto flex items-center gap-3 text-[10px] text-muted-foreground/70">
                        {entry.responseTimeMs != null && <span>{entry.responseTimeMs} ms</span>}
                        <span>{formatTime(entry.startedAtMs)}</span>
                        {loadingBlob && <Loader2 className="size-3 animate-spin" />}
                    </span>
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-3">
                    {tab === "request" ? (
                        <RequestDetail entry={entry} reqBody={reqBody} />
                    ) : (
                        <ResponseDetail entry={entry} respBody={respBody} />
                    )}
                </div>

                <div className="border-t border-border bg-muted/30 px-4 py-2 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                        <Eye className="size-3" />
                        Sensitive values are redacted at write-time as{" "}
                        <code className="rounded bg-muted px-1">***redacted(sha8:…)***</code>{" "}
                        — identical secrets produce identical hashes for diffing without exposing the value.
                    </span>
                </div>
            </div>
        </div>
    );
}

function RequestDetail({ entry, reqBody }: { entry: HistoryEntry; reqBody: string | null }) {
    return (
        <div className="space-y-4">
            <Section title="Metadata">
                <KvList
                    rows={[
                        ["ID", entry.id],
                        ["Request", entry.requestName ?? "—"],
                        ["Collection", entry.collectionPath ?? "—"],
                        ["Started", new Date(entry.startedAtMs).toISOString()],
                        ["Finished", entry.finishedAtMs ? new Date(entry.finishedAtMs).toISOString() : "—"],
                        ["Replay of", entry.replayOfId ?? "—"],
                        ["Tags", entry.tags ?? "—"],
                        ["Payload hash", entry.payloadSha256 ?? "—"],
                    ]}
                />
            </Section>
            {entry.headers.length > 0 && (
                <Section title="Headers">
                    <KvList rows={entry.headers} mono />
                </Section>
            )}
            {entry.params.length > 0 && (
                <Section title="Query params">
                    <KvList rows={entry.params} mono />
                </Section>
            )}
            {entry.envSnapshot.length > 0 && (
                <Section
                    title={`Environment snapshot${entry.envActive ? ` (${entry.envActive})` : ""}`}
                >
                    <KvList rows={entry.envSnapshot} mono />
                </Section>
            )}
            {!isWs(entry) && (
                <Section title="Body">
                    <BodyView
                        text={reqBody}
                        size={entry.bodySizeBytes ?? 0}
                        bodyType={entry.bodyType}
                    />
                </Section>
            )}
        </div>
    );
}

function ResponseDetail({ entry, respBody }: { entry: HistoryEntry; respBody: string | null }) {
    if (entry.error) {
        return (
            <div className="rounded-md border border-rose-500/30 bg-rose-500/5 p-3 text-[12px] text-rose-600 dark:text-rose-400">
                <div className="mb-1 font-semibold">Request failed</div>
                <div className="whitespace-pre-wrap font-mono text-[11px]">{entry.error}</div>
            </div>
        );
    }
    if (isWs(entry)) {
        return (
            <div className="space-y-4">
                <Section title="WebSocket close">
                    <KvList
                        rows={[
                            ["Close code", entry.status?.toString() ?? "—"],
                            ["Close reason", entry.statusText ?? "—"],
                        ]}
                    />
                </Section>
                <p className="text-[11px] italic text-muted-foreground/70">
                    Individual WS messages are recorded in the
                    <code className="mx-1 rounded bg-muted px-1">ws_message</code>
                    table but not yet displayed inline here.
                </p>
            </div>
        );
    }
    return (
        <div className="space-y-4">
            <Section title="Status">
                <KvList
                    rows={[
                        ["Status", `${entry.status ?? "—"} ${entry.statusText ?? ""}`.trim()],
                        ["Duration", entry.responseTimeMs != null ? `${entry.responseTimeMs} ms` : "—"],
                        ["Size", formatBytes(entry.responseSizeBytes)],
                        ["Truncated", entry.responseTruncated ? "yes" : "no"],
                    ]}
                />
            </Section>
            {entry.responseHeaders.length > 0 && (
                <Section title="Response headers">
                    <KvList rows={entry.responseHeaders} mono />
                </Section>
            )}
            <Section title="Response body">
                <BodyView text={respBody} size={entry.responseSizeBytes ?? 0} />
            </Section>
        </div>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div>
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
                {title}
            </div>
            {children}
        </div>
    );
}

function KvList({ rows, mono }: { rows: [string, string][]; mono?: boolean }) {
    if (rows.length === 0) {
        return <p className="text-[12px] italic text-muted-foreground/60">(empty)</p>;
    }
    return (
        <div className="overflow-hidden rounded-md border border-border">
            <table className="w-full table-fixed border-collapse text-[11px]">
                <tbody>
                    {rows.map(([k, v], i) => (
                        <tr key={`${k}-${i}`} className="border-b border-border/40 last:border-b-0">
                            <td className="w-1/3 break-words bg-muted/30 px-2 py-1 align-top font-medium text-foreground/80">
                                {k}
                            </td>
                            <td
                                className={cn(
                                    "break-all px-2 py-1 align-top text-foreground/90",
                                    mono && "font-mono",
                                )}
                            >
                                {v}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function BodyView({
    text,
    size,
    bodyType,
}: {
    text: string | null;
    size: number;
    bodyType?: string | null;
}) {
    if (size === 0 && !text) {
        return <p className="text-[12px] italic text-muted-foreground/60">(empty body)</p>;
    }
    if (text == null) {
        return (
            <p className="text-[12px] italic text-muted-foreground/60">
                [payload not loaded, {formatBytes(size)}]
            </p>
        );
    }
    let display = text;
    if (!bodyType || /json/i.test(bodyType)) {
        try {
            const parsed = JSON.parse(text);
            display = JSON.stringify(parsed, null, 2);
        } catch {
            // not valid JSON; render as-is
        }
    }
    return (
        <pre className="max-h-[40vh] overflow-auto rounded-md border border-border bg-muted/30 p-2 font-mono text-[11px] leading-relaxed text-foreground/90 whitespace-pre-wrap break-all">
            {display}
        </pre>
    );
}
