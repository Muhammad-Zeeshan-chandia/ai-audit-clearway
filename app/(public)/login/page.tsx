"use client";

import { Suspense } from "react";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Tab = "staff" | "client";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/dashboard";
  const supabase = createClient();

  const [tab, setTab] = useState<Tab>("staff");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  async function handleStaffLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push(next);
    router.refresh();
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/portal` },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setMagicLinkSent(true);
    setLoading(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-xl font-semibold text-[--accent]">Clearway AI</h1>
          <p className="mt-1 text-sm text-[--text-secondary]">AI Business Audit Platform</p>
        </div>

        <Card>
          <CardHeader>
            <div className="flex rounded-md border border-[--border] bg-[--bg-tertiary] p-0.5">
              {(["staff", "client"] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    setTab(t);
                    setError(null);
                    setMagicLinkSent(false);
                    setEmail("");
                    setPassword("");
                  }}
                  className={cn(
                    "flex-1 rounded py-1.5 text-sm font-medium transition-colors capitalize",
                    tab === t
                      ? "bg-white text-[--text-primary] shadow-sm"
                      : "text-[--text-secondary] hover:text-[--text-primary]"
                  )}
                >
                  {t === "staff" ? "Staff login" : "Client access"}
                </button>
              ))}
            </div>
          </CardHeader>

          <CardContent>
            {tab === "staff" ? (
              <form onSubmit={handleStaffLogin} className="space-y-4">
                <div>
                  <Label htmlFor="email" required>Email address</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@clearway.ai"
                    error={error ?? undefined}
                  />
                </div>
                <div>
                  <Label htmlFor="password" required>Password</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    error={error ?? undefined}
                  />
                </div>
                {error && <p className="text-sm text-[--danger]">{error}</p>}
                <Button type="submit" variant="primary" size="lg" loading={loading} className="w-full">
                  Sign in
                </Button>
              </form>
            ) : magicLinkSent ? (
              <div className="py-4 text-center space-y-2">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[--accent-light]">
                  <svg className="h-5 w-5 text-[--accent]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <p className="font-medium text-[--text-primary]">Check your email</p>
                <p className="text-sm text-[--text-secondary]">
                  We sent a link to <strong>{email}</strong>. Click it to access your audit.
                </p>
                <button onClick={() => { setMagicLinkSent(false); setEmail(""); }} className="text-sm text-[--accent] hover:underline">
                  Use a different email
                </button>
              </div>
            ) : (
              <form onSubmit={handleMagicLink} className="space-y-4">
                <div>
                  <Label htmlFor="client-email" required>Email address</Label>
                  <Input
                    id="client-email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    error={error ?? undefined}
                  />
                </div>
                <p className="text-xs text-[--text-tertiary]">
                  We&apos;ll email you a one-time link to access your audit report. No password required.
                </p>
                {error && <p className="text-sm text-[--danger]">{error}</p>}
                <Button type="submit" variant="primary" size="lg" loading={loading} className="w-full">
                  Send access link
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
