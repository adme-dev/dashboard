# Private email rendering service

Pages authenticates the actor, resolves current site/media authority, persists drafts,
rewrites tracking and decides whether email may be sent. The private Worker only
renders admitted data. It has no database, storage, mail provider or service binding.
Both HTTP entrypoints return 404; workers.dev, preview URLs, routes, cron and
invocation logs are disabled.

## Contract and failure behavior

`EMAIL_RENDERER` targets named entrypoint `EmailRenderer`; the caller uses
`PAGE_STUDIO_RELEASE_ENVIRONMENT`. The Worker uses `EMAIL_RENDER_ENVIRONMENT`.
Strict version-1 envelopes admit agency `document` and restricted `customer-preview`
operations. Replies must match version, operation and environment. No retry, local
production renderer or automatic hosted development fallback exists. A missing or
invalid service returns 503; invalid data returns 400; resource limits return 413.
No document, inline media, HTML or transport exception is logged.

Limits: 8 MiB serialized UTF-8 request; 16 MiB serialized reply and cumulative render
work; JSON depth 64 and 100,000 nodes; 2,048 stored blocks; graph depth 32 and 4,096
expanded visits. Star repetition is capped at 4,096. Merge names are literal tokens;
replacement-string substitutions retain their previous meaning. Merge passes and
chunks consume budget before concatenation, with at most 100,000 chunks. These are
new finite agency admission limits, not a claim that all previously accepted
unbounded payloads remain valid. Existing customer template and image limits remain.

Template/campaign SQL and test-send asset/provider work wait for a successful
render. A campaign update also checks draft status atomically. Customer previews
recheck current authority after rendering; template draft save/history operations
remain available without the renderer. Media is resolved by the authorized caller,
and only field IDs, names and types cross the customer preview boundary.

## Verification

Use Node 24.18.0 and the repository's pinned pnpm/tools:

```sh
pnpm --dir workers/email-rendering run types
pnpm --dir workers/email-rendering run typecheck
node workers/email-rendering/deploy.mjs staging --check-only
node workers/email-rendering/deploy.mjs production --check-only
node workers/email-rendering/deploy.mjs staging --dry-run
node workers/email-rendering/deploy.mjs production --dry-run
pnpm exec vitest run test/workers/emailRendering test/server/utils/emailRendering
pnpm run build
node scripts/check-email-rendering-artifacts.mjs
EMAIL_RENDER_TEST_ARTIFACT="$PWD/.verification/email-rendering-worker-staging/index.js" pnpm exec vitest run test/workers/emailRenderingRpc.test.ts
```

The Pages budget and compactor are unchanged. The artifact guard scans actual
emitted modules/maps for renderer implementation and checks the private Worker
map for server/database/provider dependencies. Golden synthetic HTML fixtures
retain the pre-extraction output; tests use a fake provider and never send email.

## Staging release order

1. Verify clean Dashboard source includes freshly fetched `origin/main`; record its
   exact SHA. Keep customer signup, native editor, preview and Forms access gates
   closed until their separate account acceptance is authorized and complete.
2. Run `node workers/email-rendering/deploy.mjs staging`. The guard pins account
   `a5b299b3ad15c1b5b895dc66f9357b17` and service
   `xeroflow-email-rendering-staging`. Read back version, source tag, environment,
   sole variable binding and disabled public exposure.
3. Run `pnpm deploy:check`, then `pnpm deploy:preview`. The binding must target
   `xeroflow-email-rendering-staging` / `EmailRenderer`. Record the Pages deployment
   ID and source; verify agency save/preview, invited-client preview, mobile and
   keyboard interaction, existing CMS and QR navigation without sending email.
4. Keep production release separate. Production renderer is
   `xeroflow-email-rendering-production`; its guard requires exact current main.
   Deploy it before a production Pages caller, through the guarded scripts only.

Rollback Pages to the recorded previously successful artifact first. Retain a
compatible renderer while any active Pages deployment references it. Never remove
that Worker before its callers are rolled back. No migration or data rollback is
needed for rendering. Native two-account hosted acceptance still requires two real
user-controlled mailboxes; synthetic fixtures do not establish hosted acceptance.

## Current evidence

Implementation checkpoints: core `1ce1c1d0e`, transport `5f68bc674`, callers
`b1a044ef8`. Both initial Worker dry builds were 698.91 KiB raw /107.25 KiB gzip,
with 121 source-map entries and no server/provider sources. Emitted Worker RPC
checks passed. Final Pages capacity, independent review and staging deployment
results are recorded in the resumption ledger; they are not implied by these
local implementation checkpoints.
