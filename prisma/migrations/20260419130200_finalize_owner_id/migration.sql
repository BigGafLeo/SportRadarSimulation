-- Finalize owner_id: set NOT NULL, add FK, drop legacy owner_token

ALTER TABLE "simulations" ALTER COLUMN "owner_id" SET NOT NULL;

ALTER TABLE "simulations"
  ADD CONSTRAINT "simulations_owner_id_fkey"
  FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Drop legacy ownership column and its index
DROP INDEX IF EXISTS "simulations_owner_token_idx";
ALTER TABLE "simulations" DROP COLUMN IF EXISTS "owner_token";
