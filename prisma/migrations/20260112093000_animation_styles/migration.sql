CREATE TABLE "AnimationStyle" (
  "id" TEXT NOT NULL,
  "ownerUserId" TEXT,
  "internalStyleRef" TEXT NOT NULL,
  "brandedName" TEXT NOT NULL,
  "defaultCategories" TEXT[],
  "description" TEXT NOT NULL,
  "mjStyleModifier" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AnimationStyle_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Project" ADD COLUMN "animationStyleId" TEXT;

CREATE INDEX "Project_animationStyleId_idx" ON "Project"("animationStyleId");
CREATE INDEX "AnimationStyle_ownerUserId_idx" ON "AnimationStyle"("ownerUserId");

ALTER TABLE "Project" ADD CONSTRAINT "Project_animationStyleId_fkey" FOREIGN KEY ("animationStyleId") REFERENCES "AnimationStyle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AnimationStyle" ADD CONSTRAINT "AnimationStyle_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
