-- 059-budget-column-type.sql
-- Add 'budget' to the column_type enum for board budget columns
ALTER TYPE column_type ADD VALUE IF NOT EXISTS 'budget';
