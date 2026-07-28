-- CreateTable
CREATE TABLE "plate_cache" (
    "kind" VARCHAR(20) NOT NULL,
    "payload" TEXT NOT NULL,
    "updated_at" TIMESTAMP(0) NOT NULL,

    CONSTRAINT "plate_cache_pkey" PRIMARY KEY ("kind")
);
