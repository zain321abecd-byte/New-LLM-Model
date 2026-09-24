"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";

type Mode = "signin" | "signup" | "magic";

export function LoginForm({ initialMode, next, linkError }: { initialMode: Mode; next?: string; linkError: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(linkError ? "That sign-in link is invalid or expired." : null);
  const [notice, setNotice] = useState<string | null>(null);

  const dest = next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    const supabase = supabaseBrowser();
    const callback = `${window.location.origin}/auth/callback?next=${encodeURIComponent(dest)}`;
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace(dest);
        router.refresh();
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: callback } });
        if (error) throw error;
        if (data.session) {
          router.replace("/settings");
          router.refresh();
        } else setNotice("Check your inbox to confirm your email, then sign in.");
      } else {
        const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: callback, shouldCreateUser: false } });
        if (error) throw error;
        setNotice("If that email has an account, a sign-in link is on its way.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const title = { signin: "Sign in", signup: "Create account", magic: "Sign-in link" }[mode];

  return (
    <form onSubmit={submit}>
      <h1 className="lp-display text-[44px] md:text-[56px]">{title}</h1>

      {/* Underlined fields with mono labels */}
      <div className="mt-10 space-y-6">
        <label className="block border-b border-[var(--lp-line)] pb-3">
          <span className="lp-mono block text-[13px] text-[var(--lp-ink-2)]">Email</span>
          <input
            type="email"
            required
            autoComplete="email"
            placeholder="name@company.com"
            className="mt-2 w-full bg-transparent font-[family-name:var(--font-lp-mono)] text-[18px] outline-none placeholder:text-[var(--lp-ink)]/35"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        {mode !== "magic" && (
          <label className="block border-b border-[var(--lp-line)] pb-3">
            <span className="lp-mono block text-[13px] text-[var(--lp-ink-2)]">Password</span>
            <input
              type="password"
              required
              minLength={mode === "signup" ? 10 : undefined}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              placeholder={mode === "signup" ? "At least 10 characters" : "••••••••••"}
              className="mt-2 w-full bg-transparent text-[18px] outline-none placeholder:text-[var(--lp-ink)]/35"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
        )}
      </div>

      {error && <p className="mt-6 border-l-2 border-[#d92d20] bg-[#d92d20]/[0.06] px-4 py-3 text-[15px] text-[#b42318]">{error}</p>}
      {notice && <p className="mt-6 border-l-2 border-[var(--lp-orange)] bg-[var(--lp-orange)]/[0.07] px-4 py-3 text-[15px]">{notice}</p>}

      <button
        type="submit"
        disabled={busy}
        className="lp-mono mt-10 flex h-[72px] w-full items-center justify-center bg-[var(--lp-dark)] text-[18px] font-medium tracking-[0.04em] text-[#f1f0ed] transition hover:bg-black disabled:opacity-50"
      >
        {busy ? "Please wait…" : mode === "magic" ? "Send link" : mode === "signup" ? "Create account" : "Sign in"}
      </button>

      <div className="lp-mono mt-8 flex flex-col gap-3 text-[14px]">
        {mode !== "signin" && <button type="button" className="w-fit hover:text-[var(--lp-orange)]" onClick={() => setMode("signin")}><span className="text-[var(--lp-orange)]">→</span> Sign in with password</button>}
        {mode !== "signup" && <button type="button" className="w-fit hover:text-[var(--lp-orange)]" onClick={() => setMode("signup")}><span className="text-[var(--lp-orange)]">→</span> Create an account</button>}
        {mode !== "magic" && <button type="button" className="w-fit hover:text-[var(--lp-orange)]" onClick={() => setMode("magic")}><span className="text-[var(--lp-orange)]">→</span> Email me a sign-in link</button>}
      </div>
    </form>
  );
}
