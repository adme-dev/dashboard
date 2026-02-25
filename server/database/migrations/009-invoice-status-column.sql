-- Phase 8: Add invoice_status to custom column types
-- This enables boards to display invoice billing status per task

-- Add invoice_status to the column_type enum
ALTER TYPE column_type ADD VALUE IF NOT EXISTS 'invoice_status';
