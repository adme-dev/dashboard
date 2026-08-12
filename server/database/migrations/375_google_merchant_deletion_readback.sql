-- 375_google_merchant_deletion_readback.sql
-- Keep an accepted ProductInput deletion distinct from confirmed processed-product absence.

BEGIN;

ALTER TABLE google_merchant_product_publications
  DROP CONSTRAINT IF EXISTS google_merchant_product_publications_state_check;

ALTER TABLE google_merchant_product_publications
  ADD CONSTRAINT google_merchant_product_publications_state_check CHECK (
    state IN (
      'SUBMITTED', 'PROCESSED', 'DISAPPROVED',
      'DELETION_SUBMITTED', 'DELETED', 'FAILED'
    )
  );

COMMIT;
