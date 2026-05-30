-- Migration 123: add client contact fields to agency_clients
--
-- The create endpoint (server/api/agency/clients/index.post.ts) inserts
-- contact_email / contact_phone / address, and the invoice / quote / pricing
-- read queries display the client's contact email, phone and billing address —
-- but none of these columns existed, so client creation and those reads 500'd.
-- Add the columns under the canonical names used by the write path.
ALTER TABLE agency_clients ADD COLUMN IF NOT EXISTS contact_email TEXT;
ALTER TABLE agency_clients ADD COLUMN IF NOT EXISTS contact_phone TEXT;
ALTER TABLE agency_clients ADD COLUMN IF NOT EXISTS address TEXT;
