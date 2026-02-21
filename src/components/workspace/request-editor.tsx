"use client";

import type { HttpMethod } from "@/lib/types";
import {
    getRequestDetails,
    updateRequest,
    type RequestDetails,
    type RequestHeaderDetail,
    type RequestParamDetail,
} from "@/lib/collections";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { EnvFile } from "@/lib/environments";
import { EnvVarInput, EnvVarText } from "./env-var-input";
import { ChevronDown, ChevronUp, Loader2, Send, Trash2 } from "lucide-react";
import { useState, useCallback, useRef, useEffect, useMemo } from "react";

const METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

const METHOD_COLORS: Record<string, string> = {
    GET: "text-emerald-600",
    POST: "text-amber-600",
    PUT: "text-blue-600",
    PATCH: "text-violet-600",
    DELETE: "text-red-600",
    HEAD: "text-muted-foreground",
    OPTIONS: "text-muted-foreground",
};

const METHOD_BG: Record<string, string> = {
    GET: "bg-emerald-600",
    POST: "bg-amber-600",
    PUT: "bg-blue-600",
    PATCH: "bg-violet-600",
    DELETE: "bg-red-600",
    HEAD: "bg-muted-foreground",
    OPTIONS: "bg-muted-foreground",
};

type RequestTab = "params" | "auth" | "headers" | "body" | "pre-req" | "tests" | "settings";

type ResponseTab = "pretty" | "raw" | "preview" | "visualize";

const RESPONSE_TABS: { id: ResponseTab; label: string }[] = [
    { id: "pretty", label: "Pretty" },
    { id: "raw", label: "Raw" },
    { id: "preview", label: "Preview" },
    { id: "visualize", label: "Visualize" },
];

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
}

export function RequestEditor({ requestId, collectionRelPath, workspacePath, environments, onOpenEnvTab }: RequestEditorProps) {
    const [details, setDetails] = useState<RequestDetails | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [method, setMethod] = useState<HttpMethod>("GET");
    const [url, setUrl] = useState("");
    const [headers, setHeaders] = useState<KVRow[]>([]);
    const [params, setParams] = useState<KVRow[]>([]);
    const [bodyType, setBodyType] = useState("none");
    const [bodyContent, setBodyContent] = useState("");

    const [activeRequestTab, setActiveRequestTab] = useState<RequestTab>("params");
    const [activeResponseTab, setActiveResponseTab] = useState<ResponseTab>("pretty");
    const [showMethodDropdown, setShowMethodDropdown] = useState(false);

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

                <button
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
                        <div className="p-4 text-sm text-muted-foreground/50 italic">
                            Auth configuration will appear here.
                        </div>
                    )}
                    {(activeRequestTab === "pre-req" || activeRequestTab === "tests") && (
                        <div className="p-4 text-sm text-muted-foreground/50 italic">
                            Script editor will appear here.
                        </div>
                    )}
                    {activeRequestTab === "settings" && (
                        <div className="p-4 text-sm text-muted-foreground/50 italic">
                            Request settings will appear here.
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
                            <span className="text-muted-foreground/50 italic">No response yet</span>
                        </div>
                    </div>

                    {!isCollapsed && (
                      <ScrollArea className="min-h-0 flex-1 bg-muted/20">
                          <div className="flex h-full items-center justify-center p-4">
                              <p className="text-[13px] text-muted-foreground/50 italic">
                                  Click Send to make a request.
                              </p>
                          </div>
                      </ScrollArea>
                    )}
                </div>
            </div>
        </div>
    );
}
