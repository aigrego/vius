-- AlterTable
ALTER TABLE "position" ADD COLUMN     "sell_price" DECIMAL(10,4),
ADD COLUMN     "sold_at" TIMESTAMP(0),
ADD COLUMN     "status" VARCHAR(10) NOT NULL DEFAULT 'holding';

-- CreateIndex
CREATE INDEX "position_user_id_status_idx" ON "position"("user_id", "status");
