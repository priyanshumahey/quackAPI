"use client";

import { Loader2 } from "lucide-react";

export function LoadingScreen() {
    return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 select-none">
            <Loader2 className="size-8 animate-spin text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground/70">Loading…</p>
        </div>
    );
}
