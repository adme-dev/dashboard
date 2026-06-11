-- 178_video_derivative_bucket_item_unique_index.sql — race-safe reuse of asset intelligence derivatives.
CREATE UNIQUE INDEX IF NOT EXISTS idx_video_project_bucket_items_bucket_derivative
  ON video_project_bucket_items (bucket_id, (directive->>'derivativeId'))
  WHERE directive->>'source' = 'video_asset_derivatives'
    AND directive ? 'derivativeId';
