-- 252_agency_client_industry.sql
-- The client profile and embedding contracts already expose industry; make the
-- canonical agency client schema match that contract for profile fallbacks.
ALTER TABLE agency_clients ADD COLUMN IF NOT EXISTS industry TEXT;
