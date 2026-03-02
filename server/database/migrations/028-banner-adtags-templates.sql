-- Banner Studio: Ad Tags (Phase 1b) + Template Marketplace (Phase 2b)

-- ============================================
-- Phase 1b: Published Banners & Ad Tags
-- ============================================

-- Published banner versions with stable CDN URLs
CREATE TABLE banner_published (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES banner_projects(id) ON DELETE CASCADE,
  format_key VARCHAR(50) NOT NULL,
  -- Versioned HTML content stored on R2
  version INTEGER NOT NULL DEFAULT 1,
  r2_key TEXT NOT NULL,
  url TEXT NOT NULL,
  -- Click-through configuration
  click_url TEXT,
  -- Tracking pixels (impression + click)
  impression_pixel TEXT,
  click_pixel TEXT,
  -- Banner metadata for ad tags
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  file_size INTEGER,
  -- Status
  is_live BOOLEAN DEFAULT TRUE,
  published_by UUID NOT NULL REFERENCES team_members(id),
  published_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  -- One active version per project+format
  UNIQUE(project_id, format_key)
);

CREATE INDEX idx_banner_published_project ON banner_published(project_id);
CREATE INDEX idx_banner_published_live ON banner_published(is_live) WHERE is_live = TRUE;

-- ============================================
-- Phase 2b: Template Marketplace Enhancements
-- ============================================

-- Add marketplace fields to banner_templates
ALTER TABLE banner_templates
  ADD COLUMN description TEXT,
  ADD COLUMN tags TEXT[] DEFAULT '{}',
  ADD COLUMN preview_url TEXT,
  ADD COLUMN usage_count INTEGER DEFAULT 0,
  ADD COLUMN formats TEXT[] DEFAULT '{}';

CREATE INDEX idx_banner_templates_category ON banner_templates(category);
CREATE INDEX idx_banner_templates_usage ON banner_templates(usage_count DESC);
