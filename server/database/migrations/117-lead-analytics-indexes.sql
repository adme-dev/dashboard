-- 117-lead-analytics-indexes.sql
-- Support campaign-level lead analytics joins used by agency and client portal reporting.

CREATE INDEX IF NOT EXISTS idx_leads_client_source_campaign_submitted
  ON leads(client_id, source, campaign_id, submitted_at DESC)
  WHERE deleted_at IS NULL AND campaign_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_client_source_campaign_name_submitted
  ON leads(client_id, source, campaign_name, submitted_at DESC)
  WHERE deleted_at IS NULL AND campaign_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_source_campaign_submitted
  ON leads(source, campaign_id, submitted_at DESC)
  WHERE deleted_at IS NULL AND campaign_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_source_campaign_name_submitted
  ON leads(source, campaign_name, submitted_at DESC)
  WHERE deleted_at IS NULL AND campaign_name IS NOT NULL;
