# FigFlow email-design deployment configuration

Read-only review of `workers/email-design/deploy.mjs`, `wrangler.staging.jsonc`, `wrangler.production.jsonc`, `README.md`, the `EMAIL_DESIGN` entries in root `wrangler.toml`, and `test/workers/emailDesignDeploy.test.ts` at `/Users/paulgiurin/orca/workspaces/dashboard/figflow-edm-release-20261101`. No deploy, no Wrangler call, no database write, and the 16 guard tests were not re-run. Parent reports those tests passing, a production dry-run with no network deployment, five Worker/renderer/PostgreSQL passes, and twelve admission cases. The old `workers/email-design-spike` path is gone.

## Verdict

No defect in these files opens a public route, turns the draft flag on, or points the private service at a different database or renderer than Pages. Both worker configs keep `FIGFLOW_EDM_DRAFT_SAVES_ENABLED` as the string `false`. `workers_dev`, preview URLs, routes, and crons are closed, and observability logs are off.

The cutover is still blocked on `JWT_SECRET`. It is not in either worker config, and the guard rejects embedding it. Remote Pages metadata showing the name is the parent's report; this review did not read Cloudflare and did not see a value. Do not deploy the Pages caller until that secret is provisioned on the matching private service from an approved store.

## What the configs pin

`validateEmailDesignTarget` deep-equals the whole Wrangler file. Staging and production must be `xeroflow-email-design-staging` and `xeroflow-email-design-production`, account `a5b299b3ad15c1b5b895dc66f9357b17`, main `dist/worker.mjs`, compatibility `2026-07-08` plus `nodejs_compat`. That account id is the one already published in the Pages `AI_GATEWAY_URL`. Root `wrangler.toml` has no `account_id` key.

Resource ids match the Pages file:

| Binding | Production | Staging / Pages preview |
| --- | --- | --- |
| `HYPERDRIVE` | `900b4b74ec41462cbbabebd0aa8775aa` | `3865ea5568234fc7b0e9e3e595a30286` |
| `HYPERDRIVE_FRESH` | `90228af3e2cc461bbc09accc3b47bd9f` | same staging id, as in preview |
| `CACHE` | `7d5db1c489cb40f4b809d611e1408acd` | absent, as in preview |
| `EMAIL_RENDERER` | `xeroflow-email-rendering-production` `EmailRenderer` | `xeroflow-email-rendering-staging` `EmailRenderer` |

`EMAIL_DESIGN_ENVIRONMENT` and `PAGE_STUDIO_RELEASE_ENVIRONMENT` are both `production` or both `staging`. Pages uses those same `PAGE_STUDIO_RELEASE_ENVIRONMENT` values, and the proxy overwrites the environment header from the Pages env. The Pages service entries call `xeroflow-email-design-staging` and `xeroflow-email-design-production` with no entrypoint, so they hit the worker default export. `build.mjs` bundles `admission.mjs` to `dist/worker.mjs`.

Pages `wrangler.toml` does not set `FIGFLOW_EDM_DRAFT_SAVES_ENABLED`. An unset Pages flag keeps draft routes at 404. Template `PATCH` and `DELETE` do not consult that flag, so they call `EMAIL_DESIGN` as soon as the Pages project is deployed with this binding.

## Guard and scripts

`test/workers/emailDesignDeploy.test.ts` has 16 cases: staging and production accepted, thirteen production mutations rejected, and staging rejected as production. The mutations cover account, name, artifact path, `workers_dev`, preview URLs, a public route, cron, flag `true`, a swapped environment, the renderer name, collapsing the two production Hyperdrive ids, an extra `ai` binding, and a `JWT_SECRET` var. They call `validateEmailDesignTarget` only. They do not run `main`, git, Nitro, or Wrangler.

`pnpm deploy:production` fetches `origin/main`, requires `HEAD` to be that commit, requires a clean tree except `.verification/`, and requires the config, admission, and Nitro files to be tracked. It rebuilds from that source and passes the commit as the Wrangler message and tag. `deploy:check` and `deploy:production:dry-run` skip those git checks. A green check or dry-run is not ancestry proof and does not show that `JWT_SECRET` exists remotely. The dry-run command does pass `--dry-run` to Wrangler. This review did not execute it.

`.nvmrc` and the package engine are both `24.18.0`. The script refuses any other Node version.

## Release gate

Admission rejects a missing, blank, or fallback `JWT_SECRET` before Nitro. The README tells operators to copy it from the same approved source as Pages, without printing or committing it, and to deploy the private service and prove template CRUD before the Pages cutover. That order is the one these files implement. Deploying Pages first turns current template update and delete into 503 or 401, because there is no public URL fallback and no retry.

`FIGFLOW_EDM_APP_ORIGIN` is not a worker var. While the draft flag stays `false`, draft handlers return 404 before the origin check. Later flag enablement on staging needs an explicit origin var: an unset origin defaults to `https://app.xeroflow.io` in `designRequest.ts`. Adding that var also means updating the exact-config guard. That is outside this closed-flag deployment.

No production deployment or schema migration was run for this review.
