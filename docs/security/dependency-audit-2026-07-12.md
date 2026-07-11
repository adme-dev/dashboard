# Dependency audit review — 2026-07-12

## Release result

- Critical findings reduced from 5 to 0.
- High findings reduced from 78 to 1.
- Total findings reduced from 181 to 6.
- SheetJS was moved from the stale npm `xlsx@0.18.5` package to the official SheetJS `0.20.3` release tarball.
- Nuxt was upgraded to `4.4.8`, closing the route-rule case-sensitivity advisory affecting earlier Nuxt 4 releases.

## Remaining high advisory

`@rocicorp/zero@0.18.2025042300` depends on `@opentelemetry/sdk-node@0.56.0`. The audit reports a malformed-request process-crash issue in the Prometheus exporter, patched in `@opentelemetry/sdk-node >=0.217.0`.

This path is not reachable in the Cloudflare Pages application release:

- application code imports the Zero browser client from `app/composables/useZero.ts` and schema types from `app/zero/schema.ts`;
- the vulnerable Prometheus exporter belongs to the separate Zero cache/server telemetry path;
- the production Pages build does not start `zero-cache` or expose a Prometheus endpoint;
- forcing `sdk-node` from `0.56` to `0.217` across an old Zero release is not considered a safe transitive override.

The advisory still applies if the repository's `zero:dev`/Zero cache process is exposed to untrusted traffic. Keep that process local or privately networked.

## Follow-up condition

Re-review by 2026-08-12 or before deploying Zero cache as a public service, whichever occurs first. Upgrade `@rocicorp/zero` through its supported migration path instead of forcing the OpenTelemetry dependency independently.

## Verification

- `pnpm audit --audit-level high`: 0 critical, 1 high, 4 moderate, 1 low.
- HR suite: 70 files, 184 tests passed.
- Nuxt typecheck passed.
- Nuxt/Cloudflare production build completed and refreshed `dist/_worker.js`.
- Full-suite comparison against commit `de82bd0e`: both baseline and upgraded dependency graph produced 17 failing files, 50 failing tests, 5,314 passing tests, 4 skipped tests and 12 existing unhandled test errors. No new test failures were introduced by this dependency update.
