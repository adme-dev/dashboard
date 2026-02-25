-- 016-ai-knowledge.sql
-- AI Knowledge Base: articles, embeddings log

CREATE TABLE IF NOT EXISTS ai_knowledge_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(500) NOT NULL,
  content TEXT NOT NULL,
  category VARCHAR(100),
  tags TEXT[] DEFAULT '{}',
  embedding_id VARCHAR(200),
  source VARCHAR(100),
  author_id UUID REFERENCES team_members(id),
  is_published BOOLEAN DEFAULT true,
  view_count INT DEFAULT 0,
  usefulness_score NUMERIC(3,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_knowledge_category ON ai_knowledge_articles(category, is_published);

CREATE TABLE IF NOT EXISTS ai_embeddings_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID NOT NULL,
  vector_id VARCHAR(200) NOT NULL,
  content_hash VARCHAR(64),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(entity_type, entity_id)
);
