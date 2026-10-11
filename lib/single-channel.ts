import type { WorkspaceData } from "./domain";
/** The requested workspace now serves only THE MOVE, including older stored workspaces. */
export function restrictToTheMove(data: WorkspaceData): WorkspaceData {
  data.channels = data.channels.filter((c) => c.id === "the-move");
  data.templates = data.templates.filter((t) => t.channelId === "the-move");
  data.accountMetrics = data.accountMetrics.filter(
    (m) => m.channelId === "the-move" && (data.demo || m.source !== "DEMO"),
  );
  data.posts = data.posts.filter(
    (p) => p.channelId === "the-move" && (data.demo || p.source !== "DEMO"),
  );
  const posts = new Set(data.posts.map((p) => p.id));
  data.postMetrics = data.postMetrics.filter(
    (m) => posts.has(m.postId) && (data.demo || m.source !== "DEMO"),
  );
  data.topics = data.topics.filter(
    (t) => t.recommendedChannelId === "the-move",
  );
  data.projects = data.projects.filter((p) => p.channelId === "the-move");
  const projects = new Set(data.projects.map((p) => p.id));
  data.assets = data.assets.filter((a) => projects.has(a.projectId));
  data.designs = data.designs.filter((d) => projects.has(d.projectId));
  data.approvals = data.approvals.filter((a) => projects.has(a.projectId));
  data.publications = data.publications.filter((p) =>
    projects.has(p.projectId),
  );
  data.finance = data.finance.filter(
    (f) => f.channelId === "the-move" && (data.demo || f.source !== "DEMO"),
  );
  return data;
}
