"use client";

import { cn } from "@/lib/utils";
import type { HttpMethod } from "@/lib/types";
import { BookOpen, Globe, Plus, X } from "lucide-react";
import { useState, useRef, useEffect, useCallback } from "react";

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

export interface RequestTabItem {
  id: string;
  kind: "request";
  name: string;
  method: HttpMethod;
  collectionRelPath: string;
  isDirty?: boolean;
}

export interface EnvironmentTabItem {
  id: string;
  kind: "environment";
  name: string;
  isDirty?: boolean;
}

export interface FolderReadmeTabItem {
  id: string;
  kind: "folder-readme";
  name: string;
  folderRelPath: string;
  isDirty?: boolean;
}

export interface CollectionDocTabItem {
  id: string;
  kind: "collection-doc";
  name: string;
  collectionRelPath: string;
  isDirty?: boolean;
}

export type TabItem = RequestTabItem | EnvironmentTabItem | FolderReadmeTabItem | CollectionDocTabItem;

interface RequestTabBarProps {
  tabs: TabItem[];
  activeTabId: string | null;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onNewTab: () => void;
  onRenameTab?: (tab: RequestTabItem, newName: string) => void;
}

function TabName({
  tab,
  isActive,
  onRename,
}: {
  tab: TabItem;
  isActive: boolean;
  onRename?: (tab: RequestTabItem, newName: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = useCallback(() => {
    if (tab.kind !== "request" || !onRename) return;
    setEditValue(tab.name);
    setIsEditing(true);
  }, [tab, onRename]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const commit = useCallback(() => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== tab.name && tab.kind === "request" && onRename) {
      onRename(tab, trimmed);
    }
    setIsEditing(false);
  }, [editValue, tab, onRename]);

  const cancel = useCallback(() => {
    setIsEditing(false);
  }, []);

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commit(); }
          if (e.key === "Escape") { e.preventDefault(); cancel(); }
        }}
        onClick={(e) => e.stopPropagation()}
        className="bg-transparent outline-none text-[13px] w-[120px] border-b border-primary py-0 px-0 truncate"
      />
    );
  }

  return (
    <span
      className="truncate max-w-[140px]"
      onDoubleClick={(e) => {
        e.stopPropagation();
        startEdit();
      }}
    >
      {tab.name}
    </span>
  );
}

export function RequestTabBar({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onNewTab,
  onRenameTab,
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
            ) : tab.kind === "environment" ? (
              <Globe className="size-3.5 shrink-0 text-violet-500" />
            ) : tab.kind === "folder-readme" ? (
              <BookOpen className="size-3.5 shrink-0 text-amber-500" />
            ) : (
              <BookOpen className="size-3.5 shrink-0 text-sky-500" />
            )}
            <TabName
              tab={tab}
              isActive={activeTabId === tab.id}
              onRename={onRenameTab}
            />
            {tab.isDirty && (
              <span className="size-1.5 rounded-full bg-foreground/30" />
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCloseTab(tab.id);
              }}
              className="ml-1 flex h-4 w-4 items-center justify-center rounded text-muted-foreground/40 opacity-0 transition-all duration-150 hover:bg-accent hover:text-accent-foreground group-hover:opacity-100"
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
