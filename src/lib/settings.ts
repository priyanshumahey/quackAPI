import type { Store } from "@tauri-apps/plugin-store";

export interface RecentFolder {
    path: string;
    name: string;
    lastOpenedAt: string;
}

export type AppScope = "global" | "workspace";

export interface AppSettings {
    lastOpenedFolder: string | null;
    lastOpenedAt: string | null;
    recentFolders: RecentFolder[];
    lastScope: AppScope;
}

const DEFAULT_SETTINGS: AppSettings = {
    lastOpenedFolder: null,
    lastOpenedAt: null,
    recentFolders: [],
    lastScope: "global",
};

const KEYS = {
    LAST_OPENED_FOLDER: "lastOpenedFolder",
    LAST_OPENED_AT: "lastOpenedAt",
    RECENT_FOLDERS: "recentFolders",
    LAST_SCOPE: "lastScope",
} as const;

const STORE_FILE = "settings.json";
const MAX_RECENT_FOLDERS = 10;

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
        const lastScope = await store.get<AppScope>(KEYS.LAST_SCOPE);

        return {
            lastOpenedFolder: lastOpenedFolder ?? null,
            lastOpenedAt: lastOpenedAt ?? null,
            recentFolders: recentFolders ?? [],
            lastScope: lastScope ?? "global",
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
