-- 074-project-repos.sql
-- Links boards (departments) to external code repositories so AI agents can
-- pull context. Phase 2 step 1 of the GitHub-as-AI-context feature.
--
-- Token encryption: AES-GCM at the application layer (crypto.subtle in
-- server/utils/github.ts), stored as bytea. The DB never sees plaintext
-- tokens — keeps the existing codebase pattern (no pgcrypto install) and
-- works on Cloudflare Workers natively.

BEGIN;

CREATE TABLE IF NOT EXISTS project_repos (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  department_id           UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  repo_url                TEXT NOT NULL,                   -- e.g. https://github.com/adme-dev/promotion-knoxgwmhaval
  provider                VARCHAR(20) NOT NULL DEFAULT 'github',
  default_branch          VARCHAR(100) NOT NULL DEFAULT 'main',
  access_token_encrypted  BYTEA,                            -- AES-GCM ciphertext with IV prefix
  token_iv                BYTEA,                            -- 12-byte IV for AES-GCM (separate column for clarity)
  graphify_path           TEXT,                             -- local path or R2 key for graphify-out (used as AI context source)
  graphify_last_synced_at TIMESTAMPTZ,                      -- when the graph was last refreshed
  created_by              UUID REFERENCES team_members(id),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (department_id, repo_url)
);

CREATE INDEX IF NOT EXISTS idx_project_repos_department ON project_repos(department_id);
CREATE INDEX IF NOT EXISTS idx_project_repos_provider   ON project_repos(provider);

CREATE OR REPLACE FUNCTION update_project_repos_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_project_repos_updated_at ON project_repos;
CREATE TRIGGER trg_project_repos_updated_at
  BEFORE UPDATE ON project_repos
  FOR EACH ROW
  EXECUTE FUNCTION update_project_repos_updated_at();

COMMIT;
