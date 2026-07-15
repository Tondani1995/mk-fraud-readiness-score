"use client";

import axios from "axios";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
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

type InsightStatus = "draft" | "published";

export default function EditInsightPage() {
    const router = useRouter();
    const params = useParams<{ id: string }>();
    const id = params?.id;

    const [title, setTitle] = useState("");
    const [slug, setSlug] = useState("");
    const [excerpt, setExcerpt] = useState("");
    const [content, setContent] = useState("");
    const [tagsRaw, setTagsRaw] = useState("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
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

    useEffect(() => {
        if (!id) return;

        async function fetchInsight() {
            try {
                const res = await axios.get(`/api/insights/${id}`);
                const data = res.data;
                setTitle(data.title);
                setSlug(data.slug);
                setExcerpt(data.excerpt);
                setContent(data.content);
                setTagsRaw((data.tags || []).join(", "));
            } catch {
                setError("Failed to load insight");
            } finally {
                setLoading(false);
            }
        }

        fetchInsight();
    }, [id]);

    async function onSave(nextStatus: InsightStatus) {
        setSaving(true);
        setSubmitTarget(nextStatus);
        setError(null);

        try {
            await axios.put(`/api/insights/${id}`, {
                title,
                slug,
                excerpt,
                content,
                tags,
                status: nextStatus,
            });

            router.push("/admin/insights");
            router.refresh();
        } catch {
            setError("Failed to update insight");
        } finally {
            setSaving(false);
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

    if (loading) {
        return (
            <div className="flex h-[60vh] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-[#1d3658]" />
            </div>
        );
    }

    return (
        <main className="bg-white py-20">
            <section className="mx-auto max-w-7xl px-6 py-10 lg:px-8">
                <div className="mb-6 flex items-center justify-between">
                    <h1 className="text-3xl font-semibold leading-tight text-[#001030]">Edit Insight</h1>
                    <Link href="/admin/insights" className="inline-flex items-center gap-2 text-sm font-semibold text-[#1d3658]">
                        <ArrowLeft className="h-4 w-4" />
                        Back
                    </Link>
                </div>

                {error ? (
                    <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                        {error}
                    </div>
                ) : null}

                <Card className="rounded-3xl border-2">
                    <CardHeader>
                        <CardTitle>Content</CardTitle>
                        <CardDescription>
                            Edit your insight content with toolbar formatting
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-5">
                        <div>
                            <Label>Title</Label>
                            <Input
                                className="mt-1.5"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                            />
                        </div>

                        <div>
                            <Label>Slug</Label>
                            <Input
                                className="mt-1.5"
                                value={slug}
                                onChange={(e) => setSlug(e.target.value)}
                            />
                        </div>

                        <div>
                            <Label>Excerpt</Label>
                            <Textarea
                                className="mt-2"
                                value={excerpt}
                                onChange={(e) => setExcerpt(e.target.value)}
                            />
                        </div>

                        <RichTextEditor
                            id="content"
                            label="Content"
                            value={content}
                            onChange={setContent}
                            onGenerateAi={onGenerateAi}
                            isGeneratingAi={generatingAi}
                            minHeightClassName="min-h-[260px]"
                        />

                        <div>
                            <div className="flex items-center justify-between gap-3">
                                <Label>Tags</Label>
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
                                className="mt-1.5"
                                value={tagsRaw}
                                onChange={(e) => setTagsRaw(e.target.value)}
                            />
                            <p className="mt-2 text-xs text-slate-500">
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
                                        Save it as a draft if you still want to review changes, or publish it when you are ready.
                                    </p>
                                </div>
                                <div className="flex flex-col gap-3 sm:flex-row">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => void onSave("draft")}
                                        disabled={saving}
                                        className="h-12 rounded-2xl px-6"
                                    >
                                        {saving && submitTarget === "draft" ? (
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
                                        onClick={() => void onSave("published")}
                                        disabled={saving}
                                        className="h-12 rounded-2xl bg-[#001030] px-6 text-white"
                                    >
                                        {saving && submitTarget === "published" ? (
                                            <>
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                Publishing...
                                            </>
                                        ) : (
                                            "Publish Changes"
                                        )}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </section>
        </main>
    );
}
