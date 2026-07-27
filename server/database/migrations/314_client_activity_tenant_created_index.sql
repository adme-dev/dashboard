CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_client_activity_client_created
  ON client_activity_log (client_id, created_at DESC);
