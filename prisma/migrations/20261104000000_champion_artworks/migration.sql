CREATE TABLE "ChampionArtwork" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "createdById" TEXT NOT NULL,
  "tournamentId" TEXT,
  "championUserId" TEXT,
  "name" TEXT NOT NULL,
  "eventName" TEXT NOT NULL,
  "eventDate" TEXT NOT NULL,
  "beysJson" TEXT NOT NULL,
  "imageUrl" TEXT NOT NULL,
  "postId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChampionArtwork_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ChampionArtwork_championUserId_fkey" FOREIGN KEY ("championUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ChampionArtwork_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ChampionArtwork_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ChampionArtwork_postId_key" ON "ChampionArtwork"("postId");
CREATE INDEX "ChampionArtwork_createdAt_idx" ON "ChampionArtwork"("createdAt");
