-- Preserve human-readable source metadata for MCP and in-app asset selection.
ALTER TABLE video_gen_source_assets
  ADD COLUMN IF NOT EXISTS original_filename TEXT,
  ADD COLUMN IF NOT EXISTS width INTEGER,
  ADD COLUMN IF NOT EXISTS height INTEGER;

