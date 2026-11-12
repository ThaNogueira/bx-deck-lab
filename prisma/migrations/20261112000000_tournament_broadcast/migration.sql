ALTER TABLE "TMatch" ADD COLUMN "liveTableNo" INTEGER CHECK ("liveTableNo" BETWEEN 1 AND 4);
ALTER TABLE "TMatch" ADD COLUMN "liveStartedAt" DATETIME;

CREATE UNIQUE INDEX "TMatch_tournamentId_liveTableNo_key" ON "TMatch"("tournamentId", "liveTableNo");

CREATE TABLE "TournamentBroadcastEvent" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tournamentId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "matchId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TournamentBroadcastEvent_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "TournamentBroadcastEvent_tournamentId_id_idx" ON "TournamentBroadcastEvent"("tournamentId", "id");

-- Resultados via reportes, tela de mesa, decisões do gestor e drops
-- usam o mesmo TMatch. Todos liberam a mesa ao concluir a partida.
CREATE TRIGGER "broadcast_release_finished_match"
AFTER UPDATE OF "status" ON "TMatch"
WHEN NEW."status" = 'DONE' AND NEW."liveTableNo" IS NOT NULL
BEGIN
    UPDATE "TMatch" SET "liveTableNo" = NULL, "liveStartedAt" = NULL WHERE "id" = NEW."id";
END;

CREATE TRIGGER "broadcast_tournament_phase"
AFTER UPDATE OF "status", "currentRound" ON "Tournament"
WHEN OLD."status" <> NEW."status" OR OLD."currentRound" <> NEW."currentRound"
BEGIN
    UPDATE "TMatch" SET "liveTableNo" = NULL, "liveStartedAt" = NULL
    WHERE "tournamentId" = NEW."id" AND "liveTableNo" IS NOT NULL
      AND (NEW."status" <> 'RUNNING' OR "round" <> NEW."currentRound");

    INSERT INTO "TournamentBroadcastEvent" ("tournamentId", "kind", "round")
    SELECT NEW."id", 'ROUND', NEW."currentRound"
    WHERE NEW."status" = 'RUNNING' AND NEW."currentRound" > 0
      AND (OLD."status" <> 'RUNNING' OR NEW."currentRound" > OLD."currentRound");
END;

CREATE TRIGGER "broadcast_match_started"
AFTER UPDATE OF "liveTableNo" ON "TMatch"
WHEN OLD."liveTableNo" IS NULL AND NEW."liveTableNo" IS NOT NULL
BEGIN
    INSERT INTO "TournamentBroadcastEvent" ("tournamentId", "kind", "round", "matchId")
    VALUES (NEW."tournamentId", 'TABLE', NEW."round", NEW."id");
END;

CREATE TRIGGER "broadcast_bound_event_history"
AFTER INSERT ON "TournamentBroadcastEvent"
BEGIN
    DELETE FROM "TournamentBroadcastEvent"
    WHERE "tournamentId" = NEW."tournamentId" AND "id" <= (
        SELECT "id" FROM "TournamentBroadcastEvent" WHERE "tournamentId" = NEW."tournamentId"
        ORDER BY "id" DESC LIMIT 1 OFFSET 64
    );
END;
