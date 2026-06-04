-- 163: email marketing — saved custom modules (EDM enterprise Phase 2)
-- A custom module is a reusable, named section a user has built and saved.
-- It stores a document FRAGMENT — the block subtree rooted at the saved block:
--   blocks        = { blocks: Record<blockId, EdmFlyhubBlock>, rootChildrenIds: string[] }
-- On insert, the fragment is re-ID'd and spliced into the document like any
-- section preset. Agency-wide by default (client_id NULL); optional per-client
-- scoping mirrors edm_templates.
CREATE TABLE IF NOT EXISTS edm_custom_modules (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  description  TEXT,
  category     TEXT NOT NULL DEFAULT 'custom',
  blocks       JSONB NOT NULL DEFAULT '{"blocks":{},"rootChildrenIds":[]}'::jsonb,
  preview_tone TEXT NOT NULL DEFAULT 'light' CHECK (preview_tone IN ('light','dark','accent')),
  client_id    UUID REFERENCES agency_clients(id) ON DELETE CASCADE,
  created_by   UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_edm_custom_modules_updated ON edm_custom_modules(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_edm_custom_modules_client ON edm_custom_modules(client_id);
