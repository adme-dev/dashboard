-- Invoicing System Schema
-- Run this after the base agency schema

-- Invoice status enum-like constraint
-- Statuses: draft, sent, viewed, paid, overdue, cancelled, partially_paid

-- Invoices table
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_number VARCHAR(50) UNIQUE NOT NULL,
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE RESTRICT,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,

  -- Dates
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL,
  paid_date DATE,

  -- Amounts
  subtotal DECIMAL(12, 2) NOT NULL DEFAULT 0,
  tax_rate DECIMAL(5, 2) DEFAULT 0,
  tax_amount DECIMAL(12, 2) DEFAULT 0,
  discount_amount DECIMAL(12, 2) DEFAULT 0,
  discount_percent DECIMAL(5, 2) DEFAULT 0,
  total_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
  amount_paid DECIMAL(12, 2) DEFAULT 0,
  amount_due DECIMAL(12, 2) GENERATED ALWAYS AS (total_amount - COALESCE(amount_paid, 0)) STORED,

  -- Currency
  currency VARCHAR(3) DEFAULT 'USD',

  -- Status
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'viewed', 'paid', 'overdue', 'cancelled', 'partially_paid')),

  -- Payment terms
  payment_terms VARCHAR(50) DEFAULT 'net_30',

  -- Notes and terms
  notes TEXT,
  terms TEXT,
  footer TEXT,

  -- Billing info snapshot (captured at invoice creation)
  billing_name VARCHAR(255),
  billing_email VARCHAR(255),
  billing_address TEXT,
  billing_phone VARCHAR(50),

  -- Metadata
  created_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  sent_at TIMESTAMPTZ,
  viewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Invoice line items
CREATE TABLE IF NOT EXISTS invoice_line_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,

  -- Item details
  description TEXT NOT NULL,
  quantity DECIMAL(10, 2) NOT NULL DEFAULT 1,
  unit_price DECIMAL(12, 2) NOT NULL DEFAULT 0,
  amount DECIMAL(12, 2) GENERATED ALWAYS AS (quantity * unit_price) STORED,

  -- Optional references
  time_entry_id UUID REFERENCES time_entries(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,

  -- Line item type
  item_type VARCHAR(20) DEFAULT 'service' CHECK (item_type IN ('service', 'expense', 'product', 'discount', 'tax', 'other')),

  -- Taxable
  taxable BOOLEAN DEFAULT true,

  -- Sort order
  sort_order INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Payments table
CREATE TABLE IF NOT EXISTS invoice_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,

  -- Payment details
  amount DECIMAL(12, 2) NOT NULL,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method VARCHAR(50), -- 'credit_card', 'bank_transfer', 'check', 'cash', 'paypal', 'stripe', etc.

  -- Reference
  reference_number VARCHAR(100),
  transaction_id VARCHAR(255),

  -- Notes
  notes TEXT,

  -- Metadata
  recorded_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Invoice templates
CREATE TABLE IF NOT EXISTS invoice_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  description TEXT,

  -- Template content
  header_text TEXT,
  footer_text TEXT,
  terms_text TEXT,

  -- Default values
  default_tax_rate DECIMAL(5, 2) DEFAULT 0,
  default_payment_terms VARCHAR(50) DEFAULT 'net_30',

  -- Styling
  logo_url VARCHAR(500),
  accent_color VARCHAR(7) DEFAULT '#3B82F6',

  -- Status
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Recurring invoices
CREATE TABLE IF NOT EXISTS recurring_invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  template_id UUID REFERENCES invoice_templates(id) ON DELETE SET NULL,

  -- Schedule
  frequency VARCHAR(20) NOT NULL CHECK (frequency IN ('weekly', 'biweekly', 'monthly', 'quarterly', 'annually')),
  start_date DATE NOT NULL,
  end_date DATE,
  next_invoice_date DATE,

  -- Invoice defaults
  default_line_items JSONB DEFAULT '[]',
  tax_rate DECIMAL(5, 2) DEFAULT 0,
  payment_terms VARCHAR(50) DEFAULT 'net_30',
  notes TEXT,

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Stats
  invoices_generated INTEGER DEFAULT 0,
  last_generated_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Invoice number sequence
CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START 1001;

-- Function to generate invoice number
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS VARCHAR(50) AS $$
DECLARE
  year_prefix VARCHAR(4);
  seq_num INTEGER;
BEGIN
  year_prefix := TO_CHAR(CURRENT_DATE, 'YYYY');
  seq_num := nextval('invoice_number_seq');
  RETURN 'INV-' || year_prefix || '-' || LPAD(seq_num::TEXT, 5, '0');
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-generate invoice number
CREATE OR REPLACE FUNCTION set_invoice_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.invoice_number IS NULL OR NEW.invoice_number = '' THEN
    NEW.invoice_number := generate_invoice_number();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_invoice_number ON invoices;
CREATE TRIGGER trigger_set_invoice_number
  BEFORE INSERT ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION set_invoice_number();

-- Trigger to update invoice totals
CREATE OR REPLACE FUNCTION update_invoice_totals()
RETURNS TRIGGER AS $$
DECLARE
  new_subtotal DECIMAL(12, 2);
  new_tax_amount DECIMAL(12, 2);
  inv_tax_rate DECIMAL(5, 2);
  inv_discount_amount DECIMAL(12, 2);
BEGIN
  -- Get invoice tax rate and discount
  SELECT tax_rate, discount_amount INTO inv_tax_rate, inv_discount_amount
  FROM invoices WHERE id = COALESCE(NEW.invoice_id, OLD.invoice_id);

  -- Calculate new subtotal
  SELECT COALESCE(SUM(quantity * unit_price), 0) INTO new_subtotal
  FROM invoice_line_items
  WHERE invoice_id = COALESCE(NEW.invoice_id, OLD.invoice_id);

  -- Calculate tax on taxable items
  SELECT COALESCE(SUM(quantity * unit_price * inv_tax_rate / 100), 0) INTO new_tax_amount
  FROM invoice_line_items
  WHERE invoice_id = COALESCE(NEW.invoice_id, OLD.invoice_id) AND taxable = true;

  -- Update invoice
  UPDATE invoices
  SET
    subtotal = new_subtotal,
    tax_amount = new_tax_amount,
    total_amount = new_subtotal + new_tax_amount - COALESCE(inv_discount_amount, 0),
    updated_at = NOW()
  WHERE id = COALESCE(NEW.invoice_id, OLD.invoice_id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_invoice_totals ON invoice_line_items;
CREATE TRIGGER trigger_update_invoice_totals
  AFTER INSERT OR UPDATE OR DELETE ON invoice_line_items
  FOR EACH ROW
  EXECUTE FUNCTION update_invoice_totals();

-- Trigger to update payment totals
CREATE OR REPLACE FUNCTION update_invoice_payment_totals()
RETURNS TRIGGER AS $$
DECLARE
  total_paid DECIMAL(12, 2);
  inv_total DECIMAL(12, 2);
BEGIN
  -- Calculate total paid
  SELECT COALESCE(SUM(amount), 0) INTO total_paid
  FROM invoice_payments
  WHERE invoice_id = COALESCE(NEW.invoice_id, OLD.invoice_id);

  -- Get invoice total
  SELECT total_amount INTO inv_total
  FROM invoices WHERE id = COALESCE(NEW.invoice_id, OLD.invoice_id);

  -- Update invoice
  UPDATE invoices
  SET
    amount_paid = total_paid,
    status = CASE
      WHEN total_paid >= inv_total THEN 'paid'
      WHEN total_paid > 0 THEN 'partially_paid'
      ELSE status
    END,
    paid_date = CASE
      WHEN total_paid >= inv_total THEN CURRENT_DATE
      ELSE paid_date
    END,
    updated_at = NOW()
  WHERE id = COALESCE(NEW.invoice_id, OLD.invoice_id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_invoice_payment_totals ON invoice_payments;
CREATE TRIGGER trigger_update_invoice_payment_totals
  AFTER INSERT OR UPDATE OR DELETE ON invoice_payments
  FOR EACH ROW
  EXECUTE FUNCTION update_invoice_payment_totals();

-- View for invoice summary
CREATE OR REPLACE VIEW v_invoice_summary AS
SELECT
  i.id,
  i.invoice_number,
  i.client_id,
  c.name as client_name,
  i.project_id,
  p.name as project_name,
  i.issue_date,
  i.due_date,
  i.paid_date,
  i.subtotal,
  i.tax_amount,
  i.total_amount,
  i.amount_paid,
  i.amount_due,
  i.status,
  i.currency,
  i.created_at,
  CASE
    WHEN i.status = 'paid' THEN 0
    WHEN i.due_date < CURRENT_DATE AND i.status NOT IN ('paid', 'cancelled') THEN CURRENT_DATE - i.due_date
    ELSE 0
  END as days_overdue,
  (SELECT COUNT(*) FROM invoice_line_items WHERE invoice_id = i.id) as line_item_count,
  (SELECT COUNT(*) FROM invoice_payments WHERE invoice_id = i.id) as payment_count
FROM invoices i
JOIN agency_clients c ON i.client_id = c.id
LEFT JOIN projects p ON i.project_id = p.id;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_invoices_client ON invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_project ON invoices(project_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_invoices_issue_date ON invoices(issue_date);
CREATE INDEX IF NOT EXISTS idx_invoice_line_items_invoice ON invoice_line_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_payments_invoice ON invoice_payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_recurring_invoices_next_date ON recurring_invoices(next_invoice_date) WHERE is_active = true;

-- Insert default template
INSERT INTO invoice_templates (name, description, is_default, terms_text, footer_text)
VALUES (
  'Standard Invoice',
  'Default invoice template',
  true,
  'Payment is due within the specified terms. Late payments may incur additional fees.',
  'Thank you for your business!'
) ON CONFLICT DO NOTHING;
