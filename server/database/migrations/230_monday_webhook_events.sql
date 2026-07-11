CREATE TABLE IF NOT EXISTS monday_webhook_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  monday_event_id VARCHAR(160) NOT NULL UNIQUE,
  event_type VARCHAR(80),
  board_id VARCHAR(100),
  item_id VARCHAR(100),
  payload JSONB NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'queued', 'processed', 'failed')),
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  error_message TEXT
);
CREATE INDEX IF NOT EXISTS idx_monday_webhook_events_status ON monday_webhook_events(status, received_at);
