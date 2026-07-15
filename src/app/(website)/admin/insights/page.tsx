"use client";

import Wrapper from "@/components/website/Wrapper";
import axios from "axios";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, Plus, Search, Pencil, Trash2, RefreshCw, X } from "lucide-react";

import { Button } from "@/components/website/ui/button";
import { Input } from "@/components/website/ui/input";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/website/ui/alert-dialog";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/website/ui/table";

type InsightStatus = "draft" | "published";

type Insight = {
    _id: string;
    title: string;
    slug: string;
    excerpt: string;
    status?: InsightStatus;
    createdAt?: string;
    updatedAt?: string;
};

type ApiListResponse = { success: boolean; data: Insight[] };

function fmtDate(value?: string) {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "2-digit",
    });
}

export default function AdminInsightsPage() {
    const router = useRouter();
    const [items, setItems] = useState<Insight[]>([]);
    const [loading, setLoading] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [query, setQuery] = useState("");
    const [error, setError] = useState<string | null>(null);

    async function fetchAll() {
        setLoading(true);
        setError(null);
        try {
            const res = await axios.get<ApiListResponse>("/api/insights");
            setItems(res.data.data || []);
        } catch (e: unknown) {
            setItems([]);
            const message = axios.isAxiosError(e)
                ? e.response?.data?.message || e.message || "Failed to load insights."
                : "Failed to load insights.";
            setError(message);
            console.error(e);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        fetchAll();
    }, []);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return items
            .filter((it) => {
                if (!q) return true;
                return (
                    it.title?.toLowerCase().includes(q) ||
                    it.slug?.toLowerCase().includes(q) ||
                    it.excerpt?.toLowerCase().includes(q)
                );
            })
            .sort((a, b) => {
                const ad = new Date(a.updatedAt || a.createdAt || 0).getTime();
                const bd = new Date(b.updatedAt || b.createdAt || 0).getTime();
                return bd - ad;
            });
    }, [items, query]);

    async function onDelete(id: string) {
        setDeletingId(id);
        setError(null);
        try {
            await axios.delete(`/api/insights/${id}`);
            await fetchAll();
        } catch (e: unknown) {
            const message = axios.isAxiosError(e)
                ? e.response?.data?.message || e.message || "Failed to delete insight."
                : "Failed to delete insight.";
            setError(message);
            console.error(e);
        } finally {
            setDeletingId(null);
        }
    }

    return (
        <Wrapper>
            <main className="bg-white">
                {/* Header */}
                <section className="relative overflow-hidden bg-gradient-to-br from-[#001030] via-[#1d3658] to-[#0b1b33]">
                    <div className="absolute inset-0">
                        <div className="absolute left-0 top-0 h-[520px] w-[520px] rounded-full bg-white/10 blur-3xl" />
                        <div className="absolute right-0 bottom-0 h-[520px] w-[520px] rounded-full bg-white/5 blur-3xl" />
                    </div>
                    <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff08_1px,transparent_1px),linear-gradient(to_bottom,#ffffff08_1px,transparent_1px)] bg-[size:52px_52px]" />

                    <div className="relative mx-auto max-w-7xl px-6 py-14 lg:px-8">
                        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                            <div>
                                <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white/90">
                                    Admin
                                </p>
                                <h1 className="mt-4 text-3xl font-semibold leading-tight tracking-tight text-white sm:text-4xl">
                                    Insights Dashboard
                                </h1>
                                <p className="mt-2 max-w-2xl text-base leading-relaxed text-white/80">
                                    View all insights in a table. Use edit or delete actions.
                                </p>
                            </div>

                            <div className="flex flex-col gap-3 sm:flex-row">
                                <Button
                                    onClick={() => router.push("/admin/analytics")}
                                    variant="outline"
                                    className="h-12 rounded-lg border-white/25 bg-white/10 px-5 text-white hover:bg-white/15"
                                >
                                    <span className="flex items-center gap-2">
                                        <BarChart3 className="h-4 w-4" />
                                        Analytics Preview
                                    </span>
                                </Button>

                                <Button
                                    onClick={fetchAll}
                                    variant="outline"
                                    className="h-12 rounded-lg border-white/25 bg-white/10 px-5 text-white hover:bg-white/15"
                                    disabled={loading}
                                >
                                    <span className="flex items-center gap-2">
                                        <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                                        Refresh
                                    </span>
                                </Button>

                                <Button
                                    onClick={() => router.push("/admin/insights/new")}
                                    className="h-12 rounded-lg bg-white px-6 font-semibold text-[#1d3658] hover:bg-slate-100"
                                >
                                    <span className="flex items-center gap-2">
                                        <Plus className="h-5 w-5" />
                                        Add New
                                    </span>
                                </Button>
                            </div>
                        </div>
                    </div>

                    <div className="absolute bottom-0 left-0 h-px w-full bg-white/15" />
                </section>

                {/* Table */}
                <section className="relative py-16 overflow-hidden bg-gradient-to-br from-white via-slate-50 to-white">
                    <div className="pointer-events-none absolute inset-0 -z-10">
                        <div className="absolute left-0 top-10 h-[520px] w-[520px] rounded-full bg-[#1d3658]/8 blur-3xl" />
                        <div className="absolute right-0 bottom-0 h-[560px] w-[560px] rounded-full bg-[#001030]/6 blur-3xl" />
                        <div className="absolute inset-0 bg-[linear-gradient(to_right,#0b122005_1px,transparent_1px),linear-gradient(to_bottom,#0b122005_1px,transparent_1px)] bg-[size:44px_44px]" />
                    </div>

                    <div className="mx-auto max-w-7xl px-6 py-12 lg:px-8 lg:py-14">
                        {error && (
                            <div className="mb-6 overflow-hidden rounded-lg border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700 shadow-sm">
                                <div className="flex items-start justify-between gap-3">
                                    <p className="font-semibold">{error}</p>
                                    <button
                                        type="button"
                                        onClick={() => setError(null)}
                                        className="rounded-lg p-1 text-red-700/80 hover:bg-red-100"
                                        aria-label="Dismiss"
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>
                        )}

                        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="relative w-full sm:max-w-md">
                                <Search className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                <Input
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    placeholder="Search by title, slug, excerpt..."
                                    className="h-12 rounded-lg pl-11"
                                />
                            </div>

                            <div className="inline-flex items-center shrink-0 gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
                                <span className="h-2 w-2 rounded-full bg-[#1d3658]" />
                                {loading ? "Loading..." : `${filtered.length} insights`}
                            </div>
                        </div>

                        <div className="overflow-hidden rounded-lg p-4 border-2 border-slate-200 bg-white shadow-2xl">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[38%]">Title</TableHead>
                                        <TableHead className="w-[22%]">Slug</TableHead>
                                        <TableHead className="w-[12%]">Status</TableHead>
                                        <TableHead className="w-[18%]">Updated</TableHead>
                                        <TableHead className="w-[10%] text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>

                                <TableBody>
                                    {filtered.map((it) => (
                                        <TableRow key={it._id}>
                                            <TableCell className="align-top">
                                                <div className="font-semibold text-[#001030]">{it.title}</div>
                                                <div className="mt-1 line-clamp-1 text-sm text-slate-600">
                                                    {it.excerpt}
                                                </div>
                                            </TableCell>

                                            <TableCell className="align-top">
                                                <span className="rounded-lg bg-slate-100 px-2 py-1 font-mono text-xs text-slate-700">
                                                    {it.slug}
                                                </span>
                                            </TableCell>

                                            <TableCell className="align-top">
                                                <span
                                                    className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${(it.status || "draft") === "published"
                                                        ? "bg-emerald-50 text-emerald-700"
                                                        : "bg-slate-100 text-slate-700"
                                                        }`}
                                                >
                                                    {(it.status || "draft").toUpperCase()}
                                                </span>
                                            </TableCell>

                                            <TableCell className="align-top text-sm text-slate-600">
                                                {fmtDate(it.updatedAt || it.createdAt)}
                                            </TableCell>

                                            <TableCell className="align-top">
                                                <div className="flex justify-end gap-2">
                                                    <Button
                                                        variant="outline"
                                                        size="icon"
                                                        className="rounded-xl"
                                                        onClick={() => router.push(`/admin/insights/${it._id}/edit`)}
                                                        aria-label="Edit"
                                                    >
                                                        <Pencil className="h-4 w-4" />
                                                    </Button>

                                                    <AlertDialog>
                                                        <AlertDialogTrigger asChild>
                                                            <Button
                                                                variant="outline"
                                                                size="icon"
                                                                className="rounded-xl border-red-200 text-red-600 hover:bg-red-50"
                                                                aria-label="Delete"
                                                            >
                                                                <Trash2 className="h-4 w-4" />
                                                            </Button>
                                                        </AlertDialogTrigger>
                                                        <AlertDialogContent>
                                                            <AlertDialogHeader>
                                                                <AlertDialogTitle>Delete this insight?</AlertDialogTitle>
                                                                <AlertDialogDescription>
                                                                    This will permanently remove the insight.
                                                                </AlertDialogDescription>
                                                            </AlertDialogHeader>
                                                            <AlertDialogFooter>
                                                                <AlertDialogCancel disabled={deletingId === it._id}>
                                                                    Cancel
                                                                </AlertDialogCancel>
                                                                <AlertDialogAction
                                                                    onClick={() => onDelete(it._id)}
                                                                    disabled={deletingId === it._id}
                                                                    className="bg-red-600 hover:bg-red-700"
                                                                >
                                                                    {deletingId === it._id ? "Deleting..." : "Delete"}
                                                                </AlertDialogAction>
                                                            </AlertDialogFooter>
                                                        </AlertDialogContent>
                                                    </AlertDialog>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}

                                    {!loading && filtered.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={5} className="py-12 text-center">
                                                <div className="text-lg font-semibold text-[#001030]">No insights found</div>
                                                <div className="mt-2 text-sm text-slate-600">
                                                    Try a different search or click “Add New”.
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </div>

                    <div className="absolute bottom-0 left-0 h-px w-full bg-[#1d3658]/15" />
                </section>
            </main>
        </Wrapper>
    );
}
