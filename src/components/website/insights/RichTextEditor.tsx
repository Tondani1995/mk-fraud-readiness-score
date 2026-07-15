"use client";

import { useRef, useState } from "react";
import {
    Bold,
    Eye,
    Heading2,
    Heading3,
    Highlighter,
    Italic,
    Link2,
    Loader2,
    List,
    ListOrdered,
    Quote,
    Sparkles,
    Underline,
} from "lucide-react";

import { Button } from "@/components/website/ui/button";
import { renderInsightRichText } from "@/lib/website/insights/richText";
import { Label } from "@/components/website/ui/label";
import { Textarea } from "@/components/website/ui/textarea";

type RichTextEditorProps = {
    id: string;
    label: string;
    value: string;
    onChange: (value: string) => void;
    onGenerateAi?: () => void | Promise<void>;
    isGeneratingAi?: boolean;
    placeholder?: string;
    rows?: number;
    minHeightClassName?: string;
};

type SelectionState = {
    start: number;
    end: number;
    selectedText: string;
};

export default function RichTextEditor({
    id,
    label,
    value,
    onChange,
    onGenerateAi,
    isGeneratingAi = false,
    placeholder,
    rows = 14,
    minHeightClassName = "min-h-[280px]",
}: RichTextEditorProps) {
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const [previewMode, setPreviewMode] = useState<"split" | "preview">("split");

    function getSelectionState(): SelectionState | null {
        const textarea = textareaRef.current;
        if (!textarea) return null;

        const start = textarea.selectionStart ?? 0;
        const end = textarea.selectionEnd ?? 0;

        return {
            start,
            end,
            selectedText: value.slice(start, end),
        };
    }

    function updateValue(nextValue: string, start: number, end: number) {
        onChange(nextValue);

        requestAnimationFrame(() => {
            const textarea = textareaRef.current;
            if (!textarea) return;
            textarea.focus();
            textarea.setSelectionRange(start, end);
        });
    }

    function wrapSelection(prefix: string, suffix: string, placeholderText: string) {
        const selection = getSelectionState();
        if (!selection) return;

        const selectedText = selection.selectedText || placeholderText;
        const replacement = `${prefix}${selectedText}${suffix}`;
        const nextValue =
            value.slice(0, selection.start) +
            replacement +
            value.slice(selection.end);

        updateValue(
            nextValue,
            selection.start + prefix.length,
            selection.start + prefix.length + selectedText.length
        );
    }

    function prefixSelectedLines(prefix: string, placeholderText: string) {
        const selection = getSelectionState();
        if (!selection) return;

        const lineStart = value.lastIndexOf("\n", Math.max(0, selection.start - 1)) + 1;
        const lineEndIndex = value.indexOf("\n", selection.end);
        const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;
        const block = value.slice(lineStart, lineEnd);
        const lines = block.split("\n");
        const prefixed = lines
            .map((line) => `${prefix}${line.trim() || placeholderText}`)
            .join("\n");
        const nextValue = value.slice(0, lineStart) + prefixed + value.slice(lineEnd);

        updateValue(nextValue, lineStart, lineStart + prefixed.length);
    }

    function prefixSelectedNumberedLines(placeholderText: string) {
        const selection = getSelectionState();
        if (!selection) return;

        const lineStart = value.lastIndexOf("\n", Math.max(0, selection.start - 1)) + 1;
        const lineEndIndex = value.indexOf("\n", selection.end);
        const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;
        const block = value.slice(lineStart, lineEnd);
        const lines = block.split("\n");
        const prefixed = lines
            .map((line, index) => `${index + 1}. ${line.trim() || placeholderText}`)
            .join("\n");
        const nextValue = value.slice(0, lineStart) + prefixed + value.slice(lineEnd);

        updateValue(nextValue, lineStart, lineStart + prefixed.length);
    }

    function insertLink() {
        const selection = getSelectionState();
        if (!selection) return;

        const linkText = selection.selectedText || "Link text";
        const href = window.prompt("Enter the link URL", "https://");
        if (!href) return;

        const safeHref = href.trim();
        if (!safeHref) return;

        const replacement = `[${linkText}](${safeHref})`;
        const nextValue =
            value.slice(0, selection.start) +
            replacement +
            value.slice(selection.end);

        updateValue(
            nextValue,
            selection.start + 1,
            selection.start + 1 + linkText.length
        );
    }

    return (
        <div className="space-y-3">
            <Label htmlFor={id} className="text-sm font-semibold text-slate-700">
                {label}
            </Label>

            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-200 bg-slate-50/80 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-9 rounded-xl border-slate-200 bg-white px-3 text-slate-700 hover:bg-slate-100"
                                onClick={() => prefixSelectedLines("## ", "Heading")}
                                aria-label="H2"
                                title="H2"
                            >
                                <Heading2 className="h-4 w-4" />
                                <span>H2</span>
                            </Button>

                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-9 rounded-xl border-slate-200 bg-white px-3 text-slate-700 hover:bg-slate-100"
                                onClick={() => prefixSelectedLines("### ", "Subheading")}
                                aria-label="H3"
                                title="H3"
                            >
                                <Heading3 className="h-4 w-4" />
                                <span>H3</span>
                            </Button>

                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-9 rounded-xl border-slate-200 bg-white px-3 text-slate-700 hover:bg-slate-100"
                                onClick={() => wrapSelection("**", "**", "Bold text")}
                                aria-label="Bold"
                                title="Bold"
                            >
                                <Bold className="h-4 w-4" />
                                <span>Bold</span>
                            </Button>

                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-9 rounded-xl border-slate-200 bg-white px-3 text-slate-700 hover:bg-slate-100"
                                onClick={() => wrapSelection("*", "*", "Italic text")}
                                aria-label="Italic"
                                title="Italic"
                            >
                                <Italic className="h-4 w-4" />
                                <span>Italic</span>
                            </Button>

                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-9 rounded-xl border-slate-200 bg-white px-3 text-slate-700 hover:bg-slate-100"
                                onClick={() => wrapSelection("==", "==", "Highlighted text")}
                                aria-label="Highlight"
                                title="Highlight"
                            >
                                <Highlighter className="h-4 w-4" />
                                <span>Highlight</span>
                            </Button>

                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-9 rounded-xl border-slate-200 bg-white px-3 text-slate-700 hover:bg-slate-100"
                                onClick={() => wrapSelection("<u>", "</u>", "Underlined text")}
                                aria-label="Underline"
                                title="Underline"
                            >
                                <Underline className="h-4 w-4" />
                                <span>Underline</span>
                            </Button>

                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-9 rounded-xl border-slate-200 bg-white px-3 text-slate-700 hover:bg-slate-100"
                                onClick={insertLink}
                                aria-label="Link"
                                title="Link"
                            >
                                <Link2 className="h-4 w-4" />
                                <span>Link</span>
                            </Button>

                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-9 rounded-xl border-slate-200 bg-white px-3 text-slate-700 hover:bg-slate-100"
                                onClick={() => prefixSelectedLines("- ", "List item")}
                                aria-label="Bullets"
                                title="Bullets"
                            >
                                <List className="h-4 w-4" />
                                <span>Bullets</span>
                            </Button>

                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-9 rounded-xl border-slate-200 bg-white px-3 text-slate-700 hover:bg-slate-100"
                                onClick={() => prefixSelectedNumberedLines("List item")}
                                aria-label="Numbered list"
                                title="Numbered list"
                            >
                                <ListOrdered className="h-4 w-4" />
                                <span>Numbers</span>
                            </Button>

                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-9 rounded-xl border-slate-200 bg-white px-3 text-slate-700 hover:bg-slate-100"
                                onClick={() => prefixSelectedLines("> ", "Quoted text")}
                                aria-label="Quote"
                                title="Quote"
                            >
                                <Quote className="h-4 w-4" />
                                <span>Quote</span>
                            </Button>

                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-9 rounded-xl border-[#1d3658]/20 bg-[#1d3658]/5 px-3 text-[#1d3658] hover:bg-[#1d3658]/10"
                                onClick={() => void onGenerateAi?.()}
                                aria-label="Generate with AI"
                                title="Generate with AI"
                                disabled={!onGenerateAi || isGeneratingAi}
                            >
                                {isGeneratingAi ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Sparkles className="h-4 w-4" />
                                )}
                                <span>{isGeneratingAi ? "Generating..." : "Generate with AI"}</span>
                            </Button>
                        </div>

                        <div className="inline-flex items-center rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className={`h-8 rounded-lg px-3 text-xs ${previewMode === "split" ? "bg-slate-100 text-[#001030]" : "text-slate-600 hover:text-[#001030]"}`}
                                onClick={() => setPreviewMode("split")}
                            >
                                Editor + Preview
                            </Button>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className={`h-8 rounded-lg px-3 text-xs ${previewMode === "preview" ? "bg-slate-100 text-[#001030]" : "text-slate-600 hover:text-[#001030]"}`}
                                onClick={() => setPreviewMode("preview")}
                            >
                                <Eye className="mr-1.5 h-3.5 w-3.5" />
                                Preview only
                            </Button>
                        </div>
                    </div>

                    <p className="mt-3 text-xs text-slate-500">
                        The editor still uses formatting shortcuts like `##`, `-`, and `**`, but the live preview below shows exactly how the insight will look on the website.
                    </p>
                </div>

                <div className={`grid gap-0 ${previewMode === "split" ? "lg:grid-cols-2" : "grid-cols-1"}`}>
                    {previewMode === "split" ? (
                        <Textarea
                            ref={textareaRef}
                            id={id}
                            rows={rows}
                            value={value}
                            onChange={(e) => onChange(e.target.value)}
                            placeholder={placeholder}
                            className={`rounded-none border-0 px-4 py-4 shadow-none focus-visible:ring-0 lg:border-r lg:border-slate-200 ${minHeightClassName}`}
                        />
                    ) : null}

                    <div className={`${previewMode === "preview" ? "block" : "border-t border-slate-200 lg:border-t-0"} bg-white`}>
                        <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50/50 px-4 py-3 text-sm font-semibold text-[#001030]">
                            <Eye className="h-4 w-4 text-[#1d3658]" />
                            Live Preview
                        </div>
                        <div className={`px-5 py-5 ${minHeightClassName}`}>
                            <div className="prose prose-slate max-w-none">
                                {value.trim() ? (
                                    renderInsightRichText(value)
                                ) : (
                                    <p className="text-sm leading-relaxed text-slate-500">
                                        Start writing to see a formatted preview here.
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
