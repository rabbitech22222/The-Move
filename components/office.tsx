"use client";
import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  Activity,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { useWorkspace } from "@/components/workspace-provider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { AgentName } from "@/lib/domain";
const agents: {
  name: AgentName;
  role: string;
  u: number;
  v: number;
  color: string;
}[] = [
  { name: "Scout", role: "Source discovery", u: 2, v: 1.1, color: "#b59379" },
  {
    name: "Researcher",
    role: "Evidence & fact checking",
    u: 5.3,
    v: 1.1,
    color: "#7f9c92",
  },
  {
    name: "Editor",
    role: "Editorial preparation",
    u: 2,
    v: 3.9,
    color: "#a78891",
  },
  {
    name: "Designer",
    role: "Canva production",
    u: 5.3,
    v: 3.9,
    color: "#7d92ad",
  },
  {
    name: "Publisher",
    role: "Publishing coordination",
    u: 2,
    v: 6.7,
    color: "#bc7d73",
  },
  {
    name: "Analyst",
    role: "Performance analysis",
    u: 5.3,
    v: 6.7,
    color: "#a39a75",
  },
];
function iso(u: number, v: number, z = 0) {
  return [470 + (u - v) * 42, 90 + (u + v) * 23 - z] as const;
}
function points(coords: number[][]) {
  return coords.map((c) => iso(c[0], c[1], c[2] || 0).join(",")).join(" ");
}
function Desk({ u, v, color }: { u: number; v: number; color: string }) {
  const [x, y] = iso(u, v);
  return (
    <g>
      <polygon
        points={points([
          [u - 1, v - 0.55, 22],
          [u + 1, v - 0.55, 22],
          [u + 1, v + 0.55, 22],
          [u - 1, v + 0.55, 22],
        ])}
        fill="#e3dcd4"
        stroke="#bbb1a5"
        strokeWidth=".7"
      />
      <polygon
        points={points([
          [u + 1, v - 0.55, 22],
          [u + 1, v + 0.55, 22],
          [u + 1, v + 0.55, 17],
          [u + 1, v - 0.55, 17],
        ])}
        fill="#b5a89b"
      />
      <polygon
        points={points([
          [u - 1, v + 0.55, 22],
          [u + 1, v + 0.55, 22],
          [u + 1, v + 0.55, 17],
          [u - 1, v + 0.55, 17],
        ])}
        fill="#ccbeb0"
      />
      <path
        d={`M${x - 37} ${y - 11}v22 M${x + 36} ${y - 13}v22`}
        stroke="#8c8175"
        strokeWidth="3"
      />
      <polygon
        points={`${x - 16},${y - 54} ${x + 15},${y - 38} ${x + 15},${y - 18} ${x - 16},${y - 34}`}
        fill="#373e43"
        stroke="#1d242a"
      />
      <polygon
        points={`${x - 13},${y - 50} ${x + 12},${y - 37} ${x + 12},${y - 23} ${x - 13},${y - 36}`}
        fill={color}
      />
      <path
        d={`M${x - 9} ${y - 43}l15 8 M${x - 9} ${y - 39}l10 5`}
        stroke="white"
        opacity=".6"
        strokeWidth="1.5"
      />
      <path d={`M${x} ${y - 24}v10l8 4`} stroke="#414647" strokeWidth="3" />
      <polygon
        points={`${x - 6},${y - 7} ${x + 12},${y + 2} ${x + 4},${y + 6} ${x - 14},${y - 3}`}
        fill="#c3c0bb"
      />
      <ellipse cx={x - 28} cy={y - 21} rx="4" ry="2.5" fill="#d16d57" />
      <path d={`M${x - 32} ${y - 21}v6q4 4 8 0v-6`} fill="#b65c49" />
    </g>
  );
}
function Character({
  u,
  v,
  color,
  busy,
  reduced,
}: {
  u: number;
  v: number;
  color: string;
  busy: boolean;
  reduced: boolean;
}) {
  const [x, y] = iso(u + 0.2, v + 1);
  return (
    <motion.g
      animate={
        busy && !reduced ? { y: [0, -3, 0], x: [0, 2, 0] } : { y: 0, x: 0 }
      }
      transition={
        busy && !reduced
          ? { duration: 2.4, repeat: Infinity, ease: "easeInOut" }
          : { duration: 0 }
      }
    >
      <ellipse cx={x} cy={y + 10} rx="13" ry="6" fill="#555" opacity=".12" />
      <path
        d={`M${x - 5} ${y - 2}l-3 13 M${x + 5} ${y - 2}l4 13`}
        stroke="#42474b"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path d={`M${x - 11} ${y - 17}q11-9 22 0l-3 19h-16z`} fill={color} />
      <path
        d={`M${x - 10} ${y - 15}l-8-7 M${x + 10} ${y - 15}l7-7`}
        stroke={color}
        strokeWidth="5"
        strokeLinecap="round"
      />
      <ellipse cx={x} cy={y - 29} rx="9" ry="11" fill="#e0b894" />
      <path
        d={`M${x - 9} ${y - 31}q-2-16 11-12q10 0 8 14q-8-9-19-2`}
        fill="#3f3633"
      />
    </motion.g>
  );
}
export function Office() {
  const { data, refresh, mutate } = useWorkspace();
  const [selected, setSelected] = useState<AgentName>("Scout");
  const [pending, setPending] = useState(false);
  const osMotion = useReducedMotion();
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const read = () =>
      setReduced(localStorage.getItem("move-reduced-motion") === "true");
    read();
    window.addEventListener("move-preferences", read);
    return () => window.removeEventListener("move-preferences", read);
  }, []);
  useEffect(() => {
    const timer = setInterval(() => void refresh(), 5000);
    return () => clearInterval(timer);
  }, [refresh]);
  if (!data) return null;
  const tasks = data.tasks
    .filter((t) => t.agent === selected)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const active = data.tasks.filter((t) => t.status === "RUNNING").length;
  const queued = data.tasks.filter((t) => t.status === "QUEUED").length;
  async function run(kind: string) {
    setPending(true);
    try {
      await mutate("/api/jobs", { kind });
    } catch {
      /* provider displays error */
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">A CLEAR VIEW OF THE WORK</p>
          <h1 className="page-title">
            Virtual office<span className="text-[var(--muted-text)]">.</span>
          </h1>
          <p className="muted mt-2 text-sm">
            Six specialists. One editorial rhythm.
          </p>
        </div>
        <Button variant="outline" onClick={() => void refresh()}>
          <RefreshCw size={14} />
          Refresh activity
        </Button>
      </header>
      <div className="flex flex-wrap gap-6 text-xs mb-6">
        <span className="flex gap-2 items-center">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          {active} running
        </span>
        <span className="flex gap-2 items-center">
          <Clock3 size={12} />
          {queued} queued
        </span>
        <span className="muted">
          Activity is derived from recorded background jobs · updates every 5s
        </span>
      </div>
      <div className="grid xl:grid-cols-[1fr_320px] gap-5">
        <section className="panel overflow-hidden">
          <div className="panel-header">
            <div>
              <h2 className="font-medium text-sm">The floor</h2>
              <p className="muted text-xs mt-1">
                Select a workstation to inspect its tasks
              </p>
            </div>
            <Badge>LIVE JOB EVENTS</Badge>
          </div>
          <div className="relative bg-[var(--surface-raised)]">
            <svg
              viewBox="90 0 770 520"
              className="w-full min-h-[330px]"
              aria-label="Isometric office with six agent workstations"
            >
              <defs>
                <pattern
                  id="floorgrain"
                  width="8"
                  height="8"
                  patternUnits="userSpaceOnUse"
                >
                  <path d="M0 0h8" stroke="#ded8cf" strokeWidth=".3" />
                </pattern>
              </defs>
              <polygon
                points={points([
                  [0, 0],
                  [8, 0],
                  [8, 9],
                  [0, 9],
                ])}
                fill="#eae5dd"
                stroke="#d1c9bf"
              />
              <polygon
                points={points([
                  [0, 0],
                  [8, 0],
                  [8, 9],
                  [0, 9],
                ])}
                fill="url(#floorgrain)"
              />
              {Array.from({ length: 8 }, (_, i) => (
                <path
                  key={i}
                  d={`M${iso(i, 0).join(" ")}L${iso(i, 9).join(" ")}`}
                  stroke="#d3ccc2"
                  strokeWidth=".6"
                />
              ))}
              {Array.from({ length: 9 }, (_, i) => (
                <path
                  key={i}
                  d={`M${iso(0, i).join(" ")}L${iso(8, i).join(" ")}`}
                  stroke="#d3ccc2"
                  strokeWidth=".6"
                />
              ))}
              <polygon
                points={points([
                  [0, 0, 0],
                  [0, 9, 0],
                  [0, 9, 74],
                  [0, 0, 74],
                ])}
                fill="#d1cbc2"
              />
              <polygon
                points={points([
                  [0, 0, 0],
                  [8, 0, 0],
                  [8, 0, 74],
                  [0, 0, 74],
                ])}
                fill="#e1dcd4"
              />
              <polygon
                points={points([
                  [0.2, 2, 35],
                  [0.2, 4.5, 35],
                  [0.2, 4.5, 65],
                  [0.2, 2, 65],
                ])}
                fill="#eef3f0"
                stroke="#b4bdb7"
                strokeWidth="2"
              />
              <path
                d={`M${iso(0.2, 3.25, 35).join(" ")}L${iso(0.2, 3.25, 65).join(" ")}`}
                stroke="#b4bdb7"
                strokeWidth="2"
              />
              <text
                x="595"
                y="117"
                transform="rotate(28 595 117)"
                fontFamily="sans-serif"
                fontSize="12"
                fontWeight="700"
                fill="#877a6e"
                letterSpacing="2"
              >
                THE MOVE
              </text>
              <g>
                <ellipse cx="439" cy="139" rx="10" ry="5" fill="#a4927c" />
                <path d="M430 138l3 18q7 5 14 0l3-18" fill="#bbac98" />
                <path
                  d="M438 139v-22m0 7q-19-12-11-20q13 0 13 19m0 1q19-12 16-20q-15 0-16 19"
                  fill="#79917b"
                  stroke="#6b826c"
                  strokeWidth="2"
                />
              </g>
              {agents.map((a) => {
                const task = data.tasks.find(
                  (t) =>
                    t.agent === a.name &&
                    (t.status === "RUNNING" || t.status === "QUEUED"),
                );
                const failed =
                  data.tasks
                    .filter((t) => t.agent === a.name)
                    .sort((x, y) => y.updatedAt.localeCompare(x.updatedAt))[0]
                    ?.status === "FAILED";
                const [x, y] = iso(a.u + 0.4, a.v + 1.5);
                return (
                  <g
                    key={a.name}
                    role="button"
                    tabIndex={0}
                    aria-label={`Inspect ${a.name}, ${task ? task.status.toLowerCase() : failed ? "error" : "idle"}`}
                    onClick={() => setSelected(a.name)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelected(a.name);
                      }
                    }}
                    className="cursor-pointer outline-none group"
                  >
                    <polygon
                      points={points([
                        [a.u - 1.25, a.v - 0.8],
                        [a.u + 1.4, a.v - 0.8],
                        [a.u + 1.4, a.v + 1.5],
                        [a.u - 1.25, a.v + 1.5],
                      ])}
                      fill={selected === a.name ? "#dc776712" : "transparent"}
                      stroke={selected === a.name ? "#ba6a59" : "transparent"}
                      strokeWidth="1.2"
                      strokeDasharray="4 3"
                    />
                    <Desk u={a.u} v={a.v} color={a.color} />
                    <Character
                      u={a.u}
                      v={a.v}
                      color={a.color}
                      busy={task?.status === "RUNNING"}
                      reduced={reduced || !!osMotion}
                    />
                    <rect
                      x={x - 42}
                      y={y + 17}
                      width="84"
                      height="21"
                      rx="5"
                      fill={selected === a.name ? "#ae5145" : "#fff"}
                      stroke="#cfc6bb"
                      strokeWidth=".6"
                    />
                    <circle
                      cx={x - 30}
                      cy={y + 27}
                      r="2.5"
                      fill={failed ? "#d74f47" : task ? "#64a37a" : "#adada8"}
                    />
                    <text
                      x={x + 3}
                      y={y + 30.5}
                      textAnchor="middle"
                      fill={selected === a.name ? "#fff" : "#665d54"}
                      fontSize="9"
                      fontWeight="600"
                    >
                      {a.name}
                    </text>
                  </g>
                );
              })}
            </svg>
            <div className="px-5 pb-4 flex justify-between muted text-[10px]">
              <span>THE MOVE OS / EDITORIAL FLOOR</span>
              <span>
                {reduced || osMotion
                  ? "REDUCED MOTION"
                  : "EVENT-DRIVEN ACTIVITY"}
              </span>
            </div>
          </div>
          <div className="p-5 border-t border-[var(--border)] flex flex-wrap items-center gap-3">
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => void run("TOPIC_DEDUP")}
            >
              Run topic deduplication
              <ArrowUpRight size={12} />
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => void run("WEEKLY_REPORT")}
            >
              Create weekly report
              <ArrowUpRight size={12} />
            </Button>
            <span className="muted text-xs">
              Requires a connected Redis worker
            </span>
          </div>
        </section>
        <aside className="panel">
          <div className="panel-header">
            <div>
              <div className="flex items-center gap-2">
                <span className="h-7 w-7 rounded-lg flex items-center justify-center bg-[var(--muted)] text-xs font-bold">
                  {selected[0]}
                </span>
                <h2 className="font-semibold">{selected}</h2>
              </div>
              <p className="muted text-xs mt-2">
                {agents.find((a) => a.name === selected)?.role}
              </p>
            </div>
            <Activity size={16} className="muted" />
          </div>
          <div className="p-5">
            <p className="eyebrow mb-4">RECENT TASKS</p>
            {tasks.length === 0 ? (
              <div className="py-8 text-center">
                <Clock3 size={24} className="mx-auto muted mb-3" />
                <p className="font-medium text-sm">Idle and ready</p>
                <p className="muted text-xs leading-relaxed mt-2">
                  No recorded tasks for {selected}.<br />
                  Work appears here when a real job runs.
                </p>
              </div>
            ) : (
              tasks.slice(0, 6).map((task) => (
                <div
                  key={task.id}
                  className="border-b border-[var(--border)] py-4 first:pt-0 last:border-0"
                >
                  <div className="flex gap-2 items-start">
                    {task.status === "FAILED" ? (
                      <AlertTriangle
                        size={15}
                        className="text-red-500 mt-1 shrink-0"
                      />
                    ) : task.status === "SUCCEEDED" ? (
                      <CheckCircle2
                        size={15}
                        className="text-emerald-600 mt-1 shrink-0"
                      />
                    ) : (
                      <Clock3 size={15} className="muted mt-1 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {task.kind.toLowerCase().replaceAll("_", " ")}
                      </p>
                      <p className="muted text-xs mt-1 leading-relaxed break-words">
                        {task.message}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <Badge
                      className={task.status === "FAILED" ? "text-red-600" : ""}
                    >
                      {task.status}
                    </Badge>
                    {task.isDemo && <Badge>DEMO DATA</Badge>}
                  </div>
                  {task.status === "RUNNING" && (
                    <div className="h-1 bg-[var(--muted)] rounded mt-3">
                      <div
                        className="h-full rounded bg-red-500 transition-all"
                        style={{ width: `${task.progress}%` }}
                      />
                    </div>
                  )}
                  <p className="muted text-[10px] mt-2">
                    {new Date(task.updatedAt).toLocaleString()}
                  </p>
                  {task.result && (
                    <details className="mt-3">
                      <summary className="cursor-pointer text-[10px] font-medium">
                        Recorded result
                      </summary>
                      <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-[var(--muted)] p-2 text-[9px]">
                        {task.result}
                      </pre>
                    </details>
                  )}
                  {data.events
                    .filter((e) => e.taskId === task.id)
                    .slice(0, 2)
                    .map((e) => (
                      <p key={e.id} className="muted text-[10px] mt-1">
                        {e.status} · {e.message}
                      </p>
                    ))}
                </div>
              ))
            )}
          </div>
        </aside>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        {agents.map((a) => (
          <Button
            key={a.name}
            size="sm"
            variant={selected === a.name ? "secondary" : "ghost"}
            onClick={() => setSelected(a.name)}
          >
            {a.name}
          </Button>
        ))}
      </div>
    </>
  );
}
