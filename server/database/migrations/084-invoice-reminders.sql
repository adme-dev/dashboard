-- Invoice reminders: log of dunning emails sent to clients chasing payment.
-- Lets us surface "Last reminded X days ago" on the invoice slideover and
-- prevents accidental double-sending. Xero invoice_id stored as text — no
-- FK because invoices live in Xero, not our DB.

CREATE TABLE IF NOT EXISTS invoice_reminders (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id      text        NOT NULL,
  invoice_number  text,
  contact_name    text,
  contact_email   text        NOT NULL,
  amount_due      numeric(12, 2),
  currency        text        DEFAULT 'AUD',
  template_kind   text        NOT NULL DEFAULT 'standard',
  sent_by         uuid        REFERENCES team_members(id) ON DELETE SET NULL,
  sent_at         timestamptz NOT NULL DEFAULT now(),
  status          text        NOT NULL DEFAULT 'sent',
  error_message   text
);

CREATE INDEX IF NOT EXISTS idx_invoice_reminders_invoice_id ON invoice_reminders (invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_reminders_sent_at ON invoice_reminders (sent_at DESC);
