-- Governance metadata for role benchmark frameworks. Historical versions stay
-- reproducible; only the current active version can be selected for new roles.
ALTER TABLE hr_benchmark_frameworks
  ADD COLUMN IF NOT EXISTS license_terms TEXT,
  ADD COLUMN IF NOT EXISTS role_families JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS levels JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS review_due_at DATE,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS activated_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_hr_benchmark_one_active_version
  ON hr_benchmark_frameworks (framework_key) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_hr_benchmark_review_due
  ON hr_benchmark_frameworks (review_due_at) WHERE status = 'active';

UPDATE hr_benchmark_frameworks
   SET license_terms = COALESCE(license_terms, 'Use subject to the publisher terms at the recorded source URL.'),
       role_families = CASE framework_key
         WHEN 'ami-mcf' THEN '["marketing"]'::jsonb
         WHEN 'sfia-9' THEN '["technology","digital"]'::jsonb
         WHEN 'pmi-pmcd' THEN '["project_management","operations"]'::jsonb
         ELSE role_families END,
       levels = CASE WHEN levels = '[]'::jsonb THEN '["role-specific mapping required"]'::jsonb ELSE levels END,
       review_due_at = COALESCE(review_due_at, CURRENT_DATE + 365),
       activated_at = COALESCE(activated_at, reviewed_at)
 WHERE status = 'active';

COMMENT ON TABLE hr_benchmark_frameworks IS
  'Versioned external or company benchmark registry. Drafts require explicit owner activation before new role use.';
