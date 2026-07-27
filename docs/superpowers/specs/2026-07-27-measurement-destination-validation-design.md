# Design — Measurement destination validation wiring

Date: 2026-07-27. Follows `docs/superpowers/handoffs/2026-07-27-phase-c-complete-items-3-4-shipped.md`.

## Problem

No conversion destination can be brought live through the product, on any platform. The chain is broken at a single point:

- `conversion_destinations.health_status` reaches `'ready'` **only** via `healthRepository.recordValidation`
  (`server/utils/measurement/healthRepository.ts`, the `UPDATE conversion_destinations` at ~line 149).
  `aggregateHealth` in `destinationRepository.ts` — the only other writer — can return `blocked`, `configured`, or
  `not_configured` and nothing else.
- `recordValidation` is reachable only through `healthService.recordValidation`.
- **`healthService` has no production caller.** Verified against `origin/main`: across every `.ts` file in `server/`,
  `workers/`, and `scripts/`, the only file referencing `healthService` or `healthRepository` is `healthService.ts`
  itself. `runtime.ts` exposes six factories; none is a health runtime. Git history shows no such route was ever
  created *or* deleted (`healthService.ts` appears in exactly one commit, `662a1c10`), so this is unbuilt wiring
  rather than a regression.

The downstream consequences:

- `activationRepository.ts:281` counts `health_status = 'ready'` destinations and pushes the `destination_not_ready`
  blocker unless every destination qualifies, so `activate.post.ts` always fails.
- Without activation nothing sets `enabled = TRUE` / `environment = 'live'` — `activationRepository.ts:343` is the
  only writer of those columns.
- `outbox.ts:162-166` gates delivery on all three conditions (`enabled`, `environment = 'live'`,
  `health_status IN ('ready','degraded')`).

Net effect: Phase C items 1 and 4 (conversion value passing, GA4 micro-conversions) and the pre-existing Meta CAPI
and Google Data Manager delivery paths are all inert for any client not configured by hand.

The three destinations live in production today were validated on 2026-07-19 and 2026-07-22 with `last_validated_at`
and `last_success_at` microsecond-identical — the exact signature of `recordValidation`'s `UPDATE` — despite no code
path existing. They were almost certainly made ready by direct SQL during pilot setup. **This design does not touch
them**; they are already `ready` and stay that way.

## Intended design, recovered from the code

The existing pieces show what was meant. `providerTestService` completes a test run with
`{ status: 'accepted' | 'failed', providerRequestId, errorClass, redactedError, completedAt }`, and
`RecordDestinationValidationEvidenceSchema` accepts `{ providerRequestId, errorClass, redactedError, observedAt, ... }`
— the same fields under the same names. The evidence schema's `actor.type` is `z.literal('system')`, i.e. evidence
was meant to be recorded *by the system* as a consequence of a test, not asserted by a human.

The provider test already performs a real, non-destructive provider call — Meta Test Events, and Google with
`validateOnly: true`. That result **is** the validation evidence. The only missing piece is the call.

But a provider test is a server-side call, and some capabilities are browser tags that no server-side test can
observe. A purely test-driven design would leave every Meta destination permanently below `ready`, relocating the
bug rather than fixing it. Hence two evidence paths.

## Decisions

| Decision | Choice |
|---|---|
| Browser-tag capabilities | Explicit operator attestation, recorded with the real user as actor and a required reason, audited |
| Test → health | Auto-record on every test, with a guard that never regresses a live destination |
| Scope | GA4 end-to-end, including the missing test mode and UI support |
| Platform enum consolidation | Fold in only at the sites this work already edits |
| `google_enhanced_conversions_for_leads` | Attestation-only — the Data Manager validate-only call does not exercise it |

## Architecture

```
Machine path:
  POST /api/agency/measurement/clients/[clientId]/destinations/[destinationId]/test
    → createMeasurementProviderTestRuntime(event).run()
        → reserve → real provider call → repository.complete()      [existing]
        → derive covered capability modes via TEST_COVERAGE          [new]
        → healthService.recordValidation({ actor: { type: 'system', id: user.id }, ... })   [new wiring]
    → response gains { validationRecorded, validationSkippedReason }

Attestation path:
  POST /api/agency/measurement/clients/[clientId]/destinations/[destinationId]/attest   [new]
    → createMeasurementAttestationRuntime(event).run()
        → healthService.recordValidation({ actor: { type: 'user', id: user.id }, ... })
```

Both converge on the existing, already-tested `healthService.recordValidation`, which recomputes the capability
aggregate and writes a `measurement_config_audit` row with `action: 'validated'`.

**The actor type carries the machine-vs-human distinction, and this is the point of the split.** The machine path
records `type: 'system'` — a real provider call produced the evidence — while still setting `actor.id` to the
triggering user for attribution. The attestation path records `type: 'user'`, marking the evidence as asserted
rather than observed. Without this, "ready" would not distinguish a verified CAPI endpoint from someone ticking a
box, which is the whole reason attestation is a separate path.

Once every capability is `ready`, the destination aggregate becomes `ready`, `activate.post.ts` stops returning
`destination_not_ready`, and the outbox gate opens.

## Components

### New — `shared/utils/measurementPlatform.ts`

Follows the existing precedent of `shared/utils/measurementEventIdentity.ts` and
`shared/utils/measurementProviderCredential.ts`, and is importable by both Vue components and Nitro server code
(`server/utils/**` is not importable from client components, so a shared module is required).

Exports:

- `MEASUREMENT_PLATFORMS` — const tuple `['meta', 'google_data_manager', 'ga4']`
- `MeasurementPlatform` — type derived from the tuple
- `PLATFORM_LABELS` — display strings for UI
- `PLATFORM_MODE_PREFIX` — moved here; `contracts.ts` re-exports for existing importers
- `CAPABILITY_DEFINITIONS` — moved out of `ClientMeasurementDestinationEditor.vue` so client and server cannot drift
- `TEST_COVERAGE` — the capability-coverage table below
- `isAttestationOnly(mode)` — derived from `TEST_COVERAGE` (a mode is attestation-only precisely when no test
  covers it), not a second hand-maintained list. Deriving it from `CAPABILITY_DEFINITIONS.defaultOrigin` would be
  wrong: `meta_web_capi` is `gtm`-origin yet machine-validatable, and `google_enhanced_conversions_for_leads` is
  `zero`-origin yet attestation-only.

`contracts.ts` derives `MeasurementPlatformSchema` from `MEASUREMENT_PLATFORMS` instead of redeclaring the union.

### Changed

- `server/utils/measurement/providerTestService.ts` — add the GA4 schema to the discriminated union; call the
  health service after `repository.complete()`
- `workers/measurement-delivery/src/providers.ts` — add `validateGa4MeasurementProtocolEvent`
- `server/utils/measurement/runtime.ts` — add `createMeasurementAttestationRuntime`; inject health deps into the
  provider-test runtime
- `server/utils/measurement/contracts.ts` — widen `actor.type`; derive the platform union from the shared module
- `server/utils/measurement/healthRepository.ts` — the `measurement_config_audit` INSERT currently hardcodes the
  literal `'system'` in the `actor_type` column; it must pass `input.actor.type` instead, or the machine-vs-human
  distinction never reaches the audit trail. This is the only change needed in this file
- `app/components/clients/ClientMeasurementProviderTest.vue` — GA4 branch; surface `validationRecorded`
- `app/components/clients/ClientMeasurementDestinationEditor.vue` — `Platform` type from the shared module; GA4
  option; convert the raw `<select>` at line 292 to `USelect` (the project's UI rules require Nuxt UI components,
  and this work edits that exact control)
- `app/components/clients/ClientMeasurementPanel.vue` — attestation control for attestation-only capabilities

### New route

`server/api/agency/measurement/clients/[clientId]/destinations/[destinationId]/attest.post.ts`, guarded by
`requireMeasurementClientAccess(event, clientId, 'configure')` — the same guard the test route uses.

### Contract change

`RecordDestinationValidationEvidenceSchema.actor.type` widens from `z.literal('system')` to
`z.enum(['system', 'user'])`. The audit row already carries `actor_id`, so attestations remain attributable. No
existing caller passes `'user'`, so this is backwards-compatible.

## Capability coverage

One explicit table. Anything absent from it is attestation-only.

| Test mode | Conditions | Capability modes proven |
|---|---|---|
| `meta_test_events` | either `deliveryMode` | `meta_web_capi`, `meta_crm_capi`, `meta_conversion_leads` |
| `google_validate_only` | — | `google_data_manager` |
| `ga4_debug_validation` | — | `ga4_measurement_protocol` |

Attestation-only: `meta_pixel`, `google_tag_enhanced_conversions`, `google_enhanced_conversions_for_leads`.

The classification follows each capability's `defaultOrigin` in `CAPABILITY_DEFINITIONS` — `gtm` means it is managed
in the client's tag manager or website and cannot be observed server-side; `zero` means this platform delivers it.
The two exceptions are deliberate: `meta_web_capi` is `gtm`-origin but genuinely exercised by the Meta web test, and
`google_enhanced_conversions_for_leads` is `zero`-origin but not exercised by the Data Manager validate-only call.

**Meta's three CAPI capabilities are deliberately collapsed onto a single test.** One successful Meta Test Events
run — in either delivery mode — marks all three ready, so a Meta destination needs one test plus one `meta_pixel`
attestation rather than two tests plus an attestation.

This is a conscious trade of strictness for onboarding friction, and it has a cost worth recording: a `web`-mode
test does not exercise the CRM path, and no single test can exercise both, because `META_WEB_TEST_EVENTS` restricts
web mode to `lead_created` / `purchase` / `web_conversion` while `meta_conversion_leads` is about downstream
outcomes like `lead_qualified`. So at least one of the three capabilities is always marked ready by inference
rather than observation.

To keep the audit trail honest without adding operator steps, the evidence written for a Meta test records which
capabilities were **directly exercised** by the call and which were **inferred** from the collapse, in the
`measurement_config_audit` `after_state` JSON. The capability rows themselves are all `ready`; the audit preserves
what was actually observed. No schema change — `after_state` is already a JSON blob.

**Note an asymmetry this introduces:** Meta's unexercised CAPI capabilities now become ready from a test, while
Google's unexercised `google_enhanced_conversions_for_leads` still requires attestation. That is defensible —
Meta's three CAPI modes share one transport and one credential, whereas Google's enhanced-conversions-for-leads is
a separate Google Ads-side configuration — but it is an inconsistency, and aligning Google the same way is a small
change if that is preferred later.

## GA4 test mode

New `Ga4ProviderTestSchema`, `mode: 'ga4_debug_validation'`, extending `CommonProviderTestSchema` with an
operator-supplied `gaClientId` (production delivery reads this from the visitor's `_ga` cookie via
`attribution.gaClientId`; a test has no real visitor).

It calls `https://www.google-analytics.com/debug/mp/collect` rather than the production `/mp/collect`, and treats a
**non-empty `validationMessages[]` as a failure**, carrying the first message through as `redactedError`.

This matters: `providers.ts` already documents that `/mp/collect` returns 204 for essentially every request,
including malformed ones, so it yields no validation signal at delivery time. The debug endpoint is the only place
GA4 returns a real verdict, which makes the GA4 test strictly more informative than GA4 delivery.

## Error handling and safety guards

The core guard, per the decision that a test must never knock a live client offline:

- When a destination is currently `enabled AND environment = 'live'`, a computed evidence status of `blocked` is
  **downgraded to `degraded`**. `degraded` still satisfies the outbox gate, so delivery continues while the problem
  is visible in health.
- Driving a live destination to a true `blocked` requires the explicit attestation route with a reason. It is never
  a side effect of running a test.
- Non-live destinations record the true computed status, so onboarding surfaces genuine failures immediately.

Other cases:

- `recordValidation` returning `version_conflict` (config changed mid-test) does **not** fail the test. The test
  result is still returned, with `validationRecorded: false` and `validationSkippedReason: 'version_conflict'`.
  Failures are reported, never swallowed — a silent no-op is the exact bug class that produced this gap.
- A test whose mode proves no capabilities (not expected given the table, but reachable if the table and the schema
  union ever diverge) records nothing and reports `validationSkippedReason: 'no_covered_capabilities'`.
- Attestation requires a non-empty reason, matching the provider test's existing `reason` requirement.

## Testing

Unit:

- `TEST_COVERAGE` resolution per platform, including that a Meta test in **either** delivery mode resolves to all
  three CAPI capabilities, and that `meta_pixel` is never among them
- the directly-exercised vs inferred split recorded in the Meta evidence audit payload
- the live-destination `blocked` → `degraded` downgrade, and that non-live destinations are unaffected
- GA4 `validationMessages` handling — empty array accepted, non-empty rejected with the message surfaced
- evidence construction from a test result
- attestation authorisation and the reason requirement

Integration, following existing repository test patterns:

- test → capabilities ready → destination `ready` → activation no longer returns `destination_not_ready`
- attestation-only capabilities block `ready` until attested

Regression: the provider-test response shape changes (two new fields). Last session, four test files broke because
they asserted exact-match nested object literals against a payload that gained a field. Any test asserting on the
provider-test response must be checked for the same pattern before claiming the suite is green.

The documented full-suite baseline is 20 failing files / 39 failing tests, all unrelated to measurement. Any
regression is measured against that baseline, not against zero.

## Out of scope

- **No database migration.** Every column, table, and enum value this design needs already exists.
- Backfilling or re-validating the three live production destinations — they are already `ready`.
- A re-validation cron. Health is recorded when a test or attestation runs; nothing expires it on a schedule.
  Worth considering later, since attested evidence can go stale silently.
- Migrating platform-enum duplication at sites this work does not otherwise touch (`destinationRepository.ts`,
  `healthRepository.ts`, `providerTestRepository.ts`, the Worker's `repository.ts`).
- Bounce-duration signals, and `finance_calculator_interact` / `test_drive_booking` micro-conversions — deferred
  scope carried over from Phase C, unrelated to validation.
