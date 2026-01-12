-- DropForeignKey
ALTER TABLE "StyleRef" DROP CONSTRAINT "StyleRef_projectId_fkey";

-- AlterTable
ALTER TABLE "CharacterOmniVariant" ADD COLUMN     "omniRefId" TEXT;

-- CreateIndex
CREATE INDEX "CharacterOmniVariant_omniRefId_idx" ON "CharacterOmniVariant"("omniRefId");

-- AddForeignKey
ALTER TABLE "CharacterOmniVariant" ADD CONSTRAINT "CharacterOmniVariant_omniRefId_fkey" FOREIGN KEY ("omniRefId") REFERENCES "CharacterOmniRef"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StyleRef" ADD CONSTRAINT "StyleRef_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
