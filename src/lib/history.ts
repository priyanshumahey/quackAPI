import { invoke } from "@tauri-apps/api/core";

export interface HistoryEntry {
    id: string;
    requestId: string | null;
    requestName: string | null;
    collectionPath: string | null;
    protocol: string;
    method: string;
    url: string;
    headers: [string, string][];
    params: [string, string][];
    bodyType: string | null;
    bodyPreview: string | null;
    bodyBlobSha256: string | null;
    bodySizeBytes: number | null;
    envActive: string | null;
    envSnapshot: [string, string][];
    status: number | null;
    statusText: string | null;
    responseHeaders: [string, string][];
    responsePreview: string | null;
    responseBlobSha256: string | null;
    responseSizeBytes: number | null;
    responseTruncated: boolean;
    responseTimeMs: number | null;
    error: string | null;
    startedAtMs: number;
    finishedAtMs: number | null;
    replayOfId: string | null;
    tags: string | null;
    schemaVersion: number;
    payloadSha256: string | null;
}

export interface HistoryFilter {
    requestId?: string | null;
    protocol?: string | null;
    sinceMs?: number | null;
    untilMs?: number | null;
    limit?: number | null;
    query?: string | null;
}

export interface HistoryBlob {
    bytesBase64: string;
}

export interface RedactionInfo {
    enabled: boolean;
    headerNames: string[];
    envFragments: string[];
}

export async function historyList(
    workspacePath: string,
    filter?: HistoryFilter,
): Promise<HistoryEntry[]> {
    return invoke<HistoryEntry[]>("history_list", {
        args: { workspacePath, filter: filter ?? {} },
    });
}

export async function historyGet(
    workspacePath: string,
    entryId: string,
): Promise<HistoryEntry | null> {
    return invoke<HistoryEntry | null>("history_get", {
        args: { workspacePath, entryId },
    });
}

export async function historyReadBlob(
    workspacePath: string,
    sha: string,
): Promise<HistoryBlob> {
    return invoke<HistoryBlob>("history_read_blob", {
        args: { workspacePath, sha },
    });
}

export async function historyDelete(
    workspacePath: string,
    entryId: string,
): Promise<void> {
    await invoke("history_delete", { args: { workspacePath, entryId } });
}

export async function historyClear(workspacePath: string): Promise<void> {
    await invoke("history_clear", { args: { workspacePath } });
}

export async function historyRedactionDefaults(): Promise<RedactionInfo> {
    return invoke<RedactionInfo>("history_redaction_defaults");
}

export function tryDecodeBlobAsText(base64: string): string | null {
    try {
        const bin = atob(base64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    } catch {
        return null;
    }
}
