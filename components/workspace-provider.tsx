"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";
import type { WorkspaceData } from "@/lib/domain";

type WorkspaceContext = {
  data: WorkspaceData | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  mutate: (endpoint: string, body: unknown) => Promise<void>;
  notice: string | null;
};
const Context = createContext<WorkspaceContext | null>(null);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/workspace", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok || !result.data)
        throw new Error(
          result.error || "Unable to load the workspace. Please try again.",
        );
      setData(result.data);
      setError(null);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to load workspace.",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  const mutate = useCallback(
    async (endpoint: string, body: unknown) => {
      setError(null);
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const result = await response.json();
        if (!response.ok)
          throw new Error(
            result.error || "This action could not be completed.",
          );
        if (result.data?.workspaceName) setData(result.data);
        else await refresh();
        setNotice(
          typeof result.message === "string"
            ? result.message
            : "Workspace updated.",
        );
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setNotice(null), 4000);
      } catch (cause) {
        const message =
          cause instanceof Error
            ? cause.message
            : "This action could not be completed.";
        setError(message);
        throw new Error(message);
      }
    },
    [refresh],
  );
  useEffect(() => {
    void refresh();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [refresh]);
  return (
    <Context.Provider value={{ data, loading, error, refresh, mutate, notice }}>
      {children}
      {notice && (
        <div className="toast" role="status">
          <CheckCircle2 size={16} />
          {notice}
        </div>
      )}
    </Context.Provider>
  );
}

export function useWorkspace() {
  const context = useContext(Context);
  if (!context)
    throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return context;
}

export function WorkspaceLoading() {
  return (
    <div aria-label="Loading workspace" role="status">
      <div className="skeleton h-9 w-56 mb-8" />
      <div className="stat-grid">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-36" />
        ))}
      </div>
      <div className="skeleton h-80" />
    </div>
  );
}
export function WorkspaceError() {
  const { error, refresh } = useWorkspace();
  return error ? (
    <div className="status-banner error" role="alert">
      <AlertCircle size={15} className="shrink-0 mt-0.5" />
      <span className="flex-1">{error}</span>
      <button
        className="flex items-center gap-1 shrink-0"
        onClick={() => void refresh()}
      >
        <RefreshCw size={12} /> Retry
      </button>
    </div>
  ) : null;
}
