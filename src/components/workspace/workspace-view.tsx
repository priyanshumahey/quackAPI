"use client";

import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/context";
import { FolderOpen, Home, Plus, Loader2 } from "lucide-react";

function InitPrompt() {
  const { initWorkspace } = useWorkspace();

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
      <p className="text-sm text-muted-foreground">
        No <code className="rounded bg-muted px-1.5 py-0.5 text-xs">.quack</code> workspace found in this folder.
      </p>
      <Button onClick={initWorkspace} className="gap-2">
        <Plus className="size-4" />
        Initialize Workspace
      </Button>
    </div>
  );
}

function WorkspaceContent() {
  const { quack } = useWorkspace();

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <section>
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Collections
        </h2>
        {quack.collections.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No collections</p>
        ) : (
          <ul className="space-y-1">
            {quack.collections.map((c) => (
              <li
                key={c.id}
                className="rounded border border-border px-3 py-2 text-sm"
              >
                {c.name}
                <span className="ml-2 text-xs text-muted-foreground">
                  {c.requests.length} request{c.requests.length !== 1 && "s"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Environments
        </h2>
        {Object.keys(quack.environments).length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No environments</p>
        ) : (
          <ul className="space-y-1">
            {Object.entries(quack.environments).map(([name, vars]) => (
              <li
                key={name}
                className="rounded border border-border px-3 py-2 text-sm"
              >
                {name}
                <span className="ml-2 text-xs text-muted-foreground">
                  {vars.length} variable{vars.length !== 1 && "s"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export function WorkspaceView() {
  const { folderName, goHome, closeFolder, quack, isLoading } = useWorkspace();

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex items-center justify-between border-b border-border px-4 py-2">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" onClick={goHome} title="Global Scope">
            <Home className="size-4" />
          </Button>
          <FolderOpen className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">{folderName}</span>
        </div>
      </header>

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : quack.isQuackInitialized ? (
        <WorkspaceContent />
      ) : (
        <InitPrompt />
      )}
    </div>
  );
}
