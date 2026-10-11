-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'OPERATOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "ContentFormat" AS ENUM ('CAROUSEL', 'REEL');

-- CreateEnum
CREATE TYPE "ProjectStage" AS ENUM ('IDEA', 'RESEARCH', 'DRAFT', 'DESIGN', 'REVIEW', 'APPROVED', 'SCHEDULED', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "DataSource" AS ENUM ('DEMO', 'META');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('RSS', 'MANUAL');

-- CreateEnum
CREATE TYPE "TopicStatus" AS ENUM ('INBOX', 'SAVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "Confidence" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "TemplateStatus" AS ENUM ('UNINSPECTED', 'READY', 'SETUP_REQUIRED');

-- CreateEnum
CREATE TYPE "DesignStatus" AS ENUM ('QUEUED', 'READY', 'FAILED', 'SETUP_REQUIRED');

-- CreateEnum
CREATE TYPE "AgentName" AS ENUM ('Scout', 'Researcher', 'Editor', 'Designer', 'Publisher', 'Analyst');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "ApprovalKind" AS ENUM ('EDITORIAL', 'PUBLICATION', 'EXPERIMENT');

-- CreateEnum
CREATE TYPE "PublicationStatus" AS ENUM ('SCHEDULED', 'RUNNING', 'PUBLISHED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FinanceType" AS ENUM ('REVENUE', 'EXPENSE');

-- CreateEnum
CREATE TYPE "FinanceSource" AS ENUM ('DEMO', 'MANUAL');

-- CreateEnum
CREATE TYPE "RecommendationStatus" AS ENUM ('PROPOSED', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'OPERATOR',
    "passwordHash" TEXT NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialAccount" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "accent" TEXT NOT NULL,
    "connected" BOOLEAN NOT NULL DEFAULT false,
    "platformAccountId" TEXT,
    "guidelines" TEXT NOT NULL,
    "guidelineVersion" INTEGER NOT NULL DEFAULT 1,
    "encryptedAccessToken" TEXT,
    "encryptedRefreshToken" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),

    CONSTRAINT "SocialAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountMetric" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "followers" INTEGER NOT NULL,
    "followerDelta" INTEGER,
    "views" INTEGER,
    "reach" INTEGER,
    "engagements" INTEGER,
    "postsPublished" INTEGER,
    "source" "DataSource" NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "format" "ContentFormat" NOT NULL,
    "category" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "permalink" TEXT,
    "source" "DataSource" NOT NULL,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostMetric" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "views" INTEGER,
    "reach" INTEGER,
    "likes" INTEGER,
    "comments" INTEGER,
    "saves" INTEGER,
    "shares" INTEGER,
    "source" "DataSource" NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PostMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Source" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "type" "SourceType" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "rights" TEXT NOT NULL,
    "lastFetchedAt" TIMESTAMP(3),
    "lastError" TEXT,

    CONSTRAINT "Source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Topic" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "retrievedAt" TIMESTAMP(3) NOT NULL,
    "relevance" INTEGER NOT NULL,
    "confidence" "Confidence" NOT NULL,
    "scoreExplanation" TEXT NOT NULL,
    "recommendedChannelId" TEXT NOT NULL,
    "format" "ContentFormat" NOT NULL,
    "status" "TopicStatus" NOT NULL DEFAULT 'INBOX',
    "uncertainClaims" TEXT[],
    "rights" TEXT NOT NULL,

    CONSTRAINT "Topic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EditorialProject" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "stage" "ProjectStage" NOT NULL DEFAULT 'IDEA',
    "format" "ContentFormat" NOT NULL,
    "draftCopy" TEXT NOT NULL DEFAULT '',
    "dueAt" TIMESTAMP(3),
    "productionMinutes" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EditorialProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectSourceReference" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "ProjectSourceReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectRevision" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "note" TEXT NOT NULL,

    CONSTRAINT "ProjectRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "channelId" TEXT,
    "projectId" TEXT,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "rights" TEXT NOT NULL,
    "credit" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EditorialRule" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EditorialRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CanvaTemplate" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "format" "ContentFormat" NOT NULL,
    "operatorId" TEXT,
    "designId" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "inspectedAt" TIMESTAMP(3),
    "fields" TEXT[],
    "status" "TemplateStatus" NOT NULL DEFAULT 'UNINSPECTED',
    "approved" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "CanvaTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeneratedDesign" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "status" "DesignStatus" NOT NULL,
    "editUrl" TEXT,
    "externalId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeneratedDesign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentTask" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "agent" "AgentName" NOT NULL,
    "kind" TEXT NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'QUEUED',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "result" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "idempotencyKey" TEXT,

    CONSTRAINT "AgentTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "TaskStatus" NOT NULL,
    "message" TEXT NOT NULL,

    CONSTRAINT "AgentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Approval" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "kind" "ApprovalKind" NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL,
    "revisionAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledPublication" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "status" "PublicationStatus" NOT NULL DEFAULT 'SCHEDULED',
    "platformPostId" TEXT,
    "error" TEXT,
    "mediaUrl" TEXT NOT NULL,
    "caption" TEXT NOT NULL,

    CONSTRAINT "ScheduledPublication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceEntry" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "type" "FinanceType" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KRW',
    "date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "source" "FinanceSource" NOT NULL,

    CONSTRAINT "FinanceEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "details" TEXT NOT NULL,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recommendation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "status" "RecommendationStatus" NOT NULL DEFAULT 'PROPOSED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "experimentResult" TEXT,

    CONSTRAINT "Recommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationCredential" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT 'the-move',
    "provider" TEXT NOT NULL,
    "encryptedToken" TEXT NOT NULL,
    "encryptedRefreshToken" TEXT,
    "expiresAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationCredential_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_workspaceId_idx" ON "User"("workspaceId");

-- CreateIndex
CREATE INDEX "SocialAccount_workspaceId_idx" ON "SocialAccount"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "SocialAccount_workspaceId_handle_key" ON "SocialAccount"("workspaceId", "handle");

-- CreateIndex
CREATE INDEX "AccountMetric_workspaceId_date_idx" ON "AccountMetric"("workspaceId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "AccountMetric_channelId_date_source_key" ON "AccountMetric"("channelId", "date", "source");

-- CreateIndex
CREATE INDEX "Post_workspaceId_publishedAt_idx" ON "Post"("workspaceId", "publishedAt");

-- CreateIndex
CREATE INDEX "PostMetric_workspaceId_date_idx" ON "PostMetric"("workspaceId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "PostMetric_postId_date_source_key" ON "PostMetric"("postId", "date", "source");

-- CreateIndex
CREATE INDEX "Source_workspaceId_idx" ON "Source"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Source_workspaceId_url_key" ON "Source"("workspaceId", "url");

-- CreateIndex
CREATE INDEX "Topic_workspaceId_status_retrievedAt_idx" ON "Topic"("workspaceId", "status", "retrievedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Topic_workspaceId_sourceUrl_key" ON "Topic"("workspaceId", "sourceUrl");

-- CreateIndex
CREATE INDEX "EditorialProject_workspaceId_stage_idx" ON "EditorialProject"("workspaceId", "stage");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectSourceReference_projectId_position_key" ON "ProjectSourceReference"("projectId", "position");

-- CreateIndex
CREATE INDEX "ProjectRevision_projectId_at_idx" ON "ProjectRevision"("projectId", "at");

-- CreateIndex
CREATE INDEX "Asset_workspaceId_projectId_idx" ON "Asset"("workspaceId", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "EditorialRule_channelId_version_key" ON "EditorialRule"("channelId", "version");

-- CreateIndex
CREATE INDEX "CanvaTemplate_workspaceId_idx" ON "CanvaTemplate"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "CanvaTemplate_workspaceId_designId_key" ON "CanvaTemplate"("workspaceId", "designId");

-- CreateIndex
CREATE INDEX "GeneratedDesign_workspaceId_projectId_idx" ON "GeneratedDesign"("workspaceId", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentTask_idempotencyKey_key" ON "AgentTask"("idempotencyKey");

-- CreateIndex
CREATE INDEX "AgentTask_workspaceId_status_createdAt_idx" ON "AgentTask"("workspaceId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "AgentEvent_workspaceId_at_idx" ON "AgentEvent"("workspaceId", "at");

-- CreateIndex
CREATE INDEX "Approval_workspaceId_projectId_kind_idx" ON "Approval"("workspaceId", "projectId", "kind");

-- CreateIndex
CREATE INDEX "ScheduledPublication_workspaceId_status_scheduledAt_idx" ON "ScheduledPublication"("workspaceId", "status", "scheduledAt");

-- CreateIndex
CREATE INDEX "FinanceEntry_workspaceId_date_idx" ON "FinanceEntry"("workspaceId", "date");

-- CreateIndex
CREATE INDEX "AuditLog_workspaceId_at_idx" ON "AuditLog"("workspaceId", "at");

-- CreateIndex
CREATE INDEX "Recommendation_workspaceId_status_idx" ON "Recommendation"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationCredential_workspaceId_provider_key" ON "IntegrationCredential"("workspaceId", "provider");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialAccount" ADD CONSTRAINT "SocialAccount_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountMetric" ADD CONSTRAINT "AccountMetric_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountMetric" ADD CONSTRAINT "AccountMetric_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostMetric" ADD CONSTRAINT "PostMetric_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostMetric" ADD CONSTRAINT "PostMetric_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Source" ADD CONSTRAINT "Source_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Topic" ADD CONSTRAINT "Topic_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Topic" ADD CONSTRAINT "Topic_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Topic" ADD CONSTRAINT "Topic_recommendedChannelId_fkey" FOREIGN KEY ("recommendedChannelId") REFERENCES "SocialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EditorialProject" ADD CONSTRAINT "EditorialProject_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EditorialProject" ADD CONSTRAINT "EditorialProject_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "SocialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EditorialProject" ADD CONSTRAINT "EditorialProject_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectSourceReference" ADD CONSTRAINT "ProjectSourceReference_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "EditorialProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectRevision" ADD CONSTRAINT "ProjectRevision_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "EditorialProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectRevision" ADD CONSTRAINT "ProjectRevision_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "SocialAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "EditorialProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EditorialRule" ADD CONSTRAINT "EditorialRule_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EditorialRule" ADD CONSTRAINT "EditorialRule_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanvaTemplate" ADD CONSTRAINT "CanvaTemplate_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanvaTemplate" ADD CONSTRAINT "CanvaTemplate_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "SocialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanvaTemplate" ADD CONSTRAINT "CanvaTemplate_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedDesign" ADD CONSTRAINT "GeneratedDesign_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedDesign" ADD CONSTRAINT "GeneratedDesign_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "EditorialProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedDesign" ADD CONSTRAINT "GeneratedDesign_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "CanvaTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentTask" ADD CONSTRAINT "AgentTask_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentEvent" ADD CONSTRAINT "AgentEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentEvent" ADD CONSTRAINT "AgentEvent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "AgentTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "EditorialProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledPublication" ADD CONSTRAINT "ScheduledPublication_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledPublication" ADD CONSTRAINT "ScheduledPublication_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "EditorialProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceEntry" ADD CONSTRAINT "FinanceEntry_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceEntry" ADD CONSTRAINT "FinanceEntry_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationCredential" ADD CONSTRAINT "IntegrationCredential_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

