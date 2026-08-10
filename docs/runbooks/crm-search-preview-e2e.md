# CRM Search Preview E2E Runbook

Task 18 supports planning and dry-run only. It does not create a Neon branch, upload a Worker version, deploy Pages, provision Cloudflare resources, import R2 data, or call a provider.

The preview plan uses one outer `try/finally`. It creates exactly one schema-only Neon branch named `crm-search-e2e-<12-char-sha>` with an RFC 3339 expiry six hours after creation, polls every returned Neon operation to a terminal state, proves the CRM source tables are empty, applies migrations 350–352, and always deletes the exact created branch in `finally`, polling deletion too.

Cloudflare preview readback must match the signed environment manifest. The preview Vectorize index, Queue, DLQ, Worker, Pages branch, R2/KV/service bindings, variables, and secrets must not alias a production identity. Cleanup is allowed to target only resources recorded by the same evidence bundle.

Run the mutation-free preflight with:

```bash
pnpm crm-search:migrate:test -- --dry-run
pnpm crm-search:e2e:preview -- --dry-run
```

Any missing project identity, TTL/schema-only proof, operation-poll plan, empty-table assertion, cleanup handler, frozen digest, or signed readback stops before execution.
