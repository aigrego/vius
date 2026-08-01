-- 数据库重构：以 stock_dict 为主线的表结构改造
-- 1) 新建 stock_dict / stock_trade / news_stock / plate / plate_stock
-- 2) 从 stock_basic / Stock / stock_daily / news_flash / watchlist / position 搬迁数据
-- 3) 改 watchlist / position / stock_signal / news_flash 结构
-- 4) 删 Stock / stock_basic / stock_daily 及枚举

/* ---------- 1. 建新表 ---------- */

CREATE TABLE "stock_dict" (
    "code" VARCHAR(20) NOT NULL,
    "market" VARCHAR(10) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "former_names" TEXT,
    "type" VARCHAR(10) NOT NULL DEFAULT 'stock',
    "market_cap" DOUBLE PRECISION,
    "float_market_cap" DOUBLE PRECISION,
    "main_business" JSONB,
    "profit_composition" JSONB,
    "financials" JSONB,
    "listed_date" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "fundamentals_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(0) NOT NULL,

    CONSTRAINT "stock_dict_pkey" PRIMARY KEY ("code")
);

CREATE TABLE "stock_trade" (
    "id" SERIAL NOT NULL,
    "stock_code" VARCHAR(20) NOT NULL,
    "date" DATE NOT NULL,
    "open" DOUBLE PRECISION,
    "current" DOUBLE PRECISION,
    "prev_open" DOUBLE PRECISION,
    "prev_close" DOUBLE PRECISION,
    "high" DOUBLE PRECISION,
    "low" DOUBLE PRECISION,
    "change_pct" DOUBLE PRECISION,
    "amplitude" DOUBLE PRECISION,
    "volume" DOUBLE PRECISION,
    "amount" DOUBLE PRECISION,
    "turnover" DOUBLE PRECISION,
    "updated_at" TIMESTAMP(0) NOT NULL,

    CONSTRAINT "stock_trade_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "news_stock" (
    "id" SERIAL NOT NULL,
    "news_id" INTEGER NOT NULL,
    "stock_code" VARCHAR(20) NOT NULL,
    "keyword" VARCHAR(100),

    CONSTRAINT "news_stock_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "news_stock_news_id_stock_code_key" ON "news_stock"("news_id", "stock_code");
CREATE INDEX "news_stock_stock_code_idx" ON "news_stock"("stock_code");

CREATE TABLE "plate" (
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "kind" VARCHAR(10) NOT NULL,
    "source" VARCHAR(10) NOT NULL,
    "updated_at" TIMESTAMP(0) NOT NULL,

    CONSTRAINT "plate_pkey" PRIMARY KEY ("code")
);

CREATE TABLE "plate_stock" (
    "plate_code" VARCHAR(40) NOT NULL,
    "stock_code" VARCHAR(20) NOT NULL,

    CONSTRAINT "plate_stock_pkey" PRIMARY KEY ("plate_code","stock_code")
);

/* ---------- 2. stock_dict 数据搬迁 ---------- */

-- A 股清单（stock_basic）：code → 市场前缀 fullCode
INSERT INTO "stock_dict" ("code", "market", "name", "type", "listed_date", "is_active", "created_at", "updated_at")
SELECT REPLACE(UPPER(b."market"), 'SS', 'SH') || b."code",
       REPLACE(UPPER(b."market"), 'SS', 'SH'),
       b."name", 'stock', b."listed_date", b."is_active", NOW(), NOW()
FROM "stock_basic" b;

-- 指数清单（Stock 表 8 条，名称写死）
INSERT INTO "stock_dict" ("code", "market", "name", "type", "is_active", "created_at", "updated_at") VALUES
 ('SH000001', 'SH', '上证指数', 'index', true, NOW(), NOW()),
 ('SZ399001', 'SZ', '深证成指', 'index', true, NOW(), NOW()),
 ('SZ399006', 'SZ', '创业板指', 'index', true, NOW(), NOW()),
 ('SH000688', 'SH', '科创50',  'index', true, NOW(), NOW()),
 ('SZ399330', 'SZ', '深证100', 'index', true, NOW(), NOW()),
 ('SH000300', 'SH', '沪深300', 'index', true, NOW(), NOW()),
 ('SH000905', 'SH', '中证500', 'index', true, NOW(), NOW()),
 ('SH000852', 'SH', '中证1000','index', true, NOW(), NOW())
ON CONFLICT ("code") DO NOTHING;

-- watchlist/position 中出现但 dict 缺失的代码（港股/ETF 等）：用其 name/market 建占位行
INSERT INTO "stock_dict" ("code", "market", "name", "type", "created_at", "updated_at")
SELECT REPLACE(UPPER(x.m), 'SS', 'SH') || x.c, REPLACE(UPPER(x.m), 'SS', 'SH'), x.n, 'stock', NOW(), NOW()
FROM (
  SELECT DISTINCT w."market" AS m, w."code" AS c, w."name" AS n FROM "watchlist" w
  UNION
  SELECT DISTINCT p."market", p."code", p."name" FROM "position" p
) x
ON CONFLICT ("code") DO NOTHING;

/* ---------- 3. stock_trade 数据搬迁（stock_daily 全量，窗口函数回填昨开/昨收/振幅） ---------- */

INSERT INTO "stock_trade" ("stock_code", "date", "open", "current", "prev_open", "prev_close", "high", "low", "change_pct", "amplitude", "volume", "amount", "turnover", "updated_at")
SELECT REPLACE(UPPER(b."market"), 'SS', 'SH') || d."code",
       d."date",
       d."open",
       d."close",
       LAG(d."open")  OVER w,
       LAG(d."close") OVER w,
       d."high",
       d."low",
       d."change_pct",
       CASE WHEN LAG(d."close") OVER w > 0 THEN (d."high" - d."low") / LAG(d."close") OVER w * 100 END,
       d."volume",
       d."amount",
       d."turnover",
       NOW()
FROM "stock_daily" d
JOIN "stock_basic" b ON b."code" = d."code"
WINDOW w AS (PARTITION BY d."code" ORDER BY d."date");

/* ---------- 4. news_stock 数据搬迁（news_flash.codes 逗号拆分，按位置配 keywords） ---------- */

INSERT INTO "news_stock" ("news_id", "stock_code", "keyword")
SELECT n."id",
       REPLACE(UPPER(b."market"), 'SS', 'SH') || TRIM(c."val"),
       k."val"
FROM "news_flash" n
CROSS JOIN LATERAL unnest(string_to_array(n."codes", ',')) WITH ORDINALITY AS c("val", "i")
LEFT JOIN LATERAL unnest(string_to_array(n."keywords", ',')) WITH ORDINALITY AS k("val", "i2") ON k."i2" = c."i"
JOIN "stock_basic" b ON b."code" = TRIM(c."val")
ON CONFLICT ("news_id", "stock_code") DO NOTHING;

/* ---------- 5. 改既有表结构 ---------- */
/* （覆盖被删列的旧索引/唯一约束随列删除自动级联，无需显式 DROP） */

-- watchlist：code+market → stock_code
ALTER TABLE "watchlist" ADD COLUMN "stock_code" VARCHAR(20);
UPDATE "watchlist" w SET "stock_code" = REPLACE(UPPER(w."market"), 'SS', 'SH') || w."code";
ALTER TABLE "watchlist" ALTER COLUMN "stock_code" SET NOT NULL;
ALTER TABLE "watchlist" DROP COLUMN "code", DROP COLUMN "market", DROP COLUMN "name", DROP COLUMN "type";

-- position：code+market → stock_code
ALTER TABLE "position" ADD COLUMN "stock_code" VARCHAR(20);
UPDATE "position" p SET "stock_code" = REPLACE(UPPER(p."market"), 'SS', 'SH') || p."code";
ALTER TABLE "position" ALTER COLUMN "stock_code" SET NOT NULL;
ALTER TABLE "position" DROP COLUMN "code", DROP COLUMN "market", DROP COLUMN "name";

-- stock_signal：code → stock_code（经 stock_basic 取市场前缀）
ALTER TABLE "stock_signal" ADD COLUMN "stock_code" VARCHAR(20);
UPDATE "stock_signal" s SET "stock_code" = REPLACE(UPPER(b."market"), 'SS', 'SH') || s."code"
FROM "stock_basic" b WHERE b."code" = s."code";
DELETE FROM "stock_signal" WHERE "stock_code" IS NULL;
ALTER TABLE "stock_signal" ALTER COLUMN "stock_code" SET NOT NULL;
ALTER TABLE "stock_signal" DROP COLUMN "code";

-- news_flash：关联迁入 news_stock 后删 codes/keywords
ALTER TABLE "news_flash" DROP COLUMN "codes", DROP COLUMN "keywords";

/* ---------- 6. 删旧表与枚举 ---------- */

DROP TABLE "Stock";
DROP TABLE "stock_basic";
DROP TABLE "stock_daily";
DROP TYPE "StockSource";
DROP TYPE "StockType";

/* ---------- 7. 新索引与外键 ---------- */

CREATE INDEX "stock_trade_date_idx" ON "stock_trade"("date");
CREATE UNIQUE INDEX "stock_trade_stock_code_date_key" ON "stock_trade"("stock_code", "date");
CREATE INDEX "position_user_id_stock_code_idx" ON "position"("user_id", "stock_code");
CREATE UNIQUE INDEX "stock_signal_stock_code_date_type_key" ON "stock_signal"("stock_code", "date", "type");
CREATE UNIQUE INDEX "watchlist_user_id_stock_code_key" ON "watchlist"("user_id", "stock_code");

ALTER TABLE "stock_trade" ADD CONSTRAINT "stock_trade_stock_code_fkey" FOREIGN KEY ("stock_code") REFERENCES "stock_dict"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "watchlist" ADD CONSTRAINT "watchlist_stock_code_fkey" FOREIGN KEY ("stock_code") REFERENCES "stock_dict"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "position" ADD CONSTRAINT "position_stock_code_fkey" FOREIGN KEY ("stock_code") REFERENCES "stock_dict"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_signal" ADD CONSTRAINT "stock_signal_stock_code_fkey" FOREIGN KEY ("stock_code") REFERENCES "stock_dict"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "news_stock" ADD CONSTRAINT "news_stock_news_id_fkey" FOREIGN KEY ("news_id") REFERENCES "news_flash"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "news_stock" ADD CONSTRAINT "news_stock_stock_code_fkey" FOREIGN KEY ("stock_code") REFERENCES "stock_dict"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "plate_stock" ADD CONSTRAINT "plate_stock_plate_code_fkey" FOREIGN KEY ("plate_code") REFERENCES "plate"("code") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "plate_stock" ADD CONSTRAINT "plate_stock_stock_code_fkey" FOREIGN KEY ("stock_code") REFERENCES "stock_dict"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
