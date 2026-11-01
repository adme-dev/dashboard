# Private email design service

This Worker prepares four FigFlow draft routes and the canonical template
update/delete handlers for a future private-service rollout. It has no public
route, workers.dev URL, preview URL, cron or email-send capability.

**Current release is a disabled foundation.** Pages excludes every
`/api/email/design/**` handler, including the forwarding route, and has no
`EMAIL_DESIGN` binding. Existing template PATCH/DELETE execute their canonical
handlers locally in Pages with normal authentication, RBAC and client scope.
They do not depend on provisioning this Worker or copying the signing key.
Setting the draft flag alone cannot activate the excluded endpoints.

The FigFlow draft flag remains **false** in both Worker configurations. The
Worker is not deployed by the Pages release. Its local runtime evidence remains
useful preparation, not hosted acceptance or an enabled staff feature.

## Routes and boundaries

| Method | Path | Implementation |
| --- | --- | --- |
| GET | `/api/email/design/drafts/:id` | Canonical read handler |
| PATCH | `/api/email/design/drafts/:id` | Canonical revision save |
| PATCH | `/api/email/design/drafts/:id/metadata` | Canonical metadata save |
| POST | `/api/email/design/drafts/initialize` | Immutable legacy initialization |
| PATCH | `/api/email/templates/:id` | Existing template update handler |
| DELETE | `/api/email/templates/:id` | Existing template delete handler |

`nitro.config.ts` mounts these exact handlers and the database cleanup plugin;
`scanDirs` stays empty. It reuses the existing auth, database, permission,
rendering and revision owners. Template mutations remain excluded from the
signed internal-delegation allowlist. No actor header replaces authentication.

The outer admission wrapper checks the private environment header against the
configured staging/production environment and rejects an absent, empty or
fallback JWT key before loading Nitro. It bounds request bytes before Nitro's
adapter buffers them. Drafts use `DESIGN_ACTION_LIMITS.envelopeBytes`; legacy
PATCH uses `MAX_RENDER_REQUEST_BYTES + DESIGN_ACTION_LIMITS.envelopeBytes` to
allow envelope overhead. This does not increase the renderer's own limit.
Canonical initialize/metadata handlers retain their smaller 4096-byte limits.

## Build and local evidence

Use the repository Node version from `.nvmrc`; no dependency upgrade is required.
From this directory:

```sh
pnpm build
pnpm test:admission
pnpm deploy:check
pnpm deploy:production:dry-run
```

The admission suite uses synthetic bindings, one Miniflare worker per scenario,
request/disposal deadlines and no real database. Twelve scenarios cover
configuration rejection, configured versus wrong signing keys, disabled drafts,
legacy flag-off auth and both body ceilings. Local compatibility date is
2026-07-08 with `nodejs_compat`, matching the deployment configuration.

From the repository root, the actual two-Worker/PostgreSQL test is opt-in:

```sh
FIGFLOW_DESIGN_PG_SOCKET=/private/tmp/figflow-postgres-<owned-cluster> \
FIGFLOW_DESIGN_WORKER_ARTIFACT=workers/email-design/dist/worker.mjs \
pnpm exec vitest run test/integration/emailDesignWorker.database.test.ts --maxWorkers=1
```

That fixture requires the disposable local cluster on port 55483, unix socket
and loopback TCP, role `figflow_test`, and admin database `figflow_design_test`.
It creates and drops its own uniquely named database. It tests the actual
renderer RPC, all six routes, immutable/replayed revisions, metadata source
preservation, legacy flag-off behavior, viewer denial, conflict responses,
session revocation and connection cleanup. Outbound HTTP is blocked and counted.
Without both environment variables it skips; a skipped run is not runtime proof.

These local checks do not establish hosted Hyperdrive behavior, browser editing
or compatibility with Apple Mail, Outlook and Gmail.

## Future private-service activation order

1. Review and validate a clean source commit containing current main. Production
   requires exact fetched `origin/main`; `deploy.mjs` rejects a different account,
   Worker, renderer, database, public entry point, capability or enabled flag.
2. Apply migrations 491 and 492 together to the identified target database after
   the repository's database procedure. Both revision writers require 492.
3. Deploy the private service through `pnpm deploy:staging` or
   `pnpm deploy:production` in this directory. The script rebuilds the checked
   source before invoking Wrangler. It does not deploy Pages.
4. Provision `JWT_SECRET` from the same approved source as the corresponding
   Pages environment. Do not rotate the existing Pages key or paste it into
   source, logs or chat. Cloudflare secret metadata confirms presence only; it
   does not reveal a value or prove matching keys. Missing/fallback keys fail
   closed. Staging uses the isolated staging database and renderer.
5. Verify hosted private-service authentication and draft operations in staging.
   Keep existing template writes local unless an explicitly reviewed later
   release moves them; the prepared Worker endpoints alone do not redirect Pages.
6. In a reviewed activation change, allow only the design transport route back
   into the Pages build, add the matching `EMAIL_DESIGN` bindings, set the exact
   allowed app origin, and recheck bundle size and hosted authentication. Keep
   draft saves disabled until the staff/native workflows and acceptance gates pass.
7. Deploy Pages only through the repository's guarded `pnpm deploy:*` commands,
   after `pnpm deploy:check`, and record source/deployment identities. Verify
   existing template editing/deletion and QR navigation on the real host.

No public HTTP fallback or automatic mutation retry exists. For an uncertain
draft-save reply, reconcile using the retained operation identity and receipt.
For a legacy template mutation, re-read its current state before deciding whether
another mutation is necessary; legacy CRUD has no draft receipt contract.

Feature enablement remains a separate milestone: the staff UI, native EDM
bridge, module library workflow and real email-client acceptance are still open
in `docs/superpowers/plans/2026-10-30-figflow-edm.md`.
