"use client";

import { readFolderReadme, writeFolderReadme } from "@/lib/collections";
import { cn } from "@/lib/utils";
import { BookOpen, Check, Pencil, Plus, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface FolderReadmeViewProps {
    folderRelPath: string;
    folderName: string;
    workspacePath: string;
}

export function FolderReadmeView({
    folderRelPath,
    folderName,
    workspacePath,
}: FolderReadmeViewProps) {
    const [content, setContent] = useState<string | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const load = useCallback(async () => {
        if (!workspacePath) return;
        setIsLoading(true);
        setError(null);
        try {
            const result = await readFolderReadme(workspacePath, folderRelPath);
            setContent(result);
        } catch (err) {
            setError(String(err));
        } finally {
            setIsLoading(false);
        }
    }, [workspacePath, folderRelPath]);

    useEffect(() => {
        load();
    }, [load]);

    const startEdit = () => {
        setEditValue(content ?? "");
        setIsEditing(true);
        setTimeout(() => textareaRef.current?.focus(), 50);
    };

    const startCreate = () => {
        setEditValue(`# ${folderName}\n\nAdd documentation for this folder here.\n`);
        setIsEditing(true);
        setTimeout(() => textareaRef.current?.focus(), 50);
    };

    const cancelEdit = () => {
        setIsEditing(false);
        setEditValue("");
    };

    const saveEdit = async () => {
        const trimmed = editValue.trimEnd();
        setIsSaving(true);
        setError(null);
        try {
            await writeFolderReadme(workspacePath, folderRelPath, trimmed + "\n");
            setContent(trimmed + "\n");
            setIsEditing(false);
            setEditValue("");
        } catch (err) {
            setError(String(err));
        } finally {
            setIsSaving(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Escape") {
            cancelEdit();
        }
    };

    return (
        <div className="flex h-full flex-col bg-background overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-5 py-3 shrink-0">
                <div className="flex items-center gap-2.5">
                    <BookOpen className="size-4 text-amber-500 shrink-0" />
                    <div>
                        <h2 className="text-[13px] font-semibold text-foreground leading-tight">
                            {folderName}
                        </h2>
                        <p className="text-[11px] text-muted-foreground/60 leading-tight mt-0.5">
                            README.md
                            {folderRelPath ? ` · ${folderRelPath}` : " · collections root"}
                        </p>
                    </div>
                </div>

                {!isLoading && !isEditing && content !== null && (
                    <button
                        onClick={startEdit}
                        className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-2.5 py-1.5 text-[12px] text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors duration-150 cursor-pointer"
                    >
                        <Pencil className="size-3" />
                        Edit
                    </button>
                )}

                {isEditing && (
                    <div className="flex items-center gap-1.5">
                        <button
                            onClick={cancelEdit}
                            disabled={isSaving}
                            className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-2.5 py-1.5 text-[12px] text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors duration-150 cursor-pointer disabled:opacity-50"
                        >
                            <X className="size-3" />
                            Cancel
                        </button>
                        <button
                            onClick={saveEdit}
                            disabled={isSaving}
                            className="flex items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1.5 text-[12px] text-primary-foreground hover:bg-primary/90 transition-colors duration-150 cursor-pointer disabled:opacity-50"
                        >
                            <Check className="size-3" />
                            {isSaving ? "Saving…" : "Save"}
                        </button>
                    </div>
                )}
            </div>
            <div className="flex-1 overflow-y-auto">
                {isLoading ? (
                    <div className="flex h-full items-center justify-center">
                        <div className="size-4 animate-spin rounded-full border-2 border-border border-t-muted-foreground" />
                    </div>
                ) : error ? (
                    <div className="flex h-full items-center justify-center px-8">
                        <p className="text-sm text-destructive text-center">{error}</p>
                    </div>
                ) : isEditing ? (
                    <div className="flex h-full flex-col p-4">
                        <textarea
                            ref={textareaRef}
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={handleKeyDown}
                            spellCheck
                            className={cn(
                                "flex-1 w-full resize-none rounded-lg border border-border bg-muted/30 p-4",
                                "text-[13px] font-mono text-foreground/90 leading-relaxed",
                                "outline-none focus:ring-1 focus:ring-ring/40 transition-shadow duration-150",
                                "placeholder:text-muted-foreground/40"
                            )}
                            placeholder="Write your markdown documentation here…"
                        />
                        <p className="mt-2 text-[11px] text-muted-foreground/50 text-right">
                            Markdown supported · Esc to cancel
                        </p>
                    </div>
                ) : content !== null ? (
                    <div className="px-8 py-6 max-w-3xl">
                        <div className="md-prose">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {content}
                            </ReactMarkdown>
                        </div>
                    </div>
                ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
                        <div className="flex size-12 items-center justify-center rounded-xl bg-muted/50 border border-border">
                            <BookOpen className="size-5 text-muted-foreground/50" />
                        </div>
                        <div>
                            <p className="text-[13px] font-medium text-foreground/80">No documentation yet</p>
                            <p className="mt-1 text-[12px] text-muted-foreground/60">
                                Create a README to document this folder and its contents.
                            </p>
                        </div>
                        <button
                            onClick={startCreate}
                            className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3.5 py-2 text-[13px] text-foreground/80 hover:bg-accent hover:text-accent-foreground transition-colors duration-150 cursor-pointer"
                        >
                            <Plus className="size-3.5" />
                            Create README
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
