# Google API Registry and Enablement Gate

**Status:** Partially verified; control-plane and live authorization gates remain open
**Confirmed OAuth project; Merchant reuse provisional:** `gen-lang-client-0818792107`
**Rule:** Do not record client secrets, tokens, developer tokens or service-account keys
in this file.

## Current sanitized observation

- The repository's local production environment contains a Google OAuth client ID in
  the expected `apps.googleusercontent.com` format.
- Its embedded numeric project prefix is `14351276985`.
- Read-only Console evidence confirms `gen-lang-client-0818792107` has project number
  `14351276985`; the production OAuth project mapping is confirmed.
- The only visible web OAuth client is the Agency Dashboard client. Its authorized
  origins/redirects cover XeroFlow production, Cloudflare Pages and local development.
- The OAuth app is Internal and currently does not require verification. App home,
  privacy and terms fields appear unset; this must be remediated before any external-
  audience change.
- The project is shared with unrelated Gemini/API-key workloads. At least one API key
  row is flagged unrestricted; no key value was opened. Reuse remains provisional
  pending security-owner disposition.
- No OAuth client secret or token was printed or recorded during this check.
- Production aggregate evidence shows one active encrypted Google credential profile
  linked to 87 manager-child connections. Its grants include `adwords`, `content` and
  `datamanager`.
- Another 21 active Google connections use the legacy/unprofiled credential path.
- Current connection/profile metadata stores no Merchant Center identifiers; the
  legacy inventory audit discovers them from Google Ads product links at runtime.
- A secret-name-only Cloudflare Pages check confirms production has encrypted entries
  for the Google OAuth client, developer token, redirect URI and
  `REPO_TOKEN_ENCRYPTION_KEY`. Presence does not prove the values or current validity.

## Required services

| API | Service name | Need | Current evidence | Action |
|---|---|---|---|---|
| Merchant API | `merchantapi.googleapis.com` | Required for Merchant account, data-source, product and issue operations | Console shows **not enabled**; `content` OAuth grant is already present; developer registration state remains unknown | Keep disabled until CTL-005 approves the topology, then enable and register once |
| Google Ads API | `googleads.googleapis.com` | Required for campaign/PMax reads and writes | Console shows enabled with recent traffic; Ads API Center shows agency-owned developer token with Basic Access. Bounded legacy direct sample still failed with `USER_PERMISSION_DENIED` | Prove MCC-child and current direct reads; retain restricted owner/account record outside Git |

## Conditional services

| API | Service name | When needed | Decision |
|---|---|---|---|
| Data Manager API | `datamanager.googleapis.com` | First-party conversion or audience ingestion included in campaign readiness/monitoring | Enabled in the confirmed OAuth project; existing XeroFlow capability and `datamanager` grant confirmed; verify live access and do not duplicate |
| YouTube Data API v3 | `youtube.googleapis.com` | XeroFlow uploads generated PMax video to an authorized channel | Optional; disabled until product/media owner selects upload workflow and accepts quota/audit obligations |
| Cloud KMS API | `cloudkms.googleapis.com` | Only if Data Manager confidential matching/encryption architecture explicitly adopts Google Cloud KMS | Not required for baseline rollout |

## Temporary compatibility

| API | Status | Exit condition |
|---|---|---|
| Content API for Shopping | Existing legacy audit dependency; Console service is not enabled in the confirmed project | Determine which historic project/path serves the legacy audit; keep compatibility only until Merchant API parity and live validation are signed off |

## Explicitly unnecessary for this rollout

The following are not required merely to implement Merchant readiness, AI-assisted
jobs or Google Ads campaign creation:

- Vertex AI / Gemini API
- Cloud Run
- Cloud Functions
- Cloud Scheduler
- Pub/Sub
- BigQuery
- Google Drive API
- Google Sheets API
- Search Console API
- Business Profile APIs
- Manufacturer Center API

XeroFlow remains hosted and orchestrated on Cloudflare. Separate existing platform
features may use other Google APIs, but they are not dependencies of this workstream.

## OAuth and non-API prerequisites

- [x] Candidate project ID and numeric project number recorded.
- [x] Production `GOOGLE_CLIENT_ID` project-number prefix `14351276985` matched to the
      candidate project's numeric project number.
- [ ] Preview/staging OAuth client mapping recorded.
- [x] Authorized JavaScript origins and redirect URIs match deployed XeroFlow domains.
- [x] Google Auth Platform branding and audience reviewed; Internal audience needs no
      current verification, but public app-policy links are incomplete.
- [x] `adwords`, `content` and `datamanager` scopes present on the active shared
      credential profile and its 87 linked connections.
- [x] Current Internal audience/verification status understood; external-audience
      conversion is a separate future gate.
- [ ] OAuth client secrets remain only in approved secret stores.
- [x] Google Ads developer token agency ownership and Basic Access verified; manager ID
      and token value remain outside the repository.
- [ ] Merchant developer email is monitored and agency-controlled.

## Merchant registration gate

- [x] Identify the agency's controlling/advanced Merchant account candidate.
- [x] Confirm it exposes an advanced-account hierarchy with 50 subaccounts.
- [ ] Map client Merchant subaccounts and standalone accounts to tenants without
      committing identifiers.
- [ ] Confirm the controlling Merchant account has a verified agency-owned website.
      Current evidence fails this gate: the claimed website is client-owned.
- [ ] Confirm registration actor has required admin access.
- [ ] Confirm the project is not already registered to another Merchant account.
- [ ] Confirm the developer email can accept/retain the API Developer role.
- [ ] Obtain owner approval for the one-project/one-registration topology.
- [ ] Run registration once and retain only sanitized evidence.
- [ ] Wait for propagation and verify a bounded read.

## Google Ads access gate

- [ ] Confirm the Ads manager account that owns the developer token.
- [x] Confirm token status/access level: Basic Access. Pilot-account authorization still
      requires bounded reads.
- [ ] Confirm direct-account OAuth behavior.
- [ ] Confirm manager-child `login-customer-id` behavior.
- [ ] Confirm Ads-Merchant product links for pilot accounts.
- [ ] Confirm a read-only GAQL request succeeds before any launch work.

Current observation: Ads API Center confirms an agency-owned Basic Access token. A
bounded v23 call against one legacy direct connection returned
`USER_PERMISSION_DENIED`. Production has the encryption-key secret, but local execution
cannot decrypt the shared profile because the key is absent locally. Keep all success
boxes open until a current direct grant and an MCC-child read both pass.

## Data Manager gate

- [ ] Identify whether current Data Manager calls use the candidate project.
- [ ] Confirm API enablement and operating-account/destination access.
- [ ] Preserve `not_proven` for paths tested only with `validateOnly`.
- [ ] Do not make Data Manager a Merchant-readiness blocker unless the campaign template
      explicitly requires conversion-delivery proof.

## YouTube decision gate

Do not enable YouTube Data API merely because PMax can use video. Enable only when:

- [ ] XeroFlow must upload generated video rather than use an existing video ID.
- [ ] The authorized destination channel and ownership model are approved.
- [ ] OAuth scope, upload quota, privacy state and unverified-project restrictions are
      accepted.
- [ ] Upload, processing-status polling and failure recovery are separately specified.

## Verification evidence template

Record sanitized results in the workstream state or an evidence file:

```text
Checked at:
Operator:
Project ID / number:
OAuth client suffix only:
Enabled required services: PASS / FAIL
Merchant registration target:
Merchant registration state: NOT STARTED / PENDING / ACTIVE / FAILED
Ads developer token access: TEST / EXPLORER / BASIC / STANDARD / UNKNOWN
Direct read: PASS / FAIL / NOT RUN
Manager-child read: PASS / FAIL / NOT RUN
Merchant bounded read: PASS / FAIL / NOT RUN
Data Manager validation: PROVEN / VALIDATED ONLY / NOT RUN
Secrets exposed: NO
Follow-up:
```

## Cloudflare AI Gateway gate for campaign-job inference

The repository already configures the shared Cloudflare AI Gateway `default` endpoint
for provider SDK calls and includes a Workers AI binding. This is evidence of a starting
integration, not completion: the shared helper retries directly against Groq when the
Gateway fails and may reuse broad Cloudflare tokens. Campaign jobs must instead use the
pre-authenticated binding, which avoids storing an account-scoped AI Gateway Run token
in Pages.

- [ ] Create separate preview and production gateways with versioned extraction,
      standard and complex campaign-job routes; never use shared `default`.
- [ ] Use `env.AI.gateway(gatewayId).run(...)` exclusively; missing binding fails closed.
- [ ] Store `CAMPAIGN_AI_DEPLOY_ENV`, gateway ID, route release, workflow flag and HMAC
      key as same-named encrypted values scoped separately to Pages Preview and
      Production. Never put them in common `[vars]` or infer `CF_PAGES_BRANCH` at
      runtime; verify binding names after each deployment without reading values.
- [ ] Store provider credentials with approved BYOK/Cloudflare Secrets Store handling;
      no provider key remains necessary in the campaign-job runtime and no
      credential may enter request metadata or logs.
- [ ] Remove/prohibit direct-provider fallback for this workflow.
- [ ] Enforce metadata-only logs with `cf-aig-collect-log-payload: false` and skip cache
      for client-specific requests.
- [ ] Enforce at most five flat, non-PII metadata values.
- [ ] Generate tenant metadata with a dedicated, environment-specific HMAC secret; do
      not reuse auth/OAuth/token-encryption keys.
- [ ] Configure per-tenant/task rate and budget limits plus bounded retries/timeouts.
- [ ] Enforce app-side 16K input, 2K output, two-call and $0.01 initial proposal caps;
      Gateway spend limits are eventually consistent and cannot be the only control.
- [ ] Approve provider retention/DPA terms; do not treat payload logging off as upstream
      ZDR. Evaluate DLP in preview flag-only mode before blocking.
- [ ] Complete AIG-302 evaluation before locking model and route versions.
- [ ] Confirm dashboard cost/tokens/latency reconcile with the XeroFlow invocation
      ledger, refresh the ledger's stale GPT-OSS 20B price entry, and prove that
      budget/rate exhaustion fails safely.
- [ ] Store reviewed route release and actual response provider/model; disable raw-model
      assignment overrides for this feature.
- [ ] Confirm the implementation and promotion path against Graphify Wiki/graph and
      current direct source; record graph version/staleness warnings.

## Official references

- <https://developers.google.com/merchant/api/overview>
- <https://developers.google.com/merchant/api/guides/quickstart/registration>
- <https://developers.google.com/google-ads/api/docs/oauth/cloud-project>
- <https://developers.google.com/google-ads/api/docs/api-policy/developer-token>
- <https://developers.google.com/data-manager/api/devguides/quickstart/set-up-access>
- <https://developers.google.com/youtube/v3/getting-started>
- <https://developers.cloudflare.com/ai-gateway/features/dynamic-routing/>
- <https://developers.cloudflare.com/ai-gateway/configuration/authentication/>
- <https://developers.cloudflare.com/ai-gateway/observability/logging/>
- <https://developers.cloudflare.com/workers-ai/platform/pricing/>
- <https://groq.com/pricing>
