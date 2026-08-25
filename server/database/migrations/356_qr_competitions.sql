-- QR competitions (S2): entries, versioned T&Cs, audited draws, permit tracking, legal evidence vault.
CREATE TABLE IF NOT EXISTS qr_competitions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id             UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL,
  type                  TEXT NOT NULL DEFAULT 'chance' CHECK (type IN ('chance', 'skill')),
  status                TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'open', 'closed', 'drawn', 'archived')),
  timezone              TEXT NOT NULL DEFAULT 'Australia/Melbourne',
  opens_at              TIMESTAMPTZ NULL,
  closes_at             TIMESTAMPTZ NULL,
  details               JSONB NOT NULL DEFAULT '{}'::jsonb,   -- validated by shared/qr/competition.ts CompetitionDetailsSchema
  permits               JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [{ state, required, status, permit_number, applied_at, approved_at, expires_at, document_id }]
  terms_current_version INTEGER NOT NULL DEFAULT 0,
  created_by            UUID NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_qr_competitions_client ON qr_competitions(client_id, status);

CREATE TABLE IF NOT EXISTS qr_competition_terms_versions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id  UUID NOT NULL REFERENCES qr_competitions(id) ON DELETE CASCADE,
  version         INTEGER NOT NULL,
  terms_md        TEXT NOT NULL,
  sha256          TEXT NOT NULL,
  created_by      UUID NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (competition_id, version)
);

CREATE TABLE IF NOT EXISTS qr_competition_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id  UUID NOT NULL REFERENCES qr_competitions(id) ON DELETE CASCADE,
  qr_code_id      UUID NULL REFERENCES qr_codes(id) ON DELETE SET NULL,
  lead_id         UUID NULL REFERENCES leads(id) ON DELETE SET NULL,
  entrant_hash    TEXT NOT NULL,
  terms_version   INTEGER NOT NULL,
  answer          TEXT NULL,
  postcode        TEXT NULL,
  state           TEXT NULL,
  ip_hash         TEXT NULL,
  ua              TEXT NULL,
  status          TEXT NOT NULL DEFAULT 'valid' CHECK (status IN ('valid', 'disqualified', 'winner', 'reserve')),
  status_reason   TEXT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_qr_competition_entries_comp ON qr_competition_entries(competition_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_qr_competition_entries_entrant ON qr_competition_entries(competition_id, entrant_hash);

CREATE TABLE IF NOT EXISTS qr_competition_draws (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id  UUID NOT NULL REFERENCES qr_competitions(id) ON DELETE CASCADE,
  drawn_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  drawn_by        UUID NULL,
  method          TEXT NOT NULL DEFAULT 'csprng_fisher_yates',
  seed_sha256     TEXT NOT NULL,
  eligible_count  INTEGER NOT NULL,
  winners         UUID[] NOT NULL DEFAULT '{}',
  reserves        UUID[] NOT NULL DEFAULT '{}',
  filters         JSONB NOT NULL DEFAULT '{}'::jsonb,
  note            TEXT NULL
);

-- Legal evidence vault: immutable files (permit approvals, signed T&Cs, contracts, correspondence).
CREATE TABLE IF NOT EXISTS qr_competition_documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id  UUID NOT NULL REFERENCES qr_competitions(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL CHECK (kind IN ('permit', 'terms_signed', 'contract', 'correspondence', 'other')),
  state           TEXT NULL,
  title           TEXT NOT NULL,
  storage_key     TEXT NOT NULL,
  sha256          TEXT NOT NULL,
  size_bytes      INTEGER NOT NULL,
  content_type    TEXT NOT NULL,
  uploaded_by     UUID NULL,
  uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ NULL,
  deleted_by      UUID NULL,
  delete_reason   TEXT NULL
);
CREATE INDEX IF NOT EXISTS idx_qr_competition_documents_comp ON qr_competition_documents(competition_id) WHERE deleted_at IS NULL;

ALTER TABLE qr_pages ADD COLUMN IF NOT EXISTS competition_id UUID NULL REFERENCES qr_competitions(id) ON DELETE SET NULL;
