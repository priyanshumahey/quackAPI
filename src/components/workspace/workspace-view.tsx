"use client";

import { Button } from "@/components/ui/button";
import { ResizablePanel } from "@/components/ui/resizable-panel";
import { useWorkspace } from "@/context";
import { Loader2, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ActivityBar, type ActivityTab } from "./activity-bar";
import { CollectionPanel } from "./collection-panel";
import { EnvironmentEditor } from "./environment-editor";
import { EnvironmentPanel } from "./environment-panel";
import {
  MOCK_COLLECTIONS,
  MOCK_ENVIRONMENTS,
  type MockFolder,
  type MockRequest,
} from "./mock-data";
import { RequestEditor } from "./request-editor";
import {
  RequestTabBar,
  type EnvironmentTabItem,
  type RequestTabItem,
  type TabItem,
} from "./request-tab-bar";

function findRequestInTree(
  items: (MockFolder | MockRequest)[],
  id: string
): MockRequest | null {
  for (const item of items) {
    if (item.type === "request" && item.id === id) return item;
    if (item.type === "folder") {
      const found = findRequestInTree(item.children, id);
      if (found) return found;
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
  const [activeActivity, setActiveActivity] = useState<ActivityTab>("collections");
  const [openTabs, setOpenTabs] = useState<TabItem[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [enabledEnvIds, setEnabledEnvIds] = useState<Set<string>>(
    () => new Set(MOCK_ENVIRONMENTS.filter((e) => e.isActive).map((e) => e.id))
  );

  const handleSelectRequest = useCallback(
    (id: string) => {
      if (!openTabs.some((t) => t.id === id)) {
        const req = findRequestInTree(MOCK_COLLECTIONS, id);
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
    [openTabs]
  );

  const handleSelectEnv = useCallback(
    (id: string) => {
      const tabId = `env-tab-${id}`;
      if (!openTabs.some((t) => t.id === tabId)) {
        const env = MOCK_ENVIRONMENTS.find((e) => e.id === id);
        if (env) {
          const newTab: EnvironmentTabItem = {
            id: tabId,
            kind: "environment",
            name: env.name,
          };
          setOpenTabs((prev) => [...prev, newTab]);
        }
      }
      setActiveTabId(tabId);
    },
    [openTabs]
  );

  const handleToggleEnv = useCallback((id: string) => {
    setEnabledEnvIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

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
    /* Stub: in the future this would open a blank new request */
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
      ? findRequestInTree(MOCK_COLLECTIONS, activeTab.id)
      : null;

  const activeEnvironment =
    activeTab?.kind === "environment"
      ? MOCK_ENVIRONMENTS.find(
        (e) => `env-tab-${e.id}` === activeTab.id
      ) ?? null
      : null;

  const selectedEnvIdForPanel =
    activeTab?.kind === "environment"
      ? activeTab.id.replace("env-tab-", "")
      : null;

  return (
    <div className="flex h-full flex-1 overflow-hidden">
      <ActivityBar
        activeTab={activeActivity}
        onTabChange={setActiveActivity}
        onRefresh={() => {
          console.log("Resync triggered");
        }}
      />

      <ResizablePanel defaultWidth={260} minWidth={180} maxWidth={420}>
        {activeActivity === "collections" && (
          <CollectionPanel
            selectedRequestId={activeTab?.kind === "request" ? activeTabId : null}
            onSelectRequest={handleSelectRequest}
          />
        )}
        {activeActivity === "environments" && (
          <EnvironmentPanel
            activeEnvId={selectedEnvIdForPanel}
            onSelectEnv={handleSelectEnv}
            enabledEnvIds={enabledEnvIds}
            onToggleEnv={handleToggleEnv}
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
          {activeTab?.kind === "environment" ? (
            <EnvironmentEditor environment={activeEnvironment} />
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
