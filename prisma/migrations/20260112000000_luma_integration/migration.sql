-- Luma Dream Machine integration

ALTER TABLE "ImageGenerationRun"
ADD COLUMN "reason" TEXT,
ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "ImageCandidate"
ALTER COLUMN "url" DROP NOT NULL,
ADD COLUMN "lumaGenerationId" TEXT,
ADD COLUMN "status" "JobStatus" NOT NULL DEFAULT 'queued',
ADD COLUMN "failureReason" TEXT;

ALTER TABLE "AnimationClip"
ALTER COLUMN "url" DROP NOT NULL,
ALTER COLUMN "durationSec" DROP NOT NULL,
ADD COLUMN "lumaGenerationId" TEXT,
ADD COLUMN "status" "JobStatus" NOT NULL DEFAULT 'queued',
ADD COLUMN "failureReason" TEXT,
ADD COLUMN "resolution" TEXT;

ALTER TABLE "CharacterReference"
ADD COLUMN "lumaIdentityKey" TEXT;

CREATE TABLE "StyleRef" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "name" TEXT,
  "imageUrl" TEXT NOT NULL,
  "weight" DOUBLE PRECISION NOT NULL DEFAULT 0.8,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "StyleRef_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CharacterOmniVariant" (
  "id" TEXT NOT NULL,
  "characterId" TEXT NOT NULL,
  "stylePresetId" TEXT NOT NULL,
  "status" "JobStatus" NOT NULL DEFAULT 'queued',
  "imageUrl" TEXT,
  "lumaGenerationId" TEXT,
  "failureReason" TEXT,
  "isSelected" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CharacterOmniVariant_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StyleRef_projectId_idx" ON "StyleRef"("projectId");
CREATE INDEX "CharacterOmniVariant_characterId_idx" ON "CharacterOmniVariant"("characterId");
CREATE INDEX "CharacterOmniVariant_stylePresetId_idx" ON "CharacterOmniVariant"("stylePresetId");

ALTER TABLE "StyleRef"
ADD CONSTRAINT "StyleRef_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CharacterOmniVariant"
ADD CONSTRAINT "CharacterOmniVariant_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "CharacterReference"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CharacterOmniVariant"
ADD CONSTRAINT "CharacterOmniVariant_stylePresetId_fkey" FOREIGN KEY ("stylePresetId") REFERENCES "StylePreset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
