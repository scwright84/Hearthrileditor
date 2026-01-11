-- CreateEnum
CREATE TYPE "OmniRefStatus" AS ENUM ('pending', 'generating', 'ready', 'error');

-- CreateTable
CREATE TABLE "CharacterOmniRef" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "stylePresetId" TEXT NOT NULL,
    "status" "OmniRefStatus" NOT NULL DEFAULT 'pending',
    "imageUrl" TEXT,
    "providerJobId" TEXT,
    "promptText" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CharacterOmniRef_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CharacterOmniRef_stylePresetId_idx" ON "CharacterOmniRef"("stylePresetId");

-- CreateIndex
CREATE UNIQUE INDEX "CharacterOmniRef_characterId_stylePresetId_key" ON "CharacterOmniRef"("characterId", "stylePresetId");

-- AddForeignKey
ALTER TABLE "CharacterOmniRef" ADD CONSTRAINT "CharacterOmniRef_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "CharacterReference"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterOmniRef" ADD CONSTRAINT "CharacterOmniRef_stylePresetId_fkey" FOREIGN KEY ("stylePresetId") REFERENCES "StylePreset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
