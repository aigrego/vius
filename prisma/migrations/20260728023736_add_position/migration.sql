-- CreateTable
CREATE TABLE "position" (
    "id" SERIAL NOT NULL,
    "user_id" TEXT NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "market" VARCHAR(10) NOT NULL,
    "price" DECIMAL(10,4) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "created_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(0) NOT NULL,

    CONSTRAINT "position_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "position_user_id_code_idx" ON "position"("user_id", "code");

-- AddForeignKey
ALTER TABLE "position" ADD CONSTRAINT "position_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
