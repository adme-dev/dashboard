# Universal Lead Gateway Reuse Matrix

Reconciled against production merge `d4d50ee13bd1259269b8f53dc804037e2150a87c` on 2026-08-21.

| Capability | Classification | Merged implementation / remaining action |
|---|---|---|
| Browser observation and attribution | Reuse | `public/track.js`, `server/api/public/lead-intent.post.ts`, and `server/utils/leads/submissionIntent.ts` already provide PII-minimised candidate evidence and correlation. |
| Canonical lead acceptance | Reuse | `server/utils/leads/acceptance.ts` owns reconciliation, synthetic containment, CRM/rule/notification gating, and measurement publication. |
| Provider-neutral payload | Reuse | `server/utils/leads/dealerLeadAdapter.ts` already exposes `lead.submitted.v1` and the bounded five-value `CanonicalEnquiryTypeSchema`. |
| Trusted provider ingress | Reuse/configure | `server/api/leads/webhook/standard/[token].post.ts` verifies signed raw bodies and calls `acceptLead()` through a canonical connector. Knox LDV still needs a tenant-specific Dealer Studio receipt path and connector secret. |
| Connector registry | Reuse/configure | `connectorContracts.ts`, `connectorRepository.ts`, `connectorService.ts`, and `/api/leads/connectors` are deployed. Knox LDV needs its separate connector record. |
| Signed capture tests | Reuse/configure | `captureTestContracts.ts`, `captureTestRepository.ts`, `captureTestService.ts`, and the connector UI are deployed. Knox LDV needs five contained form journeys. |
| Health and sustained alerts | Reuse | `leadHealth.ts`, `lead-integration-health.post.ts`, and connector health APIs/UI already distinguish candidate traffic from canonical receipt health. |
| Exact enquiry-type routing | Reuse | Migration `338_typed_website_conversion_routing.sql`, measurement contracts/outbox/repository, worker repository, and destination editor already enforce typed-to-typed and untyped-to-untyped matching with `unmapped_enquiry_type`. |
| Google OAuth and account discovery | Reuse/configure | Existing Google OAuth requests `adwords` and `datamanager`, stores tenant-scoped credential profiles, and discovers customer accounts. Customer `389-217-6492` still needs to be connected/mapped to Knox LDV. |
| Google conversion-action discovery | Reuse | The tenant-scoped GET endpoint and `googleConversionActionDiscovery` already list eligible `UPLOAD_CLICKS`/`WEBPAGE` actions without exposing credentials. |
| Google conversion-action creation | Build | Add an idempotent, allowlisted POST path that reuses an exact compatible action or creates one `UPLOAD_CLICKS` action through Google Ads API v23 and reads it back. |
| Google server-side validation/delivery | Reuse/configure | Provider tests already use Data Manager `validateOnly`; the delivery worker uses transaction IDs for deduplication. Knox LDV needs five exact destinations/mappings and validation evidence. |
| Tracking analytics UI | Reuse | Existing portal tracking analytics and connector panel already surface candidate/confirmed evidence and capture-test stages. |

## Reconciled baseline

Command:

```bash
pnpm vitest run test/public/track-tag.test.ts test/server/api/leads/webhook-generic-measurement.test.ts test/server/utils/leads/intake.test.ts test/server/utils/leads/leadCaptureContract.test.ts test/server/utils/leads/submissionIntent.test.ts test/server/utils/leads/leadHealth.test.ts test/server/utils/measurement/outbox.test.ts test/server/utils/measurement/destinationRepository.test.ts test/workers/measurementDeliveryRepository.test.ts
```

Result: 9 test files passed, 100 tests passed.
