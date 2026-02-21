// ── HTTP request execution API ──────────────────────────────────────────────

export interface SendRequestPayload {
    method: string;
    url: string;
    headers: { key: string; value: string; enabled: boolean }[];
    params: { key: string; value: string; enabled: boolean }[];
    body: { type: string; content: string };
}

export interface HttpResponse {
    status: number;
    statusText: string;
    headers: { key: string; value: string }[];
    body: string;
    timeMs: number;
    sizeBytes: number;
}

export async function sendHttpRequest(payload: SendRequestPayload): Promise<HttpResponse> {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<HttpResponse>("send_http_request", { payload });
}
