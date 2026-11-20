ALTER TABLE "User" ADD COLUMN "battlePassPublic" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "BattlePassDevice" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "localId" TEXT,
  "lastUsedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "epoch" INTEGER NOT NULL DEFAULT 0,
  "lastCounter" INTEGER,
  CONSTRAINT "BattlePassDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "BattlePassDevice_userId_key_key" ON "BattlePassDevice"("userId", "key");
CREATE TABLE "BattlePassTraining" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "startedAt" DATETIME NOT NULL,
  "endedAt" DATETIME,
  "launchCount" INTEGER NOT NULL DEFAULT 0,
  "averageSp" REAL NOT NULL DEFAULT 0,
  "bestSp" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "BattlePassTraining_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "BattlePassTraining_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "BattlePassDevice" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "BattlePassTraining_userId_startedAt_idx" ON "BattlePassTraining"("userId","startedAt");
CREATE TABLE "BattlePassLaunch" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "sp" INTEGER NOT NULL,
  "counter" INTEGER NOT NULL,
  "epoch" INTEGER NOT NULL,
  "source" TEXT NOT NULL,
  "measuredAt" DATETIME,
  "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "comboJson" TEXT,
  CONSTRAINT "BattlePassLaunch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "BattlePassLaunch_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "BattlePassTraining" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "BattlePassLaunch_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "BattlePassDevice" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "BattlePassLaunch_userId_deviceId_epoch_counter_key" ON "BattlePassLaunch"("userId","deviceId","epoch","counter");
CREATE INDEX "BattlePassLaunch_userId_syncedAt_idx" ON "BattlePassLaunch"("userId","syncedAt");
CREATE INDEX "BattlePassLaunch_sessionId_idx" ON "BattlePassLaunch"("sessionId");
