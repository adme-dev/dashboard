-- ============================================
-- Expense Management Schema
-- Full expense tracking with approval workflow, receipts, and reimbursements
-- ============================================

-- ============================================
-- Expense Categories
-- ============================================
CREATE TABLE IF NOT EXISTS expense_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  code VARCHAR(20) UNIQUE,
  description TEXT,
  parent_id UUID REFERENCES expense_categories(id),
  gl_account VARCHAR(20), -- General ledger account code
  is_billable_default BOOLEAN DEFAULT false,
  requires_receipt BOOLEAN DEFAULT true,
  daily_limit DECIMAL(12, 2),
  per_transaction_limit DECIMAL(12, 2),
  requires_approval_above DECIMAL(12, 2),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expense_categories_parent ON expense_categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_expense_categories_code ON expense_categories(code);

-- Default expense categories
INSERT INTO expense_categories (name, code, description, is_billable_default, requires_receipt, requires_approval_above) VALUES
  ('Travel', 'TRAVEL', 'Business travel expenses', true, true, 500),
  ('Meals & Entertainment', 'MEALS', 'Client and team meals', true, true, 100),
  ('Software & Subscriptions', 'SOFTWARE', 'Software licenses and subscriptions', false, true, 200),
  ('Office Supplies', 'OFFICE', 'General office supplies', false, true, null),
  ('Equipment', 'EQUIP', 'Computer and office equipment', false, true, 500),
  ('Professional Services', 'PROF', 'Contractors and consultants', true, true, 1000),
  ('Marketing & Advertising', 'MARKETING', 'Marketing and promotional expenses', true, true, 500),
  ('Shipping & Postage', 'SHIPPING', 'Shipping and delivery costs', true, true, null),
  ('Training & Education', 'TRAINING', 'Training courses and certifications', false, true, 500),
  ('Miscellaneous', 'MISC', 'Other business expenses', false, true, 100)
ON CONFLICT (code) DO NOTHING;

-- ============================================
-- Expenses (Main Table)
-- ============================================
CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Who and what
  user_id UUID NOT NULL REFERENCES team_members(id),
  category_id UUID NOT NULL REFERENCES expense_categories(id),

  -- Allocation
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  client_id UUID REFERENCES agency_clients(id) ON DELETE SET NULL,
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,

  -- Financial
  amount DECIMAL(12, 2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'USD',
  exchange_rate DECIMAL(10, 6) DEFAULT 1.0,
  amount_usd DECIMAL(12, 2) GENERATED ALWAYS AS (amount * exchange_rate) STORED,
  tax_amount DECIMAL(12, 2) DEFAULT 0,
  total_amount DECIMAL(12, 2) GENERATED ALWAYS AS (amount + COALESCE(tax_amount, 0)) STORED,

  -- Details
  merchant VARCHAR(255),
  description TEXT NOT NULL,
  expense_date DATE NOT NULL,

  -- Billing
  billable BOOLEAN DEFAULT false,
  invoiced BOOLEAN DEFAULT false,
  invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,

  -- Status & Approval
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'pending_approval', 'approved', 'rejected', 'paid', 'cancelled')),
  submitted_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES team_members(id),
  rejection_reason TEXT,

  -- Reimbursement
  payment_method VARCHAR(50) CHECK (payment_method IN ('corporate_card', 'personal_card', 'cash', 'bank_transfer', 'petty_cash', 'other')),
  reimbursable BOOLEAN DEFAULT true,
  reimbursed BOOLEAN DEFAULT false,
  reimbursed_at TIMESTAMPTZ,
  reimbursement_reference VARCHAR(100),

  -- Receipt
  has_receipt BOOLEAN DEFAULT false,
  receipt_url TEXT,
  receipt_thumbnail_url TEXT,

  -- Metadata
  notes TEXT,
  tags TEXT[],
  external_id VARCHAR(100), -- For sync with accounting systems

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expenses_user ON expenses(user_id);
CREATE INDEX IF NOT EXISTS idx_expenses_project ON expenses(project_id);
CREATE INDEX IF NOT EXISTS idx_expenses_client ON expenses(client_id);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category_id);
CREATE INDEX IF NOT EXISTS idx_expenses_status ON expenses(status);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_reimbursable ON expenses(reimbursable, reimbursed) WHERE reimbursable = true;

-- ============================================
-- Expense Receipts (Multiple per expense)
-- ============================================
CREATE TABLE IF NOT EXISTS expense_receipts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  file_type VARCHAR(50), -- image/jpeg, image/png, application/pdf
  file_size INTEGER,
  file_url TEXT NOT NULL,
  thumbnail_url TEXT,

  -- OCR extraction
  ocr_processed BOOLEAN DEFAULT false,
  ocr_vendor VARCHAR(255),
  ocr_amount DECIMAL(12, 2),
  ocr_date DATE,
  ocr_confidence DECIMAL(5, 2),

  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  uploaded_by UUID REFERENCES team_members(id)
);

CREATE INDEX IF NOT EXISTS idx_expense_receipts_expense ON expense_receipts(expense_id);

-- ============================================
-- Expense Reports (Group expenses for submission)
-- ============================================
CREATE TABLE IF NOT EXISTS expense_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  report_number VARCHAR(50) UNIQUE,
  user_id UUID NOT NULL REFERENCES team_members(id),
  title VARCHAR(255) NOT NULL,
  description TEXT,

  -- Period
  period_start DATE,
  period_end DATE,

  -- Totals (auto-calculated)
  total_amount DECIMAL(12, 2) DEFAULT 0,
  billable_amount DECIMAL(12, 2) DEFAULT 0,
  reimbursable_amount DECIMAL(12, 2) DEFAULT 0,
  expense_count INTEGER DEFAULT 0,

  -- Approval workflow
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'pending_approval', 'approved', 'rejected', 'paid', 'cancelled')),
  submitted_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES team_members(id),
  rejection_reason TEXT,

  -- Payment
  paid_at TIMESTAMPTZ,
  payment_reference VARCHAR(100),
  payment_method VARCHAR(50),

  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expense_reports_user ON expense_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_expense_reports_status ON expense_reports(status);

-- Report number sequence
CREATE SEQUENCE IF NOT EXISTS expense_report_number_seq START 1;

CREATE OR REPLACE FUNCTION generate_expense_report_number()
RETURNS VARCHAR(50) AS $$
BEGIN
  RETURN 'EXP-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || LPAD(nextval('expense_report_number_seq')::TEXT, 5, '0');
END;
$$ LANGUAGE plpgsql;

-- Auto-generate report number
CREATE OR REPLACE FUNCTION set_expense_report_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.report_number IS NULL THEN
    NEW.report_number := generate_expense_report_number();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_expense_report_number ON expense_reports;
CREATE TRIGGER trigger_set_expense_report_number
  BEFORE INSERT ON expense_reports
  FOR EACH ROW EXECUTE FUNCTION set_expense_report_number();

-- ============================================
-- Expense Report Items (Link expenses to reports)
-- ============================================
CREATE TABLE IF NOT EXISTS expense_report_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  report_id UUID NOT NULL REFERENCES expense_reports(id) ON DELETE CASCADE,
  expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(report_id, expense_id)
);

CREATE INDEX IF NOT EXISTS idx_expense_report_items_report ON expense_report_items(report_id);
CREATE INDEX IF NOT EXISTS idx_expense_report_items_expense ON expense_report_items(expense_id);

-- ============================================
-- Expense Approval Rules
-- ============================================
CREATE TABLE IF NOT EXISTS expense_approval_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  description TEXT,

  -- Conditions
  min_amount DECIMAL(12, 2),
  max_amount DECIMAL(12, 2),
  category_id UUID REFERENCES expense_categories(id),
  department_id UUID REFERENCES departments(id),

  -- Approval chain
  approver_id UUID REFERENCES team_members(id), -- Specific approver
  approver_role VARCHAR(50), -- Or role-based (manager, finance, director)
  approval_level INTEGER DEFAULT 1, -- For multi-level approval

  is_active BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 0, -- Higher priority rules checked first

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expense_approval_rules_category ON expense_approval_rules(category_id);
CREATE INDEX IF NOT EXISTS idx_expense_approval_rules_amount ON expense_approval_rules(min_amount, max_amount);

-- ============================================
-- Expense Policies
-- ============================================
CREATE TABLE IF NOT EXISTS expense_policies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  description TEXT,

  -- Limits
  daily_limit DECIMAL(12, 2),
  weekly_limit DECIMAL(12, 2),
  monthly_limit DECIMAL(12, 2),
  per_transaction_limit DECIMAL(12, 2),

  -- Rules
  requires_receipt_above DECIMAL(12, 2) DEFAULT 25,
  auto_approve_below DECIMAL(12, 2),

  -- Scope
  applies_to_all BOOLEAN DEFAULT true,
  department_id UUID REFERENCES departments(id),

  is_active BOOLEAN DEFAULT true,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Mileage Tracking
-- ============================================
CREATE TABLE IF NOT EXISTS mileage_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  expense_id UUID REFERENCES expenses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES team_members(id),

  -- Trip details
  trip_date DATE NOT NULL,
  origin VARCHAR(255) NOT NULL,
  destination VARCHAR(255) NOT NULL,
  purpose TEXT,

  -- Distance
  distance_miles DECIMAL(8, 2) NOT NULL,
  rate_per_mile DECIMAL(6, 4) DEFAULT 0.67, -- IRS standard rate
  total_amount DECIMAL(12, 2) GENERATED ALWAYS AS (distance_miles * rate_per_mile) STORED,

  -- Optional GPS data
  origin_coords POINT,
  destination_coords POINT,

  -- Vehicle
  vehicle_type VARCHAR(50) DEFAULT 'personal' CHECK (vehicle_type IN ('personal', 'company', 'rental')),

  billable BOOLEAN DEFAULT false,
  project_id UUID REFERENCES projects(id),
  client_id UUID REFERENCES agency_clients(id),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mileage_entries_user ON mileage_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_mileage_entries_date ON mileage_entries(trip_date);

-- ============================================
-- Views
-- ============================================

-- Expense Summary by User
DROP VIEW IF EXISTS v_expense_summary_by_user;
CREATE VIEW v_expense_summary_by_user AS
SELECT
  e.user_id,
  tm.name AS user_name,
  tm.email AS user_email,
  DATE_TRUNC('month', e.expense_date)::DATE AS month,
  COUNT(e.id) AS expense_count,
  SUM(e.total_amount) AS total_amount,
  SUM(CASE WHEN e.billable THEN e.total_amount ELSE 0 END) AS billable_amount,
  SUM(CASE WHEN e.reimbursable AND NOT e.reimbursed THEN e.total_amount ELSE 0 END) AS pending_reimbursement,
  SUM(CASE WHEN e.status = 'pending_approval' THEN e.total_amount ELSE 0 END) AS pending_approval,
  COUNT(CASE WHEN e.status = 'rejected' THEN 1 END) AS rejected_count,
  COUNT(CASE WHEN NOT e.has_receipt AND e.total_amount >= 25 THEN 1 END) AS missing_receipts
FROM expenses e
JOIN team_members tm ON e.user_id = tm.id
GROUP BY e.user_id, tm.name, tm.email, DATE_TRUNC('month', e.expense_date);

-- Expense Summary by Project
DROP VIEW IF EXISTS v_expense_summary_by_project;
CREATE VIEW v_expense_summary_by_project AS
SELECT
  e.project_id,
  p.name AS project_name,
  c.id AS client_id,
  c.name AS client_name,
  COUNT(e.id) AS expense_count,
  SUM(e.total_amount) AS total_expenses,
  SUM(CASE WHEN e.billable THEN e.total_amount ELSE 0 END) AS billable_expenses,
  SUM(CASE WHEN e.invoiced THEN e.total_amount ELSE 0 END) AS invoiced_expenses,
  SUM(CASE WHEN e.billable AND NOT e.invoiced THEN e.total_amount ELSE 0 END) AS uninvoiced_expenses
FROM expenses e
JOIN projects p ON e.project_id = p.id
JOIN agency_clients c ON p.client_id = c.id
WHERE e.status = 'approved'
GROUP BY e.project_id, p.name, c.id, c.name;

-- Pending Approvals View
DROP VIEW IF EXISTS v_pending_expense_approvals;
CREATE VIEW v_pending_expense_approvals AS
SELECT
  e.id,
  e.expense_date,
  e.merchant,
  e.description,
  e.total_amount,
  e.status,
  e.submitted_at,
  e.has_receipt,
  ec.name AS category_name,
  tm.id AS user_id,
  tm.name AS user_name,
  tm.email AS user_email,
  p.name AS project_name,
  c.name AS client_name,
  EXTRACT(DAY FROM NOW() - e.submitted_at) AS days_pending
FROM expenses e
JOIN team_members tm ON e.user_id = tm.id
JOIN expense_categories ec ON e.category_id = ec.id
LEFT JOIN projects p ON e.project_id = p.id
LEFT JOIN agency_clients c ON e.client_id = c.id
WHERE e.status IN ('submitted', 'pending_approval')
ORDER BY e.submitted_at ASC;

-- ============================================
-- Triggers
-- ============================================

-- Update expense report totals when items change
CREATE OR REPLACE FUNCTION update_expense_report_totals()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE expense_reports er
  SET
    total_amount = COALESCE((
      SELECT SUM(e.total_amount)
      FROM expense_report_items eri
      JOIN expenses e ON eri.expense_id = e.id
      WHERE eri.report_id = COALESCE(NEW.report_id, OLD.report_id)
    ), 0),
    billable_amount = COALESCE((
      SELECT SUM(e.total_amount)
      FROM expense_report_items eri
      JOIN expenses e ON eri.expense_id = e.id
      WHERE eri.report_id = COALESCE(NEW.report_id, OLD.report_id)
        AND e.billable = true
    ), 0),
    reimbursable_amount = COALESCE((
      SELECT SUM(e.total_amount)
      FROM expense_report_items eri
      JOIN expenses e ON eri.expense_id = e.id
      WHERE eri.report_id = COALESCE(NEW.report_id, OLD.report_id)
        AND e.reimbursable = true
    ), 0),
    expense_count = COALESCE((
      SELECT COUNT(*)
      FROM expense_report_items
      WHERE report_id = COALESCE(NEW.report_id, OLD.report_id)
    ), 0),
    updated_at = NOW()
  WHERE id = COALESCE(NEW.report_id, OLD.report_id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_expense_report_totals ON expense_report_items;
CREATE TRIGGER trigger_update_expense_report_totals
  AFTER INSERT OR DELETE ON expense_report_items
  FOR EACH ROW EXECUTE FUNCTION update_expense_report_totals();

-- Update primary receipt URL on expense
CREATE OR REPLACE FUNCTION update_expense_receipt_flag()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE expenses SET
      has_receipt = true,
      receipt_url = COALESCE(receipt_url, NEW.file_url),
      receipt_thumbnail_url = COALESCE(receipt_thumbnail_url, NEW.thumbnail_url),
      updated_at = NOW()
    WHERE id = NEW.expense_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE expenses SET
      has_receipt = EXISTS(SELECT 1 FROM expense_receipts WHERE expense_id = OLD.expense_id AND id != OLD.id),
      updated_at = NOW()
    WHERE id = OLD.expense_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_expense_receipt ON expense_receipts;
CREATE TRIGGER trigger_update_expense_receipt
  AFTER INSERT OR DELETE ON expense_receipts
  FOR EACH ROW EXECUTE FUNCTION update_expense_receipt_flag();

-- Updated timestamp trigger
CREATE TRIGGER update_expenses_updated_at BEFORE UPDATE ON expenses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_expense_reports_updated_at BEFORE UPDATE ON expense_reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_expense_categories_updated_at BEFORE UPDATE ON expense_categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
