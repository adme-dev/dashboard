-- 272_send_public_verifications.sql
-- Transfer-scoped, single-use verification challenges for the cost-capped public beta.

BEGIN;

CREATE TABLE IF NOT EXISTS send_public_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id UUID NOT NULL UNIQUE REFERENCES send_transfers(id) ON DELETE CASCADE,
  public_sender_id UUID NOT NULL REFERENCES send_public_senders(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  verification_expires_at TIMESTAMPTZ NOT NULL,
  verification_consumed_at TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (verification_expires_at > created_at),
  CHECK (
    verification_consumed_at IS NULL
    OR verification_consumed_at >= created_at
  )
);

CREATE INDEX IF NOT EXISTS idx_send_public_verifications_expiry
  ON send_public_verifications (verification_expires_at, created_at)
  WHERE verification_consumed_at IS NULL;

DROP TRIGGER IF EXISTS trg_send_public_verifications_updated_at
  ON send_public_verifications;
CREATE TRIGGER trg_send_public_verifications_updated_at
BEFORE UPDATE ON send_public_verifications
FOR EACH ROW EXECUTE FUNCTION set_send_updated_at();

COMMENT ON TABLE send_public_verifications IS
  'Single-use, transfer-scoped verification challenges. Raw tokens are never persisted.';

COMMIT;
