-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CommunityDeck" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "launchGuide" TEXT,
    "youtubeUrl" TEXT,
    "beysJson" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'VISIBLE',
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "featuredOrder" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CommunityDeck_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_CommunityDeck" ("authorId", "beysJson", "createdAt", "description", "featuredOrder", "id", "launchGuide", "slug", "status", "title", "updatedAt", "youtubeUrl") SELECT "authorId", "beysJson", "createdAt", "description", "featuredOrder", "id", "launchGuide", "slug", "status", "title", "updatedAt", "youtubeUrl" FROM "CommunityDeck";
DROP TABLE "CommunityDeck";
ALTER TABLE "new_CommunityDeck" RENAME TO "CommunityDeck";
CREATE UNIQUE INDEX "CommunityDeck_slug_key" ON "CommunityDeck"("slug");
CREATE INDEX "CommunityDeck_authorId_idx" ON "CommunityDeck"("authorId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
