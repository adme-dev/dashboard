-- ============================================
-- Agency Platform Database Schema
-- For use with Postgres + Zero sync
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- Chart of Accounts
-- ============================================
CREATE TABLE chart_of_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(10) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(50) NOT NULL CHECK (category IN ('asset', 'liability', 'equity', 'revenue', 'cost_of_services', 'operating_expense')),
  description TEXT,
  parent_id UUID REFERENCES chart_of_accounts(id),
  is_active BOOLEAN DEFAULT true,
  xero_account_id VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_coa_category ON chart_of_accounts(category);
CREATE INDEX idx_coa_code ON chart_of_accounts(code);

-- ============================================
-- Agency Clients
-- ============================================
CREATE TABLE agency_clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  xero_contact_id VARCHAR(255),
  billing_type VARCHAR(50) NOT NULL CHECK (billing_type IN ('retainer', 'project', 'hybrid', 'commission')),
  retainer_amount DECIMAL(12, 2),
  payment_terms INTEGER DEFAULT 30,
  hourly_rate DECIMAL(10, 2),
  media_commission_rate DECIMAL(5, 2),
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_clients_active ON agency_clients(is_active);
CREATE INDEX idx_clients_xero ON agency_clients(xero_contact_id);

-- ============================================
-- Team Members (for time tracking)
-- ============================================
CREATE TABLE team_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  role VARCHAR(100),
  default_hourly_rate DECIMAL(10, 2),
  target_utilization DECIMAL(5, 2) DEFAULT 75.00,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Projects
-- ============================================
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES agency_clients(id),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  budget_amount DECIMAL(12, 2) NOT NULL,
  budget_type VARCHAR(50) NOT NULL CHECK (budget_type IN ('fixed', 'time_materials', 'retainer_allocation', 'media_commission')),
  start_date DATE NOT NULL,
  end_date DATE,
  status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'on_hold', 'completed', 'cancelled')),
  project_manager_id UUID REFERENCES team_members(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_projects_client ON projects(client_id);
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_dates ON projects(start_date, end_date);

-- ============================================
-- Time Entries
-- ============================================
CREATE TABLE time_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id),
  user_id UUID NOT NULL REFERENCES team_members(id),
  date DATE NOT NULL,
  hours DECIMAL(5, 2) NOT NULL CHECK (hours > 0 AND hours <= 24),
  billable BOOLEAN DEFAULT true,
  hourly_rate DECIMAL(10, 2) NOT NULL,
  description TEXT,
  approved BOOLEAN DEFAULT false,
  invoiced BOOLEAN DEFAULT false,
  invoice_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_time_project ON time_entries(project_id);
CREATE INDEX idx_time_user ON time_entries(user_id);
CREATE INDEX idx_time_date ON time_entries(date);
CREATE INDEX idx_time_billable ON time_entries(billable, invoiced);

-- ============================================
-- Project Expenses
-- ============================================
CREATE TABLE project_expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id),
  client_id UUID REFERENCES agency_clients(id),
  account_code VARCHAR(10) REFERENCES chart_of_accounts(code),
  category VARCHAR(50) NOT NULL CHECK (category IN ('direct_labor', 'contractor', 'media_cost', 'production', 'software', 'travel', 'other')),
  description TEXT NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  billable BOOLEAN DEFAULT true,
  markup DECIMAL(5, 2),
  date DATE NOT NULL,
  vendor_name VARCHAR(255),
  xero_invoice_id VARCHAR(255),
  approved BOOLEAN DEFAULT false,
  invoiced BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_expenses_project ON project_expenses(project_id);
CREATE INDEX idx_expenses_client ON project_expenses(client_id);
CREATE INDEX idx_expenses_date ON project_expenses(date);

-- ============================================
-- Media Spend Tracking
-- ============================================
CREATE TABLE media_spend (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES agency_clients(id),
  project_id UUID REFERENCES projects(id),
  platform VARCHAR(50) NOT NULL CHECK (platform IN ('google_ads', 'meta', 'linkedin', 'tiktok', 'programmatic', 'traditional', 'other')),
  budget_allocated DECIMAL(12, 2) NOT NULL,
  actual_spend DECIMAL(12, 2) DEFAULT 0,
  commission_rate DECIMAL(5, 2) DEFAULT 0,
  commission_amount DECIMAL(12, 2) GENERATED ALWAYS AS (actual_spend * commission_rate / 100) STORED,
  period VARCHAR(7) NOT NULL, -- YYYY-MM format
  reconciled BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_media_client ON media_spend(client_id);
CREATE INDEX idx_media_period ON media_spend(period);
CREATE INDEX idx_media_platform ON media_spend(platform);

-- ============================================
-- Agency Invoices
-- ============================================
CREATE TABLE agency_invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES agency_clients(id),
  project_id UUID REFERENCES projects(id),
  invoice_number VARCHAR(50) NOT NULL UNIQUE,
  xero_invoice_id VARCHAR(255),
  status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'overdue', 'void')),
  issue_date DATE NOT NULL,
  due_date DATE NOT NULL,
  subtotal DECIMAL(12, 2) NOT NULL,
  tax DECIMAL(12, 2) DEFAULT 0,
  total DECIMAL(12, 2) NOT NULL,
  paid_amount DECIMAL(12, 2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_invoices_client ON agency_invoices(client_id);
CREATE INDEX idx_invoices_status ON agency_invoices(status);
CREATE INDEX idx_invoices_dates ON agency_invoices(issue_date, due_date);

-- ============================================
-- Invoice Line Items
-- ============================================
CREATE TABLE agency_invoice_lines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id UUID NOT NULL REFERENCES agency_invoices(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL CHECK (type IN ('time', 'expense', 'retainer', 'media', 'fixed_fee', 'other')),
  description TEXT NOT NULL,
  quantity DECIMAL(10, 2) NOT NULL,
  unit_price DECIMAL(12, 2) NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  account_code VARCHAR(10) REFERENCES chart_of_accounts(code),
  tax_rate DECIMAL(5, 2),
  time_entry_ids UUID[],
  expense_ids UUID[],
  media_spend_ids UUID[]
);

CREATE INDEX idx_invoice_lines_invoice ON agency_invoice_lines(invoice_id);

-- ============================================
-- Retainer Periods
-- ============================================
CREATE TABLE retainer_periods (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES agency_clients(id),
  period VARCHAR(7) NOT NULL, -- YYYY-MM format
  retainer_amount DECIMAL(12, 2) NOT NULL,
  hours_included DECIMAL(8, 2),
  hours_used DECIMAL(8, 2) DEFAULT 0,
  amount_used DECIMAL(12, 2) DEFAULT 0,
  rollover_hours DECIMAL(8, 2) DEFAULT 0,
  rollover_amount DECIMAL(12, 2) DEFAULT 0,
  status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'invoiced', 'closed')),
  invoice_id UUID REFERENCES agency_invoices(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id, period)
);

CREATE INDEX idx_retainer_client ON retainer_periods(client_id);
CREATE INDEX idx_retainer_period ON retainer_periods(period);

-- ============================================
-- Session/Token Storage (for Xero OAuth)
-- ============================================
CREATE TABLE xero_sessions (
  session_id VARCHAR(255) PRIMARY KEY,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  id_token TEXT,
  expires_at BIGINT NOT NULL,
  scope TEXT,
  token_type VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE xero_tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id VARCHAR(255) NOT NULL,
  tenant_id VARCHAR(255) NOT NULL,
  tenant_name VARCHAR(255),
  tenant_type VARCHAR(50),
  is_selected BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(session_id, tenant_id)
);

-- ============================================
-- Views for Reporting
-- ============================================

-- Project Profitability View
CREATE OR REPLACE VIEW v_project_profitability AS
SELECT
  p.id AS project_id,
  p.name AS project_name,
  c.name AS client_name,
  p.budget_amount AS budget,
  COALESCE(t.labor_cost, 0) AS labor_cost,
  COALESCE(e.expense_cost, 0) AS expense_cost,
  COALESCE(m.media_cost, 0) AS media_cost,
  COALESCE(t.labor_cost, 0) + COALESCE(e.expense_cost, 0) + COALESCE(m.media_cost, 0) AS total_cost,
  p.budget_amount AS revenue, -- simplified; actual revenue tracking may differ
  p.budget_amount - (COALESCE(t.labor_cost, 0) + COALESCE(e.expense_cost, 0) + COALESCE(m.media_cost, 0)) AS gross_profit,
  CASE
    WHEN p.budget_amount > 0
    THEN ((p.budget_amount - (COALESCE(t.labor_cost, 0) + COALESCE(e.expense_cost, 0) + COALESCE(m.media_cost, 0))) / p.budget_amount * 100)
    ELSE 0
  END AS gross_margin,
  COALESCE(t.hours_worked, 0) AS hours_worked,
  CASE
    WHEN COALESCE(t.hours_worked, 0) > 0
    THEN p.budget_amount / t.hours_worked
    ELSE 0
  END AS effective_rate,
  p.status
FROM projects p
JOIN agency_clients c ON p.client_id = c.id
LEFT JOIN (
  SELECT project_id, SUM(hours * hourly_rate) AS labor_cost, SUM(hours) AS hours_worked
  FROM time_entries
  GROUP BY project_id
) t ON p.id = t.project_id
LEFT JOIN (
  SELECT project_id, SUM(amount) AS expense_cost
  FROM project_expenses
  WHERE project_id IS NOT NULL
  GROUP BY project_id
) e ON p.id = e.project_id
LEFT JOIN (
  SELECT project_id, SUM(actual_spend) AS media_cost
  FROM media_spend
  WHERE project_id IS NOT NULL
  GROUP BY project_id
) m ON p.id = m.project_id;

-- Utilization View
CREATE OR REPLACE VIEW v_utilization AS
SELECT
  tm.id AS user_id,
  tm.name AS user_name,
  TO_CHAR(te.date, 'YYYY-MM') AS period,
  SUM(te.hours) AS total_hours,
  SUM(CASE WHEN te.billable THEN te.hours ELSE 0 END) AS billable_hours,
  SUM(CASE WHEN NOT te.billable THEN te.hours ELSE 0 END) AS non_billable_hours,
  CASE
    WHEN SUM(te.hours) > 0
    THEN (SUM(CASE WHEN te.billable THEN te.hours ELSE 0 END) / SUM(te.hours) * 100)
    ELSE 0
  END AS utilization_rate,
  tm.target_utilization,
  SUM(CASE WHEN te.billable THEN te.hours * te.hourly_rate ELSE 0 END) AS billable_revenue,
  CASE
    WHEN SUM(CASE WHEN te.billable THEN te.hours ELSE 0 END) > 0
    THEN SUM(CASE WHEN te.billable THEN te.hours * te.hourly_rate ELSE 0 END) / SUM(CASE WHEN te.billable THEN te.hours ELSE 0 END)
    ELSE 0
  END AS effective_rate
FROM team_members tm
LEFT JOIN time_entries te ON tm.id = te.user_id
GROUP BY tm.id, tm.name, tm.target_utilization, TO_CHAR(te.date, 'YYYY-MM');

-- ============================================
-- Triggers for updated_at
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON agency_clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_media_spend_updated_at BEFORE UPDATE ON media_spend
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON agency_invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_coa_updated_at BEFORE UPDATE ON chart_of_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_xero_sessions_updated_at BEFORE UPDATE ON xero_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
