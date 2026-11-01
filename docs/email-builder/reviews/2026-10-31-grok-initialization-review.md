# FigFlow initialization review and subject/preheader contract

Read-only review of local source at `2db9cc6f33caa4c71490b3416963799a2cd37912`. The initialization, revision, request-gate, and migration files are untracked. `FIGFLOW_EDM_DRAFT_SAVES_ENABLED` is still required to be the string `true` or initialize returns 404. This review did not configure that flag, did not edit source, and did not run the PostgreSQL suite. The coordinator reports that the shared request guard is integrated and 17 route tests pass. That suite was not re-executed here.

Scope: `designInitialization.ts`, `initialize.post.ts`, the initialization unit tests, and the revision, contract, and migration 491 behavior those files depend on. Subject and preview recommendations are for the next slice. Native editing and UI are out of scope.

## Verdict

Initialization is safe to keep disabled. There is no blocker in the disabled route. One medium defect makes a repeated initialize look current after a legacy edit has already diverged from the schema-0 snapshot. Two low contract gaps sit beside it. The subject/preheader operation is a separate slice and should not be folded into initialize.

The earlier save-review activation note that a schema-0 divergence could then be overwritten is superseded. `saveTemplateDesignDraft` and `appendDesignRevision` now throw `LEGACY_CONTENT_CHANGED` and leave the row and head unchanged (`designRevisions.ts` 272–287; `test/integration/emailDesignRevisions.database.test.ts` 76–118). That integration test was read, not run.

## What holds

- The route is 404 unless the Cloudflare binding is the string `true` (`initialize.post.ts` 29–30).
- `assertDesignMutationRequest` is exported (`designRequest.ts` 43–61) and runs before session auth (`initialize.post.ts` 32). This review does not re-audit that helper.
- The actor is `user.id` from `validateSession`. The body is strict (`version`, `templateId`, `scope.clientId` only) and capped at 4096 bytes (`initialize.post.ts` 18–24, 44, 67).
- Write access must be `designer`. Staff receive 403 `design_permission_required` before `initializeTemplateDesignDraft` (`initialize.post.ts` 50–63).
- The service locks `edm_templates` `FOR UPDATE`, maps a missing row and a wrong `expectedClientId` to the same `NOT_FOUND`, and calls `ensureLegacyDesignDocument` on that same transaction (`designInitialization.ts` 32–56). `template_kind` is `NOT NULL` and limited to `template` or `draft` (migration 164).
- The snapshot is schema 0, origin `legacy`, `to_jsonb(source_record)` once. It does not render, publish, or update the template (`designRevisions.ts` 369–448). A second call returns the existing head and does not insert (`designInitialization.ts` via `ensureLegacyDesignDocument` 421–428; unit test `emailDesignInitialization.test.ts` 179–216).
- There is no operation receipt. One baseline per owner is the idempotency key. A retry after a commit that the client did not see returns that head. A rollback retries cleanly because `transactionWithoutRetry` does not retry.
- Designer-only initialize is the right gate for starting history. Staff stay on the legacy template PATCH until a designer has initialized and a schema-1 head exists. Metadata edits should use write access, not this CREATIVE gate.

## Defects

### Medium — a repeated initialize hides schema-0 drift

`ensureLegacyDesignDocument` returns the stored head as soon as `head_revision_id` is set. It does not compare the live row with the snapshot (`designRevisions.ts` 421–428).

The save path does that comparison in SQL and rejects the write:

```274:287:server/utils/email-marketing/designRevisions.ts
        `SELECT r.schema_version, r.payload,
          CASE WHEN r.schema_version=0 THEN to_jsonb(source_record)=r.payload ELSE TRUE END AS legacy_unchanged
         FROM email_design_revisions r CROSS JOIN ${table} source_record
         WHERE r.document_id=$1 AND r.id=$2 AND source_record.id=$3`,
        ...
    if (current.schema_version === 0 && !current.legacy_unchanged)
      throw new DesignRevisionError('LEGACY_CONTENT_CHANGED')
```

After initialize, migration 491 still returns early while `schema_version <> 1` (`491_email_design_revisions.sql` 144), so the legacy template PATCH can change `body_html`, `subject`, `preview_text`, or `template_kind`. A later initialize of that draft returns 200 and the original revision id. The following structured save then 409s with `LEGACY_CONTENT_CHANGED`. The unit test at `emailDesignInitialization.test.ts` 196–216 asserts that an existing head is returned with no `INSERT`. It never changes the row between the two calls.

Do not mint a second snapshot. On the existing-head path, in the same transaction, run the same `to_jsonb(source_record) = r.payload` check when `schema_version` is 0. If it fails, throw `LEGACY_CONTENT_CHANGED` and insert nothing. A schema-1 head still returns that head.

### Low — the success locator omits schema and origin

`DesignRevisionReceipt` is only `documentId` and `revisionId` (`designRevisions.ts` 33–36). The route returns `version`, `draftId`, `revisionId`, and `published: false` (`initialize.post.ts` 72–77). A schema-0 baseline and a schema-1 head look the same. A client can parent a structured save on a legacy head without being able to tell. History still keeps the snapshot. The fix belongs on this response: read `schema_version` and `origin` of the locked head in the same transaction and return them. Metadata and save clients need those fields to refuse a schema-0 head.

### Low — library versus draft is decided before the in-transaction authorize

`designInitialization.ts` 42–46 throws `TEMPLATE_DRAFT_REQUIRED` before `authorize(owner.client_id)`. `emailDesignInitialization.test.ts` 120–129 locks that order. The route already requires a designer for the claimed client (`initialize.post.ts` 63), and a client mismatch is `NOT_FOUND` before the kind check, so a caller denied at admission learns nothing. The remaining window is revocation after that admission check: a library row yields 409 `TEMPLATE_DRAFT_REQUIRED` where the inner authorize would have returned 403. Move the kind check to after `authorize(owner.client_id)`. An authorized designer may still see this 409.

## Activation constraints

These are properties of the current disabled path, not new init bugs.

- While the head is schema 0, the projection guard does not freeze the template (`491_email_design_revisions.sql` 144). Legacy PATCH remains live. Structured save now detects that drift. Initialize does not, which is the medium defect above.
- Promoting the row from `draft` to `template` after initialize makes this endpoint return `TEMPLATE_DRAFT_REQUIRED` even when a document and head already exist (`designInitialization.ts` 44–45 runs before `ensureLegacyDesignDocument`). The locator is then unreachable through initialize.
- Keep the flag off until the medium defect and the locator fields are fixed. This review makes no production claim.

## Next slice — subject and preview

Keep subject and preview off `EmailDesignDocument`. The schema is strict and has neither field (`designContract.ts` 41–100). `assertStaffDesignEdit` rejects extra keys and policy changes as `EDIT_FORBIDDEN` (`designContract.ts` 356–395). A metadata write that round-trips the design through `JSON.stringify(validateEmailDesign(payload))` can also change bytes that were supposed to stay identical.

Add nullable `subject` and `preview_text` on `email_design_revisions` in a new migration. Leave migration 491 unchanged if any private test database has already applied it. The existing revision trigger already rejects `UPDATE` and `DELETE` (`491_email_design_revisions.sql` 45–47). Schema 0 rows leave the new columns null; the legacy subject already sits inside the jsonb row snapshot.

Ship the saver and the projection-trigger change together. Once `schema_version` is 1, the current trigger rejects any subject or preview change, including one that advances `email_design_revision_id` (`491_email_design_revisions.sql` 151–152). An ordinary save must start recording the locked template subject and preview on the new revision — the same values it already passes to the renderer (`designRevisions.ts` 297–301). Today the revision insert and the template update omit those columns (`designRevisions.ts` 329 and 344–352). A trigger that requires `NEW.subject` / `NEW.preview_text` to match the new head revision will reject every projected save of a template whose subject is non-null until those columns are written.

Refuse metadata while the locked head `schema_version` is not 1 (`STRUCTURED_REVISION_REQUIRED`). A subject change against a schema-0 head updates the live row, diverges it from `to_jsonb(source_record)`, and makes the next structured save `LEGACY_CONTENT_CHANGED`. Do not promote schema 0 to schema 1 inside the metadata operation.

Contract:

- New target `template-metadata`, its own `operationId`, and the existing receipt table. Digest the canonical `documentId`, `expectedRevisionId`, requested subject, requested preview, and target. Leave the current design digest as `documentId`, `expectedRevisionId`, `design`, and `source` or `template-draft` (`designRevisions.ts` 73–80). Putting the live subject into that digest would turn an honest design replay into `IDEMPOTENCY_CONFLICT` after a metadata edit.
- Under `FOR UPDATE`, require `expectedRevisionId` to be the head. Copy that schema-1 revision's `payload_text` verbatim into the child. Set `schema_version` 1 and origin `design`. Set the new columns to the requested subject and preview. Do not accept a client design body on this operation.
- Reject a non-draft template. Length limits match the template PATCH: subject and `preview_text` are nullable and at most 300 characters (`server/api/email/templates/[id].patch.ts` 12–13). Preserve null and `''` as distinct values.
- Re-render the locked blocks with the requested subject and preview as `subjectLine` and `previewText`. Use the same 15-second timeout as save. Catch the render promise so a late rejection after `RENDER_TIMEOUT` cannot escape the transaction. Re-authorize write access after render. Roll back on render or auth failure. An idempotent replay returns the receipt and does not render.
- In the same transaction, set `edm_templates.subject`, `preview_text`, `body_html`, and `email_design_revision_id`. Leave `body_source` equal to the head payload's blocks and leave `template_kind` as `draft`.
- Replace the version-1 subject/preview freeze so a change is allowed only when the marker advances to that new head, `body_source` still equals `source->'blocks'`, kind stays `draft`, and `NEW.subject` / `NEW.preview_text` are not distinct from the new revision's columns. A legacy PATCH still cannot move the marker, so it cannot change subject once the head is schema 1.
- Authority is fresh write access on the locked document's client, from the session actor. Staff may change subject and preview. Designer block edits stay on the existing save route. This operation does not publish.

Initialize should grow the `schemaVersion`, `origin`, and schema-0 divergence signal above before clients call this operation.

## Tests to add

Initialization, mocked:

- Repeat initialize after the in-memory template row changes returns `LEGACY_CONTENT_CHANGED`, performs no `INSERT`, and leaves the existing head in place.
- A schema-1 existing head still returns that head.
- The success body includes `schemaVersion` and `origin`.
- After the kind check moves, a denied `authorize` on a library row does not return `TEMPLATE_DRAFT_REQUIRED`.

Metadata, when implemented:

- Schema 0 is rejected and the template row is unchanged.
- A staff call copies `payload_text` verbatim and does not accept a design body.
- A concurrent head change conflicts.
- Replaying the same operation id does not render again. A different subject with the same operation id conflicts.
- The trigger rejects a legacy subject `UPDATE` that does not advance the marker.
- An ordinary template-draft save still commits when subject is unchanged and records that subject on the new revision.
- Length 300 is accepted, 301 is rejected, and null stays distinct from empty.

## Not filed

- Missing `assertDesignMutationRequest`. The export and the initialize call are present. The helper was not re-reviewed.
- Absence of an initialize operation receipt. The single baseline is the idempotency key.
- Collapsing a missing template and a wrong client into `NOT_FOUND`.
- Campaign or module projection, publication, and native/UI editing.
- The save-path render promise that can still reject after the 15-second timeout (`designRevisions.ts` 297–316). The metadata slice has to catch its own render promise. This review does not reopen the save route.
