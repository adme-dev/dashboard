-- Migration 095: Agency settings — generic key/value store for tenant config
--
-- Phase 1 of the Get Out overhaul. The Get Out page currently hardcodes
-- monthly wages, expenses and "extras" in source (server/api/xero/get-out.get.ts).
-- This table lets each tenant configure those values + adds a place for
-- future tenant-scoped configuration that doesn't deserve its own table.
--
-- Storage shape:
--   tenant_id + key compose the primary key
--   value is JSONB so each setting can hold whatever shape it needs
--
-- Initial keys consumed by the codebase:
--   'get_out_config' → {
--       lines: [
--         { id, label, category: 'wages'|'expenses'|'extras', amountCents, notes? }
--       ]
--     }

CREATE TABLE IF NOT EXISTS agency_settings (
  tenant_id   TEXT NOT NULL,
  key         TEXT NOT NULL,
  value       JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by  UUID REFERENCES team_members(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (tenant_id, key)
);

-- Read patterns: always look up by (tenant_id, key) — covered by the PK.
-- No additional indexes needed at this scale.
