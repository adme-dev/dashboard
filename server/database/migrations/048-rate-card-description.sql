-- 048-rate-card-description.sql
-- Add description column to rate_card_items for user-maintained service descriptions

ALTER TABLE rate_card_items ADD COLUMN IF NOT EXISTS description TEXT;
