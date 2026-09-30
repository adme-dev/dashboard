-- Test-only purchase identity and immutable webhook evidence. No credits are
-- granted by checkout creation or a browser return URL.
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE TABLE IF NOT EXISTS page_studio_image_purchases (
  intent_id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  client_id UUID NOT NULL,
  environment TEXT NOT NULL CHECK(environment='staging'),
  site_id UUID NOT NULL,
  actor_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  pack JSONB NOT NULL,
  fingerprint TEXT NOT NULL CHECK(fingerprint ~ '^[a-f0-9]{64}$'),
  customer_id TEXT,
  checkout_id TEXT,
  checkout_url TEXT,
  payment_id TEXT,
  charge_id TEXT,
  funded BOOLEAN NOT NULL DEFAULT FALSE,
  refunded_minor BIGINT NOT NULL DEFAULT 0 CHECK(refunded_minor >= 0),
  dispute_id TEXT,
  dispute_status TEXT CHECK(dispute_status IN ('active','won','lost')),
  compensated_credits BIGINT NOT NULL DEFAULT 0 CHECK(compensated_credits BETWEEN 0 AND 1000000000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(tenant_id,client_id,environment) REFERENCES page_studio_image_wallets(tenant_id,client_id,environment),
  FOREIGN KEY(tenant_id,client_id,site_id) REFERENCES page_studio_sites(tenant_id,client_id,id),
  UNIQUE(account_id,checkout_id),
  UNIQUE(account_id,payment_id),
  UNIQUE(account_id,charge_id)
);
-- Nullable only for previously created staging fixtures; never admitted to new checkout.
ALTER TABLE page_studio_image_purchases ADD COLUMN IF NOT EXISTS return_origin TEXT;
CREATE INDEX IF NOT EXISTS page_studio_image_purchase_history
  ON page_studio_image_purchases(tenant_id,client_id,environment,created_at DESC);
CREATE OR REPLACE FUNCTION page_studio_image_purchase_identity_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN
  IF (NEW.intent_id,NEW.tenant_id,NEW.client_id,NEW.environment,NEW.site_id,NEW.actor_id,NEW.account_id,NEW.pack,NEW.fingerprint,NEW.created_at,NEW.return_origin)
      IS DISTINCT FROM (OLD.intent_id,OLD.tenant_id,OLD.client_id,OLD.environment,OLD.site_id,OLD.actor_id,OLD.account_id,OLD.pack,OLD.fingerprint,OLD.created_at,OLD.return_origin)
    OR (OLD.customer_id IS NOT NULL AND NEW.customer_id IS DISTINCT FROM OLD.customer_id)
    OR (OLD.checkout_id IS NOT NULL AND NEW.checkout_id IS DISTINCT FROM OLD.checkout_id)
    OR (OLD.checkout_url IS NOT NULL AND NEW.checkout_url IS DISTINCT FROM OLD.checkout_url)
    OR (OLD.payment_id IS NOT NULL AND NEW.payment_id IS DISTINCT FROM OLD.payment_id)
    OR (OLD.charge_id IS NOT NULL AND NEW.charge_id IS DISTINCT FROM OLD.charge_id)
    OR (OLD.funded AND NOT NEW.funded) OR NEW.refunded_minor<OLD.refunded_minor THEN
    RAISE EXCEPTION 'Image purchase identity is immutable' USING ERRCODE='55000';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS page_studio_image_purchase_identity_immutable ON page_studio_image_purchases;
CREATE TRIGGER page_studio_image_purchase_identity_immutable
  BEFORE UPDATE ON page_studio_image_purchases
  FOR EACH ROW EXECUTE FUNCTION page_studio_image_purchase_identity_immutable();
CREATE TABLE IF NOT EXISTS page_studio_image_payment_refunds (
  account_id TEXT NOT NULL,
  refund_id TEXT NOT NULL,
  intent_id UUID NOT NULL REFERENCES page_studio_image_purchases(intent_id),
  amount_minor BIGINT NOT NULL CHECK(amount_minor BETWEEN 1 AND 10000000),
  status TEXT NOT NULL CHECK(status IN ('pending','succeeded','failed','canceled')),
  PRIMARY KEY(account_id,refund_id)
);
CREATE OR REPLACE FUNCTION page_studio_image_refund_identity_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN
  IF (NEW.account_id,NEW.refund_id,NEW.intent_id,NEW.amount_minor) IS DISTINCT FROM (OLD.account_id,OLD.refund_id,OLD.intent_id,OLD.amount_minor)
    OR (OLD.status IN ('failed','canceled') AND NEW.status IS DISTINCT FROM OLD.status) THEN
    RAISE EXCEPTION 'Image refund identity is immutable' USING ERRCODE='55000';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS page_studio_image_refund_identity_immutable ON page_studio_image_payment_refunds;
CREATE TRIGGER page_studio_image_refund_identity_immutable BEFORE UPDATE ON page_studio_image_payment_refunds
  FOR EACH ROW EXECUTE FUNCTION page_studio_image_refund_identity_immutable();
CREATE TABLE IF NOT EXISTS page_studio_image_payment_events (
  account_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  intent_id UUID NOT NULL REFERENCES page_studio_image_purchases(intent_id),
  fingerprint TEXT NOT NULL CHECK(fingerprint ~ '^[a-f0-9]{64}$'),
  observation JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(account_id,event_id)
);
DROP TRIGGER IF EXISTS page_studio_image_payment_events_immutable ON page_studio_image_payment_events;
CREATE TRIGGER page_studio_image_payment_events_immutable
  BEFORE UPDATE OR DELETE ON page_studio_image_payment_events
  FOR EACH ROW EXECUTE FUNCTION page_studio_image_credit_history_immutable();
COMMIT;
