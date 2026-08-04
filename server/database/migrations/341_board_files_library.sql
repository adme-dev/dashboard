CREATE TABLE IF NOT EXISTS board_files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  uploaded_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  file_name VARCHAR(255) NOT NULL,
  file_url TEXT NOT NULL,
  file_type VARCHAR(100) NOT NULL,
  file_size BIGINT NOT NULL CHECK (file_size >= 0),
  storage_key TEXT,
  category VARCHAR(20) NOT NULL DEFAULT 'reference'
    CHECK (category IN ('reference', 'policy', 'template', 'other')),
  description TEXT,
  source VARCHAR(20) NOT NULL DEFAULT 'xeroflow'
    CHECK (source IN ('xeroflow', 'monday', 'xero')),
  source_reference TEXT,
  checksum_sha256 CHAR(64) NOT NULL CHECK (checksum_sha256 ~ '^[a-f0-9]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (department_id, checksum_sha256)
);

CREATE INDEX IF NOT EXISTS idx_board_files_department
  ON board_files (department_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_board_files_uploader
  ON board_files (uploaded_by, created_at DESC);
