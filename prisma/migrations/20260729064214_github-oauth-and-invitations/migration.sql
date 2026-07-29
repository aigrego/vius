-- AlterTable
ALTER TABLE "users" ADD COLUMN     "github_id" TEXT;

-- CreateTable
CREATE TABLE "invitations" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "invited_by" TEXT,
    "user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accepted_at" TIMESTAMP(3),

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invitations_email_key" ON "invitations"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_github_id_key" ON "users"("github_id");
