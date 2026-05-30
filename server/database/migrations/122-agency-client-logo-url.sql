-- Migration 122: add logo_url to agency_clients
--
-- The client portal (server/utils/clientAuth.ts, portal + agency client-portal
-- endpoints) selects `agency_clients.logo_url`, but the column was never part of
-- the schema (schema.sql defines agency_clients without it). Every client-portal
-- request — including client login and session validation — therefore 500s.
-- Add the column to bring the schema in line with what the code expects.
ALTER TABLE agency_clients ADD COLUMN IF NOT EXISTS logo_url TEXT;
