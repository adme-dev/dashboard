-- 337: Dynamic QR codes (folders, codes, destination history, scans)
CREATE TABLE IF NOT EXISTS qr_folders (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id  UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, name)
);

CREATE TABLE IF NOT EXISTS qr_codes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  folder_id       UUID NULL REFERENCES qr_folders(id) ON DELETE SET NULL,
  code            TEXT NOT NULL UNIQUE,
  domain          TEXT NULL,
  name            TEXT NOT NULL,
  destination_url TEXT NOT NULL,
  style           JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  scan_count      INTEGER NOT NULL DEFAULT 0,
  last_scanned_at TIMESTAMPTZ NULL,
  created_by      UUID NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_qr_codes_client_folder ON qr_codes(client_id, folder_id);

CREATE TABLE IF NOT EXISTS qr_destination_history (
  id         BIGSERIAL PRIMARY KEY,
  qr_code_id UUID NOT NULL REFERENCES qr_codes(id) ON DELETE CASCADE,
  old_url    TEXT NULL,
  new_url    TEXT NOT NULL,
  changed_by UUID NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_qr_destination_history_code ON qr_destination_history(qr_code_id, changed_at DESC);

CREATE TABLE IF NOT EXISTS qr_scans (
  id          BIGSERIAL PRIMARY KEY,
  qr_code_id  UUID NOT NULL REFERENCES qr_codes(id) ON DELETE CASCADE,
  client_id   UUID NOT NULL,
  scanned_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  country     TEXT NULL,
  device_type TEXT NULL,
  os          TEXT NULL,
  browser     TEXT NULL,
  ip_hash     TEXT NULL,
  referrer    TEXT NULL,
  ua          TEXT NULL
);
CREATE INDEX IF NOT EXISTS idx_qr_scans_code_time ON qr_scans(qr_code_id, scanned_at DESC);
CREATE INDEX IF NOT EXISTS idx_qr_scans_client_time ON qr_scans(client_id, scanned_at DESC);
