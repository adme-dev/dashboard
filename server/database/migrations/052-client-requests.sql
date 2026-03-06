-- 052-client-requests.sql
-- Client Portal: Job Requests + Support Tickets

-- Main requests table
CREATE TABLE IF NOT EXISTS client_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  client_user_id UUID NOT NULL REFERENCES client_users(id) ON DELETE CASCADE,
  request_type VARCHAR(20) NOT NULL CHECK (request_type IN ('job_request', 'support_ticket')),
  category VARCHAR(50),
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  priority VARCHAR(20) DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status VARCHAR(30) DEFAULT 'submitted' CHECK (status IN ('submitted', 'in_review', 'approved', 'in_progress', 'completed', 'closed', 'cancelled')),
  assigned_to UUID REFERENCES team_members(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  attachments JSONB DEFAULT '[]',
  estimated_budget DECIMAL(12,2),
  desired_deadline DATE,
  response_notes TEXT,
  responded_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  responded_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Request messages / conversation thread
CREATE TABLE IF NOT EXISTS client_request_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id UUID NOT NULL REFERENCES client_requests(id) ON DELETE CASCADE,
  client_user_id UUID REFERENCES client_users(id) ON DELETE SET NULL,
  team_member_id UUID REFERENCES team_members(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  attachments JSONB DEFAULT '[]',
  is_internal BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_client_requests_client_id ON client_requests(client_id);
CREATE INDEX IF NOT EXISTS idx_client_requests_type ON client_requests(request_type);
CREATE INDEX IF NOT EXISTS idx_client_requests_status ON client_requests(status);
CREATE INDEX IF NOT EXISTS idx_client_requests_assigned_to ON client_requests(assigned_to);
CREATE INDEX IF NOT EXISTS idx_client_requests_created_at ON client_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_request_messages_request_id ON client_request_messages(request_id);

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION update_client_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_client_requests_updated_at ON client_requests;
CREATE TRIGGER trg_client_requests_updated_at
  BEFORE UPDATE ON client_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_client_requests_updated_at();

-- Add permission column to client_users
ALTER TABLE client_users ADD COLUMN IF NOT EXISTS can_submit_requests BOOLEAN DEFAULT true;
