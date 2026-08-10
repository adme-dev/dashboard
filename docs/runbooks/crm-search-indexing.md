# CRM Search Indexing Runbook

CRM search indexing is dormant by default. Visible agency and portal search remains keyword-first; semantic results can become visible only in the separately approved `agency_ai` assist mode. Portal semantic search is never enabled by this runbook.

## Preconditions

1. Verify the frozen artifact SHA and full Pages/Worker binding-manifest digest.
2. Verify the signed environment resource manifest against Cloudflare API readback. Preview must use only `agency-crm-search-preview`, `agency-crm-search-index-preview`, `agency-crm-search-index-preview-dlq`, and `agency-crm-search-consumer-preview`. Production names must differ.
3. Verify exact Queue/DLQ retention is 1,209,600 seconds and that the paid Queue plan, retry, DLQ, and concurrency settings match the manifest.
4. Obtain the current unexpired, unrevoked approval for the next single transition. Never combine resource provisioning, migration, deployment, indexing, shadow, or assist authority.

Indexing starts only after metadata indexes and the filtered sentinel lifecycle are ready. Backfill is identifier-only and bounded per approved client. A confirmed ledger row is the only freshness claim; queued or provider-pending work is not indexed freshness.

Stop new indexing at 90% dirty-row or operation capacity. A kill switch, stale approval, binding drift, schema mismatch, failed sentinel, or missing reconciliation evidence fails closed without an inline provider fallback.
