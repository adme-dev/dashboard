# CRM Search Preview E2E Runbook

Task 18 package commands still default to planning and dry-run and no Task 18 verification run has created a Neon branch, uploaded a Worker version, deployed Pages, provisioned Cloudflare resources, imported R2 data, or called a provider. A guarded executable code path now exists, but external execution remains pending. It accepts only injected adapters plus exact execution flags and verified, unexpired signed authorizations bound to preview, the frozen artifact, binding/resource readbacks, Neon attestation, and expected project; there is no ambient `DATABASE_URL` or test-only mutation switch.

The preview plan uses one outer `try/finally`. It creates exactly one schema-only Neon branch named `crm-search-e2e-<12-char-sha>` with an RFC 3339 expiry six hours after creation and one direct non-pooler read/write endpoint, polls every returned Neon operation to a terminal state, fresh-reads the provider branch and requires `init_source=schema-only`, proves all approved CRM source tables have zero organization-scoped rows, applies the exact-byte migrations 350–352 through the injected migration adapter, emits the Task5-compatible signed target attestation, and always deletes the exact created branch in `finally`. Cleanup polls deletion and then fresh-reads provider absence before reporting success.

Cloudflare preview readback must match the signed environment manifest. Provider APIs, AI Gateway, MCP, Meta/Google writes, and audience writes must be disabled by normalized signed config/readback or use a distinct verified preview target identity. The preview Vectorize index, Queue, DLQ, Worker, Pages branch, R2/KV/service bindings, variables, and secrets must not alias a production identity. Every provision/deploy/restore mutation is journalled. Cleanup is allowed to target only resources recorded by the same authorization, rejects the production denylist, is idempotent, and must prove every target returned to its captured baseline.

Run the mutation-free preflight with:

```bash
pnpm crm-search:migrate:test -- --dry-run
pnpm crm-search:e2e:preview -- --dry-run
```

Any missing project identity, TTL/schema-only proof, operation-poll plan, empty-table assertion, cleanup handler, frozen digest, or signed readback stops before execution.

Before provisioning CRM-specific resources, reduce the Pages preview environment to the committed
disabled baseline with `pnpm crm-search:preview:isolate`. The package command is intentionally
dry-run-only. The executable adapter requires `--execute`, the exact `agency-dashboard` account and
project inputs, a transient OAuth/API token, and the exact confirmation phrase. It deletes preview
secrets and mutable bindings, keeps external/provider feature switches disabled, verifies the
production deployment config stayed unchanged, then fresh-reads the preview configuration before
reporting success. CRM Queue, Vectorize, Worker, and temporary Neon bindings are added only by the
subsequent authorized E2E lifecycle and are removed or restored in its outer `finally`.
