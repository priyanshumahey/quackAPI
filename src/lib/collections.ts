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
    relPath: string;
    children: CollectionTreeItem[];
}

export interface CollectionEntry {
    type: "collection";
    id: string;
    name: string;
    fileName: string;
    relPath: string;
    description: string | null;
    requests: CollectionRequestSummary[];
}

export type CollectionTreeItem = CollectionFolder | CollectionEntry;

async function invoke<T>(cmd: string, args: Record<string, unknown>): Promise<T> {
    for (const [key, value] of Object.entries(args)) {
        if (value === undefined) {
            throw new Error(`Argument "${key}" is undefined for command "${cmd}"`);
        }
    }
    const { invoke: tauriInvoke } = await import("@tauri-apps/api/core");
    return tauriInvoke<T>(cmd, args);
}

export async function listCollections(workspacePath: string): Promise<CollectionTreeItem[]> {
    return invoke<CollectionTreeItem[]>("list_collections", { workspacePath });
}

export async function createCollectionFolder(
    workspacePath: string,
    parentRelPath: string,
    name: string,
): Promise<void> {
    return invoke("create_collection_folder", { workspacePath, parentRelPath, name });
}

export async function createCollection(
    workspacePath: string,
    parentRelPath: string,
    name: string,
): Promise<void> {
    return invoke("create_collection", { workspacePath, parentRelPath, name });
}

export async function renameCollectionFolder(
    workspacePath: string,
    relPath: string,
    newName: string,
): Promise<void> {
    return invoke("rename_collection_folder", { workspacePath, relPath, newName });
}

export async function renameCollection(
    workspacePath: string,
    relPath: string,
    newName: string,
): Promise<void> {
    return invoke("rename_collection", { workspacePath, relPath, newName });
}

export async function deleteCollectionItem(
    workspacePath: string,
    relPath: string,
): Promise<void> {
    return invoke("delete_collection_item", { workspacePath, relPath });
}

export async function addRequestToCollection(
    workspacePath: string,
    collectionRelPath: string,
    name: string,
    method: string,
): Promise<string> {
    return invoke<string>("add_request_to_collection", { workspacePath, collectionRelPath, name, method });
}

export async function moveCollectionItem(
    workspacePath: string,
    itemRelPath: string,
    destParentRelPath: string,
): Promise<void> {
    return invoke("move_collection_item", { workspacePath, itemRelPath, destParentRelPath });
}

export async function moveRequestToCollection(
    workspacePath: string,
    requestId: string,
    sourceCollectionRelPath: string,
    destCollectionRelPath: string,
): Promise<void> {
    return invoke("move_request_to_collection", {
        workspacePath,
        requestId,
        sourceCollectionRelPath,
        destCollectionRelPath,
    });
}

export async function renameRequest(
    workspacePath: string,
    collectionRelPath: string,
    requestId: string,
    newName: string,
): Promise<void> {
    return invoke("rename_request", { workspacePath, collectionRelPath, requestId, newName });
}

export async function deleteRequest(
    workspacePath: string,
    collectionRelPath: string,
    requestId: string,
): Promise<void> {
    return invoke("delete_request", { workspacePath, collectionRelPath, requestId });
}

export async function updateCollectionDescription(
    workspacePath: string,
    collectionRelPath: string,
    description: string | null,
): Promise<void> {
    return invoke("update_collection_description", { workspacePath, collectionRelPath, description });
}

export async function readFolderReadme(
    workspacePath: string,
    folderRelPath: string,
): Promise<string | null> {
    return invoke<string | null>("read_folder_readme", { workspacePath, folderRelPath });
}

export async function writeFolderReadme(
    workspacePath: string,
    folderRelPath: string,
    content: string,
): Promise<void> {
    return invoke("write_folder_readme", { workspacePath, folderRelPath, content });
}
