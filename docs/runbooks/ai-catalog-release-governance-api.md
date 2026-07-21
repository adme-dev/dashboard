# AI catalog release governance API

## Purpose

`PATCH /api/admin/ai/governance/releases/:id` is the governed state-transition boundary for an existing capability or pack release. It cannot create catalog material, edit immutable versions, execute an assistant tool, or delete evidence.

The endpoint is production-safe while the catalog is empty: it has no rows to transition and does not seed or activate anything.

## Authority

- The caller must be authenticated and have the `ADMIN` permission group.
- The caller must have write access; viewer, guest, and custom read-only roles are denied.
- The actor ID is derived from the authenticated server session. It is never accepted from the request body.

## Request

```json
{
  "kind": "capability",
  "targetState": "pilot",
  "evaluationRunId": "00000000-0000-4000-8000-000000000000",
  "expectedUpdatedAt": "2026-07-21T08:00:00.000Z",
  "reason": "Exact evaluation passed and the pilot was approved."
}
```

The body is strict. Unknown fields, malformed UUIDs, invalid timestamps, empty reasons, reasons longer than 2,000 characters, and `draft` as a target state are rejected.

## State machine

| Current | Allowed targets |
| --- | --- |
| `draft` | `pilot`, `retired` |
| `pilot` | `active`, `suspended`, `retired` |
| `active` | `suspended`, `retired` |
| `suspended` | `pilot`, `active`, `retired` |
| `retired` | none |

Promotion to `pilot` or `active` requires an explicitly supplied evaluation run that is completed, passing, in the same department, and bound to the exact pack or capability version. A jointly bound pack/capability evaluation is valid for either exact target.

Suspension and retirement preserve prior evaluation evidence. There is no destructive delete or return-to-draft operation.

## Concurrency and audit

`expectedUpdatedAt` provides optimistic concurrency while the database row is held with `FOR UPDATE`. A stale operator view returns `release_version_conflict`. The database also permits only one active version for each logical pack or capability; a competing activation returns `active_release_conflict`.

The release update and append-only `ai_catalog_audit_events` insert share one transaction. Audit records include the server-derived actor, reason, evaluation run, material version, release ID, and previous/next release states. If the audit insert fails, the release update rolls back.

## Stable error codes

- `invalid_request` — malformed or unexpected input
- `release_not_found` — no release of the supplied kind and ID
- `release_version_conflict` — stale `expectedUpdatedAt`
- `invalid_release_transition` — disallowed state-machine edge
- `evaluation_required` — promotion omitted evaluation evidence
- `evaluation_not_eligible` — evidence is missing, failing, incomplete, cross-department, or bound to another version
- `active_release_conflict` — another version is already active

Authentication and authorization failures use the existing `401`/`403` application contract.

## Governance inventory

`GET /api/admin/ai/governance/catalog` provides the read model used by governance surfaces. It requires the same `ADMIN` permission and returns `Cache-Control: private, no-store`.

Optional query parameters are:

- `departmentId` — an exact department UUID
- `kind` — `pack` or `capability`
- `releaseState` — `draft`, `pilot`, `active`, `suspended`, or `retired`
- `limit` — 1–100, default 50
- `cursor` — the opaque `nextCursor` returned by the previous page

Rows include department and accountable-owner identity, immutable material version, release and evaluation status, model/budget controls, capability/tool counts, and at most 100 sorted tool names. `toolsTruncated` indicates that the complete tool set requires a later detail page. The read model does not select evaluation prompts, fixtures, raw output, traces, secrets, or owner email addresses.
