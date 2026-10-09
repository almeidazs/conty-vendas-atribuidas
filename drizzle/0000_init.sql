CREATE TYPE "public"."ledger_kind" AS ENUM('sale', 'refund');--> statement-breakpoint
CREATE TYPE "public"."attribution_reason" AS ENUM('coupon', 'utm', 'none');--> statement-breakpoint
CREATE TYPE "public"."refund_status" AS ENUM('pending', 'applied', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."webhook_topic" AS ENUM('orders', 'refunds');--> statement-breakpoint
CREATE TABLE "creator_coupons" (
	"code" text PRIMARY KEY NOT NULL,
	"creator_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creators" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"utm_code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "creators_utmCode_unique" UNIQUE("utm_code")
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" text NOT NULL,
	"creator_id" uuid,
	"kind" "ledger_kind" NOT NULL,
	"amount_cents" bigint NOT NULL,
	"refund_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_entries_refundId_unique" UNIQUE("refund_id"),
	CONSTRAINT "ledger_entry_shape" CHECK (("ledger_entries"."kind" = 'sale' and "ledger_entries"."amount_cents" >= 0 and "ledger_entries"."refund_id" is null)
				or ("ledger_entries"."kind" = 'refund' and "ledger_entries"."amount_cents" <= 0 and "ledger_entries"."refund_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" text PRIMARY KEY NOT NULL,
	"financial_status" text NOT NULL,
	"total_cents" bigint NOT NULL,
	"currency" varchar(3) NOT NULL,
	"coupon_codes" jsonb NOT NULL,
	"utm" jsonb,
	"creator_id" uuid,
	"attribution_reason" "attribution_reason" NOT NULL,
	"attributed_coupon" text,
	"conflict_creator_id" uuid,
	"payload_hash" text NOT NULL,
	"paid_at" timestamp with time zone NOT NULL,
	CONSTRAINT "orders_total_not_negative" CHECK ("orders"."total_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" bigint GENERATED ALWAYS AS IDENTITY (sequence name "refunds_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"order_id" text NOT NULL,
	"requested_cents" bigint NOT NULL,
	"applied_cents" bigint,
	"currency" varchar(3) NOT NULL,
	"status" "refund_status" NOT NULL,
	"rejection_reason" text,
	"refunded_at" timestamp with time zone,
	"received_at" timestamp with time zone NOT NULL,
	"applied_at" timestamp with time zone,
	"payload_hash" text NOT NULL,
	CONSTRAINT "refunds_requested_positive" CHECK ("refunds"."requested_cents" > 0),
	CONSTRAINT "refunds_applied_within_requested" CHECK ("refunds"."applied_cents" is null or ("refunds"."applied_cents" >= 0 and "refunds"."applied_cents" <= "refunds"."requested_cents")),
	CONSTRAINT "refunds_applied_consistent" CHECK (("refunds"."status" = 'applied') = ("refunds"."applied_cents" is not null and "refunds"."applied_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" bigint GENERATED ALWAYS AS IDENTITY (sequence name "webhook_events_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"topic" "webhook_topic" NOT NULL,
	"external_id" text NOT NULL,
	"order_id" text NOT NULL,
	"payload_hash" text NOT NULL,
	"payload" text NOT NULL,
	"outcome" text NOT NULL,
	"received_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "creator_coupons" ADD CONSTRAINT "creator_coupons_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_refund_id_refunds_id_fk" FOREIGN KEY ("refund_id") REFERENCES "public"."refunds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_conflict_creator_id_creators_id_fk" FOREIGN KEY ("conflict_creator_id") REFERENCES "public"."creators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_one_sale_per_order" ON "ledger_entries" USING btree ("order_id") WHERE "ledger_entries"."kind" = 'sale';--> statement-breakpoint
CREATE INDEX "ledger_creator" ON "ledger_entries" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "orders_creator_paid_at" ON "orders" USING btree ("creator_id","paid_at");--> statement-breakpoint
CREATE INDEX "refunds_order_seq" ON "refunds" USING btree ("order_id","seq");--> statement-breakpoint
CREATE INDEX "webhook_events_order" ON "webhook_events" USING btree ("order_id","seq");