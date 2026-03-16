"use client";

import { Button } from "@/components/ui/button";
import { ResizablePanel } from "@/components/ui/resizable-panel";
import { useWorkspace } from "@/context";
import {
  addRequestToCollection,
  createCollection,
  createCollectionFolder,
  deleteCollectionItem,
  deleteRequest,
  listCollections,
  moveCollectionItem,
  moveRequestToCollection,
  renameCollection,
  renameCollectionFolder,
  renameRequest,
  type CollectionRequestSummary,
  type CollectionTreeItem
} from "@/lib/collections";
import {
  addEnvVariable,
  createEnvFile,
  deleteEnvFile,
  deleteEnvVariable,
  listEnvironments,
  renameEnvFile,
  toggleEnvFile,
  toggleEnvVariable,
  updateEnvVariable,
  type EnvFile
} from "@/lib/environments";
import { addHistoryEntry, clearRequestHistory, deleteHistoryEntry, getRequestHistory } from "@/lib/settings";
import type { HistoryEntry } from "@/lib/types";
import { Loader2, Plus, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityBar, type ActivityTab } from "./activity-bar";
import { CollectionDocView } from "./collection-doc-view";
import { CollectionPanel } from "./collection-panel";
import { EnvironmentEditor } from "./environment-editor";
import { EnvironmentPanel } from "./environment-panel";
import { FolderReadmeView } from "./folder-readme-view";
import { RequestEditor } from "./request-editor";
import { WebSocketEditor } from "./websocket-editor";
import {
  RequestTabBar,
  type CollectionDocTabItem,
  type EnvironmentTabItem,
  type FolderReadmeTabItem,
  type HistoryRequestTabItem,
  type RequestTabItem,
  type TabItem,
} from "./request-tab-bar";

function findRequestInTree(
  items: CollectionTreeItem[],
  id: string
): CollectionRequestSummary | null {
  for (const item of items) {
    if (item.type === "folder") {
      const found = findRequestInTree(item.children, id);
      if (found) return found;
    } else {
      const req = item.requests.find((r) => r.id === id);
      if (req) return req;
    }
  }
  return null;
}

function InitPrompt() {
  const { initWorkspace } = useWorkspace();

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
      <p className="text-sm text-muted-foreground">
        No <code className="rounded bg-muted px-1.5 py-0.5 text-xs">.quack</code> workspace found in this folder.
      </p>
      <Button onClick={initWorkspace} className="gap-2">
        <Plus className="size-4" />
        Initialize Workspace
      </Button>
    </div>
  );
}

const HISTORY_METHOD_COLORS: Record<string, string> = {
  GET: "text-emerald-600",
  POST: "text-amber-600",
  PUT: "text-blue-600",
  PATCH: "text-violet-600",
  DELETE: "text-red-600",
  HEAD: "text-muted-foreground",
  OPTIONS: "text-muted-foreground",
};

function formatHistoryTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function WorkspaceContent() {
  const { folderPath, refreshFileTree } = useWorkspace();
  const [activeActivity, setActiveActivity] = useState<ActivityTab>("collections");
  const [openTabs, setOpenTabs] = useState<TabItem[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [environments, setEnvironments] = useState<EnvFile[]>([]);
  const [collections, setCollections] = useState<CollectionTreeItem[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  // Load history on mount
  useEffect(() => {
    getRequestHistory().then(setHistory);
  }, []);

  const handleHistoryEntry = useCallback(async (entry: HistoryEntry) => {
    const updated = await addHistoryEntry(entry);
    setHistory(updated);
  }, []);

  const handleClearHistory = useCallback(async () => {
    await clearRequestHistory();
    setHistory([]);
  }, []);

  const handleDeleteHistoryEntry = useCallback(async (entryId: string) => {
    const updated = await deleteHistoryEntry(entryId);
    setHistory(updated);
  }, []);

  const handleSelectHistoryEntry = useCallback(
    (entry: HistoryEntry) => {
      const tabId = `history-${entry.id}`;
      if (!openTabs.some((t) => t.id === tabId)) {
        const newTab: HistoryRequestTabItem = {
          id: tabId,
          kind: "history-request",
          name: entry.url,
          method: entry.method,
          historyEntry: entry,
        };
        setOpenTabs((prev) => [...prev, newTab]);
      }
      setActiveTabId(tabId);
    },
    [openTabs]
  );

  const loadEnvs = useCallback(async () => {
    if (!folderPath) return;
    try {
      const envs = await listEnvironments(folderPath);
      setEnvironments(envs);
    } catch (err) {
      console.error("Failed to load environments", err);
    }
  }, [folderPath]);

  const loadCollections = useCallback(async () => {
    if (!folderPath) return;
    try {
      const cols = await listCollections(folderPath);
      setCollections(cols);
    } catch (err) {
      console.error("Failed to load collections", err);
    }
  }, [folderPath]);

  useEffect(() => {
    loadEnvs();
    loadCollections();
  }, [loadEnvs, loadCollections]);

  const activeEnvVars = useMemo(() => {
    const vars: Record<string, string> = {};
    for (const env of environments) {
      if (!env.isEnabled) continue;
      for (const v of env.variables) {
        if (v.enabled) vars[v.key] = v.value;
      }
    }
    return vars;
  }, [environments]);

  const handleSelectRequest = useCallback(
    (id: string) => {
      if (!openTabs.some((t) => t.id === id)) {
        const req = findRequestInTree(collections, id);
        if (req) {
          const newTab: RequestTabItem = {
            id: req.id,
            kind: "request",
            name: req.name,
            method: req.method,
            collectionRelPath: req.collectionFile,
          };
          setOpenTabs((prev) => [...prev, newTab]);
        }
      }
      setActiveTabId(id);
    },
    [openTabs, collections]
  );

  // ── Collection CRUD handlers ──────────────────────────

  const handleCreateFolder = useCallback(
    async (parentRelPath: string, name: string) => {
      if (!folderPath) return;
      try {
        await createCollectionFolder(folderPath, parentRelPath, name);
        await loadCollections();
      } catch (err) {
        console.error("Failed to create folder", err);
      }
    },
    [folderPath, loadCollections]
  );

  const handleCreateCollection = useCallback(
    async (parentRelPath: string, name: string) => {
      if (!folderPath) return;
      try {
        await createCollection(folderPath, parentRelPath, name);
        await loadCollections();
      } catch (err) {
        console.error("Failed to create collection", err);
      }
    },
    [folderPath, loadCollections]
  );

  const handleRenameFolder = useCallback(
    async (relPath: string, newName: string) => {
      if (!folderPath) return;
      try {
        await renameCollectionFolder(folderPath, relPath, newName);
        await loadCollections();
      } catch (err) {
        console.error("Failed to rename folder", err);
      }
    },
    [folderPath, loadCollections]
  );

  const handleRenameCollection = useCallback(
    async (relPath: string, newName: string) => {
      if (!folderPath) return;
      try {
        await renameCollection(folderPath, relPath, newName);
        await loadCollections();
      } catch (err) {
        console.error("Failed to rename collection", err);
      }
    },
    [folderPath, loadCollections]
  );

  const handleRenameRequest = useCallback(
    async (requestId: string, collectionRelPath: string, newName: string) => {
      if (!folderPath) return;
      try {
        await renameRequest(folderPath, collectionRelPath, requestId, newName);
        setOpenTabs((prev) =>
          prev.map((t) =>
            t.id === requestId ? { ...t, name: newName } : t
          )
        );
        await loadCollections();
      } catch (err) {
        console.error("Failed to rename request", err);
      }
    },
    [folderPath, loadCollections]
  );

  const handleDeleteCollectionItem = useCallback(
    async (relPath: string) => {
      if (!folderPath) return;
      try {
        await deleteCollectionItem(folderPath, relPath);
        // Close any open tabs for requests in the deleted item
        // (simplified: just reload; tabs pointing to missing requests will show empty)
        await loadCollections();
      } catch (err) {
        console.error("Failed to delete collection item", err);
      }
    },
    [folderPath, loadCollections]
  );

  const handleDeleteRequest = useCallback(
    async (requestId: string, collectionRelPath: string) => {
      if (!folderPath) return;
      try {
        await deleteRequest(folderPath, collectionRelPath, requestId);
        setOpenTabs((prev) => {
          const next = prev.filter((t) => t.id !== requestId);
          if (activeTabId === requestId) {
            setActiveTabId(next.length > 0 ? next[next.length - 1].id : null);
          }
          return next;
        });
        await loadCollections();
      } catch (err) {
        console.error("Failed to delete request", err);
      }
    },
    [folderPath, loadCollections, activeTabId]
  );

  const handleMoveCollectionItem = useCallback(
    async (itemRelPath: string, destParentRelPath: string) => {
      if (!folderPath) return;
      if (!itemRelPath) {
        console.error("handleMoveCollectionItem called without itemRelPath");
        return;
      }
      try {
        await moveCollectionItem(folderPath, itemRelPath, destParentRelPath);
        await loadCollections();
      } catch (err) {
        console.error("Failed to move collection item", err);
      }
    },
    [folderPath, loadCollections]
  );

  const handleMoveRequest = useCallback(
    async (requestId: string, sourceCollectionRelPath: string, destCollectionRelPath: string) => {
      if (!folderPath) return;
      if (!requestId || !sourceCollectionRelPath || !destCollectionRelPath) {
        console.error("handleMoveRequest called with missing args", { requestId, sourceCollectionRelPath, destCollectionRelPath });
        return;
      }
      try {
        await moveRequestToCollection(folderPath, requestId, sourceCollectionRelPath, destCollectionRelPath);
        await loadCollections();
      } catch (err) {
        console.error("Failed to move request", err);
      }
    },
    [folderPath, loadCollections]
  );

  const handleAddRequest = useCallback(
    async (collectionRelPath: string) => {
      if (!folderPath) return;
      if (!collectionRelPath) {
        console.error("handleAddRequest called without a collectionRelPath");
        return;
      }
      try {
        const newId = await addRequestToCollection(
          folderPath,
          collectionRelPath,
          "New Request",
          "GET"
        );
        await loadCollections();
        if (!openTabs.some((t) => t.id === newId)) {
          const newTab: RequestTabItem = {
            id: newId,
            kind: "request",
            name: "New Request",
            method: "GET",
            collectionRelPath,
          };
          setOpenTabs((prev) => [...prev, newTab]);
        }
        setActiveTabId(newId);
      } catch (err) {
        console.error("Failed to add request", err);
      }
    },
    [folderPath, loadCollections, openTabs]
  );

  const handleAddWebSocket = useCallback(
    async (collectionRelPath: string) => {
      if (!folderPath) return;
      if (!collectionRelPath) {
        console.error("handleAddWebSocket called without a collectionRelPath");
        return;
      }
      try {
        const newId = await addRequestToCollection(
          folderPath,
          collectionRelPath,
          "New WebSocket",
          "WS"
        );
        await loadCollections();
        if (!openTabs.some((t) => t.id === newId)) {
          const newTab: RequestTabItem = {
            id: newId,
            kind: "request",
            name: "New WebSocket",
            method: "WS",
            collectionRelPath,
          };
          setOpenTabs((prev) => [...prev, newTab]);
        }
        setActiveTabId(newId);
      } catch (err) {
        console.error("Failed to add websocket request", err);
      }
    },
    [folderPath, loadCollections, openTabs]
  );

  const handleSelectEnv = useCallback(
    (envName: string) => {
      const tabId = `env-tab-${envName}`;
      if (!openTabs.some((t) => t.id === tabId)) {
        const newTab: EnvironmentTabItem = {
          id: tabId,
          kind: "environment",
          name: envName,
        };
        setOpenTabs((prev) => [...prev, newTab]);
      }
      setActiveTabId(tabId);
    },
    [openTabs]
  );

  const handleSelectFolder = useCallback(
    (relPath: string, name: string) => {
      const tabId = `folder-readme-${relPath || "__root__"}`;
      if (!openTabs.some((t) => t.id === tabId)) {
        const newTab: FolderReadmeTabItem = {
          id: tabId,
          kind: "folder-readme",
          name,
          folderRelPath: relPath,
        };
        setOpenTabs((prev) => [...prev, newTab]);
      }
      setActiveTabId(tabId);
    },
    [openTabs]
  );

  const handleSelectCollection = useCallback(
    (relPath: string, name: string, description: string | null) => {
      const tabId = `collection-doc-${relPath}`;
      if (!openTabs.some((t) => t.id === tabId)) {
        const newTab: CollectionDocTabItem = {
          id: tabId,
          kind: "collection-doc",
          name,
          collectionRelPath: relPath,
        };
        setOpenTabs((prev) => [...prev, newTab]);
      }
      setActiveTabId(tabId);
    },
    [openTabs]
  );

  const handleToggleEnv = useCallback(
    async (envName: string) => {
      if (!folderPath) return;
      const env = environments.find((e) => e.name === envName);
      if (!env) return;
      const newEnabled = !env.isEnabled;
      try {
        await toggleEnvFile(folderPath, envName, newEnabled);
        setEnvironments((prev) =>
          prev.map((e) => (e.name === envName ? { ...e, isEnabled: newEnabled } : e))
        );
      } catch (err) {
        console.error("Failed to toggle env file", err);
      }
    },
    [folderPath, environments]
  );

  const handleToggleVariable = useCallback(
    async (envName: string, index: number, enabled: boolean) => {
      if (!folderPath) return;
      try {
        await toggleEnvVariable(folderPath, envName, index, enabled);
        setEnvironments((prev) =>
          prev.map((e) => {
            if (e.name !== envName) return e;
            return {
              ...e,
              variables: e.variables.map((v) =>
                v.index === index ? { ...v, enabled } : v
              ),
            };
          })
        );
      } catch (err) {
        console.error("Failed to toggle variable", err);
      }
    },
    [folderPath]
  );

  const handleAddVariable = useCallback(
    async (envName: string, key: string, value: string) => {
      if (!folderPath) return;
      try {
        const updated = await addEnvVariable(folderPath, envName, key, value);
        setEnvironments((prev) =>
          prev.map((e) => (e.name === envName ? { ...e, variables: updated } : e))
        );
      } catch (err) {
        console.error("Failed to add variable", err);
      }
    },
    [folderPath]
  );

  const handleUpdateVariable = useCallback(
    async (envName: string, index: number, newKey: string, newValue: string) => {
      if (!folderPath) return;
      try {
        const updated = await updateEnvVariable(folderPath, envName, index, newKey, newValue);
        setEnvironments((prev) =>
          prev.map((e) => (e.name === envName ? { ...e, variables: updated } : e))
        );
      } catch (err) {
        console.error("Failed to update variable", err);
      }
    },
    [folderPath]
  );

  const handleDeleteVariable = useCallback(
    async (envName: string, index: number) => {
      if (!folderPath) return;
      try {
        const updated = await deleteEnvVariable(folderPath, envName, index);
        setEnvironments((prev) =>
          prev.map((e) => (e.name === envName ? { ...e, variables: updated } : e))
        );
      } catch (err) {
        console.error("Failed to delete variable", err);
      }
    },
    [folderPath]
  );

  const handleCreateEnv = useCallback(
    async (name: string) => {
      if (!folderPath) return;
      try {
        await createEnvFile(folderPath, name);
        await loadEnvs();
      } catch (err) {
        console.error("Failed to create env file", err);
      }
    },
    [folderPath, loadEnvs]
  );

  const handleRenameEnv = useCallback(
    async (oldName: string, newName: string) => {
      if (!folderPath) return;
      try {
        await renameEnvFile(folderPath, oldName, newName);
        const oldTabId = `env-tab-${oldName}`;
        const newTabId = `env-tab-${newName}`;
        setOpenTabs((prev) =>
          prev.map((t) =>
            t.id === oldTabId ? { ...t, id: newTabId, name: newName } : t
          )
        );
        if (activeTabId === oldTabId) setActiveTabId(newTabId);
        await loadEnvs();
      } catch (err) {
        console.error("Failed to rename env file", err);
      }
    },
    [folderPath, loadEnvs, activeTabId]
  );

  const handleDeleteEnv = useCallback(
    async (envName: string) => {
      if (!folderPath) return;
      try {
        await deleteEnvFile(folderPath, envName);
        const tabId = `env-tab-${envName}`;
        setOpenTabs((prev) => {
          const next = prev.filter((t) => t.id !== tabId);
          if (activeTabId === tabId) {
            setActiveTabId(next.length > 0 ? next[next.length - 1].id : null);
          }
          return next;
        });
        await loadEnvs();
      } catch (err) {
        console.error("Failed to delete env file", err);
      }
    },
    [folderPath, loadEnvs, activeTabId]
  );

  const handleCloseTab = useCallback(
    (id: string) => {
      setOpenTabs((prev) => {
        const next = prev.filter((t) => t.id !== id);
        if (activeTabId === id) {
          setActiveTabId(next.length > 0 ? next[next.length - 1].id : null);
        }
        return next;
      });
    },
    [activeTabId]
  );

  const handleNewTab = useCallback(() => {
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "w") {
        e.preventDefault();
        if (activeTabId) handleCloseTab(activeTabId);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeTabId, handleCloseTab]);

  const activeTab = openTabs.find((t) => t.id === activeTabId) ?? null;

  const activeRequest =
    activeTab?.kind === "request"
      ? findRequestInTree(collections, activeTab.id)
      : null;

  const activeEnvName =
    activeTab?.kind === "environment"
      ? activeTab.id.replace("env-tab-", "")
      : null;

  const activeEnvironment =
    activeEnvName ? environments.find((e) => e.name === activeEnvName) ?? null : null;

  const conflictingKeys = useMemo(() => {
    const keyCounts = new Map<string, number>();
    for (const env of environments) {
      if (!env.isEnabled) continue;
      for (const v of env.variables) {
        if (!v.enabled) continue;
        keyCounts.set(v.key, (keyCounts.get(v.key) ?? 0) + 1);
      }
    }
    const conflicts = new Set<string>();
    for (const [key, count] of keyCounts) {
      if (count > 1) conflicts.add(key);
    }
    return conflicts;
  }, [environments]);

  return (
    <div className="flex h-full flex-1 overflow-hidden">
      <ActivityBar
        activeTab={activeActivity}
        onTabChange={setActiveActivity}
        onRefresh={async () => {
          await Promise.all([
            refreshFileTree(),
            loadEnvs(),
            loadCollections(),
          ]);
        }}
      />

      <ResizablePanel defaultWidth={260} minWidth={180} maxWidth={420}>
        {activeActivity === "collections" && (
          <CollectionPanel
            collections={collections}
            selectedRequestId={activeTab?.kind === "request" ? activeTabId : null}
            onSelectRequest={handleSelectRequest}
            onSelectFolder={handleSelectFolder}
            onSelectCollection={handleSelectCollection}
            onCreateFolder={handleCreateFolder}
            onCreateCollection={handleCreateCollection}
            onRenameFolder={handleRenameFolder}
            onRenameCollection={handleRenameCollection}
            onRenameRequest={handleRenameRequest}
            onDeleteItem={handleDeleteCollectionItem}
            onDeleteRequest={handleDeleteRequest}
            onMoveItem={handleMoveCollectionItem}
            onMoveRequest={handleMoveRequest}
            onAddRequest={handleAddRequest}
            onAddWebSocket={handleAddWebSocket}
          />
        )}
        {activeActivity === "environments" && (
          <EnvironmentPanel
            environments={environments}
            activeEnvName={activeEnvName}
            onSelectEnv={handleSelectEnv}
            onToggleEnv={handleToggleEnv}
            onCreateEnv={handleCreateEnv}
            onRenameEnv={handleRenameEnv}
            onDeleteEnv={handleDeleteEnv}
          />
        )}
        {activeActivity === "history" && (
          <div className="flex h-full flex-col border-r border-border bg-background select-none">
            <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">
                History
              </span>
              {history.length > 0 && (
                <button
                  onClick={handleClearHistory}
                  className="text-muted-foreground/50 hover:text-red-500 transition-colors cursor-pointer"
                  title="Clear history"
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </div>
            {history.length === 0 ? (
              <div className="flex flex-1 items-center justify-center">
                <p className="text-[13px] text-muted-foreground/50 italic">No history yet</p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto">
                {history.map((entry) => (
                  <div
                    key={entry.id}
                    className="group flex w-full items-center gap-2 border-b border-border/50 px-3 py-2 text-left hover:bg-muted/40 transition-colors cursor-pointer"
                    title={entry.url}
                    onClick={() => handleSelectHistoryEntry(entry)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === "Enter") handleSelectHistoryEntry(entry); }}
                  >
                    <span className={`text-[10px] font-bold uppercase shrink-0 w-12 ${HISTORY_METHOD_COLORS[entry.method] ?? "text-muted-foreground"}`}>
                      {entry.method}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-[12px] text-foreground/80">
                        {entry.url}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {entry.status != null ? (
                          <span className={`text-[10px] font-medium ${entry.status < 300 ? "text-emerald-500" : entry.status < 400 ? "text-amber-500" : "text-red-500"}`}>
                            {entry.status}
                          </span>
                        ) : (
                          <span className="text-[10px] text-red-400">Error</span>
                        )}
                        {entry.timeMs != null && (
                          <span className="text-[10px] text-muted-foreground/50">{entry.timeMs}ms</span>
                        )}
                        <span className="text-[10px] text-muted-foreground/40">
                          {formatHistoryTime(entry.timestamp)}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteHistoryEntry(entry.id);
                      }}
                      className="shrink-0 text-muted-foreground/30 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                      title="Delete entry"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </ResizablePanel>

      <div className="flex flex-1 flex-col overflow-hidden">
        <RequestTabBar
          tabs={openTabs}
          activeTabId={activeTabId}
          onSelectTab={setActiveTabId}
          onCloseTab={handleCloseTab}
          onNewTab={handleNewTab}
          onRenameTab={(tab, newName) => {
            const relPath =
              tab.collectionRelPath ||
              findRequestInTree(collections, tab.id)?.collectionFile;
            if (relPath) {
              handleRenameRequest(tab.id, relPath, newName);
            } else {
              console.error("Cannot rename: collectionRelPath not found for", tab.id);
            }
          }}
        />

        <div className="flex-1 overflow-hidden">
          {activeTab?.kind === "environment" && activeEnvironment ? (
            <EnvironmentEditor
              environment={activeEnvironment}
              conflictingKeys={conflictingKeys}
              onToggleVariable={(index, enabled) =>
                handleToggleVariable(activeEnvironment.name, index, enabled)
              }
              onAddVariable={(key, value) =>
                handleAddVariable(activeEnvironment.name, key, value)
              }
              onUpdateVariable={(index, newKey, newValue) =>
                handleUpdateVariable(activeEnvironment.name, index, newKey, newValue)
              }
              onDeleteVariable={(index) =>
                handleDeleteVariable(activeEnvironment.name, index)
              }
            />
          ) : activeTab?.kind === "folder-readme" && folderPath ? (
            <FolderReadmeView
              key={activeTab.id}
              folderRelPath={activeTab.folderRelPath}
              folderName={activeTab.name}
              workspacePath={folderPath}
              activeEnvVars={activeEnvVars}
            />
          ) : activeTab?.kind === "collection-doc" && folderPath ? (
            <CollectionDocView
              key={activeTab.id}
              collectionRelPath={activeTab.collectionRelPath}
              collectionName={activeTab.name}
              initialDescription={(() => {
                const findCol = (items: CollectionTreeItem[]): string | null | undefined => {
                  for (const item of items) {
                    if (item.type === "collection" && item.relPath === activeTab.collectionRelPath) return item.description;
                    if (item.type === "folder") { const r = findCol(item.children); if (r !== undefined) return r; }
                  }
                  return undefined;
                };
                return findCol(collections) ?? null;
              })()}
              workspacePath={folderPath}
              activeEnvVars={activeEnvVars}
              onDescriptionChange={(desc) => {
                setCollections(prev => {
                  const update = (items: CollectionTreeItem[]): CollectionTreeItem[] =>
                    items.map(item =>
                      item.type === "folder"
                        ? { ...item, children: update(item.children) }
                        : item.relPath === activeTab.collectionRelPath
                          ? { ...item, description: desc }
                          : item
                    );
                  return update(prev);
                });
              }}
            />
          ) : activeRequest?.method === "WS" ? (
            <WebSocketEditor
              key={activeRequest.id}
              connectionId={activeRequest.id}
              collectionRelPath={activeRequest.collectionFile}
              workspacePath={folderPath}
              environments={environments}
              onOpenEnvTab={handleSelectEnv}
            />
          ) : activeTab?.kind === "history-request" ? (
            <RequestEditor
              key={activeTab.id}
              requestId={null}
              collectionRelPath={null}
              workspacePath={folderPath}
              environments={environments}
              onOpenEnvTab={handleSelectEnv}
              onHistoryEntry={handleHistoryEntry}
              historyInitialData={{
                method: activeTab.historyEntry.method,
                url: activeTab.historyEntry.url,
                headers: activeTab.historyEntry.headers?.map((h) => ({ key: h.key, value: h.value, enabled: h.enabled })) ?? [],
                params: activeTab.historyEntry.params?.map((p) => ({ key: p.key, value: p.value, enabled: p.enabled })) ?? [],
                bodyType: activeTab.historyEntry.body?.type ?? "none",
                bodyContent: activeTab.historyEntry.body?.content ?? "",
              }}
            />
          ) : (
            <RequestEditor
              requestId={activeRequest?.id ?? null}
              collectionRelPath={activeRequest?.collectionFile ?? null}
              workspacePath={folderPath}
              environments={environments}
              onOpenEnvTab={handleSelectEnv}
              onHistoryEntry={handleHistoryEntry}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export function WorkspaceView() {
  const { quack, isLoading } = useWorkspace();

  return (
    <div className="flex h-full flex-col">
      {isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : quack.isQuackInitialized ? (
        <WorkspaceContent />
      ) : (
        <InitPrompt />
      )}
    </div>
  );
}
