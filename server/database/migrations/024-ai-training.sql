-- 024-ai-training.sql
-- AI Training Data Pipeline: datasets, knowledge entries, LoRA adapters

-- ============================================
-- Training Datasets
-- ============================================
CREATE TABLE IF NOT EXISTS ai_training_datasets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_type VARCHAR(50) NOT NULL
    CHECK (dataset_type IN ('chat_qa', 'intent', 'rag', 'knowledge', 'combined')),
  version INT NOT NULL DEFAULT 1,
  status VARCHAR(30) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'extracting', 'uploading', 'ready', 'failed', 'archived')),
  format VARCHAR(20) NOT NULL DEFAULT 'jsonl',
  row_count INT DEFAULT 0,
  filtered_count INT DEFAULT 0,
  file_size_bytes BIGINT DEFAULT 0,
  r2_path VARCHAR(500),
  extraction_options JSONB DEFAULT '{}',
  quality_metrics JSONB DEFAULT '{}',
  error_message TEXT,
  created_by UUID NOT NULL REFERENCES team_members(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ai_training_datasets_type_status
  ON ai_training_datasets(dataset_type, status);

-- ============================================
-- Training Knowledge Entries
-- ============================================
CREATE TABLE IF NOT EXISTS ai_training_knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  knowledge_type VARCHAR(50) NOT NULL
    CHECK (knowledge_type IN ('sop', 'client_context', 'qa_pair', 'workflow', 'glossary')),
  title VARCHAR(500) NOT NULL,
  content TEXT NOT NULL,
  answer TEXT,
  category VARCHAR(100),
  tags TEXT[] DEFAULT '{}',
  client_id UUID REFERENCES agency_clients(id),
  source VARCHAR(100),
  source_file VARCHAR(500),
  is_approved BOOLEAN DEFAULT false,
  approved_by UUID REFERENCES team_members(id),
  approved_at TIMESTAMPTZ,
  embedding_id VARCHAR(200),
  created_by UUID NOT NULL REFERENCES team_members(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ai_training_knowledge_type
  ON ai_training_knowledge(knowledge_type, is_approved);
CREATE INDEX idx_ai_training_knowledge_category
  ON ai_training_knowledge(category) WHERE category IS NOT NULL;
CREATE INDEX idx_ai_training_knowledge_client
  ON ai_training_knowledge(client_id) WHERE client_id IS NOT NULL;

-- ============================================
-- LoRA Adapters
-- ============================================
CREATE TABLE IF NOT EXISTS ai_lora_adapters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL UNIQUE,
  display_name VARCHAR(200),
  model_base VARCHAR(200) NOT NULL DEFAULT '@cf/meta/llama-3.1-8b-instruct-fast',
  version INT NOT NULL DEFAULT 1,
  dataset_id UUID REFERENCES ai_training_datasets(id),
  r2_path VARCHAR(500),
  cf_finetune_id VARCHAR(200),
  status VARCHAR(30) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'uploading', 'active', 'testing', 'retired', 'failed')),
  adapter_type VARCHAR(30) NOT NULL
    CHECK (adapter_type IN ('chat', 'intent', 'rag')),
  rank INT DEFAULT 16 CHECK (rank BETWEEN 1 AND 32),
  traffic_pct INT DEFAULT 0 CHECK (traffic_pct BETWEEN 0 AND 100),
  metrics JSONB DEFAULT '{}',
  error_message TEXT,
  created_by UUID NOT NULL REFERENCES team_members(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ai_lora_adapters_type_status
  ON ai_lora_adapters(adapter_type, status);

-- ============================================
-- Track LoRA usage per AI message for A/B comparison
-- ============================================
ALTER TABLE ai_messages
  ADD COLUMN IF NOT EXISTS lora_adapter_id UUID REFERENCES ai_lora_adapters(id),
  ADD COLUMN IF NOT EXISTS is_lora BOOLEAN DEFAULT false;
