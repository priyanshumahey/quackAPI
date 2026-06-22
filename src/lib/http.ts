// ── HTTP request execution API ──────────────────────────────────────────────

import type { MultipartField } from "@/lib/types";

export interface RequestSettings {
    verifySsl: boolean;
    proxyUrl: string | null;
}

export interface HistoryMeta {
    workspacePath: string;
    collectionRequestId: string | null;
    requestName: string | null;
    collectionPath: string | null;
    envActive: string | null;
    envSnapshot: { key: string; value: string }[];
    replayOfId: string | null;
    tags: string | null;
    /** If true, the backend skips writing a history entry for this call. */
    skip: boolean;
}

export interface SendRequestPayload {
    requestId: string;
    method: string;
    url: string;
    headers: { key: string; value: string; enabled: boolean }[];
    params: { key: string; value: string; enabled: boolean }[];
    body: { type: string; content: string; fields?: MultipartField[] };
    settings?: RequestSettings;
    history?: HistoryMeta | null;
}

export interface HttpResponse {
    status: number;
    statusText: string;
    headers: { key: string; value: string }[];
    body: string;
    bodyBase64: string;
    isBinary: boolean;
    timeMs: number;
    sizeBytes: number;
}

export interface HttpResponseProgress {
    requestId: string;
    bytesRead: number;
    totalBytes: number | null;
}

export interface HttpResponseChunk {
    requestId: string;
    chunkBase64: string;
}

export async function sendHttpRequest(payload: SendRequestPayload): Promise<HttpResponse> {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<HttpResponse>("send_http_request", { payload });
}

export async function cancelHttpRequest(requestId: string): Promise<void> {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<void>("cancel_http_request", { requestId });
}
