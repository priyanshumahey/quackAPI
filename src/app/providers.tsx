"use client";

import { WorkspaceProvider } from "@/context";
import type { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
    return <WorkspaceProvider>{children}</WorkspaceProvider>;
}
