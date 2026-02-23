-- Magic Link Tokens Table for Neon DB
CREATE TABLE IF NOT EXISTS magic_link_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL,
  used BOOLEAN DEFAULT false,
  used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_magic_links_token ON magic_link_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_magic_links_user ON magic_link_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_magic_links_email ON magic_link_tokens(email);
CREATE INDEX IF NOT EXISTS idx_magic_links_expires ON magic_link_tokens(expires_at);
