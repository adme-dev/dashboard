# Incident: XeroFlow builds deployed to dealer-network Pages

## Status

Resolved, with deployment guard added.

## Date

2026-07-13

## Summary

Three XeroFlow builds from this repository were mistakenly deployed to the separate `dealer-network` Cloudflare Pages project. The affected deployments have been preserved for investigation.

DNS records and custom-domain bindings were correct. The failure occurred at deployment time: the correct XeroFlow build output was sent to the wrong Pages project.

## Root cause

A raw or incorrectly targeted Pages deployment bypassed the repository's intended `agency-dashboard` project target. Cloudflare accepted the valid build artifact because a direct Pages deployment can target any project available to the operator token.

The repository's package scripts named `agency-dashboard`, but that convention was not an enforceable boundary. The README also showed a raw `wrangler pages deploy dist` command, making it possible to repeat the error.

## Impact

- The dealer-network Pages project received three unrelated XeroFlow deployments.
- The deployments had to be identified and separated from DNS/domain concerns during diagnosis.
- The bad deployments remain available for forensic comparison; do not delete them until the investigation is closed.

## Corrective actions

- Added `scripts/deploy-pages.mjs`, which fails closed unless:
  - `wrangler.toml` declares `name = "agency-dashboard"`;
  - the requested project is the immutable `agency-dashboard` target; and
  - the branch is `main` or `preview`.
- Routed `pnpm deploy`, `pnpm deploy:production`, and `pnpm deploy:preview` through the guard.
- Added `pnpm deploy:check` for pre-deploy validation.
- Added deployment-guard tests to CI.
- Kept the CI deploy target explicit as `agency-dashboard` and added a pre-deploy guard step.
- Removed the raw Pages deployment example from the README.
- Added the incident warning to `CLAUDE.md` so coding agents follow the guarded path.

## Required deployment procedure

1. Confirm the working directory is the XeroFlow/dashboard repository.
2. Run `pnpm deploy:check`; it must print `agency-dashboard / main` and exit successfully.
3. Deploy only with `pnpm deploy:production` or `pnpm deploy:preview`.
4. Confirm the Wrangler output names the `agency-dashboard` project before accepting the deployment as complete.
5. Smoke-test `https://agency-dashboard-6cm.pages.dev/` after production deployment.
6. If any output mentions `dealer-network`, stop immediately. Do not retry with a modified raw Wrangler command.

## Explicitly prohibited

- `wrangler pages deploy ...` run directly from this repository.
- Copying a deploy command from another repository or shell history.
- Overriding `--project-name` for convenience.
- Treating a correct custom domain or DNS record as proof that the deployment target is correct.

## Rollback and investigation

Use Cloudflare Pages deployment history to restore the last known-good dealer-network deployment if needed. Preserve the three incorrect XeroFlow deployments until their IDs, timestamps, initiating actor, and command source have been recorded in the investigation log.
