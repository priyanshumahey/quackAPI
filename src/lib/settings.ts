import type { Store } from "@tauri-apps/plugin-store";
import type { AuthConfig, HistoryEntry } from "./types";

export interface RecentFolder {
    path: string;
    name: string;
    lastOpenedAt: string;
}

export interface PinnedWorkspace {
    path: string;
    name: string;
    initials: string;
    emoji?: string;
    pinnedAt: string;
}

export type AppScope = "global" | "workspace";

export interface AppSettings {
    lastOpenedFolder: string | null;
    lastOpenedAt: string | null;
    recentFolders: RecentFolder[];
    pinnedWorkspaces: PinnedWorkspace[];
    lastScope: AppScope;
    sidebarExpanded: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
    lastOpenedFolder: null,
    lastOpenedAt: null,
    recentFolders: [],
    pinnedWorkspaces: [],
    lastScope: "global",
    sidebarExpanded: false,
};

const KEYS = {
    LAST_OPENED_FOLDER: "lastOpenedFolder",
    LAST_OPENED_AT: "lastOpenedAt",
    RECENT_FOLDERS: "recentFolders",
    PINNED_WORKSPACES: "pinnedWorkspaces",
    LAST_SCOPE: "lastScope",
    SIDEBAR_EXPANDED: "sidebarExpanded",
    REQUEST_HISTORY: "requestHistory",
} as const;

const STORE_FILE = "settings.json";
const MAX_RECENT_FOLDERS = 10;
const MAX_HISTORY_ENTRIES = 50;

let storeInstance: Store | null = null;
let storeInitPromise: Promise<Store | null> | null = null;

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getStore(): Promise<Store | null> {
    if (storeInstance) return storeInstance;
    if (storeInitPromise) return storeInitPromise;

    storeInitPromise = (async () => {
        if (typeof window === "undefined") return null;

        const maxRetries = 5;
        const retryDelay = 100;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const { load } = await import("@tauri-apps/plugin-store");
                storeInstance = await load(STORE_FILE);
                return storeInstance;
            } catch {
                if (attempt < maxRetries) {
                    await delay(retryDelay * attempt);
                }
            }
        }

        storeInitPromise = null;
        return null;
    })();

    return storeInitPromise;
}

export async function getSettings(): Promise<AppSettings> {
    try {
        const store = await getStore();
        if (!store) return DEFAULT_SETTINGS;

        const lastOpenedFolder = await store.get<string>(KEYS.LAST_OPENED_FOLDER);
        const lastOpenedAt = await store.get<string>(KEYS.LAST_OPENED_AT);
        const recentFolders = await store.get<RecentFolder[]>(KEYS.RECENT_FOLDERS);
        const pinnedWorkspaces = await store.get<PinnedWorkspace[]>(KEYS.PINNED_WORKSPACES);
        const lastScope = await store.get<AppScope>(KEYS.LAST_SCOPE);
        const sidebarExpanded = await store.get<boolean>(KEYS.SIDEBAR_EXPANDED);

        return {
            lastOpenedFolder: lastOpenedFolder ?? null,
            lastOpenedAt: lastOpenedAt ?? null,
            recentFolders: recentFolders ?? [],
            pinnedWorkspaces: pinnedWorkspaces ?? [],
            lastScope: lastScope ?? "global",
            sidebarExpanded: sidebarExpanded ?? false,
        };
    } catch {
        return DEFAULT_SETTINGS;
    }
}

export async function getLastOpenedFolder(): Promise<string | null> {
    try {
        const store = await getStore();
        if (!store) return null;
        return (await store.get<string>(KEYS.LAST_OPENED_FOLDER)) ?? null;
    } catch {
        return null;
    }
}

export async function getRecentFolders(): Promise<RecentFolder[]> {
    try {
        const store = await getStore();
        if (!store) return [];
        return (await store.get<RecentFolder[]>(KEYS.RECENT_FOLDERS)) ?? [];
    } catch {
        return [];
    }
}

export async function getLastScope(): Promise<AppScope> {
    try {
        const store = await getStore();
        if (!store) return "global";
        return (await store.get<AppScope>(KEYS.LAST_SCOPE)) ?? "global";
    } catch {
        return "global";
    }
}

export async function saveLastOpenedFolder(
    folderPath: string,
    folderName: string
): Promise<void> {
    try {
        const store = await getStore();
        if (!store) return;

        const now = new Date().toISOString();

        await store.set(KEYS.LAST_OPENED_FOLDER, folderPath);
        await store.set(KEYS.LAST_OPENED_AT, now);

        const existing =
            (await store.get<RecentFolder[]>(KEYS.RECENT_FOLDERS)) ?? [];
        const filtered = existing.filter((f) => f.path !== folderPath);
        const updated: RecentFolder[] = [
            { path: folderPath, name: folderName, lastOpenedAt: now },
            ...filtered,
        ].slice(0, MAX_RECENT_FOLDERS);

        await store.set(KEYS.RECENT_FOLDERS, updated);
        await store.save();
    } catch {}
}

export async function clearLastOpenedFolder(): Promise<void> {
    try {
        const store = await getStore();
        if (!store) return;

        await store.set(KEYS.LAST_OPENED_FOLDER, null);
        await store.set(KEYS.LAST_OPENED_AT, null);
        await store.save();
    } catch {}
}

export async function removeFromRecentFolders(
    folderPath: string
): Promise<void> {
    try {
        const store = await getStore();
        if (!store) return;

        const existing =
            (await store.get<RecentFolder[]>(KEYS.RECENT_FOLDERS)) ?? [];
        const filtered = existing.filter((f) => f.path !== folderPath);
        await store.set(KEYS.RECENT_FOLDERS, filtered);
        await store.save();
    } catch {}
}

export async function saveLastScope(scope: AppScope): Promise<void> {
    try {
        const store = await getStore();
        if (!store) return;

        await store.set(KEYS.LAST_SCOPE, scope);
        await store.save();
    } catch {}
}

export async function checkFolderExists(folderPath: string): Promise<boolean> {
    try {
        if (typeof window === "undefined") return false;
        const { invoke } = await import("@tauri-apps/api/core");
        return await invoke<boolean>("check_folder_exists", { path: folderPath });
    } catch {
        return false;
    }
}

export function deriveInitials(name: string): string {
    const parts = name.replace(/[^a-zA-Z0-9\s-_]/g, "").split(/[\s\-_]+/);
    if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
}

export async function getPinnedWorkspaces(): Promise<PinnedWorkspace[]> {
    try {
        const store = await getStore();
        if (!store) return [];
        return (await store.get<PinnedWorkspace[]>(KEYS.PINNED_WORKSPACES)) ?? [];
    } catch {
        return [];
    }
}

export async function pinWorkspace(
    folderPath: string,
    folderName: string,
    emoji?: string
): Promise<PinnedWorkspace[]> {
    try {
        const store = await getStore();
        if (!store) return [];

        const existing =
            (await store.get<PinnedWorkspace[]>(KEYS.PINNED_WORKSPACES)) ?? [];

        if (existing.some((p) => p.path === folderPath)) return existing;

        const pinned: PinnedWorkspace = {
            path: folderPath,
            name: folderName,
            initials: deriveInitials(folderName),
            emoji,
            pinnedAt: new Date().toISOString(),
        };

        const updated = [...existing, pinned];
        await store.set(KEYS.PINNED_WORKSPACES, updated);
        await store.save();
        return updated;
    } catch {
        return [];
    }
}

export async function unpinWorkspace(
    folderPath: string
): Promise<PinnedWorkspace[]> {
    try {
        const store = await getStore();
        if (!store) return [];

        const existing =
            (await store.get<PinnedWorkspace[]>(KEYS.PINNED_WORKSPACES)) ?? [];
        const filtered = existing.filter((p) => p.path !== folderPath);
        await store.set(KEYS.PINNED_WORKSPACES, filtered);
        await store.save();
        return filtered;
    } catch {
        return [];
    }
}

export async function saveSidebarExpanded(expanded: boolean): Promise<void> {
    try {
        const store = await getStore();
        if (!store) return;

        await store.set(KEYS.SIDEBAR_EXPANDED, expanded);
        await store.save();
    } catch {}
}

// ── Request History ─────────────────────────────────────────────────────────

export async function getRequestHistory(): Promise<HistoryEntry[]> {
    try {
        const store = await getStore();
        if (!store) return [];
        return (await store.get<HistoryEntry[]>(KEYS.REQUEST_HISTORY)) ?? [];
    } catch {
        return [];
    }
}

export async function addHistoryEntry(entry: HistoryEntry): Promise<HistoryEntry[]> {
    try {
        const store = await getStore();
        if (!store) return [];

        const existing =
            (await store.get<HistoryEntry[]>(KEYS.REQUEST_HISTORY)) ?? [];
        const updated = [entry, ...existing].slice(0, MAX_HISTORY_ENTRIES);
        await store.set(KEYS.REQUEST_HISTORY, updated);
        await store.save();
        return updated;
    } catch {
        return [];
    }
}

export async function deleteHistoryEntry(entryId: string): Promise<HistoryEntry[]> {
    try {
        const store = await getStore();
        if (!store) return [];

        const existing =
            (await store.get<HistoryEntry[]>(KEYS.REQUEST_HISTORY)) ?? [];
        const updated = existing.filter((e) => e.id !== entryId);
        await store.set(KEYS.REQUEST_HISTORY, updated);
        await store.save();
        return updated;
    } catch {
        return [];
    }
}

export async function clearRequestHistory(): Promise<void> {
    try {
        const store = await getStore();
        if (!store) return;

        await store.set(KEYS.REQUEST_HISTORY, []);
        await store.save();
    } catch {}
}

// ── Per-request Auth Config ─────────────────────────────────────────────────

function authKey(requestId: string): string {
    return `auth:${requestId}`;
}

export async function getAuthConfig(requestId: string): Promise<AuthConfig> {
    try {
        const store = await getStore();
        if (!store) return { type: "none" };
        return (await store.get<AuthConfig>(authKey(requestId))) ?? { type: "none" };
    } catch {
        return { type: "none" };
    }
}

export async function saveAuthConfig(
    requestId: string,
    config: AuthConfig
): Promise<void> {
    try {
        const store = await getStore();
        if (!store) return;

        await store.set(authKey(requestId), config);
        await store.save();
    } catch {}
}
