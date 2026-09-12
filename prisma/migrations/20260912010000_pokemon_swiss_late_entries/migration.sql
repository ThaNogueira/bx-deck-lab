-- AlterTable
ALTER TABLE "TournamentPlayer" ADD COLUMN "lateLosses" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "TournamentLateEntryInvite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tournamentId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME,
    "usedAt" DATETIME,
    "usedByUserId" TEXT,
    CONSTRAINT "TournamentLateEntryInvite_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TournamentLateEntryInvite_usedByUserId_fkey" FOREIGN KEY ("usedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "TournamentLateEntryInvite_token_key" ON "TournamentLateEntryInvite"("token");
CREATE INDEX "TournamentLateEntryInvite_tournamentId_idx" ON "TournamentLateEntryInvite"("tournamentId");
