-- 061-user-roles-expansion.sql
-- Add agency-specific roles to user_role enum

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'lead' AFTER 'admin';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'project_manager' AFTER 'lead';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'account_manager' AFTER 'project_manager';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'creative' AFTER 'account_manager';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'media_buyer' AFTER 'creative';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'producer' AFTER 'media_buyer';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'finance' AFTER 'producer';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'accounts' AFTER 'finance';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'developer' AFTER 'accounts';
