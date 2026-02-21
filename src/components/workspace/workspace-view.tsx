"use client";

import { Button } from "@/components/ui/button";
import { ResizablePanel } from "@/components/ui/resizable-panel";
import { useWorkspace } from "@/context";
import {
  listCollections,
  type CollectionRequestSummary,
  type CollectionTreeItem,
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
import { Loader2, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityBar, type ActivityTab } from "./activity-bar";
import { CollectionPanel } from "./collection-panel";
import { EnvironmentEditor } from "./environment-editor";
import { EnvironmentPanel } from "./environment-panel";
import { RequestEditor } from "./request-editor";
import {
  RequestTabBar,
  type EnvironmentTabItem,
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

function WorkspaceContent() {
  const { folderPath } = useWorkspace();
  const [activeActivity, setActiveActivity] = useState<ActivityTab>("collections");
  const [openTabs, setOpenTabs] = useState<TabItem[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [environments, setEnvironments] = useState<EnvFile[]>([]);
  const [collections, setCollections] = useState<CollectionTreeItem[]>([]);

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
          };
          setOpenTabs((prev) => [...prev, newTab]);
        }
      }
      setActiveTabId(id);
    },
    [openTabs, collections]
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
        onRefresh={() => {
          loadEnvs();
          loadCollections();
        }}
      />

      <ResizablePanel defaultWidth={260} minWidth={180} maxWidth={420}>
        {activeActivity === "collections" && (
          <CollectionPanel
            collections={collections}
            selectedRequestId={activeTab?.kind === "request" ? activeTabId : null}
            onSelectRequest={handleSelectRequest}
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
          <div className="flex h-full flex-col border-r border-border bg-sidebar select-none">
            <div className="flex items-center border-b border-border px-3 py-2.5">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">
                History
              </span>
            </div>
            <div className="flex flex-1 items-center justify-center">
              <p className="text-[13px] text-muted-foreground/50 italic">No history yet</p>
            </div>
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
          ) : (
            <RequestEditor requestName={activeRequest?.name ?? null} />
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
