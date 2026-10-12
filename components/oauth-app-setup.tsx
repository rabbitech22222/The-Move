"use client";
import { useState } from "react";
import { useWorkspace } from "./workspace-provider";
import { Button } from "./ui/button";
export function OAuthAppSetup({
  provider,
  callbackUrl,
  disabled,
  onSaved,
}: {
  provider: "canva" | "meta";
  callbackUrl: string;
  disabled: boolean;
  onSaved: () => void;
}) {
  const { mutate } = useWorkspace();
  const [clientId, setClientId] = useState("");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <details className="border border-[var(--border)] rounded-lg p-4">
      <summary className="cursor-pointer font-medium text-sm">
        {provider === "canva" ? "Canva Connect" : "Meta"} 공식 개발자 앱 설정
      </summary>
      <p className="text-xs muted mt-3">
        공식 개발자 콘솔에서 발급한 앱 ID·비밀 키를 설정합니다. 저장만으로
        계정이 연결되지는 않습니다. 저장 후 계정 인증을 실행하세요.
      </p>
      <a
        href={
          provider === "canva"
            ? "https://www.canva.com/developers/"
            : "https://developers.facebook.com/apps/"
        }
        target="_blank"
        rel="noreferrer"
        className="text-xs underline block mt-2"
      >
        공식 개발자 콘솔 열기
      </a>
      <p className="text-xs mt-3 break-all">
        개발자 콘솔에 등록할 콜백: <code>{callbackUrl}</code>
      </p>
      <form
        className="space-y-3 mt-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await mutate("/api/settings", {
              action: "configure-oauth",
              provider,
              clientId: clientId.trim(),
              clientSecret: secret.trim(),
            });
            setClientId("");
            onSaved();
          } catch (e) {
            setError(e instanceof Error ? e.message : "설정 저장 실패");
          } finally {
            setSecret("");
            setBusy(false);
          }
        }}
      >
        <label className="block">
          <span className="field-label">
            {provider === "canva" ? "Canva 클라이언트 ID" : "Meta 앱 ID"}
          </span>
          <input
            className="input w-full mt-1"
            autoComplete="off"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="field-label">
            {provider === "canva"
              ? "Canva 클라이언트 비밀 키"
              : "Meta 앱 비밀 키"}
          </span>
          <input
            className="input w-full mt-1"
            type="password"
            autoComplete="off"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        <Button
          disabled={
            disabled || busy || !clientId.trim() || secret.trim().length < 8
          }
        >
          {busy ? "암호화 저장 중…" : "앱 설정 암호화 저장"}
        </Button>
      </form>
    </details>
  );
}
