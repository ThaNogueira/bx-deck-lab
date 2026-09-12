-- Deck de torneio montado pelo gestor: não cria nem expõe um CommunityDeck do jogador.
ALTER TABLE "TournamentPlayer" ADD COLUMN "manualDeckJson" TEXT;
ALTER TABLE "TournamentPlayer" ADD COLUMN "manualDeckTitle" TEXT;
