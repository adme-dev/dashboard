-- ============================================
-- Intake Forms Schema
-- Dynamic form builder for capturing client work requests
-- ============================================

-- ============================================
-- Intake Forms (Form Definitions)
-- ============================================
CREATE TABLE IF NOT EXISTS intake_forms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Basic info
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE, -- URL-friendly identifier
  description TEXT,

  -- Branding
  logo_url TEXT,
  header_image_url TEXT,
  primary_color VARCHAR(7) DEFAULT '#3B82F6',

  -- Settings
  is_active BOOLEAN DEFAULT true,
  is_public BOOLEAN DEFAULT true, -- Can be accessed without auth
  requires_client_login BOOLEAN DEFAULT false,

  -- Routing
  default_department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  notify_on_submission UUID[], -- Team member IDs to notify

  -- Auto-actions
  auto_create_project BOOLEAN DEFAULT false,
  auto_project_template_id UUID REFERENCES project_templates(id) ON DELETE SET NULL,

  -- Access control
  allowed_client_ids UUID[], -- NULL = all clients, otherwise restricted

  -- Confirmation
  confirmation_message TEXT DEFAULT 'Thank you for your submission. We''ll be in touch shortly.',
  confirmation_redirect_url TEXT,

  -- Metadata
  created_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_intake_forms_slug ON intake_forms(slug);
CREATE INDEX IF NOT EXISTS idx_intake_forms_active ON intake_forms(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_intake_forms_department ON intake_forms(default_department_id);

-- ============================================
-- Intake Form Fields
-- ============================================
CREATE TABLE IF NOT EXISTS intake_form_fields (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  form_id UUID NOT NULL REFERENCES intake_forms(id) ON DELETE CASCADE,

  -- Field definition
  field_key VARCHAR(100) NOT NULL, -- Programmatic key
  label VARCHAR(255) NOT NULL,
  description TEXT,
  placeholder TEXT,

  -- Field type
  field_type VARCHAR(50) NOT NULL CHECK (field_type IN (
    'text', 'textarea', 'email', 'phone', 'url', 'number',
    'select', 'multiselect', 'radio', 'checkbox',
    'date', 'datetime', 'daterange',
    'file', 'files',
    'heading', 'paragraph', 'divider' -- Display-only fields
  )),

  -- Options (for select, multiselect, radio, checkbox)
  options JSONB, -- [{"value": "option1", "label": "Option 1"}, ...]

  -- Validation
  is_required BOOLEAN DEFAULT false,
  min_length INTEGER,
  max_length INTEGER,
  min_value DECIMAL,
  max_value DECIMAL,
  pattern VARCHAR(255), -- Regex pattern
  allowed_file_types TEXT[], -- e.g., ['image/*', 'application/pdf']
  max_file_size INTEGER, -- bytes

  -- Conditional logic
  show_when JSONB, -- {"field_key": "project_type", "operator": "equals", "value": "web"}

  -- Layout
  sort_order INTEGER DEFAULT 0,
  width VARCHAR(20) DEFAULT 'full' CHECK (width IN ('full', 'half', 'third')),

  -- Mapping
  maps_to VARCHAR(100), -- Maps to project field: 'name', 'description', 'budget', etc.

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(form_id, field_key)
);

CREATE INDEX IF NOT EXISTS idx_intake_form_fields_form ON intake_form_fields(form_id);
CREATE INDEX IF NOT EXISTS idx_intake_form_fields_order ON intake_form_fields(form_id, sort_order);

-- ============================================
-- Intake Submissions
-- ============================================
CREATE TABLE IF NOT EXISTS intake_submissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  form_id UUID NOT NULL REFERENCES intake_forms(id) ON DELETE CASCADE,

  -- Submitter info
  client_id UUID REFERENCES agency_clients(id) ON DELETE SET NULL,
  client_user_id UUID REFERENCES client_users(id) ON DELETE SET NULL,
  submitted_by_name VARCHAR(255),
  submitted_by_email VARCHAR(255) NOT NULL,
  submitted_by_phone VARCHAR(50),
  submitted_by_company VARCHAR(255),

  -- Form data
  data JSONB NOT NULL, -- {"field_key": "value", ...}

  -- Status tracking
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN (
    'pending', 'reviewing', 'approved', 'rejected', 'converted', 'archived'
  )),

  -- Assignment
  assigned_to UUID REFERENCES team_members(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ,

  -- Review
  reviewed_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,

  -- Conversion
  converted_to_project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  converted_at TIMESTAMPTZ,
  converted_by UUID REFERENCES team_members(id) ON DELETE SET NULL,

  -- Priority
  priority VARCHAR(20) DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),

  -- Source tracking
  source VARCHAR(100), -- 'direct', 'email_link', 'website', etc.
  referrer_url TEXT,
  ip_address VARCHAR(45),
  user_agent TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_intake_submissions_form ON intake_submissions(form_id);
CREATE INDEX IF NOT EXISTS idx_intake_submissions_status ON intake_submissions(status);
CREATE INDEX IF NOT EXISTS idx_intake_submissions_client ON intake_submissions(client_id);
CREATE INDEX IF NOT EXISTS idx_intake_submissions_assigned ON intake_submissions(assigned_to);
CREATE INDEX IF NOT EXISTS idx_intake_submissions_email ON intake_submissions(submitted_by_email);
CREATE INDEX IF NOT EXISTS idx_intake_submissions_created ON intake_submissions(created_at DESC);

-- ============================================
-- Intake Submission Attachments
-- ============================================
CREATE TABLE IF NOT EXISTS intake_submission_attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  submission_id UUID NOT NULL REFERENCES intake_submissions(id) ON DELETE CASCADE,
  field_key VARCHAR(100) NOT NULL, -- Which form field this belongs to

  -- File info
  file_name VARCHAR(255) NOT NULL,
  file_url TEXT NOT NULL,
  file_type VARCHAR(100),
  file_size INTEGER,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_intake_attachments_submission ON intake_submission_attachments(submission_id);

-- ============================================
-- Intake Submission Activities
-- ============================================
CREATE TABLE IF NOT EXISTS intake_submission_activities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  submission_id UUID NOT NULL REFERENCES intake_submissions(id) ON DELETE CASCADE,

  activity_type VARCHAR(50) NOT NULL CHECK (activity_type IN (
    'created', 'viewed', 'assigned', 'status_change', 'comment',
    'priority_change', 'converted', 'archived'
  )),

  user_id UUID REFERENCES team_members(id) ON DELETE SET NULL,
  old_value TEXT,
  new_value TEXT,
  comment TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_intake_activities_submission ON intake_submission_activities(submission_id);
CREATE INDEX IF NOT EXISTS idx_intake_activities_created ON intake_submission_activities(submission_id, created_at DESC);

-- ============================================
-- Views
-- ============================================

-- Intake Forms Summary
DROP VIEW IF EXISTS v_intake_forms_summary;
CREATE VIEW v_intake_forms_summary AS
SELECT
  f.id,
  f.name,
  f.slug,
  f.description,
  f.is_active,
  f.is_public,
  f.auto_create_project,
  f.created_at,
  f.updated_at,
  d.name AS department_name,
  tm.name AS created_by_name,
  pt.name AS template_name,
  COALESCE(fields.count, 0) AS field_count,
  COALESCE(submissions.total, 0) AS total_submissions,
  COALESCE(submissions.pending, 0) AS pending_submissions,
  submissions.last_submission_at
FROM intake_forms f
LEFT JOIN departments d ON f.default_department_id = d.id
LEFT JOIN team_members tm ON f.created_by = tm.id
LEFT JOIN project_templates pt ON f.auto_project_template_id = pt.id
LEFT JOIN (
  SELECT form_id, COUNT(*) AS count
  FROM intake_form_fields
  GROUP BY form_id
) fields ON f.id = fields.form_id
LEFT JOIN (
  SELECT
    form_id,
    COUNT(*) AS total,
    COUNT(*) FILTER (WHERE status = 'pending') AS pending,
    MAX(created_at) AS last_submission_at
  FROM intake_submissions
  GROUP BY form_id
) submissions ON f.id = submissions.form_id;

-- Intake Submissions with Details
DROP VIEW IF EXISTS v_intake_submissions_detail;
CREATE VIEW v_intake_submissions_detail AS
SELECT
  s.id,
  s.form_id,
  f.name AS form_name,
  s.client_id,
  c.name AS client_name,
  s.submitted_by_name,
  s.submitted_by_email,
  s.submitted_by_company,
  s.data,
  s.status,
  s.priority,
  s.assigned_to,
  assignee.name AS assigned_to_name,
  s.reviewed_by,
  reviewer.name AS reviewed_by_name,
  s.review_notes,
  s.converted_to_project_id,
  p.name AS converted_project_name,
  s.source,
  s.created_at,
  s.updated_at,
  COALESCE(attachments.count, 0) AS attachment_count,
  COALESCE(activities.count, 0) AS activity_count
FROM intake_submissions s
JOIN intake_forms f ON s.form_id = f.id
LEFT JOIN agency_clients c ON s.client_id = c.id
LEFT JOIN team_members assignee ON s.assigned_to = assignee.id
LEFT JOIN team_members reviewer ON s.reviewed_by = reviewer.id
LEFT JOIN projects p ON s.converted_to_project_id = p.id
LEFT JOIN (
  SELECT submission_id, COUNT(*) AS count
  FROM intake_submission_attachments
  GROUP BY submission_id
) attachments ON s.id = attachments.submission_id
LEFT JOIN (
  SELECT submission_id, COUNT(*) AS count
  FROM intake_submission_activities
  GROUP BY submission_id
) activities ON s.id = activities.submission_id;

-- ============================================
-- Triggers
-- ============================================

CREATE TRIGGER update_intake_forms_updated_at BEFORE UPDATE ON intake_forms
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_intake_form_fields_updated_at BEFORE UPDATE ON intake_form_fields
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_intake_submissions_updated_at BEFORE UPDATE ON intake_submissions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Functions
-- ============================================

-- Create project from submission
CREATE OR REPLACE FUNCTION create_project_from_intake(
  p_submission_id UUID,
  p_client_id UUID,
  p_project_name VARCHAR(255),
  p_created_by UUID
)
RETURNS UUID AS $$
DECLARE
  v_submission RECORD;
  v_form RECORD;
  v_project_id UUID;
BEGIN
  -- Get submission
  SELECT * INTO v_submission FROM intake_submissions WHERE id = p_submission_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Submission not found';
  END IF;

  -- Get form for template
  SELECT * INTO v_form FROM intake_forms WHERE id = v_submission.form_id;

  -- Create project (either from template or basic)
  IF v_form.auto_project_template_id IS NOT NULL THEN
    v_project_id := create_project_from_template(
      v_form.auto_project_template_id,
      p_client_id,
      p_project_name,
      CURRENT_DATE,
      p_created_by,
      NULL
    );
  ELSE
    INSERT INTO projects (
      name,
      client_id,
      status,
      budget_type,
      budget_amount,
      start_date
    ) VALUES (
      p_project_name,
      p_client_id,
      'draft',
      'time_materials',
      0,
      CURRENT_DATE
    ) RETURNING id INTO v_project_id;
  END IF;

  -- Update submission
  UPDATE intake_submissions
  SET
    status = 'converted',
    converted_to_project_id = v_project_id,
    converted_at = NOW(),
    converted_by = p_created_by
  WHERE id = p_submission_id;

  -- Log activity
  INSERT INTO intake_submission_activities (
    submission_id,
    activity_type,
    user_id,
    new_value
  ) VALUES (
    p_submission_id,
    'converted',
    p_created_by,
    v_project_id::text
  );

  RETURN v_project_id;
END;
$$ LANGUAGE plpgsql;
