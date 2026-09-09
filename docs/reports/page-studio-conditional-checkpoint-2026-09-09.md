# Conditional Page Studio checkpoints — 9 September 2026

Added POST `/internal/page-studio/checkpoints/commit` to match the shared control
client used by the Foundation checkpoint helper. Machine authentication precedes
body inspection. The strict body requires checkpoint metadata and an explicit
expectedCheckpointId (null for the first head); the idempotency header must match
the checkpoint ID. Scope, UUIDs, timestamp and canonical object key are validated.

The transaction locks the fully scoped site, checks any immutable replay before
comparing the current head, and rejects stale new saves with CHECKPOINT_NOT_CURRENT
409 before insertion. An exact replay reports the current head and isCurrent;
it never restores an old head. New checkpoint metadata, editor pointer and audit
entry commit together. Existing legacy callers retain their acknowledgement
contract; new setup uses only the guarded route. The service-only gateway already
forwards this internal path and its idempotency header, so no gateway change is
required. Caller authorization and trusted content/readback remain responsibilities
of the guarded executor; a machine credential is not an end-user access grant.

Verification: 30 focused store/endpoint tests pass, including five new transaction
cases and one endpoint validation/authentication case. Fifty-seven tests including
route inventories and deployment guards pass. ESLint passes for all changed code.
Real PostgreSQL 14 test used an isolated temporary cluster on port 55471: two
independent concurrent transactions produce one winner and one conflict, replay
preserves a later head, and checkpoint/audit rows have no duplicate or losing writes.
The test uses a temporary schema and removes it; the cluster was stopped afterward.
An earlier chosen port was occupied; its temporary-schema test also passed, but the
owned cluster was used for the final isolated proof. No production database was used.

No new SQL migration is necessary. Full local build passes; worker size is
25,061,929 raw bytes with 406,999 bytes remaining under the configured limit.
The immutable agency-dashboard deployment target guard passes. Guarded preview
CI/deployment results are recorded in the PR and Graph Wiki. Public Page Studio feature text
already describes protection against conflicting saves; navigation/counts do not
change for this internal endpoint repair. Production remains unchanged.

Foundation source 51522be adds bound manifests and checkpoint tooling; fcf2c39 is
the published evidence head. This Dashboard change resolves the endpoint absence
recorded there. Still open: live authority/seed-readback adapters, initiating actor
persistence, executor ordering/wiring, compatible non-limousine readers, real R2/
Dashboard acceptance, accepted page/module mapping and authenticated setup.
