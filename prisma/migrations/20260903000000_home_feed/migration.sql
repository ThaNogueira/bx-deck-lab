-- AlterTable
ALTER TABLE "Notification" ADD COLUMN "url" TEXT;

-- CreateTable
CREATE TABLE "DeckCopy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deckId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeckCopy_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "CommunityDeck" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DeckCopy_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MetaSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "weekKey" TEXT NOT NULL,
    "computedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataJson" TEXT NOT NULL
);

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
    "folder" TEXT,
    "featuredOrder" INTEGER,
    "copyCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CommunityDeck_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_CommunityDeck" ("authorId", "beysJson", "createdAt", "description", "featuredOrder", "folder", "id", "isPublic", "launchGuide", "slug", "status", "title", "updatedAt", "youtubeUrl") SELECT "authorId", "beysJson", "createdAt", "description", "featuredOrder", "folder", "id", "isPublic", "launchGuide", "slug", "status", "title", "updatedAt", "youtubeUrl" FROM "CommunityDeck";
DROP TABLE "CommunityDeck";
ALTER TABLE "new_CommunityDeck" RENAME TO "CommunityDeck";
CREATE UNIQUE INDEX "CommunityDeck_slug_key" ON "CommunityDeck"("slug");
CREATE INDEX "CommunityDeck_authorId_idx" ON "CommunityDeck"("authorId");
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
    "parentId" TEXT,
    "variantLabel" TEXT,
    "variantOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Part_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Part" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Part" ("abbrev", "aliasesJson", "banned", "bcSlug", "behavior", "createdAt", "displayName", "hidden", "id", "imageUrl", "imagesJson", "kind", "name", "note", "parentId", "slug", "source", "statsJson", "subKind", "type", "updatedAt", "variantLabel", "variantOrder", "weightGrams") SELECT "abbrev", "aliasesJson", "banned", "bcSlug", "behavior", "createdAt", "displayName", "hidden", "id", "imageUrl", "imagesJson", "kind", "name", "note", "parentId", "slug", "source", "statsJson", "subKind", "type", "updatedAt", "variantLabel", "variantOrder", "weightGrams" FROM "Part";
DROP TABLE "Part";
ALTER TABLE "new_Part" RENAME TO "Part";
CREATE UNIQUE INDEX "Part_slug_key" ON "Part"("slug");
CREATE INDEX "Part_kind_idx" ON "Part"("kind");
CREATE INDEX "Part_parentId_idx" ON "Part"("parentId");
CREATE TABLE "new_Post" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "authorId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'USER',
    "deckId" TEXT,
    "systemKey" TEXT,
    "dataJson" TEXT,
    "tag" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "mediaJson" TEXT NOT NULL DEFAULT '[]',
    "pollJson" TEXT,
    "saleJson" TEXT,
    "status" TEXT NOT NULL DEFAULT 'VISIBLE',
    "flagJson" TEXT,
    "reactionCount" INTEGER NOT NULL DEFAULT 0,
    "commentCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Post_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Post_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "CommunityDeck" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Post" ("authorId", "body", "commentCount", "createdAt", "flagJson", "id", "mediaJson", "pollJson", "reactionCount", "saleJson", "status", "tag", "title", "updatedAt") SELECT "authorId", "body", "commentCount", "createdAt", "flagJson", "id", "mediaJson", "pollJson", "reactionCount", "saleJson", "status", "tag", "title", "updatedAt" FROM "Post";
DROP TABLE "Post";
ALTER TABLE "new_Post" RENAME TO "Post";
CREATE UNIQUE INDEX "Post_systemKey_key" ON "Post"("systemKey");
CREATE INDEX "Post_status_createdAt_idx" ON "Post"("status", "createdAt");
CREATE INDEX "Post_tag_status_idx" ON "Post"("tag", "status");
CREATE INDEX "Post_kind_status_createdAt_idx" ON "Post"("kind", "status", "createdAt");
CREATE INDEX "Post_authorId_idx" ON "Post"("authorId");
CREATE TABLE "new_TournamentPlayer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tournamentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dropped" BOOLEAN NOT NULL DEFAULT false,
    "deckId" TEXT,
    CONSTRAINT "TournamentPlayer_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "CommunityDeck" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TournamentPlayer_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TournamentPlayer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TournamentPlayer" ("dropped", "id", "joinedAt", "tournamentId", "userId") SELECT "dropped", "id", "joinedAt", "tournamentId", "userId" FROM "TournamentPlayer";
DROP TABLE "TournamentPlayer";
ALTER TABLE "new_TournamentPlayer" RENAME TO "TournamentPlayer";
CREATE UNIQUE INDEX "TournamentPlayer_tournamentId_userId_key" ON "TournamentPlayer"("tournamentId", "userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "DeckCopy_deckId_userId_key" ON "DeckCopy"("deckId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "MetaSnapshot_weekKey_key" ON "MetaSnapshot"("weekKey");
