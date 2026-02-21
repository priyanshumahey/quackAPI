"use client";

import { useWorkspace } from "@/context";
import type { PinnedWorkspace } from "@/lib/settings";
import {
  ChevronsLeft,
  ChevronsRight,
  FolderOpen,
  Home,
  Pin,
  PinOff,
  Plus,
  X,
} from "lucide-react";
import { useRef, useState, useEffect, type ReactNode } from "react";

/* ─────────────────────── Squircle Button ─────────────────────── */

function Squircle({
  children,
  isActive = false,
  onClick,
  title,
  className = "",
}: {
  children: ReactNode;
  isActive?: boolean;
  onClick?: () => void;
  title?: string;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`
        group relative flex h-11 w-11 shrink-0 items-center justify-center
        rounded-[14px] text-sm font-semibold transition-all duration-200
        select-none cursor-pointer
        ${
          isActive
            ? "bg-gradient-to-br from-indigo-500 to-blue-600 text-white shadow-md shadow-indigo-500/20 ring-2 ring-indigo-300/60"
            : "bg-transparent text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        }
        ${className}
      `}
    >
      {children}
    </button>
  );
}

/* ─────────────────────── Sidebar Row ─────────────────────── */
/* Wraps a squircle + optional label when expanded */

function SidebarRow({
  expanded,
  label,
  sublabel,
  actions,
  children,
}: {
  expanded: boolean;
  label?: string;
  sublabel?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="group/row flex w-full items-center gap-3 px-2">
      {children}
      {expanded && label && (
        <div className="flex min-w-0 flex-1 items-center justify-between">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium leading-tight text-foreground">
              {label}
            </p>
            {sublabel && (
              <p className="truncate text-[11px] leading-tight text-muted-foreground">
                {sublabel}
              </p>
            )}
          </div>
          {actions && (
            <div className="ml-2 flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/row:opacity-100">
              {actions}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────── Tiny Icon Button ─────────────────────── */

function IconAction({
  onClick,
  title,
  children,
  variant = "default",
}: {
  onClick: (e: React.MouseEvent) => void;
  title: string;
  children: ReactNode;
  variant?: "default" | "destructive";
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
      title={title}
      className={`
        flex h-6 w-6 items-center justify-center rounded-md transition-colors
        ${
          variant === "destructive"
            ? "text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        }
      `}
    >
      {children}
    </button>
  );
}

/* ─────────────────────── Separator ─────────────────────── */

function Separator({ expanded }: { expanded: boolean }) {
  return (
    <div className={`mx-auto h-px bg-border ${expanded ? "w-[calc(100%-16px)]" : "w-6"}`} />
  );
}

/* ─────────────────────── Section Label ─────────────────────── */

function SectionLabel({ expanded, label }: { expanded: boolean; label: string }) {
  if (!expanded) return null;
  return (
    <p className="px-4 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
      {label}
    </p>
  );
}

/* ─────────────────────── Derive initials ─────────────────────── */

function initials(name: string): string {
  const parts = name.replace(/[^a-zA-Z0-9\s\-_]/g, "").split(/[\s\-_]+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

/* ═══════════════════════ Main Sidebar ═══════════════════════ */

export function AppSidebar() {
  const {
    scope,
    folderPath,
    folderName,
    pinnedWorkspaces,
    sidebarExpanded: expanded,
    goHome,
    openFolderByPath,
    openFolder,
    pinCurrentWorkspace,
    unpinWorkspaceByPath,
    isCurrentWorkspacePinned,
    toggleSidebar,
  } = useWorkspace();

  const isGlobal = scope === "global";
  const hasWorkspace = scope === "workspace" && !!folderPath;
  const isPinned = isCurrentWorkspacePinned();

  /* ── Context menu for pinned items ── */
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    path: string;
    name: string;
  } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!contextMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [contextMenu]);

  const handleContextMenu = (e: React.MouseEvent, pinned: PinnedWorkspace) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, path: pinned.path, name: pinned.name });
  };

  return (
    <>
      <aside
        className={`
          relative flex h-screen flex-col border-r border-border bg-sidebar py-3
          transition-[width] duration-200 ease-in-out
          ${expanded ? "w-56" : "w-[60px]"}
        `}
      >
        {/* ── Collapse / Expand toggle on the edge ── */}
        <button
          onClick={toggleSidebar}
          title={expanded ? "Collapse sidebar" : "Expand sidebar"}
          className="absolute -right-3 top-5 z-10 flex h-6 w-6 items-center justify-center
            rounded-full border border-border bg-background text-muted-foreground
            shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground cursor-pointer"
        >
          {expanded ? (
            <ChevronsLeft className="size-3.5" />
          ) : (
            <ChevronsRight className="size-3.5" />
          )}
        </button>

        {/* ── Global Home ── */}
        <div className="flex flex-col gap-2">
          <SectionLabel expanded={expanded} label="Global" />
          <SidebarRow expanded={expanded} label="Home">
            <Squircle isActive={isGlobal} onClick={goHome} title="Global Home">
              <Home className="size-5" />
            </Squircle>
          </SidebarRow>
        </div>

        <div className="py-2">
          <Separator expanded={expanded} />
        </div>

        {/* ── Current Workspace (only if not a pinned workspace) ── */}
        <div className="flex flex-col gap-2">
          <SectionLabel expanded={expanded} label="Workspace" />

          {hasWorkspace && !isPinned ? (
            <SidebarRow
              expanded={expanded}
              label={folderName ?? "Workspace"}
              actions={
                <IconAction
                  onClick={() => pinCurrentWorkspace()}
                  title="Pin this workspace"
                >
                  <Pin className="size-3.5" />
                </IconAction>
              }
            >
              <Squircle
                isActive={true}
                title={folderName ?? "Current Workspace"}
              >
                {initials(folderName ?? "??")}
              </Squircle>
            </SidebarRow>
          ) : !hasWorkspace ? (
            <SidebarRow expanded={expanded} label="No workspace open">
              <Squircle
                onClick={openFolder}
                title="Open a folder"
                className="border border-dashed border-border !bg-transparent"
              >
                <FolderOpen className="size-4 text-muted-foreground" />
              </Squircle>
            </SidebarRow>
          ) : null}
        </div>

        {/* ── Pinned Workspaces ── */}
        <div className="py-2">
          <Separator expanded={expanded} />
        </div>

        <div className="flex flex-col gap-1">
          <SectionLabel expanded={expanded} label="Pinned" />

          {pinnedWorkspaces.length > 0 && (
            <div className="flex flex-col gap-1.5 overflow-y-auto scrollbar-none">
              {pinnedWorkspaces.map((pinned) => {
                const isThisActive = folderPath === pinned.path;
                return (
                  <div
                    key={pinned.path}
                    onContextMenu={(e) => handleContextMenu(e, pinned)}
                  >
                    <SidebarRow
                      expanded={expanded}
                      label={pinned.name}
                      actions={
                        <IconAction
                          onClick={() => unpinWorkspaceByPath(pinned.path)}
                          title="Unpin"
                          variant="destructive"
                        >
                          <PinOff className="size-3.5" />
                        </IconAction>
                      }
                    >
                      <Squircle
                        isActive={isThisActive}
                        onClick={() => {
                          if (!isThisActive) openFolderByPath(pinned.path);
                        }}
                        title={pinned.name}
                      >
                        {pinned.emoji ?? pinned.initials}
                      </Squircle>
                    </SidebarRow>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Add workspace (+) sits right below pinned items ── */}
          <div className="mt-1">
            <SidebarRow expanded={expanded} label="Open folder">
              <Squircle onClick={openFolder} title="Open a folder">
                <Plus className="size-5" />
              </Squircle>
            </SidebarRow>
          </div>
        </div>

        {/* ── Spacer ── */}
        <div className="flex-1" />
      </aside>

      {/* ── Context Menu ── */}
      {contextMenu && (
        <div
          ref={menuRef}
          className="fixed z-50 min-w-[160px] rounded-lg border border-border bg-popover p-1 shadow-lg"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm text-foreground hover:bg-accent hover:text-accent-foreground"
            onClick={() => {
              openFolderByPath(contextMenu.path);
              setContextMenu(null);
            }}
          >
            <FolderOpen className="size-3.5" />
            Open
          </button>
          <button
            className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => {
              unpinWorkspaceByPath(contextMenu.path);
              setContextMenu(null);
            }}
          >
            <X className="size-3.5" />
            Unpin
          </button>
        </div>
      )}
    </>
  );
}
