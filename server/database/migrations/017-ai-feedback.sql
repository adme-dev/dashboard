-- 017-ai-feedback.sql
-- AI Feedback: ratings, corrections, learned patterns

CREATE TABLE IF NOT EXISTS ai_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES ai_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  rating SMALLINT NOT NULL CHECK (rating IN (-1, 1)),
  correction TEXT,
  category VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(message_id, user_id)
);

CREATE TABLE IF NOT EXISTS ai_learned_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_type VARCHAR(50) NOT NULL,
  subject VARCHAR(500) NOT NULL,
  content TEXT NOT NULL,
  confidence NUMERIC(3,2) DEFAULT 0.5,
  source_count INT DEFAULT 1,
  source_feedback_ids UUID[] DEFAULT '{}',
  embedding_id VARCHAR(200),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_learned_patterns_active ON ai_learned_patterns(is_active, pattern_type);
