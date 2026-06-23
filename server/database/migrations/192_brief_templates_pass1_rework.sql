-- ============================================
-- 192 · Brief Templates Pass 1 — REWORKS (11 templates)
-- Full field-set rewrite (DELETE+INSERT) — safe while brief_field_values = 0.
-- + template-flag UPDATEs + retire instagram-ads.
-- ============================================
DO $$ BEGIN
  IF (SELECT COUNT(*) FROM brief_field_values) <> 0 THEN
    RAISE EXCEPTION '192 aborted: brief_field_values is not empty — switch to additive mode';
  END IF;
END $$;
