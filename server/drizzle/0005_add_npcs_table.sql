DO $$ BEGIN
  CREATE TYPE "public"."npc_status" AS ENUM('alive', 'dead', 'unknown', 'missing');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."npc_importance" AS ENUM('major', 'minor', 'background');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE "npcs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"race" varchar(100),
	"class_role" varchar(100),
	"level" varchar(50),
	"appearance" text,
	"personality" text,
	"motivations" text,
	"secrets" text,
	"backstory" text,
	"stat_block" jsonb,
	"importance" "npc_importance" DEFAULT 'minor' NOT NULL,
	"status" "npc_status" DEFAULT 'alive' NOT NULL,
	"tags" text[] DEFAULT '{}',
	"is_generated" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "npcs" ADD CONSTRAINT "npcs_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "npcs" ADD CONSTRAINT "npcs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "npcs_campaign_id_idx" ON "npcs" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "npcs_created_by_idx" ON "npcs" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "npcs_importance_idx" ON "npcs" USING btree ("importance");--> statement-breakpoint
CREATE INDEX "npcs_status_idx" ON "npcs" USING btree ("status");
