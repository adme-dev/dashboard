-- 436: Allow an editing session of up to four hours. Issuance also caps it at
-- the parent login expiry; every operation still checks live login/revocation,
-- ownership, entitlement and exact session scope. No existing session is extended.
-- 435 is reserved by the independent runtime CMS migration.
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE old_definition TEXT;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO old_definition
    FROM pg_constraint
    WHERE conrelid = 'page_studio_sessions'::regclass
      AND conname = 'page_studio_sessions_check1';
  IF old_definition IS NOT NULL THEN
    IF old_definition <> 'CHECK ((expires_at <= (issued_at + ''00:15:00''::interval)))' THEN
      RAISE EXCEPTION 'Unexpected Page Studio lifetime constraint: %', old_definition;
    END IF;
    ALTER TABLE page_studio_sessions DROP CONSTRAINT page_studio_sessions_check1;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid = 'page_studio_sessions'::regclass
      AND conname = 'page_studio_sessions_max_editing_lifetime') THEN
    ALTER TABLE page_studio_sessions ADD CONSTRAINT page_studio_sessions_max_editing_lifetime
      CHECK (expires_at <= issued_at + INTERVAL '4 hours');
  END IF;
END $$;
COMMIT;
