# PRD: Northern GAC Measurement Control Plane

**Status:** Proposed
**Date:** 2026-09-02
**Product:** XeroFlow Agency Dashboard
**Pilot client:** Northern GAC
**Owner:** Agency media operations
**Implementation baseline:** Current `main`; do not implement from the stale `release/send-scan-foundation` checkout
**Companion application:** `/Users/paulgiurin/Documents/Projects/promotion-knoxgwmhaval`

## 1. Executive summary

XeroFlow must become the reliable control plane and evidence layer for Northern GAC's advertising measurement. An operator or authorized Owner God Mode MCP client must be able to determine which Google Ads account is in scope, which conversion actions exist, which website events map to them, whether each signal was captured and delivered, whether a telephone call actually connected, and why evidence is missing.

This is not primarily a credential repair. Owner God Mode authentication and the stored Google Ads OAuth connections are working. The immediate problems are ambiguous dealer-versus-group account resolution, incomplete website-event coverage, disconnected evidence between the dealer platform and XeroFlow, and reporting that can make a successful empty sync look like verified tracking.

The work must extend XeroFlow's existing Measurement Signal Hub, Google Ads MCP control plane, GTM management, and Google `call_view` reporting. It must not create a parallel measurement system.

## 2. Background and verified facts

### 2.1 Account identity

The following active Google Ads connections were verified on 2026-09-02:

| Scope | Google customer ID | XeroFlow connection ID |
|---|---:|---|
| Northern GAC | `7583977544` | `717f209a-b2ea-4f2e-b489-2034a16ae9c1` |
| Northern Motor Group | `6692975433` | `9e32b563-a2c7-4e44-b703-1223260abd4b` |

The canonical XeroFlow client is Northern Motor Group, client ID `efd1e1c6-f227-4b2f-b36d-19880bdba0e0`. Its aliases include Northern GAC, Northern Kia, Northern MG, and Northern Nissan. A query naming Northern GAC can therefore resolve to the group client and select the wrong Google account unless account scope is explicit.

### 2.2 Northern GAC website measurement

The dealer website is `https://www.northerngac.com.au`. Its live application uses:

- Google Ads tag `AW-18357642769`;
- GTM container `GTM-P4NGC76Q`;
- dealer-platform tracking pipeline `v2_nitro`.

The dealer platform captures `phone_click` through a delegated `tel:` listener and sends evidence to its first-party conversion and identity endpoints. The live GTM container has Google Ads tags for five enquiry types, but no website `phone_click` or `directions_click` conversion trigger was observed.

The five current Northern GAC website action labels are:

| Dealer conversion type | Google Ads label |
|---|---|
| `stock_enquiry` | `uYiECKqfl-kcEJHMzbFE` |
| `model_variant_enquiry` | `ecNzCLafl-kcEJHMzbFE` |
| `finance_enquiry` | `bIRJCK2fl-kcEJHMzbFE` |
| `test_drive_enquiry` | `ko-1CLCfl-kcEJHMzbFE` |
| `contact_us` | `fhcGCLOfl-kcEJHMzbFE` |

Google-hosted `Clicks to call`, `Calls from ads`, local directions, website visits, and other-engagement actions also exist in the account. Those provider-hosted actions are not evidence that the dealer website's ordinary `tel:` or directions links are configured as Google Ads website conversions.

### 2.3 Existing XeroFlow capability on `main`

The following work is already implemented and must be reused:

- Measurement Signal Hub profiles, destinations, capabilities, mappings, activation approvals, provider tests, audit history, outbox delivery, and portal health.
- Typed enquiry mapping for `stock`, `finance`, `test_drive`, `contact`, and `model_variant` under `web_conversion`.
- Canonical `phone_click`, `add_to_wishlist`, and `form_submit` events.
- Promotion of consent-granted browser `phone_click`, `add_to_wishlist`, and `form_submit` events to GA4 Measurement Protocol. This is GA4 delivery, not a dedicated Google Ads website conversion.
- Google conversion-action discovery and governed provisioning from the client Measurement UI.
- Governed Google Ads MCP inventory and mutation controls, including conversion-action inventory, creation, update, archive, primary-state, customer/campaign goal, and custom-goal operations.
- Google Tag Manager admin and Owner MCP controls.
- Google Ads `call_view` ingestion, persistence, sync observability, and analytics.

Key merged work includes:

| Capability | Integrated source |
|---|---|
| GA4 micro-conversions | PR #310 and migration 313 |
| GTM admin and Owner MCP controls | `feat/gtm-admin-mcp`, merged to `main` |
| Measurement configuration God Mode | `fix/measurement-configuration-god-mode`, merged to `main` |
| Google call reporting | `feature/brighton-nissan-measurement-completion`, including migration 335 |
| Google Ads MCP control plane | PR #486, squash commit `b4f162758` |
| Google Ads MCP catalog fixes | PRs #487 and #488 |

### 2.4 Current production evidence

- Google call synchronization completed successfully for both Northern accounts but returned zero `call_view` rows.
- This proves only that the query ran successfully and Google returned no call records for the window. It does not prove end-to-end call tracking is operational.
- Campaign conversion metrics can be suppressed while historical synchronization is pending.
- The dealer platform recorded website phone-click evidence, but XeroFlow cannot currently reconcile that evidence with a dedicated Google Ads website phone-click action.

## 3. Product problem

Today, an operator cannot answer the following questions from one trustworthy XeroFlow view or MCP response:

1. Did "Northern GAC" resolve to its dealer account or the motor-group account?
2. Is a named action a website conversion, a Google-hosted local action, or an offline outcome?
3. Was a phone click captured on the website?
4. Was the click eligible under consent?
5. Did the browser or server attempt Google delivery?
6. Did Google accept and later report the conversion?
7. Did a telephone call connect, and did it meet the qualified-call threshold?
8. Is missing data caused by configuration, consent, credentials, sync lag, or genuinely zero activity?

Without these distinctions, account selection can be wrong, micro-conversions can be mistaken for business outcomes, and a green synchronization state can conceal an empty measurement layer.

## 4. Goals

- Resolve dealer, group, connection, login customer, and operating customer deterministically.
- Maintain a classified inventory of Google conversion actions and goals.
- Map website event types to exact provider actions without fan-out ambiguity.
- Ingest privacy-minimized evidence from the dealer platform using an authenticated, idempotent contract.
- Reconcile event capture, consent, destination configuration, delivery, provider acceptance, and provider reporting.
- Separate phone-link clicks, Google-hosted call interactions, connected calls, and qualified calls.
- Surface data freshness and empty-result semantics honestly.
- Make all read evidence available through Owner God Mode MCP without exposing downstream credentials.
- Keep provider mutations governed, previewable, approved, audited, and verified by read-back.

## 5. Non-goals

- Installing or repairing event listeners inside the dealer website.
- Editing the Northern GAC GTM container as part of XeroFlow runtime delivery.
- Provisioning or operating Telnyx numbers in XeroFlow.
- Treating every behavioral event as an advertising conversion.
- Automatically changing bidding strategies or campaign goals.
- Automatically making new conversion actions Primary.
- Uploading the same online event through both browser GTM and Google Data Manager without a proven deduplication contract.
- Exposing Google access tokens, refresh tokens, developer tokens, or unrestricted GAQL/mutate access through MCP.

## 6. System responsibilities

| System | Responsibility |
|---|---|
| Dealer platform | Capture website events, click identifiers, consent, browser/server attempts, and call outcomes |
| GTM and Google Ads | Execute browser conversion tags and own provider conversion actions |
| XeroFlow Measurement Signal Hub | Configure mappings, accept evidence, reconcile delivery, and retain audit history |
| XeroFlow Google Ads sync | Read actions, goals, campaign metrics, provider calls, and freshness evidence |
| Owner God Mode MCP | Expose tenant-bound reads and governed operations using XeroFlow's stored connections |

## 7. Functional requirements

### FR-1: Deterministic client and account resolution

XeroFlow must model the relationship between a canonical client, its dealership aliases, and multiple advertising accounts. Account roles must support at least `dealer`, `brand`, `group`, `reporting_only`, and `default_measurement`.

For the pilot:

- "Northern GAC" must resolve to Google customer `7583977544`.
- "Northern Motor Group" must resolve to `6692975433`.
- Group aggregation must be explicitly requested.
- Ambiguity must return a typed ambiguity result rather than a guessed account.

Every UI and MCP result must carry the resolved XeroFlow client ID, matched name or alias, connection ID, operating customer ID, login customer ID where applicable, account role, and whether the result is direct or aggregated.

### FR-2: Classified conversion-action registry

Extend the existing live Google action inventory into a persistent or reproducibly synchronized registry. Each action must expose:

- provider resource name and numeric ID;
- name, status, type, category, origin, owner customer, and counting type;
- Primary or Secondary state and goal biddability;
- delivery class: `website_tag`, `offline_click`, `google_hosted_call`, `google_hosted_local`, `external`, or `unknown`;
- management owner: `xeroflow`, `gtm`, `google`, `partner`, or `external`;
- last provider sync, last evidence, and current mapping state.

The UI and MCP must explicitly distinguish a website `phone_click` action from Google's provider-hosted `Clicks to call` action.

### FR-3: Complete typed website-event mapping

Retain the existing canonical event and typed-enquiry model. Do not replace shipped event names or collapse all website actions into one undifferentiated conversion.

The dealer-platform adapter must normalize:

| Dealer event | XeroFlow identity |
|---|---|
| `stock_enquiry` | `web_conversion` + enquiry type `stock` |
| `finance_enquiry` | `web_conversion` + enquiry type `finance` |
| `test_drive_enquiry` | `web_conversion` + enquiry type `test_drive` |
| `contact_us` | `web_conversion` + enquiry type `contact` |
| `model_variant_enquiry` | `web_conversion` + enquiry type `model_variant` |
| `service_booking` | `web_conversion` + new enquiry type `service_booking` |
| `phone_click` | existing canonical `phone_click` |
| `directions_click` | new canonical `directions_click` |

Unknown conversion types must pause for configuration and must never fan out to every action.

`add_to_wishlist` and generic `form_submit` may remain GA4 analytical micro-conversions. They must not become Primary Google Ads campaign goals by default.

### FR-4: Dealer-platform evidence contract

Add a signed, client-scoped API or webhook contract for privacy-minimized measurement evidence from the dealer platform. Direct cross-application database access is forbidden.

The contract must support:

- external site/client identity;
- stable `event_id` and optional browser transaction ID;
- canonical event and typed enquiry/conversion value;
- occurrence and receipt timestamps;
- consent decision per relevant purpose;
- captured, attempted, skipped, delivered, and failed destination evidence;
- provider action/resource IDs where known;
- click identifiers only when required by an approved server-delivery path;
- call ID, connection status, duration, and qualification where available.

The endpoint must be idempotent by tenant/client/source/event identity, reject mismatched client bindings, redact diagnostics, and avoid unnecessary raw PII.

Initial Google website-event integration is observability-only. Existing browser GTM remains the immediate Google Ads delivery path until browser/server deduplication is validated.

### FR-5: Conversion reconciliation

For every expected conversion type, XeroFlow must represent the following evidence chain independently:

```text
captured -> consent decision -> destination configured -> delivery attempted
         -> provider accepted -> provider reporting observed
```

Required states are `not_observed`, `captured`, `consent_denied`, `destination_not_configured`, `pending`, `delivered`, `provider_accepted`, `provider_reporting_pending`, `failed`, and `stale`.

Diagnostics must say what is known and what is inferred. Examples:

- "Phone clicks captured; no Google Ads website action is mapped."
- "Website action mapped; no browser-delivery evidence received."
- "Google call sync succeeded; Google returned zero call records."
- "Conversion totals unavailable while historical resync is pending."
- "Destination is not configured."
- "Dealer event resolved to the Northern Motor Group account instead of Northern GAC."

### FR-6: Layered telephone measurement

Report these as separate measures:

1. website `tel:` clicks;
2. Google-hosted call interactions;
3. connected calls;
4. qualified calls.

Call evidence must include source, account, started time, status, duration, threshold, qualification result, campaign/ad attribution where available, last sync, and sync outcome.

Extend the existing `call_view` pipeline rather than creating another Google call table. Accept qualified call outcomes from the dealer platform's future DNI/Telnyx integration through the governed outcome/evidence boundary.

An empty successful Google response must be displayed as "sync successful; no calls returned," not as verified call tracking.

### FR-7: Independent data freshness

Spend, campaign conversion metrics, conversion-action inventory, website evidence, and provider call evidence must each expose independent freshness.

When historical conversion synchronization is incomplete, XeroFlow must expose the requested range, covered range, missing range, last successful sync, current job state, and reason metrics are unavailable. It must not silently omit figures.

A resync operation must be bounded, idempotent, auditable, and expose progress and per-account failures.

### FR-8: Owner God Mode MCP coverage

Reuse the merged Google Ads MCP control plane. Add or extend bounded read tools for:

- deterministic client/account resolution;
- Google connection inventory;
- classified conversion actions and goals;
- event-to-action mappings;
- measurement health;
- conversion reconciliation;
- Google call summary;
- measurement and provider sync freshness.

Candidate tool names are:

- `google_ads_resolve_account`
- `google_ads_list_conversion_actions` (extend existing output)
- `measurement_get_health`
- `measurement_get_conversion_reconciliation`
- `google_ads_get_call_summary`
- `measurement_get_sync_status`

All tools must use XeroFlow's server-side connection resolution. Error classes must distinguish MCP authorization expiry, Google connection expiry, missing scope, inaccessible customer, manager-account mismatch, developer-token/provider failure, missing mapping, and valid empty data.

Write operations must retain the existing `mcp:write`, RBAC, feature-flag, plan, approval, idempotency, audit, validation, and provider read-back controls.

### FR-9: Measurement operations UI

Extend the existing client Measurement panel with:

- resolved Google operating and login accounts;
- classified conversion-action inventory;
- typed event-to-action mappings;
- browser/server/provider reconciliation;
- layered call status;
- independent freshness indicators;
- precise blockers and next actions.

Use Nuxt UI v4 and existing Measurement components. Do not build a parallel settings page. Before changing any form, load and follow the project's required frontend-design skill.

### FR-10: Public product documentation

When the feature is implemented, update:

- `app/pages/features/index.vue`;
- `app/pages/features/[slug].vue`;
- `app/components/MarketingNav.vue` when the feature belongs in a top-level category;
- any platform or pricing page that describes Measurement or Google Ads control.

Marketing copy must describe evidence and governance accurately. It must not claim that a captured click proves a connected call.

## 8. Security, privacy, and governance requirements

- Never expose access tokens, refresh tokens, developer tokens, client secrets, or unrestricted provider requests.
- Preserve tenant and client isolation at every API, worker, UI, and MCP boundary.
- Bind incoming dealer evidence to an allowlisted client and site identity.
- Preserve consent decisions and destination-specific gating.
- Use append-only evidence for configuration, delivery, tests, and externally significant actions.
- Require explicit authorization for provider mutations.
- New micro-conversion actions remain Secondary until production validation and a separate bidding decision.
- Do not auto-enable destructive Google Ads MCP operations.
- Do not infer provider delivery solely from first-party capture.
- Do not infer connected calls solely from phone-link clicks.

## 9. UX requirements

The main health view must answer, in order:

1. Which client and Google account are selected?
2. Is the website signal being captured?
3. Is consent permitting the intended destination?
4. Is the exact provider action configured and mapped?
5. Was delivery attempted and accepted?
6. Has provider reporting caught up?
7. For calls, was there a connected and qualified outcome?

Use plain-language status messages with the evidence timestamp and owner of the next action. Avoid one global green/red status that combines unrelated layers.

## 10. Delivery plan and tracked backlog

### Phase 0: Establish the correct baseline

- [ ] Start from current `main`, which contains PRs #486-#488 and the later Measurement/GTM/call integrations.
- [ ] Do not cherry-pick `feature/google-ads-mcp-control` or `release/google-ads-mcp-control-20260901` wholesale; their functionality was squash-merged as PR #486.
- [ ] Audit any desired uncommitted work against `main` file by file before salvaging it.
- [ ] Confirm migrations 313, 335, 338, and 339 are applied in the target environment.

### Phase 1: Resolve Northern GAC deterministically

- [ ] Define account-role and alias-resolution contracts.
- [ ] Add the minimum schema/configuration required for dealer-versus-group account selection.
- [ ] Seed or configure Northern GAC -> customer `7583977544` and Northern Motor Group -> `6692975433`.
- [ ] Return resolution evidence from UI, internal tools, and MCP.
- [ ] Add ambiguity, tenant-isolation, and manager-account tests.

### Phase 2: Complete event and action identity

- [ ] Extend the enquiry-type contract with `service_booking`.
- [ ] Add canonical `directions_click` through schema, migrations, runtime unions, persistence, health, and tests.
- [ ] Add dealer-event normalization for all eight expected conversion types.
- [ ] Extend conversion-action inventory classification and mapping validation.
- [ ] Verify unknown event types fail closed without fan-out.

### Phase 3: Ingest and reconcile dealer evidence

- [ ] Define a versioned signed evidence contract.
- [ ] Implement idempotent, client-bound ingestion without unnecessary PII.
- [ ] Persist capture, consent, delivery, provider-acceptance, and reporting evidence separately.
- [ ] Build the reconciliation read model and actionable blockers.
- [ ] Add replay, duplicate, invalid-signature, cross-client, and consent tests.

### Phase 4: Complete calls and freshness

- [ ] Add valid-empty versus failed/stale states to call sync health.
- [ ] Reconcile website phone clicks, Google-hosted interactions, connected calls, and qualified calls without merging the counts.
- [ ] Accept qualified dealer-platform call outcomes through the governed evidence boundary.
- [ ] Expose independent spend, conversion, action-inventory, website-event, and call freshness.
- [ ] Add bounded historical conversion resync status and progress.

### Phase 5: MCP and operator UI

- [ ] Extend existing Google Ads MCP inventory output with resolution and action classification.
- [ ] Add measurement health, reconciliation, call-summary, and sync-status MCP reads.
- [ ] Extend the client Measurement panel; do not create a second configuration surface.
- [ ] Add browser/UI tests for account selection, mapping, empty calls, stale data, and actionable blockers.
- [ ] Update public feature documentation.

### Phase 6: Pilot and rollout

- [ ] Validate Northern GAC using customer `7583977544` in test/read-only mode.
- [ ] Confirm the five existing enquiry actions remain correctly mapped.
- [ ] Confirm website phone and directions actions are Secondary before any live mapping.
- [ ] Verify captured and unmapped events produce a degraded, actionable state.
- [ ] Run a controlled phone-click test without launching the phone application.
- [ ] After the dealer platform activates call measurement, run one controlled answered-call test and verify duration/qualification evidence.
- [ ] Review before expanding to other Northern Motor Group dealerships.

## 11. Acceptance criteria

1. A query for Northern GAC resolves to Google customer `7583977544`, while a query for Northern Motor Group resolves to `6692975433`.
2. Ambiguous names never silently select an account.
3. UI and MCP results disclose the resolved customer, connection, account role, and resolution basis.
4. Conversion actions are classified by origin, delivery class, owner, status, and Primary/Secondary state.
5. Google-hosted `Clicks to call` is visibly distinct from website `phone_click`.
6. The five existing enquiry conversions retain their exact mappings.
7. `service_booking` and `directions_click` can be represented and mapped without misusing a generic event.
8. A captured but unmapped phone or directions click creates an actionable degraded state.
9. Consent-denied delivery is shown as intentionally skipped, not failed or delivered.
10. One incoming event creates one canonical evidence record and remains idempotent on replay.
11. Browser and server Google delivery cannot both occur without a tested shared transaction/deduplication contract.
12. Website clicks, Google-hosted call interactions, connected calls, and qualified calls are reported separately.
13. Zero `call_view` rows are reported as a successful empty result, not as end-to-end call tracking success.
14. Historical conversion resync coverage and blockers are visible.
15. MCP never returns credential material and emits precise credential/configuration/provider error classes.
16. All externally significant writes remain planned, approved, audited, idempotent, and verified by provider read-back.
17. Automated tests cover account ambiguity, tenant isolation, ingestion authentication, idempotency, consent, action classification, mapping, freshness, and call-layer separation.

## 12. Worktree and branch incorporation audit

Audit performed on 2026-09-02.

### Registered worktrees

| Worktree | Finding | Incorporation decision |
|---|---|---|
| `/private/tmp/dashboard-page-studio-builder-20260901` | Clean `main`; includes the latest Google Ads MCP, GTM, Measurement, GA4 micro-conversion, and call-reporting work | Use as implementation baseline |
| `.worktrees/meta-google-pacing-review` | Two uncommitted import-alias corrections in spend-history UI/tests; no Northern GAC conversion or call work | Unrelated to this PRD |
| `.worktrees/xeroflow-mcp-godmode-production` | Large stale God Mode worktree with uncommitted spend/creative/freshness changes; its Google client is still based on v23 and would regress current `main`'s v25 control plane if copied wholesale | Do not cherry-pick wholesale; only salvage a change after file-level comparison with `main` |
| Root `release/send-scan-foundation` checkout | Heavily dirty and behind `main`; contains untracked/modified Measurement, PMax, tracking, and Google call files. Several call files are identical to or older than the committed `main` versions | Preserve user work, but do not treat it as the source of truth for this PRD |
| Other registered worktrees | No relevant uncommitted Google, Measurement, conversion, tracking, or call paths found | No incorporation required |

### Relevant branches

| Branch/work | Finding | Incorporation decision |
|---|---|---|
| `feature/google-ads-mcp-control` | Full unsquashed Google Ads MCP build history | Already represented on `main` by PR #486; keep only as history |
| `release/google-ads-mcp-control-20260901` | Integrated release branch with conversion-action and goal controls | Already represented by squash merge PR #486; do not merge again |
| `fix/google-ads-mcp-ci-contracts` | MCP catalog contract corrections | Already merged as PR #487 |
| `fix/google-ads-mcp-ci-timeout` | Catalog parity test stabilization | Already merged as PR #488 |
| `feat/gtm-admin-mcp` | GTM administrative and Owner MCP operations | Merged to `main`; reuse |
| `fix/measurement-configuration-god-mode` | Governed Measurement configuration writes | Merged to `main`; reuse |
| `feature/brighton-nissan-measurement-completion` | Bounded estate-wide Google `call_view` sync and analytics | Merged to `main`; generalize, do not rebuild |
| Phase C micro-conversions | Canonical phone/add-to-wishlist/form-submit events and GA4 Measurement Protocol delivery | Merged and deployed; extend carefully |

The God Mode worktree's declared Google creative cap and failure semantics are already present on `main`, with additional improvements. Its stale v23 Google client must not overwrite the v25 implementation.

## 13. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Dealer alias resolves to group account | Cross-account reads or writes | Explicit account roles, typed ambiguity, and returned resolution evidence |
| Website and server both deliver to Google | Duplicate conversions | Browser-first online delivery and transaction-ID contract before dual source |
| Google-hosted calls confused with website clicks | Misleading optimization and reporting | Required delivery-class taxonomy and separate metrics |
| Empty sync mistaken for healthy measurement | False confidence | Model transport success separately from evidence presence |
| Stale worktree overwrites newer Google v25 code | Regression and lost controls | Implement from `main`; compare individual patches before salvage |
| New micro-conversion affects bidding prematurely | Campaign behavior changes | Secondary by default and separate explicit goal decision |
| Evidence contract leaks identifiers | Privacy/security exposure | Purpose-scoped signing, minimization, redaction, retention, and tenant binding |
| Platform enum changes miss binary Meta/Google assumptions | Configuration or delivery failure | Use shared platform maps and repository-wide tests, following the Phase C lesson |

## 14. Verification requirements

At each implementation checkpoint:

- re-read every modified and new file;
- run focused Vitest suites for Measurement, Google Ads MCP, call reporting, and resolver changes;
- run `pnpm run typecheck` and compare known baseline diagnostics;
- run the repository's inventory/gate checks affected by new MCP tools or routes;
- run `pnpm run build` before deployment because this is production-sensitive;
- run migrations automatically against the configured database and verify resulting schema;
- use an authenticated browser for Measurement UI and live provider verification;
- inspect the exact target customer and proposed payload before any Google Ads mutation;
- update the relevant public feature pages before declaring the feature complete.

## 15. Definition of done

From XeroFlow or Owner God Mode MCP, an authorized operator can answer all of the following without manually reconstructing evidence across systems:

- Which Google Ads account is Northern GAC using?
- Which conversion actions and campaign goals exist?
- Which website events map to which exact actions?
- Were phone and directions clicks captured and consent-eligible?
- Were they delivered to and later observed by Google?
- Did telephone calls connect and qualify?
- Is missing data caused by configuration, consent, credentials, provider rejection, synchronization lag, or genuinely zero activity?

Completion requires both trustworthy evidence and correct language. A captured phone click is not a connected call, and a successful empty provider sync is not proof that call tracking is operational.
