-- 031: Banner Comments & Annotations + Review Links + Version History
-- Phase 5b: Collaboration & Approval

-- Comments pinned to specific coordinates on banner formats
CREATE TABLE IF NOT EXISTS banner_comments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES banner_projects(id) ON DELETE CASCADE,
  format_key    TEXT NOT NULL,
  x             INTEGER NOT NULL DEFAULT 0,
  y             INTEGER NOT NULL DEFAULT 0,
  text          TEXT NOT NULL,
  user_id       UUID REFERENCES team_members(id) ON DELETE SET NULL,
  -- External reviewer (no account)
  reviewer_name TEXT,
  reviewer_email TEXT,
  parent_id     UUID REFERENCES banner_comments(id) ON DELETE CASCADE,
  resolved      BOOLEAN NOT NULL DEFAULT false,
  resolved_by   UUID REFERENCES team_members(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_banner_comments_project ON banner_comments(project_id);
CREATE INDEX idx_banner_comments_parent ON banner_comments(parent_id);

-- Shareable review links with token-based auth
CREATE TABLE IF NOT EXISTS banner_review_links (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES banner_projects(id) ON DELETE CASCADE,
  token         TEXT NOT NULL UNIQUE,
  reviewer_name TEXT,
  reviewer_email TEXT,
  expires_at    TIMESTAMPTZ,
  revoked       BOOLEAN NOT NULL DEFAULT false,
  created_by    UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_banner_review_links_token ON banner_review_links(token);
CREATE INDEX idx_banner_review_links_project ON banner_review_links(project_id);

-- Version snapshots for undo/restore
CREATE TABLE IF NOT EXISTS banner_versions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES banner_projects(id) ON DELETE CASCADE,
  version_number  INTEGER NOT NULL,
  canvas_data     JSONB NOT NULL,
  label           TEXT,
  created_by      UUID REFERENCES team_members(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_banner_versions_project ON banner_versions(project_id);
CREATE UNIQUE INDEX idx_banner_versions_project_number ON banner_versions(project_id, version_number);

-- Add review status to projects
ALTER TABLE banner_projects
  ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS reviewers UUID[] DEFAULT '{}';
