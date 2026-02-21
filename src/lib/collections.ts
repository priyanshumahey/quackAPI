import type { HttpMethod } from "@/lib/types";

export interface CollectionRequestSummary {
    id: string;
    name: string;
    method: HttpMethod;
    collectionFile: string;
}

export interface CollectionFolder {
    type: "folder";
    id: string;
    name: string;
    children: CollectionTreeItem[];
}

export interface CollectionEntry {
    type: "collection";
    id: string;
    name: string;
    fileName: string;
    requests: CollectionRequestSummary[];
}

export type CollectionTreeItem = CollectionFolder | CollectionEntry;

async function invoke<T>(cmd: string, args: Record<string, unknown>): Promise<T> {
    const { invoke: tauriInvoke } = await import("@tauri-apps/api/core");
    return tauriInvoke<T>(cmd, args);
}

export async function listCollections(workspacePath: string): Promise<CollectionTreeItem[]> {
    return invoke<CollectionTreeItem[]>("list_collections", { workspacePath });
}
