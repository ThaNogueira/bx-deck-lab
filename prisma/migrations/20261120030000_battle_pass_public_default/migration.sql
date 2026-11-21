-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "passwordHash" TEXT,
    "avatarUrl" TEXT,
    "bannerUrl" TEXT,
    "stadiumName" TEXT,
    "stadiumAvatarUrl" TEXT,
    "battlePassPublic" BOOLEAN NOT NULL DEFAULT true,
    "bio" TEXT,
    "whatsapp" TEXT,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "statusReason" TEXT,
    "suspendedUntil" DATETIME,
    "canSell" BOOLEAN NOT NULL DEFAULT true,
    "favoritePartId" TEXT,
    "frameId" TEXT,
    "stickersJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" DATETIME,
    CONSTRAINT "User_favoritePartId_fkey" FOREIGN KEY ("favoritePartId") REFERENCES "Part" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_User" ("avatarUrl", "bannerUrl", "battlePassPublic", "bio", "canSell", "createdAt", "email", "favoritePartId", "frameId", "id", "lastLoginAt", "name", "passwordHash", "role", "slug", "stadiumAvatarUrl", "stadiumName", "status", "statusReason", "stickersJson", "suspendedUntil", "verified", "whatsapp") SELECT "avatarUrl", "bannerUrl", "battlePassPublic", "bio", "canSell", "createdAt", "email", "favoritePartId", "frameId", "id", "lastLoginAt", "name", "passwordHash", "role", "slug", "stadiumAvatarUrl", "stadiumName", "status", "statusReason", "stickersJson", "suspendedUntil", "verified", "whatsapp" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_slug_key" ON "User"("slug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;


-- Enable sharing once for existing accounts; later opt-outs remain available.
UPDATE "User" SET "battlePassPublic" = true WHERE "battlePassPublic" = false;
