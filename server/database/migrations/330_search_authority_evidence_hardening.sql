-- Search Authority evidence hardening: one selected property per site,
-- explicit successful projection checks (including zero-row responses), and
-- a renewable lease and durable 90-day baseline for resumable sync execution.

BEGIN;

WITH ranked_maps AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY site_id
      ORDER BY updated_at DESC, created_at DESC, id DESC
    ) AS selected_order
  FROM search_console_property_maps
  WHERE status IN ('active', 'restricted')
)
UPDATE search_console_property_maps map
SET status = 'disconnected',
    updated_at = NOW()
FROM ranked_maps ranked
WHERE map.id = ranked.id
  AND ranked.selected_order > 1;

CREATE UNIQUE INDEX IF NOT EXISTS
  idx_search_console_property_maps_one_selected_per_site
  ON search_console_property_maps (site_id)
  WHERE status IN ('active', 'restricted');

ALTER TABLE search_console_property_maps
  ADD COLUMN IF NOT EXISTS sync_lease_token UUID;

ALTER TABLE search_console_property_maps
  ADD COLUMN IF NOT EXISTS sync_lease_expires_at TIMESTAMPTZ;

ALTER TABLE search_console_property_maps
  ADD COLUMN IF NOT EXISTS baseline_start_date DATE;

ALTER TABLE search_console_property_maps
  ADD COLUMN IF NOT EXISTS baseline_end_date DATE;

ALTER TABLE search_console_property_maps
  ADD COLUMN IF NOT EXISTS baseline_completed_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS gsc_projection_checks (
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  property_map_id UUID NOT NULL,
  metric_date DATE NOT NULL,
  search_type TEXT NOT NULL DEFAULT 'web'
    CHECK (search_type IN ('web', 'image', 'video', 'news', 'discover', 'googleNews')),
  projection TEXT NOT NULL
    CHECK (projection IN ('property', 'page', 'query_page')),
  row_count INTEGER NOT NULL CHECK (row_count >= 0),
  provisional BOOLEAN NOT NULL DEFAULT FALSE,
  first_incomplete_date DATE,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (client_id, property_map_id)
    REFERENCES search_console_property_maps(client_id, id) ON DELETE CASCADE,
  PRIMARY KEY (
    property_map_id,
    metric_date,
    search_type,
    projection
  )
);

CREATE INDEX IF NOT EXISTS idx_gsc_projection_checks_client_window
  ON gsc_projection_checks (
    client_id,
    property_map_id,
    metric_date DESC,
    projection
  );

COMMENT ON TABLE gsc_projection_checks IS
  'Successful Search Console projection responses, including empty result sets. Missing checks mean unavailable evidence and must never be interpreted as zero.';

COMMIT;
