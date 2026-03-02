-- Banner Studio tables
-- Projects, assets, templates, exports, and AI jobs

CREATE TABLE banner_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  client_id UUID REFERENCES agency_clients(id) ON DELETE SET NULL,
  canvas_data JSONB NOT NULL DEFAULT '{}',
  thumbnail_url TEXT,
  status VARCHAR(20) DEFAULT 'draft',
  tags TEXT[] DEFAULT '{}',
  created_by UUID NOT NULL REFERENCES team_members(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE banner_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  file_size INTEGER NOT NULL,
  r2_key TEXT NOT NULL,
  url TEXT NOT NULL,
  thumbnail_url TEXT,
  tags TEXT[] DEFAULT '{}',
  uploaded_by UUID NOT NULL REFERENCES team_members(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE banner_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  category VARCHAR(50) DEFAULT 'custom',
  canvas_data JSONB NOT NULL,
  thumbnail_url TEXT,
  is_system BOOLEAN DEFAULT FALSE,
  created_by UUID REFERENCES team_members(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE banner_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES banner_projects(id) ON DELETE CASCADE,
  format_key VARCHAR(50) NOT NULL,
  r2_key TEXT NOT NULL,
  url TEXT NOT NULL,
  file_size INTEGER,
  exported_by UUID NOT NULL REFERENCES team_members(id),
  exported_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE banner_ai_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES banner_projects(id) ON DELETE SET NULL,
  job_type VARCHAR(50) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  input_params JSONB NOT NULL DEFAULT '{}',
  result_data JSONB,
  error_message TEXT,
  created_by UUID NOT NULL REFERENCES team_members(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_banner_projects_client ON banner_projects(client_id);
CREATE INDEX idx_banner_projects_created_by ON banner_projects(created_by);
CREATE INDEX idx_banner_assets_uploaded_by ON banner_assets(uploaded_by);
CREATE INDEX idx_banner_exports_project ON banner_exports(project_id);
CREATE INDEX idx_banner_ai_jobs_project ON banner_ai_jobs(project_id);
