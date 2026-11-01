# FigFlow metadata slice review

Read-only review of the uncommitted metadata slice on `ec0dcd39ebea98b45b9976bf297de96575841dd2`. No source edits, no database run, no commit, and no deploy. The coordinator reports 6 targeted PostgreSQL tests and 6 route tests passing. This review did not re-execute them.

Reviewed: `server/utils/email-marketing/designMetadata.ts`, `server/database/migrations/492_email_design_revision_metadata.sql`, the `subject` / `preview_text` columns on the revision insert in `server/utils/email-marketing/designRevisions.ts`, `server/api/email/design/drafts/[id]/metadata.patch.ts`, and the metadata cases in `test/unit/emailDesignMetadataRoute.test.ts` and `test/integration/emailDesignRevisions.database.test.ts` (about lines 1581–1901).

This is not a release-readiness verdict. Native integration, UI, and client gates were not reviewed.

## Verdict

No blocker in the metadata slice. Compare-and-swap, receipt replay, write authority, module rechecks, the projection trigger, schema-0 refusal, and verbatim `payload_text` copy hold on inspection. One low route gap turns known design-contract failures into a generic 503. Ship migration 492 in the same deployment as both revision writers. Do not run 492 while an older saver, which omits the new columns, is still projecting schema-1 drafts.

The earlier render-promise late-rejection note was not re-tested and is not repeated.

## What holds

- The route is 404 unless `FIGFLOW_EDM_DRAFT_SAVES_ENABLED` is the string `true`. It sets `cache-control: no-store`, runs `assertDesignMutationRequest` before reading a 4096-byte strict body, and takes `actorId` from `validateSession` (`metadata.patch.ts` 32–68). An extra `design` field or a 301-character string is 400. Null and `''` stay distinct in the service input.
- Authority is fresh write access, not CREATIVE. Staff and designers both pass. Read-only roles fail `assertFreshDesignAccess` on write (`designAccess.ts` 57–60, `metadata.patch.ts` 56–59). The service authorizes the locked document client again after `FOR UPDATE`, and again after render (`designMetadata.ts` 88 and 153).
- Missing documents, wrong `expectedClientId`, and non-template documents share `NOT_FOUND` before any insert (`designMetadata.ts` 67–72). A non-draft template is `TEMPLATE_DRAFT_REQUIRED` after that authorize (lines 89–90). Schema other than 1 is `STRUCTURED_REVISION_REQUIRED` before render (lines 115–116). The legacy test at `emailDesignRevisions.database.test.ts` 1709–1745 covers schema 0 and the wrong client, and expects the revision count to stay 1.
- CAS: with no receipt, the locked head must equal `expectedRevisionId` (lines 105–106). The insert parents that id. The same `FOR UPDATE` order as block save (template, then document) is held across render, so the concurrent metadata-versus-save test can yield one `REVISION_CONFLICT`. The database parent trigger remains the backstop.
- Replay: the digest is SHA-256 of `target: template-metadata`, document id, expected revision, expected client, subject, and preview (lines 40–55). The same actor and operation id with a different digest is `IDEMPOTENCY_CONFLICT`. A match returns the old receipt and does not render (lines 99–104 and 130–131). The replay test changes the head with a later block save, then replays the metadata operation and expects the original receipt and the later head (`emailDesignRevisions.database.test.ts` 1657–1707). The design-save digest still excludes subject, so a metadata edit does not turn an honest block-save replay into a conflict. The following block save copies the live template subject onto its new revision (`designRevisions.ts` 329–337); the same test expects that copy.
- Payload bytes: the child insert stores `head.payload_text` unchanged (lines 157–163). It does not pass the design through `JSON.stringify(validateEmailDesign(...))`. The atomicity test expects that exact text, with the new subject and preview only on the columns.
- Module revocation: dependencies are resolved before render and again after the post-render write check (lines 129 and 154). Replay resolves them before returning the receipt. The route's module callback is fresh read access on the client id supplied by `resolveStoredDesignDependencies` (`metadata.patch.ts` 73–75), which loads the pinned module revision and authorizes `email_design_documents.client_id` (`designDependencies.ts` 41–58). The PostgreSQL case revokes during render and again on replay and expects no head move (`emailDesignRevisions.database.test.ts` 1827–1901).
- Trigger: migration 492 only adds nullable columns and replaces `email_design_protect_template_projection`. Schema other than 1 still returns immediately (line 11), so legacy rows stay editable until a schema-1 head exists. At schema 1, a subject or preview change is allowed only when the marker advances to the new head, `body_source` still equals that head's `payload->'blocks'`, kind stays `draft`, and the new template subject and preview are not distinct from the new revision's columns (lines 14–21). A direct `UPDATE` of `subject` is what the atomicity test expects to fail with `55000`. The revision immutability trigger still rejects `UPDATE`, so these columns cannot be backfilled onto old rows.
- Legacy insert compatibility: `ensureLegacyDesignDocument` still inserts a schema-0 row without the new columns (`designRevisions.ts` 441). They default to null. Metadata will not append to that head.

## Defect

### Low — design-contract failures become `design_metadata_unavailable`

`saveTemplateDraftMetadata` calls `validateEmailDesign`, `resolveStoredDesignDependencies`, and `designToRendererDocument` (`designMetadata.ts` 117–132). Those throw `EmailDesignError` for an invalid stored design, a broken dependency pin, a scope or closure failure, `LIMIT_EXCEEDED`, or unsupported capabilities.

The block-save route maps that error to 413, 403, or 400 (`server/api/email/design/drafts/[id].patch.ts` 126–135). The metadata route has no `EmailDesignError` branch (`metadata.patch.ts` 83–98). The exception has no `statusCode`, so the client receives 503 `design_metadata_unavailable`. The transaction rolls back, and the response does not include the database error. A permanent validation failure looks like an outage.

Map `EmailDesignError` with the same status split as the block-save route. Add a route test whose mocked save, or a dependency failure, rejects with `EmailDesignError` and expects 400 or 413 rather than 503.

## Release constraint

Apply `492_email_design_revision_metadata.sql` and the saver that writes `subject` and `preview_text` in one deployment. Do not leave old workers running after the function replace.

The new trigger compares the template subject and preview to the **current head revision's** columns, not to the previous template values (`492_email_design_revision_metadata.sql` 18–19). `designRevisions.ts` 329–337 stores the locked template subject and preview on each new schema-1 revision, which is what makes an ordinary block save satisfy the trigger when the template subject is unchanged. A saver from before this slice inserts no subject column, so the new revision stores null. The next projection of a schema-1 draft whose template subject or preview is non-null then raises `email_design_revision_required`, and the draft save rolls back.

The other direction is the same window: the new `INSERT` lists `subject` and `preview_text` (`designMetadata.ts` 157, `designRevisions.ts` 329). Those statements fail if they run before migration 492 adds the columns.

Existing schema-1 revisions stay null on the new columns. Immutability forbids an `UPDATE` backfill. That does not block new writes: the trigger reads the new head, and the next block save records the live template subject, which the previous trigger already froze for the schema-1 lifetime. Metadata on a pre-492 head writes the requested subject onto the new revision and the template together.

## Not filed

- Late rejection of the render promise after `RENDER_TIMEOUT`. Not reproduced here.
- Schema-0 initialize still returning a stale locator. Metadata refuses those heads with `STRUCTURED_REVISION_REQUIRED` and does not change that initialize behavior.
- HTML encoding of subject and preview inside the existing document renderer. Metadata uses that renderer. The template projection path already did too.
- Native editing, UI, and client gates.
