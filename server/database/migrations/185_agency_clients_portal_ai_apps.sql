-- 185_agency_clients_portal_ai_apps.sql
-- Phase 3 (portal-agent spec §4 / §13.2): per-client portal co-pilot app-assignment.
-- The agency toggles which apps each client's Portal Assistant can use; the agent's toolset is
-- narrowed to (enabled apps ∩ portal-safe tools). NULL = no explicit assignment → default-all.
-- Stored as a JSONB array of app keys, e.g. ["approvals","invoices","social-reporting"]. Additive.

ALTER TABLE agency_clients ADD COLUMN IF NOT EXISTS portal_ai_apps JSONB;
