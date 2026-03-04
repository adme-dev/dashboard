-- 044: Custom HTML Banner Templates
-- Separate system for importing/customizing raw HTML+CSS+JS banners

-- Table 1: Reusable template library
CREATE TABLE IF NOT EXISTS banner_custom_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  category VARCHAR(50) NOT NULL CHECK (category IN (
    'event-entertainment', 'product-ecommerce', 'brand-corporate',
    'social-lifestyle', 'typography-kinetic', 'abstract-artistic'
  )),
  description TEXT,
  tags TEXT[] DEFAULT '{}',
  html TEXT NOT NULL,
  css TEXT DEFAULT '',
  js TEXT DEFAULT '',
  variables JSONB DEFAULT '[]',
  width INTEGER NOT NULL DEFAULT 300,
  height INTEGER NOT NULL DEFAULT 250,
  thumbnail_url TEXT,
  preview_url TEXT,
  external_scripts TEXT[] DEFAULT '{}',
  external_styles TEXT[] DEFAULT '{}',
  is_system BOOLEAN DEFAULT FALSE,
  usage_count INTEGER DEFAULT 0,
  created_by UUID NOT NULL REFERENCES team_members(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table 2: User's customized instance of a template
CREATE TABLE IF NOT EXISTS banner_custom_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES banner_custom_templates(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  html_override TEXT,
  css_override TEXT,
  js_override TEXT,
  variable_values JSONB DEFAULT '{}',
  width INTEGER,
  height INTEGER,
  published_url TEXT,
  r2_key TEXT,
  is_published BOOLEAN DEFAULT FALSE,
  click_url TEXT,
  impression_pixel TEXT,
  click_pixel TEXT,
  client_id UUID REFERENCES agency_clients(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES team_members(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_bct_category ON banner_custom_templates(category);
CREATE INDEX IF NOT EXISTS idx_bct_created_by ON banner_custom_templates(created_by);
CREATE INDEX IF NOT EXISTS idx_bct_is_system ON banner_custom_templates(is_system) WHERE is_system = TRUE;
CREATE INDEX IF NOT EXISTS idx_bct_tags ON banner_custom_templates USING GIN(tags);

CREATE INDEX IF NOT EXISTS idx_bci_template ON banner_custom_instances(template_id);
CREATE INDEX IF NOT EXISTS idx_bci_created_by ON banner_custom_instances(created_by);
CREATE INDEX IF NOT EXISTS idx_bci_client ON banner_custom_instances(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bci_published ON banner_custom_instances(is_published) WHERE is_published = TRUE;
