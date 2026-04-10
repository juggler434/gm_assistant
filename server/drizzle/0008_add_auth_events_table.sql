CREATE TYPE "auth_event_type" AS ENUM (
  'register',
  'login_success',
  'login_failure',
  'logout',
  'password_reset_request',
  'password_reset_complete',
  'sessions_invalidated'
);

CREATE TABLE "auth_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "event_type" "auth_event_type" NOT NULL,
  "ip" varchar(45),
  "user_agent" varchar(512),
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX "auth_events_user_id_idx" ON "auth_events" USING btree ("user_id");
CREATE INDEX "auth_events_event_type_idx" ON "auth_events" USING btree ("event_type");
CREATE INDEX "auth_events_created_at_idx" ON "auth_events" USING btree ("created_at");
