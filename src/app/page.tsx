"use client";

import {
  HomeScreen,
  LoadingScreen,
  WorkspaceView,
} from "@/components/workspace";
import { AppSidebar } from "@/components/sidebar";
import { useWorkspace } from "@/context";

export default function Page() {
  const { isInitialized, isLoading, scope } = useWorkspace();

  if (!isInitialized || isLoading) {
    return <LoadingScreen />;
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <AppSidebar />
      <main className="flex-1 overflow-auto">
        {scope === "global" ? <HomeScreen /> : <WorkspaceView />}
      </main>
    </div>
  );
}
