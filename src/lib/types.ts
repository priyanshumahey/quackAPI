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
