CREATE TABLE "Store" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "tamerLeagueSync" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "Store_name_key" ON "Store"("name");
ALTER TABLE "Tournament" ADD COLUMN "storeId" TEXT REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Tournament_storeId_idx" ON "Tournament"("storeId");
INSERT INTO "Store" ("id", "name", "address", "active", "tamerLeagueSync", "updatedAt")
VALUES ('tamer-shop', 'Tamer Shop', 'Rua Ipanema, 478, Mooca, São Paulo - SP, 03164-200', true, true, CURRENT_TIMESTAMP);
