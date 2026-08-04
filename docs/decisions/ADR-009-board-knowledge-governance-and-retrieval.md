# ADR-009: Govern board knowledge separately from file storage and global AI search

## Status

Accepted.

## Date

2026-08-04

## Context

PR #374 adds a board-level Files library that stores board documents and aggregates task attachments without changing their ownership. The next requirement is to let the XeroFlow assistant use selected board documents as knowledge.

The existing knowledge implementation is not safe to extend by simply embedding every upload:

- `ai_knowledge_articles` is historically agency-wide.
- A single article produces one vector from a truncated prefix rather than page-aware chunks.
- The shared `VECTORIZE` index also contains financial, task, brief, client, learned-QA, recommendation, and notification data.
- Board access is not represented in current knowledge vectors or article rows.
- Uploading a working file is not consent to expose its contents to an AI assistant.

Document extraction also creates a model-governance decision. Digital Office and text-layer PDF documents can be parsed deterministically, while scans and layout-heavy material need multimodal extraction. Cloudflare AI Gateway supports Google and Hugging Face routes, and XeroFlow already has an audited Admin Model Ops assignment system.

The complete product and technical contract is recorded in `docs/superpowers/specs/2026-08-04-board-knowledge-design.md`.

## Decision

### 1. File storage and AI knowledge are separate lifecycles

Files remain ordinary board or task-owned records. A user with board write access must explicitly submit an immutable source version for extraction. Extraction creates an unpublished draft article and chunk rows; it does not publish or index the content.

A user with `MANAGEMENT` permission and access to the source board must approve the extracted version. Rejection remains unpublished. Archival makes the database row non-searchable before eventual vector deletion completes.

### 2. Board knowledge is searched in a dedicated Vectorize index

Create `KNOWLEDGE_VECTORIZE` rather than placing board chunks in the mixed-sensitivity index. Every vector receives a filterable `scopeKey` of `agency` or `board:<department UUID>`. Existing published agency knowledge is chunked and backfilled into the same dedicated index.

Vectorize filtering narrows candidates, but Postgres remains the authorization boundary. Every result is re-fetched and constrained to published articles whose nullable department is in the caller's server-derived board scope. The active board affects ranking only; it never grants access.

### 3. Deterministic parsing precedes AI extraction

Text, structured data, Office documents, and text-layer PDFs use bounded native parsers first. AI is invoked only for scans, insufficient text density, parsing failure, or layout recovery. This reduces cost, latency, and document-content egress.

The heavy native parser runs in the private `board-knowledge-extractor` companion Worker and is reached only through the Pages `BOARD_KNOWLEDGE_EXTRACTOR` service binding. The Pages app retains source authorization, R2 access, governance, and persistence; the parser receives bounded bytes plus filename/MIME metadata and returns bounded extraction blocks with `no-store`. This keeps pdfjs and SheetJS outside the Pages Worker release budget without creating a public document-processing endpoint.

AI extraction must go through Cloudflare AI Gateway. Raw request/response payload logging and caching are disabled, direct/free-tier fallback is prohibited, and provider failure leaves a retryable extraction failure rather than silently changing the data-processing route.

### 4. Admin Model Ops controls the extraction model

Add the runtime-routed feature `board_knowledge_document_extraction` to the existing model registry and assignment resolver. Its default is Gemini 3.6 Flash through the Google AI Studio Gateway provider, with Gemini 3.5 Flash-Lite as fallback.

Curated model IDs include the upstream Gateway provider, for example `google-ai-studio/gemini-3.6-flash` or `huggingface/PaddlePaddle/PaddleOCR-VL-1.6`. Hugging Face models remain non-production until a real endpoint health check and the reference-document benchmark pass.

No separate board-specific model settings page is created. Admin overrides, audit entries, compatibility validation, and invocation telemetry remain in the existing Model Ops control plane.

## Alternatives considered

### Automatically index every upload

Rejected. It confuses storage with publication, indexes drafts and irrelevant evidence, and removes human accountability.

### Extend the existing mixed Vectorize index

Rejected. Type filtering and a Postgres re-fetch help, but a dedicated index produces a smaller security boundary, supports pre-query board filtering, and improves retrieval quality.

### Use only native parsers

Rejected. Scanned documents and complex visual layouts would remain unusable.

### Use an AI model for every document

Rejected. It adds unnecessary cost and egress to content that deterministic parsers can extract more reliably.

### Make a Hugging Face OCR model the initial default

Rejected for launch. AI Gateway can proxy Hugging Face, but model availability still depends on an operational Inference API or dedicated endpoint. The curated adapter design keeps it available for evaluation without making production depend on new GPU operations.

## Consequences

### Positive

- Uploading a file never silently publishes it to AI.
- Management review and immutable provenance are visible and auditable.
- Board permissions are enforced before and after semantic retrieval.
- Source citations can identify the exact board, file, and page or section.
- Model choice and fallback can change through the existing admin control plane without deployment.
- Normal digital documents avoid LLM cost and document-content egress.

### Negative

- A second Vectorize index and backfill runbook must be operated.
- Extraction, review, and indexing become separate asynchronous states that the UI must explain.
- Office/PDF parsing needs bounded adapters and a maintained reference corpus.
- The private parser Worker must be deployed before the Pages binding is activated; a missing binding fails extraction closed.
- Approval does not make a document immediately searchable; indexing must finish first.
- Source deletion and replacement must coordinate with de-indexing.

### Risks and mitigations

- **Stale vector after archival:** database publication re-check fails closed before returning content.
- **Model or Gateway outage:** no direct fallback; show a retryable extraction failure.
- **Prompt injection inside a document:** extracted passages remain untrusted tool output and are never executed as instructions.
- **Wrong-board leakage:** server-derived scope filter plus authoritative Postgres ACL on every result.
- **OCR quality regression:** extraction provenance, quality signals, reference benchmark, and human preview before approval.
- **Hugging Face endpoint instability:** catalog status remains non-production until endpoint and benchmark gates pass.

## Follow-up

Implementation, migration, resource provisioning, backfill, benchmarks, UI work, and verification are defined in the accepted design specification and its subsequent implementation plan. PR creation does not authorise production deployment.
