-- AlterTable
ALTER TABLE "news_flash" ADD COLUMN     "keywords" VARCHAR(500);

-- CreateTable
CREATE TABLE "news_source" (
    "id" SERIAL NOT NULL,
    "key" VARCHAR(20) NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "url" VARCHAR(255),
    "params" VARCHAR(255),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_sync_at" TIMESTAMP(0),
    "last_sync_status" VARCHAR(10),
    "last_sync_count" INTEGER,
    "description" VARCHAR(255),
    "created_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(0) NOT NULL,

    CONSTRAINT "news_source_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "news_source_key_key" ON "news_source"("key");
