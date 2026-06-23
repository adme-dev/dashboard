-- Stateless-JWT session revocation.
-- The auth layer is stateless JWTs (no server-side session store), so there was no
-- way to revoke an issued token before its 7-day expiry. invalidateAllSessions() now
-- stamps this column; validateSession() rejects any JWT whose `iat` predates it.
-- Used by password-reset and user-deactivation flows. Additive + nullable — invisible
-- to currently-deployed code until the reading code ships.

ALTER TABLE team_members ADD COLUMN IF NOT EXISTS sessions_invalidated_at TIMESTAMPTZ;
