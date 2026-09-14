-- Page Studio request history must remain searchable after soft deletion.
-- The shared live-only deduplication index deliberately retains its policy.
CREATE INDEX IF NOT EXISTS idx_page_studio_lead_source_history
  ON leads (source_lead_id, client_id)
  WHERE source = 'page_studio';

-- Scoped reservation and accepted-identity receipts outlive a purged lead.
CREATE INDEX IF NOT EXISTS idx_page_studio_lead_submission_identity
  ON page_studio_audit_events (resource_id, client_id, action)
  WHERE resource_type = 'lead_submission';
