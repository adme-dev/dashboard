# Measurement Signal Hub Migration 256 Recovery

## Principle

Forward-fix is the default. Migration 256 is additive and seeds only disabled test
profiles. It does not infer destinations, enable delivery, publish KV configuration,
or contact Meta/Google. A failed application should be corrected by a new migration
whenever any canonical event or audit evidence may have been written.

## Pre-application checks

1. Confirm migrations through `255_social_news_portal_approvals.sql` are present.
2. Confirm `agency_clients`, `client_users`, `tracking_sites`, `social_connections`,
   `leads`, `crm_people`, and `crm_opportunities` exist.
3. Confirm `agency_clients.industry` and the shared `update_updated_at_column()`
   function exist.
4. Take a schema snapshot and a recoverable database backup/branch.
5. Run the migration contract test and apply to an isolated Neon branch first.

## Read-back verification

After applying:

- every `agency_clients` row has exactly one `client_measurement_profiles` row;
- every seeded profile is `enabled=false`, `environment='test'`, version `1`;
- there are no seeded destinations, mappings, endpoints, events, or deliveries;
- `client_users.can_manage_lead_outcomes` is false unless explicitly changed later;
- append-only triggers reject update/delete of configuration audit, lifecycle events,
  and delivery-attempt evidence;
- the pending-outbox and delivery-health indexes exist.

## Dormant rollback

Dormant rollback is allowed only when all of the following are proven by read-back:

- no profile has been changed from version `1`;
- no profile or destination has been enabled;
- all Measurement child tables except seeded profiles are empty;
- no native board/task or UI release depends on Measurement identifiers;
- a database backup or branch exists.

In that narrow state, remove the new tables in reverse foreign-key order, remove the
three legacy composite unique indexes, remove `can_manage_lead_outcomes`, and remove
`prevent_measurement_append_only_mutation()`. Execute the reviewed statements inside
one explicit transaction on an isolated branch first. Do not automate this rollback
in deployment tooling.

## Post-activation recovery

Do not drop canonical event or audit tables after configuration changes, lifecycle
events, outcome endpoints, outbox rows, or delivery attempts exist. Pause affected
profiles/destinations, stop queue publication, preserve evidence, and ship a numbered
forward-fix migration. If a column or constraint is faulty, add the corrected shape,
backfill in bounded client-scoped batches, validate read-back, and only later retire
the superseded shape through a separately approved migration.

Provider delivery state is never reconstructed from Monday or a provider console.
Neon audit/outbox rows remain the recovery source; queue and KV state may be rebuilt
as derived projections.

## Incident rollback sequence

1. Set the affected profile/destination to paused through the canonical service, or
   use the documented emergency database procedure if the service is unavailable.
2. Stop the outbox publisher and delivery consumer without deleting Queue/DLQ data.
3. Revoke or rotate affected secret references at their source.
4. Record the incident correlation ID and preserve redacted audit/delivery evidence.
5. Apply and verify a forward-fix on a database branch.
6. Rebuild KV projections from the latest Neon configuration version.
7. Resume in test mode, validate, obtain the required approvals, then restore live.

## Data-retention recovery

If a purge job fails, stop that job and alert; do not widen its predicate or disable
tenant filters to make progress. Resume from the last bounded cursor after the query
and client scope are reviewed. Legal holds are explicit policy records and must not
be represented by silently disabling the retention system.
