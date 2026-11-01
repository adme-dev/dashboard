> Review snapshot before parent remediation. See the execution ledger for dispositions and subsequent tests.

# FigFlow gated draft save — independent review

Date: 2026-10-31
HEAD: `4794ae06d07d25ac68e840d2f5339cd109e95104`
Scope: local, uncommitted save path. The route stays disabled unless `FIGFLOW_EDM_DRAFT_SAVES_ENABLED` is the string `true`. No production migration and no flag activation are claimed.

Reviewed:

- `server/api/email/design/drafts/[id].patch.ts`
- `server/utils/email-marketing/designAccess.ts`
- `server/utils/email-marketing/designRevisions.ts`
- `server/utils/email-marketing/designDependencies.ts`
- `server/utils/email-marketing/designConflict.ts`
- `server/database/migrations/491_email_design_revisions.sql`
- `server/utils/email-marketing/templates.ts` (`updateTemplate` / `deleteTemplate`)
- `server/api/email/templates/[id].patch.ts` and `[id].delete.ts`
- `shared/emailRendering/designActions.ts` (save-draft envelope only)
- `shared/emailRendering/designAdapter.ts` and `designContract.ts` (`assertStaffDesignEdit`)
- Mocked unit tests listed below, plus the save/guard cases in `test/integration/emailDesignRevisions.database.test.ts`

Not reviewed, per the checkpoint: `designReads.ts`, `emailDesignReads.test.ts`, the draft GET route, and `emailDesignDraftReadRoute.test.ts`. The integration file imports the read service; this report uses only its save, projection, and SQL-guard cases as evidence of those behaviors. The PostgreSQL suite was not re-run here because it writes a private schema. The parent reported that suite green separately. This review does not treat that report as a substitute for the findings below.

Checks run here: `vitest` on the seven mocked files below, 46 tests passed. No source, test, or doc edits. No production or shared local database.

## Verdict

No blocker inside the disabled save path. Actor, session, and permission checks are fresh, structural edits cannot be reached through the staff function, and a structured template projection commits revision, head, template row, and receipt together or not at all.

Do not enable the Cloudflare flag until the activation blockers below are handled. Those are conditions on turning the route on, not defects in the current 404 default.

## Activation blockers

### 1. High if enabled — schema 0 still lets the legacy editor diverge, then a structured save overwrites it

`email_design_protect_template_projection` returns immediately unless the current head is schema version 1:

```143:143:server/database/migrations/491_email_design_revisions.sql
  IF NOT FOUND OR version<>1 THEN RETURN NEW; END IF;
```

After `ensureLegacyDesignDocument`, the head is schema 0 / origin `legacy`. The integration suite then updates live `body_html` and expects that update to succeed, while the stored snapshot stays unchanged (`test/integration/emailDesignRevisions.database.test.ts` around the legacy-snapshot case that sets `body_html` to `Later mutable content`). The same window allows `template_kind` to become `template` before the first structured save; `saveTemplateDesignDraft` then rejects with `TEMPLATE_DRAFT_REQUIRED` and does not record that promotion.

`appendRevision` compare-and-swaps the revision head only (`designRevisions.ts` 267–270). It does not compare the live `edm_templates` row with the legacy snapshot. A gated save whose `expectedRevisionId` is still that baseline commits the request design and replaces live source and HTML. The legacy edits made after the snapshot are not a conflict.

Once the head is schema 1, the same trigger rejects live `body_html`, `subject`, and `template_kind` changes (integration case “legacy writes cannot overwrite a versioned draft projection”). That part holds.

This matches the persistence note that unversioned rows keep current behavior and that HTTP activation still needs version-aware legacy mutation handling. Enabling the flag while the old template PATCH remains open reintroduces a lost update.

Minimal test before activation: snapshot a draft, PATCH `body_html` through `updateTemplate`, then `saveTemplateDesignDraft` with the baseline id. The save must conflict, and the live HTML must remain the legacy edit. Repeat for a `template_kind` promotion to `template`.

### 2. High if enabled — open must show the revision the save will CAS, and must not mint history

The save route does not create a document or a legacy baseline. `PATCH` returns 404 `NOT_FOUND` until both already exist (`designRevisions.ts` 186–191 and 267–268). A safe open has to:

- authorize the persisted document client before it returns source, HTML, or revision ids
- return the immutable head id as `expectedRevisionId`, including the schema 0 baseline
- show live template HTML as mutable when the head is schema 0, because that HTML can already differ from the snapshot
- show live HTML as stale when the head is schema 1 and `email_design_revision_id` is not that head
- leave subject and preview on the template row; structured revisions do not store them, and the projection trigger freezes them only after version 1

This review did not inspect the new read implementation. The save contract above is what that open has to satisfy before the flag is turned on.

## Defects in the current path

### 3. Low — versioned client move is rejected in SQL and not translated to a content-free 409

`email_design_protect_owner_scope` raises `55000` with a fixed message and no `CONSTRAINT` (`491_email_design_revisions.sql` 121–123). `rethrowLegacyDesignConflict` only maps `55000` plus constraint `email_design_revision_required`, or `23503` plus `email_design_documents_template_id_fkey` (`designConflict.ts` 12–22).

`PATCH /api/email/templates/:id` accepts `client_id` and `updateTemplate` writes it (`templates.ts` 130–143, `[id].patch.ts` 10 and 36–37). On a row that already has a design document, including a schema 0 baseline, the scope trigger aborts the update. The patch route then rethrows the raw database error. The write does not land. The response is not the content-free 409 used for body and delete conflicts, so the client can see the driver error instead of `email_design_revision_required`.

The exception text itself has no template source. Delete of a referenced template is translated and covered.

Minimal test: with a document row present, `PATCH` `{ client_id: <other uuid> }` returns 409, `statusMessage` is a stable code, and the body contains neither SQL nor `body_source`.

### 4. Low — missing and out-of-scope document ids are distinguishable before persisted-client auth

`validateDesignAction` binds `action.scope.clientId` to `design.scope.clientId` (`designActions.ts` 389–393). The route then authorizes that declared client (`[id].patch.ts` 89–94). Inside the transaction, `NOT_FOUND` and `SCOPE_MISMATCH` are thrown before `authorize(document.client_id)` (`designRevisions.ts` 186–193, then 234).

A caller who can write client A and who sends a document id owned by client B, with the design still scoped to A, gets 409 `SCOPE_MISMATCH`. An unknown id gets 404 `NOT_FOUND`. Both require a UUID. Neither returns the other client id or the stored design. It is still an existence oracle for design-document ids.

Minimal test: one caller, one missing UUID and one document owned by another client. Both responses use the same status, and neither body contains the other client id.

### 5. Low — a renderer failure after the timeout is an unhandled rejection

The render promise is raced with a 15s timer and is not cancelled (`designRevisions.ts` 286–301). The timeout path rolls the transaction back; the integration timeout case covers a promise that never settles. If `renderDocument` rejects after the timer has already won, nothing observes that rejection.

The renderer client is a read-only RPC (`render/client.ts` has no template write). This does not commit a partial draft. On Node it can surface as an unhandled rejection.

Minimal test: `renderDocument` rejects on a timer later than 15s. Expect `RENDER_TIMEOUT`, unchanged `head_revision_id`, and no `unhandledRejection`.

## Future scope

These are real gaps. They are outside the disabled template-draft route.

- Source-only `appendDesignRevision` on a template moves the head and leaves `email_design_revision_id` behind. The integration open case records that as projection state `stale`. The HTTP route calls `saveTemplateDesignDraft` / `saveStaffTemplateDesignDraft` only. Later template writes need the projection saver. A source-only append makes the next legacy body edit 409 while live HTML stays on the previous projection.
- Campaign and module bodies have no projection trigger. `prepareCampaignHtmlForSend` still runs `UPDATE campaigns SET body_html = $2` (`campaigns.ts` 120–126). Scope changes on those tables are blocked once a document exists; content changes are not. Wire those writes only when campaign and module revisions are in scope.
- Subject and preview are read under the owner lock and passed to the renderer (`designRevisions.ts` 286–291). They are not part of the structured payload or the operation digest. After schema 1, the projection trigger rejects changes to them. Changing them still needs the separate atomic metadata operation the persistence note already describes.
- Shared modules (`client_id` null) are allowed inside a client document by the closure (`designDependencies.ts` 120–124) and then require read authority on that null scope. `assertFreshDesignAccess` grants null scope only to `ADMIN` or `MANAGEMENT` (`designAccess.ts` 62–68). An assigned creative cannot save a draft that pins an agency module. That matches the stated shared-scope rule. Embedding shared modules for client authors is a product change, not a hole in this route.
- The projection trigger binds `body_source` to `payload->'blocks'` and does not bind `body_html` (`491_email_design_revisions.sql` 144–150). The only application writer that can move `email_design_revision_id` is the draft saver, in the same statement as the rendered HTML. Legacy `updateTemplate` never sets that column, so it cannot use the allowance. A database role that can set the marker can store other HTML beside the canonical blocks. Worth a constraint if a second writer appears. It is not reachable through the current template PATCH.
- Renderer output does not expand `moduleInstances` or apply instance overrides. `designToRendererDocument` passes `design.blocks` for a template (`designAdapter.ts` 25). Unsupported block types fail closed before insert. Treating `body_html` as a complete render of pinned modules belongs with publication, which this route does not claim (`published: false`).

## What holds

Session and authority

- Flag check is first and is exact string `true` (`[id].patch.ts` 59–61). Missing Cloudflare env is 404. Tested.
- Cookie, then client cookie, then bearer, matches `requireAuth`. Actor id is `validateSession(token).id`. A body `actorId` fails the strict action schema. Tested.
- `assertFreshDesignAccess` calls `validateSession` again and `queryOneFresh` for role, read-only, permission groups, assignment, and active client (`designAccess.ts` 22–69). It does not use `requireAuth`’s request user or `getAssignedClientIds`’ five-minute KV cache.
- The route closes over that token and rechecks inside the transaction, after the owner and document locks, and again after render (`designRevisions.ts` 233–234 and 303–310). Losing `CREATIVE` between the outer check and the inner check returns 403 `design_permission_revoked` and selects no staff fallback for that request (`[id].patch.ts` 95–107). A caller who is only staff at the outer check stays on `saveStaffTemplateDesignDraft`.
- Missing custom role, inactive member, read-only role, and `is_read_only` fail closed for write. `MARKETING_MANAGEMENT` covers active clients and does not cover null scope or, by itself, designer mode. `CREATIVE` is the designer bit. Database errors from the access query propagate rather than granting access. Mocked access tests passed.
- `authorizeModuleRead` is required when dependencies or instances exist, runs on the same transaction, and is invoked again after render. The HTTP callback uses fresh read access for the stored module client. The SQL lookup is `module_id` plus revision id, then owner client and payload scope must match (`designDependencies.ts` 41–62).

Idempotency and atomicity

- Digest is SHA-256 of canonical document id, expected revision, design, and target `source` or `template-draft` (`designRevisions.ts` 72–85, 174–179). A source receipt cannot satisfy a projected retry (`IDEMPOTENCY_CONFLICT` in the integration suite).
- The same actor and operation id take `pg_advisory_xact_lock` before the document work. The receipt primary key is `(actor_id, operation_id)`. Replay returns the stored revision only when document id and digest match, and only after the write authorizer has run again (`designRevisions.ts` 244–259). It does not render again and does not move the head.
- Expected head is the locked `head_revision_id`, not the unlocked first read (`designRevisions.ts` 222–229, 269–270). Staff policy is `assertStaffDesignEdit` against that locked payload (`271–281`).
- Insert revision, advance head, update `edm_templates` source/HTML/marker, and insert the receipt share `transactionWithoutRetry` (`designRevisions.ts` 161–162, 313–351). Render, projection, and receipt failures roll back. Deferred `email_design_committed_head` rejects an unlinked revision at commit.
- Ambiguous commit becomes an error from `transactionWithoutRetry` and a 503 from the route. The same operation id is the recovery key. A new operation id against the old expected revision conflicts once the head has moved.

SQL

- Schema 1 payload is at most 2 MiB of `payload_text`. Schema 0 is exempt. Origin and schema version are paired (`491_email_design_revisions.sql` 18–21).
- One root and one successor per parent. Head and parent foreign keys stay inside the document. Head may advance only to the direct child. Identity columns and client id on the document cannot change. Revision and receipt rows cannot be updated, deleted, or truncated.
- Exactly one of template, module, or campaign. Campaign documents require a client. Owner `client_id` cannot change while a document row exists.
- After schema 1, a template update that changes source, HTML, subject, preview, kind, or the projection marker is rejected unless the marker moves to that head, `body_source` equals `payload.blocks`, kind stays `draft`, and subject and preview stay put. `updateTemplate` does not set `email_design_revision_id`, so a normal legacy content write cannot satisfy that exception.

Route contract

- Path id, `draftId`, and `design.kind === 'template'` are required. The body stream is capped at `DESIGN_ACTION_LIMITS.envelopeBytes` before `JSON.parse`.
- `DesignRevisionError` `NOT_FOUND` is 404, `RENDER_TIMEOUT` is 503, other revision codes are 409. Design `EDIT_FORBIDDEN` and `POLICY_CHANGE_FORBIDDEN` are 403. The success body is unpublished and uses the stored revision `created_at`.
- The timestamp read is a second connection after commit (`[id].patch.ts` 129–137). A failed read returns 503 `design_receipt_unavailable` even though the transaction committed. Retry with the same operation id is the recovery path. Not filed separately because that retry is the documented reconciliation.

## Tests run

Passed, 46 tests, mocked only:

- `test/unit/emailDesignDraftRoute.test.ts`
- `test/unit/emailDesignAccess.test.ts`
- `test/unit/emailDesignConflict.test.ts`
- `test/unit/emailDesignLegacyRoutes.test.ts`
- `test/unit/emailDesignStaffEdit.test.ts`
- `test/unit/emailDesignDependencies.test.ts`
- `test/unit/emailDesignAdapter.test.ts`

Not run: `test/integration/emailDesignRevisions.database.test.ts` and the Kimi read tests. The integration file’s save and trigger cases were read as evidence. They are the right place for the schema 0 conflict test in activation blocker 1.
