"use client";

import { cn } from "@/lib/utils";
import { Blocks, Server, History } from "lucide-react";

export type ActivityTab = "collections" | "environments" | "history";

const TABS: { id: ActivityTab; label: string; icon: React.ReactNode }[] = [
  { id: "collections", label: "Collections", icon: <Blocks className="size-[18px]" /> },
  { id: "environments", label: "Environments", icon: <Server className="size-[18px]" /> },
  { id: "history", label: "History", icon: <History className="size-[18px]" /> },
];

interface ActivityBarProps {
  activeTab: ActivityTab;
  onTabChange: (tab: ActivityTab) => void;
}

export function ActivityBar({ activeTab, onTabChange }: ActivityBarProps) {
  return (
    <div className="flex h-full w-11 shrink-0 flex-col items-center border-r border-border bg-sidebar pt-3 gap-1 select-none">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          title={tab.label}
          className={cn(
            "relative flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground/70",
            "transition-all duration-150 cursor-pointer",
            "hover:bg-muted/60 hover:text-foreground",
            activeTab === tab.id &&
              "bg-muted text-foreground before:absolute before:left-0 before:top-1.5 before:h-5 before:w-[2px] before:rounded-r before:bg-primary"
          )}
        >
          {tab.icon}
        </button>
      ))}
    </div>
  );
}
