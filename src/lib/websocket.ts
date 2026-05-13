export type WsConnectionStatus = "disconnected" | "connecting" | "connected";

export interface WsHeaderParam {
    key: string;
    value: string;
    enabled: boolean;
}

export interface WsHistoryMeta {
    workspacePath: string;
    collectionRequestId: string | null;
    requestName: string | null;
    collectionPath: string | null;
    envActive: string | null;
    envSnapshot: { key: string; value: string }[];
    skip: boolean;
}

export interface WsConnectPayload {
    connectionId: string;
    url: string;
    headers: WsHeaderParam[];
    protocols: string[];
    history?: WsHistoryMeta | null;
}

export interface WsSendPayload {
    connectionId: string;
    message: string;
    messageType: "text" | "binary";
}

export type WsEvent =
    | WsConnectedEvent
    | WsMessageEvent
    | WsDisconnectedEvent
    | WsErrorEvent;

export interface WsConnectedEvent {
    connectionId: string;
    type: "connected";
    protocol: string | null;
}

export interface WsMessageEvent {
    connectionId: string;
    type: "message";
    data: string;
    isBinary: boolean;
    sizeBytes: number;
    timestampMs: number;
}

export interface WsDisconnectedEvent {
    connectionId: string;
    type: "disconnected";
    code: number | null;
    reason: string;
}

export interface WsErrorEvent {
    connectionId: string;
    type: "error";
    message: string;
}

export interface WsLogEntry {
    id: string;
    direction: "sent" | "received";
    data: string;
    isBinary: boolean;
    sizeBytes: number;
    timestamp: number;
}


export async function wsConnect(payload: WsConnectPayload): Promise<void> {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<void>("ws_connect", { payload });
}

export async function wsSendMessage(payload: WsSendPayload): Promise<void> {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<void>("ws_send_message", { payload });
}

export async function wsDisconnect(connectionId: string): Promise<void> {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<void>("ws_disconnect", { connectionId });
}
