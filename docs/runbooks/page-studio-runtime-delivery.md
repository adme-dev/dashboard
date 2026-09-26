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
