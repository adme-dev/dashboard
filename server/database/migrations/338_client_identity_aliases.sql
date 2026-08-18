BEGIN;

ALTER TABLE agency_clients
  ADD COLUMN IF NOT EXISTS parent_client_id UUID REFERENCES agency_clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_agency_clients_parent
  ON agency_clients(parent_client_id);

CREATE TABLE IF NOT EXISTS agency_client_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_agency_client_aliases_normalized
  ON agency_client_aliases(LOWER(alias));
CREATE INDEX IF NOT EXISTS idx_agency_client_aliases_client
  ON agency_client_aliases(client_id);

-- Known cross-system dealer-group names from the Godmode reconciliation spec.
-- The alias belongs to the existing canonical group; no client records are invented.
INSERT INTO agency_client_aliases (client_id, alias, source)
SELECT c.id, seed.alias, 'monday_grouping'
FROM (VALUES
  ('Frankston Motor Group', 'Frankston Kia'),
  ('Frankston Motor Group', 'Frankston KGM'),
  ('Frankston Motor Group', 'Frankston Renault'),
  ('Frankston Motor Group', 'Frankston GMSV'),
  ('Frankston Motor Group', 'Frankston Isuzu UTE'),
  ('Waverley Motor Group', 'Waverley DEEPAL'),
  ('Waverley Motor Group', 'Waverley FOTON'),
  ('Waverley Motor Group', 'Waverley MG'),
  ('Geelong Motor Group', 'Geelong Mazda'),
  ('Geelong Motor Group', 'Geelong Kia'),
  ('Geelong Motor Group', 'Geelong GWM'),
  ('Northern Motor Group', 'Northern Kia'),
  ('Northern Motor Group', 'Northern Nissan'),
  ('Northern Motor Group', 'Northern MG'),
  ('Northern Motor Group', 'Northern GAC')
) AS seed(canonical_name, alias)
JOIN agency_clients c ON LOWER(c.name) = LOWER(seed.canonical_name)
ON CONFLICT (LOWER(alias)) DO NOTHING;

COMMIT;
