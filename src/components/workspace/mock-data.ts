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
