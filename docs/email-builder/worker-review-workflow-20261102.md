# M06 — Email review workflow, hosted web version and campaign UTMs

Date: 2 November 2026. Worker task `task_261627595c6f`, dispatch `ctx_6ac4720f9b72`.
Branch `adme-dev/figflow-review-workflow-20261102`, base `d8d1c66f09eeeae35ec6660b814985ec6e6867f7` (includes fetched main `c1dd2d27f`).
This is a continuation of an earlier dispatch that was killed by an Orca restart; its uncommitted files were kept and finished here, not reset.

Scope is only the approved M06 slice: block comments, draft → in review → approved, exact-content approval gates on scheduling/sending, the hosted web version and per-campaign UTM settings. It adds no other features. The parent owns migration application, CI, release/config, flag activation, private runtime route registration and the public marketing-page sync. Root will not merge or activate M06 until core saved-draft → native edit → review/Apply → reopen acceptance passes.

## Flag

`FIGFLOW_EDM_WORKFLOW_ENABLED` (`'true'` only). When the flag is off (corrected by the follow-up below, so a rollback strands nothing):

- review GET/POST/readback routes still require a fresh session (`cache-control: no-store`). They serve **only campaigns that are already gated** (`review_required`), for review and recovery. Templates and ungated campaigns return `404`, as does new enrollment (`require_review`);
- `/email/view` keeps serving already-signed links of gated, opted-in, frozen campaigns. Ungated rows are never served;
- `PATCH /api/email/campaigns/:id` refuses `utm_settings` / `web_version_enabled` with `400 email_workflow_disabled`;
- new campaigns are created with `review_required = false`, so campaign behaviour is unchanged;
- the campaign and template panels hide the Review action (`/api/email/campaigns/config` now also returns the boolean `review_workflow_enabled`).

Precedence matches the other FigFlow flags: a request binding that is present wins (including `'false'`), then the per-request cached binding, then `process.env`. The parent owns activation.

## Migration (reserved 497, not applied by this worker)

`server/database/migrations/497_email_review_workflow.sql`. It is additive and idempotent: every CREATE is guarded, functions use `CREATE OR REPLACE`, and triggers are dropped and recreated. It was verified by running it twice on a local scratch PostgreSQL 14. The parent applies it to the configured DB after review. Contents:

- `campaigns`: `review_required boolean NOT NULL DEFAULT false`, `web_version_enabled boolean NOT NULL DEFAULT false`, `utm_settings jsonb` (object only, ≤ 1 KiB, check constraint `campaigns_utm_settings_shape`).
- `email_review_digest_part`, `email_campaign_content_digest(body_source, body_html, subject, preview_text, from_name, from_email, reply_to, utm_settings, web_version_enabled)` and `email_template_content_digest(body_source, body_html, subject, preview_text, email_design_revision_id)`. These are length-prefixed, version-tagged SHA-256 hashes computed only in SQL. A digest is never accepted from a browser or JSON body.
- Follow-up: the row forms `email_campaign_content_digest_of(campaigns)` and `email_campaign_review_digest_of(campaigns)` take the row itself, never an id. Campaign approval binds the review digest: the content digest plus `filter_rules` and the sorted target list IDs (not live membership). The web version is signed over the content digest only.
- `email_review_states (target_kind, target_id)` holds the state, the bound `content_digest`, a CAS `version`, and the submitter, decider and note. For campaigns, `content_digest` stores the review digest. Constraint `email_review_states_independent_approval` requires that an approved row's decider differs from its submitter.
- `email_review_comments` is append-only. Each comment records its block ID, content digest, revision ID, parent, plain body (≤ 2,000 chars), author and resolution. Triggers make lineage immutable, block deletes, and require replies to stay in a root thread on the same block.
- `email_review_operations (actor_id, operation_id)` stores immutable receipts holding the domain, command, target, payload SHA-256 and result. UPDATE, DELETE and TRUNCATE are rejected.
- Triggers `email_review_campaign_guard_insert` (BEFORE INSERT, gated rows only) and `email_review_campaign_guard` (BEFORE `UPDATE OF` the requirement, status and reviewed columns, `WHEN` the old or new row is gated) form the universal gate:
  - a gated campaign must be inserted as `draft`;
  - `review_required` can never go back to false;
  - leaving `draft` **or `cancelled`** for any other status requires an `approved` state whose digest equals the review digest of the proposed NEW row;
  - once a gated campaign has left draft, any change to reviewed content or `filter_rules` is refused (`email_campaign_content_frozen`).
- Triggers `email_review_campaign_invalidate` and `email_review_template_invalidate` (AFTER `UPDATE OF` the reviewed columns, `WHEN` a value actually differs) reset an in-review or approved state to `draft`. They increment `version`, record a "Content changed" note and hash nothing. They apply to every entrypoint, but counter, webhook and status-only updates never reach them.
- `campaign_lists`:
  - `email_review_campaign_lists_guard` (BEFORE, locks the campaign row first) refuses direct list changes for a gated campaign that has left draft. FK cascades are allowed (`pg_trigger_depth() > 1`).
  - The deferred `email_review_campaign_lists_invalidate` resets a draft's decision at commit only if the review digest no longer matches, so re-saving an identical set is a no-op.

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

- **Exact approval.** Submit binds the current DB review digest; `in_review` has that digest. Approve requires `in_review` for the same digest (draft cannot be approved directly), and a reviewer other than the submitter (`403 review_independent_reviewer_required`; also enforced by the SQL constraint). Every command also checks `expectedVersion` and `expectedContentDigest`, so a command never silently re-anchors to content the actor did not see (`review_state_changed` / `review_content_changed`, 409). Two concurrent decisions on one version: exactly one succeeds.
- **Submit-time preparation.** A campaign submit prepares sendable HTML outside the transaction with `preparedCampaignHtml` (asset mirroring, nothing written). The command transaction then writes it after re-verifying the digest under lock, and binds the resulting digest. This was corrected in the follow-up: the earlier code wrote it before the transaction. This means idempotent preparation at test-send, schedule or send time cannot invalidate the approval. If preparation fails, the response is `502 campaign_asset_preparation_failed` and the state stays draft.
- **Gate at schedule/send.**
  - `scheduleCampaign` and `POST /campaigns/:id/send` call `assertCampaignApprovalCurrent` before materialisation, mirroring or provider work.
  - The MCP department `propose`/`execute send` path calls it inside its ledger transaction.
  - The DB trigger enforces the rule on the status UPDATE for every path, including cron promotion and raw SQL. `setCampaignStatus` and `scheduleCampaign` map the trigger errors to readable 409s, with `message` "Approve this exact campaign content in Review before scheduling or sending."
  - A `templateId` alone never implies approval.
- **Frozen reviewed campaigns.** `prepareCampaignHtmlForSend` returns a non-draft reviewed campaign unchanged (no mirroring or rewrite). A rename or audience change on a reviewed draft never re-renders `body_html`. Since the follow-up, an audience change still invalidates the approval through the review digest.
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
- Served only when all of these hold:
  - the signature is valid (checked before any DB read);
  - the row is gated (`review_required`) and opted in;
  - the status is `scheduled`, `sending`, `paused` or `sent`;
  - the current DB content digest equals the signed `v`.

  Otherwise the route returns the same generic 404 page. Since the follow-up this is independent of the flag, so links already sent survive a rollback. The sender only issues links for gated, non-draft campaigns, and `web_version_enabled = true` is refused on ungated drafts (`409 web_version_requires_review`).
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

## Follow-up: confirmed P1 fixes (task `task_492bb1f5f64b`, dispatch `ctx_82990af46865`, 2 November 2026)

**Scope.** Isolated checkout `figflow-review-workflow-20261102`, head `7bcc64db3`.
- Uncommitted; review with `git diff 7bcc64db3`.
- 19 files, +617/−152. Diff SHA-256 is `889f7e945e2882d923c8b5bf4ebab45b2627d29f303ad776714c7888c95fe16e`, excluding this report.
- The flag stays off. 497 is not applied to any configured DB.
- No commit, stage, push, install, build, CI, deploy, provider, real email or browser.
- Follows `.verification/m06-current-integration-review-20261102.md` in root.

### Fixes

1. **Independent approval.**
   - Service: `review.ts` `approve` refuses when `submitted_by` is missing or equals the actor.
   - View: the new `canApprove` field is false for the submitter, and the panel hides Approve and explains why.
   - SQL: CHECK `email_review_states_independent_approval`.
2. **Approval binds the audience.**
   - The review digest is the content digest plus `filter_rules` plus the sorted `campaign_lists` IDs. It is computed from the trigger's NEW row by a row-typed function, with lists read as of the statement.
   - Draft list or rule changes invalidate. A list change uses a deferred trigger compared with the stored decision, so re-saving the identical set is a no-op.
   - Non-draft gated campaigns refuse direct list or rule changes. List or campaign deletion cascades are allowed.
   - Live list membership is not bound; the materialized-recipient send freeze remains the owner.
   - `assertCampaignApprovalCurrent` mirrors the trigger: it judges only `draft`/`cancelled` (or unknown) status, so a list-deletion cascade cannot block resume of an in-flight campaign.
3. **Flag-off rollback.**
   - Routes no longer 404 before the session check. The service serves only already-gated campaigns, for view, all review commands and readback.
   - New enrollment (`require_review`) returns 404. Settings PATCH stays refused, and the drawer's settings are read-only.
   - The Review action stays visible for gated rows.
   - `/email/view` serves signed gated links regardless of the flag.
4. **No body hashing on counter, webhook or status-only updates.**
   - The guard and invalidation triggers are `UPDATE OF` the reviewed columns with `WHEN` guards. Invalidation no longer hashes at all.
   - A digest is computed only when leaving draft or cancelled, or for a list change at commit.
5. **Cancelled-to-dispatch bypass closed.** Approval is required whenever a gated row leaves `draft` or `cancelled`. Legacy rows are unaffected.
6. **P2 submit preparation, a bounded remedy within the existing owner.**
   - Preparation is computed outside the transaction (no lock held during asset I/O).
   - It is written inside the same command transaction as the state and receipt, after the digest is re-verified under `FOR UPDATE`.
7. **Web version audit.** Gated only, both in serving and in the sender. Ungated `web_version_enabled = true` returns 409. It is flag-independent for already-signed links, and the signed version is the frozen content digest.

### Lock order

Campaign row first, then review state, as in the review command (`FOR UPDATE` target, then state):
- status updates hold the campaign row;
- the list guard takes `FOR NO KEY UPDATE` on the campaign before RI;
- the deferred list invalidation locks the campaign before updating the state.

A real-PG test proves both interleavings:
- an uncommitted retarget makes a concurrent schedule wait, and the schedule is then refused (`email_campaign_approval_required`);
- an uncommitted schedule makes a concurrent list insert wait, and the insert is then refused (`email_campaign_content_frozen`).

### Evidence

**Red first.** On the original `7bcc64db3` sources, with only the harness switched to a unique schema, all 10 new regressions failed for the intended reasons and the 25 existing tests passed. The failures were:
- self-approval resolved;
- a list change kept the approval;
- a frozen list insert was accepted;
- `cancelled` → `scheduled` was accepted;
- the trigger had no `UPDATE OF`;
- flag-off fields were absent;
- preparation was not in the transaction;
- an ungated web version was available;
- a flag-off route returned 404 before the session check.

**Final runs** (Node `v24.18.0`, Vitest 4.1.10 `--cache=false --no-file-parallelism`):
- **M06 suites:** `emailReviewWorkflowPostgres` (30), `emailReviewWorkflow`, `emailReviewRoutes`, `emailClickRedirect` and `emailCampaignSendingRuntimeConfig`: **86 passed, 0 skipped, 0 failed**. The 30-test PG suite ran with zero skips.
- **PG harness:**
  - Disposable local PostgreSQL 17 on Unix socket `/private/tmp/figflow-postgres-20261102-recovered`, port 55483, database `figflow_design_test`, user `figflow_test`.
  - One unique schema per run (`xf_review_<pid>_<time>`), applied through the connection `search_path` and dropped in `afterAll`. The suite asserts the drop.
  - After the run, `select count(*) from pg_namespace where nspname like 'xf_review_%'` = **0**.
  - No database, role or server setting was created or changed.
  - Migration 497 is executed twice (idempotency) on pre-497 shapes. `bootstrap.sql` now also has `email_lists` / `campaign_lists` with the production FK cascades.
- **Related suites** (44 files that import a touched module): 41 passed, 1 skipped and 2 failed. 383 tests passed, 16 were skipped and 4 failed.
  - **`emailClientScope`:** pre-existing on base `d8d1c66f0` (already recorded above).
  - **`test/components/emailTemplatesPanelDelete.test.ts` (3):**
    - It counts `$fetch` calls exactly.
    - The candidate's `7bcc64db3` `TemplatesPanel.vue` adds one `onMounted` call to `/api/email/campaigns/config`, so every count is one high.
    - Neither file is changed by this follow-up. The parent must update the counts, or exclude the config URL, during integration.
  - **Skipped:** `test/ai/departmentEmailInboxPostgres.test.ts`, opt-in via `DEPARTMENT_EMAIL_PG_URL`. It was not run because it uses a fixed shared schema name, `dept_email_test`, not a unique one. `departmentEmailOperations.ts` is unchanged.
- **ESLint:** clean, exit 0 with no findings, on all 18 changed TS/Vue files.
- **Types:**
  - Scoped `tsc` with the Nuxt server tsconfig plus the Nitro/shared auto-import declarations, `skipLibCheck`, over every changed server, shared and test TS file: **0 errors in changed files**.
  - The 590 remaining errors are in unrelated files pulled in by `nitro.d.ts` (the known project graph).
  - `server/utils/email-marketing/review.ts` does not exist in root, so the route imports resolved to this checkout.
- **SFC:** `@vue/compiler-sfc` parse, script and template compile succeed for `CampaignsPanel`, `CampaignSettings`, `Drawer`, `Panel` and `TemplatesPanel`.

Commands:

```sh
export PATH=$HOME/.nvm/versions/node/v24.18.0/bin:$PATH
EMAIL_REVIEW_PG_URL='postgresql:///figflow_design_test?host=/private/tmp/figflow-postgres-20261102-recovered&port=55483&user=figflow_test' \
  node node_modules/vitest/vitest.mjs run --cache=false --no-file-parallelism \
  test/unit/emailReviewWorkflowPostgres.test.ts test/unit/emailReviewWorkflow.test.ts test/server/api/emailReviewRoutes.test.ts \
  test/server/api/emailClickRedirect.test.ts test/utils/emailCampaignSendingRuntimeConfig.test.ts
node node_modules/eslint/bin/eslint.js <changed .ts/.vue files>
```

Local logs (gitignored `*.log`) are in `.verification/m06-followup/`:
- `red-before-fix.log`
- `final-m06-suites.log`
- `related-suites.log`
- `eslint.log`
- `tsc-server.log`
- `sfc-compile.log`

### Source hashes (SHA-256, working tree)

| File | SHA-256 |
|---|---|
| `server/database/migrations/497_email_review_workflow.sql` | `d5832157b84b475ba6f7ec546e35f8204d151c65788d7d6d834f8c5133f9ef4d` |
| `server/utils/email-marketing/review.ts` | `a2dc8ed3c9e92067ee5310920437ec51394f753ccf67af4f6cea9fba39c80209` |
| `server/utils/email-marketing/reviewHttp.ts` | `8645e5fbb8cc76bb6a81fee50b02ed3a42eea3974a97eeca80c2b0fd3354b83f` |
| `server/utils/email-marketing/campaigns.ts` | `f0c3793f35fd8edd64d3da8aafe010932943eb1851cc41a469c2cb407b2701cd` |
| `server/utils/email-marketing/campaignSender.ts` | `4d1e1926530a968b754c281e7251ccc5f61ef150326a565d623b22bf9690c543` |
| `server/utils/email-marketing/webVersion.ts` | `ebc17dfcc6fa7a3f568baef71d810d842638edc8c60b0df7aaa7f972ef931b0c` |
| `server/routes/email/view.get.ts` | `0883ca4fae556b0f34f9021b54c5fdebb9015a86845d69d4cfb16a582ce4216e` |
| `server/api/email/review/[kind]/[id].get.ts` | `11c96d32f24cb98024f01acb0fd50ff84ad729c2129ba28302598a0b8930a79b` |
| `server/api/email/review/[kind]/[id]/commands.post.ts` | `6564013e04aebef3c497a59e3d9cc64043a0030e7a8ee138983221f3c319a914` |
| `server/api/email/review/operations/[operationId].get.ts` | `d4efdc6b4a68a7a95e7dcaf22d531ed4d3a0fcfe9aac01b9d21079072a020511` |
| `app/utils/emailReviewClient.ts` | `28f99c805e5bcb126bda2ce08af5697222f915e411739100cde3208f0542245d` |
| `app/components/email/review/Panel.vue` | `ba239f368d6e2b26f83c71c6be6d68f389c6dba3a51cb2f6263338b2790dce15` |
| `app/components/email/review/Drawer.vue` | `7a8a83a489c417d757902b8650bf8165f9ab9ba257e805d1658d1c6f5eaa39dd` |
| `app/components/email/review/CampaignSettings.vue` | `b737c9898dd772d23b2c7799c76dcdda0f7c2d0a0f3e22aff67b8c66e4af211c` |
| `app/components/email/CampaignsPanel.vue` | `b8663d7ac6a728e0e444d6da218332c5b71e07618778ee87c209d010ed0e9e55` |
| `test/unit/emailReviewWorkflowPostgres.test.ts` | `7a40f2d69a023e537db6dff92923f728535779d965ccd9c99b3a54bbc4f0e737` |
| `test/unit/emailReviewWorkflow.test.ts` | `a1c52e87defce27d2059cdb516e72e5160bc404a612ef84b78e974b88bb3df92` |
| `test/server/api/emailReviewRoutes.test.ts` | `9532e1f540047f8ce5c2a5ee10fe44a45a10f0c1e21125a35492ac6eff19dce9` |
| `test/fixtures/email-review/bootstrap.sql` | `23b9afbd6552f495a32d8ee10ca792c4b297c164973814fe5a2fd7dc58bc0749` |

### New and changed tests

**New in `emailReviewWorkflowPostgres.test.ts`**, in the "follow-up regressions" group:
- self-approval (service, view, SQL);
- list/rule binding and the identical-re-save no-op;
- frozen audience and cascades;
- the two concurrent lock-order interleavings, plus campaign deletion;
- cancelled raw dispatch and legacy cancelled → scheduled unchanged;
- counter/same-value updates and the trigger definitions;
- flag-off recovery and enrollment refusal;
- in-transaction preparation with an uncommitted attempt followed by the identical retry;
- gated-only web version, including the sender.

**Changed assertions, intentional:**
- The forged approved row now carries `submitted_by`.
- The web-version identity test asserts content digest ≠ approval digest.
- The preparation test uses the pure (returns-HTML) contract.
- The rename-only test title.
- Route tests: flag-off signed gated link is served, ungated is 404; flag-off review routes return 401 (session) instead of a pre-session 404.
- Pure availability fixture is gated, and ungated cases were added.

### Limits and remaining

- **Submit retry (P2).** The test proves one scenario: an attempt whose transaction ran and rolled back (reported as an ambiguous 503) left no DB side effect, and the identical retry then applied once and replayed afterwards.
  - It is not a general identical-retry proof.
  - Asset mirroring uploads made by an uncommitted attempt stay in storage. They are content-addressed and idempotent, but they are not rolled back.
  - A committed-but-lost reply relies on the existing receipt readback.
- **Rollback interpretation.** With the flag off, the sender still issues the signed link for a gated campaign that was approved with the web version enabled. The link is part of its frozen approved content. Only enabling the web version (the settings PATCH) and new enrollment are disabled. If the parent wants link issuance itself to stop when the flag is off, it is a one-line change in `frozenWebVersionUrl`, but recipients of those campaigns would then get an empty href.
- **Comment staleness.** Comments on campaigns record the review digest, so an audience change marks earlier comments "outdated".
- **Not done here (parent-owned):**
  - `web_version_url` picker wiring;
  - marketing pages;
  - the god-mode inventory ratchet;
  - the `emailTemplatesPanelDelete` count update;
  - the Pages binding budget;
  - 497 application with a receipt;
  - combined CI and hosted acceptance.
- **Not exercised:** real browser, provider and real email.
