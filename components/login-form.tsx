"use client";
import { useState } from "react";
import { ArrowUpRight, Loader2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
export function LoginForm({ demo }: { demo: boolean }) {
  const [email, setEmail] = useState(demo ? "operator1@themove.local" : "");
  const [password, setPassword] = useState(demo ? "move-demo-2026" : "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function login(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      window.location.assign("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not sign in.");
      setBusy(false);
    }
  }
  return (
    <main className="min-h-screen grid lg:grid-cols-2 bg-[var(--background)]">
      <section className="hidden lg:flex bg-[#171717] text-white flex-col justify-between p-16 relative overflow-hidden">
        <div className="text-sm font-bold tracking-[.25em]">
          THE MOVE<span className="text-red-500 ml-2">OS</span>
        </div>
        <div>
          <span className="text-red-400 uppercase tracking-[.2em] text-xs font-medium">
            An editorial operating system
          </span>
          <h1 className="text-6xl leading-[1.1] tracking-tight font-semibold mt-6">
            Good stories.
            <br />
            Made to move.
          </h1>
          <p className="mt-7 text-neutral-400 leading-relaxed max-w-sm">
            One considered workspace for your channels, your creative process,
            and the people behind it.
          </p>
          <div className="flex items-center gap-3 mt-12 text-xs text-neutral-400">
            <span className="w-2 h-2 bg-red-500 rounded-full" />
            Discover → Create → Review → Measure
          </div>
        </div>
        <div className="text-xs text-neutral-500">
          THE MOVE / KOREA-CODED / THE STANDARD
        </div>
        <ArrowUpRight
          className="absolute -right-14 bottom-12 text-white/[.025]"
          size={430}
        />
      </section>
      <section className="flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <div className="text-xs tracking-[.2em] font-bold mb-12 lg:hidden">
            THE MOVE OS
          </div>
          <div className="eyebrow">WORKSPACE ACCESS</div>
          <h2 className="text-3xl tracking-tight font-semibold mt-3">
            Welcome back.
          </h2>
          <p className="muted mt-2 mb-8">
            Sign in to your editorial workspace.
          </p>
          {demo && (
            <div className="rounded-lg border border-amber-400/30 bg-amber-500/5 p-3 text-xs mb-6 leading-relaxed">
              <b className="text-amber-600">DEMO WORKSPACE</b>
              <p className="mt-1 muted">
                Sample data, local actions, and disconnected integrations. These
                credentials work only in demo mode.
              </p>
            </div>
          )}
          <form onSubmit={login} className="space-y-5">
            <label className="block">
              <span className="field-label">Email address</span>
              <input
                className="input w-full mt-2"
                autoComplete="username"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="field-label">Password</span>
              <input
                className="input w-full mt-2"
                autoComplete="current-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            {error && (
              <p role="alert" className="text-sm text-red-600">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" size="lg" disabled={busy}>
              {busy ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <>
                  Enter workspace
                  <ArrowRight size={16} />
                </>
              )}
            </Button>
          </form>
          {demo && (
            <div className="mt-5 flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEmail("operator1@themove.local")}
              >
                Operator 1
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEmail("operator2@themove.local")}
              >
                Operator 2
              </Button>
            </div>
          )}
          <p className="muted text-[11px] mt-8 leading-relaxed">
            Publishing always requires explicit human approval.
            <br />
            Private credentials stay on the server.
          </p>
        </div>
      </section>
    </main>
  );
}
