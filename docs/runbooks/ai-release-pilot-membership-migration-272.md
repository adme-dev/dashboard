# AI release pilot membership migration 272

## Purpose

Migration `272_ai_release_pilot_membership.sql` adds an explicit, revocable pilot audience for governed AI pack and capability releases. It does not enroll a person, change a release state, activate a pack, or grant a permission.

The migration also records each release's rollout scope:

- `pilot` means only explicitly assigned, still-active members of the release department can compose the release;
- `department` means the evaluated active release applies through the existing department and RBAC scope.

Pilot promotion sets `pilot`; full activation sets `department`; suspension and retirement preserve the prior scope.

## Deployment order

The migration is backward-compatible with the currently deployed application and must be applied before merging the code that queries `rollout_scope` and `ai_release_pilot_members`.

1. Record release-state counts for both release tables.
2. Apply migration 272 with `ON_ERROR_STOP=1`.
3. Verify schema constraints, rollout-scope backfill, and zero pilot assignments.
4. Merge and deploy the application release.
5. Verify My Assistant and the admin governance reads.
6. Enroll nobody until a department owner, passing evaluation, named cohort, and support/rollback owner are approved.

## Preflight

```sql
SELECT 'pack' AS kind, release_state, COUNT(*)
  FROM ai_pack_releases
 GROUP BY release_state
UNION ALL
SELECT 'capability', release_state, COUNT(*)
  FROM ai_capability_releases
 GROUP BY release_state
ORDER BY kind, release_state;
```

Save the result with the deployment evidence. Migration 272 never updates `release_state`, so the same counts must remain after migration.

## Apply

```sh
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f server/database/migrations/272_ai_release_pilot_membership.sql
```

## Verification

```sql
SELECT table_name, column_name, is_nullable, column_default
  FROM information_schema.columns
 WHERE table_name IN ('ai_pack_releases', 'ai_capability_releases')
   AND column_name = 'rollout_scope'
 ORDER BY table_name;

SELECT 'pack' AS kind, release_state, rollout_scope, COUNT(*)
  FROM ai_pack_releases
 GROUP BY release_state, rollout_scope
UNION ALL
SELECT 'capability', release_state, rollout_scope, COUNT(*)
  FROM ai_capability_releases
 GROUP BY release_state, rollout_scope
ORDER BY kind, release_state, rollout_scope;

SELECT COUNT(*) AS pilot_memberships
  FROM ai_release_pilot_members;

SELECT conname
  FROM pg_constraint
 WHERE conname IN (
   'ai_pack_releases_rollout_scope_check',
   'ai_capability_releases_rollout_scope_check'
 )
 ORDER BY conname;
```

Expected results:

- both release tables have a non-null `rollout_scope` column;
- every `pilot` release has `pilot` scope and every `active` release has `department` scope;
- `pilot_memberships` is `0` before explicit administrator action;
- both rollout constraints exist;
- release-state counts match the preflight.

## Rollback

Application rollback is a normal revert/redeploy. The prior application ignores the additive columns and table, so do not drop them during an incident. Disable the affected release through the existing suspension control if a catalog issue is involved.

Schema removal is intentionally not an emergency action because dropping the membership table would destroy assignment/revocation history. A separately reviewed migration is required if the feature is retired.
