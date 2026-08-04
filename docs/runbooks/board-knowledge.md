# Board Knowledge rollout runbook

Board Knowledge submission and management review can ship independently. AI retrieval must stay disabled until the dedicated index, metadata filter, agency backfill, and parity gates below pass.

## 1. Preconditions

- Keep `BOARD_KNOWLEDGE_SEARCH_ENABLED=false` in every environment.
- Confirm migration `342_board_knowledge.sql` and `343_board_knowledge_agency_chunks.sql` have been applied.
- Confirm `KNOWLEDGE_VECTORIZE` points to `agency-knowledge`; it must never point to the shared `VECTORIZE` index.
- For the one-off Node backfill, provide `DATABASE_URL`, `CLOUDFLARE_ACCOUNT_ID`, and `CLOUDFLARE_API_TOKEN`. The token needs Workers AI inference and Vectorize write access. Do not print these values.
- Confirm the AI Gateway route used for document extraction has paid Google credentials. `GOOGLE_AI_STUDIO_PAID=true` is an explicit operator assertion, not credential discovery.
- In AI Gateway, confirm request and response payload logging and caching are disabled for document extraction. The application also sends the no-store and payload-logging opt-out headers.
- Keep `HUGGINGFACE_BOARD_KNOWLEDGE_PRODUCTION_READY=false` until its endpoint contract and reference benchmark are approved.

The backfill embeds extracted agency article text with Cloudflare Workers AI and writes only compact identifiers/provenance to Vectorize. It does not upload original files or storage URLs.

## 2. Provision the dedicated non-production index

Run these commands from the repository root using the intended Cloudflare account/profile:

```bash
pnpm exec wrangler vectorize create agency-knowledge --dimensions=768 --metric=cosine
pnpm exec wrangler vectorize create-metadata-index agency-knowledge --property-name=scopeKey --type=string
pnpm exec wrangler vectorize list-metadata-index agency-knowledge
pnpm exec wrangler vectorize info agency-knowledge
```

Do not insert vectors until `scopeKey` appears as a string metadata index. Cloudflare applies metadata filters before `topK`; retrieval depends on that index for `agency` and `board:<department-id>` candidate scopes.

## 3. Queue and failure-path readiness

- Confirm the `agency-jobs` producer binding is present and the deployed consumer routes `knowledge.extract` and `knowledge.index` jobs.
- Confirm queue retries and the dead-letter queue are configured in Cloudflare before enabling broad submission.
- Run the queue routing and processor tests:

```bash
pnpm vitest run test/server/utils/queueConsumerBoardKnowledge.test.ts test/server/utils/boardKnowledgeIndexing.test.ts
```

- Inspect the queue and DLQ after a controlled failed extraction/indexing test. No queue payload may contain document bytes or extracted content.

## 4. Dry-run the agency backfill

The acknowledgement is required even for dry run so the operator must deliberately select the configured database.

```bash
BOARD_KNOWLEDGE_BACKFILL_ACK=true pnpm board-knowledge:backfill --dry-run
```

Review `articlesScanned`, `planned`, `skipped`, and `chunksExpected`. Dry run performs no database, Workers AI, or Vectorize mutation.

## 5. Run and verify the backfill

```bash
BOARD_KNOWLEDGE_BACKFILL_ACK=true pnpm board-knowledge:backfill
```

The command is restart-safe: matching content hashes with complete stored vector IDs are skipped; incomplete articles are rebuilt deterministically. It exits non-zero on chunk/vector parity failure.

Verify Postgres parity without exposing article content:

```sql
SELECT
  COUNT(DISTINCT article_id) AS agency_articles,
  COUNT(*) AS expected_chunks,
  COUNT(vector_id) AS indexed_chunks
FROM ai_knowledge_chunks
WHERE scope_key = 'agency';
```

`expected_chunks` and `indexed_chunks` must match. Then run:

```bash
pnpm exec wrangler vectorize info agency-knowledge
```

Vectorize writes are asynchronous. Wait until the reported mutation has been processed before retrieval parity testing.

## 6. Retrieval parity and enablement

- Run the Board Knowledge reference-document benchmark and record coverage, warnings, latency, tokens, and cost.
- Compare representative legacy agency knowledge searches with the dedicated-index results. Confirm citations identify the same or better source passages.
- Verify a user with one board cannot retrieve another board's high-scoring chunks. Postgres publication and department checks remain the final authorization boundary.
- Verify archived sources disappear immediately through Postgres even while vector deletion is pending.
- Only after these gates pass, set `BOARD_KNOWLEDGE_SEARCH_ENABLED=true` in the intended preview environment and deploy through the repository deployment scripts. Production remains a separate approval.

## 7. Rollback

1. Set `BOARD_KNOWLEDGE_SEARCH_ENABLED=false` and redeploy. Submission and review remain available, while assistant retrieval uses the existing published agency knowledge path.
2. Stop or pause the `agency-jobs` consumer if indexing is unhealthy. Do not delete source files or review records.
3. Leave the additive Postgres migrations in place. They are safe while the feature flag is off.
4. Keep legacy knowledge vectors until dedicated-index parity has been accepted. Cleanup is a separate, reviewed operation.
5. If the dedicated index must be rebuilt, create a new index name, recreate the `scopeKey` metadata index before insertion, update `KNOWLEDGE_VECTORIZE`, rerun dry-run/backfill/parity, and only then remove the old dedicated index.

## References

- [Cloudflare Vectorize client and binding API](https://developers.cloudflare.com/vectorize/reference/client-api/)
- [Cloudflare Vectorize bulk insert and HTTP API](https://developers.cloudflare.com/vectorize/best-practices/insert-vectors/)
- [Cloudflare Vectorize metadata filtering](https://developers.cloudflare.com/vectorize/reference/metadata-filtering/)
- [Cloudflare Workers AI bge-base-en-v1.5](https://developers.cloudflare.com/ai/models/%40cf/baai/bge-base-en-v1.5/)
