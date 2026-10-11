"use client";
import { koreanLabel } from "@/lib/korean";

import { useEffect, useState } from "react";
import {
  Check,
  KeyRound,
  Moon,
  Plug,
  Plus,
  ShieldCheck,
  Sun,
  Users,
} from "lucide-react";
import {
  useWorkspace,
  WorkspaceError,
  WorkspaceLoading,
} from "@/components/workspace-provider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Operator } from "@/lib/domain";

type Integration = {
  configured: boolean;
  status: string;
  details: string;
  oauthReady?: boolean;
};
type SettingsData = {
  demo: boolean;
  canManageIntegrations?: boolean;
  integrations: Record<"openai" | "canva" | "meta" | "redis", Integration>;
  operators: Operator[];
};
const integrationCopy = [
  {
    key: "openai" as const,
    name: "OpenAI",
    letter: "AI",
    purpose: "출처 기반 조사와 채널별 초안 작성을 지원합니다.",
    variables: "OPENAI_API_KEY",
    href: null,
  },
  {
    key: "canva" as const,
    name: "Canva Connect",
    letter: "C",
    purpose: "승인된 템플릿을 검사하고 편집 가능한 디자인을 생성합니다.",
    variables: "CANVA_CLIENT_ID · CANVA_CLIENT_SECRET",
    href: "/api/oauth/canva",
  },
  {
    key: "meta" as const,
    name: "Instagram / Meta",
    letter: "M",
    purpose: "인증된 계정의 지표 수집과 승인된 콘텐츠 게시를 지원합니다.",
    variables: "META_APP_ID · META_APP_SECRET",
    href: "/api/oauth/meta",
  },
  {
    key: "redis" as const,
    name: "Redis / BullMQ",
    letter: "Q",
    purpose: "작업 대기열, 재시도와 정기 동기화를 처리합니다.",
    variables: "REDIS_URL",
    href: null,
  },
];

export function Settings() {
  const { data, loading, mutate } = useWorkspace();
  const [configuration, setConfiguration] = useState<SettingsData | null>(null);
  const [configurationError, setConfigurationError] = useState<string | null>(
    null,
  );
  const [theme, setTheme] = useState("light");
  const [reducedMotion, setReducedMotion] = useState(false);
  const [channelId, setChannelId] = useState("");
  const [guidelines, setGuidelines] = useState("");
  const [accountChannelId, setAccountChannelId] = useState("the-move");
  const [accountId, setAccountId] = useState("");
  const [accountBusy, setAccountBusy] = useState<string | null>(null);
  const [newChannelName, setNewChannelName] = useState("");
  const [newChannelHandle, setNewChannelHandle] = useState("");
  const [newChannelGuidelines, setNewChannelGuidelines] = useState("");
  const [channelFeedback, setChannelFeedback] = useState<{
    text: string;
    failed: boolean;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{
    text: string;
    failed: boolean;
  } | null>(null);

  async function loadConfiguration() {
    setConfigurationError(null);
    try {
      const response = await fetch("/api/settings", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok || result.error)
        throw new Error(result.error || "연결 설정을 확인할 수 없습니다.");
      setConfiguration(result.data);
    } catch (err) {
      setConfigurationError(
        err instanceof Error ? err.message : "연결 설정을 불러오지 못했습니다.",
      );
    }
  }
  useEffect(() => {
    void loadConfiguration();
    setTheme(
      localStorage.getItem("move-theme") ||
        document.documentElement.dataset.theme ||
        "light",
    );
    setReducedMotion(localStorage.getItem("move-reduced-motion") === "true");
  }, []);
  useEffect(() => {
    if (data && !channelId && data.channels.length) {
      setChannelId(data.channels[0].id);
      setGuidelines(data.channels[0].guidelines);
    }
  }, [data, channelId]);
  function appearance(value: string) {
    setTheme(value);
    localStorage.setItem("move-theme", value);
    document.documentElement.dataset.theme = value;
    document.documentElement.classList.toggle("dark", value === "dark");
    window.dispatchEvent(new Event("move-theme"));
    window.dispatchEvent(new Event("move-preferences"));
  }
  function motion(value: boolean) {
    setReducedMotion(value);
    localStorage.setItem("move-reduced-motion", String(value));
    window.dispatchEvent(new Event("move-reduced-motion"));
    window.dispatchEvent(new Event("move-preferences"));
  }
  async function accountAction(
    endpoint: string,
    body: Record<string, unknown>,
    key: string,
    message: string,
  ) {
    setAccountBusy(key);
    setNotice(null);
    try {
      await mutate(endpoint, body);
      setNotice({ text: message, failed: false });
      if (endpoint === "/api/settings") {
        setAccountId("");
        void loadConfiguration();
      }
    } catch (err) {
      setNotice({
        text:
          err instanceof Error
            ? err.message
            : "계정 작업을 완료하지 못했습니다.",
        failed: true,
      });
    } finally {
      setAccountBusy(null);
    }
  }
  async function createChannel() {
    setAccountBusy("create-channel");
    setChannelFeedback(null);
    try {
      await mutate("/api/settings", {
        action: "create-channel",
        name: newChannelName.trim(),
        handle: newChannelHandle.trim(),
        guidelines: newChannelGuidelines.trim(),
      });
      setNewChannelName("");
      setNewChannelHandle("");
      setNewChannelGuidelines("");
      setChannelFeedback({
        text: "채널을 추가했습니다. 지표 수집 전 계정을 인증하고 디자인 제작 전 승인된 템플릿을 등록하세요.",
        failed: false,
      });
    } catch (err) {
      setChannelFeedback({
        text: err instanceof Error ? err.message : "채널을 만들지 못했습니다.",
        failed: true,
      });
    } finally {
      setAccountBusy(null);
    }
  }
  async function saveGuidelines() {
    setBusy(true);
    setNotice(null);
    try {
      await mutate("/api/settings", {
        action: "guidelines",
        channelId,
        guidelines,
      });
      setNotice({
        text: "편집 규칙을 새 버전으로 저장했습니다. 초안의 수정 이력은 유지됩니다.",
        failed: false,
      });
    } catch (err) {
      setNotice({
        text:
          err instanceof Error
            ? err.message
            : "편집 규칙을 저장하지 못했습니다.",
        failed: true,
      });
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <WorkspaceLoading />;
  if (!data) return <WorkspaceError />;
  const channel = data.channels.find((c) => c.id === channelId);
  return (
    <div className="space-y-6">
      <header className="page-header">
        <div>
          <p className="eyebrow">작업 공간 / 연결 / 환경 설정</p>
          <h1 className="page-title">설정</h1>
          <p className="mt-2 muted">
            서비스 연결과 편집 기준, 화면 환경을 설정하세요.
          </p>
        </div>
        <Badge>{data.demo ? "데모 작업 공간" : "실제 운영 공간"}</Badge>
      </header>
      {notice && (
        <div
          role={notice.failed ? "alert" : "status"}
          className={`rounded-lg border p-3 text-sm ${notice.failed ? "border-red-400/40 bg-red-500/5 text-red-600" : "border-[var(--border)] bg-[var(--surface)]"}`}
        >
          {notice.text}
        </div>
      )}
      <section className="panel">
        <div className="panel-header flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">서비스 연결</h2>
            <p className="mt-1 text-xs muted">
              설정 정보가 있어도 실제 API 접근이 확인된 것은 아닙니다.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadConfiguration()}
          >
            상태 새로고침
          </Button>
        </div>
        {configurationError && (
          <p role="alert" className="p-5 text-sm text-red-600">
            {configurationError}
          </p>
        )}
        <div className="divide-y divide-[var(--border)]">
          {integrationCopy.map((item) => {
            const integration = configuration?.integrations[item.key];
            return (
              <div
                key={item.key}
                className="flex flex-wrap items-center gap-4 p-5"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--muted)] text-sm font-semibold">
                  {item.letter}
                </div>
                <div className="min-w-[220px] flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold">{item.name}</h3>
                    <Badge
                      className={
                        integration?.configured
                          ? ""
                          : "text-[var(--muted-text)]"
                      }
                    >
                      {integration?.status ||
                        (configurationError
                          ? "상태 확인 불가"
                          : "설정 확인 중…")}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs muted">{item.purpose}</p>
                  <p className="mt-2 text-[11px] leading-relaxed muted">
                    {integration?.details ||
                      "서버 설정을 확인합니다. 비밀 인증 값은 이 페이지에 전달하지 않습니다."}
                  </p>
                  <p className="mt-2 flex items-center gap-1.5 font-mono text-[10px] muted">
                    <KeyRound size={10} />
                    {item.variables}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {integration && (
                    <span className="text-xs muted">
                      {integration.configured ? "설정 있음" : "설정 필요"}
                    </span>
                  )}
                  {item.href && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={
                        !configuration ||
                        integration?.oauthReady === false ||
                        configuration?.canManageIntegrations === false
                      }
                      asChild={
                        !!configuration &&
                        integration?.oauthReady !== false &&
                        configuration?.canManageIntegrations !== false
                      }
                    >
                      {configuration &&
                      integration?.oauthReady !== false &&
                      configuration?.canManageIntegrations !== false ? (
                        <a href={item.href}>
                          <Plug size={13} /> 계정 인증
                        </a>
                      ) : (
                        <>
                          <Plug size={13} /> 계정 인증
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex gap-3 border-t border-[var(--border)] bg-[var(--muted)]/30 p-4">
          <ShieldCheck
            size={17}
            className="mt-0.5 shrink-0 text-[var(--accent)]"
          />
          <p className="text-xs leading-relaxed muted">
            다음 파일을 참고해 서버 환경에 비밀 값을 설정하세요:{" "}
            <code>.env.example</code> . OAuth 토큰은 암호화해 저장합니다. 편집
            입력란이나 채팅에 비밀 키를 입력하지 마세요. 실제 연결·생성·게시
            검증 후에만 운영 가능 상태로 판단합니다.
          </p>
        </div>
      </section>
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2 className="font-semibold">채널 추가</h2>
            <p className="mt-1 text-xs muted">
              브랜드별 편집 기준을 가진 새 채널을 추가합니다.
            </p>
          </div>
          <Badge>관리자 전용</Badge>
        </div>
        <form
          className="space-y-4 p-5 pt-0"
          onSubmit={(e) => {
            e.preventDefault();
            void createChannel();
          }}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <label>
              <span className="field-label">채널 이름</span>
              <input
                className="input"
                required
                minLength={1}
                maxLength={100}
                placeholder="브랜드 또는 매체 이름"
                value={newChannelName}
                onChange={(e) => setNewChannelName(e.target.value)}
              />
            </label>
            <label>
              <span className="field-label">채널 아이디</span>
              <input
                className="input"
                required
                minLength={1}
                maxLength={100}
                placeholder="@yourchannel"
                value={newChannelHandle}
                onChange={(e) => setNewChannelHandle(e.target.value)}
              />
            </label>
          </div>
          <label className="block">
            <span className="field-label">초기 편집 규칙</span>
            <textarea
              className="input min-h-24 w-full"
              required
              minLength={10}
              maxLength={10000}
              placeholder="채널의 문체, 출처 기준과 편집 우선순위를 작성하세요."
              value={newChannelGuidelines}
              onChange={(e) => setNewChannelGuidelines(e.target.value)}
            />
          </label>
          {channelFeedback && (
            <p
              role={channelFeedback.failed ? "alert" : "status"}
              className={`text-xs leading-relaxed ${channelFeedback.failed ? "text-red-600" : "muted"}`}
            >
              {channelFeedback.text}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs muted">
              새 채널은 연결 전 상태입니다. 인증 후 동기화해야 계정 지표가
              표시됩니다.
            </p>
            <Button
              type="submit"
              disabled={
                !!accountBusy ||
                !configuration?.canManageIntegrations ||
                !newChannelName.trim() ||
                !newChannelHandle.trim() ||
                newChannelGuidelines.trim().length < 10
              }
            >
              <Plus size={14} />
              {accountBusy === "create-channel" ? "추가 중…" : "채널 추가"}
            </Button>
          </div>
        </form>
      </section>
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2 className="font-semibold">Instagram 계정 연결</h2>
            <p className="mt-2 text-sm">
              연결 및 게시 대상: <strong>@themovemag_</strong>
            </p>
            <p className="mt-1 text-xs muted">
              Meta가 반환한 계정 이름과 ID가 모두 일치해야 연결됩니다.
            </p>
            <Button
              className="mt-3"
              disabled={
                !!accountBusy ||
                !configuration?.integrations.meta.configured ||
                configuration.canManageIntegrations === false
              }
              onClick={() =>
                void accountAction(
                  "/api/settings",
                  { action: "connect-meta-account", channelId: "the-move" },
                  "auto-connect",
                  "@themovemag_ 계정을 확인하고 연결했습니다.",
                )
              }
            >
              THE MOVE 계정 자동 확인·연결
            </Button>
            <p className="mt-1 text-xs muted">
              인증된 프로페셔널 계정을 확인하고 지표를 동기화합니다.
            </p>
          </div>
          <Badge>관리자 연결</Badge>
        </div>
        <div className="divide-y divide-[var(--border)]">
          {data.channels
            .filter((c) => c.id === "the-move")
            .map((c) => (
              <div
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
              >
                <div>
                  <p className="text-sm font-medium">
                    {c.name}{" "}
                    <span className="ml-2 text-xs font-normal muted">
                      {c.handle}
                    </span>
                  </p>
                  <p className="mt-1 text-[11px] muted">
                    {c.connected && c.platformAccountId
                      ? `인증된 계정 ID: ${c.platformAccountId}`
                      : "확인된 Instagram 계정 없음"}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge
                    className={
                      c.connected
                        ? "text-emerald-700 dark:text-emerald-400"
                        : "muted"
                    }
                  >
                    {c.connected ? "인증된 계정" : "연결 안 됨"}
                  </Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!!accountBusy || !c.connected}
                    onClick={() =>
                      accountAction(
                        "/api/jobs",
                        { kind: "METRICS_SYNC", channelId: c.id },
                        c.id,
                        "지표 동기화를 대기열에 추가했습니다. 오피스의 분석 담당 작업에서 결과를 확인하세요.",
                      )
                    }
                  >
                    {accountBusy === c.id ? "대기열에 등록 중…" : "지표 동기화"}
                  </Button>
                </div>
              </div>
            ))}
        </div>
        <form
          className="border-t border-[var(--border)] p-5"
          onSubmit={(e) => {
            e.preventDefault();
            void accountAction(
              "/api/settings",
              {
                action: "connect-meta-account",
                channelId: accountChannelId,
                accountId: accountId.trim(),
              },
              "map",
              "계정을 확인하고 연결했습니다. 지표 동기화를 실행하세요.",
            );
          }}
        >
          <div className="grid items-end gap-3 md:grid-cols-[minmax(150px,1fr)_minmax(220px,1.5fr)_auto]">
            <label>
              <span className="field-label">채널</span>
              <select
                className="select"
                required
                value={accountChannelId}
                onChange={(e) => setAccountChannelId(e.target.value)}
              >
                <option value="">채널 선택…</option>
                {data.channels
                  .filter((c) => c.id === "the-move")
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              <span className="field-label">Instagram 프로페셔널 계정 ID</span>
              <input
                className="input"
                required
                inputMode="numeric"
                pattern="[0-9]+"
                maxLength={40}
                placeholder="인증된 Instagram 계정 ID"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
              />
            </label>
            <Button
              type="submit"
              disabled={
                !!accountBusy ||
                !accountChannelId ||
                !accountId.trim() ||
                configuration?.canManageIntegrations === false
              }
            >
              <ShieldCheck size={14} />
              {accountBusy === "map" ? "확인 중…" : "계정 확인 후 연결"}
            </Button>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed muted">
            관리자가 Meta를 인증한 뒤 프로페셔널 계정 ID를 입력합니다. 서버가
            실제 계정 정보를 확인한 후 연결합니다. 연결 완료와 지표 동기화
            완료는 별도 상태입니다.
          </p>
        </form>
      </section>
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="panel">
          <div className="panel-header flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">편집 규칙</h2>
              <p className="mt-1 text-xs muted">
                버전별 편집 규칙으로 채널 문체를 관리합니다.
              </p>
            </div>
            {channel && <Badge>버전 {channel.guidelineVersion}</Badge>}
          </div>
          <form
            className="space-y-4 p-5"
            onSubmit={(e) => {
              e.preventDefault();
              void saveGuidelines();
            }}
          >
            <label className="block">
              <span className="field-label">채널</span>
              <select
                className="select mt-2 w-full"
                value={channelId}
                onChange={(e) => {
                  setChannelId(e.target.value);
                  setGuidelines(
                    data.channels.find((c) => c.id === e.target.value)
                      ?.guidelines || "",
                  );
                }}
              >
                <option value="" disabled>
                  채널 선택
                </option>
                {data.channels.map((c) => (
                  <option value={c.id} key={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="field-label">작성 및 편집 지침</span>
              <textarea
                className="input mt-2 min-h-52 w-full text-sm leading-relaxed"
                required
                minLength={10}
                maxLength={10000}
                value={guidelines}
                onChange={(e) => setGuidelines(e.target.value)}
                placeholder="문체, 구성, 출처 기준과 금지하는 주장…"
              />
            </label>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="max-w-xs text-xs leading-relaxed muted">
                분석에서 개선을 제안할 수 있습니다. 지침은 사람이 직접 승인해
                변경합니다.
              </p>
              <Button
                type="submit"
                disabled={
                  busy ||
                  !channel ||
                  !guidelines.trim() ||
                  guidelines === channel.guidelines ||
                  configuration?.canManageIntegrations === false
                }
              >
                <Check size={14} />
                {busy ? "저장 중…" : "새 버전 저장"}
              </Button>
            </div>
          </form>
          {channel?.guidelineHistory?.length ? (
            <details className="mx-5 mb-5 rounded-lg border border-[var(--border)] p-3">
              <summary className="cursor-pointer text-xs font-medium">
                규칙 수정 이력 ({channel.guidelineHistory.length})
              </summary>
              <div className="mt-3 space-y-3">
                {[...channel.guidelineHistory].reverse().map((rule) => (
                  <article
                    key={rule.version}
                    className="border-t border-[var(--border)] pt-3"
                  >
                    <div className="flex items-center justify-between text-[10px] muted">
                      <span>버전 {rule.version}</span>
                      <span>
                        {rule.changedAt
                          ? new Date(rule.changedAt).toLocaleString("ko-KR", {
                              timeZone: "Asia/Seoul",
                            })
                          : "변경 시각 기록 없음"}
                      </span>
                    </div>
                    <p className="text-xs whitespace-pre-wrap leading-relaxed mt-2">
                      {rule.guidelines}
                    </p>
                  </article>
                ))}
              </div>
            </details>
          ) : null}
        </section>
        <aside className="panel">
          <div className="panel-header">
            <h2 className="font-semibold">화면 및 접근성</h2>
            <p className="mt-2 text-xs muted">
              언어: 한국어 · 날짜 표시: 한국 표준시 (Asia/Seoul)
            </p>
          </div>
          <div className="space-y-5 p-5">
            <div>
              <p className="field-label">화면 모드</p>
              <div className="mt-3 flex gap-2">
                <Button
                  className="flex-1"
                  variant={theme === "light" ? "secondary" : "outline"}
                  onClick={() => appearance("light")}
                  aria-pressed={theme === "light"}
                >
                  <Sun size={15} /> 밝게
                </Button>
                <Button
                  className="flex-1"
                  variant={theme === "dark" ? "secondary" : "outline"}
                  onClick={() => appearance("dark")}
                  aria-pressed={theme === "dark"}
                >
                  <Moon size={15} /> 어둡게
                </Button>
              </div>
            </div>
            <div className="border-t border-[var(--border)] pt-5">
              <label className="flex cursor-pointer items-center justify-between gap-4">
                <span>
                  <span className="block text-sm font-medium">
                    움직임 줄이기
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed muted">
                    오피스 애니메이션과 화면 전환을 줄입니다.
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={reducedMotion}
                  onChange={(e) => motion(e.target.checked)}
                  className="h-4 w-4 shrink-0 accent-red-600"
                />
              </label>
            </div>
            <p className="text-[11px] muted">
              화면 설정은 현재 브라우저에 저장됩니다.
            </p>
          </div>
        </aside>
      </div>
      <section className="panel">
        <div className="panel-header flex items-center gap-2">
          <Users size={16} />
          <div>
            <h2 className="font-semibold">운영자 및 권한</h2>
            <p className="mt-1 text-xs muted">
              두 운영자가 편집 품질을 관리하고 게시를 승인합니다.
            </p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table w-full">
            <thead>
              <tr>
                <th className="text-left">운영자</th>
                <th className="text-left">계정</th>
                <th className="text-left">권한</th>
                <th className="text-left">담당</th>
              </tr>
            </thead>
            <tbody>
              {(configuration?.operators || data.operators).map((operator) => (
                <tr key={operator.id}>
                  <td className="font-medium">{operator.name}</td>
                  <td className="text-xs muted">{operator.email}</td>
                  <td>
                    <Badge>{koreanLabel(operator.role)}</Badge>
                  </td>
                  <td className="text-xs muted">
                    {operator.role === "ADMIN"
                      ? "작업 공간 관리 및 편집 승인"
                      : operator.role === "OPERATOR"
                        ? "조사, 제작 및 편집 승인"
                        : "조회 전용"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-[var(--border)] p-4 text-xs muted">
          서버에서 권한을 검증합니다. 계정 생성과 인증 정보 관리 방법은 실행
          안내에 설명되어 있습니다.
        </p>
      </section>
    </div>
  );
}
