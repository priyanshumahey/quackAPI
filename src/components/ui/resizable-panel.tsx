"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";

interface ResizablePanelProps {
  children: ReactNode;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
}

export function ResizablePanel({
  children,
  defaultWidth = 260,
  minWidth = 200,
  maxWidth = 480,
}: ResizablePanelProps) {
  const [width, setWidth] = useState(defaultWidth);
  const isResizing = useRef(false);

  const startResize = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isResizing.current = true;
      const startX = e.clientX;
      const startWidth = width;

      const onMouseMove = (ev: MouseEvent) => {
        if (!isResizing.current) return;
        const delta = ev.clientX - startX;
        const newWidth = Math.min(maxWidth, Math.max(minWidth, startWidth + delta));
        setWidth(newWidth);
      };

      const onMouseUp = () => {
        isResizing.current = false;
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [width, minWidth, maxWidth]
  );

  return (
    <div className="relative flex h-full shrink-0" style={{ width }}>
      <div className="flex h-full w-full flex-col overflow-hidden">
        {children}
      </div>
      {/* Resize handle */}
      <div
        onMouseDown={startResize}
        className="absolute -right-px top-0 z-10 h-full w-[3px] cursor-col-resize
          transition-colors duration-150 hover:bg-primary/20 active:bg-primary/40"
      />
    </div>
  );
}
