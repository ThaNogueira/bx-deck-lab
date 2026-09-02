-- AlterTable
ALTER TABLE "TMatch" ADD COLUMN "p1Score" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "TMatch" ADD COLUMN "p2Score" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "TMatch" ADD COLUMN "tableToken" TEXT;

-- CreateTable
CREATE TABLE "MatchRound" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "matchId" TEXT NOT NULL,
    "no" INTEGER NOT NULL,
    "winnerId" TEXT,
    "claimedBy" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "resolvedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" DATETIME,
    CONSTRAINT "MatchRound_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "TMatch" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "MatchRound_matchId_idx" ON "MatchRound"("matchId");
