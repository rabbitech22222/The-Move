-- Bind explicit publication approval to the exact media URL and caption.
ALTER TABLE "Approval" ADD COLUMN "payloadHash" TEXT;
