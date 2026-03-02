-- Banner Studio: Brand Kits + Image Export Support
-- Phase 2a: Brand Kit system for per-client brand consistency
-- Phase 1a: Image export metadata (export_type, quality)

-- ============================================
-- Brand Kits
-- ============================================

CREATE TABLE brand_kits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES agency_clients(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  colors JSONB NOT NULL DEFAULT '[]',
  fonts JSONB NOT NULL DEFAULT '[]',
  logos JSONB NOT NULL DEFAULT '[]',
  guidelines TEXT,
  created_by UUID NOT NULL REFERENCES team_members(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_brand_kits_client ON brand_kits(client_id);
CREATE INDEX idx_brand_kits_created_by ON brand_kits(created_by);

-- ============================================
-- Image Export Support
-- ============================================

-- Add export type and quality to banner_exports
ALTER TABLE banner_exports
  ADD COLUMN export_type VARCHAR(20) DEFAULT 'html5',
  ADD COLUMN quality INTEGER DEFAULT 1;
