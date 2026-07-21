# AI capability catalog migration 271

Migration: `server/database/migrations/271_ai_capability_catalog_and_evaluations.sql`

## Purpose

This additive migration establishes the dormant control-plane records used to version department capability packs, bind capabilities to existing tools and permissions, store immutable evaluation cases/results, and record release evidence. It creates no catalog rows, activates no capability, grants no permission, and does not change the current assistant runtime.

## Preconditions

- Take a normal managed Postgres backup or confirm point-in-time recovery is available.
- Confirm `departments` and `team_members` exist.
- Confirm all current application migrations are applied through migration 270.
- Apply with `ON_ERROR_STOP=1` so any failed constraint or trigger definition aborts the migration.

## Apply

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f server/database/migrations/271_ai_capability_catalog_and_evaluations.sql
```

Do not print or persist the database URL in command output.

## Verification

Verify the tables exist:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'ai_capability_packs',
    'ai_capabilities',
    'ai_eval_suites',
    'ai_eval_runs',
    'ai_capability_releases',
    'ai_pack_releases',
    'ai_catalog_audit_events'
  )
ORDER BY table_name;
```

Confirm the foundation is dormant:

```sql
SELECT
  (SELECT COUNT(*) FROM ai_capability_releases WHERE release_state IN ('pilot', 'active')) AS capability_releases,
  (SELECT COUNT(*) FROM ai_pack_releases WHERE release_state IN ('pilot', 'active')) AS pack_releases;
```

Both counts must be zero immediately after applying this migration.

## Security and integrity invariants

- Pack, capability, suite, version, run, and case relationships carry a department identifier and use composite foreign keys to reject cross-department binding.
- Required permission groups are limited to the existing server permission groups.
- Tool bindings allow only `read`, `draft`, or `propose`; no catalog record can represent direct execution.
- Pilot and active release records require a completed, passing evaluation run bound to the exact pack or capability version and its declared evaluation suite.
- Evaluation runs preserve model, prompt, toolset, suite, and target-version identity; terminal runs are immutable, results are accepted only while running, and completion totals must reconcile to the sealed cases and results.
- Material version records, evaluation cases/results, and audit events reject update/delete.
- Nested fixture objects reject common secret, prototype-pollution, and direct-PII keys. Depth, collection width, node count, string length, and serialized size are bounded; fixtures use opaque IDs and synthetic data only.
- Evaluation results store an opaque `trace_ref`, observed tool names, source references, counts, latency, and cost—not raw prompts, model output, credentials, or full traces.

## Forward-fix is the default

Once production evidence exists, correct schema or policy defects with a new additive migration. Do not edit migration 271 after release and do not rewrite versioned evidence.

## Dormant rollback

If application code consuming the new records causes a problem, disable that code path or feature flag and leave the additive tables dormant. Migration 271 itself does not change existing runtime queries, so the safest rollback is to stop reading/writing the new tables.

Before any future pilot, operators must verify that no pack or capability is unexpectedly `pilot` or `active` and that each active release references a completed, passing, non-stale evaluation run.

## Post-activation recovery

Suspend the affected release record, write an audit event with the incident reason, and roll the application back to the previous code deployment. Preserve the version and evaluation records for investigation and reconciliation.

Do not delete version, evaluation, release, or audit evidence. Dropping the tables is permitted only in an isolated disposable environment before any evidence exists and after confirming no application deployment depends on them.
