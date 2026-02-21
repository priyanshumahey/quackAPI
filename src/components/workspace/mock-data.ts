"use client";

import type { HttpMethod } from "@/lib/types";

export interface MockFolder {
  id: string;
  name: string;
  type: "folder";
  children: (MockFolder | MockRequest)[];
  isOpen: boolean;
}

export interface MockRequest {
  id: string;
  name: string;
  type: "request";
  method: HttpMethod;
}

export type MockTreeItem = MockFolder | MockRequest;

export const MOCK_COLLECTIONS: MockFolder[] = [
  {
    id: "c1",
    name: "Users",
    type: "folder",
    isOpen: true,
    children: [
      { id: "r1", name: "Get my profile", type: "request", method: "GET" },
      { id: "r2", name: "Get my about me", type: "request", method: "GET" },
      { id: "r3", name: "Get my skills", type: "request", method: "GET" },
      { id: "r4", name: "Get my manager", type: "request", method: "GET" },
      { id: "r5", name: "Get users", type: "request", method: "GET" },
      { id: "r6", name: "Get users $filter", type: "request", method: "GET" },
      { id: "r7", name: "Create user", type: "request", method: "POST" },
      { id: "r8", name: "Update user", type: "request", method: "PUT" },
      { id: "r9", name: "Delete user", type: "request", method: "DELETE" },
    ],
  },
  {
    id: "c2",
    name: "Teams",
    type: "folder",
    isOpen: false,
    children: [
      { id: "r10", name: "List teams", type: "request", method: "GET" },
      { id: "r11", name: "Create team", type: "request", method: "POST" },
    ],
  },
  {
    id: "c3",
    name: "SharePoint",
    type: "folder",
    isOpen: false,
    children: [
      { id: "r12", name: "Get sites", type: "request", method: "GET" },
    ],
  },
  {
    id: "c4",
    name: "Mail",
    type: "folder",
    isOpen: false,
    children: [
      { id: "r13", name: "Get messages", type: "request", method: "GET" },
      { id: "r14", name: "Send message", type: "request", method: "POST" },
    ],
  },
  {
    id: "c5",
    name: "Tasks - Planner",
    type: "folder",
    isOpen: false,
    children: [
      { id: "r15", name: "List tasks", type: "request", method: "GET" },
    ],
  },
];

export interface MockEnvironmentVariable {
  key: string;
  value: string;
  enabled: boolean;
}

export interface MockEnvironment {
  id: string;
  name: string;
  variables: MockEnvironmentVariable[];
  isActive: boolean;
}

export const MOCK_ENVIRONMENTS: MockEnvironment[] = [
  {
    id: "env1",
    name: "Development",
    isActive: true,
    variables: [
      { key: "base_url", value: "http://localhost:3000/api", enabled: true },
      { key: "auth_token", value: "dev-token-abc123", enabled: true },
      { key: "api_version", value: "v1", enabled: true },
      { key: "timeout", value: "30000", enabled: true },
      { key: "debug", value: "true", enabled: true },
      { key: "tenant_id", value: "dev-tenant-001", enabled: true },
      { key: "client_id", value: "app-client-dev", enabled: false },
      { key: "log_level", value: "verbose", enabled: true },
    ],
  },
  {
    id: "env2",
    name: "Staging",
    isActive: false,
    variables: [
      { key: "base_url", value: "https://staging-api.example.com", enabled: true },
      { key: "auth_token", value: "stg-token-xyz789", enabled: true },
      { key: "api_version", value: "v1", enabled: true },
      { key: "timeout", value: "15000", enabled: true },
      { key: "debug", value: "false", enabled: true },
      { key: "tenant_id", value: "stg-tenant-002", enabled: true },
      { key: "client_id", value: "app-client-stg", enabled: true },
      { key: "log_level", value: "warn", enabled: false },
    ],
  },
  {
    id: "env3",
    name: "Production",
    isActive: false,
    variables: [
      { key: "base_url", value: "https://api.example.com", enabled: true },
      { key: "auth_token", value: "{{vault:prod-token}}", enabled: true },
      { key: "api_version", value: "v2", enabled: true },
      { key: "timeout", value: "10000", enabled: true },
      { key: "tenant_id", value: "prod-tenant-100", enabled: true },
      { key: "client_id", value: "app-client-prod", enabled: true },
    ],
  },
];
