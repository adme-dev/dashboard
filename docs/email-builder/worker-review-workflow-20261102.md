# M06 — Email review workflow, hosted web version and campaign UTMs

Date: 2 November 2026. Worker task `task_261627595c6f`, dispatch `ctx_6ac4720f9b72`.
Branch `adme-dev/figflow-review-workflow-20261102`, base `d8d1c66f09eeeae35ec6660b814985ec6e6867f7` (includes fetched main `c1dd2d27f`).
This is a continuation of an earlier dispatch that was killed by an Orca restart; its uncommitted files were kept and finished here, not reset.

Scope is only the approved M06 slice: block comments, draft → in review → approved, exact-content approval gates on scheduling/sending, the hosted web version and per-campaign UTM settings. It adds no other features. The parent owns migration application, CI, release/config, flag activation, private runtime route registration and the public marketing-page sync. Root will not merge or activate M06 until core saved-draft → native edit → review/Apply → reopen acceptance passes.

## Flag

`FIGFLOW_EDM_WORKFLOW_ENABLED` (`'true'` only). When the flag is off:

- review GET/POST/readback routes return `404 not_found` (`cache-control: no-store`) before any session work;
- `/email/view` returns its 404 "not available" page with the CSP headers;
- `PATCH /api/email/campaigns/:id` refuses `utm_settings` / `web_version_enabled` with `400 email_workflow_disabled`;
- new campaigns are created with `review_required = false`, so campaign behaviour is unchanged;
- the campaign and template panels hide the Review action (`/api/email/campaigns/config` now also returns the boolean `review_workflow_enabled`).

Precedence matches the other FigFlow flags: a request binding that is present wins (including `'false'`), then the per-request cached binding, then `process.env`. The parent owns activation.

## Migration (reserved 497, not applied by this worker)

`server/database/migrations/497_email_review_workflow.sql`. It is additive and idempotent: every CREATE is guarded, functions use `CREATE OR REPLACE`, and triggers are dropped and recreated. It was verified by running it twice on a local scratch PostgreSQL 14. The parent applies it to the configured DB after review. Contents:

- `campaigns`: `review_required boolean NOT NULL DEFAULT false`, `web_version_enabled boolean NOT NULL DEFAULT false`, `utm_settings jsonb` (object only, ≤ 1 KiB, check constraint `campaigns_utm_settings_shape`).
- `email_review_digest_part`, `email_campaign_content_digest(body_source, body_html, subject, preview_text, from_name, from_email, reply_to, utm_settings, web_version_enabled)` and `email_template_content_digest(body_source, body_html, subject, preview_text, email_design_revision_id)`. These are length-prefixed, version-tagged SHA-256 hashes computed only in SQL. A digest is never accepted from a browser or JSON body.
- `email_review_states (target_kind, target_id)` holds the state, the bound `content_digest`, a CAS `version`, and the submitter, decider and note.
- `email_review_comments` is append-only. Each comment records its block ID, content digest, revision ID, parent, plain body (≤ 2,000 chars), author and resolution. Triggers make lineage immutable, block deletes, and require replies to stay in a root thread on the same block.
- `email_review_operations (actor_id, operation_id)` stores immutable receipts holding the domain, command, target, payload SHA-256 and result. UPDATE, DELETE and TRUNCATE are rejected.
- Trigger `email_review_campaign_guard` (BEFORE INSERT/UPDATE on `campaigns`) is the universal gate:
  - a gated campaign must be inserted as `draft`;
  - `review_required` can never go back to false;
  - leaving `draft` for anything other than `cancelled` requires an `approved` state whose digest equals the database digest of the new row;
  - once a gated campaign has left draft, any change to digest inputs is refused (`email_campaign_content_frozen`).
- Triggers `email_review_campaign_invalidate` and `email_review_template_invalidate` (AFTER UPDATE): any change to digest inputs resets an in-review or approved state to `draft`, increments `version` and records a "Content changed" note. This applies to every entrypoint.

## Routes

| Route | Purpose |
|---|---|
| `GET /api/email/review/:kind/:id[?clientId=<uuid>\|none]` | Review state, block outline and comments (`orphaned`, `outdated` flags), plus `canReview`. `kind` = `template` or `campaign`. |
| `POST /api/email/review/:kind/:id/commands` | Strict, receipt-bound command: `comment`, `resolve_comment`, `submit`, `approve`, `request_changes`, `require_review`. Body `{ version: 1, operationId, scope: { clientId }, expectedVersion, expectedContentDigest, command, … }`. Unknown keys are rejected. Uses the existing design mutation request guard (origin) and an 8 KiB bounded JSON body. |
| `GET /api/email/review/operations/:operationId` | Reads back the caller's own receipt after a lost reply. A 404 means it did not commit, so retrying the identical request is safe. |
| `GET /email/view?c=<campaign>&v=<digest>&t=<sig>` | Public hosted web version (Nitro server route outside `/api`, next to the existing `/email/click`). |

Authority comes from fresh stored data on every command, replay and readback, checked against the stored target owner (`server/utils/email-marketing/designAccess.ts`):

- read, comment, resolve, submit and require-review use `assertFreshDesignAccess` (staff/designer client grants);
- approve and request-changes use `assertFreshDesignPublisher`: agency `ADMIN` or `MANAGEMENT` plus `CREATIVE`, independent of client content grants.

If the caller's `scope.clientId` (or `?clientId`) does not match the stored owner, the response is a 404 and no authority check or state change happens.

## Behaviour

- **Exact approval.** Submit binds the current DB digest; `in_review` has that digest. Approve requires `in_review` for the same digest (draft cannot be approved directly). Every command also checks `expectedVersion` and `expectedContentDigest`, so a command never silently re-anchors to content the actor did not see (`review_state_changed` / `review_content_changed`, 409). Two concurrent decisions on one version: exactly one succeeds.
- **Submit-time preparation.** A campaign submit first runs the existing `prepareCampaignHtmlForSend` (asset mirroring) and then binds the resulting digest. This means idempotent preparation at test-send, schedule or send time cannot invalidate the approval. If preparation fails, the response is `502 campaign_asset_preparation_failed` and the state stays draft.
- **Gate at schedule/send.**
  - `scheduleCampaign` and `POST /campaigns/:id/send` call `assertCampaignApprovalCurrent` before materialisation, mirroring or provider work.
  - The MCP department `propose`/`execute send` path calls it inside its ledger transaction.
  - The DB trigger enforces the rule on the status UPDATE for every path, including cron promotion and raw SQL. `setCampaignStatus` and `scheduleCampaign` map the trigger errors to readable 409s, with `message` "Approve this exact campaign content in Review before scheduling or sending."
  - A `templateId` alone never implies approval.
- **Frozen reviewed campaigns.** `prepareCampaignHtmlForSend` returns a non-draft reviewed campaign unchanged (no mirroring or rewrite). A rename or audience change on a reviewed draft no longer re-renders `body_html`, so approved HTML is not silently replaced.
- **Legacy.** Existing rows keep `review_required = false`. Their scheduled, sending and sent snapshots are never rewritten. No review rows are backfilled, so nothing is reclassified as approved. Non-draft campaigns refuse `submit`, `approve`, `request_changes` and `require_review` (`review_target_frozen`). A legacy draft can be opted in with `require_review`, which is permanent.
- **Universal creation gate.** All campaign creation (REST `POST /api/email/campaigns` and MCP `marketing_*` create) goes through `createCampaign`. With the flag on, it writes `review_required = TRUE` whether or not a template was used. No other `INSERT INTO campaigns` exists in `server/`.
- **Comments.**
  - Comments anchor to a stable block ID taken from the saved `body_source` (`shared/emailRendering/reviewBlocks.ts`: reachable blocks only, bounded, plain-text labels) or to the whole email. They also record the content digest and canonical revision ID they were written against.
  - If a block is deleted, its comments remain with the original block ID and appear as `orphaned` under "Comments on removed blocks". They are never reassigned.
  - Comments are plain text and bounded. They trigger no notifications or provider sends.
- **Pending actions (UI).** `app/utils/emailReviewClient.ts` deep-freezes the exact command body at click time.
  - Network errors and 5xx (including `review_outcome_unknown`) keep that body pending with "Retry same request" (same `operationId`) and "Check status" (receipt readback).
  - Typing more into the composer never alters or discards the pending action. The composer is only cleared if it still holds exactly what was sent.
- **Unknown commit.** A transaction failure classified as `ambiguous_commit` is resolved only from the receipt. It is never re-executed in the same request. If no receipt exists, the response is `503 review_outcome_unknown` and the identical retry applies once.

## Hosted web version

- Explicit per-campaign opt-in (`web_version_enabled`). It is part of the approved digest.
- Sending: `campaignSender.sendCampaignChunk` builds one signed URL per campaign from the database digest and passes it as the `{{web_version_url}}` merge value. The URL is the same for every recipient and carries no subscriber identity.
- The token is `signEmailToken(secret, 'webview', campaignId, digest)` from the existing link-signing owner (`links.ts`). Because the purpose is different, a webview token cannot be used as an unsubscribe, click or confirm token, and those tokens cannot open the web version. It is bound to one frozen content version.
- `isTrackableEmailHref` excludes signed `/email/view` links, so they are never wrapped with a subscriber click identity.
- Served only when all of these hold: the flag is on, the signature is valid (checked before any DB read), the row is opted in, the status is `scheduled`, `sending`, `paused` or `sent`, and the current DB digest equals the signed `v`. Otherwise the route returns the same generic 404 page.
- Rendering:
  - It uses stored frozen `body_html` only. It never recompiles `body_source` or joins merge or condition definitions.
  - Conditions are evaluated before merge with an empty recipient, so personalised branches stay hidden.
  - Merge tags are resolved once with no recipient values (authored fallbacks only, no email or name).
  - Campaign UTM is added through the same href rewriter as click tracking.
  - Scripts and active tags are stripped as defence in depth.
- Headers: `default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; font-src https: data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; sandbox allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation`, plus `X-Frame-Options: DENY`, `no-referrer`, `no-store`, `nosniff`, `noindex`, COOP and a Permissions-Policy. No cookies are read or set. The route is outside `/api`, so the staff auth middleware does not apply.

## Campaign UTMs

`trackingLinks.ts` stays the single owner:

- `appendEmailUtm` takes optional `{ source, medium, campaign, term, content }`. The defaults are unchanged (`email` / `email` / `<campaignId>`), and parameters already written into a link always win.
- `rewriteTrackableHrefs` is the shared one-pass parse/serialize used by both click tracking and web-version decoration. Each href is read as an HTML client reads it, and the replacement is serialized once with `&amp;`.
- Unsubscribe, merge-token, `mailto:`, `tel:` and `sms:` links are skipped in both cases.
- The click redirect reads `utm_settings` from the campaign row. That row is frozen once a reviewed campaign leaves draft. The query uses `to_jsonb(c)->'utm_settings'` so it stays valid before migration 497. Malformed stored values fall back to the defaults.
- Values are strictly limited to `[A-Za-z0-9 ._+-]{1,100}`, enforced by the server and the UI.

## UI (Nuxt UI v4)

- `app/components/email/review/Panel.vue` is the review panel:
  - a draft / in review / approved stepper with a short content fingerprint;
  - a blocks navigator with open-comment counts, per-block threads with replies, resolve/reopen, and "Earlier version" badges;
  - a section for orphaned comments;
  - submit, approve, request changes and withdraw approval (the last two use a `UModal` with a required note);
  - recovery of unknown outcomes.
- `app/components/email/review/CampaignSettings.vue` covers web version (`USwitch`) and UTM fields (`UFormField`, `grid-cols-2 gap-4`). It is read-only once the campaign leaves draft.
- `app/components/email/review/Drawer.vue` is a `USlideover` host with Review and "Links & web version" tabs.
- `CampaignsPanel.vue` and `TemplatesPanel.vue` each gained a flag-gated Review button and the drawer (narrow integration). No builder-file (`EdmFlyhubBuilder`) or library/rendering-owned file changed.

## Files

New:
- `server/database/migrations/497_email_review_workflow.sql`
- `server/utils/email-marketing/{review,reviewHttp,webVersion}.ts`
- `server/api/email/review/**`
- `server/routes/email/view.get.ts`
- `shared/emailRendering/reviewBlocks.ts`
- `app/utils/emailReviewClient.ts`
- `app/components/email/review/{Panel,CampaignSettings,Drawer}.vue`
- `test/fixtures/email-review/bootstrap.sql`
- `test/unit/emailReviewWorkflow.test.ts`
- `test/unit/emailReviewWorkflowPostgres.test.ts`
- `test/server/api/emailReviewRoutes.test.ts`

Modified:
- `server/utils/email-marketing/{campaigns,campaignSend,campaignSender,links,trackingLinks}.ts`
- `server/api/email/campaigns/{[id].patch,[id]/send.post,config.get}.ts`
- `server/api/public/email/click.get.ts`
- `server/utils/ai/marketing/departmentEmailOperations.ts`
- `app/components/email/{CampaignsPanel,TemplatesPanel}.vue`
- `test/utils/emailCampaignSendingRuntimeConfig.test.ts` (config now returns two booleans)
- `test/server/api/emailClickRedirect.test.ts` (two UTM cases)

## Verification

The toolchain was Node `v24.18.0` (`~/.nvm/versions/node/v24.18.0`) with Vitest 4.1.10 `--cache=false` running as one worker. `node_modules` and `.nuxt` are symlinks to the root worktree; nothing was installed.

Final results (2 November 2026):

- **M06 suites:** 3 files, **53 tests passed** (`emailReviewWorkflow` 26, `emailReviewWorkflowPostgres` 21 against local PG 14.19, `emailReviewRoutes` 6).
- **Related existing suites:** 34 files, 241 passed and 16 skipped (the opt-in PG suites). There is 1 failure; it is pre-existing and reproduced on base `d8d1c66f0` (see Regressions below). The click redirect file includes the two new UTM cases.

Commands used:

```sh
export PATH=$HOME/.nvm/versions/node/v24.18.0/bin:$PATH
initdb -D /tmp/xf-review-pg -U postgres -A trust
pg_ctl -D /tmp/xf-review-pg -o "-p 54397 -k /tmp -c listen_addresses=''" start
EMAIL_REVIEW_PG_URL='postgresql:///postgres?host=/tmp&port=54397&user=postgres' \
  node node_modules/vitest/vitest.mjs run --cache=false --no-file-parallelism \
  test/unit/emailReviewWorkflow.test.ts test/unit/emailReviewWorkflowPostgres.test.ts test/server/api/emailReviewRoutes.test.ts
```

Coverage:

- **Pure** (`emailReviewWorkflow.test.ts`):
  - block outline lineage, cycles and orphans;
  - strict bodies that cannot assign approval, digest, state or actor;
  - session-bound actor;
  - receipt hash bound to domain, target, kind, command and digest;
  - exact-digest approval currency;
  - legacy campaigns pass with no query;
  - flag precedence;
  - frozen pending actions and error classes;
  - web version signature, version and cross-purpose denial (unsubscribe and click tokens);
  - availability matrix;
  - PII-free, condition-before-merge rendering with no script and UTM-only links;
  - single-pass tokens;
  - CSP/sandbox;
  - UTM parse, defaults and authored-wins;
  - tracking and UTM escaping parity with unsubscribe and web-version exclusion;
  - the send path inserts one recipient-free web URL with conditions evaluated before merge;
  - no `fetch` calls.
- **Real PostgreSQL** (`emailReviewWorkflowPostgres.test.ts`, opt-in through `EMAIL_REVIEW_PG_URL`, local scratch only). Runs migration 497 twice on the pre-497 shapes and covers:
  - a legacy scheduled campaign stays ungated, unrewritten and is never approved;
  - flag-off creation;
  - workflow-created campaigns are gated through `setCampaignStatus` and raw SQL `sending`/`sent`;
  - the permanent flag;
  - gated INSERT;
  - a forged `approved` row with the wrong digest is refused;
  - approve, then schedule, then frozen content (body and UTM), with no re-preparation;
  - MCP pre-check;
  - six invalidation mutations (subject, body, sender, UTM, web version, raw SQL);
  - rename keeps the HTML and the approval;
  - template revision invalidation;
  - stale digest and stale version;
  - concurrent approve vs request-changes (one winner);
  - no approve from draft;
  - review authority required, with `canReview` false for staff;
  - cross-client scope returns 404 with zero authority calls;
  - revocation on replay and readback;
  - receipt replay plus reuse across target, command, payload and kind;
  - immutable receipts;
  - lost reply after commit is recovered from the receipt;
  - unknown outcome without commit returns 503, then one retry applies once;
  - submit-time preparation binding and its 502;
  - comment lineage, threads, missing block, orphan and outdated flags, immutable and undeletable comments, resolve;
  - template comment revision identity;
  - web version digest equals the approval and is available only once frozen.
- **Routes** (`emailReviewRoutes.test.ts`, plus two cases in `emailClickRedirect.test.ts`):
  - `/email/view` is a 404 with CSP when the flag is off;
  - a bad signature is refused before any DB read, with no session, cookie or set-cookie;
  - digest mismatch or draft returns 404;
  - the exact version renders, scrubbed;
  - review routes return 404 with no-store when the flag is off, and 401 for an invalid session;
  - the click redirect applies the frozen UTM settings and falls back on malformed values.
- **Mutation checks** (on the real-PG suite, each reverted afterwards). Each of these broke at least one test:
  1. the trigger approval ignores the digest;
  2. the invalidation trigger is disabled;
  3. approve accepts write authority.
- **Regressions.** 34 existing suites that touch campaigns, tracking, links, the click route, department email and the campaigns panel were rerun:
  - `emailCampaignSendingRuntimeConfig` was updated for the new boolean.
  - `test/server/api/emailClientScope.test.ts > defaults new scoped custom modules…` fails in the same way on an untouched checkout of base `d8d1c66f0`. That is a pre-existing module-publisher test harness issue (`getHeader` on a mock event) and is unrelated to M06.
- **SFC compile.** `@vue/compiler-sfc` parse, script and template compile succeed for `Panel`, `CampaignSettings`, `Drawer`, `CampaignsPanel` and `TemplatesPanel`.
- **Lint.** ESLint is clean for every new file and for the modified server and test files. `TemplatesPanel.vue` keeps its 121 existing one-line style errors; none are on lines changed here.
- **Types.** A scoped `tsc` run (Nuxt server tsconfig, skipLibCheck) over every changed or new server/shared file reports **0 errors in M06 files**. The project graph it pulls in has 1,166 existing errors in unrelated files (documented known issue). `app/utils/emailReviewClient.ts` and `reviewBlocks.ts` pass `tsc --strict` in isolation. The Vue SFCs were compiled but not run through `vue-tsc`, because Nuxt auto-import types would make the output noisy.

## Not verified / remaining (parent-owned or hosted)

- Migration 497 is not applied to any configured DB. The parent applies it. Before that, the flag must stay off because new columns are written only when the flag is on.
- No real browser session for the drawer, panel, stepper or modal; no dark-mode eyeball check; no keyboard walk-through. No hosted `/email/view` request through Cloudflare Pages: CSP, header delivery and the route's place in the Worker size budget are unmeasured.
- No real sends, provider calls or real email-client rendering of a `{{web_version_url}}` link.
- `{{web_version_url}}` is not yet in the merge-tag picker (`BUILTIN_MERGE_CHOICES` is owned by M01 / parent). Authors type it into a link. If web version is off, it resolves to an empty href.
- `/email/view` lives under the existing public `/email/*` prefix that the Nuxt auth middleware already exempts. Private runtime and route registration and any Pages size-budget decision belong to the parent.
- The campaign `PATCH` path itself has no CAS (as before). Concurrent setting edits are last-writer-wins, but any change invalidates approval at the database.
- Public marketing-page sync (`features` pages and the nav) is parent-owned and was not changed.
