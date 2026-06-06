# Email List Deliverability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a safe, auditable email list and campaign sending lifecycle covering consent, suppression, bounces, opt-outs, scheduled sends, and first-party tracking.

**Architecture:** Keep the current owned-data model in Postgres and add audit/history tables around it. Resend stays the send transport and webhook source. Campaign dispatch remains resumable through `campaign_recipients`, with stricter preflight, snapshotting, and attribution layered in.

**Tech Stack:** Nuxt 4/Nitro, Neon Postgres, Vitest, Resend, existing email-marketing utilities, existing tracking stack.

**Spec:** `docs/superpowers/specs/2026-06-05-email-list-deliverability-prd.md`

## Implementation Status

Last updated: 2026-06-06.

- [x] Backend audit foundation: consent events, suppression events, soft-bounce fields, and audit helpers are implemented.
- [x] Consent/suppression integration: imports, manual adds, public subscribe/confirm, preference unsubscribe, global one-click unsubscribe, Resend hard bounces, complaints, and blocklist status changes write history.
- [x] Bounce lifecycle: delivery-delay soft bounces increment subscriber counters, optional threshold suppression is configurable, hard bounces/complaints suppress and blocklist, and later delivery clears soft-bounce state.
- [x] Scheduled send preflight and snapshot: schedule/send/test-send use structured preflight, physical footer identity is enforced, recipient snapshots include disabled/blocklisted/suppressed/unsubscribed exclusions, and dispatch failures persist preflight details.
- [x] Queue safety: dispatch rechecks suppression and list membership before claiming, pause stops future sends, cancellation clears pending claims, stale claims are released, and rate-limit paths release claimed recipients.
- [x] First-party click redirect and attribution: signed redirects, UTM rewriting, scanner classification, campaign event summaries, and attribution joins are implemented.
- [x] Subscriber and suppression admin UI: subscriber rows show bounce/suppression state, detail history is available, suppression search/add/remove routes and UI are implemented with policy checks.
- [x] Campaign schedule UX: preflight panel renders blocked/warning checks and recipient exclusions, and blocked campaigns cannot be scheduled.
- [x] Campaign reporting: report distinguishes delivery, opens, clicks, human-clicks, delayed, bounced, complained, unsubscribed, and site attribution; opens are labelled directional.
- [x] Client-scoped ownership policy: list/subscriber/campaign/media/suppression routes enforce assigned-client scope and block mixed-client campaign targeting.

Verification on 2026-06-06:

```bash
pnpm vitest run test/utils/email*.test.ts test/server/api/email*.test.ts test/components/email*.test.ts test/utils/edmPresets.test.ts test/utils/edmSectionBuilders.test.ts test/utils/edmInlineText.test.ts test/utils/edmInlineTextRealBrowser.test.ts test/utils/edmModuleFragment.test.ts test/utils/edmHtmlEditables.test.ts test/utils/edmStyle.test.ts test/utils/edmResponsive.test.ts test/utils/edmDivider.test.ts test/utils/edmDragReorder.test.ts test/utils/edmImageAssets.test.ts test/utils/edmCustomModuleCategories.test.ts test/utils/edmSectionSettings.test.ts test/app/edmBuilderStore.test.ts test/server/edmCustomModules.test.ts
```

Result: 88 test files passed, 1 real-browser file skipped, 507 tests passed, 2 real-browser tests skipped. Real-browser sanitizer coverage is opt-in with `RUN_REAL_BROWSER_TESTS=true`; the default sweep stays stable when Chrome is installed but not launchable in the local runner.

---

## Task 1: Backend Audit Foundation

**Files:**
- Create: `server/database/migrations/165-email-consent-suppression-audit.sql`
- Create: `server/utils/email-marketing/audit.ts`
- Modify: `server/utils/email-marketing/types.ts`
- Test: `test/utils/emailMarketingAudit.test.ts`

**Acceptance:**
- Consent events can be recorded with email, list, source, actor, and metadata.
- Suppression events can be recorded with reason, action, source, actor, and metadata.
- Subscriber rows can track soft-bounce count and last soft-bounce time.
- Migration is additive and safe to run more than once.

## Task 2: Integrate Audit Into Existing Flows

**Files:**
- Modify: `server/utils/email-marketing/subscriptions.ts`
- Modify: `server/utils/email-marketing/resendEvents.ts`
- Modify: `server/utils/email-marketing/db.ts`
- Test: `test/utils/emailSubscriptionsAudit.test.ts`
- Test: `test/utils/emailResendEvents.test.ts`

**Acceptance:**
- Public form subscribe records `form_submitted`.
- Double opt-in confirm records `confirmed`.
- Preference-center unsubscribe records `list_unsubscribed`.
- One-click/global unsubscribe records `global_unsubscribed` and `global_unsubscribe` suppression history.
- Resend hard bounce records `hard_bounce` suppression history.
- Resend complaint records `complaint` suppression history.
- Imports record `imported` consent/provenance events.

## Task 3: Soft Bounce Handling

**Files:**
- Modify: `server/utils/email-marketing/resendEvents.ts`
- Modify: `server/utils/email-marketing/campaigns.ts`
- Test: `test/utils/emailResendEvents.test.ts`
- Test: `test/utils/emailCampaignMaterialize.test.ts`

**Acceptance:**
- Delivery-delay or provider soft-bounce signals increment `soft_bounce_count`.
- Soft bounces do not immediately insert into `suppression_list`.
- A configurable threshold can later suppress repeated soft bounces without changing the public schema.

## Task 4: Scheduled Send Preflight And Snapshot

**Files:**
- Modify: `server/utils/email-marketing/campaignSend.ts`
- Modify: `server/utils/email-marketing/campaigns.ts`
- Modify: `server/utils/email-marketing/campaignSender.ts`
- Modify: `server/api/email/campaigns/[id]/send.post.ts`
- Modify: `server/api/email/campaigns/[id]/test-send.post.ts`
- Test: `test/utils/emailCampaignSend.test.ts`
- Test: `test/utils/emailCampaignFormat.test.ts`

**Acceptance:**
- Send preflight returns structured checks for unsubscribe, sender, auth readiness, media URLs, HTML size, and footer identity.
- Scheduled campaigns store the preflight result and recipient counts.
- Sending rechecks suppression immediately before claiming recipients.
- Test send uses the same renderer and preflight path as campaign send.

## Task 5: First-Party Click Redirect And UTM Attribution

**Files:**
- Create: `server/utils/email-marketing/trackingLinks.ts`
- Create: `server/api/public/email/click.get.ts`
- Modify: `server/utils/email-marketing/campaignSend.ts`
- Modify: `server/utils/email-marketing/render/index.ts`
- Test: `test/utils/emailTrackingLinks.test.ts`
- Test: `test/server/api/emailClickRedirect.test.ts`

**Acceptance:**
- Links are signed and rewritten through a first-party redirect route.
- Destination links receive stable UTM parameters.
- Click events record campaign, subscriber, destination URL, and metadata.
- Unsubscribe, `mailto:`, `tel:`, and anchor-only links are not rewritten.

## Task 6: Bot And Scanner Click Filtering

**Files:**
- Create: `server/utils/email-marketing/clickClassifier.ts`
- Modify: `server/api/public/email/click.get.ts`
- Test: `test/utils/emailClickClassifier.test.ts`

**Acceptance:**
- Known scanner user agents and impossible timing patterns are tagged as suspected scanner clicks.
- Scanner clicks remain stored but do not inflate primary human-click metrics.

## Task 7: Subscriber And Suppression Admin UI

**Files:**
- Modify: `app/pages/agency/email/index.vue`
- Modify: `app/components/email/SubscribersPanel.vue`
- Create: `app/components/email/SubscriberDetailDrawer.vue`
- Create: `app/components/email/SuppressionPanel.vue`
- Create: `server/api/email/subscribers/[id]/history.get.ts`
- Create: `server/api/email/suppressions/index.get.ts`
- Create: `server/api/email/suppressions/index.post.ts`
- Create: `server/api/email/suppressions/[email].delete.ts`
- Test: `test/server/api/emailSubscriberHistory.test.ts`
- Test: `test/server/api/emailSuppressions.test.ts`

**Acceptance:**
- Staff can inspect a subscriber's list, consent, suppression, and campaign event history.
- Staff can manually suppress an email with a reason.
- Staff can remove only manual/global-unsubscribe suppressions where policy allows.
- Hard bounce and complaint removals require explicit admin confirmation and are audited.

## Task 8: Campaign Schedule UX

**Files:**
- Modify: `app/pages/agency/email/compose.vue`
- Modify: existing campaign schedule/send modal components.
- Create: `app/components/email/CampaignPreflightPanel.vue`
- Test: component tests for preflight rendering and schedule state.

**Acceptance:**
- Schedule modal shows preflight status and blocked/warning checks.
- Recipient snapshot includes selected lists, deduped recipients, unsubscribed exclusions, suppressed exclusions, and blocklisted exclusions.
- Users cannot schedule a blocked campaign.

## Task 9: Campaign Reporting And Tracking Join

**Files:**
- Modify: campaign report page/components.
- Create: `server/api/email/campaigns/[id]/events.get.ts`
- Create: `server/api/email/campaigns/[id]/attribution.get.ts`
- Test: reporting aggregate tests.

**Acceptance:**
- Report distinguishes delivered, opened, clicked, human-clicked, bounced, complained, and unsubscribed.
- Opens are labelled as directional.
- Email click IDs can join to website/session/conversion tracking where available.

## Task 10: Client-Scoped Ownership Policy

**Files:**
- Modify: list/subscriber/campaign APIs under `server/api/email`.
- Modify: media-library selector policy where email assets are attached.
- Test: access-control tests for client-scoped lists, media, and campaign reads/writes.

**Acceptance:**
- Agency users can see agency-wide assets/lists.
- Client-scoped users can only access their own lists and media.
- A campaign cannot target mixed-client lists unless the actor has agency permission.

## Verification Commands

Focused commands as tasks land:

```bash
pnpm vitest run test/utils/emailMarketingAudit.test.ts
pnpm vitest run test/utils/emailResendEvents.test.ts test/utils/emailCampaignSend.test.ts
pnpm vitest run test/server/api/emailSubscriberHistory.test.ts test/server/api/emailSuppressions.test.ts
pnpm run typecheck
```

Known caveat: repo-wide typecheck currently has unrelated baseline errors. Focused Vitest suites are the primary verification while this branch is in active development.
