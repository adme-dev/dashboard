# ITA dealer repairs: task and evidence ledger

Updated: 26 October 2026. Coordinator: dealer-marketing repair task. **Overall status: open; not fully live or proven.**

This is the durable continuation record for the four Monday items supplied by Garrix Lopena. A check is complete only within its stated scope. A merge, configured destination, debug response or empty delivery ledger is not proof of customer conversion delivery. Do not close the four parent tasks until their remaining acceptance criteria are met.

## Platform and ownership

| Dealer | Live host / identity | Accepted enquiry owner |
| --- | --- | --- |
| Northern Nissan | `www.northernnissan.com.au`; dealer `fda2904a-5c22-4adc-8611-ae8e8463a04c` | Native DriveAgent `/api/enquiries` → `routeLeadConversion` → conversion router |
| Fairfield Foton | `www.fairfieldfoton.com.au`; dealer `4d4dc739-3d6d-4e60-bfe6-debf620fe386` | Native DriveAgent enquiry routing; retain existing consent-aware browser page views separately |
| Astoria GWM | `astoriagwm.com.au`; Netlify site `15b1a934-6bea-4ee4-9645-616853907ec7` | External Vue website → signed accepted-enquiry gateway → XeroFlow; original CRM remains the legacy WordPress `/astoria-gwm/api/dealer/v1/form` endpoint |

Astoria's portal hostname does not establish native DriveAgent conversion routing. Its legacy server-side tracking hooks remain unverified; resolve ownership before claiming duplicate-free delivery. Do not install another native dealer header tracker as a substitute for supported server delivery.

## Tasks and close criteria

| ID | Monday item / work | State | Owner and next action | Evidence required to close |
| --- | --- | --- | --- | --- |
| ITA-NN-01 | Nissan Merchant Center feed | Repaired; historical provider readback passed | Coordinator: refresh exact source/account diagnostic before parent closure | Merchant account `5434742817`, source `10437231713`, valid dedicated feed and no outstanding blocking item/account errors |
| ITA-NN-02 | Nissan campaign destinations / goals | Repaired; final live verification open | Coordinator: recheck campaign `21711826789`, customer `5253781131`, after asset review and tracking cutover | Correct landing URLs, current eligibility/reasons and preserved budget/action ownership |
| ITA-NN-03 | Nissan native GA4 | Configured; delivery unproven | Coordinator: trace approved operator enquiry or naturally arriving customer event | One accepted native enquiry, matching delivery record, then GA4 reporting; distinguish provider HTTP receipt from reporting |
| ITA-NN-04 | Nissan Ads connection | Picker merged and staged; production connection/mapping open | Shared DriveAgent release owner promotes accepted artifact; coordinator then connects exact dealer account and validates supported server mappings | Live account picker includes `5253781131`; exact account/action ownership saved; provider validation and eventual real attributable conversion |
| ITA-AS-01 | Astoria Google year/title mismatch | Live alignment verified | Coordinator: retain Google model-year semantics; recheck target stocks on final feed | Matching title/model year with preserved prices; do not call model year a recovered compliance date |
| ITA-AS-02 | Astoria actual compliance month | Production omission proven; fix in draft review | Coordinator: finish safe missing-field semantics, then release exact importer and verify normal update | Actual source compliance month persists and is exposed separately; no invented dates or blind backfill |
| ITA-AS-03 | Astoria duplicate K622996/B | Awaiting dealer decision | Paul/dealer identifies canonical stock; coordinator removes only confirmed duplicate through recoverable supported path | One canonical advertising record, correct registration/price/VIN and unaffected unrelated stock |
| ITA-FF-01 | Fairfield GTM / duplicate installation | Native configuration verified; redundant installer removed | Coordinator: retain supported `GTM-W86JFK4F` configuration and existing page-view owner | Exact host has no task-added header loader and no overlapping accepted-lead senders |
| ITA-FF-02 | Fairfield sitemap | Verified | Complete within sitemap scope | GSC successful recheck, last read 25 October, 124 discovered pages |
| ITA-FF-03 | Fairfield GBP access | Verified | Complete within access scope | Authenticated `socialmedia@adme.net.au` opens verified Fairfield FOTON with management controls |
| ITA-FF-04 | Fairfield server conversions | Configured; delivery unproven | Coordinator: verify approved operator or natural accepted enquiry and provider receipt/reporting | Exact native dealer delivery evidence; an empty ledger is not a successful delivery |
| ITA-CV-01 | Requested GTM-N7LKRFRG | Installed | Complete within installation scope | Installed on Astoria dealer website; empty requested container does not replace existing conversion owner `GTM-WJ5VC5B2` |
| ITA-CV-02 | Astoria signed server delivery | Website gateway deployed; XeroFlow profile dormant | Coordinator: verify legacy owner, publish reviewed GTM suppression changes and activate approved profile after Google sign-in | One signed accepted receipt per enquiry, active consent-gated destinations, no duplicate browser GA4 lead sender |
| ITA-CV-03 | Astoria blocked-script resilience | Implementation in progress | Tracking worker: bundle independent first-party consent/context and test external SDK absence | Consent UI works without GTM/XeroFlow SDK; genuine click IDs and stable consented client identity reach signed receipt; denied/withdrawn consent suppresses measurement |
| ITA-CV-04 | End-to-end proof | Pending authorization / live events | Paul: approve labelled operator enquiries or choose natural traffic; coordinator records lineage and provider results | CRM acceptance, canonical UUID, queue/consumer result, provider transport and reporting recorded separately; never invent a lead or click ID |
| ITA-DOC-01 | Platform guard / documentation | Guards merged; ongoing ledger maintenance | Coordinator maintains this ledger and canonical tracking guides | Current ownership, exact source/deployment receipts and remaining gates remain discoverable |

## Verified repairs and release identities

### Northern Nissan and Fairfield

- Removed only the task-added Fairfield GTM header installer and Nissan base Google Ads header script. Native GTM settings remain configured. Fairfield's older consent-aware GA4 page-view header and verification metadata were preserved.
- Nissan GA4 property `308088672`, measurement `G-J9VSGZMTKQ`: private server credential saved and canonical admin reload reports one saved-ready destination. Key event `generate_lead` was created and read back at 08:01:36 UTC, key event `16204340815`, counting method `ONCE_PER_EVENT`.
- The existing GA4-to-Ads link is present, but the existing eight secondary GA4 imports do not include `generate_lead`. Key-event creation alone does not finish Ads conversion setup.
- Native delivery readback at 08:25:42 UTC: Nissan 28 conversion rows, latest 22 October 23:16 UTC; no GA4/Ads provider delivery receipts. Fairfield has no conversion rows. No new conversion records arrived after configuration. Google Analytics Data API read at 08:38:25 UTC succeeded but returned no `generate_lead` rows for 26 October. Same-day reporting delay remains possible.
- Nissan feed originally imported 140 valid vehicles; subsequent source withdrawal explains 139 in a later check. Nine unsuitable advertising records were excluded without removing public inventory. A pre-existing partial-refresh snapshot issue is not fixed by that repair.
- Campaign repair preserved the AUD16.20 daily budget, Maximize Conversions and 19 existing actions. Four broken destinations were repaired; earlier UI improved to Eligible (Limited), with asset review pending. Do not reuse that historical status as a fresh eligibility check.

### Shared DriveAgent release

- Picker [PR1836](https://github.com/adme-dev/promotion-knoxgwmhaval/pull/1836) merged at `0d7cc1686ca7b9be7b97724336a0959d1a4630d0`; 16 focused tests, independent review, build/lint/format/root typecheck passed. Separate full server-project typecheck was stopped after ten minutes without diagnostics and is incomplete.
- Current combined source `d01050cda1fdbc22d9f87399dbd48639305f34e0`; artifact SHA256 `9a9045d114bd9e9add9b93f6dd7be10d655a253ee09712d5e3cc8bc1fd5b6348` independently verified.
- Staging deployment `14f5e049.dealer-network-staging.pages.dev`, verified 08:45:08 UTC: ten live readiness checks and all seven guarded smoke checks passed. This is staging, not production acceptance.
- Last observed production remained `a2ccf0f24c71e29da400c21fdc33265daba0d91e`. The release also contains fleet-wide authentication changes; actual approved single-email/session/logout acceptance remains required. Preserve the active rollout coordinator's ownership; do not race it with another deployment or resend its one approved auth email.

### Astoria

- Feed/title alignment [PR3](https://github.com/adme-dev/astoria-gwm/pull/3) source `7e66648aae414a61e800b88f6908142ead2ec024` was verified with zero mismatches across 283 then-live items. A later source check showed 282 feed items. All five requested stocks retain model year 2026 and existing prices.
- Google defines `year` as **model year**: [vehicle feed specification](https://developers.google.com/vehicle-listings/reference/feed-specification) and [Merchant product attributes](https://developers.google.com/merchant/api/reference/rest/products_v1/ProductAttributes). Compliance month must remain separate; substituting it blindly would change the field's meaning.
- K622996: registration `2CU9ST`, price AUD23,500. K622996B: `2CC8BU`, AUD22,500. Same VIN does not resolve which price/registration is correct. No deletion performed.
- Signed accepted-enquiry website source `96d7133e0ccdf6a95933a4bc8f8efb152f684d06`, Netlify production `6adef8af05c5921788827cbe`, published 06:53:27 UTC. Server credentials and durable retry path configured. Hosted GET/empty POST/foreign-origin checks returned 405/400/403 without CRM submissions. These negative checks do not establish positive delivery.
- XeroFlow profile version 7 has privacy and owner live approvals recorded. Four destinations and six mappings pass readiness/validation. Profile remains disabled/test until coordinated cutover; Google validation-only and GA4 debug responses did not ingest real conversions.
- GTM workspace24 has 13 reviewed unpublished changes: accepted-enquiry guards, transaction IDs, advertising consent requirements and five paused legacy GA4 enquiry tags. Advertising account sign-in is expired. The available socialmedia account does not expose this container.
- The first-party context repair is being implemented in an isolated current-master branch. Its previous code hid consent controls when the external consent object was absent and relied on `_ga`/SDK context; that is an actual blocked-script gap, not proof that the deployed gateway itself fails.

### Compliance importer

- Source: `Paul008/vms-middleware`; production Netlify `driveagentfeed`, site `0a9db618-6feb-49b8-bd14-4480a13ef578`, deployment `68ca3554ef11690008f59ad1`, commit `02a8daf04fe29e953b01dbf94a313531327f4f18`. Function `carsales` exists; `/carsales-api` maps to it.
- Current importer maps build/model years but drops compliance month. Live source check: 297 eligible records, no populated compliance date or retained payload. The reported March 2026 compliance of K632290A cannot be independently reconstructed from those rows.
- A read-only production function observation at 08:48:14–08:48:44 UTC captured an actual J660450 supplier update: build November 2025, compliance January 2026. Only stock ID and year/month fields were retained. This proves both the production route and the omission; it does not establish dates for other stocks.
- [Draft importer PR1](https://github.com/Paul008/vms-middleware/pull/1) validates actual `ComplianceDate.Year/Month` and represents month precision as `YYYY-MM-01`. The day is a storage convention, not an observed compliance day. The first candidate's 21 handler-boundary tests pass. A follow-up is changing missing/invalid input handling to preserve existing verified values; its contract/test review remains open. No production release or backfill performed.
- GitHub automatically started an importer deploy preview. Its source points at production Supabase: **do not send test inventory to that preview**. Finish the missing-field persistence contract before activating the shared importer change; supplier routing and one genuine compliance payload are now proven.

## Documentation and evidence limits

Dashboard guard [PR710](https://github.com/adme-dev/dashboard/pull/710) merged at `21b162c19eb1956c80dc2ab2ab4731ead7968bfd`. DriveAgent guard and corrected tracking guides [PR1835](https://github.com/adme-dev/promotion-knoxgwmhaval/pull/1835) merged at `466292001442a68cf4b7595a5d69868105b1ebcd`. Graph provenance was missing/stale and the separate GitHub wiki repository was unavailable; the committed tracking audit records those limits. Do not claim the wiki was refreshed.

Local operational evidence is indexed in `/private/tmp/ita-completion-status-20261026.md`. It includes screenshots and sanitized readbacks. This committed ledger preserves the key receipts if temporary artifacts disappear. No credentials, private gateway URLs or customer payloads belong here.

## Closeout protocol

1. Preserve exact source, artifact, deployment and dealer identity at every release. Record configuration, test, deployment, provider transport and provider reporting separately.
2. Resolve the pending Google sign-in, duplicate stock decision and explicit operator-test choice. Elapsed time is not an answer.
3. Complete server ownership and blocked-script checks, then perform the coordinated tracking cutover. Do not add overlapping browser senders to clear provider warnings.
4. For approved operator enquiries, label the CRM message as an operator test, record its actual test classification, avoid accidental sales follow-up, and never claim it is a genuine customer or ad-attributed lead. Do not create fake click IDs or click advertisements to manufacture attribution.
5. Mark each task closed only after its stated acceptance evidence exists. Publish a final four-item handoff with any provider reporting latency or remaining external limits clearly stated.
