"use client";

import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/context";
import { FolderOpen, Home } from "lucide-react";

export function WorkspaceView() {
    const { folderName, goHome, closeFolder } = useWorkspace();

    return (
        <div className="flex min-h-screen flex-col">
            <header className="flex items-center justify-between border-b border-border px-4 py-2">
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="icon-sm" onClick={goHome} title="Global Scope">
                        <Home className="size-4" />
                    </Button>
                    <FolderOpen className="size-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{folderName}</span>
                </div>

                <Button variant="ghost" size="sm" onClick={closeFolder}>
                    Close Folder
                </Button>
            </header>

            <main className="flex flex-1 items-center justify-center text-muted-foreground">
                <p className="text-sm">Your API testing canvas goes here.</p>
            </main>
        </div>
    );
}
