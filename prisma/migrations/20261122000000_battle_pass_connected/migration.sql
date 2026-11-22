ALTER TABLE "BattlePassTraining" ADD COLUMN "captureClientId" TEXT;
ALTER TABLE "BattlePassTraining" ADD COLUMN "captureBladeId" TEXT;
ALTER TABLE "BattlePassTraining" ADD COLUMN "captureDeviceName" TEXT;
ALTER TABLE "BattlePassTraining" ADD COLUMN "liveSeenAt" DATETIME;
CREATE TABLE "WebPushSubscription" (
 "id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "authSessionId" TEXT NOT NULL,
 "installationId" TEXT NOT NULL, "endpoint" TEXT NOT NULL, "p256dh" TEXT NOT NULL, "auth" TEXT NOT NULL,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL,
 CONSTRAINT "WebPushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "WebPushSubscription_authSessionId_fkey" FOREIGN KEY ("authSessionId") REFERENCES "AuthSession"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "WebPushSubscription_endpoint_key" ON "WebPushSubscription"("endpoint");
CREATE UNIQUE INDEX "WebPushSubscription_userId_installationId_key" ON "WebPushSubscription"("userId","installationId");
CREATE TABLE "WebPushDelivery" (
 "id" TEXT NOT NULL PRIMARY KEY, "subscriptionId" TEXT NOT NULL, "eventKey" TEXT NOT NULL,
 "payloadJson" TEXT NOT NULL, "attempts" INTEGER NOT NULL DEFAULT 0,
 "availableAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "expiresAt" DATETIME NOT NULL,
 CONSTRAINT "WebPushDelivery_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "WebPushSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "WebPushDelivery_subscriptionId_eventKey_key" ON "WebPushDelivery"("subscriptionId","eventKey");
CREATE INDEX "WebPushDelivery_availableAt_idx" ON "WebPushDelivery"("availableAt");
