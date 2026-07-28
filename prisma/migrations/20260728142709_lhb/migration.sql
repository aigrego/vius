-- CreateTable
CREATE TABLE "lhb_stock" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(10) NOT NULL,
    "name" VARCHAR(20) NOT NULL,
    "market" VARCHAR(4) NOT NULL,
    "date" DATE NOT NULL,
    "close_price" DOUBLE PRECISION NOT NULL,
    "change_pct" DOUBLE PRECISION NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "reason" VARCHAR(200) NOT NULL,
    "change_type" VARCHAR(30) NOT NULL,
    "trade_id" VARCHAR(20) NOT NULL,
    "buy_amt" DOUBLE PRECISION NOT NULL,
    "sell_amt" DOUBLE PRECISION NOT NULL,
    "net_amt" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "lhb_stock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lhb_seat" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(10) NOT NULL,
    "date" DATE NOT NULL,
    "trade_id" VARCHAR(20) NOT NULL,
    "direction" VARCHAR(4) NOT NULL,
    "rank" INTEGER NOT NULL,
    "dept_name" VARCHAR(100) NOT NULL,
    "buy" DOUBLE PRECISION NOT NULL,
    "sell" DOUBLE PRECISION NOT NULL,
    "net" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "lhb_seat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lhb_source" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "type" VARCHAR(10) NOT NULL DEFAULT 'api',
    "url" VARCHAR(255),
    "api_key" VARCHAR(255),
    "cron" VARCHAR(50),
    "description" VARCHAR(255),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_sync_at" TIMESTAMP(0),
    "last_sync_status" VARCHAR(10),
    "last_sync_count" INTEGER,
    "created_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(0) NOT NULL,

    CONSTRAINT "lhb_source_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lhb_stock_date_market_idx" ON "lhb_stock"("date", "market");

-- CreateIndex
CREATE INDEX "lhb_seat_code_date_idx" ON "lhb_seat"("code", "date");

-- CreateIndex
CREATE INDEX "lhb_seat_date_idx" ON "lhb_seat"("date");
