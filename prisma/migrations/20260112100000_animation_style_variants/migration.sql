ALTER TABLE "AnimationStyle" ADD COLUMN "referenceImageUrl" TEXT;
ALTER TABLE "AnimationStyle" ADD COLUMN "promptInput" TEXT;
ALTER TABLE "AnimationStyle" ADD COLUMN "stylePrompt" TEXT;
ALTER TABLE "AnimationStyle" ADD COLUMN "imageUrl" TEXT;
ALTER TABLE "AnimationStyle" ADD COLUMN "selectedVariantId" TEXT;

CREATE TABLE "AnimationStyleVariant" (
  "id" TEXT NOT NULL,
  "animationStyleId" TEXT NOT NULL,
  "index" INTEGER,
  "status" "JobStatus" NOT NULL DEFAULT 'queued',
  "imageUrl" TEXT,
  "lumaGenerationId" TEXT,
  "failureReason" TEXT,
  "promptUsed" TEXT,
  "modelUsed" TEXT,
  "aspectRatio" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AnimationStyleVariant_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AnimationStyleVariant_animationStyleId_idx" ON "AnimationStyleVariant"("animationStyleId");

ALTER TABLE "AnimationStyleVariant" ADD CONSTRAINT "AnimationStyleVariant_animationStyleId_fkey" FOREIGN KEY ("animationStyleId") REFERENCES "AnimationStyle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
