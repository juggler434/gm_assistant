ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;

CREATE TABLE "auth_identities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "provider" varchar(32) NOT NULL,
  "provider_account_id" varchar(255) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX "auth_identities_provider_account_idx" ON "auth_identities" USING btree ("provider", "provider_account_id");
CREATE INDEX "auth_identities_user_id_idx" ON "auth_identities" USING btree ("user_id");
