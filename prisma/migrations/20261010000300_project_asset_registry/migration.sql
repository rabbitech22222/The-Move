-- Registered media belong to editorial projects; approval is an explicit human action.
CREATE TYPE "AssetKind" AS ENUM ('IMAGE', 'VIDEO');
ALTER TABLE "Asset" ADD COLUMN "kind" "AssetKind", ADD COLUMN "approved" BOOLEAN NOT NULL DEFAULT false;
-- Preserve genuine existing image/video classifications; unsupported/orphan
-- records require operator resolution instead of receiving an invented type.
UPDATE "Asset" SET "kind" = CASE
  WHEN "mimeType" LIKE 'image/%' THEN 'IMAGE'::"AssetKind"
  WHEN "mimeType" LIKE 'video/%' THEN 'VIDEO'::"AssetKind"
  ELSE NULL END;
ALTER TABLE "Asset" ALTER COLUMN "kind" SET NOT NULL;
ALTER TABLE "Asset" ALTER COLUMN "projectId" SET NOT NULL;
ALTER TABLE "Asset" DROP CONSTRAINT "Asset_projectId_fkey";
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "EditorialProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
