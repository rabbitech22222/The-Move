ALTER TABLE "CanvaTemplate" ADD COLUMN "configuration" JSONB;
ALTER TABLE "GeneratedDesign" ADD COLUMN "exportJobId" TEXT, ADD COLUMN "exportUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "ScheduledPublication" ADD COLUMN "mediaUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
