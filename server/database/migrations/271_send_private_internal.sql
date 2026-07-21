BEGIN;

-- Migration 268 required every ready transfer to own a public share token. Private
-- workspace transfers authenticate through the application instead, while public
-- transfers must retain the original token requirement.
DO $$
DECLARE
  constraint_row RECORD;
BEGIN
  FOR constraint_row IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'send_transfers'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%status%ready%share_token_hash%'
  LOOP
    EXECUTE format('ALTER TABLE send_transfers DROP CONSTRAINT %I', constraint_row.conname);
  END LOOP;
END;
$$;

ALTER TABLE send_transfers
  DROP CONSTRAINT IF EXISTS send_transfers_ready_access_check;

ALTER TABLE send_transfers
  ADD CONSTRAINT send_transfers_ready_access_check CHECK (
    status <> 'ready'
    OR sender_class = 'workspace'
    OR (sender_class = 'public' AND share_token_hash IS NOT NULL)
  );

-- Existing dormant workspace uploads adopt the approved private policy. This is a
-- publication-eligibility decision, not a malware-clean result.
UPDATE send_files AS f
   SET scan_status = 'not_required',
       scan_provider = NULL,
       scan_version = NULL,
       scan_evidence = jsonb_build_object(
         'policy', 'private_internal_v1',
         'decision', 'not_required'
       ),
       updated_at = NOW()
  FROM send_transfers AS t
 WHERE t.id = f.transfer_id
   AND t.sender_class = 'workspace'
   AND f.state = 'quarantined'
   AND f.scan_status = 'pending';

COMMENT ON CONSTRAINT send_transfers_ready_access_check ON send_transfers IS
  'Workspace ready transfers require authenticated application access; public ready transfers still require a hashed share token.';

COMMIT;
