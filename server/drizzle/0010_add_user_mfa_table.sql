ALTER TYPE "auth_event_type" ADD VALUE IF NOT EXISTS 'mfa_setup_started';
ALTER TYPE "auth_event_type" ADD VALUE IF NOT EXISTS 'mfa_enabled';
ALTER TYPE "auth_event_type" ADD VALUE IF NOT EXISTS 'mfa_disabled';
ALTER TYPE "auth_event_type" ADD VALUE IF NOT EXISTS 'mfa_challenge_issued';
ALTER TYPE "auth_event_type" ADD VALUE IF NOT EXISTS 'mfa_challenge_success';
ALTER TYPE "auth_event_type" ADD VALUE IF NOT EXISTS 'mfa_challenge_failure';
ALTER TYPE "auth_event_type" ADD VALUE IF NOT EXISTS 'mfa_recovery_used';

CREATE TABLE "user_mfa" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "secret_encrypted" varchar(512) NOT NULL,
  "enabled_at" timestamp with time zone,
  "recovery_codes_hash" varchar(64)[] NOT NULL DEFAULT '{}',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX "user_mfa_user_id_idx" ON "user_mfa" USING btree ("user_id");
