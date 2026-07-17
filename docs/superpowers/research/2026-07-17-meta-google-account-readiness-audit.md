# Meta and Google Conversion Readiness Audit

**Date:** 17 July 2026
**Mode:** Read-only browser, repository, and aggregate production database audit
**Purpose:** Validate whether current ADME provider accounts, Zero connections, lead intake, and native CRM data are ready for the Measurement Signal Hub pilot.

No account settings were changed. No tokens, individual lead/customer names, email addresses, phone numbers, or raw lead payloads were selected or recorded.

## Executive result

The platform architecture is viable, and **Ferntree Gully Automotive is the strongest inspected pilot candidate**, but it is not ready for live CRM outcome delivery without onboarding and baseline repair.

- Zero's native CRM should remain the default lifecycle source, but it currently contains no opportunities or recorded stage changes in production.
- The user-supplied Meta account is a poor pilot shell: it has an inactive app data source rather than an active web/CRM Pixel integration.
- Ferntree's Meta dataset is active with Pixel plus web CAPI, but the CAPI connection is explicitly web-only; CRM CAPI is not configured and Meta marks the live Lead event's match quality `6.2/10` with an update recommended.
- Ferntree's Google child account has Enhanced Conversions for Leads managed through GTM, but its Submit lead form goal needs attention and one of eight enhanced-conversion actions has an urgent diagnostic issue.
- Existing Zero Google connections have Google Ads access but none has the Data Manager scope.
- The small current lead sample does not retain the provider identifiers required for reliable down-funnel matching.

## Meta account audit: user-supplied account

### Inspected context

- Ad account: `1768287680458045`
- Events Manager data source: **Dealership Analytics Tool**
- Data source/App ID: `1157550492734394`
- Owner: **ADMEAdvertising** (`910973038941836`)

### Observed state

- Events Manager reports one data source.
- The source is presented as an **App ID** and includes app-specific settings rather than an active web/CRM Pixel setup.
- Status: inactive / never received an event.
- Total events: `0`.
- Integrations: none.
- Automatic advanced matching: off.
- The inspected Ads Manager date context did not expose a usable campaign/pixel relationship for pilot validation.

### Implication

Do not use this source as the live CAPI/Conversion Leads pilot destination without first confirming that it is intentionally the desired dataset and linking/configuring the correct web/CRM Pixel path. Prefer selecting an existing client account with active Meta Instant Forms and a known Pixel/dataset, or explicitly provision a dedicated pilot dataset.

Before mutation, verify:

1. correct client/ad account and business owner;
2. Pixel/dataset asset type and ownership;
3. Business Manager admin and Manage Pixel permissions;
4. token strategy and rotation owner;
5. retained 15–16 digit Meta `leadgen_id` on every Instant Form intake;
6. initial/raw lead plus every native CRM stage mapping;
7. volume and validation eligibility.

## Meta account audit: Ferntree pilot candidate

### Inspected context

- Client candidate: **Ferntree Gully Automotive**
- Ad account: **Ferntree Gully Auto Used** (`5717158431690024`)
- Dataset: **FTG Used** (`573284833843027`)
- Owner: **ADMEAdvertising** (`910973038941836`)

### Observed state

- The dataset received `238.4K` events in the displayed last-28-day window from both **Meta Pixel** and **Conversions API**.
- The configured Conversions API connection is active and recently received events, but Events Manager labels it **Web-only**.
- Meta separately recommends **Set up Conversions API for CRM** for the dataset; this is not equivalent to the existing web CAPI connection.
- The live `Lead` event was active with `257` events in the displayed period, was used by one ad set, had multiple integrations, and showed event match quality `6.2/10` with **Update recommended**.
- Other inspected event match-quality scores were approximately `6.1–6.7/10`; Meta recommends improving the percentage of Pixel events covered by CAPI.
- Automatic website matching is on, including email, phone, name, location, country, date of birth, and external ID. Events Manager still reports manual advanced matching as a high-priority outstanding action, so the two controls must not be conflated.
- Dataset Quality API setup is offered as recommended but is not shown as configured.
- The allow list includes `ferntreegullyautomotive.com.au` and subdomains.
- The dataset is also connected to two other displayed websites and one catalogue, so destination validation must confirm which events belong to the pilot site before enabling delivery.

### Implication

Ferntree is a credible web-CAPI baseline and the best inspected Meta pilot candidate, but the platform must model at least four independent states:

1. browser Pixel readiness;
2. web CAPI readiness and coverage/EMQ;
3. CRM CAPI delivery readiness;
4. Conversion Leads optimization eligibility and funnel validation.

The existing web CAPI must not cause Zero to label CRM outcome delivery as configured. Before live CRM events, confirm dataset access/token ownership, establish the Zero CRM event source, retain valid Meta lead IDs for Instant Forms, send initial plus subsequent stages in Test Events, and capture a provider-console baseline for the existing diagnostics.

## Google account audit: manager context

### Inspected context

- Manager context: **ADME Adwords** (`525-047-3322`)
- Goals/Conversions and conversion settings were inspected read-only.

### Observed state

- Customer data terms: **Accepted**.
- Enhanced conversions: recording through the Google tag.
- Enhanced conversions for leads: **Not configured yet**.
- The goals summary reports an account-default **Submit lead form** conversion and no configured sales goals in the displayed journey.
- The conversion-action list reported two enabled rows, but row details did not render reliably because Google Ads detected an ad blocker. The upload page likewise could not provide reliable historical detail.

### Implication

Ordinary tag-based enhanced conversions do not prove readiness for Data Manager offline/enhanced lead events. Pilot onboarding still requires:

1. select a child advertiser/client account and its conversion action;
2. enable/accept Enhanced Conversions for Leads requirements in that account;
3. choose advertiser OAuth versus ADME data-partner authorization;
4. add `datamanager` scope and re-consent without breaking existing Ads access;
5. add `datamanager.partnerlink` only if the partner-link model is selected;
6. retain `gclid`/`gbraid`/`wbraid` or permitted user data from intake;
7. implement request-ID diagnostics polling to terminal provider status.

## Google account audit: Ferntree pilot candidate

### Inspected context

- Child advertiser: **Ferntree Gully Automotive** (`422-155-2633`)
- Zero connection account ID: `4221552633`
- Google Ads manager internal account context: `752648077`

### Observed state

- Customer data terms: **Accepted**.
- Enhanced conversions for leads: **Managed through Google Tag Manager**.
- Enhanced conversions: **Managed through Google Tag Manager** and recording.
- The account-default **Submit lead form** goal contains `10` primary conversion actions across `10 of 10` campaigns and is marked **Needs attention**.
- The conversion diagnostics page reports `8` enhanced-conversion actions and says one has an **urgent issue**.
- Web consent mode is reported as **Excellent**.
- The Uploads page rendered no dependable row detail while Google Ads reported an ad blocker; this audit therefore does not claim that upload history is empty.
- Zero's stored Google connection for this client currently carries only the `adwords` scope, not `datamanager`; its recorded token expiry also requires a refresh/re-consent health check before it is treated as operational.

### Implication

Ferntree already has browser/GTM enhanced-lead configuration, which makes it a useful comparison baseline. It still needs a separate Data Manager destination and authorization gate. Before the Zero adapter is enabled:

1. identify the exact target conversion action(s) among the ten Submit lead form actions;
2. resolve or formally baseline the urgent enhanced-conversion diagnostic and the goal's Needs attention state;
3. decide advertiser OAuth versus ADME data-partner access;
4. obtain the `datamanager` scope without breaking spend reporting;
5. capture a fresh lead with `gclid`/`gbraid`/`wbraid` or permitted user data;
6. prove request-status reconciliation to a terminal diagnostic result.

## Zero connection inventory

Aggregate production results:

| Platform | Active connections | Client-linked connections | Distinct linked clients |
|---|---:|---:|---:|
| Meta | 113 | 20 | 20 |
| Google | 102 | 17 | 17 |

Google scope coverage:

| Scope | Connections |
|---|---:|
| `adwords` | 102 |
| `datamanager` | 0 |

### Implication

Existing connections are useful for discovery and ad-account mapping, but only a minority are linked to canonical clients and none is currently authorized for Google Data Manager. Destination readiness must remain separate from general connection health.

## Lead intake and native CRM readiness

Aggregate production results:

| Source | Leads | Valid 15–16 digit Meta lead IDs | Leads with `gclid` | Qualified | Won |
|---|---:|---:|---:|---:|---:|
| Meta | 2 | 0 | 0 | 0 | 0 |
| Google | 3 | 0 | 0 | 1 | 0 |
| Manual | 1 | 0 | 0 | 0 | 1 |

Native CRM:

- opportunities: `0`;
- recorded opportunity stage changes: `0`.

### Interpretation

The repository correctly maps Meta's resolved lead ID into `leads.source_lead_id` and Google's `gcl_id` into `attribution.gclid`, but the current production sample does not yet contain valid provider identifiers. The CRM feature exists and supports Qualified/Won/Lost, but is not yet populated enough to demonstrate stage-driven conversion delivery.

This means the first pilot must validate the complete path rather than assuming historical data is usable:

```text
provider lead intake
  -> retained provider lead/click ID
  -> explicit lead-to-CRM opportunity link
  -> initial/raw stage event
  -> Qualified/Won/Lost stage history
  -> transactional conversion outbox
  -> Meta/Google delivery and diagnostics
```

## Required pilot gates

1. Provisionally nominate Ferntree Gully Automotive as the pilot and name the client/GTM, Meta, Google, CRM/portal, and privacy owners; select a fallback before live rollout.
2. Capture baseline evidence for FTG Used web CAPI coverage/EMQ and the Google enhanced-conversion urgent issue before Zero sends anything.
3. Prove provider identifier retention with a new test lead before adapter development is considered complete.
4. Create and explicitly link a native CRM opportunity; move it through at least initial and Qualified stages.
5. Confirm that the CRM transition and conversion outbox are one transaction.
6. Configure the existing FTG Used dataset as a disabled/test CRM destination and verify initial plus stage events in Meta Test Events without disturbing the current web CAPI feed.
7. Map the intended Google conversion action, obtain Data Manager authorization, and reconcile one test ingest to terminal diagnostics.
8. Keep both CRM destinations in test/disabled mode until provider-console evidence, Zero health, and source/CRM counts agree.

## Remaining blocked checks

- Meta token generation/asset assignment was not attempted because it would change account/security configuration.
- Ferntree is only a provisional pilot until access owners, privacy approval, a fresh identifier-bearing lead, and native CRM ownership are confirmed.
- The exact Google target conversion action and the detailed urgent diagnostic still require owner review; row-level detail did not render reliably in the ad-blocked browser session.
- Meta CRM CAPI/Conversion Leads token and dataset permissions remain unproven even though web CAPI is active.
- Provider test events require implementing the adapter/test payload and explicit test-mode configuration.
