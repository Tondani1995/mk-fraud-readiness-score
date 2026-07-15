"use client";

import Wrapper from "@/components/website/Wrapper";
import axios from "axios";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Sparkles } from "lucide-react";

import RichTextEditor from "@/components/website/insights/RichTextEditor";
import { Button } from "@/components/website/ui/button";
import { Input } from "@/components/website/ui/input";
import { Textarea } from "@/components/website/ui/textarea";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/website/ui/card";
import { Label } from "@/components/website/ui/label";
import { Switch } from "@/components/website/ui/switch";

type InsightStatus = "draft" | "published";

type CreateInsightPayload = {
    title: string;
    slug: string;
    excerpt: string;
    content: string;
    tags: string[];
    status: InsightStatus;
};

function slugify(input: string) {
    return input
        .toLowerCase()
        .trim()
        .replace(/['â€™]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

export default function NewInsightPage() {
    const router = useRouter();

    const [title, setTitle] = useState("");
    const [slug, setSlug] = useState("");
    const [autoSlug, setAutoSlug] = useState(true);
    const [excerpt, setExcerpt] = useState("");
    const [content, setContent] = useState("");
    const [tagsRaw, setTagsRaw] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [submitTarget, setSubmitTarget] = useState<InsightStatus | null>(null);
    const [generatingAi, setGeneratingAi] = useState(false);
    const [generatingTags, setGeneratingTags] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const tags = useMemo(() => {
        return tagsRaw
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean);
    }, [tagsRaw]);

    const canSubmit = useMemo(() => {
        return title.trim() && slug.trim() && excerpt.trim() && content.trim();
    }, [title, slug, excerpt, content]);

    async function onSubmit(nextStatus: InsightStatus) {
        setError(null);
        if (!canSubmit) {
            setError("Please fill in Title, Slug, Excerpt, and Content.");
            return;
        }

        const payload: CreateInsightPayload = {
            title: title.trim(),
            slug: slug.trim(),
            excerpt: excerpt.trim(),
            content: content.trim(),
            tags,
            status: nextStatus,
        };

        setSubmitting(true);
        setSubmitTarget(nextStatus);
        try {
            await axios.post("/api/insights", payload);
            router.push("/admin/insights");
            router.refresh();
        } catch (error: unknown) {
            const message = axios.isAxiosError(error)
                ? error.response?.data?.message || error.message || "Failed to create insight."
                : "Failed to create insight.";
            setError(message);
        } finally {
            setSubmitting(false);
            setSubmitTarget(null);
        }
    }

    async function onGenerateAi() {
        setError(null);

        if (!title.trim()) {
            setError("Please add a title before generating content with AI.");
            return;
        }

        if (content.trim()) {
            const shouldReplace = window.confirm(
                "This will replace the current content in the editor. Do you want to continue?"
            );

            if (!shouldReplace) return;
        }

        setGeneratingAi(true);
        try {
            const response = await axios.post("/api/ai/generate-insight", {
                title: title.trim(),
                excerpt: excerpt.trim(),
            });

            const generatedContent = response.data?.content;

            if (!generatedContent || typeof generatedContent !== "string") {
                throw new Error("No content was generated.");
            }

            setContent(generatedContent.trim());
        } catch (error: unknown) {
            const message = axios.isAxiosError(error)
                ? error.response?.data?.error || error.message || "Failed to generate insight content."
                : "Failed to generate insight content.";
            setError(message);
        } finally {
            setGeneratingAi(false);
        }
    }

    async function onGenerateTags() {
        setError(null);

        if (!title.trim()) {
            setError("Please add a title before generating tags with AI.");
            return;
        }

        setGeneratingTags(true);
        try {
            const response = await axios.post("/api/ai/generate-tags", {
                title: title.trim(),
                excerpt: excerpt.trim(),
                content: content.trim(),
            });

            const nextTagsText = response.data?.tagsText;

            if (!nextTagsText || typeof nextTagsText !== "string") {
                throw new Error("No tags were generated.");
            }

            setTagsRaw(nextTagsText);
        } catch (error: unknown) {
            const message = axios.isAxiosError(error)
                ? error.response?.data?.error || error.message || "Failed to generate tags."
                : "Failed to generate tags.";
            setError(message);
        } finally {
            setGeneratingTags(false);
        }
    }

    return (
        <Wrapper>
            <main className="bg-white">
                <section className="relative overflow-hidden bg-gradient-to-br from-[#001030] via-[#1d3658] to-[#0b1b33]">
                    <div className="absolute inset-0">
                        <div className="absolute left-0 top-0 h-[520px] w-[520px] rounded-full bg-white/10 blur-3xl" />
                        <div className="absolute right-0 bottom-0 h-[520px] w-[520px] rounded-full bg-white/5 blur-3xl" />
                    </div>
                    <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff08_1px,transparent_1px),linear-gradient(to_bottom,#ffffff08_1px,transparent_1px)] bg-[size:52px_52px]" />

                    <div className="relative mx-auto max-w-7xl px-6 py-16 lg:px-8">
                        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
                            <div>
                                <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white/90">
                                    Admin
                                </p>
                                <h1 className="mt-4 text-3xl font-semibold leading-tight tracking-tight text-white sm:text-4xl">
                                    Add New Insight
                                </h1>
                                <p className="mt-2 max-w-2xl text-base leading-relaxed text-white/80">
                                    Create a new insight post with formatting tools for headings,
                                    links, emphasis, and long-form content.
                                </p>
                            </div>

                            <Link
                                href="/admin/insights"
                                className="inline-flex h-12 items-center justify-center rounded-2xl border border-white/25 bg-white/10 px-5 text-sm font-semibold text-white hover:bg-white/15"
                            >
                                <ArrowLeft className="mr-2 h-4 w-4" />
                                Back
                            </Link>
                        </div>
                    </div>

                    <div className="absolute bottom-0 left-0 h-px w-full bg-white/15" />
                </section>

                <section className="relative overflow-hidden bg-gradient-to-br from-white via-slate-50 to-white">
                    <div className="pointer-events-none absolute inset-0 -z-10">
                        <div className="absolute left-0 top-10 h-[520px] w-[520px] rounded-full bg-[#1d3658]/8 blur-3xl" />
                        <div className="absolute right-0 bottom-0 h-[560px] w-[560px] rounded-full bg-[#001030]/6 blur-3xl" />
                        <div className="absolute inset-0 bg-[linear-gradient(to_right,#0b122005_1px,transparent_1px),linear-gradient(to_bottom,#0b122005_1px,transparent_1px)] bg-[size:44px_44px]" />
                    </div>

                    <div className="mx-auto max-w-7xl px-6 py-10 lg:px-8 lg:py-12">
                        {error ? (
                            <div className="mb-6 overflow-hidden rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700 shadow-sm">
                                <p className="font-semibold">{error}</p>
                            </div>
                        ) : null}

                        <div className="py-16">
                            <Card className="rounded-3xl border-2 border-slate-200 shadow-2xl">
                                <CardHeader>
                                    <CardTitle className="text-xl font-semibold text-[#001030]">
                                        Content
                                    </CardTitle>
                                    <CardDescription>
                                        Write and format the full article using the editor toolbar.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-6">
                                    <div className="space-y-2">
                                        <Label htmlFor="title" className="text-sm font-semibold text-slate-700">
                                            Title
                                        </Label>
                                        <Input
                                            id="title"
                                            value={title}
                                            onChange={(e) => {
                                                const nextTitle = e.target.value;
                                                setTitle(nextTitle);
                                                if (autoSlug) setSlug(slugify(nextTitle));
                                            }}
                                            className="h-12 rounded-2xl"
                                            placeholder="e.g. Control Gaps & Early Warning Signals"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between gap-3">
                                            <Label htmlFor="slug" className="text-sm font-semibold text-slate-700">
                                                Slug
                                            </Label>
                                            <div className="flex items-center gap-2">
                                                <Switch
                                                    checked={autoSlug}
                                                    onCheckedChange={(checked) => setAutoSlug(Boolean(checked))}
                                                    id="autoSlug"
                                                />
                                                <Label htmlFor="autoSlug" className="text-xs text-slate-600">
                                                    Auto-generate
                                                </Label>
                                            </div>
                                        </div>

                                        <Input
                                            id="slug"
                                            value={slug}
                                            onChange={(e) => {
                                                setSlug(e.target.value);
                                                setAutoSlug(false);
                                            }}
                                            className="h-12 rounded-2xl font-mono"
                                            placeholder="e.g. control-gaps-early-warning"
                                        />
                                        <p className="text-xs text-slate-500">
                                            This becomes the URL:{" "}
                                            <span className="font-mono">
                                                /insights/{slug || "your-slug"}
                                            </span>
                                        </p>
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="excerpt" className="text-sm font-semibold text-slate-700">
                                            Excerpt
                                        </Label>
                                        <Textarea
                                            id="excerpt"
                                            value={excerpt}
                                            onChange={(e) => setExcerpt(e.target.value)}
                                            className="min-h-[110px] rounded-2xl"
                                            placeholder="Short summary shown on cards and list pages..."
                                        />
                                    </div>

                                    <RichTextEditor
                                        id="content"
                                        label="Content"
                                        value={content}
                                        onChange={setContent}
                                        onGenerateAi={onGenerateAi}
                                        isGeneratingAi={generatingAi}
                                        placeholder="Write the full article here..."
                                    />

                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between gap-3">
                                            <Label htmlFor="tags" className="text-sm font-semibold text-slate-700">
                                                Tags
                                            </Label>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={onGenerateTags}
                                                disabled={generatingTags}
                                                className="h-9 rounded-xl border-[#1d3658]/20 bg-[#1d3658]/5 px-3 text-[#1d3658] hover:bg-[#1d3658]/10"
                                            >
                                                {generatingTags ? (
                                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                ) : (
                                                    <Sparkles className="mr-2 h-4 w-4" />
                                                )}
                                                {generatingTags ? "Generating..." : "Generate Tags with AI"}
                                            </Button>
                                        </div>
                                        <Input
                                            id="tags"
                                            value={tagsRaw}
                                            onChange={(e) => setTagsRaw(e.target.value)}
                                            className="h-12 rounded-2xl"
                                            placeholder="e.g. Readiness, Controls, Operations"
                                        />
                                        <p className="text-xs text-slate-500">
                                            Comma separated. You can also generate tags automatically from the title and content.
                                        </p>
                                    </div>

                                    <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-5">
                                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                                            <div>
                                                <p className="text-sm font-semibold text-[#001030]">
                                                    Save this insight
                                                </p>
                                                <p className="mt-1 text-sm text-slate-600">
                                                    Use draft if you still want to review it later, or publish when it is ready to go live.
                                                </p>
                                            </div>
                                            <div className="flex flex-col gap-3 sm:flex-row">
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    onClick={() => void onSubmit("draft")}
                                                    disabled={submitting || !canSubmit}
                                                    className="h-12 rounded-2xl px-6"
                                                >
                                                    {submitting && submitTarget === "draft" ? (
                                                        <>
                                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                            Saving Draft...
                                                        </>
                                                    ) : (
                                                        "Save as Draft"
                                                    )}
                                                </Button>
                                                <Button
                                                    type="button"
                                                    onClick={() => void onSubmit("published")}
                                                    disabled={submitting || !canSubmit}
                                                    className="h-12 rounded-2xl bg-[#001030] px-6 text-white hover:opacity-95"
                                                >
                                                    {submitting && submitTarget === "published" ? (
                                                        <>
                                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                            Publishing...
                                                        </>
                                                    ) : (
                                                        "Publish Insight"
                                                    )}
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </div>

                    <div className="absolute bottom-0 left-0 h-px w-full bg-[#1d3658]/15" />
                </section>
            </main>
        </Wrapper>
    );
}
