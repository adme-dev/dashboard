-- Authoring catalog only. Never joined by send/schedule/snapshot paths.
CREATE TABLE IF NOT EXISTS email_merge_tag_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
  token text NOT NULL CHECK (token ~ '^custom_[a-z][a-z0-9_]{0,55}$'),
  preview_value text NOT NULL DEFAULT '' CHECK (length(preview_value) <= 256),
  fallback text NOT NULL CHECK (length(btrim(fallback)) BETWEEN 1 AND 200 AND fallback !~ '[{}|<>&[:cntrl:]]'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, token)
);
CREATE INDEX IF NOT EXISTS email_merge_tag_definitions_client ON email_merge_tag_definitions(client_id);
