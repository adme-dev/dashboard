-- Add Paul as super admin
-- Run this SQL in your Neon database

INSERT INTO team_members (
  name,
  email,
  role,
  is_active,
  created_at,
  updated_at
) VALUES (
  'Paul (Super Admin)',
  'paul@adme.net.au',
  'admin',
  true,
  NOW(),
  NOW()
)
ON CONFLICT (email) DO UPDATE SET
  role = 'admin',
  is_active = true,
  updated_at = NOW();

-- Verify the user was created
SELECT id, name, email, role, is_active 
FROM team_members 
WHERE email = 'paul@adme.net.au';
