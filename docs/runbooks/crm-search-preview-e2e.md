# CRM Search Preview E2E Runbook

Task 18 defaults to planning and dry-run and no Task 18 gate creates a Neon branch, uploads a Worker version, deploys Pages, provisions Cloudflare resources, imports R2 data, or calls a provider. The executable lifecycle accepts only an injected adapter plus an exact, unexpired `production_migration` authorization bound to preview and the expected project; there is no ambient `DATABASE_URL` or test-only mutation switch.

The preview plan uses one outer `try/finally`. It creates exactly one schema-only Neon branch named `crm-search-e2e-<12-char-sha>` with an RFC 3339 expiry six hours after creation and one direct non-pooler read/write endpoint, polls every returned Neon operation to a terminal state, proves the CRM source tables are empty, applies the exact-byte migrations 350–352 through the injected migration adapter, emits the Task5-compatible signed target attestation, and always deletes the exact created branch in `finally`, polling deletion too.

Cloudflare preview readback must match the signed environment manifest. The preview Vectorize index, Queue, DLQ, Worker, Pages branch, R2/KV/service bindings, variables, and secrets must not alias a production identity. Cleanup is allowed to target only resources recorded by the same evidence bundle.

Run the mutation-free preflight with:

```bash
pnpm crm-search:migrate:test -- --dry-run
pnpm crm-search:e2e:preview -- --dry-run
```

Any missing project identity, TTL/schema-only proof, operation-poll plan, empty-table assertion, cleanup handler, frozen digest, or signed readback stops before execution.
