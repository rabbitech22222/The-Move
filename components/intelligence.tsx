"use client";
import { useRouter } from "next/navigation";
import { koreanLabel } from "@/lib/korean";

import { useMemo, useState } from "react";
import {
  Bookmark,
  Check,
  ChevronDown,
  ExternalLink,
  FileText,
  Plus,
  Radio,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import {
  useWorkspace,
  WorkspaceError,
  WorkspaceLoading,
} from "@/components/workspace-provider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Topic } from "@/lib/domain";

function date(value: string | null) {
  return value
    ? new Date(value).toLocaleDateString("ko-KR", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "Asia/Seoul",
      })
    : "미제공";
}

export function Intelligence() {
  const router = useRouter();
  const { data, loading, mutate, refresh } = useWorkspace();
  const [search, setSearch] = useState("");
  const [channel, setChannel] = useState("all");
  const [status, setStatus] = useState("INBOX");
  const [selected, setSelected] = useState<Topic | null>(null);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [sourceName, setSourceName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceType, setSourceType] = useState<"RSS" | "MANUAL">("RSS");
  const [rights, setRights] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{
    text: string;
    failed: boolean;
  } | null>(null);
  const topics = useMemo(
    () =>
      data?.topics
        .filter(
          (t) =>
            (status === "all" || t.status === status) &&
            (channel === "all" || t.recommendedChannelId === channel) &&
            `${t.title} ${t.category}`
              .toLowerCase()
              .includes(search.toLowerCase()),
        )
        .sort((a, b) =>
          (b.publishedAt || b.retrievedAt).localeCompare(
            a.publishedAt || a.retrievedAt,
          ),
        ) ?? [],
    [data, search, channel, status],
  );

  async function action(
    key: string,
    body: Record<string, unknown>,
    success: string,
  ) {
    setBusy(key);
    setNotice(null);
    try {
      await mutate("/api/intelligence", body);
      setNotice({ text: success, failed: false });
      return true;
    } catch (err) {
      setNotice({
        text:
          err instanceof Error ? err.message : "작업을 완료하지 못했습니다.",
        failed: true,
      });
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function fetchSources() {
    await action(
      "ingest",
      { action: "refresh-news" },
      "실제 뉴스 수집을 요청했습니다. 결과는 자동 갱신되며 출처별 실패도 표시합니다.",
    );
  }
  if (loading) return <WorkspaceLoading />;
  if (!data) return <WorkspaceError />;
  const selectedSource = data.sources.find((s) => s.id === selected?.sourceId);
  return (
    <div className="space-y-6">
      <header className="page-header">
        <div>
          <p className="eyebrow">발견 / 조사 / 평가</p>
          <h1 className="page-title">정보 수집</h1>
          <p className="muted mt-2">
            다음 콘텐츠를 위한 정보 수집 공간입니다. 모든 주장은 출처에서
            시작합니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={() => void refresh()}>
            수신함 새로고침
          </Button>
          <Button variant="outline" onClick={() => setSourceOpen(true)}>
            <Plus size={15} /> 출처 추가
          </Button>
          <Button onClick={fetchSources} disabled={!!busy}>
            <Radio size={15} />
            {busy === "ingest" ? "대기열에 등록 중…" : "출처 수집"}
          </Button>
        </div>
      </header>
      {notice && (
        <div
          role={notice.failed ? "alert" : "status"}
          className={`rounded-lg border p-3 text-sm ${notice.failed ? "border-red-400/40 bg-red-500/5 text-red-600" : "border-[var(--border)] bg-[var(--surface)]"}`}
        >
          {notice.text}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          label="수신함"
          value={data.topics.filter((t) => t.status === "INBOX").length}
          description="검토를 기다리는 주제"
        />
        <Stat
          label="저장한 주제"
          value={data.topics.filter((t) => t.status === "SAVED").length}
          description="유망한 주제를 저장하세요"
        />
        <Stat
          label="활성 출처"
          value={data.sources.filter((s) => s.enabled).length}
          description="접근 권한이 있는 RSS와 제출 자료"
        />
      </div>
      <section className="panel p-5" aria-label="제작 후보">
        <h2 className="font-semibold">
          {data.demo ? "예시 제작 후보" : "실제 뉴스 기반 제작 후보"}
        </h2>
        <p className="text-xs muted mt-1">
          THE MOVE 관심 키워드와 최신성으로 정렬했습니다. 사실 확인 전 후보이며
          성과 예측이 아닙니다. Instagram 연결 없이도 조사·편집을 시작할 수
          있습니다.
        </p>
        <div className="grid gap-3 mt-4 md:grid-cols-2 xl:grid-cols-3">
          {data.topics
            .filter(
              (t) =>
                t.status !== "DISMISSED" &&
                !data.projects.some((p) => p.sourceUrls.includes(t.sourceUrl)),
            )
            .sort(
              (a, b) =>
                b.relevance - a.relevance ||
                (b.publishedAt || b.retrievedAt).localeCompare(
                  a.publishedAt || a.retrievedAt,
                ),
            )
            .slice(0, 6)
            .map((topic) => (
              <article
                key={topic.id}
                className="border border-[var(--border)] rounded-lg p-4 flex flex-col gap-3"
              >
                <p className="text-xs muted">
                  {data.sources.find((s) => s.id === topic.sourceId)?.name} ·{" "}
                  {date(topic.publishedAt)}
                </p>
                <h3 className="text-sm font-semibold leading-relaxed">
                  {topic.title}
                </h3>
                <p className="text-xs muted">
                  선정 점수 {topic.relevance}/100 ·{" "}
                  {koreanLabel(topic.confidence)} 근거
                </p>
                <details className="text-xs muted">
                  <summary className="cursor-pointer">
                    선정 이유·확인할 사항
                  </summary>
                  <p className="mt-2">{topic.scoreExplanation}</p>
                  <p className="mt-2">{topic.uncertainClaims.join(" ")}</p>
                </details>
                <div className="flex gap-3 items-center mt-auto">
                  <a
                    href={topic.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs underline"
                  >
                    원문 확인
                  </a>
                  <Button
                    size="sm"
                    disabled={!!busy}
                    onClick={async () => {
                      if (
                        await action(
                          topic.id,
                          {
                            action: "create-project",
                            topicId: topic.id,
                            format: "CAROUSEL",
                          },
                          "실제 출처와 조사 준비서를 스튜디오에 저장했습니다.",
                        )
                      )
                        router.push("/studio");
                    }}
                  >
                    조사·제작 시작
                  </Button>
                </div>
              </article>
            ))}
        </div>
        {!data.topics.length && (
          <p className="text-sm muted mt-4">
            {data.tasks.some(
              (t) =>
                t.kind === "NEWS_INGEST" &&
                ["QUEUED", "RUNNING"].includes(t.status),
            )
              ? "공개 RSS 수집 중입니다. 실제 결과가 들어오면 자동으로 표시합니다."
              : "수집된 뉴스가 없습니다. 출처 수집을 실행하고 아래 출처별 결과를 확인하세요."}
          </p>
        )}
      </section>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
        <section className="panel min-w-0 overflow-hidden">
          <div className="panel-header flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">
                정보 수신함{" "}
                <span className="ml-2 text-xs font-normal muted">
                  {topics.length} 개 주제
                </span>
              </h2>
              <p className="muted mt-1 text-xs">
                관련도는 설명 가능한 규칙 점수이며 유행 확률 예측이 아닙니다.
              </p>
            </div>
            <div className="flex gap-1">
              <Button
                variant={status === "INBOX" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setStatus("INBOX")}
              >
                수신함
              </Button>
              <Button
                variant={status === "SAVED" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setStatus("SAVED")}
              >
                저장됨
              </Button>
              <Button
                variant={status === "all" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setStatus("all")}
              >
                전체
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 border-b border-[var(--border)] p-4">
            <label className="relative min-w-[180px] flex-1">
              <span className="sr-only">정보 주제 검색</span>
              <Search
                size={15}
                className="absolute left-3 top-3 text-[var(--muted-text)]"
              />
              <input
                className="input w-full !pl-9"
                placeholder="주제 또는 분류 검색…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <select
              className="select !w-auto"
              aria-label="추천 채널 필터"
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
            >
              <option value="all">전체 채널</option>
              {data.channels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="overflow-x-auto">
            <table className="data-table w-full">
              <thead>
                <tr>
                  <th className="text-left">주제 및 출처</th>
                  <th className="text-left">채널</th>
                  <th className="text-left">관련도</th>
                  <th className="text-left">근거</th>
                  <th>
                    <span className="sr-only">작업</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {topics.map((topic) => (
                  <tr key={topic.id}>
                    <td className="min-w-[280px]">
                      <button
                        className="max-w-96 whitespace-normal text-left font-medium leading-relaxed hover:text-[var(--accent)] focus-visible:underline"
                        onClick={() => setSelected(topic)}
                      >
                        {topic.title}
                      </button>
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs muted">
                        <span>
                          {data.sources.find((s) => s.id === topic.sourceId)
                            ?.name ?? "제출 출처"}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{date(topic.publishedAt)}</span>
                      </p>
                      <div className="mt-2 flex gap-2">
                        <Badge>{koreanLabel(topic.category)}</Badge>
                        <Badge>
                          {topic.format === "REEL" ? "릴스" : "캐러셀"}
                        </Badge>
                        {topic.status === "DISMISSED" && <Badge>제외됨</Badge>}
                      </div>
                    </td>
                    <td className="text-xs whitespace-nowrap">
                      {data.channels.find(
                        (c) => c.id === topic.recommendedChannelId,
                      )?.name ?? "미지정"}
                    </td>
                    <td>
                      <button
                        className="text-left"
                        onClick={() => setSelected(topic)}
                        aria-label={`${topic.title}의 관련도 점수 ${topic.relevance}점 근거 보기`}
                      >
                        <span className="font-semibold tabular-nums">
                          {topic.relevance}
                          <span className="text-xs font-normal muted">
                            {" "}
                            / 100
                          </span>
                        </span>
                        <div className="mt-2 h-1 w-20 overflow-hidden rounded-full bg-[var(--muted)]">
                          <div
                            style={{
                              width: `${Math.max(0, Math.min(100, topic.relevance))}%`,
                            }}
                            className="h-full bg-[var(--accent)]"
                          />
                        </div>
                      </button>
                    </td>
                    <td>
                      <Badge
                        className={
                          topic.confidence === "HIGH"
                            ? "text-emerald-700 dark:text-emerald-400"
                            : topic.confidence === "LOW"
                              ? "text-amber-700 dark:text-amber-400"
                              : ""
                        }
                      >
                        {koreanLabel(topic.confidence)}
                      </Badge>
                      {topic.uncertainClaims.length > 0 && (
                        <p className="mt-2 text-[11px] muted">
                          {topic.uncertainClaims.length} 개 불확실한 주장
                        </p>
                      )}
                    </td>
                    <td>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setSelected(topic)}
                        aria-label={`${topic.title} 검토`}
                      >
                        <ChevronDown size={16} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {topics.length === 0 && (
              <div className="empty-state">
                <FileText
                  className="mx-auto mb-3 text-[var(--muted-text)]"
                  size={28}
                />
                <p className="font-medium">표시할 주제 없음</p>
                <p className="mt-1 text-sm muted">
                  필터를 변경하거나 접근 권한이 있는 출처를 추가하세요.
                </p>
              </div>
            )}
          </div>
        </section>
        <aside className="space-y-4">
          <section className="panel">
            <div className="panel-header">
              <h2 className="text-sm font-semibold">출처 목록</h2>
            </div>
            <div className="divide-y divide-[var(--border)]">
              {data.sources.map((source) => (
                <div key={source.id} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-sm font-medium hover:underline"
                    >
                      {source.name}
                      <ExternalLink size={11} />
                    </a>
                    <Badge className="text-[9px]">{source.type}</Badge>
                  </div>
                  <p className="mt-2 text-xs muted">
                    {source.lastFetchedAt
                      ? `수집일 ${date(source.lastFetchedAt)}`
                      : "아직 수집 전"}
                  </p>
                  {source.lastError && (
                    <p className="mt-2 text-xs text-red-600">
                      {source.lastError}
                    </p>
                  )}
                  <p className="mt-2 line-clamp-2 text-[11px] muted">
                    {source.rights || "이용 권한 확인 필요"}
                  </p>
                </div>
              ))}
              {data.sources.length === 0 && (
                <p className="p-4 text-sm muted">
                  아직 출처가 없습니다. 피드를 추가하세요.
                </p>
              )}
            </div>
          </section>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--accent-soft)] p-4">
            <Sparkles size={17} className="mb-3 text-[var(--accent)]" />
            <h3 className="text-sm font-semibold">근거를 먼저 확인하세요</h3>
            <p className="mt-2 text-xs leading-relaxed muted">
              프로젝트를 만들기 전 출처 날짜, 이용 권한과 불확실한 주장을
              확인하세요. AI 제안도 사람의 검토가 필요합니다.
            </p>
          </div>
        </aside>
      </div>
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent>
          {selected && (
            <>
              <p className="eyebrow mb-2">주제 요약</p>
              <DialogTitle className="pr-6 text-xl font-semibold leading-snug">
                {selected.title}
              </DialogTitle>
              <DialogDescription className="mt-2 text-sm muted">
                근거를 확인하고 다음 편집 작업을 선택하세요.
              </DialogDescription>
              <div className="mt-5 flex flex-wrap gap-2">
                <Badge>{koreanLabel(selected.category)}</Badge>
                <Badge>{koreanLabel(selected.confidence)} 근거 신뢰 수준</Badge>
                <Badge>{koreanLabel(selected.status)}</Badge>
              </div>
              <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-xs muted">출처</dt>
                  <dd className="mt-1">
                    {selectedSource?.name || "제출 출처"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs muted">게시 완료</dt>
                  <dd className="mt-1">{date(selected.publishedAt)}</dd>
                </div>
                <div>
                  <dt className="text-xs muted">수집일</dt>
                  <dd className="mt-1">{date(selected.retrievedAt)}</dd>
                </div>
                <div>
                  <dt className="text-xs muted">추천 채널</dt>
                  <dd className="mt-1">
                    {data.channels.find(
                      (c) => c.id === selected.recommendedChannelId,
                    )?.name || "미지정"}
                  </dd>
                </div>
              </dl>
              <a
                href={selected.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex items-center gap-2 text-sm text-[var(--accent)] hover:underline"
              >
                원문 보기 <ExternalLink size={13} />
              </a>
              <section className="mt-5 rounded-lg bg-[var(--muted)] p-4">
                <h3 className="text-sm font-medium">
                  점수 산정 근거 {selected.relevance} / 100
                </h3>
                <p className="mt-2 text-sm leading-relaxed muted">
                  {selected.scoreExplanation}
                </p>
              </section>
              <section className="mt-4">
                <h3 className="text-sm font-medium">권한 및 검증</h3>
                <p className="mt-2 text-sm muted">
                  {selected.rights ||
                    "이용 권한을 확인하지 못했습니다. 재사용 전에 검토하세요."}
                </p>
                {selected.uncertainClaims.length ? (
                  <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-amber-700 dark:text-amber-400">
                    {selected.uncertainClaims.map((claim, i) => (
                      <li key={i}>{claim}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs muted">
                    표시된 불확실한 주장은 없습니다. 그래도 사람이 검증해야
                    합니다.
                  </p>
                )}
              </section>
              {notice && (
                <p
                  role={notice.failed ? "alert" : "status"}
                  className={`mt-4 text-sm ${notice.failed ? "text-red-600" : "muted"}`}
                >
                  {notice.text}
                </p>
              )}
              <div className="mt-6 flex flex-wrap gap-2 border-t border-[var(--border)] pt-4">
                <Button
                  disabled={!!busy}
                  onClick={() =>
                    action(
                      selected.id,
                      {
                        action: "create-project",
                        topicId: selected.id,
                        format: "CAROUSEL",
                      },
                      "스튜디오에 캐러셀 프로젝트를 만들었습니다.",
                    )
                  }
                >
                  <Plus size={14} /> 캐러셀 만들기
                </Button>
                <Button
                  variant="outline"
                  disabled={!!busy}
                  onClick={() =>
                    action(
                      selected.id,
                      {
                        action: "create-project",
                        topicId: selected.id,
                        format: "REEL",
                      },
                      "스튜디오에 릴스 프로젝트를 만들었습니다.",
                    )
                  }
                >
                  릴스 만들기
                </Button>
                <Button
                  variant="outline"
                  disabled={!!busy}
                  onClick={() =>
                    action(
                      selected.id,
                      { action: "research", topicId: selected.id },
                      "스튜디오에 출처와 조사 준비서를 저장했습니다. AI가 연결되어 있으면 초안 작업도 실행합니다.",
                    )
                  }
                >
                  <Search size={14} /> 추가 조사
                </Button>
                <Button
                  variant="ghost"
                  disabled={!!busy}
                  onClick={async () => {
                    if (
                      await action(
                        selected.id,
                        { action: "save", topicId: selected.id },
                        "주제를 저장했습니다.",
                      )
                    )
                      setSelected(null);
                  }}
                >
                  <Bookmark size={14} /> 저장
                </Button>
                <Button
                  variant="ghost"
                  disabled={!!busy}
                  onClick={async () => {
                    if (
                      await action(
                        selected.id,
                        { action: "dismiss", topicId: selected.id },
                        "주제를 제외했습니다.",
                      )
                    )
                      setSelected(null);
                  }}
                >
                  <X size={14} /> 제외
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={sourceOpen} onOpenChange={setSourceOpen}>
        <DialogContent>
          <DialogTitle className="text-xl font-semibold">출처 추가</DialogTitle>
          <DialogDescription className="mt-2 text-sm muted">
            접근 권한이 있는 RSS 또는 출처 URL을 사용하세요. 출처 표기만으로
            콘텐츠 재사용 권한을 얻지는 않습니다.
          </DialogDescription>
          <form
            className="mt-6 space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy("source");
              setNotice(null);
              try {
                await mutate("/api/intelligence", {
                  action: "add-source",
                  source: {
                    name: sourceName,
                    url: sourceUrl,
                    rights,
                    type: sourceType,
                  },
                });
                setSourceOpen(false);
                setSourceName("");
                setSourceUrl("");
                setRights("");
                setNotice({
                  text: "출처를 추가했습니다. 출처 수집을 실행하세요.",
                  failed: false,
                });
              } catch (err) {
                setNotice({
                  text:
                    err instanceof Error
                      ? err.message
                      : "출처를 추가하지 못했습니다.",
                  failed: true,
                });
              } finally {
                setBusy(null);
              }
            }}
          >
            <label className="block">
              <span className="field-label">출처 유형</span>
              <select
                className="select mt-1 w-full"
                value={sourceType}
                onChange={(e) =>
                  setSourceType(e.target.value as "RSS" | "MANUAL")
                }
              >
                <option value="RSS">RSS 피드</option>
                <option value="MANUAL">직접 제출한 출처</option>
              </select>
            </label>
            <label className="block">
              <span className="field-label">출처 이름</span>
              <input
                className="input mt-1 w-full"
                required
                maxLength={120}
                placeholder="매체 또는 기관"
                value={sourceName}
                onChange={(e) => setSourceName(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="field-label">
                {sourceType === "RSS" ? "RSS 피드 주소" : "출처 주소"}
              </span>
              <input
                className="input mt-1 w-full"
                type="url"
                required
                placeholder="https://example.com/feed.xml"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="field-label">이용 권한 및 허용 범위</span>
              <textarea
                className="input mt-1 min-h-24 w-full"
                required
                maxLength={2000}
                placeholder="접근 조건과 제한을 기록하세요. 모르면 미확인으로 작성하세요."
                value={rights}
                onChange={(e) => setRights(e.target.value)}
              />
            </label>
            {notice?.failed && (
              <p role="alert" className="text-sm text-red-600">
                {notice.text}
              </p>
            )}
            <Button type="submit" disabled={!!busy}>
              <Check size={14} />
              {busy === "source" ? "추가 중…" : "출처 추가"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({
  label,
  value,
  description,
}: {
  label: string;
  value: number;
  description: string;
}) {
  return (
    <div className="panel p-5">
      <p className="eyebrow">{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums">
        {value}
      </p>
      <p className="mt-2 text-xs muted">{description}</p>
    </div>
  );
}
