-- Keep imported single-image and video posts distinct from carousel/reel posts.
CREATE TYPE "PostFormat" AS ENUM ('CAROUSEL', 'REEL', 'IMAGE', 'VIDEO');
ALTER TABLE "Post" ALTER COLUMN "format" TYPE "PostFormat" USING "format"::text::"PostFormat";
