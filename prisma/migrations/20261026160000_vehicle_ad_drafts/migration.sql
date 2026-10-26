CREATE TABLE "VehicleAdDraft" (
  "id" TEXT NOT NULL, "title" TEXT NOT NULL DEFAULT '', "vin" TEXT NOT NULL DEFAULT '',
  "notes" TEXT NOT NULL DEFAULT '', "reference" TEXT NOT NULL DEFAULT '', "price" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "photos" JSONB NOT NULL, "documents" JSONB NOT NULL, "facts" JSONB NOT NULL, "texts" JSONB NOT NULL, "warnings" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft', "revision" INTEGER NOT NULL DEFAULT 1, "partId" TEXT,
  "publishedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "VehicleAdDraft_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "VehicleAdDraft_partId_key" ON "VehicleAdDraft"("partId");
