export interface RequestHeader {
  key: string;
  value: string;
  enabled: boolean;
}

export interface RequestBody {
  type: "none" | "json" | "text" | "form-data" | "x-www-form-urlencoded";
  content: string;
}

export interface QueryParam {
  key: string;
  value: string;
  enabled: boolean;
}

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS" | "WS";

export interface CollectionRequest {
  id: string;
  name: string;
  method: HttpMethod;
  url: string;
  headers: RequestHeader[];
  params: QueryParam[];
  body: RequestBody;
}

export interface Collection {
  id: string;
  name: string;
  requests: CollectionRequest[];
}

export interface EnvironmentVariable {
  key: string;
  value: string;
}

export interface WorkspaceData {
  isQuackInitialized: boolean;
  collections: Collection[];
  environments: Record<string, EnvironmentVariable[]>;
  activeEnvironment: string | null;
}

// ── Auth types ──────────────────────────────────────────────────────────────

export type AuthType = "none" | "bearer" | "basic" | "apikey";

export interface AuthNone {
  type: "none";
}

export interface AuthBearer {
  type: "bearer";
  token: string;
  prefix: string; // defaults to "Bearer"
}

export interface AuthBasic {
  type: "basic";
  username: string;
  password: string;
}

export interface AuthApiKey {
  type: "apikey";
  key: string;
  value: string;
  addTo: "header" | "query";
}

export type AuthConfig = AuthNone | AuthBearer | AuthBasic | AuthApiKey;

// ── History types ───────────────────────────────────────────────────────────

export interface HistoryEntry {
  id: string;
  method: HttpMethod;
  url: string;
  status: number | null;
  statusText: string | null;
  timeMs: number | null;
  timestamp: string; // ISO 8601
}
