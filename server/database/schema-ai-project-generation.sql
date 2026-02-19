-- ============================================
-- AI Project Generation Schema
-- AI-powered project scoping and task generation
-- Depends on: schema-templates.sql (project_templates)
-- ============================================

-- ============================================
-- AI Generation Sessions (Tracks AI generation requests)
-- ============================================
CREATE TABLE IF NOT EXISTS ai_generation_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Who initiated
  created_by UUID NOT NULL REFERENCES team_members(id),

  -- Context
  template_id UUID REFERENCES project_templates(id),
  client_id UUID REFERENCES agency_clients(id),
  intake_submission_id UUID REFERENCES intake_submissions(id), -- If generated from intake

  -- Input
  project_name VARCHAR(255),
  project_description TEXT,
  client_requirements TEXT,
  target_budget DECIMAL(12, 2),
  target_deadline DATE,

  -- Discovery answers
  discovery_answers JSONB DEFAULT '{}',

  -- AI prompt and response
  ai_prompt TEXT,
  ai_model VARCHAR(100),
  ai_response JSONB,
  ai_tokens_used INTEGER,

  -- Generated output
  generated_project JSONB,
  /*
  {
    "name": "...",
    "description": "...",
    "estimated_budget": 50000,
    "estimated_hours": 200,
    "phases": [...],
    "tasks": [...],
    "milestones": [...],
    "resource_recommendations": [...]
  }
  */

  -- Status
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN (
    'pending', 'generating', 'completed', 'failed', 'applied'
  )),
  error_message TEXT,

  -- If applied to create a real project
  created_project_id UUID REFERENCES projects(id),
  applied_at TIMESTAMPTZ,
  applied_by UUID REFERENCES team_members(id),

  -- Modifications before applying
  user_modifications JSONB, -- Track what user changed from AI suggestion

  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ai_generation_sessions_user ON ai_generation_sessions(created_by);
CREATE INDEX IF NOT EXISTS idx_ai_generation_sessions_status ON ai_generation_sessions(status);
CREATE INDEX IF NOT EXISTS idx_ai_generation_sessions_template ON ai_generation_sessions(template_id);
CREATE INDEX IF NOT EXISTS idx_ai_generation_sessions_client ON ai_generation_sessions(client_id);

-- ============================================
-- AI Task Suggestions (Suggestions for existing projects)
-- ============================================
CREATE TABLE IF NOT EXISTS ai_task_suggestions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  generated_by UUID REFERENCES team_members(id),

  -- Context
  context_type VARCHAR(50) NOT NULL CHECK (context_type IN (
    'scope_expansion', 'risk_mitigation', 'optimization', 'missing_tasks', 'resource_reallocation'
  )),
  trigger_reason TEXT, -- Why this suggestion was generated

  -- Suggested tasks
  suggested_tasks JSONB DEFAULT '[]',
  /*
  [
    {
      "name": "...",
      "description": "...",
      "estimated_hours": 8,
      "phase": "...",
      "dependencies": [...],
      "recommended_assignee_skills": [...],
      "priority": "high",
      "rationale": "..."
    }
  ]
  */

  -- AI metadata
  ai_model VARCHAR(100),
  ai_confidence DECIMAL(5, 2), -- 0-100
  ai_reasoning TEXT,

  -- Status
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'partial')),

  -- User actions
  reviewed_by UUID REFERENCES team_members(id),
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  accepted_task_ids JSONB DEFAULT '[]', -- IDs of tasks that were created

  -- User feedback (for AI learning)
  feedback_rating INTEGER CHECK (feedback_rating >= 1 AND feedback_rating <= 5),
  feedback_applied BOOLEAN,
  feedback_modification_pct INTEGER CHECK (feedback_modification_pct >= 0 AND feedback_modification_pct <= 100),
  feedback_text TEXT,
  feedback_user_id UUID REFERENCES team_members(id),
  feedback_at TIMESTAMPTZ,

  -- Additional fields for tracking
  suggestion_type VARCHAR(100), -- More specific categorization
  suggestion_text TEXT, -- Summary text of the suggestion
  applied_at TIMESTAMPTZ, -- When the suggestion was applied

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_task_suggestions_project ON ai_task_suggestions(project_id);
CREATE INDEX IF NOT EXISTS idx_ai_task_suggestions_status ON ai_task_suggestions(status);

-- ============================================
-- AI Estimation Models (For learning from historical data)
-- ============================================
CREATE TABLE IF NOT EXISTS ai_estimation_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- What was estimated
  project_id UUID REFERENCES projects(id),
  task_id UUID REFERENCES tasks(id),

  -- Original estimates
  original_hours_estimate DECIMAL(8, 2),
  original_budget_estimate DECIMAL(12, 2),
  ai_hours_estimate DECIMAL(8, 2),
  ai_budget_estimate DECIMAL(12, 2),

  -- Actual results
  actual_hours DECIMAL(8, 2),
  actual_budget DECIMAL(12, 2),

  -- Accuracy metrics
  hours_accuracy_percent DECIMAL(5, 2), -- (1 - abs(actual-estimate)/actual) * 100
  budget_accuracy_percent DECIMAL(5, 2),

  -- Context for learning
  project_type VARCHAR(100),
  task_type VARCHAR(100),
  team_size INTEGER,
  complexity_factors JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_estimation_history_project ON ai_estimation_history(project_id);
CREATE INDEX IF NOT EXISTS idx_ai_estimation_history_task ON ai_estimation_history(task_id);
CREATE INDEX IF NOT EXISTS idx_ai_estimation_history_type ON ai_estimation_history(project_type, task_type);

-- ============================================
-- Views
-- ============================================

-- Template Usage Summary
DROP VIEW IF EXISTS v_project_template_usage;
CREATE VIEW v_project_template_usage AS
SELECT
  pt.id,
  pt.name,
  pt.category,
  pt.is_active,
  pt.estimated_duration_days,
  pt.estimated_budget_min,
  pt.estimated_budget_max,
  pt.recommended_team_size,
  jsonb_array_length(pt.default_tasks) AS task_count,
  jsonb_array_length(pt.phases) AS phase_count,
  (SELECT COUNT(*) FROM ai_generation_sessions ags WHERE ags.template_id = pt.id) AS times_used,
  (SELECT COUNT(*) FROM ai_generation_sessions ags WHERE ags.template_id = pt.id AND ags.status = 'applied') AS projects_created,
  pt.created_at
FROM project_templates pt;

-- Recent AI Generations
DROP VIEW IF EXISTS v_recent_ai_generations;
CREATE VIEW v_recent_ai_generations AS
SELECT
  ags.id,
  ags.project_name,
  ags.status,
  ags.created_by,
  tm.name AS created_by_name,
  ags.template_id,
  pt.name AS template_name,
  ags.client_id,
  c.name AS client_name,
  ags.target_budget,
  ags.target_deadline,
  ags.ai_tokens_used,
  ags.created_project_id,
  ags.created_at,
  ags.completed_at
FROM ai_generation_sessions ags
LEFT JOIN team_members tm ON ags.created_by = tm.id
LEFT JOIN project_templates pt ON ags.template_id = pt.id
LEFT JOIN agency_clients c ON ags.client_id = c.id
ORDER BY ags.created_at DESC;

-- AI Estimation Accuracy
DROP VIEW IF EXISTS v_ai_estimation_accuracy;
CREATE VIEW v_ai_estimation_accuracy AS
SELECT
  project_type,
  task_type,
  COUNT(*) AS sample_count,
  ROUND(AVG(hours_accuracy_percent)::numeric, 1) AS avg_hours_accuracy,
  ROUND(AVG(budget_accuracy_percent)::numeric, 1) AS avg_budget_accuracy,
  ROUND(AVG(ai_hours_estimate)::numeric, 1) AS avg_ai_hours,
  ROUND(AVG(actual_hours)::numeric, 1) AS avg_actual_hours,
  ROUND(STDDEV(hours_accuracy_percent)::numeric, 1) AS hours_accuracy_stddev
FROM ai_estimation_history
WHERE actual_hours IS NOT NULL
GROUP BY project_type, task_type
HAVING COUNT(*) >= 5
ORDER BY sample_count DESC;

-- Note: project_templates table, its triggers, and seed data are defined in schema-templates.sql
-- This schema only contains AI-specific tables that depend on project_templates
