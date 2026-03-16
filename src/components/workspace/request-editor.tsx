"use client";

import type { AuthConfig, HistoryEntry, HttpMethod } from "@/lib/types";
import {
    getRequestDetails,
    updateRequest,
    type RequestDetails,
    type RequestHeaderDetail,
    type RequestParamDetail,
} from "@/lib/collections";
import { sendHttpRequest, cancelHttpRequest, type HttpResponse } from "@/lib/http";
import { getAuthConfig, saveAuthConfig } from "@/lib/settings";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { EnvFile } from "@/lib/environments";
import { EnvVarInput, EnvVarText } from "./env-var-input";
import { Check, ChevronDown, ChevronUp, ClipboardCopy, Loader2, Send, Trash2 } from "lucide-react";
import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { Light as SyntaxHighlighter } from "react-syntax-highlighter";
import json from "react-syntax-highlighter/dist/esm/languages/hljs/json";
import xml from "react-syntax-highlighter/dist/esm/languages/hljs/xml";
import { githubGist } from "react-syntax-highlighter/dist/esm/styles/hljs";

SyntaxHighlighter.registerLanguage("json", json);
SyntaxHighlighter.registerLanguage("xml", xml);

const METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

const METHOD_COLORS: Record<string, string> = {
    GET: "text-emerald-600",
    POST: "text-amber-600",
    PUT: "text-blue-600",
    PATCH: "text-violet-600",
    DELETE: "text-red-600",
    HEAD: "text-muted-foreground",
    OPTIONS: "text-muted-foreground",
    WS: "text-purple-600",
};

const METHOD_BG: Record<string, string> = {
    GET: "bg-emerald-600",
    POST: "bg-amber-600",
    PUT: "bg-blue-600",
    PATCH: "bg-violet-600",
    DELETE: "bg-red-600",
    HEAD: "bg-muted-foreground",
    OPTIONS: "bg-muted-foreground",
    WS: "bg-purple-600",
};

type RequestTab = "params" | "auth" | "headers" | "body" | "pre-req" | "tests" | "settings";

type ResponseTab = "pretty" | "raw" | "headers";

const RESPONSE_TABS: { id: ResponseTab; label: string }[] = [
    { id: "pretty", label: "Pretty" },
    { id: "raw", label: "Raw" },
    { id: "headers", label: "Headers" },
];

/**
 * Replace `{{varName}}` placeholders with their resolved values from
 * enabled environment files.  Unresolved variables are left as-is.
 */
function substituteEnvVars(text: string, environments: EnvFile[]): string {
    return text.replace(/\{\{([^}]+)\}\}/g, (_match, varName: string) => {
        for (const env of environments) {
            if (!env.isEnabled) continue;
            for (const v of env.variables) {
                if (v.key === varName && v.enabled) return v.value;
            }
        }
        return _match; // leave unresolved
    });
}

/** Pretty-print JSON if possible, otherwise return raw text. */
function tryPrettyJson(text: string): { formatted: string; isJson: boolean } {
    try {
        const parsed = JSON.parse(text);
        return { formatted: JSON.stringify(parsed, null, 2), isJson: true };
    } catch {
        return { formatted: text, isJson: false };
    }
}

/** Human-readable byte size. */
function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function statusColor(code: number): string {
    if (code < 300) return "text-emerald-500";
    if (code < 400) return "text-amber-500";
    return "text-red-500";
}

interface KVRow {
    key: string;
    value: string;
    enabled: boolean;
}

function KVValueCell({
    value,
    onChange,
    environments,
    onOpenEnvTab,
}: {
    value: string;
    onChange: (val: string) => void;
    environments?: EnvFile[];
    onOpenEnvTab?: (envName: string) => void;
}) {
    const [isFocused, setIsFocused] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const hasVars = /\{\{[^}]+\}\}/.test(value);

    return (
        <div className="relative border-l border-border">
            <input
                ref={inputRef}
                className={cn(
                    "w-full bg-transparent px-3 py-2 text-[13px] outline-none placeholder:text-muted-foreground/30 focus:bg-muted/30 transition-colors",
                    !isFocused && hasVars && "text-transparent caret-transparent"
                )}
                placeholder="Value"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
            />
            {!isFocused && hasVars && environments && (
                <div
                    className="pointer-events-auto absolute inset-0 flex items-center overflow-hidden px-3 py-2 text-[13px]"
                    onClick={(e) => {
                        if ((e.target as HTMLElement).closest("[data-env-badge]")) return;
                        inputRef.current?.focus();
                    }}
                >
                    <EnvVarText
                        text={value}
                        environments={environments}
                        onOpenEnvTab={onOpenEnvTab}
                    />
                </div>
            )}
        </div>
    );
}

function KVTable({
    rows,
    onUpdate,
    onRemove,
    onAdd,
    environments,
    onOpenEnvTab,
}: {
    rows: KVRow[];
    onUpdate: (index: number, field: "key" | "value", val: string) => void;
    onRemove: (index: number) => void;
    onAdd: () => void;
    environments?: EnvFile[];
    onOpenEnvTab?: (envName: string) => void;
}) {
    return (
        <div className="overflow-hidden rounded-lg border border-border">
            <div className="grid grid-cols-[32px_1fr_1fr_40px] bg-muted/40 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                <div className="px-2 py-2" />
                <div className="px-3 py-2">Key</div>
                <div className="border-l border-border px-3 py-2">Value</div>
                <div className="border-l border-border px-3 py-2" />
            </div>
            {rows.map((row, i) => (
                <div key={i} className="grid grid-cols-[32px_1fr_1fr_40px] border-t border-border group">
                    <div className="flex items-center justify-center">
                        <input
                            type="checkbox"
                            checked={row.enabled}
                            onChange={() => onUpdate(i, "key", row.key)} // toggle handled via parent
                            className="accent-primary size-3.5"
                            title="Enable/disable"
                        />
                    </div>
                    <input
                        className="bg-transparent px-3 py-2 text-[13px] outline-none placeholder:text-muted-foreground/30 focus:bg-muted/30 transition-colors"
                        placeholder="Key"
                        value={row.key}
                        onChange={(e) => onUpdate(i, "key", e.target.value)}
                    />
                    <KVValueCell
                        value={row.value}
                        onChange={(val) => onUpdate(i, "value", val)}
                        environments={environments}
                        onOpenEnvTab={onOpenEnvTab}
                    />
                    <div className="flex items-center justify-center border-l border-border">
                        <button
                            onClick={() => onRemove(i)}
                            className="text-muted-foreground/30 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                        >
                            <Trash2 className="size-3.5" />
                        </button>
                    </div>
                </div>
            ))}
            <div className="border-t border-border">
                <button
                    onClick={onAdd}
                    className="w-full px-3 py-2 text-[12px] text-muted-foreground/50 hover:text-foreground hover:bg-muted/30 transition-colors cursor-pointer text-left"
                >
                    + Add row
                </button>
            </div>
        </div>
    );
}

interface RequestEditorProps {
    requestId: string | null;
    collectionRelPath: string | null;
    workspacePath: string | null;
    environments?: EnvFile[];
    onOpenEnvTab?: (envName: string) => void;
    onHistoryEntry?: (entry: HistoryEntry) => void;
}

const AUTH_TYPES: { value: AuthConfig["type"]; label: string }[] = [
    { value: "none", label: "No Auth" },
    { value: "bearer", label: "Bearer Token" },
    { value: "basic", label: "Basic Auth" },
    { value: "apikey", label: "API Key" },
];

export function RequestEditor({ requestId, collectionRelPath, workspacePath, environments, onOpenEnvTab, onHistoryEntry }: RequestEditorProps) {
    const [details, setDetails] = useState<RequestDetails | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [method, setMethod] = useState<HttpMethod>("GET");
    const [url, setUrl] = useState("");
    const [headers, setHeaders] = useState<KVRow[]>([]);
    const [params, setParams] = useState<KVRow[]>([]);
    const [bodyType, setBodyType] = useState("none");
    const [bodyContent, setBodyContent] = useState("");
    const [verifySsl, setVerifySsl] = useState(false);
    const [proxyUrl, setProxyUrl] = useState("");
    const [authConfig, setAuthConfig] = useState<AuthConfig>({ type: "none" });

    const [activeRequestTab, setActiveRequestTab] = useState<RequestTab>("params");
    const [activeResponseTab, setActiveResponseTab] = useState<ResponseTab>("pretty");
    const [showMethodDropdown, setShowMethodDropdown] = useState(false);

    // Response state
    const [responseData, setResponseData] = useState<HttpResponse | null>(null);
    const [isSending, setIsSending] = useState(false);
    const [currentRequestId, setCurrentRequestId] = useState<string | null>(null);
    const [sendError, setSendError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [progress, setProgress] = useState<{ bytesRead: number; totalBytes: number | null } | null>(null);
    const [streamingBody, setStreamingBody] = useState<string>("");

    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Load request details when selection changes
    useEffect(() => {
        if (!requestId || !collectionRelPath || !workspacePath) {
            setDetails(null);
            return;
        }

        let cancelled = false;
        setIsLoading(true);
        setError(null);

        getRequestDetails(workspacePath, collectionRelPath, requestId)
            .then((data) => {
                if (cancelled) return;
                setDetails(data);
                setMethod(data.method);
                setUrl(data.url);
                setHeaders(
                    data.headers.length > 0
                        ? data.headers.map((h) => ({ key: h.key, value: h.value, enabled: h.enabled }))
                        : []
                );
                setParams(
                    data.params.length > 0
                        ? data.params.map((p) => ({ key: p.key, value: p.value, enabled: p.enabled }))
                        : []
                );
                setBodyType(data.body.type);
                setBodyContent(data.body.content);
                setVerifySsl(data.settings?.verifySsl ?? false);
                setProxyUrl(data.settings?.proxyUrl ?? "");
            })
            .catch((err) => {
                if (cancelled) return;
                setError(err instanceof Error ? err.message : String(err));
            })
            .finally(() => {
                if (!cancelled) setIsLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [requestId, collectionRelPath, workspacePath]);

    // Load auth config when request changes
    useEffect(() => {
        if (!requestId) {
            setAuthConfig({ type: "none" });
            return;
        }
        let cancelled = false;
        getAuthConfig(requestId).then((config) => {
            if (!cancelled) setAuthConfig(config);
        });
        return () => { cancelled = true; };
    }, [requestId]);

    // Debounced save helper
    const scheduleSave = useCallback(
        (patch: Record<string, unknown>) => {
            if (!workspacePath || !collectionRelPath || !requestId) return;
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
            saveTimerRef.current = setTimeout(() => {
                updateRequest(workspacePath, collectionRelPath, requestId, patch).catch((err) =>
                    console.error("Failed to save request:", err)
                );
            }, 500);
        },
        [workspacePath, collectionRelPath, requestId]
    );

    const handleMethodChange = useCallback(
        (m: HttpMethod) => {
            setMethod(m);
            setShowMethodDropdown(false);
            scheduleSave({ method: m });
        },
        [scheduleSave]
    );

    const handleUrlChange = useCallback(
        (newUrl: string) => {
            setUrl(newUrl);
            scheduleSave({ url: newUrl });
        },
        [scheduleSave]
    );

    const serializeHeaders = useCallback(
        (rows: KVRow[]) =>
            rows
                .filter((r) => r.key.trim() !== "" || r.value.trim() !== "")
                .map((r) => ({ key: r.key, value: r.value, enabled: r.enabled })),
        []
    );

    const serializeParams = useCallback(
        (rows: KVRow[]) =>
            rows
                .filter((r) => r.key.trim() !== "" || r.value.trim() !== "")
                .map((r) => ({ key: r.key, value: r.value, enabled: r.enabled })),
        []
    );

    const handleHeaderUpdate = useCallback(
        (index: number, field: "key" | "value", val: string) => {
            setHeaders((prev) => {
                const next = prev.map((r, i) => (i === index ? { ...r, [field]: val } : r));
                scheduleSave({ headers: serializeHeaders(next) });
                return next;
            });
        },
        [scheduleSave, serializeHeaders]
    );

    const handleHeaderRemove = useCallback(
        (index: number) => {
            setHeaders((prev) => {
                const next = prev.filter((_, i) => i !== index);
                scheduleSave({ headers: serializeHeaders(next) });
                return next;
            });
        },
        [scheduleSave, serializeHeaders]
    );

    const handleHeaderAdd = useCallback(() => {
        setHeaders((prev) => [...prev, { key: "", value: "", enabled: true }]);
    }, []);

    const handleParamUpdate = useCallback(
        (index: number, field: "key" | "value", val: string) => {
            setParams((prev) => {
                const next = prev.map((r, i) => (i === index ? { ...r, [field]: val } : r));
                scheduleSave({ params: serializeParams(next) });
                return next;
            });
        },
        [scheduleSave, serializeParams]
    );

    const handleParamRemove = useCallback(
        (index: number) => {
            setParams((prev) => {
                const next = prev.filter((_, i) => i !== index);
                scheduleSave({ params: serializeParams(next) });
                return next;
            });
        },
        [scheduleSave, serializeParams]
    );

    const handleParamAdd = useCallback(() => {
        setParams((prev) => [...prev, { key: "", value: "", enabled: true }]);
    }, []);

    const handleBodyTypeChange = useCallback(
        (newType: string) => {
            setBodyType(newType);
            scheduleSave({ body: { type: newType, content: bodyContent } });
        },
        [scheduleSave, bodyContent]
    );

    const handleBodyContentChange = useCallback(
        (newContent: string) => {
            setBodyContent(newContent);
            scheduleSave({ body: { type: bodyType, content: newContent } });
        },
        [scheduleSave, bodyType]
    );

    const handleVerifySslChange = useCallback(
        (val: boolean) => {
            setVerifySsl(val);
            scheduleSave({ settings: { verifySsl: val, proxyUrl } });
        },
        [scheduleSave, proxyUrl]
    );

    const handleProxyUrlChange = useCallback(
        (val: string) => {
            setProxyUrl(val);
            scheduleSave({ settings: { verifySsl, proxyUrl: val } });
        },
        [scheduleSave, verifySsl]
    );

    const handleAuthChange = useCallback(
        (config: AuthConfig) => {
            setAuthConfig(config);
            if (requestId) {
                saveAuthConfig(requestId, config);
            }
        },
        [requestId]
    );

    /** Convert current auth config into headers / query params for the request. */
    function buildAuthHeaders(config: AuthConfig, sub: (s: string) => string): { key: string; value: string; enabled: boolean }[] {
        switch (config.type) {
            case "bearer": {
                const prefix = config.prefix.trim() || "Bearer";
                return [{ key: "Authorization", value: `${sub(prefix)} ${sub(config.token)}`, enabled: true }];
            }
            case "basic": {
                const credentials = `${sub(config.username)}:${sub(config.password)}`;
                const bytes = new TextEncoder().encode(credentials);
                const binary = Array.from(bytes, (b) => String.fromCodePoint(b)).join("");
                const encoded = btoa(binary);
                return [{ key: "Authorization", value: `Basic ${encoded}`, enabled: true }];
            }
            case "apikey": {
                if (config.addTo === "header") {
                    return [{ key: sub(config.key), value: sub(config.value), enabled: true }];
                }
                return []; // query params handled separately
            }
            default:
                return [];
        }
    }

    function buildAuthParams(config: AuthConfig, sub: (s: string) => string): { key: string; value: string; enabled: boolean }[] {
        if (config.type === "apikey" && config.addTo === "query") {
            return [{ key: sub(config.key), value: sub(config.value), enabled: true }];
        }
        return [];
    }

    // ── Send request handler ────────────────────────────────────────────
    const handleSend = useCallback(async () => {
        if (!url.trim()) return;

        const envs = environments ?? [];
        const sub = (text: string) => substituteEnvVars(text, envs);

        // Build auth headers/params
        const authHeaders = buildAuthHeaders(authConfig, sub);
        const authParams = buildAuthParams(authConfig, sub);

        const reqId = crypto.randomUUID();
        setCurrentRequestId(reqId);
        setIsSending(true);
        setSendError(null);
        setProgress(null);
        setStreamingBody("");

        let unlistenProgress: (() => void) | null = null;
        let unlistenChunk: (() => void) | null = null;

        try {
            const { listen } = await import("@tauri-apps/api/event");
            unlistenProgress = await listen<{ requestId: string; bytesRead: number; totalBytes: number | null }>(
                "http-progress",
                (event) => {
                    if (event.payload.requestId === reqId) {
                        setProgress({
                            bytesRead: event.payload.bytesRead,
                            totalBytes: event.payload.totalBytes,
                        });
                    }
                }
            );
            unlistenChunk = await listen<{ requestId: string; chunk: string }>(
                "http-chunk",
                (event) => {
                    if (event.payload.requestId === reqId) {
                        setStreamingBody((prev) => prev + event.payload.chunk);
                        setIsCollapsed(false);
                    }
                }
            );

            const userHeaders = headers
                .filter((h) => h.key.trim() !== "" || h.value.trim() !== "")
                .map((h) => ({ key: sub(h.key), value: sub(h.value), enabled: h.enabled }));
            const userParams = params
                .filter((p) => p.key.trim() !== "" || p.value.trim() !== "")
                .map((p) => ({ key: sub(p.key), value: sub(p.value), enabled: p.enabled }));

            const result = await sendHttpRequest({
                requestId: reqId,
                method,
                url: sub(url),
                headers: [...userHeaders, ...authHeaders],
                params: [...userParams, ...authParams],
                body: { type: bodyType, content: sub(bodyContent) },
                settings: { verifySsl, proxyUrl: proxyUrl.trim() || null },
            });
            setResponseData(result);
            setStreamingBody("");
            setIsCollapsed(false);

            // Record to history
            onHistoryEntry?.({
                id: reqId,
                method,
                url: sub(url),
                status: result.status,
                statusText: result.statusText,
                timeMs: result.timeMs,
                timestamp: new Date().toISOString(),
            });
        } catch (err: unknown) {
            let msg: string;
            if (err instanceof Error) {
                msg = err.message;
            } else if (typeof err === "string") {
                msg = err;
            } else if (typeof err === "object" && err !== null && "message" in err) {
                msg = String((err as { message: unknown }).message);
            } else {
                msg = "An unknown error occurred.";
            }
            setSendError(msg);
            setResponseData(null);
            setStreamingBody("");
            setIsCollapsed(false);

            // Record failed requests to history too
            onHistoryEntry?.({
                id: reqId,
                method,
                url: sub(url),
                status: null,
                statusText: null,
                timeMs: null,
                timestamp: new Date().toISOString(),
            });
        } finally {
            if (unlistenProgress) unlistenProgress();
            if (unlistenChunk) unlistenChunk();
            setIsSending(false);
            setCurrentRequestId(null);
            setProgress(null);
        }
    }, [method, url, headers, params, bodyType, bodyContent, environments, verifySsl, proxyUrl, authConfig, onHistoryEntry]);

    const handleCancel = useCallback(async () => {
        if (currentRequestId) {
            try {
                await cancelHttpRequest(currentRequestId);
            } catch (err) {
                console.error("Failed to cancel request:", err);
            }
        }
    }, [currentRequestId]);

    // Formatted response for Pretty tab
    const prettyResponse = useMemo(() => {
        if (!responseData) return null;
        if (responseData.isBinary) return { formatted: "<Binary Data>", isJson: false };
        return tryPrettyJson(responseData.body);
    }, [responseData]);

    const HEADER_HEIGHT = 36;
    const MIN_HEIGHT = 120;
    const DEFAULT_HEIGHT = 280;
    const [responseHeight, setResponseHeight] = useState(DEFAULT_HEIGHT);
    const [isCollapsed, setIsCollapsed] = useState(true);
    const isResizing = useRef(false);
    const lastExpandedHeight = useRef(DEFAULT_HEIGHT);
    const containerRef = useRef<HTMLDivElement>(null);

    const toggleCollapse = useCallback(() => {
      setIsCollapsed((prev) => {
        if (!prev) {
          lastExpandedHeight.current = responseHeight;
        } else {
          setResponseHeight(lastExpandedHeight.current);
        }
        return !prev;
      });
    }, [responseHeight]);

    const startVerticalResize = useCallback(
      (e: React.MouseEvent) => {
        if (isCollapsed) return;
        e.preventDefault();
        isResizing.current = true;
        const startY = e.clientY;
        const containerHeight = containerRef.current?.parentElement?.getBoundingClientRect().height ?? 600;

        const panelEl = e.currentTarget.parentElement;
        const startH = panelEl ? panelEl.getBoundingClientRect().height : responseHeight;

        const onMouseMove = (ev: MouseEvent) => {
          if (!isResizing.current) return;
          const delta = startY - ev.clientY;
          const maxH = containerHeight - 80;
          const newH = Math.min(maxH, Math.max(MIN_HEIGHT, startH + delta));
          setResponseHeight(newH);
        };

        const onMouseUp = () => {
          isResizing.current = false;
          document.removeEventListener("mousemove", onMouseMove);
          document.removeEventListener("mouseup", onMouseUp);
          document.body.style.cursor = "";
          document.body.style.userSelect = "";
        };

        document.body.style.cursor = "row-resize";
        document.body.style.userSelect = "none";
        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
      },
      [isCollapsed, responseHeight]
    );

    // Compute dynamic tab counts
    const headerCount = headers.filter((h) => h.key.trim() !== "").length;
    const paramCount = params.filter((p) => p.key.trim() !== "").length;

    const REQUEST_TABS: { id: RequestTab; label: string; count?: number }[] = [
        { id: "params", label: "Params", count: paramCount || undefined },
        { id: "auth", label: "Auth" },
        { id: "headers", label: "Headers", count: headerCount || undefined },
        { id: "body", label: "Body" },
        { id: "pre-req", label: "Pre-req." },
        { id: "tests", label: "Tests" },
        { id: "settings", label: "Settings" },
    ];

    if (!requestId) {
        return (
            <div className="flex h-full items-center justify-center select-none">
                <div className="text-center">
                    <p className="text-base font-medium text-foreground/60">No request selected</p>
                    <p className="mt-1.5 text-sm text-muted-foreground/50">
                        Select a request from the collection or create a new one.
                    </p>
                </div>
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className="flex h-full items-center justify-center select-none">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex h-full items-center justify-center select-none">
                <div className="text-center">
                    <p className="text-base font-medium text-red-500">Failed to load request</p>
                    <p className="mt-1.5 text-sm text-muted-foreground/50">{error}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-full flex-col select-none">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                <div className="relative">
                    <button
                        onClick={() => setShowMethodDropdown(!showMethodDropdown)}
                        className={cn(
                            "flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-[13px] font-bold",
                            "hover:bg-muted/50 transition-colors duration-150 cursor-pointer",
                            METHOD_COLORS[method]
                        )}
                    >
                        {method}
                        <span className="ml-0.5 text-[10px] text-muted-foreground/50">▾</span>
                    </button>
                    {showMethodDropdown && (
                        <div className="absolute left-0 top-full z-20 mt-1 w-28 rounded-lg border border-border bg-popover p-1 shadow-lg">
                            {METHODS.map((m) => (
                                <button
                                    key={m}
                                    onClick={() => handleMethodChange(m)}
                                    className={cn(
                                        "flex w-full items-center rounded-md px-2.5 py-1.5 text-[13px] font-bold transition-colors duration-150",
                                        "hover:bg-muted/60 cursor-pointer",
                                        METHOD_COLORS[m]
                                    )}
                                >
                                    {m}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <EnvVarInput
                    value={url}
                    onChange={handleUrlChange}
                    placeholder="Enter request URL"
                    className="flex-1"
                    environments={environments ?? []}
                    onOpenEnvTab={onOpenEnvTab}
                />

                {isSending ? (
                    <button
                        onClick={handleCancel}
                        className={cn(
                            "flex h-8 items-center gap-2 rounded-lg px-4 text-[13px] font-medium text-white",
                            "transition-all duration-150 cursor-pointer shadow-sm",
                            "hover:shadow-md active:scale-[0.98]",
                            "bg-red-600 hover:bg-red-700"
                        )}
                    >
                        <Loader2 className="size-3.5 animate-spin" />
                        Cancel
                    </button>
                ) : (
                    <button
                        onClick={handleSend}
                        disabled={isSending}
                        className={cn(
                            "flex h-8 items-center gap-2 rounded-lg px-4 text-[13px] font-medium text-white",
                            "transition-all duration-150 cursor-pointer shadow-sm",
                            "hover:shadow-md active:scale-[0.98]",
                            METHOD_BG[method]
                        )}
                    >
                        <Send className="size-3.5" />
                        Send
                    </button>
                )}
            </div>

            <div className="flex flex-1 flex-col overflow-hidden">
                <div className="flex items-center gap-0 border-b border-border px-4">
                    {REQUEST_TABS.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveRequestTab(tab.id)}
                            className={cn(
                                "relative flex items-center gap-1.5 px-3 py-2.5 text-[13px] cursor-pointer",
                                "transition-colors duration-150",
                                activeRequestTab === tab.id
                                    ? "text-foreground after:absolute after:bottom-0 after:left-1 after:right-1 after:h-[2px] after:rounded-full after:bg-primary"
                                    : "text-muted-foreground/60 hover:text-foreground"
                            )}
                        >
                            {tab.label}
                            {tab.count != null && (
                                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground/70">
                                    {tab.count}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
                <div className="flex-1 overflow-auto">
                    {activeRequestTab === "params" && (
                        <div className="p-4">
                            <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                                Query Params
                            </h3>
                            <KVTable
                                rows={params}
                                onUpdate={handleParamUpdate}
                                onRemove={handleParamRemove}
                                onAdd={handleParamAdd}
                                environments={environments}
                                onOpenEnvTab={onOpenEnvTab}
                            />
                        </div>
                    )}
                    {activeRequestTab === "headers" && (
                        <div className="p-4">
                            <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                                Headers
                            </h3>
                            <KVTable
                                rows={headers}
                                onUpdate={handleHeaderUpdate}
                                onRemove={handleHeaderRemove}
                                onAdd={handleHeaderAdd}
                                environments={environments}
                                onOpenEnvTab={onOpenEnvTab}
                            />
                        </div>
                    )}
                    {activeRequestTab === "body" && (
                        <div className="p-4">
                            <div className="flex items-center gap-3 mb-3">
                                {["none", "json", "text", "form-data", "x-www-form-urlencoded"].map((t) => (
                                    <label key={t} className="flex items-center gap-1.5 text-[13px] text-muted-foreground/70 cursor-pointer hover:text-foreground transition-colors duration-150">
                                        <input
                                            type="radio"
                                            name="body-type"
                                            checked={bodyType === t}
                                            onChange={() => handleBodyTypeChange(t)}
                                            className="accent-primary"
                                        />
                                        {t}
                                    </label>
                                ))}
                            </div>
                            {bodyType === "none" ? (
                                <div className="rounded-lg border border-border bg-muted/30 p-4 text-[13px] text-muted-foreground/50 italic">
                                    No body for this request.
                                </div>
                            ) : (
                                <textarea
                                    value={bodyContent}
                                    onChange={(e) => handleBodyContentChange(e.target.value)}
                                    className="w-full min-h-[200px] rounded-lg border border-border bg-background p-3 text-[13px] font-mono outline-none transition-shadow duration-150 focus:ring-1 focus:ring-ring/40 resize-y"
                                    placeholder={bodyType === "json" ? '{\n  "key": "value"\n}' : "Enter request body..."}
                                />
                            )}
                        </div>
                    )}
                    {activeRequestTab === "auth" && (
                        <div className="p-4 space-y-4">
                            <div>
                                <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                                    Authorization
                                </h3>
                                <div className="flex items-center gap-3 mb-4">
                                    {AUTH_TYPES.map((at) => (
                                        <label key={at.value} className="flex items-center gap-1.5 text-[13px] text-muted-foreground/70 cursor-pointer hover:text-foreground transition-colors duration-150">
                                            <input
                                                type="radio"
                                                name="auth-type"
                                                checked={authConfig.type === at.value}
                                                onChange={() => {
                                                    let next: AuthConfig;
                                                    switch (at.value) {
                                                        case "bearer":
                                                            next = { type: "bearer", token: "", prefix: "Bearer" };
                                                            break;
                                                        case "basic":
                                                            next = { type: "basic", username: "", password: "" };
                                                            break;
                                                        case "apikey":
                                                            next = { type: "apikey", key: "", value: "", addTo: "header" };
                                                            break;
                                                        default:
                                                            next = { type: "none" };
                                                    }
                                                    handleAuthChange(next);
                                                }}
                                                className="accent-primary"
                                            />
                                            {at.label}
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {authConfig.type === "bearer" && (
                                <div className="space-y-3 max-w-lg">
                                    <div>
                                        <label className="block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-1.5">
                                            Prefix
                                        </label>
                                        <input
                                            type="text"
                                            value={authConfig.prefix}
                                            onChange={(e) => handleAuthChange({ ...authConfig, prefix: e.target.value })}
                                            placeholder="Bearer"
                                            className="w-full rounded-md border border-border bg-transparent px-3 py-1.5 text-[13px] outline-none placeholder:text-muted-foreground/30 focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-1.5">
                                            Token
                                        </label>
                                        <input
                                            type="text"
                                            value={authConfig.token}
                                            onChange={(e) => handleAuthChange({ ...authConfig, token: e.target.value })}
                                            placeholder="Enter token..."
                                            className="w-full rounded-md border border-border bg-transparent px-3 py-1.5 text-[13px] font-mono outline-none placeholder:text-muted-foreground/30 focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
                                        />
                                        <p className="mt-1.5 text-[11px] text-muted-foreground/50">
                                            The token will be sent as <code className="rounded bg-muted px-1 py-0.5 text-[10px]">{authConfig.prefix || "Bearer"} &lt;token&gt;</code> in the Authorization header.
                                        </p>
                                    </div>
                                </div>
                            )}

                            {authConfig.type === "basic" && (
                                <div className="space-y-3 max-w-lg">
                                    <div>
                                        <label className="block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-1.5">
                                            Username
                                        </label>
                                        <input
                                            type="text"
                                            value={authConfig.username}
                                            onChange={(e) => handleAuthChange({ ...authConfig, username: e.target.value })}
                                            placeholder="Enter username..."
                                            className="w-full rounded-md border border-border bg-transparent px-3 py-1.5 text-[13px] outline-none placeholder:text-muted-foreground/30 focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-1.5">
                                            Password
                                        </label>
                                        <input
                                            type="password"
                                            value={authConfig.password}
                                            onChange={(e) => handleAuthChange({ ...authConfig, password: e.target.value })}
                                            placeholder="Enter password..."
                                            className="w-full rounded-md border border-border bg-transparent px-3 py-1.5 text-[13px] outline-none placeholder:text-muted-foreground/30 focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
                                        />
                                        <p className="mt-1.5 text-[11px] text-muted-foreground/50">
                                            Credentials will be Base64-encoded and sent as <code className="rounded bg-muted px-1 py-0.5 text-[10px]">Basic &lt;encoded&gt;</code> in the Authorization header.
                                        </p>
                                    </div>
                                </div>
                            )}

                            {authConfig.type === "apikey" && (
                                <div className="space-y-3 max-w-lg">
                                    <div>
                                        <label className="block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-1.5">
                                            Key
                                        </label>
                                        <input
                                            type="text"
                                            value={authConfig.key}
                                            onChange={(e) => handleAuthChange({ ...authConfig, key: e.target.value })}
                                            placeholder="e.g. X-API-Key"
                                            className="w-full rounded-md border border-border bg-transparent px-3 py-1.5 text-[13px] outline-none placeholder:text-muted-foreground/30 focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-1.5">
                                            Value
                                        </label>
                                        <input
                                            type="text"
                                            value={authConfig.value}
                                            onChange={(e) => handleAuthChange({ ...authConfig, value: e.target.value })}
                                            placeholder="Enter API key value..."
                                            className="w-full rounded-md border border-border bg-transparent px-3 py-1.5 text-[13px] font-mono outline-none placeholder:text-muted-foreground/30 focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-1.5">
                                            Add To
                                        </label>
                                        <div className="flex items-center gap-4">
                                            <label className="flex items-center gap-1.5 text-[13px] text-muted-foreground/70 cursor-pointer hover:text-foreground transition-colors duration-150">
                                                <input
                                                    type="radio"
                                                    name="apikey-addto"
                                                    checked={authConfig.addTo === "header"}
                                                    onChange={() => handleAuthChange({ ...authConfig, addTo: "header" })}
                                                    className="accent-primary"
                                                />
                                                Header
                                            </label>
                                            <label className="flex items-center gap-1.5 text-[13px] text-muted-foreground/70 cursor-pointer hover:text-foreground transition-colors duration-150">
                                                <input
                                                    type="radio"
                                                    name="apikey-addto"
                                                    checked={authConfig.addTo === "query"}
                                                    onChange={() => handleAuthChange({ ...authConfig, addTo: "query" })}
                                                    className="accent-primary"
                                                />
                                                Query Param
                                            </label>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {authConfig.type === "none" && (
                                <p className="text-[13px] text-muted-foreground/50 italic">
                                    This request does not use any authorization.
                                </p>
                            )}
                        </div>
                    )}
                    {(activeRequestTab === "pre-req" || activeRequestTab === "tests") && (
                        <div className="p-4 text-sm text-muted-foreground/50 italic">
                            Script editor will appear here.
                        </div>
                    )}
                    {activeRequestTab === "settings" && (
                        <div className="p-4 space-y-6">
                            <div>
                                <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                                    Security
                                </h3>
                                <label className="flex items-center gap-2 text-[13px] text-foreground/80 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={verifySsl}
                                        onChange={(e) => handleVerifySslChange(e.target.checked)}
                                        className="accent-primary size-3.5"
                                    />
                                    Verify SSL Certificates
                                </label>
                                <p className="mt-1 text-[11px] text-muted-foreground/50 ml-5.5">
                                    When disabled, invalid or self-signed certificates will be accepted.
                                </p>
                            </div>
                            <div>
                                <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                                    Proxy
                                </h3>
                                <div className="max-w-md">
                                    <input
                                        type="text"
                                        value={proxyUrl}
                                        onChange={(e) => handleProxyUrlChange(e.target.value)}
                                        placeholder="e.g. http://127.0.0.1:8080"
                                        className="w-full rounded-md border border-border bg-transparent px-3 py-1.5 text-[13px] outline-none placeholder:text-muted-foreground/30 focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
                                    />
                                    <p className="mt-1.5 text-[11px] text-muted-foreground/50">
                                        Leave blank to use no proxy. Supports HTTP, HTTPS, and SOCKS5.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div
                    ref={containerRef}
                    className={cn(
                      "relative flex flex-col border-t border-border shrink-0 overflow-hidden",
                      !isResizing.current && "transition-[height] duration-200 ease-out"
                    )}
                    style={{ height: isCollapsed ? HEADER_HEIGHT : responseHeight, minHeight: HEADER_HEIGHT }}
                >
                    {!isCollapsed && (
                      <div
                        onMouseDown={startVerticalResize}
                        className="absolute -top-[2px] left-0 right-0 z-10 h-[5px] cursor-row-resize
                          transition-colors duration-150 hover:bg-primary/20 active:bg-primary/40"
                      />
                    )}
                    <div
                        className="flex shrink-0 items-center justify-between border-b border-border px-4 cursor-pointer hover:bg-muted/30 transition-colors duration-150"
                        style={{ height: HEADER_HEIGHT }}
                        onClick={toggleCollapse}
                    >
                        <div className="flex items-center gap-1">
                            {isCollapsed ? (
                              <ChevronUp className="size-3.5 text-muted-foreground/50 mr-1" />
                            ) : (
                              <ChevronDown className="size-3.5 text-muted-foreground/50 mr-1" />
                            )}
                            {!isCollapsed && RESPONSE_TABS.map((tab) => (
                                <button
                                    key={tab.id}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setActiveResponseTab(tab.id);
                                    }}
                                    className={cn(
                                        "px-3 py-1.5 text-[13px] cursor-pointer transition-colors duration-150",
                                        activeResponseTab === tab.id
                                            ? "text-foreground font-medium"
                                            : "text-muted-foreground/60 hover:text-foreground"
                                    )}
                                >
                                    {tab.label}
                                </button>
                            ))}
                            {isCollapsed && (
                                <span className="text-[13px] font-medium text-muted-foreground/60">Response</span>
                            )}
                        </div>
                        <div className="flex items-center gap-3 text-[12px]">
                            {responseData ? (
                                <>
                                    <span className={cn("font-semibold", statusColor(responseData.status))}>
                                        {responseData.status} {responseData.statusText}
                                    </span>
                                    <span className="text-muted-foreground/60">{responseData.timeMs} ms</span>
                                    <span className="text-muted-foreground/60">{formatBytes(responseData.sizeBytes)}</span>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            const text = activeResponseTab === "headers"
                                                ? responseData.headers.map((h) => `${h.key}: ${h.value}`).join("\n")
                                                : activeResponseTab === "pretty"
                                                    ? (prettyResponse?.formatted ?? (responseData.isBinary ? responseData.bodyBase64 : responseData.body))
                                                    : (responseData.isBinary ? responseData.bodyBase64 : responseData.body);
                                            navigator.clipboard.writeText(text).then(() => {
                                                setCopied(true);
                                                setTimeout(() => setCopied(false), 1500);
                                            });
                                        }}
                                        className="ml-1 flex items-center gap-1 rounded px-1.5 py-0.5 text-muted-foreground/50 hover:text-foreground hover:bg-muted/50 transition-colors cursor-pointer"
                                        title="Copy response"
                                    >
                                        {copied ? <Check className="size-3" /> : <ClipboardCopy className="size-3" />}
                                        <span className="text-[11px]">{copied ? "Copied" : "Copy"}</span>
                                    </button>
                                </>
                            ) : sendError ? (
                                <>
                                    <span className="text-red-500 font-medium">Error</span>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            navigator.clipboard.writeText(sendError).then(() => {
                                                setCopied(true);
                                                setTimeout(() => setCopied(false), 1500);
                                            });
                                        }}
                                        className="ml-1 flex items-center gap-1 rounded px-1.5 py-0.5 text-muted-foreground/50 hover:text-foreground hover:bg-muted/50 transition-colors cursor-pointer"
                                        title="Copy error"
                                    >
                                        {copied ? <Check className="size-3" /> : <ClipboardCopy className="size-3" />}
                                        <span className="text-[11px]">{copied ? "Copied" : "Copy"}</span>
                                    </button>
                                </>
                            ) : (
                                <span className="text-muted-foreground/50 italic">No response yet</span>
                            )}
                        </div>
                    </div>

                    {!isCollapsed && (
                      <ScrollArea className="min-h-0 flex-1 bg-muted/20">
                          {isSending ? (
                              <div className="flex flex-col h-full">
                                  <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50">
                                      <Loader2 className="size-4 animate-spin text-muted-foreground shrink-0" />
                                      {progress && (
                                          <div className="flex items-center gap-2 flex-1 min-w-0">
                                              <div className="w-32 h-1.5 bg-muted rounded-full overflow-hidden shrink-0">
                                                  <div 
                                                      className={cn(
                                                          "h-full bg-primary transition-all duration-200",
                                                          !progress.totalBytes && "animate-pulse"
                                                      )}
                                                      style={{ 
                                                          width: progress.totalBytes 
                                                              ? `${Math.min(100, (progress.bytesRead / progress.totalBytes) * 100)}%` 
                                                              : '100%'
                                                      }}
                                                  />
                                              </div>
                                              <span className="text-[11px] text-muted-foreground/70 whitespace-nowrap">
                                                  {formatBytes(progress.bytesRead)} {progress.totalBytes ? `/ ${formatBytes(progress.totalBytes)}` : 'downloaded'}
                                              </span>
                                          </div>
                                      )}
                                      {!progress && (
                                          <span className="text-[12px] text-muted-foreground/60">Sending request…</span>
                                      )}
                                  </div>
                                  {streamingBody && (
                                      <pre className="whitespace-pre-wrap break-all p-4 font-mono text-[13px] leading-relaxed text-foreground/90 select-text flex-1">
                                          {streamingBody}
                                      </pre>
                                  )}
                              </div>
                          ) : sendError ? (
                              <div className="p-4">
                                  <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4 text-[13px] text-red-500">
                                      {sendError}
                                  </div>
                              </div>
                          ) : responseData ? (
                              <>
                                  {activeResponseTab === "pretty" && (
                                      <div className="p-4 text-[13px] select-text [&_.linenumber]:!select-none [&_.linenumber]:!-mr-[1em] [&_code]:!select-text">
                                          <SyntaxHighlighter
                                              language={prettyResponse?.isJson ? "json" : "xml"}
                                              style={githubGist}
                                              customStyle={{
                                                  margin: 0,
                                                  padding: 0,
                                                  background: "transparent",
                                                  fontSize: "13px",
                                                  lineHeight: "1.5",
                                                  fontFamily: "var(--font-mono)",
                                              }}
                                              showLineNumbers={true}
                                              lineNumberStyle={{
                                                  minWidth: "2.5em",
                                                  paddingRight: "1em",
                                                  color: "var(--muted-foreground)",
                                                  opacity: 0.35,
                                                  textAlign: "right",
                                                  userSelect: "none",
                                                  MozUserSelect: "none",
                                                  WebkitUserSelect: "none",
                                              }}
                                              wrapLines={true}
                                              wrapLongLines={true}
                                              lineProps={() => ({
                                                  style: { display: "block", cursor: "text" },
                                                  className: "hover:bg-muted/30 transition-colors",
                                              })}
                                          >
                                              {prettyResponse?.formatted ?? (responseData.isBinary ? responseData.bodyBase64 : responseData.body)}
                                          </SyntaxHighlighter>
                                      </div>
                                  )}
                                  {activeResponseTab === "raw" && (
                                      <pre className="whitespace-pre-wrap break-all p-4 font-mono text-[13px] leading-relaxed text-foreground/90 select-text">
                                          {responseData.isBinary ? responseData.bodyBase64 : responseData.body}
                                      </pre>
                                  )}
                                  {activeResponseTab === "headers" && (
                                      <div className="p-4">
                                          <div className="overflow-hidden rounded-lg border border-border">
                                              <div className="grid grid-cols-[1fr_2fr] bg-muted/40 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                                                  <div className="px-3 py-2">Key</div>
                                                  <div className="border-l border-border px-3 py-2">Value</div>
                                              </div>
                                              {responseData.headers.map((h, i) => (
                                                  <div key={i} className="grid grid-cols-[1fr_2fr] border-t border-border">
                                                      <div className="px-3 py-2 text-[13px] font-medium text-foreground/80">{h.key}</div>
                                                      <div className="border-l border-border px-3 py-2 text-[13px] text-foreground/60 break-all">{h.value}</div>
                                                  </div>
                                              ))}
                                          </div>
                                      </div>
                                  )}
                              </>
                          ) : (
                              <div className="flex h-full items-center justify-center p-4">
                                  <p className="text-[13px] text-muted-foreground/50 italic">
                                      Click Send to make a request.
                                  </p>
                              </div>
                          )}
                      </ScrollArea>
                    )}
                </div>
            </div>
        </div>
    );
}
