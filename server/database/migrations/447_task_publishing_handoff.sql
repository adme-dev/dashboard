-- One publishing deliverable per task. Repeated handoffs reopen its original post.
CREATE TABLE IF NOT EXISTS task_publishing_links (
  task_id uuid PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
  post_id uuid NOT NULL UNIQUE REFERENCES social_posts(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES agency_clients(id),
  project_id uuid NOT NULL REFERENCES projects(id),
  brief_id uuid REFERENCES briefs(id),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS task_publishing_links_client ON task_publishing_links(client_id);
