-- Brand Kits v2: named colour roles, font roles, default-per-client, version history.
-- Safe to re-run (IF NOT EXISTS guards; data migration is idempotent).

-- ── Default kit per client ──────────────────────────────────────────────
ALTER TABLE brand_kits ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE brand_kits ADD COLUMN IF NOT EXISTS source_url TEXT;

-- Only one default per client (NULL client = agency-wide default).
CREATE UNIQUE INDEX IF NOT EXISTS idx_brand_kits_default_per_client
  ON brand_kits (COALESCE(client_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE is_default;

-- ── Colours: string[] → {role, hex, label}[] ────────────────────────────
-- v1 stored a bare array of hex strings and applied by index (0 = accent, 1 = bg).
-- Map by position so existing kits keep the same visual result.
UPDATE brand_kits
SET colors = (
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'role', CASE ord
        WHEN 1 THEN 'primary'
        WHEN 2 THEN 'background'
        WHEN 3 THEN 'secondary'
        WHEN 4 THEN 'accent'
        WHEN 5 THEN 'text'
        ELSE 'extra' END,
      'hex', c.value
    ) ORDER BY ord
  ), '[]'::jsonb)
  FROM jsonb_array_elements_text(colors) WITH ORDINALITY AS c(value, ord)
)
WHERE jsonb_typeof(colors) = 'array'
  AND EXISTS (SELECT 1 FROM jsonb_array_elements(colors) e WHERE jsonb_typeof(e) = 'string');

-- ── Fonts: add role (first = heading, second = body, rest = extra) ───────
UPDATE brand_kits
SET fonts = (
  SELECT COALESCE(jsonb_agg(
    f.value || jsonb_build_object('role', CASE ord WHEN 1 THEN 'heading' WHEN 2 THEN 'body' ELSE 'extra' END)
    ORDER BY ord
  ), '[]'::jsonb)
  FROM jsonb_array_elements(fonts) WITH ORDINALITY AS f(value, ord)
)
WHERE jsonb_typeof(fonts) = 'array'
  AND EXISTS (SELECT 1 FROM jsonb_array_elements(fonts) e WHERE NOT (e ? 'role'));

-- ── Version history (snapshot before every update) ──────────────────────
CREATE TABLE IF NOT EXISTS brand_kit_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_kit_id UUID NOT NULL REFERENCES brand_kits(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  snapshot JSONB NOT NULL,
  note TEXT,
  created_by UUID REFERENCES team_members(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (brand_kit_id, version)
);
CREATE INDEX IF NOT EXISTS idx_brand_kit_versions_kit ON brand_kit_versions(brand_kit_id, version DESC);
