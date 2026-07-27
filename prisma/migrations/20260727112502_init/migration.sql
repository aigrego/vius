-- CreateEnum
CREATE TYPE "StockSource" AS ENUM ('SS', 'SZ');

-- CreateEnum
CREATE TYPE "StockType" AS ENUM ('ZS', 'AG');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT,
    "role" TEXT NOT NULL DEFAULT 'member',
    "lark_union_id" TEXT,
    "avatar_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stock" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "source" "StockSource" NOT NULL,
    "type" "StockType" NOT NULL,

    CONSTRAINT "Stock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "watchlist" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "market" VARCHAR(10) NOT NULL,
    "type" VARCHAR(20) NOT NULL DEFAULT 'individual',
    "cost" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "alerts_json" TEXT NOT NULL,
    "created_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(0) NOT NULL,

    CONSTRAINT "watchlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" SERIAL NOT NULL,
    "action" VARCHAR(50) NOT NULL,
    "code" VARCHAR(20),
    "details" TEXT,
    "agent_id" VARCHAR(100),
    "timestamp" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_history" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "alert_type" VARCHAR(50) NOT NULL,
    "severity" VARCHAR(20) NOT NULL,
    "message" TEXT NOT NULL,
    "current_value" DECIMAL(10,4),
    "threshold_value" DECIMAL(10,4),
    "created_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alert_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_basic" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(10) NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "market" VARCHAR(10) NOT NULL,
    "listed_date" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_basic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_daily" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(10) NOT NULL,
    "date" DATE NOT NULL,
    "open" DOUBLE PRECISION NOT NULL,
    "close" DOUBLE PRECISION NOT NULL,
    "high" DOUBLE PRECISION NOT NULL,
    "low" DOUBLE PRECISION NOT NULL,
    "volume" DOUBLE PRECISION NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "change_pct" DOUBLE PRECISION NOT NULL,
    "turnover" DOUBLE PRECISION,

    CONSTRAINT "stock_daily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_signal" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(10) NOT NULL,
    "date" DATE NOT NULL,
    "type" VARCHAR(30) NOT NULL,
    "detail" TEXT,

    CONSTRAINT "stock_signal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "news_flash" (
    "id" SERIAL NOT NULL,
    "source" VARCHAR(20) NOT NULL,
    "external_id" VARCHAR(50) NOT NULL,
    "title" VARCHAR(500),
    "content" TEXT NOT NULL,
    "codes" TEXT,
    "published_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "news_flash_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_lark_union_id_key" ON "users"("lark_union_id");

-- CreateIndex
CREATE UNIQUE INDEX "Stock_code_key" ON "Stock"("code");

-- CreateIndex
CREATE UNIQUE INDEX "watchlist_code_key" ON "watchlist"("code");

-- CreateIndex
CREATE INDEX "audit_log_timestamp_idx" ON "audit_log"("timestamp");

-- CreateIndex
CREATE INDEX "alert_history_code_alert_type_created_at_idx" ON "alert_history"("code", "alert_type", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "stock_basic_code_key" ON "stock_basic"("code");

-- CreateIndex
CREATE INDEX "stock_daily_date_idx" ON "stock_daily"("date");

-- CreateIndex
CREATE UNIQUE INDEX "stock_daily_code_date_key" ON "stock_daily"("code", "date");

-- CreateIndex
CREATE INDEX "stock_signal_date_type_idx" ON "stock_signal"("date", "type");

-- CreateIndex
CREATE UNIQUE INDEX "stock_signal_code_date_type_key" ON "stock_signal"("code", "date", "type");

-- CreateIndex
CREATE INDEX "news_flash_published_at_idx" ON "news_flash"("published_at");

-- CreateIndex
CREATE UNIQUE INDEX "news_flash_source_external_id_key" ON "news_flash"("source", "external_id");
