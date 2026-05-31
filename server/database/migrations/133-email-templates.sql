-- 133: email marketing — reusable email templates / drafts (Phase 2a-i)
-- Stores the flyhub document (JSONB body_source) and its server-rendered HTML.
-- The editor (Phase 2a-ii) edits body_source; the renderer regenerates body_html.
--
-- NOTE: named `edm_templates` (not `email_templates`) — the latter already exists
-- for the automation/notification template feature (subject_template/body_template).
CREATE TABLE IF NOT EXISTS edm_templates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  subject      TEXT,
  preview_text TEXT,
  body_source  JSONB NOT NULL DEFAULT '{"root":{"type":"EmailLayout","data":{"childrenIds":[]}}}'::jsonb,
  body_html    TEXT,
  content_type TEXT NOT NULL DEFAULT 'flyhub' CHECK (content_type IN ('flyhub','html')),
  client_id    UUID REFERENCES agency_clients(id) ON DELETE CASCADE,
  created_by   UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_edm_templates_client ON edm_templates(client_id);
