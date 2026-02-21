"use client";

import { cn } from "@/lib/utils";
import type { HttpMethod } from "@/lib/types";
import { Globe, Plus, X } from "lucide-react";

const METHOD_COLORS: Record<string, string> = {
  GET: "text-emerald-600",
  POST: "text-amber-600",
  PUT: "text-blue-600",
  PATCH: "text-violet-600",
  DELETE: "text-red-600",
  HEAD: "text-muted-foreground",
  OPTIONS: "text-muted-foreground",
};

export interface RequestTabItem {
  id: string;
  kind: "request";
  name: string;
  method: HttpMethod;
  isDirty?: boolean;
}

export interface EnvironmentTabItem {
  id: string;
  kind: "environment";
  name: string;
  isDirty?: boolean;
}

export type TabItem = RequestTabItem | EnvironmentTabItem;

interface RequestTabBarProps {
  tabs: TabItem[];
  activeTabId: string | null;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onNewTab: () => void;
}

export function RequestTabBar({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onNewTab,
}: RequestTabBarProps) {
  if (tabs.length === 0) return null;

  return (
    <div className="flex items-center border-b border-border bg-sidebar select-none">
      <div className="flex flex-1 items-center overflow-x-auto scrollbar-none">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            onClick={() => onSelectTab(tab.id)}
            className={cn(
              "group relative flex shrink-0 items-center gap-2 border-r border-border px-3.5 py-2 text-[13px] cursor-pointer",
              "transition-colors duration-150",
              activeTabId === tab.id
                ? "bg-background text-foreground"
                : "text-muted-foreground/70 hover:text-foreground hover:bg-background/60"
            )}
          >
            {activeTabId === tab.id && (
              <div className="absolute left-0 right-0 top-0 h-[2px] rounded-b bg-primary" />
            )}
            {tab.kind === "request" ? (
              <span className={cn("text-[10px] font-bold uppercase tracking-wide", METHOD_COLORS[tab.method])}>
                {tab.method}
              </span>
            ) : (
              <Globe className="size-3.5 shrink-0 text-violet-500" />
            )}
            <span className="truncate max-w-[140px]">{tab.name}</span>
            {tab.isDirty && (
              <span className="size-1.5 rounded-full bg-foreground/30" />
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCloseTab(tab.id);
              }}
              className="ml-1 flex h-4 w-4 items-center justify-center rounded text-muted-foreground/40 opacity-0 transition-all duration-150 hover:bg-muted hover:text-foreground group-hover:opacity-100"
            >
              <X className="size-3" />
            </button>
          </div>
        ))}
      </div>
      <button
        onClick={onNewTab}
        title="New Tab"
        className="flex h-full shrink-0 items-center px-2.5 text-muted-foreground/60 hover:text-foreground transition-colors duration-150 cursor-pointer"
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}
