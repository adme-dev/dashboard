-- Client portal enterprise dashboard support indexes
-- Keeps jobs, billing, campaign, and portal-access summaries fast.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS budget DECIMAL(12, 2);

UPDATE projects
SET due_date = end_date
WHERE due_date IS NULL
  AND end_date IS NOT NULL;

UPDATE projects
SET budget = budget_amount
WHERE budget IS NULL
  AND budget_amount IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_projects_client_status_due_date
  ON projects(client_id, status, due_date);

CREATE INDEX IF NOT EXISTS idx_projects_client_status_updated_at
  ON projects(client_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_invoices_client_status_due_date
  ON invoices(client_id, status, due_date);

CREATE INDEX IF NOT EXISTS idx_invoices_client_status_paid_date
  ON invoices(client_id, status, paid_date DESC);

CREATE INDEX IF NOT EXISTS idx_client_users_client_status_last_login
  ON client_users(client_id, status, last_login_at DESC);

CREATE INDEX IF NOT EXISTS idx_media_spend_client_period_campaign
  ON media_spend(client_id, period, campaign_id);

CREATE INDEX IF NOT EXISTS idx_media_spend_connection_period_campaign
  ON media_spend(connection_id, period, campaign_id);
