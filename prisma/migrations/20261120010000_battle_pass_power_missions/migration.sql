ALTER TABLE "BattlePassMissionPeriod" ADD COLUMN "powerCountsJson" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "BattlePassMissionPeriod" ADD COLUMN "missionKeysJson" TEXT NOT NULL DEFAULT '[]';
