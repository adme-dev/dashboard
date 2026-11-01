# FigFlow EDM action envelope — F02

Status: shared version-1 contract only. No route, database lifecycle, native FigFlow bridge, publication service, or deployment is implemented by this document or `shared/emailRendering/designActions.ts`.

The envelope extends `designContract.ts`; it does not define another email document or native FigFlow format. All identifiers for drafts, library objects, revisions, proposals, actors, and operations are UUIDs. Native artifacts remain the existing opaque `{ id, sha256 }` references inside a validated canonical design.

## Boundary rules

- Browser input contains `version`, `operationId`, `action`, and target `scope`. Scope is a requested target, not proof of access. The server derives actor identity and capabilities from authentication, resolves the actual scope, and checks source-read/destination-write authority again when committing.
- Actor IDs, roles, permissions, publisher flags, arbitrary engine commands, filesystem paths, native bytes, native schema fields, and publication flags are not accepted action fields. Strict schemas reject unknown fields.
- `design` is a complete validated `EmailDesignDocument`, with the same scope as the action. There is no patch or partial-save command. The existing document limits, graph validation, edit policy, dependency pins, lineage, and asset bounds apply.
- Action envelopes are limited to the canonical 2 MiB document budget plus 64 KiB of action metadata. Input is snapshotted as bounded JSON before schema parsing.
- Every mutation has a caller-generated UUID `operationId`. Revision IDs are CAS fences, not optional optimistic-concurrency hints.
- Successful receipts have `ok: true`, the same `version`, `operationId`, and `action` as the request. An idempotent replay returns the original receipt and timestamps, not a newly executed mutation.
- Failures have `ok: false`, nullable operation/action identity when parsing did not establish them, and a content-free error object. Do not return design content, HTML, credentials, recipient data, or arbitrary exception details.

Use `validateDesignAction`, `validateDesignActionResult`, and `validateDesignActionFailure` at the respective boundaries. The TypeScript types alone are not runtime validation.

## Actions and CAS targets

`sourceDraft`, where present, is `{ draftId, revisionId }` and pins the separately saved working source. It does not make the library write and source-draft save one operation.

`includedOverridePaths` is required for every create/update library action. It explicitly lists campaign-instance override field paths selected for the shared revision; use `[]` when none enter the library. The server must validate these paths against the source instance and policy and must still provide destination/content preview and preflight. This list is not permission to change locks or scope.

| Action | Additional input | Success receipt |
|---|---|---|
| `save-draft` | `draftId`, nullable `expectedRevisionId`, `design` | `draftId`, new `revisionId`, `savedAt`, `published: false` |
| `create-template` | `name`, template `design`, optional `sourceDraft`, `includedOverridePaths` | new `templateId`, immutable `revisionId`, `publishedAt` |
| `update-template` | `templateId`, `expectedRevisionId`, template `design`, optional `sourceDraft`, `includedOverridePaths` | `templateId`, new immutable `revisionId`, `publishedAt` |
| `create-module` | `name`, `category`, module `design`, optional `sourceDraft`, `includedOverridePaths` | new `moduleId`, immutable `revisionId`, `publishedAt` |
| `update-module` | `moduleId`, `expectedRevisionId`, module `design`, optional `name`/`category`, optional `sourceDraft`, `includedOverridePaths` | `moduleId`, new immutable `revisionId`, `publishedAt` |
| `propose-return` | `draftId`, `baseRevisionId`, campaign-draft `design`, optional `sourceDraft` | durable browser-safe `proposal` |
| `apply-return` | `proposalId`, `expectedProposalRevisionId`, `expectedDraftRevisionId` | proposal/draft/base/new-revision IDs and `appliedAt` |
| `cancel-return` | `proposalId`, `expectedProposalRevisionId` | proposal ID/new proposal revision, `state: cancelled`, `cancelledAt` |
| `save-proposal-as-new-draft` | `proposalId`, `expectedProposalRevisionId`, `name` | source proposal/revision IDs plus new independent `draftId`/`revisionId`, `createdAt` |

A nullable draft `expectedRevisionId` means create-if-absent only for a pre-established draft identity with no head. A non-null value must equal the persisted head. Saving a designer working draft may contain template or module source; saving a campaign draft contains campaign-draft source. Neither action publishes a library revision or sends a campaign.

Create/update template/module are the explicit publication actions. They create immutable revisions; they do not update pinned drafts, existing module instances, scheduled/sent snapshots, or the source working draft implicitly. Scope reassignment cannot be mixed into these content writes.

For return application, the persisted proposal must still be live and `proposed`, its current revision must equal `expectedProposalRevisionId`, and the current campaign head must equal both the proposal's `baseRevisionId` and `expectedDraftRevisionId`. Proposal canonical/native-reference/mapping changes and the new campaign head commit atomically. One apply produces one editor undo action. On CAS conflict, retain both versions and offer keep-current, save-as-new-draft, or restart-from-current; never force overwrite.

Cancellation changes only proposal state and does not require the campaign to remain at its base revision. Closing a tab neither cancels nor applies a proposal. Saving a proposal as a new draft leaves the original campaign and proposal state unchanged and never overwrites the conflicted campaign.

## Operation idempotency

The persistence service must bind the operation to the server-derived actor and the complete validated action payload: action name, requested scope, target IDs, all CAS pins, source pin, selected override paths, and canonical design. A UUID alone is not authority and is not a global idempotency key.

- Same actor + operation UUID + same action/payload: return the confirmed original receipt, or resume/reconcile a recorded transient operation according to its durable state.
- Same actor + operation UUID + different action/payload/target: `IDEMPOTENCY_CONFLICT`.
- Another actor using the UUID: no shared receipt or authority; the server-derived actor namespace prevents cross-actor replay.
- Unknown commit acknowledgement: retain the payload-bound claim and reconcile with the same operation and payload. Do not blindly retry a transaction or erase an uncertain in-flight claim.
- Authority and scope checks still apply when reconciling a receipt. A revoked open tab cannot use an old operation to write.

`OPERATION_IN_PROGRESS` is retryable. `IDEMPOTENCY_CONFLICT`, CAS conflicts, and authority failures are not resolved by changing the payload while reusing the operation ID; mint a new operation for a deliberate new attempt.

## Durable proposals and expiry

The browser-safe `DesignProposal` contains proposal ID/current revision, requested scope, campaign draft/base revision, optional source-draft pin, canonical campaign design, state, and timestamps. `StoredDesignProposal` additionally contains `actorId`; it is server-only and must never become browser action input.

All proposals use server-generated timestamps:

- `createdAt` / initial `stateChangedAt`: durable proposal creation time.
- `expiresAt`: exactly 24 hours after creation (`DESIGN_PROPOSAL_TTL_MS`).
- `retainedUntil`: exactly 30 days after expiry (`DESIGN_PROPOSAL_RECOVERY_MS`).

The only durable states are:

| State | Meaning and permitted exits |
|---|---|
| `proposed` | Previewable. Before expiry: apply, cancel, or save as a new draft. At/after expiry it must transition to `expired`. |
| `applied` | Terminal. The campaign moved to the receipt's new revision; no cancel/reapply. |
| `cancelled` | Terminal. No campaign content mutation occurred. |
| `expired` | Terminal for apply/cancel. Until retention ends, save as a new campaign draft remains available. |

`designProposalStateAt` is only a read-time derivation. The service must persist `proposed → expired` with proposal revision CAS; evaluating the helper does not mutate storage. `assertDesignProposalAction` defines the action/state/expiry fence, but does not replace persisted revision checks or actor/scope authorization.

Expired proposals and their referenced canonical/native artifacts remain recoverable through `retainedUntil`. Recovery creates a new draft pinned to the proposal content, not to the current conflicted campaign. After retention, return `PROPOSAL_RETENTION_EXPIRED`; cleanup still must respect every other draft/library/sent-snapshot reference. Terminal proposal records and receipts need an explicit persistence/retention implementation before resume-after-tab-close can be claimed.

## Error codes

Contract parsing raises `EmailDesignActionError` with `INVALID_ACTION` or `ACTION_LIMIT_EXCEEDED`. Service implementations may use the typed failure codes:

- Access/target: `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `SCOPE_MISMATCH`, `KIND_MISMATCH`, `CAMPAIGN_FROZEN`.
- Concurrency/recovery: `REVISION_CONFLICT`, `IDEMPOTENCY_CONFLICT`, `OPERATION_IN_PROGRESS`, `PROPOSAL_STATE_CONFLICT`, `PROPOSAL_EXPIRED`, `PROPOSAL_RETENTION_EXPIRED`.
- Publication readiness: `PREFLIGHT_FAILED`, `ASSET_NOT_READY`.

A conflict response may include only the current revision/proposal revision and proposal state as recovery hints. It must not include the other editor's content. `retryable` describes transport/state retry behaviour, not permission to bypass a conflict.

## Open integration gates

This F02 slice deliberately does not invent native WASM APIs or authority behavior:

1. F01/F06 must verify native snapshot reopen/export and implement the actual bounded EDM document adapter against the owned FigFlow source/build. Native artifact IDs and hashes here are references only, not a claimed serialization format.
2. Existing RBAC must be mapped to campaign-editor, structural-designer, and library-publisher capabilities. Broad email write access is not publication authority. Routes must derive actor/scope, enforce policy, and recheck revocation at commit.
3. F03/F04/F08 must implement proposal persistence, operation payload binding for every action, CAS transitions, recovery retention, atomic apply, immutable publication, and preflight. The existing draft revision helper is not evidence that these routes or lifecycle records exist.
4. Browser sessions/postMessage require exact origin/source/session binding and carry no independent write authority. Native and live lesser-role acceptance remain open.
