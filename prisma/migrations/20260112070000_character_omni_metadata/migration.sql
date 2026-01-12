ALTER TABLE "CharacterOmniVariant" ADD COLUMN "index" INTEGER;
ALTER TABLE "CharacterOmniVariant" ADD COLUMN "promptUsed" TEXT;
ALTER TABLE "CharacterOmniVariant" ADD COLUMN "modelUsed" TEXT;
ALTER TABLE "CharacterOmniVariant" ADD COLUMN "aspectRatio" TEXT;
ALTER TABLE "CharacterOmniRef" ADD COLUMN "selectedVariantId" TEXT;
