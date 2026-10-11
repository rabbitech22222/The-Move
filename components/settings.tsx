"use client";

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
    purpose: "Sourced research assistance and channel-specific drafts.",
    variables: "OPENAI_API_KEY",
    href: null,
  },
  {
    key: "canva" as const,
    name: "Canva Connect",
    letter: "C",
    purpose: "Inspect approved templates and create editable design drafts.",
    variables: "CANVA_CLIENT_ID · CANVA_CLIENT_SECRET",
    href: "/api/oauth/canva",
  },
  {
    key: "meta" as const,
    name: "Instagram / Meta",
    letter: "M",
    purpose: "Authorized account insights and approved publishing.",
    variables: "META_APP_ID · META_APP_SECRET",
    href: "/api/oauth/meta",
  },
  {
    key: "redis" as const,
    name: "Redis / BullMQ",
    letter: "Q",
    purpose: "Persistent jobs, retries and recurring synchronization.",
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
  const [accountChannelId, setAccountChannelId] = useState("");
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
        throw new Error(
          result.error || "Integration configuration is unavailable.",
        );
      setConfiguration(result.data);
    } catch (err) {
      setConfigurationError(
        err instanceof Error
          ? err.message
          : "Could not load integration configuration.",
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
            : "Account operation could not be completed.",
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
        text: "Channel added. Authorize its Instagram account to synchronize metrics and register an approved template before design production.",
        failed: false,
      });
    } catch (err) {
      setChannelFeedback({
        text:
          err instanceof Error
            ? err.message
            : "The channel could not be created.",
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
        text: "Editorial rules saved as a new version. Existing drafts keep their revision history.",
        failed: false,
      });
    } catch (err) {
      setNotice({
        text:
          err instanceof Error
            ? err.message
            : "Could not save editorial rules.",
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
          <p className="eyebrow">WORKSPACE / CONNECTIONS / PREFERENCES</p>
          <h1 className="page-title">Settings</h1>
          <p className="mt-2 muted">
            Configure the tools and editorial principles behind your workspace.
          </p>
        </div>
        <Badge>{data.demo ? "Demo workspace" : "Live workspace"}</Badge>
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
            <h2 className="font-semibold">Integrations</h2>
            <p className="mt-1 text-xs muted">
              Configuration presence is separate from verified API access.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadConfiguration()}
          >
            Refresh status
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
                          ? "Status unavailable"
                          : "Checking configuration…")}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs muted">{item.purpose}</p>
                  <p className="mt-2 text-[11px] leading-relaxed muted">
                    {integration?.details ||
                      "Checking server-side configuration. Credential values are never sent to this page."}
                  </p>
                  <p className="mt-2 flex items-center gap-1.5 font-mono text-[10px] muted">
                    <KeyRound size={10} />
                    {item.variables}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {integration && (
                    <span className="text-xs muted">
                      {integration.configured
                        ? "Configuration present"
                        : "Configuration missing"}
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
                          <Plug size={13} /> Authorize
                        </a>
                      ) : (
                        <>
                          <Plug size={13} /> Authorize
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
            Set secrets in the server environment using{" "}
            <code>.env.example</code> as a guide. OAuth tokens are encrypted at
            rest. Never enter private keys into editorial fields or share them
            in chat. Successful end-to-end verification is required before
            treating an integration as operational.
          </p>
        </div>
      </section>
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2 className="font-semibold">Add a channel</h2>
            <p className="mt-1 text-xs muted">
              Bring another brand into the workspace with its own editorial
              voice.
            </p>
          </div>
          <Badge>Admin only</Badge>
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
              <span className="field-label">Channel name</span>
              <input
                className="input"
                required
                minLength={1}
                maxLength={100}
                placeholder="Brand or publication name"
                value={newChannelName}
                onChange={(e) => setNewChannelName(e.target.value)}
              />
            </label>
            <label>
              <span className="field-label">Channel handle</span>
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
            <span className="field-label">Initial editorial guidelines</span>
            <textarea
              className="input min-h-24 w-full"
              required
              minLength={10}
              maxLength={10000}
              placeholder="Describe this channel’s voice, source standards and editorial priorities."
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
              New channels start disconnected. Account metrics appear after
              authorized synchronization.
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
              {accountBusy === "create-channel" ? "Adding…" : "Add channel"}
            </Button>
          </div>
        </form>
      </section>
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2 className="font-semibold">Authorized Instagram accounts</h2>
            <p className="mt-1 text-xs muted">
              Map an authorized professional account to a brand, then
              synchronize its metrics.
            </p>
          </div>
          <Badge>Admin mapping</Badge>
        </div>
        <div className="divide-y divide-[var(--border)]">
          {data.channels.map((c) => (
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
                    ? `Authorized account: ${c.platformAccountId}`
                    : "No verified Instagram account mapped"}
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
                  {c.connected ? "Authorized account" : "Disconnected"}
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
                      "Metric synchronization queued. Check the Analyst task in the Office for its confirmed result.",
                    )
                  }
                >
                  {accountBusy === c.id ? "Queuing…" : "Sync metrics"}
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
              "Authorized Instagram account verified and mapped. Queue a synchronization to retrieve its metrics.",
            );
          }}
        >
          <div className="grid items-end gap-3 md:grid-cols-[minmax(150px,1fr)_minmax(220px,1.5fr)_auto]">
            <label>
              <span className="field-label">Channel</span>
              <select
                className="select"
                required
                value={accountChannelId}
                onChange={(e) => setAccountChannelId(e.target.value)}
              >
                <option value="">Select a channel…</option>
                {data.channels.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="field-label">
                Instagram professional account ID
              </span>
              <input
                className="input"
                required
                inputMode="numeric"
                pattern="[0-9]+"
                maxLength={40}
                placeholder="Authorized Instagram account ID"
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
              {accountBusy === "map" ? "Verifying…" : "Verify & map account"}
            </Button>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed muted">
            An administrator must authorize Meta and provide the professional
            account ID from the authorized account. The server verifies API
            access before recording the mapping. A mapped account does not imply
            metrics have been synchronized.
          </p>
        </form>
      </section>
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="panel">
          <div className="panel-header flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">Editorial rules</h2>
              <p className="mt-1 text-xs muted">
                Versioned guidelines keep channel voices consistent.
              </p>
            </div>
            {channel && <Badge>Version {channel.guidelineVersion}</Badge>}
          </div>
          <form
            className="space-y-4 p-5"
            onSubmit={(e) => {
              e.preventDefault();
              void saveGuidelines();
            }}
          >
            <label className="block">
              <span className="field-label">Channel</span>
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
                  Select a channel
                </option>
                {data.channels.map((c) => (
                  <option value={c.id} key={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="field-label">
                Writing & editorial guidelines
              </span>
              <textarea
                className="input mt-2 min-h-52 w-full text-sm leading-relaxed"
                required
                minLength={10}
                maxLength={10000}
                value={guidelines}
                onChange={(e) => setGuidelines(e.target.value)}
                placeholder="Voice, structure, source standards and prohibited claims…"
              />
            </label>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="max-w-xs text-xs leading-relaxed muted">
                Analytics may propose changes. Guidelines change only through a
                deliberate human action.
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
                {busy ? "Saving…" : "Save new version"}
              </Button>
            </div>
          </form>
          {channel?.guidelineHistory?.length ? (
            <details className="mx-5 mb-5 rounded-lg border border-[var(--border)] p-3">
              <summary className="cursor-pointer text-xs font-medium">
                Rule revision history ({channel.guidelineHistory.length})
              </summary>
              <div className="mt-3 space-y-3">
                {[...channel.guidelineHistory].reverse().map((rule) => (
                  <article
                    key={rule.version}
                    className="border-t border-[var(--border)] pt-3"
                  >
                    <div className="flex items-center justify-between text-[10px] muted">
                      <span>Version {rule.version}</span>
                      <span>
                        {rule.changedAt
                          ? new Date(rule.changedAt).toLocaleString()
                          : "Change time not recorded"}
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
            <h2 className="font-semibold">Appearance & accessibility</h2>
          </div>
          <div className="space-y-5 p-5">
            <div>
              <p className="field-label">Theme</p>
              <div className="mt-3 flex gap-2">
                <Button
                  className="flex-1"
                  variant={theme === "light" ? "secondary" : "outline"}
                  onClick={() => appearance("light")}
                  aria-pressed={theme === "light"}
                >
                  <Sun size={15} /> Light
                </Button>
                <Button
                  className="flex-1"
                  variant={theme === "dark" ? "secondary" : "outline"}
                  onClick={() => appearance("dark")}
                  aria-pressed={theme === "dark"}
                >
                  <Moon size={15} /> Dark
                </Button>
              </div>
            </div>
            <div className="border-t border-[var(--border)] pt-5">
              <label className="flex cursor-pointer items-center justify-between gap-4">
                <span>
                  <span className="block text-sm font-medium">
                    Reduce motion
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed muted">
                    Simplify Office animations and workspace transitions.
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
              Appearance preferences are saved on this browser.
            </p>
          </div>
        </aside>
      </div>
      <section className="panel">
        <div className="panel-header flex items-center gap-2">
          <Users size={16} />
          <div>
            <h2 className="font-semibold">Operators & permissions</h2>
            <p className="mt-1 text-xs muted">
              Two human operators oversee editorial quality and publishing
              approval.
            </p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table w-full">
            <thead>
              <tr>
                <th className="text-left">Operator</th>
                <th className="text-left">Account</th>
                <th className="text-left">Role</th>
                <th className="text-left">Responsibility</th>
              </tr>
            </thead>
            <tbody>
              {(configuration?.operators || data.operators).map((operator) => (
                <tr key={operator.id}>
                  <td className="font-medium">{operator.name}</td>
                  <td className="text-xs muted">{operator.email}</td>
                  <td>
                    <Badge>{operator.role.toLowerCase()}</Badge>
                  </td>
                  <td className="text-xs muted">
                    {operator.role === "ADMIN"
                      ? "Workspace administration and editorial approval"
                      : operator.role === "OPERATOR"
                        ? "Research, production and editorial approval"
                        : "Read-only workspace access"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-[var(--border)] p-4 text-xs muted">
          Roles are enforced on server mutations. Account provisioning and
          credential management are documented in the local setup guide.
        </p>
      </section>
    </div>
  );
}
