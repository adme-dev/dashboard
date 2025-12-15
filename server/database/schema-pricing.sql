-- ============================================
-- Pricing & Quotes Schema
-- ============================================

-- ============================================
-- Quote Status Enum
-- ============================================
DO $$ BEGIN
  CREATE TYPE quote_status AS ENUM ('draft', 'pending', 'sent', 'viewed', 'accepted', 'rejected', 'expired', 'revised');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ============================================
-- Line Item Type Enum
-- ============================================
DO $$ BEGIN
  CREATE TYPE line_item_type AS ENUM ('service', 'product', 'hourly', 'fixed', 'retainer', 'media_spend', 'production', 'licensing', 'other');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ============================================
-- Quotes Table (Client Proposals)
-- ============================================
CREATE TABLE IF NOT EXISTS quotes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quote_number VARCHAR(20) NOT NULL UNIQUE,
  brief_id UUID REFERENCES briefs(id) ON DELETE SET NULL,
  client_id UUID REFERENCES agency_clients(id),
  project_id UUID REFERENCES projects(id),

  -- Quote Details
  title VARCHAR(255) NOT NULL,
  description TEXT,

  -- Validity
  valid_from DATE DEFAULT CURRENT_DATE,
  valid_until DATE,

  -- Status Tracking
  status quote_status DEFAULT 'draft',
  sent_at TIMESTAMPTZ,
  viewed_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,

  -- Pricing Summary
  subtotal NUMERIC(12, 2) DEFAULT 0,
  discount_percent NUMERIC(5, 2) DEFAULT 0,
  discount_amount NUMERIC(12, 2) DEFAULT 0,
  tax_percent NUMERIC(5, 2) DEFAULT 0,
  tax_amount NUMERIC(12, 2) DEFAULT 0,
  total NUMERIC(12, 2) DEFAULT 0,
  currency VARCHAR(3) DEFAULT 'USD',

  -- Terms & Conditions
  terms TEXT,
  payment_terms VARCHAR(255), -- e.g., "50% upfront, 50% on completion"
  notes TEXT, -- Internal notes (not visible to client)
  client_notes TEXT, -- Notes for client

  -- Revision Tracking
  version INTEGER DEFAULT 1,
  parent_quote_id UUID REFERENCES quotes(id), -- For revised quotes

  -- Ownership
  created_by UUID REFERENCES team_members(id),
  assigned_to UUID REFERENCES team_members(id),
  approved_by UUID REFERENCES team_members(id),
  approved_at TIMESTAMPTZ,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quotes_number ON quotes(quote_number);
CREATE INDEX IF NOT EXISTS idx_quotes_brief ON quotes(brief_id);
CREATE INDEX IF NOT EXISTS idx_quotes_client ON quotes(client_id);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status);
CREATE INDEX IF NOT EXISTS idx_quotes_created_by ON quotes(created_by);
CREATE INDEX IF NOT EXISTS idx_quotes_created ON quotes(created_at DESC);

-- ============================================
-- Quote Line Items
-- ============================================
CREATE TABLE IF NOT EXISTS quote_line_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,

  -- Item Details
  item_type line_item_type DEFAULT 'service',
  name VARCHAR(255) NOT NULL,
  description TEXT,

  -- Pricing
  quantity NUMERIC(10, 2) DEFAULT 1,
  unit VARCHAR(50) DEFAULT 'unit', -- hour, day, unit, project, etc.
  unit_price NUMERIC(12, 2) NOT NULL,
  discount_percent NUMERIC(5, 2) DEFAULT 0,
  line_total NUMERIC(12, 2) NOT NULL,

  -- For hourly items
  estimated_hours NUMERIC(10, 2),
  hourly_rate NUMERIC(12, 2),

  -- For media spend
  media_platform VARCHAR(100),
  media_budget NUMERIC(12, 2),
  agency_fee_percent NUMERIC(5, 2),

  -- Grouping
  category VARCHAR(100),
  sort_order INTEGER DEFAULT 0,

  -- Optional flag
  is_optional BOOLEAN DEFAULT false,
  is_included BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quote_items_quote ON quote_line_items(quote_id);
CREATE INDEX IF NOT EXISTS idx_quote_items_type ON quote_line_items(item_type);

-- ============================================
-- Job Pricing (Approved/Active Pricing)
-- ============================================
-- When a quote is accepted, the pricing becomes "job pricing"
CREATE TABLE IF NOT EXISTS job_pricing (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  brief_id UUID REFERENCES briefs(id) ON DELETE SET NULL,
  quote_id UUID REFERENCES quotes(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id),
  client_id UUID REFERENCES agency_clients(id),

  -- Pricing Type
  pricing_type VARCHAR(50) DEFAULT 'fixed', -- fixed, hourly, retainer, milestone

  -- Budget
  agreed_total NUMERIC(12, 2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'USD',

  -- For hourly/retainer
  hourly_rate NUMERIC(12, 2),
  monthly_retainer NUMERIC(12, 2),
  hours_included INTEGER,
  overage_rate NUMERIC(12, 2),

  -- Tracking
  invoiced_amount NUMERIC(12, 2) DEFAULT 0,
  paid_amount NUMERIC(12, 2) DEFAULT 0,
  remaining_amount NUMERIC(12, 2) GENERATED ALWAYS AS (agreed_total - invoiced_amount) STORED,

  -- Status
  is_active BOOLEAN DEFAULT true,
  approved_at TIMESTAMPTZ DEFAULT NOW(),
  approved_by UUID REFERENCES team_members(id),

  -- Notes
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_pricing_brief ON job_pricing(brief_id);
CREATE INDEX IF NOT EXISTS idx_job_pricing_quote ON job_pricing(quote_id);
CREATE INDEX IF NOT EXISTS idx_job_pricing_project ON job_pricing(project_id);
CREATE INDEX IF NOT EXISTS idx_job_pricing_client ON job_pricing(client_id);
CREATE INDEX IF NOT EXISTS idx_job_pricing_active ON job_pricing(is_active);

-- ============================================
-- Price Templates (Reusable pricing items)
-- ============================================
CREATE TABLE IF NOT EXISTS price_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Template Details
  name VARCHAR(255) NOT NULL,
  description TEXT,
  item_type line_item_type DEFAULT 'service',
  category VARCHAR(100),

  -- Default Pricing
  default_unit VARCHAR(50) DEFAULT 'unit',
  default_unit_price NUMERIC(12, 2),
  default_hourly_rate NUMERIC(12, 2),

  -- For media spend templates
  default_agency_fee_percent NUMERIC(5, 2),

  -- Metadata
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES team_members(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_price_templates_type ON price_templates(item_type);
CREATE INDEX IF NOT EXISTS idx_price_templates_category ON price_templates(category);
CREATE INDEX IF NOT EXISTS idx_price_templates_active ON price_templates(is_active);

-- ============================================
-- Quote Generation Function
-- ============================================
CREATE OR REPLACE FUNCTION generate_quote_number()
RETURNS TRIGGER AS $$
DECLARE
  year_prefix VARCHAR(4);
  next_num INTEGER;
BEGIN
  year_prefix := TO_CHAR(CURRENT_DATE, 'YYYY');

  SELECT COALESCE(MAX(CAST(SUBSTRING(quote_number FROM 6) AS INTEGER)), 0) + 1
  INTO next_num
  FROM quotes
  WHERE quote_number LIKE 'Q-' || year_prefix || '-%';

  NEW.quote_number := 'Q-' || year_prefix || '-' || LPAD(next_num::TEXT, 5, '0');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trigger_generate_quote_number
  BEFORE INSERT ON quotes
  FOR EACH ROW
  WHEN (NEW.quote_number IS NULL)
  EXECUTE FUNCTION generate_quote_number();

-- ============================================
-- Quote Total Calculation Function
-- ============================================
CREATE OR REPLACE FUNCTION calculate_quote_totals()
RETURNS TRIGGER AS $$
DECLARE
  v_subtotal NUMERIC(12, 2);
BEGIN
  -- Calculate subtotal from included line items
  SELECT COALESCE(SUM(line_total), 0)
  INTO v_subtotal
  FROM quote_line_items
  WHERE quote_id = NEW.quote_id AND is_included = true;

  -- Update the quote totals
  UPDATE quotes
  SET
    subtotal = v_subtotal,
    discount_amount = v_subtotal * (discount_percent / 100),
    tax_amount = (v_subtotal - (v_subtotal * (discount_percent / 100))) * (tax_percent / 100),
    total = (v_subtotal - (v_subtotal * (discount_percent / 100))) * (1 + (tax_percent / 100)),
    updated_at = NOW()
  WHERE id = NEW.quote_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trigger_calculate_quote_totals
  AFTER INSERT OR UPDATE OR DELETE ON quote_line_items
  FOR EACH ROW
  EXECUTE FUNCTION calculate_quote_totals();

-- ============================================
-- Quote to Job Pricing Conversion Function
-- ============================================
CREATE OR REPLACE FUNCTION convert_quote_to_job_pricing(p_quote_id UUID, p_approved_by UUID)
RETURNS UUID AS $$
DECLARE
  v_job_pricing_id UUID;
  v_quote RECORD;
BEGIN
  -- Get quote details
  SELECT * INTO v_quote FROM quotes WHERE id = p_quote_id;

  IF v_quote IS NULL THEN
    RAISE EXCEPTION 'Quote not found';
  END IF;

  IF v_quote.status != 'accepted' THEN
    -- Update quote status to accepted
    UPDATE quotes
    SET status = 'accepted', accepted_at = NOW()
    WHERE id = p_quote_id;
  END IF;

  -- Create job pricing record
  INSERT INTO job_pricing (
    quote_id,
    brief_id,
    project_id,
    client_id,
    pricing_type,
    agreed_total,
    currency,
    approved_by,
    approved_at
  )
  VALUES (
    p_quote_id,
    v_quote.brief_id,
    v_quote.project_id,
    v_quote.client_id,
    'fixed',
    v_quote.total,
    v_quote.currency,
    p_approved_by,
    NOW()
  )
  RETURNING id INTO v_job_pricing_id;

  RETURN v_job_pricing_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Updated At Triggers
-- ============================================
CREATE OR REPLACE TRIGGER update_quotes_updated_at
  BEFORE UPDATE ON quotes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_quote_items_updated_at
  BEFORE UPDATE ON quote_line_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_job_pricing_updated_at
  BEFORE UPDATE ON job_pricing
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_price_templates_updated_at
  BEFORE UPDATE ON price_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Insert Default Price Templates
-- ============================================
INSERT INTO price_templates (name, description, item_type, category, default_unit, default_unit_price)
VALUES
  -- Creative Services
  ('Brand Strategy Session', 'Strategic brand positioning and planning workshop', 'service', 'Creative', 'session', 2500.00),
  ('Logo Design', 'Primary logo design with 3 concepts and 2 revision rounds', 'service', 'Creative', 'project', 3500.00),
  ('Brand Guidelines', 'Comprehensive brand style guide document', 'service', 'Creative', 'project', 2000.00),
  ('Social Media Content', 'Monthly social media content creation package', 'service', 'Creative', 'month', 1500.00),

  -- Video Production
  ('Video Production - Basic', 'Basic video shoot with editing', 'production', 'Video', 'project', 5000.00),
  ('Video Production - Premium', 'Full production including crew, equipment, editing', 'production', 'Video', 'project', 15000.00),
  ('Video Editing', 'Post-production editing and color grading', 'hourly', 'Video', 'hour', 125.00),

  -- Digital Marketing
  ('Google Ads Management', 'Monthly Google Ads campaign management', 'service', 'Digital Marketing', 'month', 1000.00),
  ('Facebook Ads Management', 'Monthly Facebook/Instagram Ads management', 'service', 'Digital Marketing', 'month', 1000.00),
  ('TikTok Ads Management', 'Monthly TikTok Ads campaign management', 'service', 'Digital Marketing', 'month', 1200.00),
  ('Media Spend - Google', 'Google Ads media spend with 15% agency fee', 'media_spend', 'Digital Marketing', 'month', 0),
  ('Media Spend - Meta', 'Meta Ads media spend with 15% agency fee', 'media_spend', 'Digital Marketing', 'month', 0),

  -- Web Development
  ('Website Design', 'Custom website design mockups', 'service', 'Web Development', 'project', 4500.00),
  ('Website Development', 'Custom website development', 'hourly', 'Web Development', 'hour', 150.00),
  ('Landing Page', 'Single landing page design and development', 'fixed', 'Web Development', 'page', 1500.00),

  -- Retainer Services
  ('Monthly Retainer - Basic', 'Basic retainer package with 20 hours included', 'retainer', 'Retainer', 'month', 3000.00),
  ('Monthly Retainer - Premium', 'Premium retainer package with 40 hours included', 'retainer', 'Retainer', 'month', 5500.00)
ON CONFLICT DO NOTHING;

SELECT 'Pricing schema created successfully' as status;
