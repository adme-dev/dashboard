-- 149_audio_assets.sql — Audio Studio owned-audio asset spine.
-- (Originally authored as 147; renumbered to 149 to avoid colliding with
--  147-crm-sales-productivity and the in-flight 148 social-inbox migration.
--  Idempotent — the table is already live on prod, so re-running is a no-op.)
-- One row per generated asset (voiceover now; music in Phase 2).
CREATE TABLE IF NOT EXISTS audio_assets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID NULL REFERENCES agency_clients(id) ON DELETE SET NULL,
  created_by      UUID NOT NULL,
  kind            TEXT NOT NULL CHECK (kind IN ('voiceover', 'music')),
  status          TEXT NOT NULL DEFAULT 'ready'
                  CHECK (status IN ('queued','processing','rendering','done','failed','ready')),
  title           TEXT NULL,
  prompt          TEXT NULL,           -- music brief OR voiceover text
  lang            TEXT NULL,
  voice           TEXT NULL,
  channels        TEXT[] NOT NULL DEFAULT '{}',   -- requested target channels
  r2_key_master   TEXT NULL,
  variants        JSONB NOT NULL DEFAULT '{}'::jsonb, -- { radio, tiktok, meta } -> r2 keys
  duration_sec    NUMERIC NULL,
  cost_cents      INTEGER NULL,
  idempotency_key TEXT NULL UNIQUE,
  error           TEXT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audio_assets_client_kind_status
  ON audio_assets (client_id, kind, status);
CREATE INDEX IF NOT EXISTS idx_audio_assets_created_at
  ON audio_assets (created_at DESC);
