-- 141: CRM custom-objects engine — config verticals (Phase B). Stacked on 134/135/138.
-- (Renumbered from the plan's 140 → 141: origin/main took 140-leads-engine-phase-1 under a
--  parallel session. 141 is the next free number.)
-- Metadata-driven: object defs + field defs + JSONB records + per-vertical seed templates.
-- Two-axis isolation: every row carries client_id; object_def carries vertical_key.

-- Object type definitions (the "tables" a config vertical declares, per client).
CREATE TABLE IF NOT EXISTS crm_object_defs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  vertical_key TEXT NOT NULL REFERENCES crm_verticals(key) ON DELETE CASCADE,
  key          TEXT NOT NULL,
  label        TEXT NOT NULL,
  label_plural TEXT NOT NULL,
  icon         TEXT,
  has_pipeline BOOLEAN NOT NULL DEFAULT false,
  position     INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at   TIMESTAMPTZ,
  UNIQUE (client_id, key)
);

-- Field definitions for a config object.
CREATE TABLE IF NOT EXISTS crm_field_defs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  object_def_id   UUID NOT NULL REFERENCES crm_object_defs(id) ON DELETE CASCADE,
  key             TEXT NOT NULL,
  label           TEXT NOT NULL,
  field_type      TEXT NOT NULL DEFAULT 'text' CHECK (field_type IN (
                    'text','long_text','number','currency','date','status','dropdown',
                    'checkbox','rating','link','email','phone','location','tags','relation')),
  options         JSONB NOT NULL DEFAULT '[]'::jsonb,
  relation_target TEXT CHECK (relation_target IN ('person','company')),
  is_required     BOOLEAN NOT NULL DEFAULT false,
  is_title        BOOLEAN NOT NULL DEFAULT false,
  position        INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (object_def_id, key)
);

-- JSONB-backed records for config objects.
CREATE TABLE IF NOT EXISTS crm_records (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  object_def_id UUID NOT NULL REFERENCES crm_object_defs(id) ON DELETE CASCADE,
  data          JSONB NOT NULL DEFAULT '{}'::jsonb,
  stage_id      UUID REFERENCES crm_stages(id) ON DELETE SET NULL,
  created_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_crm_records_scope ON crm_records(client_id, object_def_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_crm_records_data  ON crm_records USING GIN (data);
CREATE INDEX IF NOT EXISTS idx_crm_records_stage ON crm_records(stage_id) WHERE stage_id IS NOT NULL;

-- Per-vertical seed templates: object defs + their fields + (optional) pipeline stages.
-- One row per object the vertical declares; instantiated per-client on vertical assign.
CREATE TABLE IF NOT EXISTS crm_object_templates (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vertical_key   TEXT NOT NULL REFERENCES crm_verticals(key) ON DELETE CASCADE,
  object_key     TEXT NOT NULL,
  label          TEXT NOT NULL,
  label_plural   TEXT NOT NULL,
  icon           TEXT,
  has_pipeline   BOOLEAN NOT NULL DEFAULT false,
  position       INTEGER NOT NULL DEFAULT 0,
  fields         JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{key,label,field_type,options,relation_target,is_required,is_title,position}]
  stages         JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{code,name,probability,sort_order,color,is_won,is_lost}]
  UNIQUE (vertical_key, object_key)
);

-- Retail proof vertical.
INSERT INTO crm_verticals (key, name, kind, is_core)
VALUES ('retail', 'Retail', 'config', false)
ON CONFLICT (key) DO NOTHING;

INSERT INTO crm_object_templates (vertical_key, object_key, label, label_plural, icon, has_pipeline, position, fields, stages)
VALUES
  ('retail', 'product', 'Product', 'Products', 'i-lucide-package', false, 1,
   '[{"key":"name","label":"Name","field_type":"text","is_title":true,"is_required":true,"position":1},
     {"key":"sku","label":"SKU","field_type":"text","position":2},
     {"key":"price","label":"Price","field_type":"currency","position":3},
     {"key":"category","label":"Category","field_type":"dropdown","options":["Apparel","Homeware","Electronics","Other"],"position":4},
     {"key":"stock","label":"Stock","field_type":"number","position":5}]'::jsonb,
   '[]'::jsonb),
  ('retail', 'order', 'Order', 'Orders', 'i-lucide-shopping-cart', true, 2,
   '[{"key":"reference","label":"Reference","field_type":"text","is_title":true,"is_required":true,"position":1},
     {"key":"customer","label":"Customer","field_type":"relation","relation_target":"person","position":2},
     {"key":"total","label":"Total","field_type":"currency","position":3},
     {"key":"notes","label":"Notes","field_type":"long_text","position":4}]'::jsonb,
   '[{"code":"new","name":"New","probability":10,"sort_order":1,"color":"#94a3b8","is_won":false,"is_lost":false},
     {"code":"paid","name":"Paid","probability":50,"sort_order":2,"color":"#3b82f6","is_won":false,"is_lost":false},
     {"code":"fulfilled","name":"Fulfilled","probability":100,"sort_order":3,"color":"#22c55e","is_won":true,"is_lost":false},
     {"code":"cancelled","name":"Cancelled","probability":0,"sort_order":4,"color":"#ef4444","is_won":false,"is_lost":true}]'::jsonb)
ON CONFLICT (vertical_key, object_key) DO NOTHING;
