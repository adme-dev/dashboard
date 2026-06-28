-- 206: client ↔ external dealer-feed provider links (dealer feeds plugin P1a)
-- Maps a XeroFlow agency_client to a social-dashboard organization (feed ownership)
-- plus seller refs (inventory queries). Additive + idempotent.

CREATE TABLE IF NOT EXISTS client_feed_links (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id        uuid NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  provider_id      varchar(50) NOT NULL DEFAULT 'social-dashboard',
  external_org_id  varchar(255) NOT NULL,
  seller_refs      jsonb NOT NULL DEFAULT '[]'::jsonb,
  default_feed_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  status           varchar(20) NOT NULL DEFAULT 'active',
  created_by       uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS client_feed_links_client_provider_key
  ON client_feed_links (client_id, provider_id);
CREATE INDEX IF NOT EXISTS idx_client_feed_links_client ON client_feed_links (client_id);
