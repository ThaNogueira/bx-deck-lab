ALTER TABLE "Tournament" ADD COLUMN "coverUrl" TEXT;
ALTER TABLE "Tournament" ADD COLUMN "entryFeeCents" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "TournamentPhoto" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tournamentId" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TournamentPhoto_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "TournamentPhoto_tournamentId_createdAt_idx" ON "TournamentPhoto"("tournamentId", "createdAt");
