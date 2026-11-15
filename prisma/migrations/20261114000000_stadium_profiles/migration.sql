ALTER TABLE "User" ADD COLUMN "stadiumName" TEXT;
ALTER TABLE "User" ADD COLUMN "stadiumAvatarUrl" TEXT;

CREATE TABLE "StadiumDeck" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "beysJson" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,

    PRIMARY KEY ("userId", "id"),
    CONSTRAINT "StadiumDeck_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
