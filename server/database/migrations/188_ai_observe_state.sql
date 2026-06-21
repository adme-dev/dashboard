-- Observe & Learn W-2 (observe-and-learn spec §4): per-user watermark for the observed-memory
-- distiller. The cron reads each user's own activity rows STRICTLY after `observed_through_at`,
-- sessionizes + distils, then advances the watermark to the last event it consumed — so the pass is
-- idempotent and resumable (the durability the spec wanted from Workflows, achieved with a watermark
-- on the proven cron+Worker rails). New users default to a 7-day lookback on first observation.
--
-- Additive only. `ai_user_memory.source='observed'` is already free text (mig 180) — no change there.

CREATE TABLE IF NOT EXISTS ai_observe_state (
  user_id             UUID PRIMARY KEY REFERENCES team_members(id) ON DELETE CASCADE,
  observed_through_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() - INTERVAL '7 days'),
  last_run_at         TIMESTAMPTZ,
  events_seen         INTEGER NOT NULL DEFAULT 0,
  memories_written    INTEGER NOT NULL DEFAULT 0,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
