# Google Ads AI Max API v23 Validation

**Date:** 2026-08-06  
**Status:** Blocked on usable live-account authorization  
**Scope:** Read-only Google Ads API observations for Release 1 readiness

## Purpose

Validate the Google Ads API v23 fields used by the AI Max readiness scanner against
real direct and manager-linked Search campaigns before production release. This is an
operational gate, not a provider mutation test.

## Queries under validation

The scanner uses `googleAds:searchStream` with these read-only fields:

```sql
SELECT
  campaign.id,
  campaign.name,
  campaign.status,
  campaign.advertising_channel_type,
  campaign.keyword_match_type,
  campaign.ai_max_setting.enable_ai_max,
  campaign.ai_max_setting.bundling_required,
  campaign.asset_automation_settings
FROM campaign
WHERE campaign.advertising_channel_type = 'SEARCH'
  AND campaign.status IN ('ENABLED', 'PAUSED')
```

```sql
SELECT
  ad_group.id,
  ad_group.campaign,
  ad_group.status,
  ad_group.ai_max_ad_group_setting.disable_search_term_matching
FROM ad_group
WHERE campaign.advertising_channel_type = 'SEARCH'
  AND campaign.status IN ('ENABLED', 'PAUSED')
  AND ad_group.status IN ('ENABLED', 'PAUSED')
```

The expected REST response keys are the camel-case equivalents used by the existing
normalizer: `keywordMatchType`, `aiMaxSetting`, `assetAutomationSettings`, and
`aiMaxAdGroupSetting.disableSearchTermMatching`.

## Attempts and observations

### Google Ads connector

The configured Google Ads MCP connector could not list accessible customers or query
campaign/ad-group metadata because Application Default Credentials were unavailable in
the local environment. It provided no live field observations.

### Application credentials

A bounded operational audit was added at `scripts/audit-google-ai-max-live.ts`. It:

- uses only `searchStream` reads;
- samples two accounts by default and clamps the limit to five;
- returns aggregate field/enum coverage only;
- redacts customer resource paths, long numeric identifiers, bearer values and known
  credentials from returned errors;
- prefers a connection-specific manager customer ID and retries a 403 once without
  the manager header, matching the direct/MCC fallback used by spend synchronization.

The configured database contained 108 active Google connections: 21 legacy-token
connections and 87 encrypted credential-profile connections. The local environment
does not contain `REPO_TOKEN_ENCRYPTION_KEY`, so the encrypted profiles could not be
decrypted for this audit. The audit therefore selected only recently synced legacy
connections.

The final bounded run sampled five legacy connections. All five failed with Google Ads
HTTP 403 responses after manager-linked/direct fallback where applicable:

| Result | Aggregate observation |
|---|---:|
| Sampled accounts | 5 |
| Successful accounts | 0 |
| Failed accounts | 5 |
| Final direct auth mode | 5 |
| Final manager-linked auth mode | 0 |
| Provider mutations | 0 |

Provider diagnostic codes included `USER_PERMISSION_DENIED` and
`CUSTOMER_NOT_ENABLED`. Customer IDs were redacted in the final audit output. During
the first diagnostic attempt, the existing Google client logger printed customer IDs;
no access tokens, refresh tokens, developer token, or client secret were printed. A
test-backed logger redaction fix was applied before the final run.

## Validation result

No live campaign or ad-group rows were returned. Consequently, this session did **not**
validate:

- real enum/null/omission behavior for the four AI Max field groups;
- ACA-only, broad-only, both, neither, enabled, or unknown live cases;
- direct versus MCC-child row equivalence;
- deep links or readiness classifications against the Google Ads UI.

The implementation remains fail-closed for missing or unrecognized evidence and is
covered by sanitized deterministic fixtures, but those fixtures are not a substitute
for the required provider/UI comparison.

## Required follow-up before release

1. Run `pnpm audit:google-ai-max` in an environment with
   `REPO_TOKEN_ENCRYPTION_KEY` and current Google OAuth grants, or reconnect one direct
   account and one MCC child in preview.
2. Capture aggregate results and create sanitized fixtures only; do not copy customer
   names, IDs, tokens, request IDs, or credentials into the repository.
3. Compare at least three representative Search campaigns with the Google Ads UI:
   legacy ACA, campaign broad match, and AI Max enabled with URL expansion/ad-group
   exceptions where available.
4. Keep production deployment, the scheduled scan, and notifications gated until the
   comparison is signed off by a media owner.

