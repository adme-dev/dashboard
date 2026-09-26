# Page Studio runtime delivery — rollout runbook

Status 2026-09-26: proven on staging, not in production. Design: Studio ADR-005.

## What exists

- Migration 433 (`delivery_mode` per site, runtime releases) is applied to production and to the
  preview branch `staging/page-studio`. Every site is `static` until flipped.
- Routes: `POST sites/{id}/runtime-releases/activate`, `POST .../runtime-releases/rollback`,
  `GET .../runtime-state`, `POST .../runtime-preview`. Permission `PAGE_STUDIO_PUBLISH`.
- Preview Dashboard pins the staging renderer in `[env.preview.vars] PAGE_STUDIO_RUNTIME_RENDERER`
  (double-quoted TOML string; the bindings test parser rejects single quotes).
- Staging Workers (Studio repo): runtime `xeroflow-page-studio-runtime-staging` (no routes, secret
  `RUNTIME_SHARED_SECRET`), delivery `xeroflow-page-studio-delivery-staging` with `ASTRO_RUNTIME`.

## Staging canary record

Site a27135dc (tenant `page-studio-staging`, synthetic) on `page-studio-staging.xeroflow.io`:
runtime release 25f19d1b published, d9a3e8a1 published, rollback to 25f19d1b verified live.

## Production rollout (each step needs an explicit go-ahead)

1. Studio: `pnpm --dir services/astro-runtime deploy:production --secrets-file <file>` with a fresh
   64-hex `RUNTIME_SHARED_SECRET`; record the printed `PAGE_STUDIO_RUNTIME_RENDERER`.
2. Studio: add `ASTRO_RUNTIME` → `xeroflow-page-studio-runtime` to the delivery worker's production
   `services`, update `test/security/staging-configuration.test.ts` if it pins production bindings,
   `wrangler secret put RUNTIME_SHARED_SECRET` (same value), `pnpm deploy:production:delivery-worker`.
3. Dashboard: set `PAGE_STUDIO_RUNTIME_RENDERER` in `[env.production.vars]`, merge, `pnpm deploy:production`.
4. Flip one site: `UPDATE page_studio_sites SET delivery_mode='runtime' WHERE id=…` (Save stops queuing
   static staging builds for that site from this moment). Publish through the panel or the route.
5. Rollback options: `runtime-releases/rollback` to an earlier runtime release; the static
   `releases/rollback` to the last static release; or `delivery_mode='static'`.

## Known gaps

- Publishing panel and `runtime-state` are production-environment-only.
- Draft-preview hostnames `*.preview(.staging).pages.xeroflow.com` have no DNS or Worker route.
- Runtime sites have no public form submission endpoint yet.
- Pages Worker bundle is ~830 KiB under the 25 MiB ceiling.
- `wrangler r2 object` defaults to local storage here; use `--remote`.

## Follow-ups recorded 2026-09-26 (evening)

1. Production rollout (steps above) — not started; do it in a fresh session, one deploy at a time.
2. Draft-preview DNS/route for `draft-*.preview(.staging).pages.xeroflow.com` — this is the cheapest
   way to give editors a faithful "what it will look like" view (published template rendering of the
   saved draft), instead of relying on the canvas.
3. Editor canvas vs published template (Fantasy Limo report, 26 Sep): both the editor and client
   staging were on the same checkpoint `checkpoint_32559c00…` (digest 4a87de62…). Staging renders via
   Astro (shadcn shell); the canvas uses the site-kit React renderer without the shell, so styling
   differs by construction. If content differs, the running editor sandbox is stale — relaunch Studio
   from the Dashboard before treating it as a bug.
4. Fantasy Limo has a checkpoint-staging outbox row `pending` since 25 Sep 11:59 while a later explicit
   deployment succeeded — check the production outbox cron (`/api/cron/page-studio-checkpoint-staging`).
5. Runtime public forms: no submission endpoint yet; required before a site with a lead form goes live.
6. Delete Neon test branch `br-bold-band-a4x7jcpe` (project square-tooth-23821574) once confirmed.
