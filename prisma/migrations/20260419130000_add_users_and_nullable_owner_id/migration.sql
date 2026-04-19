-- CreateTable: users
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: unique email
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- AlterTable: add nullable owner_id to simulations
ALTER TABLE "simulations" ADD COLUMN "owner_id" UUID;

-- CreateIndex: owner_id index
CREATE INDEX "simulations_owner_id_idx" ON "simulations"("owner_id");
