export const stages = [
  "IDEA",
  "RESEARCH",
  "DRAFT",
  "DESIGN",
  "REVIEW",
  "APPROVED",
  "SCHEDULED",
  "PUBLISHED",
] as const;
export type Stage = (typeof stages)[number];
export type Role = "ADMIN" | "OPERATOR" | "VIEWER";
export type AgentName =
  | "Scout"
  | "Researcher"
  | "Editor"
  | "Designer"
  | "Publisher"
  | "Analyst";
export type TaskStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";
export interface Operator {
  id: string;
  name: string;
  email: string;
  role: Role;
}
export interface Channel {
  id: string;
  name: string;
  handle: string;
  accent: string;
  connected: boolean;
  platformAccountId?: string;
  guidelines: string;
  guidelineVersion: number;
  guidelineHistory?: {
    version: number;
    guidelines: string;
    changedAt: string | null;
  }[];
}
export interface AccountMetric {
  id: string;
  channelId: string;
  date: string;
  followers: number;
  followerDelta: number | null;
  views: number | null;
  reach: number | null;
  engagements: number | null;
  postsPublished: number | null;
  source: "DEMO" | "META";
  syncedAt: string;
}
export interface Topic {
  id: string;
  title: string;
  category: string;
  sourceId: string;
  sourceUrl: string;
  publishedAt: string | null;
  retrievedAt: string;
  relevance: number;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  scoreExplanation: string;
  recommendedChannelId: string;
  format: "CAROUSEL" | "REEL";
  status: "INBOX" | "SAVED" | "DISMISSED";
  uncertainClaims: string[];
  rights: string;
}
export interface Source {
  id: string;
  name: string;
  url: string;
  type: "RSS" | "MANUAL";
  enabled: boolean;
  rights: string;
  lastFetchedAt: string | null;
  lastError: string | null;
}
export interface Project {
  id: string;
  title: string;
  channelId: string;
  operatorId: string;
  stage: Stage;
  format: "CAROUSEL" | "REEL";
  draftCopy: string;
  sourceUrls: string[];
  dueAt: string | null;
  productionMinutes: number;
  revisions: { at: string; actorId: string; note: string }[];
  updatedAt: string;
}
export interface CanvaTemplate {
  id: string;
  name: string;
  channelId: string;
  format: "CAROUSEL" | "REEL";
  operatorId: string | null;
  designId: string;
  width: number;
  height: number;
  configuration?: {
    brandTemplateId?: string;
    pageCount?: number;
    fieldTypes?: Record<string, string>;
    previewUrl?: string;
    sourceTitle?: string;
  };
  inspectedAt: string | null;
  fields: string[];
  status: "UNINSPECTED" | "READY" | "SETUP_REQUIRED";
  approved: boolean;
}
export interface GeneratedDesign {
  id: string;
  projectId: string;
  templateId: string;
  status: "QUEUED" | "READY" | "FAILED" | "SETUP_REQUIRED" | "MANUAL_REVIEW";
  editUrl: string | null;
  exportJobId?: string;
  exportUrls?: string[];
  externalId: string | null;
  error: string | null;
  createdAt: string;
}
export interface AgentTask {
  id: string;
  agent: AgentName;
  kind: string;
  status: TaskStatus;
  progress: number;
  message: string;
  createdAt: string;
  updatedAt: string;
  result: string | null;
  isDemo: boolean;
}
export interface AgentEvent {
  id: string;
  taskId: string;
  at: string;
  status: TaskStatus;
  message: string;
}
export interface Approval {
  id: string;
  projectId: string;
  actorId: string;
  kind: "EDITORIAL" | "PUBLICATION" | "EXPERIMENT";
  approvedAt: string;
  revisionAt: string;
  payloadHash?: string;
}
export interface ScheduledPublication {
  id: string;
  projectId: string;
  scheduledAt: string;
  status: "SCHEDULED" | "RUNNING" | "PUBLISHED" | "FAILED" | "CANCELLED";
  platformPostId: string | null;
  error: string | null;
  mediaUrls?: string[];
  mediaUrl: string;
  caption: string;
}
export interface Post {
  id: string;
  channelId: string;
  title: string;
  format: "CAROUSEL" | "REEL" | "IMAGE" | "VIDEO";
  category: string;
  publishedAt: string;
  permalink: string | null;
  source: "DEMO" | "META";
}
export interface PostMetric {
  id: string;
  postId: string;
  date: string;
  views: number | null;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  saves: number | null;
  shares: number | null;
  source: "DEMO" | "META";
  syncedAt: string;
}
export interface FinanceEntry {
  id: string;
  channelId: string;
  type: "REVENUE" | "EXPENSE";
  amount: number;
  currency: string;
  date: string;
  description: string;
  source: "DEMO" | "MANUAL";
}
export interface AuditEntry {
  id: string;
  actorId: string;
  action: string;
  entityId: string;
  at: string;
  details: string;
}
export interface Recommendation {
  id: string;
  title: string;
  rationale: string;
  status: "PROPOSED" | "APPROVED" | "REJECTED";
  createdAt: string;
  experimentResult: string | null;
}
export interface Asset {
  id: string;
  projectId: string;
  kind: "IMAGE" | "VIDEO";
  url: string;
  credit: string;
  width: number | null;
  height: number | null;
  approved: boolean;
  createdAt: string;
}
export interface WorkspaceData {
  assets: Asset[];
  demo: boolean;
  workspaceName: string;
  operators: Operator[];
  channels: Channel[];
  accountMetrics: AccountMetric[];
  posts: Post[];
  postMetrics: PostMetric[];
  sources: Source[];
  topics: Topic[];
  projects: Project[];
  templates: CanvaTemplate[];
  designs: GeneratedDesign[];
  tasks: AgentTask[];
  events: AgentEvent[];
  approvals: Approval[];
  publications: ScheduledPublication[];
  finance: FinanceEntry[];
  audit: AuditEntry[];
  recommendations: Recommendation[];
}
export interface ApiResult<T> {
  data?: T;
  error?: string;
  code?: string;
}
