"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { getRequestDetails } from "@/lib/collections";
import type { EnvFile } from "@/lib/environments";
import { cn } from "@/lib/utils";
import {
    wsConnect,
    wsDisconnect,
    wsSendMessage,
    type WsConnectionStatus,
    type WsEvent,
    type WsLogEntry,
} from "@/lib/websocket";
import {
    ArrowDown,
    ArrowUp,
    Loader2,
    Plug,
    PlugZap,
    Send,
    Trash2,
    Unplug,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { EnvVarInput, EnvVarText } from "./env-var-input";

function substituteEnvVars(text: string, environments: EnvFile[]): string {
    return text.replace(/\{\{([^}]+)\}\}/g, (_match, varName: string) => {
        for (const env of environments) {
            if (!env.isEnabled) continue;
            for (const v of env.variables) {
                if (v.key === varName && v.enabled) return v.value;
            }
        }
        return _match;
    });
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(epoch: number): string {
    const d = new Date(epoch);
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${d.getMilliseconds().toString().padStart(3, "0")}`;
}

function statusDot(status: WsConnectionStatus) {
    if (status === "connected") return "bg-emerald-500";
    if (status === "connecting") return "bg-amber-500 animate-pulse";
    return "bg-muted-foreground/40";
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
    onUpdate: (index: number, field: "key" | "value" | "enabled", val: string | boolean) => void;
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
                            onChange={() => onUpdate(i, "enabled", !row.enabled)}
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

function MessageEntry({ entry }: { entry: WsLogEntry }) {
    const isSent = entry.direction === "sent";
    return (
        <div
            className={cn(
                "group flex gap-3 px-4 py-2.5 border-b border-border/50 transition-colors hover:bg-muted/30",
                isSent ? "bg-blue-500/[0.03]" : "bg-emerald-500/[0.03]"
            )}
        >
            <div className="flex shrink-0 items-start pt-0.5">
                {isSent ? (
                    <ArrowUp className="size-3.5 text-blue-500" />
                ) : (
                    <ArrowDown className="size-3.5 text-emerald-500" />
                )}
            </div>

            <div className="flex-1 min-w-0">
                <pre className="whitespace-pre-wrap break-all text-[13px] leading-relaxed font-mono text-foreground/90">
                    {entry.isBinary ? `[Binary: ${formatBytes(entry.sizeBytes)}]` : entry.data}
                </pre>
            </div>

            <div className="flex shrink-0 flex-col items-end gap-0.5 text-[11px] text-muted-foreground/50">
                <span>{formatTime(entry.timestamp)}</span>
                <span>{formatBytes(entry.sizeBytes)}</span>
            </div>
        </div>
    );
}

type WsTab = "headers" | "protocols" | "messages";

interface WebSocketEditorProps {
    /** Stable ID used to identify the WS tab (also used as connectionId). */
    connectionId: string;
    /** Relative path to the collection JSON file (for loading saved request details). */
    collectionRelPath?: string | null;
    /** Workspace root path (for loading saved request details). */
    workspacePath?: string | null;
    environments: EnvFile[];
    onOpenEnvTab?: (envName: string) => void;
}

export function WebSocketEditor({
    connectionId,
    collectionRelPath,
    workspacePath,
    environments,
    onOpenEnvTab,
}: WebSocketEditorProps) {
    const [url, setUrl] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [status, setStatus] = useState<WsConnectionStatus>("disconnected");
    const [error, setError] = useState<string | null>(null);
    const [negotiatedProtocol, setNegotiatedProtocol] = useState<string | null>(null);

    const [activeTab, setActiveTab] = useState<WsTab>("messages");
    const [headers, setHeaders] = useState<KVRow[]>([]);
    const [protocols, setProtocols] = useState("");

    const [messages, setMessages] = useState<WsLogEntry[]>([]);
    const [messageInput, setMessageInput] = useState("");
    const [messageType, setMessageType] = useState<"text" | "json">("text");
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const msgCounter = useRef(0);

    useEffect(() => {
        if (!connectionId || !collectionRelPath || !workspacePath) return;
        let cancelled = false;
        setIsLoading(true);

        getRequestDetails(workspacePath, collectionRelPath, connectionId)
            .then((data) => {
                if (cancelled) return;
                setUrl(data.url);
                setHeaders(
                    data.headers
                        .filter((h) => h.key)
                        .map((h) => ({ key: h.key, value: h.value, enabled: h.enabled }))
                );
            })
            .catch((err) => {
                if (cancelled) return;
                console.error("Failed to load WS request details:", err);
            })
            .finally(() => {
                if (!cancelled) setIsLoading(false);
            });

        return () => { cancelled = true; };
    }, [connectionId, collectionRelPath, workspacePath]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    useEffect(() => {
        let unlisten: (() => void) | null = null;
        let cancelled = false;

        (async () => {
            const { listen } = await import("@tauri-apps/api/event");
            if (cancelled) return;

            const unlistenFn = await listen<WsEvent>("ws-event", (event) => {
                const ev = event.payload;
                if (ev.connectionId !== connectionId) return;

                switch (ev.type) {
                    case "connected":
                        setStatus("connected");
                        setError(null);
                        setNegotiatedProtocol(ev.protocol);
                        break;
                    case "message":
                        setMessages((prev) => [
                            ...prev,
                            {
                                id: `recv-${++msgCounter.current}`,
                                direction: "received",
                                data: ev.data,
                                isBinary: ev.isBinary,
                                sizeBytes: ev.sizeBytes,
                                timestamp: ev.timestampMs,
                            },
                        ]);
                        break;
                    case "disconnected":
                        setStatus("disconnected");
                        if (ev.reason) {
                            setMessages((prev) => [
                                ...prev,
                                {
                                    id: `sys-${++msgCounter.current}`,
                                    direction: "received",
                                    data: `[Disconnected] code=${ev.code ?? "—"} reason=${ev.reason}`,
                                    isBinary: false,
                                    sizeBytes: 0,
                                    timestamp: Date.now(),
                                },
                            ]);
                        }
                        break;
                    case "error":
                        setError(ev.message);
                        setStatus("disconnected");
                        break;
                }
            });

            if (cancelled) {
                unlistenFn();
                return;
            }
            unlisten = unlistenFn;
        })();

        return () => {
            cancelled = true;
            unlisten?.();
        };
    }, [connectionId]);

    const handleConnect = useCallback(async () => {
        setError(null);
        setStatus("connecting");

        const resolvedUrl = substituteEnvVars(url, environments);
        
        let wsUrl = resolvedUrl.trim();
        if (!wsUrl.includes("://")) {
            wsUrl = `ws://${wsUrl}`;
        } else if (wsUrl.startsWith("http://")) {
            wsUrl = wsUrl.replace(/^http:\/\//, "ws://");
        } else if (wsUrl.startsWith("https://")) {
            wsUrl = wsUrl.replace(/^https:\/\//, "wss://");
        }

        const protocolList = protocols
            .split(",")
            .map((p) => p.trim())
            .filter(Boolean);

        try {
            await wsConnect({
                connectionId,
                url: wsUrl,
                headers: headers
                    .filter((h) => h.enabled && h.key.trim())
                    .map((h) => ({
                        key: substituteEnvVars(h.key, environments),
                        value: substituteEnvVars(h.value, environments),
                        enabled: true,
                    })),
                protocols: protocolList,
            });
        } catch (e) {
            setError(String(e));
            setStatus("disconnected");
        }
    }, [url, headers, protocols, environments, connectionId]);

    const handleDisconnect = useCallback(async () => {
        try {
            await wsDisconnect(connectionId);
        } catch (e) {
            setError(String(e));
        }
    }, [connectionId]);

    useEffect(() => {
        return () => {
            if (status === "connected" || status === "connecting") {
                wsDisconnect(connectionId).catch(() => { });
            }
        };
    }, [connectionId]);

    const handleSendMessage = useCallback(async () => {
        if (!messageInput.trim()) return;

        const resolvedMsg = substituteEnvVars(messageInput, environments);
        const sizeBytes = new TextEncoder().encode(resolvedMsg).length;

        try {
            await wsSendMessage({
                connectionId,
                message: resolvedMsg,
                messageType: "text",
            });

            setMessages((prev) => [
                ...prev,
                {
                    id: `sent-${++msgCounter.current}`,
                    direction: "sent",
                    data: resolvedMsg,
                    isBinary: false,
                    sizeBytes,
                    timestamp: Date.now(),
                },
            ]);
            setMessageInput("");
        } catch (e) {
            setError(String(e));
        }
    }, [messageInput, environments, connectionId]);

    const handleClearMessages = useCallback(() => {
        setMessages([]);
    }, []);

    const updateHeader = useCallback(
        (index: number, field: "key" | "value" | "enabled", val: string | boolean) => {
            setHeaders((prev) =>
                prev.map((row, i) =>
                    i === index ? { ...row, [field]: val } : row
                )
            );
        },
        []
    );

    const addHeader = useCallback(() => {
        setHeaders((prev) => [...prev, { key: "", value: "", enabled: true }]);
    }, []);

    const removeHeader = useCallback((index: number) => {
        setHeaders((prev) => prev.filter((_, i) => i !== index));
    }, []);

    const isConnected = status === "connected";
    const isConnecting = status === "connecting";

    const headerCount = headers.filter((h) => h.key.trim() !== "").length;

    const TABS: { id: WsTab; label: string; count?: number }[] = [
        { id: "messages", label: "Messages", count: messages.length || undefined },
        { id: "headers", label: "Headers", count: headerCount || undefined },
        { id: "protocols", label: "Protocols" },
    ];

    return (
        <div className="flex h-full flex-col overflow-hidden bg-background select-none">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                <button
                    className={cn(
                        "flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-[13px] font-bold",
                        "transition-colors duration-150 text-purple-600"
                    )}
                >
                    <PlugZap className="size-3.5" />
                    WS
                </button>

                <div
                    className="relative flex-1"
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && !isConnected && !isConnecting) {
                            handleConnect();
                        }
                    }}
                >
                    <EnvVarInput
                        value={url}
                        onChange={setUrl}
                        environments={environments}
                        onOpenEnvTab={onOpenEnvTab}
                        placeholder="ws://localhost:8080/socket"
                        className="flex-1"
                    />
                </div>

                {isConnected ? (
                    <button
                        onClick={handleDisconnect}
                        className={cn(
                            "flex h-8 items-center gap-2 rounded-lg px-4 text-[13px] font-medium text-white",
                            "transition-all duration-150 cursor-pointer shadow-sm",
                            "hover:shadow-md active:scale-[0.98]",
                            "bg-red-600 hover:bg-red-700"
                        )}
                    >
                        <Unplug className="size-3.5" />
                        Disconnect
                    </button>
                ) : (
                    <button
                        onClick={handleConnect}
                        disabled={isConnecting || !url.trim()}
                        className={cn(
                            "flex h-8 items-center gap-2 rounded-lg px-4 text-[13px] font-medium text-white",
                            "transition-all duration-150 cursor-pointer shadow-sm",
                            "hover:shadow-md active:scale-[0.98]",
                            "bg-purple-600 hover:bg-purple-700",
                            "disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
                        )}
                    >
                        {isConnecting ? (
                            <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                            <Plug className="size-3.5" />
                        )}
                        Connect
                    </button>
                )}
            </div>

            <div className="flex items-center gap-0 border-b border-border px-4">
                {TABS.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={cn(
                            "relative flex items-center gap-1.5 px-3 py-2.5 text-[13px] cursor-pointer",
                            "transition-colors duration-150",
                            activeTab === tab.id
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

                <div className="ml-auto flex items-center gap-3 text-[11px] text-muted-foreground/60">
                    <div className="flex items-center gap-1.5">
                        <div className={cn("size-2 rounded-full", statusDot(status))} />
                        <span className="capitalize">{status}</span>
                    </div>
                    {negotiatedProtocol && isConnected && (
                        <span className="text-muted-foreground/50">Protocol: {negotiatedProtocol}</span>
                    )}
                    {error && <span className="text-red-500 truncate max-w-xs">{error}</span>}
                </div>
            </div>

            <div className="flex flex-1 flex-col overflow-hidden">
                {activeTab === "headers" && (
                    <div className="p-4 overflow-auto">
                        <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                            Headers
                        </h3>
                        <KVTable
                            rows={headers}
                            onUpdate={updateHeader}
                            onRemove={removeHeader}
                            onAdd={addHeader}
                            environments={environments}
                            onOpenEnvTab={onOpenEnvTab}
                        />
                    </div>
                )}

                {activeTab === "protocols" && (
                    <div className="p-4 space-y-6">
                        <div>
                            <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                                Sub-protocols
                            </h3>
                            <div className="max-w-md">
                                <input
                                    value={protocols}
                                    onChange={(e) => setProtocols(e.target.value)}
                                    placeholder="e.g. graphql-ws, graphql-transport-ws"
                                    className="w-full rounded-md border border-border bg-transparent px-3 py-1.5 text-[13px] outline-none placeholder:text-muted-foreground/30 focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
                                />
                                <p className="mt-1.5 text-[11px] text-muted-foreground/50">
                                    Comma-separated list of sub-protocols to negotiate during the handshake.
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === "messages" && (
                    <div className="flex flex-1 flex-col overflow-hidden">
                        <ScrollArea className="flex-1 bg-muted/20">
                            {messages.length === 0 ? (
                                <div className="flex h-full items-center justify-center p-4">
                                    <div className="text-center">
                                        <PlugZap className="mx-auto size-8 mb-3 text-muted-foreground/30" />
                                        <p className="text-[13px] text-muted-foreground/50 italic">
                                            {isConnected
                                                ? "Waiting for messages…"
                                                : "Connect to start sending and receiving messages"}
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <div>
                                    {messages.map((msg) => (
                                        <MessageEntry key={msg.id} entry={msg} />
                                    ))}
                                    <div ref={messagesEndRef} />
                                </div>
                            )}
                        </ScrollArea>

                        <div className="border-t border-border">
                            <div className="flex items-center gap-2 px-4 py-1.5 border-b border-border/50">
                                <select
                                    value={messageType}
                                    onChange={(e) => setMessageType(e.target.value as "text" | "json")}
                                    className="rounded-md border border-border bg-transparent px-2 py-0.5 text-[11px] text-muted-foreground outline-none cursor-pointer transition-colors hover:bg-muted/30"
                                >
                                    <option value="text">Text</option>
                                    <option value="json">JSON</option>
                                </select>

                                <div className="flex-1" />

                                <button
                                    onClick={handleClearMessages}
                                    title="Clear messages"
                                    className="flex items-center gap-1 rounded px-1.5 py-0.5 text-muted-foreground/50 hover:text-foreground hover:bg-muted/50 transition-colors cursor-pointer"
                                >
                                    <Trash2 className="size-3.5" />
                                    <span className="text-[11px]">Clear</span>
                                </button>

                                <span className="text-[11px] text-muted-foreground/40">
                                    {messages.length} message{messages.length !== 1 ? "s" : ""}
                                </span>
                            </div>

                            <div className="flex items-end gap-2 px-4 py-3">
                                <textarea
                                    value={messageInput}
                                    onChange={(e) => setMessageInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                                            e.preventDefault();
                                            handleSendMessage();
                                        }
                                    }}
                                    placeholder={
                                        isConnected
                                            ? "Type a message… (⌘+Enter to send)"
                                            : "Connect first to send messages"
                                    }
                                    disabled={!isConnected}
                                    rows={3}
                                    className="flex-1 resize-none rounded-lg border border-border bg-background p-3 text-[13px] font-mono outline-none transition-shadow duration-150 focus:ring-1 focus:ring-ring/40 placeholder:text-muted-foreground/30 disabled:opacity-50"
                                />
                                <button
                                    onClick={handleSendMessage}
                                    disabled={!isConnected || !messageInput.trim()}
                                    className={cn(
                                        "flex h-8 items-center gap-2 rounded-lg px-4 text-[13px] font-medium text-white",
                                        "transition-all duration-150 cursor-pointer shadow-sm",
                                        "hover:shadow-md active:scale-[0.98]",
                                        "bg-purple-600 hover:bg-purple-700",
                                        "disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
                                    )}
                                >
                                    <Send className="size-3.5" />
                                    Send
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
