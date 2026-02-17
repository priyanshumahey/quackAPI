"use client";

import { Button } from "@/components/ui/button";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useState } from "react";

export default function Home() {
  const [greeted, setGreeted] = useState<string | null>(null);

  const greet = useCallback((): void => {
    invoke<string>("greet")
      .then((s) => {
        setGreeted(s);
      })
      .catch((err: unknown) => {
        console.error(err);
      });
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-4xl font-bold tracking-tight">Quack API</h1>
      <p className="text-muted-foreground">
        {greeted ?? "Click the button to call the Rust backend"}
      </p>
      <Button onClick={greet}>Greet</Button>
    </div>
  );
}
