-- 060-task-budget-links.sql
-- Bidirectional linking between tasks and their budget sources (quotes, briefs)

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS quote_line_item_id UUID REFERENCES quote_line_items(id) ON DELETE SET NULL;

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS brief_id UUID REFERENCES briefs(id) ON DELETE SET NULL;

-- Tracks where estimated_cost came from: 'manual' | 'quote' | 'brief' | 'invoice' | 'rate_card'
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS budget_source VARCHAR(20) DEFAULT 'manual';

-- Partial indexes — only index non-null rows (most tasks won't have these FKs)
CREATE INDEX IF NOT EXISTS idx_tasks_quote_line_item
  ON tasks(quote_line_item_id) WHERE quote_line_item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_brief
  ON tasks(brief_id) WHERE brief_id IS NOT NULL;
