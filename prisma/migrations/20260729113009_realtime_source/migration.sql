-- CreateTable
CREATE TABLE "realtime_source" (
    "id" SERIAL NOT NULL,
    "key" VARCHAR(20) NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "description" VARCHAR(255),
    "created_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(0) NOT NULL,

    CONSTRAINT "realtime_source_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "realtime_source_key_key" ON "realtime_source"("key");
