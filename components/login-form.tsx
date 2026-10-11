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
      setError(e instanceof Error ? e.message : "로그인하지 못했습니다.");
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
            편집 운영 시스템
          </span>
          <h1 className="text-6xl leading-[1.1] tracking-tight font-semibold mt-6">
            좋은 이야기를,
            <br />
            세상을 움직이게.
          </h1>
          <p className="mt-7 text-neutral-400 leading-relaxed max-w-sm">
            채널과 제작 과정, 함께 만드는 사람들을 위한 하나의 작업 공간입니다.
          </p>
          <div className="flex items-center gap-3 mt-12 text-xs text-neutral-400">
            <span className="w-2 h-2 bg-red-500 rounded-full" />
            발견 → 제작 → 검토 → 측정
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
          <div className="eyebrow">작업 공간 로그인</div>
          <h2 className="text-3xl tracking-tight font-semibold mt-3">
            다시 만나 반갑습니다.
          </h2>
          <p className="muted mt-2 mb-8">편집 작업 공간에 로그인하세요.</p>
          {demo && (
            <div className="rounded-lg border border-amber-400/30 bg-amber-500/5 p-3 text-xs mb-6 leading-relaxed">
              <b className="text-amber-600">데모 작업 공간</b>
              <p className="mt-1 muted">
                예시 데이터와 로컬 작업을 사용합니다. 외부 서비스는 연결되지
                않았으며 아래 계정은 데모에서만 사용할 수 있습니다.
              </p>
            </div>
          )}
          <form onSubmit={login} className="space-y-5">
            <label className="block">
              <span className="field-label">이메일</span>
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
              <span className="field-label">비밀번호</span>
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
                  작업 공간 열기
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
                운영자 1
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEmail("operator2@themove.local")}
              >
                운영자 2
              </Button>
            </div>
          )}
          <p className="muted text-[11px] mt-8 leading-relaxed">
            게시에는 항상 사람의 명시적 승인이 필요합니다.
            <br />
            비밀 인증 정보는 서버에서만 관리합니다.
          </p>
        </div>
      </section>
    </main>
  );
}
