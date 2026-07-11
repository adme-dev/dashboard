-- Durable provenance for files imported by recurring Monday operational sync.
CREATE TABLE IF NOT EXISTS monday_sync_file_mappings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  monday_asset_id VARCHAR(100) NOT NULL UNIQUE,
  monday_item_id VARCHAR(100) NOT NULL,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  attachment_id UUID REFERENCES task_attachments(id) ON DELETE SET NULL,
  source_file_name VARCHAR(255) NOT NULL,
  source_file_size BIGINT NOT NULL CHECK (source_file_size >= 0),
  source_url TEXT,
  storage_key TEXT NOT NULL,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_monday_sync_files_task
  ON monday_sync_file_mappings (task_id, imported_at DESC);

CREATE INDEX IF NOT EXISTS idx_monday_sync_files_item
  ON monday_sync_file_mappings (monday_item_id);
