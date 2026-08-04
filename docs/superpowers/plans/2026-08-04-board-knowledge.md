# Board Knowledge Review, Extraction, and Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn selected board documents and task attachments into management-approved, permission-aware AI knowledge with native parsing, configurable AI OCR fallback, source citations, and a dedicated Vectorize index.

**Architecture:** `board_knowledge_submissions` governs immutable source versions through extraction, review, and indexing while unpublished `ai_knowledge_articles` and chunk rows hold the canonical text. Native parsers run first; Cloudflare AI Gateway uses the model selected in Admin Model Ops only when multimodal recovery is required. A dedicated `KNOWLEDGE_VECTORIZE` index filters by board scope before Postgres performs the authoritative publication and access check.

**Tech Stack:** Nuxt 4, Vue 3, Nuxt UI v4, Nitro/h3, Neon PostgreSQL, Cloudflare R2/Queues/Workers AI/Vectorize/AI Gateway, `xlsx`, `jszip`, `fast-xml-parser`, `unpdf`, Zod, Vitest, happy-dom.

## Global Constraints

- Work on `feature/board-knowledge-governance`, stacked on `feature/board-files-library` / PR #374.
- Preserve board-file and task-attachment ownership; never copy their binaries into knowledge records.
- Submitting requires board write access. Review, retry, archival, and de-indexing require both board access and `MANAGEMENT` permission.
- Only PDF, DOCX, XLS/XLS, PPTX, CSV, TXT, and JSON are indexable in release one; legacy DOC/PPT and every image/archive/video/audio type remain stored but not indexable.
- Create unpublished draft articles and chunks during extraction. Only management approval may publish, and retrieval requires every current chunk to be indexed.
- Native parsing always runs before AI extraction.
- Every AI document request routes through Cloudflare AI Gateway with `cf-aig-collect-log-payload: false` and `cf-aig-skip-cache: true`; no direct or free-tier fallback is permitted.
- The extraction feature key is `board_knowledge_document_extraction`; default model is `google-ai-studio/gemini-3.6-flash`, fallback is `google-ai-studio/gemini-3.5-flash-lite`.
- Hugging Face models remain non-production until their endpoint and document benchmark pass.
- Use a dedicated 768-dimension cosine `KNOWLEDGE_VECTORIZE` index with a string metadata index on `scopeKey` created before any vector insert.
- Vector filtering is not authorization. Re-fetch every match from Postgres using the caller's server-derived board IDs.
- Queue payloads contain IDs and version/checksum metadata only, never file bytes or extracted text.
- All forms and dialogs use Nuxt UI v4. Invoke the `frontend-design` skill before editing the review form or Files view.
- Server imports use `~~/server/utils/`; all mutations return bounded error messages and stale transitions return `409`.
- Apply the SQL migration automatically to the configured database after its contract tests pass.
- Update public Boards/Knowledge feature content and the user help guide in the implementation PR.
- Do not deploy production as part of this plan.

---

### Task 1: Persistence and domain contracts

**Files:**
- Create: `server/database/migrations/342_board_knowledge.sql`
- Create: `server/utils/boardKnowledge/types.ts`
- Modify: `app/types/index.ts`
- Test: `test/config/boardKnowledgeMigration.test.ts`
- Test: `test/server/utils/boardKnowledgeTypes.test.ts`

**Interfaces:**
- Produces: `BoardKnowledgeSubmission`, `BoardKnowledgeProjection`, `BoardKnowledgeReviewStatus`, `BoardKnowledgeExtractionStatus`, `BoardKnowledgeIndexStatus`, `BoardKnowledgeSourceType`, `isIndexableBoardKnowledgeFile()`, and `sourceVersionKey()`.
- Consumes: `board_files`, `task_attachments`, `departments`, `team_members`, and `ai_knowledge_articles` created by earlier migrations.

- [x] **Step 1: Write the migration contract test**

Assert that migration 342 contains all three new tables, the one-of-source check, state checks, source/version uniqueness, one-approved-version partial indexes, chunk uniqueness, audit indexes, nullable board scope on articles, and non-destructive `IF NOT EXISTS`/`ADD COLUMN IF NOT EXISTS` guards.

```ts
const sql = readFileSync('server/database/migrations/342_board_knowledge.sql', 'utf8')
expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS board_knowledge_submissions/i)
expect(sql).toMatch(/CHECK \(\(board_file_id IS NOT NULL\)::int \+ \(task_attachment_id IS NOT NULL\)::int = 1\)/i)
expect(sql).toMatch(/review_status IN \('pending', 'approved', 'rejected', 'archived'\)/i)
expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS .*source_version/i)
expect(sql).toMatch(/WHERE review_status = 'approved'/i)
expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS ai_knowledge_chunks/i)
expect(sql).toMatch(/ALTER TABLE ai_knowledge_articles[\s\S]*ADD COLUMN IF NOT EXISTS department_id/i)
```

- [x] **Step 2: Run the migration test and verify RED**

Run: `pnpm vitest run test/config/boardKnowledgeMigration.test.ts`

Expected: FAIL because `342_board_knowledge.sql` does not exist.

- [x] **Step 3: Add migration 342**

Implement the schema from the accepted specification. Use explicit foreign-key delete policies: source deletion is guarded by application lifecycle code, submissions retain auditability, articles cascade their derived chunks, and audit rows cascade with their submission.

```sql
ALTER TABLE ai_knowledge_articles
  ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id),
  ADD COLUMN IF NOT EXISTS board_knowledge_submission_id UUID,
  ADD COLUMN IF NOT EXISTS source_entity_type TEXT,
  ADD COLUMN IF NOT EXISTS source_entity_id UUID;

CREATE TABLE IF NOT EXISTS board_knowledge_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID NOT NULL REFERENCES departments(id),
  board_file_id UUID REFERENCES board_files(id),
  task_attachment_id UUID REFERENCES task_attachments(id),
  source_type TEXT NOT NULL CHECK (source_type IN ('board_file', 'task_attachment')),
  source_entity_id UUID NOT NULL,
  source_file_name TEXT NOT NULL,
  source_mime_type TEXT NOT NULL,
  source_size BIGINT NOT NULL DEFAULT 0,
  source_version_key TEXT NOT NULL,
  source_checksum_sha256 CHAR(64),
  submitted_by UUID NOT NULL REFERENCES team_members(id),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  review_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending', 'approved', 'rejected', 'archived')),
  reviewed_by UUID REFERENCES team_members(id),
  reviewed_at TIMESTAMPTZ,
  review_reason TEXT,
  extraction_status TEXT NOT NULL DEFAULT 'queued'
    CHECK (extraction_status IN ('queued', 'processing', 'ready', 'failed')),
  extraction_method TEXT CHECK (extraction_method IS NULL OR extraction_method IN ('native', 'gemini', 'huggingface')),
  extraction_provider TEXT,
  extraction_model TEXT,
  extraction_started_at TIMESTAMPTZ,
  extraction_completed_at TIMESTAMPTZ,
  extraction_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  extraction_warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  extraction_error_code TEXT,
  extraction_error_message TEXT,
  index_status TEXT NOT NULL DEFAULT 'not_indexed'
    CHECK (index_status IN ('not_indexed', 'queued', 'indexing', 'indexed', 'failed', 'removed')),
  ai_knowledge_article_id UUID REFERENCES ai_knowledge_articles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((board_file_id IS NOT NULL)::int + (task_attachment_id IS NOT NULL)::int = 1)
);
```

Add `ai_knowledge_chunks` and `board_knowledge_audit`, then add the deferred article-to-submission foreign key after both tables exist.

- [x] **Step 4: Write pure domain tests**

Lock supported MIME/extension pairs and deterministic version keys. A mismatched executable MIME with a `.pdf` name must be rejected.

```ts
expect(isIndexableBoardKnowledgeFile('policy.pdf', 'application/pdf')).toBe(true)
expect(isIndexableBoardKnowledgeFile('policy.pdf', 'application/x-msdownload')).toBe(false)
expect(isIndexableBoardKnowledgeFile('legacy.doc', 'application/msword')).toBe(false)
expect(sourceVersionKey({ id: 'f1', checksum: 'abc', storageKey: 'k', size: 3, updatedAt: 'x' })).toBe('sha256:abc')
expect(sourceVersionKey({ id: 'f1', checksum: null, storageKey: 'k', size: 3, updatedAt: 'x' })).toMatch(/^record:/)
```

- [x] **Step 5: Run domain tests and verify RED**

Run: `pnpm vitest run test/config/boardKnowledgeMigration.test.ts test/server/utils/boardKnowledgeTypes.test.ts`

Expected: migration assertions pass; type test fails because the module is missing.

- [x] **Step 6: Implement domain types and frontend projections**

Define the exact projection included on every file row:

```ts
export interface BoardKnowledgeProjection {
  submissionId: string | null
  reviewStatus: BoardKnowledgeReviewStatus | null
  extractionStatus: BoardKnowledgeExtractionStatus | null
  indexStatus: BoardKnowledgeIndexStatus | null
  indexable: boolean
  label: 'Not submitted' | 'Extracting' | 'Ready for review' | 'Approved · indexing' | 'Used by AI' | 'Rejected' | 'Extraction failed' | 'Archived' | 'Not indexable'
  canSubmit: boolean
  canReview: boolean
}
```

Export the same runtime-facing types from `app/types/index.ts`; do not rely on `index.d.ts`.

- [x] **Step 7: Run focused tests**

Run: `pnpm vitest run test/config/boardKnowledgeMigration.test.ts test/server/utils/boardKnowledgeTypes.test.ts`

Expected: PASS.

- [x] **Step 8: Apply and verify migration 342**

Load the configured database connection without printing it, apply the additive migration, and verify the three tables exist:

```bash
/bin/zsh -lc 'set -a; source /Users/paulgiurin/Documents/Projects/dashboard/.env; set +a; psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f server/database/migrations/342_board_knowledge.sql'
/bin/zsh -lc 'set -a; source /Users/paulgiurin/Documents/Projects/dashboard/.env; set +a; psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "SELECT to_regclass('"'"'public.board_knowledge_submissions'"'"'), to_regclass('"'"'public.ai_knowledge_chunks'"'"'), to_regclass('"'"'public.board_knowledge_audit'"'"');"'
```

Expected: migration succeeds and all three table names are non-null.

- [x] **Step 9: Commit the persistence slice**

Commit: `feat: add board knowledge persistence contracts`

---

### Task 2: Source resolution, repository, and lifecycle state machine

**Files:**
- Create: `server/utils/boardKnowledge/repository.ts`
- Create: `server/utils/boardKnowledge/lifecycle.ts`
- Test: `test/server/utils/boardKnowledgeRepository.test.ts`
- Test: `test/server/utils/boardKnowledgeLifecycle.test.ts`

**Interfaces:**
- Consumes: domain types from Task 1, `queryOne`, `queryRows`, `execute`, and `transaction` from `server/utils/db.ts`.
- Produces: `resolveKnowledgeSource(departmentId, sourceType, sourceId)`, `createSubmission(input)`, `getSubmissionForBoard(id, departmentId)`, `listBoardKnowledge(departmentId)`, `transitionSubmission(input)`, `recordKnowledgeAudit(input)`, and `guardKnowledgeSourceDeletion(input)`.

- [x] **Step 1: Write repository tests**

Cover board-file and task-attachment resolution with a mandatory board predicate, missing storage keys, file metadata projection, idempotent existing submissions, and list/detail queries that never select extracted content for the summary list.

```ts
expect(mockQueryOne).toHaveBeenCalledWith(
  expect.stringMatching(/FROM board_files[\s\S]*department_id = \$2/),
  [FILE_ID, BOARD_ID]
)
expect(mockQueryOne).toHaveBeenCalledWith(
  expect.stringMatching(/task_attachments[\s\S]*JOIN tasks[\s\S]*t\.department_id = \$2/),
  [ATTACHMENT_ID, BOARD_ID]
)
```

- [x] **Step 2: Run repository tests and verify RED**

Run: `pnpm vitest run test/server/utils/boardKnowledgeRepository.test.ts`

Expected: FAIL because the repository module is missing.

- [x] **Step 3: Implement source resolution and repository queries**

Return only server-resolved storage metadata:

```ts
export interface ResolvedKnowledgeSource {
  sourceType: 'board_file' | 'task_attachment'
  sourceId: string
  departmentId: string
  fileName: string
  mimeType: string
  size: number
  storageKey: string
  checksum: string | null
  versionKey: string
  task: { id: string, title: string } | null
}
```

Map unique violations for the source/version index to the existing submission instead of returning a generic 500.

- [x] **Step 4: Write lifecycle transition tests**

Test the allowed transitions and stale expected-state checks:

```ts
expect(canTransitionBoardKnowledge({ review: 'pending', extraction: 'ready', index: 'not_indexed' }, 'approve')).toBe(true)
expect(canTransitionBoardKnowledge({ review: 'pending', extraction: 'processing', index: 'not_indexed' }, 'approve')).toBe(false)
expect(canTransitionBoardKnowledge({ review: 'rejected', extraction: 'ready', index: 'not_indexed' }, 'retry')).toBe(false)
```

Assert approval publishes the draft article, archives the previous approved source version, marks indexing queued, and inserts an audit row in one transaction. Assert archive unpublishes before vector cleanup is dispatched.

- [x] **Step 5: Run lifecycle tests and verify RED**

Run: `pnpm vitest run test/server/utils/boardKnowledgeLifecycle.test.ts`

Expected: FAIL because lifecycle exports are missing.

- [x] **Step 6: Implement the state machine**

Use a pure transition guard plus transactional persistence. Reject stale state with:

```ts
throw createError({ statusCode: 409, statusMessage: 'Knowledge submission changed; refresh and try again' })
```

`guardKnowledgeSourceDeletion` must return `clear`, `archive_required`, or `blocked_extraction`; callers never infer deletion safety from labels.

- [x] **Step 7: Run focused tests and commit**

Run: `pnpm vitest run test/server/utils/boardKnowledgeRepository.test.ts test/server/utils/boardKnowledgeLifecycle.test.ts`

Expected: PASS.

Commit: `feat: add governed board knowledge lifecycle`

---

### Task 3: Bounded native document extraction and semantic chunking

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `server/utils/boardKnowledge/extractNative.ts`
- Create: `server/utils/boardKnowledge/chunking.ts`
- Test: `test/server/utils/boardKnowledgeNativeExtraction.test.ts`
- Test: `test/server/utils/boardKnowledgeChunking.test.ts`
- Create: `test/helpers/boardKnowledgeFixtures.ts`
- Fixtures: `test/fixtures/board-knowledge/` for plain-text samples only

**Interfaces:**
- Consumes: `xlsx`, existing `jszip`, existing `fast-xml-parser`, and new direct dependency `unpdf`.
- Produces: `extractNativeDocument(input): Promise<NativeExtractionResult>` and `buildKnowledgeChunks(result): KnowledgeChunkDraft[]`.

- [x] **Step 1: Add small deterministic fixtures**

Create plain-text TXT, CSV, and JSON fixtures with no customer data. Add `test/helpers/boardKnowledgeFixtures.ts` to generate XLSX, DOCX, PPTX, digital PDF, blank/scanned-like PDF, corrupt ZIP, and oversized-expansion buffers deterministically in memory so binary files do not need to be patched into the repository.

- [x] **Step 2: Write failing native extraction tests**

Assert preserved source coordinates and bounded output:

```ts
const result = await extractNativeDocument({ bytes, fileName: 'forecast.xlsx', mimeType: XLSX_MIME })
expect(result.method).toBe('native')
expect(result.blocks).toEqual(expect.arrayContaining([
  expect.objectContaining({ kind: 'table', sheetName: 'Weekly forecast' })
]))
```

Test PDF page limits before fan-out, OOXML uncompressed-byte limits, XML entities disabled, spreadsheet row/column caps, invalid UTF-8 warnings, and scan fallback signals.

- [x] **Step 3: Run extraction tests and verify RED**

Run: `pnpm vitest run test/server/utils/boardKnowledgeNativeExtraction.test.ts`

Expected: FAIL because the extractor does not exist.

- [x] **Step 4: Install and implement the native adapters**

Run: `pnpm add unpdf`

Use `getDocumentProxy` and `extractText(..., { mergePages: false })` from `unpdf`; check `pdf.numPages` before extraction and race parsing against a bounded timeout. Parse DOCX/PPTX OOXML with JSZip and `fast-xml-parser`, allowing only known XML paths and never following external relationships. Use `xlsx` with `cellFormula: false`, `cellHTML: false`, bounded sheet/row/column iteration, and string values only.

Return:

```ts
export interface NativeExtractionResult {
  outcome: 'usable' | 'needs_ai' | 'failed'
  method: 'native'
  blocks: ExtractionBlock[]
  metrics: { pages?: number, sheets?: number, slides?: number, characters: number, blankRatio: number, replacementRatio: number }
  warnings: string[]
  errorCode: string | null
}
```

- [x] **Step 5: Write failing chunking tests**

Assert headings, page/sheet/slide boundaries, maximum chunk size, bounded overlap, stable hashes, and removal of empty/duplicate chunks.

```ts
expect(chunks.every(chunk => chunk.content.length <= 2200)).toBe(true)
expect(chunks[0]).toMatchObject({ chunkIndex: 0, pageStart: 1, pageEnd: 1 })
expect(new Set(chunks.map(chunk => chunk.contentHash)).size).toBe(chunks.length)
```

- [x] **Step 6: Implement semantic chunking**

Use 1,800 target characters, 2,200 hard maximum, and at most 200 characters of overlap only when splitting a single structural block. Never merge two sheets or slides into one chunk.

- [x] **Step 7: Run focused tests and commit**

Run: `pnpm vitest run test/server/utils/boardKnowledgeNativeExtraction.test.ts test/server/utils/boardKnowledgeChunking.test.ts`

Expected: PASS with all fixture bounds enforced.

Commit: `feat: add bounded board document extraction`

---

### Task 4: Model Ops catalog and privacy-safe AI Gateway adapter

**Files:**
- Modify: `server/utils/ai/modelRegistry.ts`
- Modify: `server/utils/ai/modelAssignments.ts`
- Modify: `server/utils/ai/cloudflareModelCatalog.ts`
- Create: `server/utils/boardKnowledge/modelCatalog.ts`
- Create: `server/utils/boardKnowledge/extractAi.ts`
- Modify: `server/api/admin/ai/model-ops/model-map.get.ts`
- Test: `test/server/utils/boardKnowledgeModelOps.test.ts`
- Test: `test/server/utils/boardKnowledgeAiExtraction.test.ts`
- Modify: `.env.example`
- Modify: `.dev.vars.example`

**Interfaces:**
- Consumes: `resolveAiModelAssignment`, `recordAiInvocation`, `AI_GATEWAY_URL`, `AI_GATEWAY_AUTH_TOKEN`, and paid Google/Hugging Face credentials.
- Produces: curated `GatewayDocumentModel`, `parseGatewayModelId()`, `extractDocumentWithAi(input)`, and Model Ops feature `board_knowledge_document_extraction`.

- [x] **Step 1: Write Model Ops tests**

Assert that the registry exposes one unique, runtime-controllable multimodal feature and that provider detection maps curated prefixes to `aigateway`:

```ts
expect(findEditableAssignmentFeature('board_knowledge_document_extraction')).toMatchObject({ ok: true })
expect(supportedProvidersForFeature('board_knowledge_document_extraction')).toEqual(['aigateway'])
expect(providerForModel('google-ai-studio/gemini-3.6-flash')).toBe('aigateway')
expect(providerForModel('huggingface/PaddlePaddle/PaddleOCR-VL-1.6')).toBe('aigateway')
```

The Hugging Face entry must be `preview` or `unknown`, never `production`.

- [x] **Step 2: Run Model Ops tests and verify RED**

Run: `pnpm vitest run test/server/utils/boardKnowledgeModelOps.test.ts`

Expected: FAIL because the feature and curated models are absent.

- [x] **Step 3: Add curated upstream metadata and runtime assignment support**

Use canonical IDs:

```ts
export const BOARD_DOCUMENT_MODELS = {
  GEMINI_36_FLASH: 'google-ai-studio/gemini-3.6-flash',
  GEMINI_35_FLASH_LITE: 'google-ai-studio/gemini-3.5-flash-lite',
  PADDLE_OCR_VL_16: 'huggingface/PaddlePaddle/PaddleOCR-VL-1.6'
} as const
```

Keep `provider = 'aigateway'`; add `upstreamProvider`, `supportsPdf`, `supportsStructuredOutput`, and `operationalStatus` to curated catalog metadata. The Cloudflare Workers AI catalog remains additive and is not treated as a complete third-party Gateway catalog.

- [x] **Step 4: Write AI adapter tests**

Mock `fetch` and assert Google URL construction, model fallback, structured response validation, 15 MB inline batch cap, no direct-provider retry, and exact privacy headers:

```ts
expect(fetcher).toHaveBeenCalledWith(
  expect.stringContaining('/google-ai-studio/v1/models/gemini-3.6-flash:generateContent'),
  expect.objectContaining({
    headers: expect.objectContaining({
      'cf-aig-collect-log-payload': 'false',
      'cf-aig-skip-cache': 'true'
    })
  })
)
```

Assert `recordAiInvocation` metadata contains submission ID, document class, and batch number but no filename or extracted text.

- [x] **Step 5: Run adapter tests and verify RED**

Run: `pnpm vitest run test/server/utils/boardKnowledgeAiExtraction.test.ts`

Expected: FAIL because `extractAi.ts` is missing.

- [x] **Step 6: Implement Google adapter and guarded Hugging Face seam**

Resolve the assignment once per extraction. Call Google through `${AI_GATEWAY_URL root}/google-ai-studio/v1/models/${model}:generateContent`. Require Zod-validated structured output. Attempt the configured fallback through Gateway only when the primary returns an operational error; validation failures are recorded and fail closed. The Hugging Face adapter returns `model_endpoint_unverified` unless its curated status and environment health flag are both production-ready.

- [x] **Step 7: Run focused tests and commit**

Run: `pnpm vitest run test/server/utils/boardKnowledgeModelOps.test.ts test/server/utils/boardKnowledgeAiExtraction.test.ts test/server/api/adminAiModelOps.test.ts`

Expected: PASS.

Commit: `feat: route board OCR through Model Ops`

---

### Task 5: Queue processors and extraction persistence

**Files:**
- Create: `server/utils/boardKnowledge/processExtraction.ts`
- Create: `server/utils/boardKnowledge/processIndexing.ts`
- Modify: `server/utils/queue.ts`
- Modify: `server/utils/queueConsumer.ts`
- Modify: `server/api/internal/process-job.post.ts`
- Modify: `server/plugins/queue.ts`
- Test: `test/server/utils/boardKnowledgeProcessing.test.ts`
- Test: `test/server/utils/queueConsumerBoardKnowledge.test.ts`
- Test: `test/server/api/processJobContext.test.ts`

**Interfaces:**
- Consumes: repository, native extractor, AI extractor, chunker, storage download, and queue ledger.
- Produces: queue types `knowledge.extract` and `knowledge.index`, `processBoardKnowledgeExtraction(context, payload)`, and `processBoardKnowledgeIndexing(context, payload)`.

- [x] **Step 1: Write failing processor tests**

Cover native success, native-to-AI escalation, checksum calculation, draft article creation, atomic chunk replacement, extraction failure, idempotent already-ready jobs, and stale version refusal.

```ts
await processBoardKnowledgeExtraction(ctx, { submissionId: SUBMISSION_ID, expectedVersionKey: 'sha256:abc' })
expect(mockExtractAi).not.toHaveBeenCalled()
expect(mockPersistDraft).toHaveBeenCalledWith(expect.objectContaining({
  reviewStatus: 'draft',
  isPublished: false
}))
```

- [x] **Step 2: Run processor tests and verify RED**

Run: `pnpm vitest run test/server/utils/boardKnowledgeProcessing.test.ts`

Expected: FAIL because processors do not exist.

- [x] **Step 3: Implement extraction orchestration**

State progression is `queued -> processing -> ready|failed`. Persist the checksum before ready. Replace draft chunks transactionally only when the source version and processing lease still match. Bound error codes/messages and record every state change in `board_knowledge_audit`.

- [x] **Step 4: Write queue routing and event-context tests**

Assert `processJob(job, { event })` routes both new types and that the internal route supplies its actual H3 event. The legacy one-argument call remains supported for job types that do not need bindings.

- [x] **Step 5: Modify queue contracts and consumers**

```ts
export interface QueueProcessingContext { event?: H3Event }
export async function processJob(job: QueueJob, context: QueueProcessingContext = {}): Promise<void>
```

The standalone consumer still posts identifiers only. The Pages internal route provides the event; local inline fallback calls the extraction processor with the submission request event.

- [x] **Step 6: Run focused tests and commit**

Run: `pnpm vitest run test/server/utils/boardKnowledgeProcessing.test.ts test/server/utils/queueConsumerBoardKnowledge.test.ts test/server/api/processJobContext.test.ts`

Expected: PASS.

Commit: `feat: process board knowledge asynchronously`

---

### Task 6: Board-scoped submission and review APIs

**Files:**
- Create: `server/api/agency/boards/[id]/files/[fileId]/knowledge/submit.post.ts`
- Create: `server/api/agency/boards/[id]/files/task/[attachmentId]/knowledge/submit.post.ts`
- Create: `server/api/agency/boards/[id]/knowledge/index.get.ts`
- Create: `server/api/agency/boards/[id]/knowledge/[submissionId].get.ts`
- Create: `server/api/agency/boards/[id]/knowledge/[submissionId]/retry.post.ts`
- Create: `server/api/agency/boards/[id]/knowledge/[submissionId]/approve.post.ts`
- Create: `server/api/agency/boards/[id]/knowledge/[submissionId]/reject.post.ts`
- Create: `server/api/agency/boards/[id]/knowledge/[submissionId]/archive.post.ts`
- Test: `test/server/api/boardKnowledgeApi.test.ts`

**Interfaces:**
- Consumes: board resolution from `boardFiles.ts`, `requireWriteAccess`, `requirePermission`, repository/lifecycle functions, and `enqueue`.
- Produces: the API surface from the accepted specification.

- [x] **Step 1: Write route tests for every authorization boundary**

Assert submit calls both board resolution and write admission; review calls board resolution and `requirePermission(event, 'MANAGEMENT')`. Ensure inaccessible submission IDs return 404 without leaking source metadata.

- [x] **Step 2: Write transition and validation tests**

Cover unsupported formats, idempotent submit, stale `expectedUpdatedAt`, missing rejection reason, reason length limit, approve-before-ready, retry-after-failure, and archive dispatching de-index work.

```ts
await expect(rejectHandler(eventWith({ reason: '' }))).rejects.toMatchObject({ statusCode: 400 })
expect(mockRequirePermission).toHaveBeenCalledWith(expect.anything(), 'MANAGEMENT')
```

- [x] **Step 3: Run API tests and verify RED**

Run: `pnpm vitest run test/server/api/boardKnowledgeApi.test.ts`

Expected: FAIL because the routes are missing.

- [x] **Step 4: Implement routes as thin adapters**

Do not place SQL or model calls in route files. Return `202` semantics in the response body for queued work and the canonical submission projection. Use `readBody` plus Zod for transition inputs.

- [x] **Step 5: Run API tests and commit**

Run: `pnpm vitest run test/server/api/boardKnowledgeApi.test.ts test/server/api/boardFilesApi.test.ts`

Expected: PASS without regressing existing board file routes.

Commit: `feat: add board knowledge review APIs`

---

### Task 7: Board Files projection and deletion guard

**Files:**
- Modify: `server/utils/boardFiles.ts`
- Modify: `server/api/agency/boards/[id]/files/[fileId].delete.ts`
- Modify: `server/api/agency/tasks/[id]/attachments/[attachmentId].delete.ts`
- Modify: `server/api/agency/tasks/[id].delete.ts`
- Modify: `server/api/storage/[key].delete.ts`
- Modify: `app/types/index.ts`
- Test: `test/server/utils/boardFiles.test.ts`
- Test: `test/server/api/boardKnowledgeDeletion.test.ts`

**Interfaces:**
- Consumes: `BoardKnowledgeProjection` and `guardKnowledgeSourceDeletion`.
- Produces: `BoardFileItem.knowledge` for board and task rows; deletion routes that archive/de-index or block processing sources before removing storage.

- [x] **Step 1: Extend aggregation tests**

Add latest-submission rows to the mapper and assert every file receives a correct label, `indexable`, `canSubmit`, and `canReview` projection. Unsupported formats receive `Not indexable` even with no submission.

- [x] **Step 2: Run mapper tests and verify RED**

Run: `pnpm vitest run test/server/utils/boardFiles.test.ts`

Expected: FAIL because `knowledge` is absent.

- [x] **Step 3: Join latest knowledge state into both file queries**

Use a `LEFT JOIN LATERAL` ordered by submission creation time. Do not add one query per file. Derive authorization booleans from the admitted user and permission groups, not from database role strings alone.

- [x] **Step 4: Write deletion lifecycle tests**

Assert processing sources return 409, approved sources are unpublished and queued for de-index before delete, and ordinary files retain existing deletion behaviour. Repeat for task attachments.

- [x] **Step 5: Implement the shared deletion guard calls**

Keep storage deletion after the database/lifecycle transaction, matching the existing board-file cleanup posture. If de-index dispatch fails, the article is already unpublished and retrieval remains closed.

- [x] **Step 6: Run focused tests and commit**

Run: `pnpm vitest run test/server/utils/boardFiles.test.ts test/server/api/boardKnowledgeDeletion.test.ts test/server/api/boardFilesApi.test.ts`

Expected: PASS.

Commit: `feat: surface and protect board knowledge sources`

---

### Task 8: Files-view submission and management review experience

**Required skill before Step 1:** Invoke `frontend-design` from `~/.Codex/plugins/marketplaces/Codex-plugins-official/plugins/frontend-design/skills/frontend-design/SKILL.md` and apply it to the form/slideover work.

**Files:**
- Create: `app/components/board/knowledge/BoardKnowledgeReviewSlideover.vue`
- Create: `app/composables/useBoardKnowledge.ts`
- Modify: `app/components/board/views/BoardFilesView.vue`
- Modify: `app/utils/boardFiles.ts`
- Modify: `app/types/index.ts`
- Test: `test/components/boardKnowledgeReviewSlideover.test.ts`
- Modify: `test/components/boardFilesView.test.ts`

**Interfaces:**
- Consumes: Task 6 APIs and Task 7 file projections.
- Produces: submission action, knowledge filter/status column, extracted preview, management review actions, and retry/archive controls.

- [x] **Step 1: Write Files-view integration tests**

Cover `Submit for review`, disabled/not-indexable rows, idempotent loading, knowledge-status filtering, and refreshing the file list after a mutation.

```ts
expect(wrapper.text()).toContain('Ready for review')
await wrapper.get('[data-testid="submit-knowledge-board-file-1"]').trigger('click')
expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/knowledge/submit'), expect.objectContaining({ method: 'POST' }))
```

- [x] **Step 2: Write slideover tests**

Cover bounded preview, provenance, quality warnings, management-only buttons, rejection reason form, stale conflict reload, retry, archive, focus return, and error toasts.

- [x] **Step 3: Run component tests and verify RED**

Run: `pnpm vitest run test/components/boardFilesView.test.ts test/components/boardKnowledgeReviewSlideover.test.ts`

Expected: FAIL because the knowledge UI does not exist.

- [x] **Step 4: Implement composable and slideover**

Use `$fetch` mutations, `UFormField`, `UTextarea`, `UButton`, `UBadge`, `UAlert`, `USkeleton`, `UModal`, and `USlideover`. Keep the review layout as a single column in constrained width; do not use viewport `grid-cols-2` inside the slideover.

- [x] **Step 5: Integrate the status column and review filter**

Add `knowledge: 'all' | 'review' | 'approved' | 'failed' | 'not_submitted'` to `filterBoardFileItems`. Ensure action buttons do not trigger download or task navigation.

- [x] **Step 6: Run component tests and commit**

Run: `pnpm vitest run test/components/boardFilesView.test.ts test/components/boardKnowledgeReviewSlideover.test.ts test/app/boardFilesViewIntegration.test.ts`

Expected: PASS.

Commit: `feat: add board knowledge review experience`

---

### Task 9: Dedicated Vectorize adapter, index processor, and backfill

**Files:**
- Modify: `wrangler.toml`
- Create: `server/utils/boardKnowledge/vectorize.ts`
- Complete: `server/utils/boardKnowledge/processIndexing.ts`
- Create: `scripts/board-knowledge-backfill.ts`
- Create: `docs/runbooks/board-knowledge.md`
- Test: `test/server/utils/boardKnowledgeVectorize.test.ts`
- Test: `test/scripts/boardKnowledgeBackfill.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: Workers AI `AI` binding, new `KNOWLEDGE_VECTORIZE` binding, article chunks, and queue context.
- Produces: `generateKnowledgeEmbedding`, `upsertKnowledgeChunks`, `deleteKnowledgeVectors`, `queryKnowledgeVectors`, and an idempotent backfill command.

- [ ] **Step 1: Write Vectorize adapter tests**

Assert it never falls back to shared `VECTORIZE`, upserts compact metadata, deletes by stored vector IDs, passes `scopeKey` filters before `topK`, and returns empty/error state when either binding is missing.

```ts
expect(mockIndex.query).toHaveBeenCalledWith(expect.any(Array), {
  topK: 12,
  returnMetadata: 'all',
  filter: { scopeKey: { $in: ['agency', `board:${BOARD_ID}`] } }
})
```

- [ ] **Step 2: Run adapter tests and verify RED**

Run: `pnpm vitest run test/server/utils/boardKnowledgeVectorize.test.ts`

Expected: FAIL because the adapter is missing.

- [ ] **Step 3: Implement binding and adapter**

Add:

```toml
[[vectorize]]
binding = "KNOWLEDGE_VECTORIZE"
index_name = "agency-knowledge"
```

Generate 768-dimension embeddings with `@cf/baai/bge-base-en-v1.5`. Do not truncate below the chunk contract. Mark a submission indexed only after every expected current chunk has a stored vector ID and successful upsert.

- [ ] **Step 4: Write backfill tests**

Assert dry-run output, agency `scopeKey`, deterministic chunks, skip-on-matching-content-hash, bounded batches, restart safety, and parity counts. The script refuses to run without `BOARD_KNOWLEDGE_BACKFILL_ACK=true`.

- [ ] **Step 5: Implement script, package command, and runbook**

Add `pnpm board-knowledge:backfill`. Document exact resource commands:

```bash
pnpm exec wrangler vectorize create agency-knowledge --dimensions=768 --metric=cosine
pnpm exec wrangler vectorize create-metadata-index agency-knowledge --property-name=scopeKey --type=string
pnpm exec wrangler vectorize list-metadata-index agency-knowledge
```

Document AI Gateway paid-key readiness, payload-log/caching checks, queue/DLQ checks, feature flag, dry run, backfill, parity verification, enablement, and rollback.

- [ ] **Step 6: Run focused tests and commit**

Run: `pnpm vitest run test/server/utils/boardKnowledgeVectorize.test.ts test/scripts/boardKnowledgeBackfill.test.ts`

Expected: PASS.

Commit: `feat: index approved knowledge in dedicated Vectorize`

---

### Task 10: Permission-aware assistant retrieval and citations

**Files:**
- Modify: `server/utils/ai/toolContext.ts`
- Modify: `server/utils/aiChatEngine.ts`
- Modify: `server/utils/ai/tools/knowledge.ts`
- Create: `server/utils/boardKnowledge/search.ts`
- Modify: `server/utils/aiContextRetriever.ts` only if its direct knowledge context path duplicates the tool search
- Test: `test/ai/tools/knowledge.boardScope.test.ts`
- Test: `test/server/utils/boardKnowledgeSearch.test.ts`
- Modify: `test/server/utils/aiContextRetriever.test.ts` if direct retrieval changes

**Interfaces:**
- Consumes: `assistantScope.departmentIds`, verified active board, dedicated Vectorize adapter, and authoritative Postgres rows.
- Produces: `ToolContext.activeBoardId`, `searchBoardKnowledge(query, context)`, and cited `search_knowledge` results.

- [ ] **Step 1: Write search ranking and ACL tests**

Cover agency knowledge, multiple accessible boards, inaccessible high-score vectors, active-board boost, irrelevant active-board content, duplicate chunks, stale/unpublished rows, missing bindings, and `$in` batching below 2,048-byte filter JSON.

```ts
expect(result.items[0]).toMatchObject({
  boardId: ACTIVE_BOARD_ID,
  sourceFileName: 'Cashflow policy.pdf',
  pageStart: 2
})
expect(result.items.some(item => item.boardId === INACCESSIBLE_BOARD_ID)).toBe(false)
```

- [ ] **Step 2: Run search tests and verify RED**

Run: `pnpm vitest run test/server/utils/boardKnowledgeSearch.test.ts`

Expected: FAIL because scoped search is missing.

- [ ] **Step 3: Implement batched retrieval and authoritative re-fetch**

Generate the query embedding once. Query active scope and accessible scopes, merge by chunk ID, apply a bounded active-board boost, then run one Postgres query with published/review/index state and department predicates. If the caller has no department IDs, only `agency` is searchable.

- [ ] **Step 4: Write tool-context and citation tests**

Assert an unverified caller-provided board ID never reaches `ToolContext.activeBoardId`. The server must canonicalise it and confirm it appears in `assistantScope.departmentIds`. Assert tool output includes authenticated application URLs but no storage key/permanent object URL.

- [ ] **Step 5: Integrate the knowledge tool**

Return compact citations:

```ts
{
  id: chunk.id,
  title: article.title,
  snippet: chunk.content.slice(0, 500),
  score,
  source: {
    fileName,
    boardName,
    pageStart,
    pageEnd,
    sheetName,
    slideNumber,
    url
  }
}
```

Keep `returnsUntrusted: true`. The dedicated-index path is enabled only when `BOARD_KNOWLEDGE_SEARCH_ENABLED=true`; otherwise retain the existing published agency KB search until backfill gates pass.

- [ ] **Step 6: Run focused tests and commit**

Run: `pnpm vitest run test/server/utils/boardKnowledgeSearch.test.ts test/ai/tools/knowledge.boardScope.test.ts test/ai/tools/knowledge.acl.test.ts test/server/utils/aiContextRetriever.test.ts`

Expected: PASS.

Commit: `feat: search board knowledge with source citations`

---

### Task 11: Agency review queue, public feature sync, and user guidance

**Required skill before editing any review forms:** Invoke the project `frontend-design` skill.

**Files:**
- Modify: `app/pages/agency/ai/knowledge/index.vue`
- Create: `server/api/agency/ai/knowledge/board-review.get.ts`
- Modify: `app/pages/features/index.vue`
- Modify: `app/pages/features/[slug].vue`
- Modify: `app/components/MarketingNav.vue` only if the existing category copy needs the new capability; do not add a duplicate top-level entry
- Modify: `app/pages/resources/work-management.vue`
- Test: `test/app/boardKnowledgeReviewQueue.test.ts`
- Test: `test/app/boardKnowledgeMarketing.test.ts`

**Interfaces:**
- Consumes: board-scoped review list API and management permission.
- Produces: an agency-wide pending review queue that filters inaccessible boards, accurate public copy, and bookkeeper/team operating guidance.

- [ ] **Step 1: Write review-queue authorization and UI tests**

Assert `MANAGEMENT` is required, inaccessible boards are omitted, pending/failed filters work, and row links open the source board's review slideover.

- [ ] **Step 2: Implement the compact review queue**

Reuse the board submission projections and avoid copying the full review form. The global page links into the board context for the actual decision.

- [ ] **Step 3: Write marketing/help contract tests**

Assert public copy says files are submitted and management-approved before AI use; reject phrases implying automatic indexing of every upload.

- [ ] **Step 4: Update public and help content**

Describe Files versus Knowledge, supported formats, submission, review, citations, and permission-aware assistant search. Correct the existing claim that uploaded entries become searchable “immediately.”

- [ ] **Step 5: Run focused tests and commit**

Run: `pnpm vitest run test/app/boardKnowledgeReviewQueue.test.ts test/app/boardKnowledgeMarketing.test.ts`

Expected: PASS.

Commit: `docs: explain governed board knowledge workflow`

---

### Task 12: Migration, benchmark, battle test, and stacked PR

**Files:**
- Create: `scripts/board-knowledge-benchmark.ts`
- Create: `test/fixtures/board-knowledge/benchmark-manifest.json`
- Review: every file changed by Tasks 1-11

**Interfaces:**
- Produces: an applied additive migration, benchmark report, verified branch, and PR stacked on PR #374.

- [ ] **Step 1: Add the benchmark harness and manifest**

The manifest defines expected text anchors, tables, page/slide/sheet coordinates, and minimum coverage for digital PDF, scanned invoice, table PDF, DOCX, XLSX, PPTX, CSV, TXT, and JSON. Output native versus AI method, coverage, warnings, latency, tokens, and cost without storing document payloads.

- [ ] **Step 2: Run all focused tests**

Run:

```bash
pnpm vitest run \
  test/config/boardKnowledgeMigration.test.ts \
  test/server/utils/boardKnowledgeTypes.test.ts \
  test/server/utils/boardKnowledgeRepository.test.ts \
  test/server/utils/boardKnowledgeLifecycle.test.ts \
  test/server/utils/boardKnowledgeNativeExtraction.test.ts \
  test/server/utils/boardKnowledgeChunking.test.ts \
  test/server/utils/boardKnowledgeModelOps.test.ts \
  test/server/utils/boardKnowledgeAiExtraction.test.ts \
  test/server/utils/boardKnowledgeProcessing.test.ts \
  test/server/api/boardKnowledgeApi.test.ts \
  test/server/api/boardKnowledgeDeletion.test.ts \
  test/components/boardKnowledgeReviewSlideover.test.ts \
  test/server/utils/boardKnowledgeVectorize.test.ts \
  test/server/utils/boardKnowledgeSearch.test.ts \
  test/ai/tools/knowledge.boardScope.test.ts \
  test/app/boardKnowledgeReviewQueue.test.ts \
  test/app/boardKnowledgeMarketing.test.ts
```

Expected: PASS, zero failed tests.

- [ ] **Step 3: Re-verify migration 342 against the configured database**

Task 1 already applies the migration. Re-run it here to prove idempotency, then verify the tables without printing the connection string:

```bash
/bin/zsh -lc 'set -a; source .env; set +a; psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f server/database/migrations/342_board_knowledge.sql'
/bin/zsh -lc 'set -a; source .env; set +a; psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "SELECT to_regclass('"'"'public.board_knowledge_submissions'"'"'), to_regclass('"'"'public.ai_knowledge_chunks'"'"'), to_regclass('"'"'public.board_knowledge_audit'"'"');"'
```

Expected: three non-null table names.

- [ ] **Step 4: Provision non-production Vectorize resources**

Run the runbook's create/list commands against the intended XeroFlow Cloudflare account. Verify the immutable Pages project remains `agency-dashboard`; do not deploy.

- [ ] **Step 5: Run dry-run backfill and reference benchmark**

Run:

```bash
BOARD_KNOWLEDGE_BACKFILL_ACK=true pnpm board-knowledge:backfill --dry-run
pnpm exec tsx scripts/board-knowledge-benchmark.ts --native-only
```

If paid Gateway credentials are configured in the approved non-production environment, run the AI benchmark there. If they are absent, report the AI benchmark as not run and keep assistant retrieval disabled.

- [ ] **Step 6: Perform the mandatory deep-dive review**

Re-read every changed file. Check server aliases, permission composition, stale-state reactivity, Model Ops provider matching, gateway privacy headers, no direct fallback, parser limits, no raw storage URLs, Vectorize/Postgres double ACL, queue idempotency, migration delete policies, dark mode, mobile layouts, duplicate UI, and marketing accuracy.

- [ ] **Step 7: Run the repository verification suite**

Run, in order:

```bash
pnpm vitest run
pnpm typecheck
pnpm build
git diff --check
```

Record pre-existing failures separately; any regression introduced by this branch must be fixed before PR creation.

- [ ] **Step 8: Browser battle-test**

Start the app and test at 320 px and desktop widths: unsupported file, submit, extracting, failure/retry, ready preview, reject, approve/indexing, used-by-AI citation, archive, keyboard focus, dark mode, network failures, and console errors. Confirm a user without `MANAGEMENT` sees status/preview but no review mutations.

- [ ] **Step 9: Finalize atomic commits and push**

Verify the worktree is clean, then push `feature/board-knowledge-governance`. Do not force-push.

- [ ] **Step 10: Create the stacked PR**

Create a PR whose base is `feature/board-files-library` while PR #374 remains open. The PR body must state the review-first workflow, privacy posture, Model Ops defaults, migration/resource runbook, test/build evidence, benchmark status, feature-flag default, and that production deployment was not performed.

- [ ] **Step 11: Request review**

Request review only after checks are visible. Keep resource creation/backfill/deployment as explicit rollout gates, not hidden PR side effects.
