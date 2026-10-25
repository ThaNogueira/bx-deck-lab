ALTER TABLE "TournamentPlayer" ADD COLUMN "paymentConfirmed" BOOLEAN NOT NULL DEFAULT true;
-- Existing finished/running tournaments retain their participants. Open paid events
-- enter the new check-in flow and require the organizer's confirmation.
UPDATE "TournamentPlayer" SET "paymentConfirmed" = false WHERE "tournamentId" IN (
  SELECT "id" FROM "Tournament" WHERE "status" = 'OPEN' AND "entryFeeCents" > 0
);
