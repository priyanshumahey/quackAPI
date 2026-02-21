"use client";

import { updateCollectionDescription } from "@/lib/collections";
import { cn } from "@/lib/utils";
import { BookOpen, Check, Pencil, Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface CollectionDocViewProps {
    collectionRelPath: string;
    collectionName: string;
    initialDescription: string | null;
    workspacePath: string;
    onDescriptionChange?: (description: string | null) => void;
}

export function CollectionDocView({
    collectionRelPath,
    collectionName,
    initialDescription,
    workspacePath,
    onDescriptionChange,
}: CollectionDocViewProps) {
    const [content, setContent] = useState<string | null>(initialDescription);
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Sync if the tab is reused with a different collection
    useEffect(() => {
        setContent(initialDescription);
        setIsEditing(false);
        setEditValue("");
        setError(null);
    }, [collectionRelPath, initialDescription]);

    const startEdit = () => {
        setEditValue(content ?? "");
        setIsEditing(true);
        setTimeout(() => textareaRef.current?.focus(), 50);
    };

    const startCreate = () => {
        setEditValue(`# ${collectionName}\n\nDescribe the purpose of this collection, its endpoints and any usage notes.\n`);
        setIsEditing(true);
        setTimeout(() => textareaRef.current?.focus(), 50);
    };

    const cancelEdit = () => {
        setIsEditing(false);
        setEditValue("");
        setError(null);
    };

    const saveEdit = async () => {
        const trimmed = editValue.trim();
        const newValue = trimmed.length > 0 ? trimmed : null;
        setIsSaving(true);
        setError(null);
        try {
            await updateCollectionDescription(workspacePath, collectionRelPath, newValue);
            setContent(newValue);
            onDescriptionChange?.(newValue);
            setIsEditing(false);
            setEditValue("");
        } catch (err) {
            setError(String(err));
        } finally {
            setIsSaving(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Escape") cancelEdit();
    };

    return (
        <div className="flex h-full flex-col bg-background overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-5 py-3 shrink-0">
                <div className="flex items-center gap-2.5">
                    <BookOpen className="size-4 text-sky-500 shrink-0" />
                    <div>
                        <h2 className="text-[13px] font-semibold text-foreground leading-tight">
                            {collectionName}
                        </h2>
                        <p className="text-[11px] text-muted-foreground/60 leading-tight mt-0.5">
                            Documentation · {collectionRelPath}
                        </p>
                    </div>
                </div>

                {!isEditing && content !== null && (
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

            {/* Error banner */}
            {error && (
                <div className="shrink-0 border-b border-destructive/20 bg-destructive/10 px-5 py-2 text-[12px] text-destructive">
                    {error}
                </div>
            )}

            {/* Body */}
            <div className="flex-1 overflow-y-auto">
                {isEditing ? (
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
                                Add a description to document this collection's purpose and endpoints.
                            </p>
                        </div>
                        <button
                            onClick={startCreate}
                            className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3.5 py-2 text-[13px] text-foreground/80 hover:bg-accent hover:text-accent-foreground transition-colors duration-150 cursor-pointer"
                        >
                            <Plus className="size-3.5" />
                            Add Documentation
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
