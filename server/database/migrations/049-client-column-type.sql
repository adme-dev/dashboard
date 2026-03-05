-- Add 'client' to the column_type enum for board client columns
ALTER TYPE column_type ADD VALUE IF NOT EXISTS 'client';
