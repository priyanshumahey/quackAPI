"use client";

import {
  checkFolderExists,
  clearLastOpenedFolder,
  getPinnedWorkspaces,
  getRecentFolders,
  getSettings,
  pinWorkspace,
  removeFromRecentFolders,
  saveLastOpenedFolder,
  saveLastScope,
  saveSidebarExpanded,
  unpinWorkspace,
  type AppScope,
  type PinnedWorkspace,
  type RecentFolder,
} from "@/lib/settings";
import type {
  Collection,
  EnvironmentVariable,
  WorkspaceData,
} from "@/lib/types";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export interface FileEntry {
  name: string;
  path: string;
  type: "file" | "folder";
  children: FileEntry[] | null;
  isLoaded: boolean;
}

export interface WorkspaceState {
  isInitialized: boolean;
  isLoading: boolean;
  scope: AppScope;
  folderPath: string | null;
  folderName: string | null;
  fileTree: FileEntry[];
  recentFolders: RecentFolder[];
  pinnedWorkspaces: PinnedWorkspace[];
  sidebarExpanded: boolean;
  error: string | null;
  quack: WorkspaceData;
}

export interface WorkspaceContextValue extends WorkspaceState {
  openFolder: () => Promise<void>;
  openFolderByPath: (path: string) => Promise<void>;
  closeFolder: () => Promise<void>;
  goHome: () => Promise<void>;
  expandFolder: (path: string) => Promise<FileEntry[] | null>;
  removeFromRecent: (folderPath: string) => Promise<void>;
  refreshFileTree: () => Promise<void>;
  initWorkspace: () => Promise<void>;
  pinCurrentWorkspace: (emoji?: string) => Promise<void>;
  unpinWorkspaceByPath: (folderPath: string) => Promise<void>;
  isCurrentWorkspacePinned: () => boolean;
  toggleSidebar: () => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider");
  }
  return ctx;
}

const DEFAULT_QUACK: WorkspaceData = {
  isQuackInitialized: false,
  collections: [],
  environments: {},
  activeEnvironment: null,
};

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WorkspaceState>({
    isInitialized: false,
    isLoading: true,
    scope: "global",
    folderPath: null,
    folderName: null,
    fileTree: [],
    recentFolders: [],
    pinnedWorkspaces: [],
    sidebarExpanded: false,
    error: null,
    quack: DEFAULT_QUACK,
  });

  const getTauriApis = useCallback(async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    const { open } = await import("@tauri-apps/plugin-dialog");
    const { listen } = await import("@tauri-apps/api/event");
    return { invoke, open, listen };
  }, []);

  const loadQuackData = useCallback(
    async (folderPath: string): Promise<WorkspaceData> => {
      const { invoke } = await getTauriApis();
      const initialized = await invoke<boolean>("check_quack_initialized", {
        workspacePath: folderPath,
      });

      if (!initialized) return DEFAULT_QUACK;

      const raw = await invoke<{
        collections: { id: string; name: string; requests: unknown }[];
        environments: { name: string; variables: { key: string; value: string }[] }[];
      }>("load_quack_workspace", { workspacePath: folderPath });

      const collections: Collection[] = raw.collections.map((c) => ({
        id: c.id,
        name: c.name,
        requests: Array.isArray(c.requests) ? c.requests as Collection["requests"] : [],
      }));

      const environments: Record<string, EnvironmentVariable[]> = {};
      for (const env of raw.environments) {
        environments[env.name] = env.variables;
      }

      return {
        isQuackInitialized: true,
        collections,
        environments,
        activeEnvironment: raw.environments[0]?.name ?? null,
      };
    },
    [getTauriApis],
  );

  useEffect(() => {
    const init = async () => {
      try {
        await new Promise((r) => setTimeout(r, 50));

        const settings = await getSettings();
        const recentFolders = settings.recentFolders;
        const pinnedWorkspaces = settings.pinnedWorkspaces;
        const sidebarExpanded = settings.sidebarExpanded;

        let restoredScope: AppScope = settings.lastScope ?? "global";
        let restoredPath: string | null = null;
        let restoredName: string | null = null;
        let restoredTree: FileEntry[] = [];
        let restoredQuack: WorkspaceData = DEFAULT_QUACK;

        if (restoredScope === "workspace" && settings.lastOpenedFolder) {
          const exists = await checkFolderExists(settings.lastOpenedFolder);
          if (exists) {
            restoredPath = settings.lastOpenedFolder;
            restoredName =
              settings.lastOpenedFolder.split("/").pop() ??
              settings.lastOpenedFolder;
            try {
              const { invoke } = await getTauriApis();
              restoredTree = await invoke<FileEntry[]>("read_directory", {
                path: restoredPath,
              });
            } catch { }

            try {
              restoredQuack = await loadQuackData(restoredPath);
            } catch { }
          } else {
            await clearLastOpenedFolder();
            restoredScope = "global";
          }
        }

        setState({
          isInitialized: true,
          isLoading: false,
          scope: restoredScope,
          folderPath: restoredPath,
          folderName: restoredName,
          fileTree: restoredTree,
          recentFolders,
          pinnedWorkspaces,
          sidebarExpanded,
          error: null,
          quack: restoredQuack,
        });
      } catch (err) {
        setState({
          isInitialized: true,
          isLoading: false,
          scope: "global",
          folderPath: null,
          folderName: null,
          fileTree: [],
          recentFolders: [],
          pinnedWorkspaces: [],
          sidebarExpanded: false,
          error: err instanceof Error ? err.message : String(err),
          quack: DEFAULT_QUACK,
        });
      }
    };

    init();
  }, []);

  const openFolderByPath = useCallback(
    async (path: string) => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const { invoke } = await getTauriApis();
        const fileTree = await invoke<FileEntry[]>("read_directory", { path });
        const folderName = path.split("/").pop() ?? path;

        await saveLastOpenedFolder(path, folderName);
        await saveLastScope("workspace");

        const recentFolders = await getRecentFolders();
        const pinnedWorkspaces = await getPinnedWorkspaces();
        let quack = DEFAULT_QUACK;
        try {
          quack = await loadQuackData(path);
        } catch { }

        setState((prev) => ({
          isInitialized: true,
          isLoading: false,
          scope: "workspace",
          folderPath: path,
          folderName,
          fileTree,
          recentFolders,
          pinnedWorkspaces,
          sidebarExpanded: prev.sidebarExpanded,
          error: null,
          quack,
        }));
      } catch (err) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: err instanceof Error ? err.message : String(err),
        }));
      }
    },
    [getTauriApis],
  );

  const openFolder = useCallback(async () => {
    try {
      const { open } = await getTauriApis();
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Open Folder",
      });

      if (selected && typeof selected === "string") {
        await openFolderByPath(selected);
      }
    } catch (err) {
      setState((prev) => ({
        ...prev,
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }, [getTauriApis, openFolderByPath]);

  const closeFolder = useCallback(async () => {
    await clearLastOpenedFolder();
    await saveLastScope("global");

    setState((prev) => ({
      ...prev,
      scope: "global",
      folderPath: null,
      folderName: null,
      fileTree: [],
      error: null,
      quack: DEFAULT_QUACK,
    }));
  }, []);

  const goHome = useCallback(async () => {
    await saveLastScope("global");
    setState((prev) => ({
      ...prev,
      scope: "global",
      folderPath: null,
      folderName: null,
      fileTree: [],
      error: null,
      quack: DEFAULT_QUACK,
    }));
  }, []);

  const expandFolder = useCallback(
    async (path: string): Promise<FileEntry[] | null> => {
      try {
        const { invoke } = await getTauriApis();
        return await invoke<FileEntry[]>("expand_directory", { path });
      } catch {
        return null;
      }
    },
    [getTauriApis],
  );

  const removeFromRecent = useCallback(async (folderPath: string) => {
    await removeFromRecentFolders(folderPath);
    setState((prev) => ({
      ...prev,
      recentFolders: prev.recentFolders.filter((f) => f.path !== folderPath),
    }));
  }, []);

  const refreshFileTree = useCallback(async () => {
    if (state.folderPath) {
      await openFolderByPath(state.folderPath);
    }
  }, [state.folderPath, openFolderByPath]);

  const initWorkspace = useCallback(async () => {
    if (!state.folderPath) return;

    try {
      const { invoke } = await getTauriApis();
      await invoke("init_quack_workspace", { workspacePath: state.folderPath });
      const quack = await loadQuackData(state.folderPath);
      setState((prev) => ({ ...prev, quack }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }, [state.folderPath, getTauriApis, loadQuackData]);

  useEffect(() => {
    let unlistenOpen: (() => void) | undefined;
    let unlistenClose: (() => void) | undefined;

    const setup = async () => {
      try {
        const { listen } = await getTauriApis();
        unlistenOpen = await listen("menu-open-folder", () => {
          openFolder();
        });
        unlistenClose = await listen("menu-close-folder", () => {
          closeFolder();
        });
      } catch { }
    };

    setup();

    return () => {
      unlistenOpen?.();
      unlistenClose?.();
    };
  }, [getTauriApis, openFolder, closeFolder]);

  const pinCurrentWorkspace = useCallback(
    async (emoji?: string) => {
      if (!state.folderPath || !state.folderName) return;
      const updated = await pinWorkspace(state.folderPath, state.folderName, emoji);
      setState((prev) => ({ ...prev, pinnedWorkspaces: updated }));
    },
    [state.folderPath, state.folderName],
  );

  const unpinWorkspaceByPath = useCallback(async (folderPath: string) => {
    const updated = await unpinWorkspace(folderPath);
    setState((prev) => ({ ...prev, pinnedWorkspaces: updated }));
  }, []);

  const isCurrentWorkspacePinned = useCallback(() => {
    if (!state.folderPath) return false;
    return state.pinnedWorkspaces.some((p) => p.path === state.folderPath);
  }, [state.folderPath, state.pinnedWorkspaces]);

  const toggleSidebar = useCallback(() => {
    setState((prev) => {
      const next = !prev.sidebarExpanded;
      saveSidebarExpanded(next);
      return { ...prev, sidebarExpanded: next };
    });
  }, []);

  const value: WorkspaceContextValue = {
    ...state,
    openFolder,
    openFolderByPath,
    closeFolder,
    goHome,
    expandFolder,
    removeFromRecent,
    refreshFileTree,
    initWorkspace,
    pinCurrentWorkspace,
    unpinWorkspaceByPath,
    isCurrentWorkspacePinned,
    toggleSidebar,
  };

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}
