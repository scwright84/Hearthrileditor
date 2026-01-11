-- Style packs and global style library

ALTER TABLE "Project"
ADD COLUMN "stylePackId" TEXT;

CREATE TABLE "StylePack" (
  "id" TEXT NOT NULL,
  "projectId" TEXT,
  "ownerUserId" TEXT,
  "name" TEXT NOT NULL,
  "isGlobal" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "StylePack_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "StyleRef"
ALTER COLUMN "projectId" DROP NOT NULL,
ADD COLUMN "stylePackId" TEXT;

CREATE INDEX "StylePack_projectId_idx" ON "StylePack"("projectId");
CREATE INDEX "StylePack_ownerUserId_idx" ON "StylePack"("ownerUserId");
CREATE INDEX "StylePack_isGlobal_idx" ON "StylePack"("isGlobal");
CREATE INDEX "StyleRef_stylePackId_idx" ON "StyleRef"("stylePackId");

ALTER TABLE "Project"
ADD CONSTRAINT "Project_stylePackId_fkey" FOREIGN KEY ("stylePackId") REFERENCES "StylePack"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StylePack"
ADD CONSTRAINT "StylePack_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StylePack"
ADD CONSTRAINT "StylePack_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StyleRef"
ADD CONSTRAINT "StyleRef_stylePackId_fkey" FOREIGN KEY ("stylePackId") REFERENCES "StylePack"("id") ON DELETE SET NULL ON UPDATE CASCADE;
