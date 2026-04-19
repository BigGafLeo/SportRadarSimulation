-- Insert demo user for local testing
INSERT INTO "users" ("id", "email", "password_hash", "created_at")
VALUES (
    'a0000000-0000-0000-0000-000000000001',
    'demo@sportradar.local',
    '$argon2id$v=19$m=65536,t=3,p=4$h0X8fc/apFnHvebUYwNxhQ$Yc5r9kgWWInf60QA1nZGJ9DDu6TeVX1PqqyklEom7Ao',
    CURRENT_TIMESTAMP
) ON CONFLICT ("email") DO NOTHING;

-- Backfill: point all existing simulations to demo user
UPDATE "simulations"
SET "owner_id" = 'a0000000-0000-0000-0000-000000000001'
WHERE "owner_id" IS NULL;
