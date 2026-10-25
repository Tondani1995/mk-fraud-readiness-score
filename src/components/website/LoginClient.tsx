"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import axios from "axios";
import { Button } from "@/components/website/ui/button";
import { Eye, EyeOff, Lock, Mail, Shield } from "lucide-react";

export default function LoginClient() {
    const router = useRouter();
    const search = useSearchParams();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            const res = await axios.post(
                "/api/auth/admin-login",
                { email, password },
                { headers: { "Content-Type": "application/json" } }
            );

            if (!res?.data?.success) {
                setError(res?.data?.message || "Login failed");
                return;
            }

            const next = search.get("next") || "/admin/insights";
            router.replace(next);
            router.refresh();
        } catch (err: unknown) {
            const msg = axios.isAxiosError(err)
                ? err.response?.data?.message || err.message || "Something went wrong"
                : "Something went wrong";
            setError(msg);
        } finally {
            setLoading(false);
        }
    }

    return (
        <main className="min-h-[calc(100vh-0px)] bg-gradient-to-br from-slate-50 via-white to-slate-50">
            <div className="pointer-events-none fixed inset-0 -z-10">
            </div>

            <div className="mx-auto flex max-w-7xl items-center justify-center px-6 py-16 lg:px-8">
                <div className="w-full max-w-md">
                    <div className="mb-6 flex justify-center">
                        <div className="inline-flex items-center gap-2 rounded-brand border border-mk-accent/20 bg-mk-accent/5 px-5 py-2.5 shadow-soft ">
                            <Shield className="h-4 w-4 text-mk-accent" />
                            <span className="text-sm font-semibold uppercase tracking-wide text-mk-accent">
                                Admin Login
                            </span>
                        </div>
                    </div>

                    <div className="overflow-hidden rounded-brand border-2 border-slate-200 bg-white shadow-soft">
                        <div className="border-b border-slate-200 bg-slate-50/60 px-7 py-6">
                            <h1 className="text-2xl font-semibold leading-tight tracking-normal text-mk-navy">
                                Sign in
                            </h1>
                            <p className="mt-1 text-sm text-slate-600">
                                Access is restricted to administrators.
                            </p>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-5 px-7 py-7">
                            {error ? (
                                <div className="rounded-brand border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                                    {error}
                                </div>
                            ) : null}

                            <div className="space-y-2">
                                <label
                                    htmlFor="email"
                                    className="text-sm font-semibold text-mk-navy"
                                >
                                    Email
                                </label>
                                <div className="relative">
                                    <Mail className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                                    <input
                                        id="email"
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="admin@yourdomain.com"
                                        required
                                        autoComplete="email"
                                        className="mt-1.5 h-12 w-full rounded-lg border-2 border-slate-200 bg-white pl-12 pr-4 text-sm text-slate-900 outline-none transition focus:border-mk-accent/35 focus:ring-4 focus:ring-mk-accent/10"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label
                                    htmlFor="password"
                                    className="text-sm font-semibold text-mk-navy"
                                >
                                    Password
                                </label>
                                <div className="relative">
                                    <Lock className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                                    <input
                                        id="password"
                                        type={showPassword ? "text" : "password"}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="Enter your password"
                                        required
                                        autoComplete="current-password"
                                        className="mt-1.5 h-12 w-full rounded-lg border-2 border-slate-200 bg-white pl-12 pr-12 text-sm text-slate-900 outline-none transition focus:border-mk-accent/35 focus:ring-4 focus:ring-mk-accent/10"
                                    />

                                    <button
                                        type="button"
                                        onClick={() => setShowPassword((s) => !s)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-brand p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                                        aria-label={showPassword ? "Hide password" : "Show password"}
                                    >
                                        {showPassword ? (
                                            <EyeOff className="h-5 w-5" />
                                        ) : (
                                            <Eye className="h-5 w-5" />
                                        )}
                                    </button>
                                </div>
                            </div>

                            <Button
                                type="submit"
                                disabled={loading}
                                className="h-12 w-full rounded-lg bg-mk-navy text-base font-semibold text-white shadow-soft transition-all duration-300 hover:scale-[1.01] hover:bg-mk-navy/95 disabled:opacity-60"
                            >
                                {loading ? "Signing in..." : "Sign in"}
                            </Button>

                            <div className="flex items-center justify-between pt-1 text-xs text-slate-500">
                                <span>MK Fraud Insights is a trading name of Stonda (Pty) Ltd.</span>
                                <Link
                                    href="/"
                                    className="font-semibold text-mk-accent hover:underline"
                                >
                                    Back to site
                                </Link>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </main>
    );
}