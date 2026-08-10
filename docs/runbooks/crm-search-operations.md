# CRM Search Operations Runbook

## Alert thresholds

- Warn at 60% of the explicit durable table capacities (100,000 dirty rows; 50,000 operation rows): inspect oldest records, provider confirmations, and retention progress; open an operator incident before approving more load.
- Page at 80% of either durable table capacity: page CRM-search on-call, pause new approval ceremonies and discretionary backfills, preserve evidence, and drain/reconcile the oldest work.
- Block at 90%: at 90% reject every new `client_indexing` approval and backfill request. Existing delete, teardown, confirmation, and reconciliation work must continue so the system can recover.

- Keyword error rate at or above 1%: page CRM-search on-call, keep visible search on keyword fallback, compare current route/error counters with the last known-good release, and halt promotion until the rate is below threshold.
- Oldest Queue age at or above 900 seconds: page CRM-search on-call, stop new indexing/backfill admission, inspect Queue delivery and pending-transport rows, then run bounded reconciliation; do not replay blindly.

Keyword error rate and oldest Queue age are alertable signals. Provider attempts, retry state, dead-letter state, reconciliation drift, and confirmation age are counts/identifiers only. Raw CRM bodies, source text, raw queries, provider bodies, and secrets are forbidden in logs or evidence.

Ordinary self-healing retries are dashboard-only; they do not page. Page only when an SLO, capacity threshold, durable dead-letter threshold, or reconciliation deadline is breached. Every command defaults to preview. Production needs `--production`, an exact frozen artifact, signed resource readback, and the matching immutable approval.

Incident order: set the global halt, preserve durable evidence, stop new indexing, reconcile accepted provider mutations, then resume only under a new revision-bound approval. Do not purge evidence to make a health check green.
