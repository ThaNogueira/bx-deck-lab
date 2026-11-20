ALTER TABLE "BattlePassTraining" ADD COLUMN "startXp" INTEGER;
ALTER TABLE "BattlePassTraining" ADD COLUMN "lastXp" INTEGER;
ALTER TABLE "BattlePassMissionReward" ADD COLUMN "sessionId" TEXT REFERENCES "BattlePassTraining"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BattlePassMissionReward" ADD COLUMN "missionTitle" TEXT;
ALTER TABLE "BattlePassMissionReward" ADD COLUMN "missionDescription" TEXT;
CREATE INDEX "BattlePassMissionReward_sessionId_idx" ON "BattlePassMissionReward"("sessionId");
CREATE TABLE "BattlePassTrainingGain" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sessionId" TEXT NOT NULL,
  "xpBefore" INTEGER NOT NULL,
  "xpAfter" INTEGER NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BattlePassTrainingGain_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "BattlePassTraining"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "BattlePassTrainingGain_sessionId_createdAt_idx" ON "BattlePassTrainingGain"("sessionId", "createdAt");
