-- AlterTable
ALTER TABLE "watchlist" ADD COLUMN     "mark_price" DECIMAL(10,4);

-- CreateTable
CREATE TABLE "overview_cache" (
    "id" SERIAL NOT NULL,
    "user_id" TEXT NOT NULL,
    "kind" VARCHAR(20) NOT NULL,
    "payload" TEXT NOT NULL,
    "updated_at" TIMESTAMP(0) NOT NULL,

    CONSTRAINT "overview_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cron_job" (
    "id" TEXT NOT NULL,
    "cron" VARCHAR(50) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(0) NOT NULL,

    CONSTRAINT "cron_job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cron_run" (
    "id" SERIAL NOT NULL,
    "job_id" VARCHAR(50) NOT NULL,
    "trigger" VARCHAR(10) NOT NULL,
    "status" VARCHAR(10) NOT NULL,
    "message" TEXT,
    "started_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(0),

    CONSTRAINT "cron_run_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "overview_cache_user_id_kind_key" ON "overview_cache"("user_id", "kind");

-- CreateIndex
CREATE INDEX "cron_run_job_id_started_at_idx" ON "cron_run"("job_id", "started_at");
