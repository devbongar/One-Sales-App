ALTER TABLE "Salesperson" ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS salesperson_user_id_unique ON "Salesperson"(user_id) WHERE user_id IS NOT NULL;
