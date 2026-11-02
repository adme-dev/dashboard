-- Minimal pre-497 shapes of the production tables the review migration touches.
CREATE TABLE campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  subject text,
  from_name text,
  from_email text,
  reply_to text,
  preview_text text,
  body_source jsonb,
  body_html text,
  filter_rules jsonb,
  content_type text NOT NULL DEFAULT 'flyhub',
  template_id uuid,
  status text NOT NULL DEFAULT 'draft',
  scheduled_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  client_id uuid,
  created_by uuid,
  to_send integer NOT NULL DEFAULT 0,
  sent integer NOT NULL DEFAULT 0,
  preflight_result jsonb,
  preflight_checked_at timestamptz,
  recipient_snapshot jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE edm_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  subject text,
  preview_text text,
  body_source jsonb,
  body_html text,
  template_kind text NOT NULL DEFAULT 'template',
  client_id uuid,
  email_design_revision_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE team_members (
  id uuid PRIMARY KEY,
  name text
);
