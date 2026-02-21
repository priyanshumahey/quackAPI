"use client";

import type { HttpMethod } from "@/lib/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp, Send } from "lucide-react";
import { useState, useCallback, useRef } from "react";

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

const REQUEST_TABS: { id: RequestTab; label: string; count?: number }[] = [
    { id: "params", label: "Params" },
    { id: "auth", label: "Auth" },
    { id: "headers", label: "Headers", count: 8 },
    { id: "body", label: "Body" },
    { id: "pre-req", label: "Pre-req." },
    { id: "tests", label: "Tests" },
    { id: "settings", label: "Settings" },
];

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
    description: string;
}

function KVTable({ rows }: { rows: KVRow[] }) {
    return (
        <div className="overflow-hidden rounded-lg border border-border">
            <div className="grid grid-cols-[1fr_1fr_1fr_40px] bg-muted/40 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                <div className="px-3 py-2">Key</div>
                <div className="border-l border-border px-3 py-2">Value</div>
                <div className="border-l border-border px-3 py-2">Description</div>
                <div className="border-l border-border px-3 py-2" />
            </div>
            {rows.map((row, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_1fr_40px] border-t border-border">
                    <input
                        className="bg-transparent px-3 py-2 text-[13px] outline-none placeholder:text-muted-foreground/30 focus:bg-muted/30 transition-colors"
                        placeholder="Key"
                        defaultValue={row.key}
                    />
                    <input
                        className="border-l border-border bg-transparent px-3 py-2 text-[13px] outline-none placeholder:text-muted-foreground/30 focus:bg-muted/30 transition-colors"
                        placeholder="Value"
                        defaultValue={row.value}
                    />
                    <input
                        className="border-l border-border bg-transparent px-3 py-2 text-[13px] outline-none placeholder:text-muted-foreground/30 focus:bg-muted/30 transition-colors"
                        placeholder="Description"
                        defaultValue={row.description}
                    />
                    <div className="flex items-center justify-center border-l border-border">
                        <span className="text-muted-foreground/30 text-xs">⋯</span>
                    </div>
                </div>
            ))}
        </div>
    );
}

const MOCK_RESPONSE = `{
  "@odata.context": "https://graph.microsoft.com/v1.0/$metadata#users/$entity",
  "businessPhones": ["+1 412 555 0109"],
  "displayName": "Megan Bowen",
  "givenName": "Megan",
  "jobTitle": "Marketing Manager",
  "mail": "MeganB@example.com",
  "mobilePhone": null,
  "officeLocation": "12/1110",
  "preferredLanguage": "en-US",
  "surname": "Bowen",
  "userPrincipalName": "MeganB@example.com",
  "id": "48d31887-5fad-4d73-a9f5-3c356e68a038"
}`;

interface RequestEditorProps {
    requestName: string | null;
}

export function RequestEditor({ requestName }: RequestEditorProps) {
    const [method, setMethod] = useState<HttpMethod>("GET");
    const [url, setUrl] = useState("https://graph.microsoft.com/v1.0/me");
    const [activeRequestTab, setActiveRequestTab] = useState<RequestTab>("params");
    const [activeResponseTab, setActiveResponseTab] = useState<ResponseTab>("pretty");
    const [showMethodDropdown, setShowMethodDropdown] = useState(false);

    const HEADER_HEIGHT = 36;
    const MIN_HEIGHT = 120;
    const DEFAULT_HEIGHT = 280;
    const [responseHeight, setResponseHeight] = useState(DEFAULT_HEIGHT);
    const [isCollapsed, setIsCollapsed] = useState(false);
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

    const mockKVRows: KVRow[] = [
        { key: "", value: "", description: "" },
    ];

    if (!requestName) {
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
                                    onClick={() => {
                                        setMethod(m);
                                        setShowMethodDropdown(false);
                                    }}
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

                <input
                    type="text"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-[13px] outline-none transition-shadow duration-150 focus:ring-1 focus:ring-ring/40"
                    placeholder="Enter request URL"
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
                            <KVTable rows={mockKVRows} />
                        </div>
                    )}
                    {activeRequestTab === "headers" && (
                        <div className="p-4">
                            <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                                Headers
                            </h3>
                            <KVTable
                                rows={[
                                    { key: "Content-Type", value: "application/json", description: "" },
                                    { key: "Authorization", value: "Bearer {{token}}", description: "" },
                                    { key: "", value: "", description: "" },
                                ]}
                            />
                        </div>
                    )}
                    {activeRequestTab === "body" && (
                        <div className="p-4">
                            <div className="flex items-center gap-3 mb-3">
                                {["none", "raw", "form-data", "x-www-form-urlencoded", "binary"].map((t) => (
                                    <label key={t} className="flex items-center gap-1.5 text-[13px] text-muted-foreground/70 cursor-pointer hover:text-foreground transition-colors duration-150">
                                        <input type="radio" name="body-type" defaultChecked={t === "none"} className="accent-primary" />
                                        {t}
                                    </label>
                                ))}
                            </div>
                            <div className="rounded-lg border border-border bg-muted/30 p-4 text-[13px] text-muted-foreground/50 italic">
                                No body for this request.
                            </div>
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
                            <span className="font-medium text-emerald-600">200 OK</span>
                            <span className="text-muted-foreground/50">289 ms</span>
                            <span className="text-muted-foreground/50">1.02 KB</span>
                        </div>
                    </div>

                    {!isCollapsed && (
                      <ScrollArea className="min-h-0 flex-1 bg-muted/20">
                          <pre className="p-4 text-[13px] leading-relaxed font-mono text-foreground/80">
                              {MOCK_RESPONSE}
                          </pre>
                      </ScrollArea>
                    )}
                </div>
            </div>
        </div>
    );
}
