-- 135: CRM opportunities + pipeline stages (Slice 2). Stacked on 134.
-- Ported from crm-dashboard deals/deal_stages; automotive columns stripped.
-- Stages: global defaults (client_id NULL); per-client rows override later.

CREATE TABLE IF NOT EXISTS crm_stages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID REFERENCES agency_clients(id) ON DELETE CASCADE,  -- NULL = global default
  code        TEXT NOT NULL,
  name        TEXT NOT NULL,
  probability INTEGER NOT NULL DEFAULT 0 CHECK (probability BETWEEN 0 AND 100),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  color       TEXT NOT NULL DEFAULT '#6366f1',
  is_won      BOOLEAN NOT NULL DEFAULT false,
  is_lost     BOOLEAN NOT NULL DEFAULT false,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- One code per scope (global, or per client).
CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_stages_scope_code
  ON crm_stages (COALESCE(client_id, '00000000-0000-0000-0000-000000000000'::uuid), code);

INSERT INTO crm_stages (client_id, code, name, probability, sort_order, color, is_won, is_lost)
VALUES
  (NULL, 'new',         'New',         10,  1, '#94a3b8', false, false),
  (NULL, 'qualified',   'Qualified',   25,  2, '#3b82f6', false, false),
  (NULL, 'proposal',    'Proposal',    50,  3, '#8b5cf6', false, false),
  (NULL, 'negotiation', 'Negotiation', 75,  4, '#f59e0b', false, false),
  (NULL, 'won',         'Won',         100, 5, '#22c55e', true,  false),
  (NULL, 'lost',        'Lost',        0,   6, '#ef4444', false, true)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS crm_opportunities (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  person_id           UUID REFERENCES crm_people(id) ON DELETE SET NULL,
  company_id          UUID REFERENCES crm_companies(id) ON DELETE SET NULL,
  stage_id            UUID NOT NULL REFERENCES crm_stages(id),
  owner_id            UUID,
  amount              NUMERIC(14,2) NOT NULL DEFAULT 0,
  probability         INTEGER NOT NULL DEFAULT 10 CHECK (probability BETWEEN 0 AND 100),
  weighted_value      NUMERIC(14,2) GENERATED ALWAYS AS (amount * probability / 100) STORED,
  expected_close_date DATE,
  actual_close_date   DATE,
  status              TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','won','lost')),
  source              TEXT,
  competitor          TEXT,
  lost_reason         TEXT,
  notes               TEXT,
  next_action         TEXT,
  next_action_date    TIMESTAMPTZ,
  stage_changed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  stage_history       JSONB NOT NULL DEFAULT '[]'::jsonb,
  custom_fields       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by          UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_crm_opps_client ON crm_opportunities(client_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_crm_opps_stage ON crm_opportunities(stage_id);
CREATE INDEX IF NOT EXISTS idx_crm_opps_person ON crm_opportunities(person_id);
CREATE INDEX IF NOT EXISTS idx_crm_opps_company ON crm_opportunities(company_id);
