-- 155-fix-quote-number-extraction.sql
-- Fix a pre-existing bug in generate_quote_number() that 500s the 2nd quote of any year.
--
-- The function generates a 4-digit-year format ('Q-2026-00001', sequence at position 8)
-- but extracted the running max with SUBSTRING(quote_number FROM 6):
--   SUBSTRING('Q-2026-00001' FROM 6) = '6-00001'  →  CAST(... AS INTEGER) → ERROR
-- The first quote of a year works (no prior 'Q-YYYY-%' row → MAX over empty → 0 → 1),
-- but the second insert that scans an existing number throws
-- "invalid input syntax for type integer". This affects BOTH the agency quotes module
-- (POST /api/agency/quotes) and CRM F14 quote generation.
--
-- Fix: extract the trailing digits with a regex (year-width agnostic, also tolerant of
-- any other numbering shape). Idempotent CREATE OR REPLACE — no table/data changes.
CREATE OR REPLACE FUNCTION generate_quote_number()
RETURNS TRIGGER AS $$
DECLARE
  year_prefix VARCHAR(4);
  next_num INTEGER;
BEGIN
  year_prefix := TO_CHAR(CURRENT_DATE, 'YYYY');

  SELECT COALESCE(MAX(CAST(SUBSTRING(quote_number FROM '[0-9]+$') AS INTEGER)), 0) + 1
  INTO next_num
  FROM quotes
  WHERE quote_number LIKE 'Q-' || year_prefix || '-%';

  NEW.quote_number := 'Q-' || year_prefix || '-' || LPAD(next_num::TEXT, 5, '0');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
