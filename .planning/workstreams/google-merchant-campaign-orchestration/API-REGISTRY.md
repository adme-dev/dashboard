# Google API Registry and Enablement Gate

**Status:** Partially verified; control-plane and live authorization gates remain open
**Candidate Cloud project:** `gen-lang-client-0818792107`
**Rule:** Do not record client secrets, tokens, developer tokens or service-account keys
in this file.

## Current sanitized observation

- The repository's local production environment contains a Google OAuth client ID in
  the expected `apps.googleusercontent.com` format.
- Its embedded numeric project prefix is `14351276985`.
- The numeric project number for `gen-lang-client-0818792107` has not yet been obtained,
  so the project/client mapping remains unverified.
- No OAuth client secret or token was printed or recorded during this check.
- Production aggregate evidence shows one active encrypted Google credential profile
  linked to 87 manager-child connections. Its grants include `adwords`, `content` and
  `datamanager`.
- Another 21 active Google connections use the legacy/unprofiled credential path.
- Current connection/profile metadata stores no Merchant Center identifiers; the
  legacy inventory audit discovers them from Google Ads product links at runtime.
- A secret-name-only Cloudflare Pages check confirms production has encrypted entries
  for the Google OAuth client, developer token, redirect URI and
  `REPO_TOKEN_ENCRYPTION_KEY`. Presence does not prove the values or project mapping.

## Required services

| API | Service name | Need | Current evidence | Action |
|---|---|---|---|---|
| Merchant API | `merchantapi.googleapis.com` | Required for Merchant account, data-source, product and issue operations | `content` OAuth grant is present on the shared profile; Merchant API enablement and developer registration are not proven | Verify project ownership, enable, then register approved agency Merchant topology |
| Google Ads API | `googleads.googleapis.com` | Required for campaign/PMax reads and writes | Application reached Ads REST v23, but the bounded legacy direct sample failed with `USER_PERMISSION_DENIED`; shared MCC profile could not be decrypted locally | Prove MCC-child and direct reads, verify same OAuth project, and record token access level/owner securely |

## Conditional services

| API | Service name | When needed | Decision |
|---|---|---|---|
| Data Manager API | `datamanager.googleapis.com` | First-party conversion or audience ingestion included in campaign readiness/monitoring | Existing XeroFlow capability and `datamanager` grant confirmed on the shared profile; verify current project and live access, and do not duplicate |
| YouTube Data API v3 | `youtube.googleapis.com` | XeroFlow uploads generated PMax video to an authorized channel | Optional; disabled until product/media owner selects upload workflow and accepts quota/audit obligations |
| Cloud KMS API | `cloudkms.googleapis.com` | Only if Data Manager confidential matching/encryption architecture explicitly adopts Google Cloud KMS | Not required for baseline rollout |

## Temporary compatibility

| API | Status | Exit condition |
|---|---|---|
| Content API for Shopping | Existing legacy audit dependency | Keep only until Merchant API data-source/product audit parity and live validation are signed off; build no new features on it |

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

- [ ] Candidate project ID and numeric project number recorded.
- [ ] Production `GOOGLE_CLIENT_ID` project-number prefix `14351276985` matched to the
      candidate project's numeric project number.
- [ ] Preview/staging OAuth client mapping recorded.
- [ ] Authorized JavaScript origins and redirect URIs match deployed XeroFlow domains.
- [ ] Google Auth Platform branding, verified domains and privacy/support links reviewed.
- [x] `adwords`, `content` and `datamanager` scopes present on the active shared
      credential profile and its 87 linked connections.
- [ ] Sensitive-scope verification status and test-user restrictions understood.
- [ ] OAuth client secrets remain only in approved secret stores.
- [ ] Google Ads developer token owner/access level recorded outside the repository.
- [ ] Merchant developer email is monitored and agency-controlled.

## Merchant registration gate

- [ ] Identify the agency's controlling/advanced Merchant account.
- [ ] Map client Merchant subaccounts and standalone accounts.
- [ ] Confirm the controlling Merchant account has a verified agency-owned website.
- [ ] Confirm registration actor has required admin access.
- [ ] Confirm the project is not already registered to another Merchant account.
- [ ] Confirm the developer email can accept/retain the API Developer role.
- [ ] Obtain owner approval for the one-project/one-registration topology.
- [ ] Run registration once and retain only sanitized evidence.
- [ ] Wait for propagation and verify a bounded read.

## Google Ads access gate

- [ ] Confirm the Ads manager account that owns the developer token.
- [ ] Confirm token status and access level are sufficient for pilot production accounts.
- [ ] Confirm direct-account OAuth behavior.
- [ ] Confirm manager-child `login-customer-id` behavior.
- [ ] Confirm Ads-Merchant product links for pilot accounts.
- [ ] Confirm a read-only GAQL request succeeds before any launch work.

Current observation: a bounded v23 call against one legacy direct connection returned
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

## Official references

- <https://developers.google.com/merchant/api/overview>
- <https://developers.google.com/merchant/api/guides/quickstart/registration>
- <https://developers.google.com/google-ads/api/docs/oauth/cloud-project>
- <https://developers.google.com/google-ads/api/docs/api-policy/developer-token>
- <https://developers.google.com/data-manager/api/devguides/quickstart/set-up-access>
- <https://developers.google.com/youtube/v3/getting-started>
