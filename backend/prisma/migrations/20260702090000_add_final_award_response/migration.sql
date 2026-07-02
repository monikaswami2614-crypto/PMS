CREATE TABLE "FinalAwardResponse" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "checklistType" "ChecklistType" NOT NULL,
    "phase" "CertificationPhase" NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT,
    "fileData" BYTEA NOT NULL,
    "parsedRows" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinalAwardResponse_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FinalAwardResponse_projectId_checklistType_phase_key"
ON "FinalAwardResponse"("projectId", "checklistType", "phase");

CREATE INDEX "FinalAwardResponse_projectId_idx"
ON "FinalAwardResponse"("projectId");

ALTER TABLE "FinalAwardResponse"
ADD CONSTRAINT "FinalAwardResponse_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
