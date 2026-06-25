CREATE TABLE "EmailLog" (
    "id" TEXT NOT NULL,
    "updateHash" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "employeeName" TEXT NOT NULL,
    "projectName" TEXT NOT NULL,
    "projectType" TEXT NOT NULL,
    "deadline" TEXT NOT NULL,
    "statusMessage" TEXT NOT NULL,
    "deliveryStatus" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailLog_updateHash_key" ON "EmailLog"("updateHash");
CREATE INDEX "EmailLog_recipientEmail_idx" ON "EmailLog"("recipientEmail");
CREATE INDEX "EmailLog_projectName_idx" ON "EmailLog"("projectName");
CREATE INDEX "EmailLog_deliveryStatus_idx" ON "EmailLog"("deliveryStatus");
CREATE INDEX "EmailLog_createdAt_idx" ON "EmailLog"("createdAt");
