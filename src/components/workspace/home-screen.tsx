"use client";

import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/context";
import { Clock, FolderOpen, Globe, Loader2, Trash2 } from "lucide-react";

export function HomeScreen() {
    const {
        openFolder,
        openFolderByPath,
        removeFromRecent,
        recentFolders,
        isLoading,
    } = useWorkspace();

    return (
        <div className="flex min-h-full flex-col items-center justify-center gap-10 p-8 select-none">
            <div className="flex flex-col items-center gap-3 text-center">
                <div className="flex items-center gap-2">
                    <Globe className="size-6 text-muted-foreground" />
                    <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                        Global Scope
                    </span>
                </div>

                <h1 className="text-4xl font-bold tracking-tight">Quack API</h1>
                <p className="text-muted-foreground max-w-md">
                    Open a folder to start testing your APIs, WebSockets, and gRPCs — or
                    stay here in the global scope.
                </p>
            </div>

            <div className="flex flex-col items-center gap-3">
                <Button
                    size="lg"
                    onClick={openFolder}
                    disabled={isLoading}
                    className="gap-2"
                >
                    {isLoading ? (
                        <Loader2 className="size-4 animate-spin" />
                    ) : (
                        <FolderOpen className="size-4" />
                    )}
                    {isLoading ? "Opening…" : "Open Folder"}
                </Button>

                <p className="text-xs text-muted-foreground">
                    <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                        ⌘O
                    </kbd>{" "}
                    to open a folder
                </p>
            </div>

            {recentFolders.length > 0 && (
                <div className="w-full max-w-md">
                    <div className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                        <Clock className="size-4" />
                        Recent Folders
                    </div>

                    <ul className="divide-y divide-border rounded-lg border border-border">
                        {recentFolders.map((folder) => (
                            <li
                                key={folder.path}
                                className="group flex items-center justify-between px-4 py-3 transition-colors hover:bg-muted/50"
                            >
                                <button
                                    className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left"
                                    onClick={() => openFolderByPath(folder.path)}
                                    disabled={isLoading}
                                >
                                    <span className="truncate font-medium text-sm">
                                        {folder.name}
                                    </span>
                                    <span className="truncate text-xs text-muted-foreground">
                                        {folder.path}
                                    </span>
                                </button>

                                <button
                                    className="ml-3 shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                                    title="Remove from recent"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        removeFromRecent(folder.path);
                                    }}
                                >
                                    <Trash2 className="size-3.5" />
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}
