-- AlterTable
ALTER TABLE "Product" ADD COLUMN "bcSlug" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Part" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "subKind" TEXT,
    "name" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "aliasesJson" TEXT NOT NULL DEFAULT '[]',
    "abbrev" TEXT,
    "type" TEXT,
    "statsJson" TEXT,
    "note" TEXT,
    "behavior" TEXT,
    "imageUrl" TEXT,
    "imagesJson" TEXT NOT NULL DEFAULT '[]',
    "weightGrams" REAL,
    "bcSlug" TEXT,
    "banned" BOOLEAN NOT NULL DEFAULT false,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Part" ("abbrev", "aliasesJson", "banned", "behavior", "createdAt", "displayName", "hidden", "id", "imageUrl", "kind", "name", "note", "slug", "source", "statsJson", "subKind", "type", "updatedAt") SELECT "abbrev", "aliasesJson", "banned", "behavior", "createdAt", "displayName", "hidden", "id", "imageUrl", "kind", "name", "note", "slug", "source", "statsJson", "subKind", "type", "updatedAt" FROM "Part";
DROP TABLE "Part";
ALTER TABLE "new_Part" RENAME TO "Part";
CREATE UNIQUE INDEX "Part_slug_key" ON "Part"("slug");
CREATE INDEX "Part_kind_idx" ON "Part"("kind");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
