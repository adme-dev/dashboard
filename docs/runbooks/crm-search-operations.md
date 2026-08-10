# CRM Search Operations Runbook

## Alert thresholds

- Warn at 60% of dirty-row or operation capacity.
- Page at 80% of dirty-row or operation capacity.
- Block new indexing at 90% of dirty-row or operation capacity.

Keyword error rate and oldest Queue age are alertable signals. Provider attempts, retry state, dead-letter state, reconciliation drift, and confirmation age are counts/identifiers only. Raw CRM bodies, source text, raw queries, provider bodies, and secrets are forbidden in logs or evidence.

Ordinary self-healing retries are dashboard-only; they do not page. Page only when an SLO, capacity threshold, durable dead-letter threshold, or reconciliation deadline is breached. Every command defaults to preview. Production needs `--production`, an exact frozen artifact, signed resource readback, and the matching immutable approval.

Incident order: set the global halt, preserve durable evidence, stop new indexing, reconcile accepted provider mutations, then resume only under a new revision-bound approval. Do not purge evidence to make a health check green.
