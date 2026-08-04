# Board Knowledge Review, Extraction, and Search Design

## Status

Accepted by the product owner on 2026-08-04. This specification extends the Board Files Library design and is intended for a follow-up pull request stacked on PR #374.

## Outcome

XeroFlow board files remain ordinary working documents until a board member deliberately submits one for knowledge review. XeroFlow extracts the document asynchronously, shows management the extracted content and quality signals, and makes it searchable by the general AI assistant only after management approval.

The result is a governed knowledge workflow rather than an automatic document dump:

1. People keep working documents in the board Files view or on individual tasks.
2. A board member submits an eligible source file for review.
3. XeroFlow extracts and chunks the content without publishing it.
4. A user with the `MANAGEMENT` permission approves or rejects the submission.
5. Approved chunks enter a board-scoped Vectorize index.
6. The assistant searches agency knowledge plus knowledge from boards the caller can access, prioritising the active board and returning citations to the source file.

## Product boundaries

### Files and Knowledge remain distinct

- **Files** is the board's working-document library. Uploading a file does not grant the assistant permission to use it.
- **Knowledge** is a reviewed projection of an immutable file version. It contains extracted text, chunks, provenance, review history, and index state.
- A board document remains owned by `board_files`.
- A task attachment remains owned by `task_attachments` and is not copied into `board_files`.
- A knowledge submission references either source record and snapshots its version identity and metadata. The extraction worker calculates the content checksum; the binary is never duplicated.

This separation permits drafts, evidence, private working material, and unsupported files to remain on a board without silently becoming AI context.

### Supported first-release formats

The following formats can be submitted for knowledge extraction:

- PDF
- Microsoft Word (`.docx`; legacy `.doc` is stored but not indexed)
- Microsoft Excel (`.xlsx`, `.xls`)
- Microsoft PowerPoint (`.pptx`; legacy `.ppt` is stored but not indexed)
- CSV
- TXT
- JSON

Images, videos, audio, archives, design files, and executables may remain in Files but show `Not indexable` in the knowledge column. Image-only PDFs are supported through the PDF OCR path.

## Roles and authorization

### Submitters

A user may submit a source when all of the following are true:

- The user is authenticated.
- The user has write access to the source board.
- The source belongs to that board, directly or through a task.
- The source format is indexable.
- No submission already represents the same source version.

Submitting does not publish anything and does not bypass the source board's authorization boundary.

### Reviewers

Approval, rejection, retry, archival, and de-indexing require `requirePermission(event, 'MANAGEMENT')` in addition to access to the source board. This honours both system roles and custom-role permission groups.

The reviewer may not approve until extraction has completed successfully. Rejection requires a reason. Approval records the reviewer, time, extracted version, and model provenance.

### Assistant readers

The general agency assistant may search:

- Existing agency-wide published knowledge articles.
- Approved knowledge belonging to any board in the caller's server-derived `assistantScope.departmentIds`.

The model cannot supply or broaden these board IDs. The current board is a ranking hint only and never an authorization grant. Client-portal assistant surfaces are excluded from board knowledge until a separate client-facing governance design is approved.

## User experience

### Files view

The existing Board Files table gains a `Knowledge` column with these states:

- `Not submitted`
- `Extracting`
- `Ready for review`
- `Approved · indexing`
- `Used by AI`
- `Rejected`
- `Extraction failed`
- `Archived`
- `Not indexable`

Eligible rows expose `Submit for review`. Repeated clicks are idempotent. Task evidence can be submitted from the aggregated board Files view without changing its task ownership.

Selecting a status opens a Nuxt UI slideover showing:

- Source file, board, related task, uploader, size, type, checksum, and submission time.
- Extraction method and, when applicable, provider and model.
- Page, sheet, slide, character, and chunk counts where available.
- Warnings such as low text density, partial extraction, oversized content, or OCR use.
- A bounded extracted-text preview with page/section markers.
- Review and retry history.

Users with `MANAGEMENT` permission see `Approve`, `Reject`, `Retry extraction`, and `Archive` actions when applicable. Rejection uses a `UModal` with `UFormField` and `UTextarea`; no native browser dialogs are used.

### Review queue

The Board Files view offers a `Knowledge review` filter. Management may also open a compact agency-wide review queue from the existing AI knowledge management surface. The queue still requires access to each source board and never exposes inaccessible filenames or previews.

### Approved sources and citations

An approved row shows `Used by AI`. Its detail panel provides a citation preview. Assistant results identify:

- Article title.
- Source filename.
- Board name.
- Page, slide, sheet, or section when known.
- An authenticated link back to the source in the Files view or task.

The link resolves through an authorized application route; the model never receives a raw storage key or permanent public object URL.

## Persistence model

### `board_knowledge_submissions`

Create an additive table containing:

- `id UUID PRIMARY KEY`
- `department_id UUID NOT NULL REFERENCES departments(id)`
- nullable live `board_file_id` and `task_attachment_id` references, with a check requiring exactly one while the source exists
- immutable `source_type` and `source_entity_id` identity retained after an archived source is deleted
- source snapshot: `source_file_name`, `source_mime_type`, `source_size`, `source_version_key`, and a nullable `source_checksum_sha256` populated by extraction
- `submitted_by`, `submitted_at`
- `review_status`: `pending`, `approved`, `rejected`, or `archived`
- `reviewed_by`, `reviewed_at`, `review_reason`
- `extraction_status`: `queued`, `processing`, `ready`, or `failed`
- `extraction_method`: nullable `native`, `gemini`, or `huggingface`
- `extraction_provider`, `extraction_model`, `extraction_started_at`, `extraction_completed_at`
- extraction measurements: page/sheet/slide count, character count, chunk count, confidence and warnings JSON
- bounded `extraction_error_code` and `extraction_error_message`
- `index_status`: `not_indexed`, `queued`, `indexing`, `indexed`, `failed`, or `removed`
- optional `ai_knowledge_article_id`
- `created_at`, `updated_at`

The source version key uses the existing checksum when available and otherwise a server-generated digest of immutable source-record properties. A unique immutable-source/version constraint makes repeated submission idempotent even after the live file reference is removed. Archived submissions may tombstone their live foreign key while preserving source identity and audit history. A partial unique index permits only one approved version per source; an older approved version may coexist with a newer pending version until the newer approval transaction supersedes it. A changed source is a new immutable knowledge version and never mutates an approved version in place.

### `ai_knowledge_chunks`

Create a chunk table containing:

- `id UUID PRIMARY KEY`
- `article_id UUID NOT NULL REFERENCES ai_knowledge_articles(id)`
- `submission_id UUID NOT NULL REFERENCES board_knowledge_submissions(id)`
- `department_id UUID NOT NULL`
- `chunk_index INT NOT NULL`
- `content TEXT NOT NULL`
- optional `heading`, `page_start`, `page_end`, `sheet_name`, and `slide_number`
- `content_hash`, `vector_id`, `token_estimate`
- `created_at`, `updated_at`

`(article_id, chunk_index)` and `vector_id` are unique. The article stores the canonical normalised extraction; chunk rows are its authoritative retrieval passages. Vector metadata contains only identifiers and compact provenance, not the whole document.

### `ai_knowledge_articles` extensions

Extend the existing table with:

- nullable `department_id`; `NULL` continues to mean agency-wide knowledge
- nullable `board_knowledge_submission_id`
- `source_entity_type`: `board_file`, `task_attachment`, or the existing/manual source
- nullable `source_entity_id`

Existing rows remain approved, published, and agency-wide. Successful extraction creates an unpublished draft article containing the canonical normalised text and its unembedded chunk rows. Board approval changes that draft to `review_status = 'approved'` and `is_published = true`; rejection changes it to `rejected` and leaves it unpublished. Submission and article review state are updated in the same transaction, while the article remains the publication authority.

### Audit history

Create `board_knowledge_audit` with the submission ID, action, previous/next state, actor, bounded metadata, and timestamp. Required actions include submit, extraction start/success/failure, retry, approve, reject, index success/failure, archive, de-index, and source-version mismatch.

## State and consistency rules

Review, extraction, and indexing are deliberately separate states:

```text
submit
  -> extraction queued -> processing -> ready
                              |           |
                              v           +-> management approve -> index queued -> indexed
                            failed        +-> management reject
```

- Extraction completion never publishes the submission.
- The extraction worker records the content checksum before a submission can become ready. Approval is rejected if the current source version identity differs from the submission snapshot.
- Approval transactionally publishes the existing draft article, records review provenance, supersedes any prior approved source version, and queues indexing.
- `Used by AI` is shown only when review is approved and every current chunk is indexed.
- Index failure leaves the approved source visible as `Approved · indexing failed` but it is excluded from retrieval until repair succeeds.
- Archival first marks the article unpublished, then removes its vectors. Database filtering prevents retrieval immediately even if Vectorize deletion is delayed.
- Deleting an approved source must first archive and de-index its knowledge version. Source delete routes call a shared lifecycle guard; they do not independently reproduce this logic.
- Re-uploading or replacing content creates a new submission. The previous approved version remains searchable until the new version is approved, then is atomically superseded and queued for de-indexing.

## Extraction architecture

### Asynchronous execution

Add queue job types for extraction and indexing. The submission endpoint inserts the pending record and dispatches extraction through the existing `JOBS_QUEUE` bridge. Local development uses the existing inline fallback, but the API still responds with the queued submission instead of waiting for a model call.

The internal queue bridge must pass its request event or a narrow binding context into the processor so Workers AI and the dedicated Vectorize binding are available. Queue payloads contain identifiers and version/checksum metadata only; they never contain the document bytes or extracted text.

Jobs are idempotent against submission ID, expected source version, calculated content checksum, and target state. Queue retries cannot publish duplicate articles or vectors. Exhausted retries leave a visible failed state and use the existing job execution ledger/dead-letter operations.

### Native extraction first

The processor downloads the source through `downloadFileBuffer` using the database-resolved storage key and applies size, decompression, and parsing limits.

- TXT, CSV, and JSON: validated text decoding; JSON is rendered into readable structured text.
- XLS/XLSX: use the existing direct `xlsx` dependency, preserving sheet names and bounded row/column context.
- DOCX/PPTX: bounded OOXML adapters preserve headings, paragraphs, tables, slide order, and speaker notes when available. Embedded executables and macros are never run.
- PDF: extract its text layer and page boundaries first.

Native extraction is successful only when it meets format-specific quality thresholds. Text density, replacement-character rate, blank-page ratio, and structural coverage are recorded. Normal digital documents therefore incur no LLM cost or document-content egress.

### AI document extraction

AI extraction is invoked only when native extraction fails, a PDF is scanned, text density is insufficient, or layout/tables require multimodal recovery.

All model calls go through Cloudflare AI Gateway. There is no silent direct-provider fallback for board documents. If Gateway or the configured paid provider is unavailable, extraction fails closed and remains retryable.

Request policy:

- Send the minimum required pages or page batches, never the unrestricted 50 MB upload blindly.
- Batch or split documents so request payloads stay below Gateway and provider limits; reject pathological page counts with a clear review warning.
- Require structured JSON output containing ordered blocks, page/section provenance, tables, warnings, and confidence.
- Set `cf-aig-collect-log-payload: false` on every request. Metadata such as model, tokens, latency, and cost may remain logged.
- Disable Gateway response caching for document extraction routes.
- Use paid provider credentials only. Free/unpaid Gemini services are prohibited for business documents.
- Delete any temporary provider-side file after extraction and record cleanup failure without publishing the source.

### Model selection through Admin Model Ops

The existing Admin -> AI -> Model Ops page is the control plane. Add one runtime-routed, high-risk multimodal feature:

```text
featureKey: board_knowledge_document_extraction
default:    google-ai-studio/gemini-3.6-flash
fallback:   google-ai-studio/gemini-3.5-flash-lite
provider:   aigateway
```

The model identifier carries the AI Gateway upstream provider prefix. The curated catalog may also include verified alternatives such as:

```text
huggingface/PaddlePaddle/PaddleOCR-VL-1.6
```

The current generic `aigateway` runtime provider is retained, but model catalog metadata gains `upstreamProvider`, modality/capability information, operational status, and pricing. Runtime endpoint construction splits the curated upstream prefix from the provider-native model ID.

Admin assignment overrides remain in `ai_model_assignments` and continue to generate `ai_model_assignment_audit` rows. Only allowlisted models compatible with document/PDF input and structured extraction can be selected. The extraction worker calls `resolveAiModelAssignment`; the selected model is never hard-coded outside its default registry seed.

Hugging Face is an optional evaluation lane, not the initial production default. AI Gateway can proxy Hugging Face's Inference API, but the model must also have a functioning managed or dedicated Hugging Face endpoint. XeroFlow must not label a Hugging Face catalog entry production-ready until an endpoint health check and the reference-document benchmark both pass.

Every AI extraction writes `ai_invocations` telemetry under `board_knowledge_document_extraction`, including submission ID, document class, page batch, gateway use, fallback use, tokens, latency, status, and cost-safe metadata. Filenames and extracted content are excluded from telemetry metadata.

## Chunking and indexing

### Chunk construction

Extracted blocks are normalised into semantic chunks rather than truncating an entire article to the embedding model's first approximately 2,000 characters.

- Prefer heading, page, slide, sheet, and table boundaries.
- Apply bounded overlap only when a section must be split.
- Keep source coordinates on every chunk.
- Reject empty or near-duplicate chunks by content hash.
- Store chunk content in Postgres and embed a compact title/provenance prefix plus the chunk body.

### Dedicated Vectorize index

Create a dedicated `KNOWLEDGE_VECTORIZE` binding and index rather than adding board documents to the existing mixed-sensitivity `VECTORIZE` index. This reduces the chance that financial, learned-QA, task, or notification vectors can enter knowledge results.

Each vector carries:

- `type = knowledge_chunk`
- `articleId`
- `chunkId`
- `scopeKey`, either `agency` or `board:<department UUID>`
- compact page/section provenance

Create the `scopeKey` string metadata index before inserting any vectors. Cloudflare applies metadata filters before selecting `topK`, so retrieval can use `$in` over `agency` plus the caller's accessible board scopes. Queries batch the scope list when its compact JSON would approach Vectorize's metadata-filter size limit.

Existing published agency articles are chunked and backfilled into the dedicated index with `scopeKey = agency`. The legacy knowledge vectors remain until the new index passes parity checks, then are removed through a documented cleanup step.

### Retrieval and authoritative ACL

Extend `ToolContext` with an optional server-derived `activeBoardId`. `processUserMessage` already receives a board ID; it must canonicalise and verify it before passing it into the tool context.

The search algorithm is:

1. Generate the query embedding once.
2. If the verified active board is accessible, query `scopeKey = board:<id>` for a small priority candidate set.
3. Query `scopeKey $in [agency, all accessible board scopes]`, batching when necessary.
4. Merge and de-duplicate candidates, applying a modest active-board score boost rather than forcing irrelevant active-board content above strong results.
5. Re-fetch chunks and articles from Postgres with `is_published = true`, `review_status = 'approved'`, indexed state, and `(department_id IS NULL OR department_id = ANY(server-derived accessible IDs))`.
6. Return bounded passages and citations in relevance order.

Postgres is the final authorization boundary. Vector metadata filtering improves isolation and retrieval quality but is not treated as authorization. Missing scope, missing bindings, malformed metadata, stale source state, or database mismatch all fail closed.

## API surface

Board routes, each resolving the board and source server-side:

- `POST /api/agency/boards/:id/files/:fileId/knowledge/submit`
- `POST /api/agency/boards/:id/files/task/:attachmentId/knowledge/submit`
- `GET /api/agency/boards/:id/knowledge`
- `GET /api/agency/boards/:id/knowledge/:submissionId`
- `POST /api/agency/boards/:id/knowledge/:submissionId/retry`
- `POST /api/agency/boards/:id/knowledge/:submissionId/approve`
- `POST /api/agency/boards/:id/knowledge/:submissionId/reject`
- `POST /api/agency/boards/:id/knowledge/:submissionId/archive`

Mutations use POST because they are explicit state transitions with audit consequences. Transition bodies contain only the expected current version and bounded reviewer reason. Invalid or stale transitions return `409`.

The board file list response gains a compact knowledge projection so the Files table does not issue a request per row. Full extracted text is available only from the authorized submission detail route and is capped/paginated.

## Security and privacy controls

- All source and submission lookup is scoped to the resolved board before returning metadata.
- Management permission never replaces board access; both are required for review.
- Queue payloads use IDs and hashes, not document content.
- Parsers apply decompression-bomb, XML entity, row/column, page, character, and timeout limits.
- No macros, formulas, embedded links, or document instructions are executed.
- Extracted content is treated as untrusted data in the assistant tool contract.
- Gateway request/response payload logging is disabled per request.
- No direct or free-tier provider fallback is permitted.
- Raw storage keys and permanent object URLs are never returned to the assistant.
- Database publication checks make archival effective before eventual vector deletion completes.
- Audit and invocation metadata exclude document content and sensitive filenames.

## Operations and rollout

The implementation PR must include:

1. Additive Postgres migration, applied automatically to the configured database.
2. `KNOWLEDGE_VECTORIZE` binding in Wrangler configuration.
3. Runbook commands to create the dedicated 768-dimension cosine index and its `scopeKey` metadata index before backfill.
4. Paid Google provider credentials and Cloudflare AI Gateway route readiness checks.
5. Queue consumer readiness and dead-letter verification.
6. Backfill existing agency knowledge with retrieval-parity reporting.
7. A small reference-document benchmark covering digital PDF, scanned invoice, table-heavy PDF, DOCX, XLSX, PPTX, CSV, TXT, and JSON.
8. Model benchmark results recorded in Model Ops before enabling a non-default provider.
9. A feature flag that keeps submission/review visible while assistant retrieval remains disabled until the index and backfill gates pass.

Production deployment is not part of creating the pull request unless separately requested.

## Marketing and help content

Update the public Boards and AI Knowledge feature descriptions to explain that board files can be submitted into a management-approved, permission-aware knowledge workflow. Update the relevant work-management or AI resource guide with the user procedure. Do not imply that every uploaded file is automatically read by AI.

## Verification requirements

- Migration tests cover one-of source ownership, immutable versions, partial uniqueness, all state checks, article/chunk relationships, and audit indexes.
- Authorization tests prove inaccessible boards leak neither filenames nor extracted previews; management-only transitions require both permission and board access.
- Extraction tests cover every supported format, corrupt inputs, oversized/decompression-bomb inputs, scan fallback, partial pages, idempotent retries, provider failure, and temporary-file cleanup.
- Model Ops tests cover the new feature key, curated upstream providers, primary/fallback resolution, catalog validation, audit entries, and runtime telemetry.
- Retrieval tests prove active-board ranking, multiple-board access, agency articles, inaccessible-board exclusion, stale-vector exclusion, batching, citations, and fail-closed missing bindings.
- Lifecycle tests prove rejection is never searchable, approval is not searchable until indexed, archival immediately disappears, deletion is guarded, and source replacement creates a new version.
- UI tests cover all knowledge states, submission, review preview, approval/rejection, retry, unsupported types, dark mode, mobile layout, keyboard access, and error feedback.
- Run focused tests, full Vitest, typecheck with baseline separation, production build, browser battle tests, `git diff --check`, and an end-to-end reference-document trial before committing implementation completion.

## Alternatives considered

### Automatically index every board upload

Rejected because uploading a working document is not consent to publish it to the assistant. It would also index drafts, duplicates, irrelevant evidence, and unsupported material without accountability.

### Move all files into the existing global knowledge table and index

Rejected because the current knowledge search is agency-wide and the existing Vectorize index contains mixed-sensitivity entity types. Retrofitting board ACL after retrieval would reduce result quality and create an avoidable security boundary.

### Use Gemini for every document

Rejected because deterministic parsing is cheaper, faster, easier to audit, and avoids content egress for normal digital documents. Multimodal AI remains valuable for scanned and layout-heavy material.

### Make Hugging Face OCR the initial default

Rejected for the first release. PaddleOCR-VL is promising and potentially cost-efficient, but production use requires a verified serverless or dedicated endpoint plus operational ownership. The adapter/catalog design preserves this option without making launch depend on it.

### Use Google Document AI Layout Parser immediately

Deferred. It is purpose-built for layout-preserving RAG but would be a separate Google service outside the requested AI Gateway control plane. It remains a future benchmark candidate if Gemini extraction quality is insufficient.

## Official references

- [Cloudflare AI Gateway providers](https://developers.cloudflare.com/ai-gateway/usage/providers/)
- [Cloudflare AI Gateway Hugging Face provider](https://developers.cloudflare.com/ai-gateway/usage/providers/huggingface/)
- [Cloudflare AI Gateway Google AI Studio provider](https://developers.cloudflare.com/ai-gateway/usage/providers/google-ai-studio/)
- [Cloudflare AI Gateway metadata-only logging](https://developers.cloudflare.com/ai-gateway/observability/logging/)
- [Cloudflare Vectorize metadata filtering](https://developers.cloudflare.com/vectorize/reference/metadata-filtering/)
- [Gemini document processing](https://ai.google.dev/gemini-api/docs/document-processing)
- [Gemini 3.6 Flash model](https://ai.google.dev/gemini-api/docs/models/gemini-3.6-flash)
- [Google Gemini API terms](https://ai.google.dev/gemini-api/terms)
- [PaddleOCR-VL-1.6 model card](https://huggingface.co/PaddlePaddle/PaddleOCR-VL-1.6)
