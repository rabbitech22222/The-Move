"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Radar,
  PanelsTopLeft,
  Shapes,
  Building2,
  ChartNoAxesCombined,
  Settings2,
  ArrowUpRight,
  Plus,
  Moon,
  Sun,
  Menu,
  ChevronRight,
  Command,
  LogOut,
  Layers2,
  FlaskConical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/components/workspace-provider";
import type { Operator } from "@/lib/domain";

const navigation = [
  { label: "대시보드", href: "/", icon: LayoutDashboard },
  { label: "정보 수집", href: "/intelligence", icon: Radar },
  { label: "스튜디오", href: "/studio", icon: PanelsTopLeft },
  { label: "캔바 제작소", href: "/canva", icon: Shapes },
  { label: "오피스", href: "/office", icon: Building2 },
  { label: "분석", href: "/analytics", icon: ChartNoAxesCombined },
  { label: "설정", href: "/settings", icon: Settings2 },
];

export function Shell({
  children,
  operator,
}: {
  children: React.ReactNode;
  operator: Operator;
}) {
  const pathname = usePathname();
  const { data } = useWorkspace();
  const [theme, setTheme] = useState("light");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  useEffect(() => {
    const update = () => {
      const next = localStorage.getItem("move-theme") || "light";
      setTheme(next);
      document.documentElement.dataset.theme = next;
      document.documentElement.dataset.reducedMotion =
        localStorage.getItem("move-reduced-motion") || "false";
    };
    update();
    window.addEventListener("move-theme", update);
    window.addEventListener("move-reduced-motion", update);
    window.addEventListener("move-preferences", update);
    return () => {
      window.removeEventListener("move-theme", update);
      window.removeEventListener("move-reduced-motion", update);
      window.removeEventListener("move-preferences", update);
    };
  }, []);
  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    localStorage.setItem("move-theme", next);
    window.dispatchEvent(new Event("move-theme"));
  };
  const signOut = async () => {
    try {
      const response = await fetch("/api/auth", { method: "DELETE" });
      if (!response.ok)
        throw new Error("로그아웃하지 못했습니다. 다시 시도하세요.");
      window.location.assign("/login");
    } catch (cause) {
      setLogoutError(
        cause instanceof Error ? cause.message : "로그아웃하지 못했습니다.",
      );
    }
  };
  const active = navigation.find((item) =>
    item.href === "/" ? pathname === "/" : pathname.startsWith(item.href),
  );
  return (
    <div className="workspace-shell">
      <aside
        className={`sidebar ${mobileOpen ? "mobile-open" : ""}`}
        aria-label="주 메뉴"
      >
        <Link
          href="/"
          className="brand-lockup"
          onClick={() => setMobileOpen(false)}
        >
          <span className="brand-mark">
            <Layers2 size={17} strokeWidth={2.2} />
          </span>
          <span className="brand-name">
            THE MOVE<span>OS</span>
          </span>
        </Link>
        <div className="workspace-switcher">
          <span className="workspace-avatar">TM</span>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-semibold">편집 작업 공간</div>
            <div className="text-[9px] muted mt-0.5">
              {data?.operators.length ?? 2} 명 운영자 · THE MOVE 전용
            </div>
          </div>
          <Command size={12} className="muted" />
        </div>
        <p className="nav-group-label">작업 공간</p>
        <nav className="sidebar-nav">
          {navigation.map(({ label, href, icon: Icon }) => {
            const isActive = active?.href === href;
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setMobileOpen(false)}
                className={`nav-link ${isActive ? "active" : ""}`}
                aria-current={isActive ? "page" : undefined}
              >
                <Icon size={16} strokeWidth={1.6} />
                {label}
                {isActive && <span className="nav-dot" />}
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <Link href="/settings" className="sidebar-note block">
            <div className="sidebar-note-title">
              <FlaskConical size={13} className="muted" />
              {data?.demo ? "데모 작업 공간" : "연결 상태"}
              <ArrowUpRight size={12} className="ml-auto muted" />
            </div>
            <p>
              {data?.demo
                ? "제작 흐름을 살펴보세요. 모든 예시 지표에는 표시가 있습니다."
                : "계정과 서비스 연결, 작업 공간 환경을 관리합니다."}
            </p>
          </Link>
          <div className="operator-chip">
            <span className="operator-avatar">
              {operator.name
                .split(" ")
                .map((s) => s[0])
                .join("")
                .slice(0, 2)}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-semibold truncate">
                {operator.name}
              </div>
              <div className="text-[9px] muted mt-0.5">
                {operator.role === "ADMIN" ? "작업 공간 관리자" : "편집 운영자"}
              </div>
            </div>
            <button
              onClick={() => void signOut()}
              title="로그아웃"
              aria-label="로그아웃"
              className="muted hover:text-[var(--accent)]"
            >
              <LogOut size={14} />
            </button>
          </div>
          {logoutError && (
            <p className="text-[10px] negative mt-2" role="alert">
              {logoutError}
            </p>
          )}
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="flex items-center gap-3">
            <button
              className="icon-button mobile-menu"
              aria-label="메뉴 열기·닫기"
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen((v) => !v)}
            >
              <Menu size={16} />
            </button>
            <div className="breadcrumb">
              <span>작업 공간</span>
              <ChevronRight size={11} className="breadcrumb-separator" />
              <strong>{active?.label || "작업 공간"}</strong>
            </div>
          </div>
          <div className="topbar-actions">
            {data?.demo && <span className="demo-label">데모 모드</span>}
            <button
              className="icon-button"
              aria-label={
                theme === "light"
                  ? "어두운 화면으로 변경"
                  : "밝은 화면으로 변경"
              }
              onClick={toggleTheme}
            >
              {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
            </button>
            <Button asChild size="sm" className="!text-[10px] !h-8 !px-3">
              <Link href="/studio?new=1">
                <Plus size={13} />
                <span className="topbar-new-label">새 프로젝트</span>
              </Link>
            </Button>
          </div>
        </header>
        <main className="workspace-content">{children}</main>
      </div>
    </div>
  );
}
