-- CreateTable
CREATE TABLE "simulations" (
    "id" UUID NOT NULL,
    "name" VARCHAR(30) NOT NULL,
    "profile_id" VARCHAR(50) NOT NULL,
    "state" VARCHAR(20) NOT NULL,
    "total_goals" INTEGER NOT NULL,
    "started_at" TIMESTAMPTZ NOT NULL,
    "finished_at" TIMESTAMPTZ,
    "owner_token" UUID NOT NULL,
    "score_snapshot" JSONB NOT NULL,

    CONSTRAINT "simulations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "simulations_state_idx" ON "simulations"("state");

-- CreateIndex
CREATE INDEX "simulations_owner_token_idx" ON "simulations"("owner_token");
