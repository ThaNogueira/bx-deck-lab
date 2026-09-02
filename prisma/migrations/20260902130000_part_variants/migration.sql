-- AlterTable
ALTER TABLE "Part" ADD COLUMN "parentId" TEXT;
ALTER TABLE "Part" ADD COLUMN "variantLabel" TEXT;
ALTER TABLE "Part" ADD COLUMN "variantOrder" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Part_parentId_idx" ON "Part"("parentId");
