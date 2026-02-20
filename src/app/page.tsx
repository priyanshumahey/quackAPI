"use client";

import {
  HomeScreen,
  LoadingScreen,
  WorkspaceView,
} from "@/components/workspace";
import { useWorkspace } from "@/context";

export default function Page() {
  const { isInitialized, isLoading, scope } = useWorkspace();

  if (!isInitialized || isLoading) {
    return <LoadingScreen />;
  }

  if (scope === "global") {
    return <HomeScreen />;
  }

  return <WorkspaceView />;
}
