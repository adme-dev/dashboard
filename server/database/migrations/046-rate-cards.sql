-- 046-rate-cards.sql
-- Rate card management system — categories, items, and audit log

-- Categories for grouping services
CREATE TABLE IF NOT EXISTS rate_card_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL UNIQUE,
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Individual service line items
CREATE TABLE IF NOT EXISTS rate_card_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES rate_card_categories(id) ON DELETE CASCADE,
  service_name VARCHAR(500) NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  price_unit VARCHAR(50) DEFAULT 'once-off',
  setup_fee DECIMAL(10,2) DEFAULT 0,
  setup_notes TEXT,
  notes TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_by UUID REFERENCES team_members(id),
  updated_by UUID REFERENCES team_members(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit log — every change tracked
CREATE TABLE IF NOT EXISTS rate_card_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID REFERENCES rate_card_items(id) ON DELETE CASCADE,
  action VARCHAR(20) NOT NULL,
  field_name VARCHAR(100),
  old_value TEXT,
  new_value TEXT,
  changed_by UUID REFERENCES team_members(id),
  changed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_rate_card_items_category ON rate_card_items(category_id);
CREATE INDEX IF NOT EXISTS idx_rate_card_items_active ON rate_card_items(is_active);
CREATE INDEX IF NOT EXISTS idx_rate_card_audit_item ON rate_card_audit_log(item_id);
CREATE INDEX IF NOT EXISTS idx_rate_card_audit_changed_by ON rate_card_audit_log(changed_by);

-- Auto-prune trigger: keep last 500 audit entries per item
CREATE OR REPLACE FUNCTION prune_rate_card_audit() RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM rate_card_audit_log
  WHERE id IN (
    SELECT id FROM rate_card_audit_log
    WHERE item_id = NEW.item_id
    ORDER BY changed_at DESC
    OFFSET 500
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prune_rate_card_audit ON rate_card_audit_log;
CREATE TRIGGER trg_prune_rate_card_audit
  AFTER INSERT ON rate_card_audit_log
  FOR EACH ROW
  EXECUTE FUNCTION prune_rate_card_audit();
