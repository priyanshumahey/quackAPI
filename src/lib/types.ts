export interface RequestHeader {
  key: string;
  value: string;
  enabled: boolean;
}

export interface MultipartField {
  key: string;
  /** "text" for a plain field, "file" for a file upload (value is a path). */
  type: "text" | "file";
  value: string;
  /** Optional filename override for file fields. */
  filename?: string;
  /** Optional explicit content-type for this part. */
  contentType?: string;
}

export interface RequestBody {
  type: "none" | "json" | "text" | "form-data" | "multipart" | "x-www-form-urlencoded";
  content: string;
  /** Parts for a multipart/form-data body (used when type is "multipart"). */
  fields?: MultipartField[];
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
