# Draft history and named versions

Base: freshly fetched Dashboard main 4c15da690. Existing Studio main f8741e5.

- Add shared, strictly validated history and mutation contracts.
- Reuse immutable checkpoints, version summaries, site locks and checkpoint CAS.
- Authorise agency permissions and portal membership/entitlement under the same
  transaction as a mutation. Read metadata only, with bounded cursor pagination.
- Restore verified historical bytes into a new immutable checkpoint. Preserve the
  previous draft, clear the current version selection, never inherit approval or
  change releases. An operation receipt makes retries safe even after newer edits.
- Save named versions only from the expected acknowledged current draft. Reuse
  version registration; keep names in the existing summary field.
- Add shared History workspace, agency tab and portal route/link. Native Nuxt UI,
  semantic palette, existing font, left-aligned chronology, clear current badge.
  One name field and explicit restore confirmation; no decorative cards per row.
  Preserve the request/base on uncertain errors; reload after conflicts explicitly.
- Existing editor sessions use CAS and reject stale saves. Reopening Studio fetches
  the authoritative checkpoint; prompt users to finish saving before restoration.
- Test real PostgreSQL transactions/concurrency, R2 integrity/failure, permissions,
  idempotency, UI failure/retry/read-only behavior, full relevant suites and build.

No SQL migration is needed. Public copy must describe only supported saved changes.
