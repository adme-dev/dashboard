# Brighton Nissan Measurement Completion Design

**Status:** approved in chat on 2026-08-18; pending written-spec review
**Owners:** ADME / XeroFlow
**Production website:** `https://brightonnissan.com.au`
**Netlify site ID:** `ce707751-c381-438d-8eaa-e735a13a42f8`
**Google Ads customer:** Brighton Nissan, `597-704-4329`

## Objective

Complete Brighton Nissan's website-to-CRM measurement and Google Ads call
reporting without conflating browser intent with provider-confirmed outcomes.
The finished system must:

1. correlate every supported successful website enquiry with its XeroFlow
   browser journey;
2. create CRM leads and confirmed conversion events only after the provider
   accepts the enquiry;
3. report Google Ads calls with Google's answered/missed status and duration;
4. preserve existing dealer-form delivery if measurement is unavailable;
5. remove exposed or incorrectly scoped production credentials; and
6. ship through isolated branches and the verified Netlify/Cloudflare targets.

## Verified Current State

### Brighton Nissan application

- Repository: `adme-dev/brighton-nissan`.
- Production branch: `master`; build command: `npm run build`; publish
  directory: `dist`.
- Netlify Functions directory: `src/functions`, region `ap-southeast-2`.
- Current published commit at discovery: `31ab4ec`.
- The repository checkout was clean and matched `origin/master`.
- `public/index.html` monkey-patches `window.dataLayer.push` and mirrors only
  successful `FormSub Stock*` events.
- `src/functions/adme-lead-mirror.js` is deployed, but no ADME/XeroFlow mirror
  environment variables are configured. It therefore uses its hard-coded
  legacy endpoint.
- Provider-confirmed success handlers are distributed across stock, contact,
  finance, service, fleet, test-drive, offer, registration, car and variant
  enquiry components. Only four stock components and Contact Us currently push
  success events to the data layer.
- The XeroFlow tag is active on the production site through GTM. Its live
  `window.xf.captureLeadContext()` API is newer than the dirty dashboard
  checkout that was originally inspected.

### XeroFlow dashboard

- The normal checkout is heavily dirty and must not be used as an
  implementation base.
- Clean `origin/main` includes commit `cb8a1333`, the authoritative
  provider-neutral browser/CRM reconciliation implementation.
- Baseline tests on clean `origin/main`: 52 passing tests across
  `test/public/track-tag.test.ts` and
  `test/server/utils/leads/leadCaptureContract.test.ts`.
- Google `call_view` reporting code, API routes, migration and tests exist only
  as uncommitted files in the dirty checkout. Production tables exist, but the
  discovery audit found zero stored calls and zero sync-state connections.

### Security findings

- `brighton-nissan/package.json` contains an embedded GitHub personal access
  token in the private `driveagent-ui` dependency URL. The credential must be
  revoked; removing it only from the latest commit is insufficient.
- Server payment credentials use client-style `VUE_APP_*` names and are scoped
  to builds, functions, post-processing and runtime in Netlify. They must be
  renamed and restricted to Functions.
- The Netlify site also contains Supabase service credentials with broad
  scopes. Unused credentials must be removed; required server credentials must
  be Functions-only.
- Publishable browser keys may retain `VUE_APP_*`; secrets may not.

## Decisions

### 1. Provider-confirmed success is the conversion boundary

A form click, native submit event, data-layer event, iframe focus or browser
request is not proof that the dealer/provider accepted a lead. XeroFlow records
the browser candidate before delivery, but the authenticated Netlify-to-XeroFlow
webhook creates the CRM lead and confirmed `generate_lead` event only after the
existing provider request succeeds.

### 2. One browser event ID survives retries

The website creates one event ID after client validation and retains it for
retries of that logical enquiry. `window.xf.captureLeadContext()` returns only
the ID and safe `zeroflow_*` attribution fields. It never receives or returns
customer PII.

The same browser event ID is used as the XeroFlow webhook `lead_id`, giving the
server an idempotency key and a browser/CRM join key. A provider-supplied stable
lead ID may be preserved as an additional field, but it does not replace the
browser join ID.

### 3. PII travels only through the Netlify Function

Names, email addresses, phone numbers, messages and vehicle details stay in the
existing provider request and the server-side Netlify mirror. The browser
tracking endpoint and diagnostic data-layer event receive no PII.

### 4. The website owns the form bridge; XeroFlow owns call outcomes

The Brighton Nissan repository owns form validation, provider-success timing,
vehicle context and the Netlify adapter. XeroFlow owns webhook authentication,
CRM acceptance, deduplication, attribution reconciliation, confirmed
conversions, Google `call_view` ingestion and reporting.

### 5. Do not copy the dirty tracker

Dashboard implementation begins from current `origin/main`. The dirty
`public/track.js` is not copied or deployed. Any tracker change must be made
against the authoritative file and prove that the deployed file does not
regress `captureLeadContext()`.

## Architecture

```text
Validated website enquiry
        |
        +-- create/reuse browser event ID
        +-- window.xf.captureLeadContext({ eventId, form metadata })
        |       |
        |       +-- non-PII form_submit correlation candidate
        |
        +-- existing provider POST (unchanged customer delivery)
                |
                +-- provider success
                        |
                        +-- shared website success adapter
                                |
                                +-- safe GTM diagnostic event (no PII)
                                +-- Netlify adme-lead-mirror
                                        |
                                        +-- authenticated generic XeroFlow webhook
                                                +-- idempotent CRM lead
                                                +-- browser attribution join
                                                +-- confirmed generate_lead
                                                +-- configured destinations

Google call ads/assets
        |
        +-- Google Ads call_view
                |
                +-- scheduled XeroFlow server sync
                        +-- answered/missed status
                        +-- actual Google duration when supplied
                        +-- campaign/client attribution
                        +-- agency and portal reporting
```

## Brighton Nissan Application Changes

### Shared browser integration

Add a small provider-neutral module under `src/utils/` with these boundaries:

- `createLeadAttempt(form)` creates/reuses a valid event ID and calls
  `window.xf.captureLeadContext()` after validation and before provider delivery.
- `confirmLead(attempt, lead)` posts the accepted lead plus `context.fields` to
  `/.netlify/functions/adme-lead-mirror`.
- Measurement failures are caught and reported without blocking the provider
  request or changing the visible success state.
- A duplicate success callback reuses the same event ID.
- A new logical enquiry receives a new event ID after the form resets.

The adapter pushes a non-PII diagnostic event such as:

```js
{
  event: 'xf_provider_lead_confirmed',
  xf_browser_event_id: '<event-id>',
  xf_form_type: 'stock_enquiry'
}
```

Existing Google conversion triggers remain operational during rollout. No
name, email, phone or free-text message is added to this event.

### Form coverage

Instrument every active provider-confirmed success path in current `src`:

- stock enquiry variants (`VehicleEnquiry`, gallery, footer and single form);
- Contact Us;
- finance;
- service;
- fleet;
- test drive;
- offers/showroom and variant enquiries;
- registration/contact variants; and
- car-enquiry flows.

Legacy `src2` and `src3` are excluded unless deployment evidence proves the
production build imports them.

### Netlify Function contract

Refactor `src/functions/adme-lead-mirror.js` to send schema version 1 to:

`POST /api/leads/webhook/generic/<url_token>`

The request body includes the server-side `secret_key`, stable `lead_id`, form
identity, normalized customer/vehicle objects, safe `zeroflow_*` fields,
consent decision, submitted timestamp and provider name. Both the URL token and
secret key are Netlify Functions-only environment variables.

The Function must:

- accept only `POST` and bounded JSON;
- validate required identity and correlation fields;
- restrict CORS to approved Brighton Nissan origins rather than `*`;
- use a bounded timeout and redact upstream errors;
- return success for an already accepted idempotency key;
- never log customer fields or credentials; and
- preserve the existing provider delivery if XeroFlow is unavailable.

The `public/index.html` data-layer monkey patch is removed after all active form
paths call the shared module directly. This eliminates double delivery and
order-dependent interception.

### Phone clicks

The live XeroFlow tracker already observes `tel:` clicks. The site work verifies
dynamic phone links, but it does not invent answered status or call duration.

## XeroFlow Dashboard Changes

### Provider bridge and webhook

- Retain the authoritative `captureLeadContext()` implementation from
  `origin/main`.
- Add Brighton-specific contract tests/fixtures only where the generic tests do
  not cover the website payload.
- Create or rotate the Brighton Auto Group generic webhook endpoint and store
  its URL token and secret only in Netlify.
- Confirm the client is in the intended CRM capture mode before production
  traffic is enabled.
- Verify accepted leads create exactly one browser-linked `generate_lead`.

### Google call reporting

Port the isolated call-reporting files from the dirty checkout into the clean
feature worktree and review them against current `origin/main`:

- `server/utils/googleAdsCallReporting.ts`;
- `server/api/cron/google-ads-call-reporting.post.ts`;
- `server/api/agency/analytics/google-calls.get.ts`;
- migration `335_google_ads_call_reporting.sql`; and
- focused unit/API tests.

Complete the feature by:

- mapping the Brighton Nissan Google Ads connection/customer to the correct
  XeroFlow client;
- making the migration additive and idempotent, then applying it automatically;
- wiring the sync into the existing Cloudflare cron worker;
- adding last-attempt, last-success, row-count and redacted-error health data;
- exposing client-scoped answered, missed and duration summaries in agency and
  portal analytics;
- running a bounded historical backfill; and
- verifying real Google rows rather than generating synthetic calls.

Duration remains `null` when Google does not supply it.

### Front-facing product documentation

Because call reporting and provider-confirmed lead reconciliation are platform
features, update the relevant XeroFlow marketing feature entries and navigation
copy required by `AGENTS.md`. Do not expose client names, account IDs or
credentials on public pages.

## Credential Remediation

Before the new production deploy:

1. revoke the GitHub PAT embedded in repository history;
2. remove credentials from the dependency URL and use a supported scoped
   private-package/build authentication mechanism;
3. rotate Stripe and Square server secrets;
4. rename server variables to non-`VUE_APP_*` names and update Functions;
5. restrict server credentials to the Netlify Functions scope and required
   deploy contexts;
6. remove unused Supabase service credentials and restrict retained keys;
7. retain only publishable browser keys in Vue's client environment; and
8. run source, built-asset and Git-history secret scans.

Historical Git rewriting is not required once every exposed credential is
revoked. It requires a separate explicit approval because it rewrites shared
history.

## Testing

### Brighton Nissan

- Unit tests for event-ID reuse, retry behavior, consent suppression, no-PII
  diagnostics, payload normalization and fail-open provider delivery.
- Function tests for authentication payloads, CORS, validation, timeout,
  redaction and idempotency.
- Static inventory test proving every active form-success component calls the
  shared adapter.
- Production build under the Netlify Node version.
- Preview-deploy browser tests for stock, contact and at least one non-stock
  form without submitting customer data.

### XeroFlow

- Existing tracker and webhook contract suites.
- Google call query, mapping, retry, upsert, authorization and date-window
  tests.
- Migration verification against the configured database.
- Targeted portal/agency component tests for call summaries and unavailable
  duration.
- Production build and Cloudflare deployment guard.

### Controlled production verification

After preview checks and explicit operator confirmation of the test identity:

1. submit one clearly marked Brighton Nissan test enquiry;
2. confirm normal dealer/provider receipt;
3. confirm one XeroFlow CRM lead with `browserEventId`;
4. confirm one matching browser candidate and one confirmed `generate_lead`;
5. confirm configured conversion delivery and no duplicate;
6. mark/remove the test lead through the normal CRM process;
7. run Google call backfill and verify real rows, if the account has eligible
   call activity; and
8. monitor reconciliation and sync health for 24 hours.

No fake phone call is generated.

## Deployment Sequence

1. Create isolated worktrees from current `origin/main` (dashboard) and
   `origin/master` (Brighton Nissan).
2. Land XeroFlow contract/call-reporting code and tests without enabling new
   traffic.
3. Apply the additive database migration.
4. Create/rotate the generic webhook credentials and configure Netlify
   Functions-only variables on Site ID
   `ce707751-c381-438d-8eaa-e735a13a42f8`.
5. Complete credential rotation and secret scanning.
6. Deploy the Brighton branch to a Netlify preview and run browser tests.
7. Merge/publish Brighton `master`; verify the immutable deploy commit and live
   Function version.
8. Deploy XeroFlow through `pnpm deploy:production` after
   `pnpm deploy:check` passes.
9. Enable the call-reporting cron and run the bounded backfill.
10. Complete the controlled enquiry and 24-hour monitoring window.

## Rollback

- Brighton: revert the shared adapter integration and Netlify Function change.
  Existing provider delivery continues independently.
- XeroFlow webhook: disable or rotate the Brighton endpoint; existing browser
  telemetry remains unaffected.
- Call reporting: disable the cron. Additive tables may remain safely in place.
- GTM: keep live version 23 available for rollback; do not remove existing
  conversion tags during the application rollout.
- Credentials: never restore revoked credentials. Roll back code to the new
  secret names only.

## Acceptance Criteria

- Every active Brighton Nissan lead form has a provider-confirmed bridge.
- Provider failure never creates a confirmed lead conversion.
- Each accepted enquiry creates at most one CRM lead and one confirmed
  conversion for its browser event ID.
- Customer PII is absent from XeroFlow browser telemetry and diagnostic
  data-layer events.
- The production Netlify adapter uses a scoped authenticated XeroFlow webhook,
  not the legacy hard-coded destination.
- Google call reporting stores and displays real eligible calls with status and
  duration when supplied.
- Google sync health shows a real last attempt/success instead of zero inactive
  connections.
- The embedded GitHub PAT and exposed payment credentials are revoked and no
  longer present in current source or built assets.
- Netlify and Cloudflare production targets are verified before every deploy.
- Monday item `12828703626` records launch evidence, the controlled test result
  and the final monitoring outcome.

## Explicitly Excluded

- Reworking legacy `src2` or `src3` without production import evidence.
- Inferring call duration from browser activity.
- Treating CTA clicks, iframe focus or native submits as confirmed conversions.
- Rewriting shared Git history without separate approval.
- Expanding this rollout to the remaining 11 estate-wide pixel installations;
  those require their own client/site inventory and release sequence.
