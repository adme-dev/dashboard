# Page Studio preview transaction latency — 25 September 2026

## Measured issue

Fantasy's Astro quote page returned HTTP 200 with first-byte times of 1.857,
1.759 and 1.729 seconds. The same Worker's health route returned in 0.110 seconds.
The pages are precompiled; delivery still performs an uncached native entitlement
lookup and verified artifact reads for every request.

The management transaction helper sent BEGIN and four SET LOCAL commands in five
separate network round trips before executing the lookup. A read-only benchmark
of the exact Fantasy lookup from the local workstation measured setup at
1,219/1,313/1,237 ms. Sending those fixed commands together measured
222/230/371 ms. This is direct database evidence, not a measurement of Hyperdrive
or proof of the eventual public-page improvement.

## Change and preserved boundaries

Send the existing fixed transaction setup as one simple-query batch. Business
queries remain separately parameterized. Search path, statement/lock/idle bounds,
explicit commit/rollback, per-request clients, connection failure checks and
no-replay behavior remain. A failed setup attempts rollback before closing.
No authorization result, HTML or asset is newly cached. No customer snapshot,
checkpoint, renderer or domain changes as part of this fix.

Cloudflare documents support for transaction-local SET and multi-statement
queries in [Hyperdrive pooling](https://developers.cloudflare.com/hyperdrive/concepts/how-hyperdrive-works/).

## Local verification

- Regression first: 9 lifecycle assertions failed against the separate-command
  implementation; all 11 pass after batching.
- Real disposable PostgreSQL: all four settings visible before business work,
  literal parameter handling, committed data visible on a separate connection,
  rollback after SQL error and callback failure. Four tests pass.
- Broader local management/Worker/configuration/staging/email suite: 14 files,
  229 tests pass. Strict Worker typecheck and production-target Wrangler dry run
  pass. Independent review found no material issues.
- Nested worktree Vite configuration inherited the outer Dashboard's unavailable
  Nuxt tsconfig. Local tests use the original Vitest config/aliases/setup with Oxc
  tsconfig discovery disabled in an uncommitted verification config. CI uses the
  normal repository config and explicitly enables the new PostgreSQL suite.

## Release and broader acceptance

Live before/after measurements remain required after reviewed current-main
integration and guarded deployment. Local results do not establish a live fix.
The user's requirement is one Astro rendering and delivery implementation for
preview and production, with explicit environment safeguards and hostname
mapping. This transaction improvement does not complete that parity work.
