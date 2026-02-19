-- ============================================
-- Storage Schema Additions
-- Adds storage_key columns for R2/S3 file storage
-- ============================================

-- Add storage_key to team_members for avatar
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS avatar_storage_key TEXT;
CREATE INDEX IF NOT EXISTS idx_team_members_avatar_key ON team_members(avatar_storage_key) WHERE avatar_storage_key IS NOT NULL;

-- Add storage_key to task_attachments
ALTER TABLE task_attachments ADD COLUMN IF NOT EXISTS storage_key TEXT;
CREATE INDEX IF NOT EXISTS idx_task_attachments_storage_key ON task_attachments(storage_key) WHERE storage_key IS NOT NULL;

-- Add receipt storage columns to expenses (if not already present)
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS receipt_storage_key TEXT;
CREATE INDEX IF NOT EXISTS idx_expenses_receipt_key ON expenses(receipt_storage_key) WHERE receipt_storage_key IS NOT NULL;

-- ============================================
-- File Uploads Tracking Table (optional)
-- Tracks all files uploaded to storage for auditing
-- ============================================
CREATE TABLE IF NOT EXISTS file_uploads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  storage_key TEXT NOT NULL UNIQUE,
  original_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  file_size BIGINT NOT NULL,
  category VARCHAR(50) NOT NULL, -- 'avatars', 'attachments', 'expenses', etc.
  entity_type VARCHAR(50), -- 'task', 'expense', 'brief', etc.
  entity_id UUID,
  uploaded_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ -- Soft delete for tracking
);

CREATE INDEX IF NOT EXISTS idx_file_uploads_key ON file_uploads(storage_key);
CREATE INDEX IF NOT EXISTS idx_file_uploads_category ON file_uploads(category);
CREATE INDEX IF NOT EXISTS idx_file_uploads_entity ON file_uploads(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_file_uploads_user ON file_uploads(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_file_uploads_created ON file_uploads(created_at DESC);

-- ============================================
-- Storage Usage Stats (for monitoring)
-- ============================================
CREATE OR REPLACE VIEW storage_usage_stats AS
SELECT
  category,
  COUNT(*) as file_count,
  SUM(file_size) as total_bytes,
  ROUND(SUM(file_size) / 1024.0 / 1024.0, 2) as total_mb,
  AVG(file_size)::BIGINT as avg_file_size,
  MAX(file_size) as max_file_size,
  MIN(created_at) as first_upload,
  MAX(created_at) as last_upload
FROM file_uploads
WHERE deleted_at IS NULL
GROUP BY category
ORDER BY total_bytes DESC;

-- ============================================
-- User Storage Usage View
-- ============================================
CREATE OR REPLACE VIEW user_storage_usage AS
SELECT
  tm.id as user_id,
  tm.name as user_name,
  tm.email,
  COUNT(fu.id) as file_count,
  COALESCE(SUM(fu.file_size), 0) as total_bytes,
  ROUND(COALESCE(SUM(fu.file_size), 0) / 1024.0 / 1024.0, 2) as total_mb
FROM team_members tm
LEFT JOIN file_uploads fu ON fu.uploaded_by = tm.id AND fu.deleted_at IS NULL
GROUP BY tm.id, tm.name, tm.email
ORDER BY total_bytes DESC;
