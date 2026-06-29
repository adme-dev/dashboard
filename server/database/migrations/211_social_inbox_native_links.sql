-- 211_social_inbox_native_links.sql
-- Social Inbox native workflow links.
-- Conversations can be escalated into native XeroFlow tasks/client requests.
-- Monday task creation is intentionally not part of this workflow.

ALTER TABLE social_conversations
  ADD COLUMN IF NOT EXISTS linked_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS linked_client_request_id UUID REFERENCES client_requests(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS native_linked_by TEXT,
  ADD COLUMN IF NOT EXISTS native_linked_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_social_conv_linked_task
  ON social_conversations(linked_task_id)
  WHERE linked_task_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_social_conv_linked_request
  ON social_conversations(linked_client_request_id)
  WHERE linked_client_request_id IS NOT NULL;
