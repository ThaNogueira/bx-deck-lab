CREATE TABLE "BattlePassProgress" (
  "userId" TEXT NOT NULL PRIMARY KEY,
  "totalXp" INTEGER NOT NULL DEFAULT 0,
  "insignias" INTEGER NOT NULL DEFAULT 0,
  "missionsCompleted" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "BattlePassProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "BattlePassMissionPeriod" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "cadence" TEXT NOT NULL,
  "period" TEXT NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  "sets" INTEGER NOT NULL DEFAULT 0,
  "daysJson" TEXT NOT NULL DEFAULT '[]',
  "samplesJson" TEXT NOT NULL DEFAULT '[]',
  CONSTRAINT "BattlePassMissionPeriod_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "BattlePassMissionPeriod_userId_cadence_period_key" ON "BattlePassMissionPeriod"("userId","cadence","period");
CREATE TABLE "BattlePassMissionReward" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "cadence" TEXT NOT NULL,
  "period" TEXT NOT NULL,
  "missionKey" TEXT NOT NULL,
  "xp" INTEGER NOT NULL,
  "insignias" INTEGER NOT NULL,
  "awardedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "announcedAt" DATETIME,
  CONSTRAINT "BattlePassMissionReward_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "BattlePassMissionReward_userId_cadence_period_missionKey_key" ON "BattlePassMissionReward"("userId","cadence","period","missionKey");
CREATE INDEX "BattlePassMissionReward_userId_announcedAt_idx" ON "BattlePassMissionReward"("userId","announcedAt");
