-- 股票池按用户隔离：watchlist 加 user_id（回填 admin 后转 NOT NULL），
-- alert_history 加 user_id（可空，存量老数据无归属）。

-- AlertHistory
ALTER TABLE "public"."alert_history" ADD COLUMN "user_id" TEXT;
CREATE INDEX "alert_history_user_id_created_at_idx" ON "public"."alert_history"("user_id", "created_at");

-- Watchlist：先加可空列并回填（优先 admin，否则最早创建的用户），再转 NOT NULL
ALTER TABLE "public"."watchlist" ADD COLUMN "user_id" TEXT;
UPDATE "public"."watchlist"
SET "user_id" = COALESCE(
  (SELECT "id" FROM "public"."users" WHERE "username" = 'admin' LIMIT 1),
  (SELECT "id" FROM "public"."users" ORDER BY "created_at" LIMIT 1)
);
ALTER TABLE "public"."watchlist" ALTER COLUMN "user_id" SET NOT NULL;

-- 唯一约束：code 全局唯一 → (user_id, code)
DROP INDEX "public"."watchlist_code_key";
ALTER TABLE "public"."watchlist" ADD CONSTRAINT "watchlist_user_id_code_key" UNIQUE ("user_id", "code");

-- 外键：用户删除时级联清空其股票池
ALTER TABLE "public"."watchlist"
ADD CONSTRAINT "watchlist_user_id_fkey" FOREIGN KEY ("user_id")
REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
