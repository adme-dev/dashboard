# Enterprise Measurement Signal Centre Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver consent-governed, deduplicated TikTok Events API 2.0
measurement and cross-platform signal operations in XeroFlow, piloted on
Werribee Toyota.

**Architecture:** Extend the existing Neon Measurement Signal Hub and
transactional outbox. The browser tag captures canonical identity, consent, and
confirmed outcomes; a Cloudflare Queue worker maps eligible events to native
TikTok, Meta, Google, and GA4 adapters. Agency and portal read models expose
redacted capture-to-receipt health.

**Tech Stack:** Nuxt 4, Vue 3, TypeScript, Zod 4, Neon Postgres, Cloudflare Pages,
Workers and Queues, Nuxt UI v4, Vitest 4, happy-dom.

**Spec:** [`docs/prd/2026-09-04-enterprise-measurement-signal-centre-prd.md`](../../prd/2026-09-04-enterprise-measurement-signal-centre-prd.md)

## Global constraints

- XeroFlow is the canonical first-party event and configuration system.
- New profiles, destinations, capabilities, and mappings default disabled/test.
- Advertising delivery requires event-time marketing consent of `granted`.
- Form attempts are never promoted as confirmed lead conversions.
- Raw PII, access tokens, provider bodies, and raw IP never enter canonical
  events, queues, logs, diagnostics, audit, or UI.
- Provider credentials use purpose-scoped measurement references only.
- Browser/server pairs reuse the same event id.
- Queue processing is at-least-once and must remain idempotent.
- Server code imports shared server utilities through `~~/server/utils/`.
- All forms use Nuxt UI v4 and the repository's mandatory form-design rules.
- No production activation or deployment occurs without an explicit operator
  action.

## File structure

```text
public/track.js
  Browser API, consent bridge, attribution cookies, confirmed events.

server/utils/tracking/
  Public payload validation, consent snapshot, row construction and canonical
  promotion.

server/utils/measurement/
  Destination contracts, mapping policy, read services, health and activation.

workers/measurement-delivery/src/
  TikTok payload adapter, delivery routing, credentials and diagnostics.

server/api/agency/measurement/
  Agency configuration, testing, summary and event-lineage endpoints.

server/api/portal/measurement.get.ts
  Redacted tenant-scoped client view.

app/components/clients/ and app/pages/agency/
  Nuxt UI destination editor, provider tests and Signal Centre.

server/database/migrations/
  Additive identifier and provider-constraint changes.

test/public/, test/server/, test/workers/, test/app/
  DOM, contract, persistence, adapter, processor and component tests.
```

---

## Gate 0 — trustworthy collection

### Task 1: Expose the explicit consent bridge

**Files:**

- Modify: `test/public/track-tag.test.ts`
- Modify: `public/track.js`

**Interfaces:**

- Produces:
  `window.xf.setConsent({ tracking, analytics, marketing }): consentSnapshot`.
- Produces data-layer event `xeroflow_consent_update` with string
  `granted`/`denied` states.
- Preserves the existing `_xf_consent` server cookie contract.

- [x] **Step 1: Write failing DOM tests**

```ts
it('stores an explicit consent choice and forwards it with later events', () => {
  loadTag()
  ;(window as any).xf.init({ writeKey: 'TESTKEY', forms: false })
  requests = []

  const choice = (window as any).xf.setConsent({
    tracking: true,
    analytics: true,
    marketing: false
  })
  ;(window as any).xf.track('page_view', {})

  expect(choice.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  expect(JSON.parse(requests[0].body).consent).toContain('"marketing":false')
})

it('rejects malformed consent without replacing the current choice', () => {
  loadTag()
  const first = (window as any).xf.setConsent({
    tracking: true,
    analytics: false,
    marketing: false
  })

  expect(() => (window as any).xf.setConsent({ marketing: true })).toThrow(TypeError)
  expect(document.cookie).toContain(encodeURIComponent(JSON.stringify(first)))
})
```

- [x] **Step 2: Run the tests and confirm RED**

```bash
pnpm vitest run test/public/track-tag.test.ts
```

Expected: failures because `window.xf.setConsent` does not exist.

- [x] **Step 3: Implement the minimal fail-closed consent API**

```js
function setConsent(choice) {
  if (!choice || typeof choice.tracking !== 'boolean'
    || typeof choice.analytics !== 'boolean'
    || typeof choice.marketing !== 'boolean') {
    throw new TypeError('XeroFlow consent requires tracking, analytics and marketing booleans')
  }
  var snapshot = {
    tracking: choice.tracking,
    analytics: choice.analytics,
    marketing: choice.marketing,
    updatedAt: new Date().toISOString(),
  }
  setCookie(CONSENT_COOKIE_NAME, JSON.stringify(snapshot), COOKIE_DAYS)
  pushConsentUpdate(snapshot)
  return snapshot
}
```

- [x] **Step 4: Run the focused test and verify GREEN**

```bash
pnpm vitest run test/public/track-tag.test.ts
```

Expected: all public-tag tests pass.

- [x] **Step 5: Review scope and commit**

```bash
git diff --check -- public/track.js test/public/track-tag.test.ts
git add public/track.js test/public/track-tag.test.ts
git commit -m "feat: add explicit tracking consent bridge"
```

### Task 2: Capture TikTok browser identifiers in the public contract

**Files:**

- Modify: `test/public/track-tag.test.ts`
- Modify: `test/server/utils/tracking/track-schema.test.ts`
- Modify: `public/track.js`
- Modify: `server/utils/tracking/track-schema.ts`

**Interfaces:**

- Consumes first-party `_ttp` and URL `ttclid` values.
- Produces optional bounded `attribution.ttp` and existing
  `attribution.ttclid`.

- [x] **Step 1: Add failing transport and schema tests**

```ts
it('forwards TikTok click and browser identifiers', () => {
  window.history.pushState({}, '', '/vehicles?ttclid=tiktok-click-1')
  document.cookie = '_ttp=tiktok-browser-1; path=/'
  loadTag()
  ;(window as any).xf.init({ writeKey: 'TESTKEY', forms: false })

  const payload = JSON.parse(requests.at(-1)!.body)
  expect(payload.events[0].attribution).toMatchObject({
    ttclid: 'tiktok-click-1',
    ttp: 'tiktok-browser-1'
  })
})
```

- [x] **Step 2: Confirm RED**

```bash
pnpm vitest run test/public/track-tag.test.ts test/server/utils/tracking/track-schema.test.ts
```

Expected: `_ttp` is absent/rejected.

- [x] **Step 3: Add bounded `ttp` capture and validation**

```ts
ttp: z.string().max(512).nullable().optional()
```

Read `_ttp` with the existing cookie helper and copy it into the event attribution
object. Do not generate a replacement value.

- [x] **Step 4: Verify GREEN**

```bash
pnpm vitest run test/public/track-tag.test.ts test/server/utils/tracking/track-schema.test.ts
```

- [x] **Step 5: Commit**

```bash
git add public/track.js server/utils/tracking/track-schema.ts test/public/track-tag.test.ts test/server/utils/tracking/track-schema.test.ts
git commit -m "feat: capture TikTok browser attribution"
```

### Task 3: Persist `_ttp` in first-party tracking events

**Files:**

- Create: `server/database/migrations/338_tracking_tiktok_browser_id.sql`
- Modify: `server/utils/tracking/event-insert.ts`
- Modify: `server/utils/tracking/eventPersistence.ts`
- Modify: `test/server/utils/tracking/event-insert.test.ts`
- Modify: `test/server/utils/tracking/eventPersistence.test.ts`

**Interfaces:**

- Consumes `TrackPayload.events[].attribution.ttp` from Task 2.
- Produces nullable `TrackingEventRow.ttp` and `tracking_events.ttp`.

- [x] **Step 1: Add failing row/persistence tests**

```ts
expect(buildEventRows(site, {
  events: [{ ...payload.events[0], attribution: { ttp: 'browser-1' } }]
}, ctx)[0].ttp).toBe('browser-1')
```

Assert the persistence insert includes `ttp` between TikTok click identity and
the remaining attribution fields.

- [x] **Step 2: Confirm RED**

```bash
pnpm vitest run test/server/utils/tracking/event-insert.test.ts test/server/utils/tracking/eventPersistence.test.ts
```

- [x] **Step 3: Add the nullable column and mapping**

```sql
ALTER TABLE tracking_events
  ADD COLUMN IF NOT EXISTS ttp TEXT;
```

Add `ttp` to `TrackingEventRow`, `ATTR_KEYS`, the insert column list, and insert
parameters.

- [x] **Step 4: Apply the migration immediately**

```bash
export DATABASE_URL=$(grep DATABASE_URL .env | cut -d= -f2-)
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f server/database/migrations/338_tracking_tiktok_browser_id.sql
```

- [x] **Step 5: Verify GREEN and migration state**

```bash
pnpm vitest run test/server/utils/tracking/event-insert.test.ts test/server/utils/tracking/eventPersistence.test.ts
psql "$DATABASE_URL" -c "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'tracking_events' AND column_name = 'ttp'"
```

- [x] **Step 6: Commit**

```bash
git add server/database/migrations/338_tracking_tiktok_browser_id.sql server/utils/tracking/event-insert.ts server/utils/tracking/eventPersistence.ts test/server/utils/tracking/event-insert.test.ts test/server/utils/tracking/eventPersistence.test.ts
git commit -m "feat: persist TikTok browser attribution"
```

### Task 4: Expand the safe canonical web-attribution allowlist

**Files:**

- Create: `server/database/migrations/339_measurement_web_attribution.sql`
- Modify: `server/utils/measurement/contracts.ts`
- Modify: `server/utils/tracking/browserCanonicalConversion.ts`
- Modify: `test/server/utils/measurement/contracts.test.ts`
- Modify: `test/server/utils/tracking/browserCanonicalConversion.test.ts`

**Interfaces:**

- Consumes tracking-row `ttclid`, `ttp`, page URL, and user agent.
- Produces nullable canonical fields `ttclid`, `ttp`, `gaClientId`,
  `eventSourceUrl`, and `clientUserAgent` without copying event data or PII.
- Preserves the bounded `gaClientId` compatibility key already present in live
  canonical rows instead of deleting useful GA4 correlation data.

- [x] **Step 1: Write failing allowlist/promotion tests**

```ts
expect(buildBrowserCanonicalConversion({
  row: {
    ...row,
    ttclid: 'click-1',
    ttp: 'browser-1',
    page_url: 'https://www.werribeetoyota.com.au/enquire',
    ua: 'Test Browser'
  },
  marketingConsent: 'granted',
  receivedAt
})?.attribution).toMatchObject({
  ttclid: 'click-1',
  ttp: 'browser-1',
  eventSourceUrl: 'https://www.werribeetoyota.com.au/enquire',
  clientUserAgent: 'Test Browser'
})
```

- [x] **Step 2: Confirm RED**

```bash
pnpm vitest run test/server/utils/measurement/contracts.test.ts test/server/utils/tracking/browserCanonicalConversion.test.ts
```

- [x] **Step 3: Extend the Zod contract and database constraint**

Replace the canonical attribution check so the only permitted keys are:

```text
browserEventId, metaLeadId, gclid, gbraid, wbraid, fbc, fbp, ttclid, ttp,
gaClientId, eventSourceUrl, clientUserAgent
```

- [x] **Step 4: Apply migration and verify GREEN**

```bash
export DATABASE_URL=$(grep DATABASE_URL .env | cut -d= -f2-)
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f server/database/migrations/339_measurement_web_attribution.sql
pnpm vitest run test/server/utils/measurement/contracts.test.ts test/server/utils/tracking/browserCanonicalConversion.test.ts
```

- [x] **Step 5: Commit**

```bash
git add server/database/migrations/339_measurement_web_attribution.sql server/utils/measurement/contracts.ts server/utils/tracking/browserCanonicalConversion.ts test/server/utils/measurement/contracts.test.ts test/server/utils/tracking/browserCanonicalConversion.test.ts
git commit -m "feat: preserve safe web conversion context"
```

### Task 5: Add a confirmed-lead browser success contract

**Files:**

- Modify: `test/public/track-tag.test.ts`
- Modify: `public/track.js`
- Modify: `docs/integrations/xeroflow-confirmed-web-conversions.md`

**Interfaces:**

- Produces `window.xf.confirmLead(data, { eventId })` as a narrow wrapper over
  `track('generate_lead', ...)`.
- Produces/consumes DOM event `xeroflow:lead-confirmed` with a caller-owned
  conversion `detail.eventId`; it must not reuse the separate form-attempt id.

- [ ] **Step 1: Add failing confirmed-success tests**

```ts
it('emits one confirmed lead with the caller-owned event id', () => {
  const eventId = (window as any).xf.createEventId()
  ;(window as any).xf.confirmLead({ form_id: 'vehicle-enquiry' }, { eventId })
  const events = requests.map(item => JSON.parse(item.body).events[0])
  expect(events.filter(event => event.event_name === 'generate_lead')).toEqual([
    expect.objectContaining({ event_id: eventId })
  ])
})
```

- [ ] **Step 2: Confirm RED, implement wrapper/listener, verify GREEN**

```bash
pnpm vitest run test/public/track-tag.test.ts
```

The listener must ignore missing/invalid conversion event ids and never copy
arbitrary `detail` fields. Allowlist `form_id`, `form_name`,
`submission_event_id`, `vehicle_id`, `vehicle_make`, `vehicle_model`, `value`,
and `currency`.

- [ ] **Step 3: Document provider integration examples**

```js
const submissionEventId = window.xf.track('form_submit', {
  form_id: 'vehicle-enquiry'
})
providerForm.onSuccess(() => {
  const conversionEventId = window.xf.createEventId()
  window.xf.confirmLead(
    { form_id: 'vehicle-enquiry', submission_event_id: submissionEventId },
    { eventId: conversionEventId }
  )
})
```

- [ ] **Step 4: Commit**

```bash
git add public/track.js test/public/track-tag.test.ts docs/integrations/xeroflow-confirmed-web-conversions.md
git commit -m "feat: add confirmed web lead contract"
```

## Checkpoint A — collection readiness

- [ ] Public-tag, tracking-schema, persistence, consent, and promotion tests pass.
- [ ] Migrations 338 and 339 are applied and inspected.
- [ ] No new provider delivery can occur.
- [ ] Test a successful and failed sample form: only success creates
  `generate_lead`.
- [ ] Review all modified files end-to-end and verify no contact fields enter the
  canonical event.

---

## Gate 1 — native TikTok test destination

### Task 6: Add TikTok measurement contracts

**Files:**

- Modify: `server/utils/measurement/contracts.ts`
- Modify: `test/server/utils/measurement/contracts.test.ts`
- Modify: `app/types/measurement.ts`
- Modify: `test/app/clientMeasurementDestinationEditor.test.ts`

**Interfaces:**

- Extends `MeasurementPlatformSchema` with `tiktok`.
- Extends capabilities with `tiktok_pixel` and `tiktok_events_api`.
- Extends canonical events with `vehicle_view`, `site_search`, `phone_contact`,
  and `test_drive_booked` for the approved automotive full-funnel mappings.
- TikTok mappings must use TikTok capabilities only.

- [ ] **Step 1: Add failing TikTok schema tests**

```ts
const result = CreateConversionDestinationConfigurationSchema.parse({
  clientId,
  expectedProfileVersion: 1,
  reason: 'Configure Werribee TikTok test delivery',
  actor,
  destination: {
    platform: 'tiktok',
    socialConnectionId: null,
    externalDestinationId: 'C1234567890',
    credentialRef: 'measurement:tiktok:werribee',
    capabilities: [{
      mode: 'tiktok_events_api',
      status: 'configured',
      managementOrigin: 'zero',
      canZeroMutate: true,
      blockingReason: null
    }],
    mappings: [{
      canonicalEventName: 'web_conversion',
      providerEventName: 'SubmitForm',
      isActive: false
    }]
  }
})
expect(result.destination.platform).toBe('tiktok')
```

- [ ] **Step 2: Confirm RED, implement platform ownership mapping, verify GREEN**

```bash
pnpm vitest run test/server/utils/measurement/contracts.test.ts test/app/clientMeasurementDestinationEditor.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add server/utils/measurement/contracts.ts test/server/utils/measurement/contracts.test.ts app/types/measurement.ts test/app/clientMeasurementDestinationEditor.test.ts
git commit -m "feat: define TikTok measurement contracts"
```

### Task 7: Expand database provider constraints for TikTok

**Files:**

- Create: `server/database/migrations/340_measurement_tiktok_destination.sql`
- Modify: `test/server/utils/measurement/destinationRepository.test.ts`
- Modify: `test/server/utils/measurement/providerTestRepository.test.ts`

**Interfaces:**

- Allows `tiktok` in `conversion_destinations`, `conversion_deliveries`, and
  `measurement_provider_test_runs` platform checks.
- Allows `tiktok_pixel` and `tiktok_events_api` wherever capability values are
  constrained.
- Allows the approved automotive canonical event names wherever canonical event
  names are constrained.

- [ ] **Step 1: Add migration contract tests**

Assert the migration drops each named legacy check and recreates an explicit
allowlist containing `meta`, `google_data_manager`, and `tiktok`.

- [ ] **Step 2: Create the additive constraint migration**

```sql
ALTER TABLE conversion_destinations
  DROP CONSTRAINT IF EXISTS conversion_destinations_platform_check;
ALTER TABLE conversion_destinations
  ADD CONSTRAINT conversion_destinations_platform_check
  CHECK (platform IN ('meta', 'google_data_manager', 'tiktok'));
```

Apply the equivalent explicit constraint to every provider-scoped measurement
table identified by the repository tests.

- [ ] **Step 3: Apply and verify**

```bash
export DATABASE_URL=$(grep DATABASE_URL .env | cut -d= -f2-)
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f server/database/migrations/340_measurement_tiktok_destination.sql
pnpm vitest run test/server/utils/measurement/destinationRepository.test.ts test/server/utils/measurement/providerTestRepository.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add server/database/migrations/340_measurement_tiktok_destination.sql test/server/utils/measurement/destinationRepository.test.ts test/server/utils/measurement/providerTestRepository.test.ts
git commit -m "feat: allow TikTok measurement destinations"
```

### Task 8: Implement the TikTok Events API 2.0 adapter

**Files:**

- Modify: `test/workers/measurementDeliveryProviders.test.ts`
- Modify: `workers/measurement-delivery/src/providers.ts`

**Interfaces:**

- Produces `deliverTikTokEvent(input: TikTokDeliveryInput)`.
- Reuses `ProviderDeliveryResult` and `MeasurementProviderDelivery`.

- [ ] **Step 1: Add failing adapter tests**

```ts
await expect(deliverTikTokEvent({
  delivery: {
    ...baseDelivery,
    providerEventName: 'SubmitForm',
    externalDestinationId: 'C1234567890',
    attribution: {
      ...baseDelivery.attribution,
      browserEventId: 'browser-event-1',
      ttclid: 'click-1',
      ttp: 'browser-1',
      eventSourceUrl: 'https://www.werribeetoyota.com.au/enquire',
      clientUserAgent: 'Test Browser'
    }
  },
  accessToken: 'test-token',
  environment: 'test',
  fetch
})).resolves.toMatchObject({ outcome: 'accepted' })
```

Also test: no event id; no TikTok match input; invalid timestamp; test marker in
live mode; `429`; `500`; `401`; malformed JSON; and request-id truncation.

- [ ] **Step 2: Confirm RED**

```bash
pnpm vitest run test/workers/measurementDeliveryProviders.test.ts
```

- [ ] **Step 3: Implement the minimal adapter**

Post to TikTok Events API 2.0 using bearer authentication, the destination id,
same browser event id, event time, page context, `ttclid`, `_ttp`, and user agent.
Use `httpFailure()` for transport classification and `responseObject()` for safe
receipt parsing. Do not log request bodies.

- [ ] **Step 4: Verify GREEN**

```bash
pnpm vitest run test/workers/measurementDeliveryProviders.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add workers/measurement-delivery/src/providers.ts test/workers/measurementDeliveryProviders.test.ts
git commit -m "feat: deliver TikTok Events API conversions"
```

### Task 9: Route TikTok through the shared delivery processor

**Files:**

- Modify: `workers/measurement-delivery/src/delivery.ts`
- Modify: `workers/measurement-delivery/src/repository.ts`
- Modify: `workers/measurement-delivery/src/index.ts`
- Modify: `test/workers/measurementDeliveryProcessor.test.ts`
- Modify: `test/workers/measurementDeliveryRepository.test.ts`

**Interfaces:**

- Consumes Task 8 `deliverTikTokEvent`.
- Resolves purpose-scoped TikTok credential refs through the existing resolver.
- Records the same delivery outcome vocabulary as Meta and Google.

- [ ] **Step 1: Add failing routing and claim tests**

```ts
expect(claim).toMatchObject({
  platform: 'tiktok',
  externalDestinationId: 'C1234567890',
  attribution: {
    browserEventId: 'browser-event-1',
    ttclid: 'click-1',
    ttp: 'browser-1'
  }
})
```

Assert missing TikTok credentials record
`tiktok_events_api_credential_unavailable` without making a provider request.

- [ ] **Step 2: Confirm RED**

```bash
pnpm vitest run test/workers/measurementDeliveryProcessor.test.ts test/workers/measurementDeliveryRepository.test.ts
```

- [ ] **Step 3: Add the TikTok branch and repository projection**

Use the provider registry pattern already established for Meta and Google. Keep
provider calls outside the database claim transaction.

- [ ] **Step 4: Verify GREEN and worker typecheck**

```bash
pnpm vitest run test/workers/measurementDeliveryProcessor.test.ts test/workers/measurementDeliveryRepository.test.ts
pnpm --dir workers/measurement-delivery exec tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add workers/measurement-delivery/src/delivery.ts workers/measurement-delivery/src/repository.ts workers/measurement-delivery/src/index.ts test/workers/measurementDeliveryProcessor.test.ts test/workers/measurementDeliveryRepository.test.ts
git commit -m "feat: route TikTok measurement deliveries"
```

### Task 10: Add TikTok provider-test evidence and diagnostics

**Files:**

- Modify: `server/utils/measurement/providerTestService.ts`
- Modify: `test/server/utils/measurement/providerTestService.test.ts`
- Modify: `workers/measurement-delivery/src/diagnostics.ts`
- Modify: `test/workers/measurementDeliveryDiagnostics.test.ts`

**Interfaces:**

- Test mode invokes Task 8 with a test marker and records bounded receipt id.
- Diagnostic output maps to `ready`, `degraded`, or `blocked` plus a redacted
  stable reason.

- [ ] **Step 1: Add failing provider-test/diagnostic tests**

```ts
expect(await service.run({ ...command, platform: 'tiktok' })).toMatchObject({
  platform: 'tiktok',
  outcome: 'accepted',
  providerRequestId: 'tiktok-log-1'
})
```

Test missing token, missing Pixel id, rejected test event, stale diagnostic, and
ready evidence.

- [ ] **Step 2: Confirm RED, implement, verify GREEN**

```bash
pnpm vitest run test/server/utils/measurement/providerTestService.test.ts test/workers/measurementDeliveryDiagnostics.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add server/utils/measurement/providerTestService.ts test/server/utils/measurement/providerTestService.test.ts workers/measurement-delivery/src/diagnostics.ts test/workers/measurementDeliveryDiagnostics.test.ts
git commit -m "feat: validate TikTok measurement health"
```

## Checkpoint B — TikTok test delivery

- [ ] Measurement contract, repository, adapter, processor, and diagnostics tests
  pass.
- [ ] Worker typecheck passes.
- [ ] New TikTok destination remains disabled/test by default.
- [ ] A synthetic event reaches TikTok Test Events with a provider receipt.
- [ ] Browser Pixel and Events API copies share event name/id and appear once.
- [ ] No token or payload content appears in logs, database diagnostics, or test
  snapshots.

---

## Gate 2 — enterprise signal operations

### Task 11: Build the Signal Centre summary read model

**Files:**

- Create: `server/utils/measurement/signalSummary.ts`
- Create: `server/api/agency/measurement/clients/[clientId]/signals/summary.get.ts`
- Create: `test/server/utils/measurement/signalSummary.test.ts`
- Create: `test/server/api/measurementSignalSummary.test.ts`

**Interfaces:**

- Produces `MeasurementSignalSummary` from the approved design.
- API requires measurement read permission and client scope.
- Identifier coverage returns percentages/counts only.

- [ ] **Step 1: Add failing aggregate and tenant-scope tests**

```ts
expect(await summarize(rows)).toEqual(expect.objectContaining({
  captured: 100,
  confirmed: 4,
  consentGranted: 60,
  policySkipped: 40,
  identifierCoverage: expect.objectContaining({ ttclid: 12, ttp: 10 })
}))
```

- [ ] **Step 2: Confirm RED, implement smallest SQL/read service, verify GREEN**

```bash
pnpm vitest run test/server/utils/measurement/signalSummary.test.ts test/server/api/measurementSignalSummary.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add server/utils/measurement/signalSummary.ts 'server/api/agency/measurement/clients/[clientId]/signals/summary.get.ts' test/server/utils/measurement/signalSummary.test.ts test/server/api/measurementSignalSummary.test.ts
git commit -m "feat: expose measurement signal summary"
```

### Task 12: Build redacted event lineage

**Files:**

- Create: `server/utils/measurement/eventLineage.ts`
- Create: `server/api/agency/measurement/clients/[clientId]/signals/index.get.ts`
- Create: `test/server/utils/measurement/eventLineage.test.ts`
- Create: `test/server/api/measurementSignalEvents.test.ts`

**Interfaces:**

- Returns event id, canonical name, timestamps, consent state, mapping version,
  destination, outcome, receipt id, and redacted reason.
- Supports bounded date/state/event/platform filters and cursor pagination.

- [ ] **Step 1: Add failing filter/redaction/tenant tests**

Assert email, phone, tokens, raw attribution values, provider bodies, and database
errors are absent from serialized responses.

- [ ] **Step 2: Confirm RED, implement, verify GREEN**

```bash
pnpm vitest run test/server/utils/measurement/eventLineage.test.ts test/server/api/measurementSignalEvents.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add server/utils/measurement/eventLineage.ts 'server/api/agency/measurement/clients/[clientId]/signals/index.get.ts' test/server/utils/measurement/eventLineage.test.ts test/server/api/measurementSignalEvents.test.ts
git commit -m "feat: expose redacted measurement lineage"
```

### Task 13: Add the agency Signal Centre UI

**Files:**

- Create: `app/pages/agency/measurement/[clientId].vue`
- Create: `app/components/measurement/SignalOverview.vue`
- Create: `app/components/measurement/SignalEventExplorer.vue`
- Create: `test/app/measurementSignalCentre.test.ts`

**Interfaces:**

- Consumes Tasks 11 and 12 APIs.
- Uses existing measurement destination editor/provider-test components for
  mutation flows.

- [ ] **Step 1: Invoke and apply the mandatory frontend-design skill**

Read the project-specified frontend-design skill before modifying any filters or
destination forms. Use `UFormField`, `USelectMenu`, `UInput`, `UButton`, `UTable`,
`UBadge`, `USlideover`, and container-aware grids only.

- [ ] **Step 2: Add failing component tests**

```ts
expect(wrapper.text()).toContain('Signal health')
expect(wrapper.text()).toContain('Confirmed conversions')
expect(wrapper.find('[data-testid="measurement-event-lineage"]').exists()).toBe(true)
expect(wrapper.html()).not.toContain('accessToken')
```

- [ ] **Step 3: Confirm RED, implement overview/explorer, verify GREEN**

```bash
pnpm vitest run test/app/measurementSignalCentre.test.ts
```

- [ ] **Step 4: Verify in an authenticated browser**

Check responsive widths, dark mode, loading/empty/error states, filters, lineage
slideover, network responses, console, and accessibility names.

- [ ] **Step 5: Commit**

```bash
git add 'app/pages/agency/measurement/[clientId].vue' app/components/measurement/SignalOverview.vue app/components/measurement/SignalEventExplorer.vue test/app/measurementSignalCentre.test.ts
git commit -m "feat: add agency measurement Signal Centre"
```

### Task 14: Extend the client portal measurement view

**Files:**

- Modify: `server/api/portal/measurement.get.ts`
- Modify: `app/pages/portal/measurement.vue`
- Modify: `test/server/api/portalMeasurementHealth.test.ts`
- Create: `test/app/portalMeasurementSignalHealth.test.ts`

**Interfaces:**

- Consumes Task 11 aggregates through a portal-safe projection.
- Produces funnel totals, last collection/delivery, platform health, and
  plain-language blockers only.

- [ ] **Step 1: Add failing portal redaction and rendering tests**

```ts
expect(response).toMatchObject({
  funnel: { visits: expect.any(Number), confirmedLeads: expect.any(Number) },
  destinations: expect.arrayContaining([
    expect.objectContaining({ platform: 'tiktok', status: expect.any(String) })
  ])
})
expect(JSON.stringify(response)).not.toMatch(/token|credentialRef|ttclid|ttp/i)
```

- [ ] **Step 2: Confirm RED, implement safe projection/UI, verify GREEN**

```bash
pnpm vitest run test/server/api/portalMeasurementHealth.test.ts test/app/portalMeasurementSignalHealth.test.ts
```

- [ ] **Step 3: Verify authenticated tenant isolation and commit**

```bash
git add server/api/portal/measurement.get.ts app/pages/portal/measurement.vue test/server/api/portalMeasurementHealth.test.ts test/app/portalMeasurementSignalHealth.test.ts
git commit -m "feat: show client measurement signal health"
```

## Checkpoint C — operational visibility

- [ ] Summary, lineage, agency component, and portal tests pass.
- [ ] Agency users can explain captured, skipped, delivered, and failed counts.
- [ ] Portal users see only tenant-scoped aggregate health.
- [ ] Browser verification passes in light/dark mode and mobile/desktop widths.
- [ ] Redaction tests prove raw identifiers, PII, and credentials are absent.

---

## Gate 3 — product documentation and controlled pilot

### Task 15: Publish product and operator documentation

**Files:**

- Create: `docs/runbooks/werribee-tiktok-measurement-activation.md`
- Modify: `app/pages/features/index.vue`
- Modify: `app/pages/features/[slug].vue`
- Modify: `app/components/MarketingNav.vue`
- Create: `test/config/measurementMarketingPages.test.ts`

**Interfaces:**

- Runbook consumes the exact Gate 0–3 evidence and never embeds credentials.
- Marketing pages describe Signal Centre and privacy-safe server-side measurement.

- [ ] **Step 1: Add failing marketing content test**

Assert the feature index, detailed entry, and mega menu include the same stable
feature slug and do not claim guaranteed attribution or regulatory compliance.

- [ ] **Step 2: Write the activation runbook and public feature copy**

The runbook includes exact test, diagnostics, reconciliation, two-person approval,
seven-day soak, pause, and rollback steps.

- [ ] **Step 3: Verify and commit**

```bash
pnpm vitest run test/config/measurementMarketingPages.test.ts
git add docs/runbooks/werribee-tiktok-measurement-activation.md app/pages/features/index.vue 'app/pages/features/[slug].vue' app/components/MarketingNav.vue test/config/measurementMarketingPages.test.ts
git commit -m "docs: publish server-side measurement operations"
```

### Task 16: Battle-test the Werribee pilot in test mode

**Files:**

- Create: `scripts/verify-werribee-measurement.mjs`
- Create: `test/config/werribeeMeasurementReadinessScript.test.ts`
- Modify: `docs/runbooks/werribee-tiktok-measurement-activation.md`

**Interfaces:**

- Script performs read-only or synthetic-test checks only.
- Returns non-zero when consent, confirmed conversion, deduplication, destination
  health, or redaction gates fail.

- [ ] **Step 1: Add failing readiness-script contract tests**

```ts
expect(source).toContain('consentGranted')
expect(source).toContain('confirmedConversions')
expect(source).toContain('deduplication')
expect(source).toContain('destinationHealth')
expect(source).not.toContain('TIKTOK_ACCESS_TOKEN=')
```

- [ ] **Step 2: Implement deterministic readiness checks**

The script accepts `MEASUREMENT_BASE_URL`, `MEASUREMENT_CLIENT_ID`, and an
authorised test session source, prints aggregate PASS/FAIL checks, and never
prints response bodies containing identifiers.

- [ ] **Step 3: Run test-mode verification**

```bash
pnpm vitest run test/config/werribeeMeasurementReadinessScript.test.ts
node scripts/verify-werribee-measurement.mjs
```

- [ ] **Step 4: Record evidence and commit**

```bash
git add scripts/verify-werribee-measurement.mjs test/config/werribeeMeasurementReadinessScript.test.ts docs/runbooks/werribee-tiktok-measurement-activation.md
git commit -m "test: verify Werribee measurement readiness"
```

### Task 17: Complete release verification

**Files:**

- Modify only files required to fix failures caused by this feature, with a
  matching regression test in the same commit.

- [ ] **Step 1: Re-read every modified/new file end-to-end**

Check import aliases, provider/platform unions, constraint names, USelectMenu
values, computed reactivity, duplicate UI, colour construction, SSRF boundaries,
redaction, tenant scope, and test/live defaults.

- [ ] **Step 2: Run focused and full verification**

```bash
pnpm vitest run test/public/track-tag.test.ts test/server/utils/tracking test/server/utils/measurement test/workers/measurementDeliveryProviders.test.ts test/workers/measurementDeliveryProcessor.test.ts test/app/measurementSignalCentre.test.ts test/app/portalMeasurementSignalHealth.test.ts
pnpm run typecheck
pnpm run test:run
pnpm run build
pnpm run deploy:check
```

- [ ] **Step 3: Inspect the complete change set and secrets boundary**

```bash
git diff --check
git diff --stat
git diff --cached
```

Search staged content for credential-shaped values and inspect every match; do
not use the search result alone as proof that a reference is a secret.

- [ ] **Step 4: Commit any verification-only fix atomically**

For each fix, stage only the implementation file named by the failing test and
that test file, inspect the staged diff, then commit with:

```bash
git diff --cached
git commit -m "fix: harden measurement release verification"
```

Production deployment and live TikTok activation are intentionally excluded and
require the separate authorised runbook action.

## Dependency graph

```text
Task 1 consent bridge ─────────────┐
Task 2 identifier contract ─┬─────┼─> Task 4 canonical attribution ─┐
Task 3 identifier storage ───┘     └─> Task 5 confirmed success ─────┤
                                                                    v
Task 6 TikTok contracts -> Task 7 DB constraints -> Task 8 adapter -> Task 9 routing
                                                                    |
                                                                    v
                                                         Task 10 diagnostics
                                                                    |
                                 ┌──────────────────────────────────┘
                                 v
                    Task 11 summary -> Task 13 agency UI
                    Task 12 lineage -> Task 13 agency UI
                    Task 11 summary -> Task 14 portal UI
                                 |
                                 v
                     Task 15 docs -> Task 16 pilot -> Task 17 release
```

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Werribee form provider does not expose a browser callback | High | Use authoritative provider webhook/thank-you state and preserve browser event id in hidden attribution fields |
| Consent UI contract differs by CMP | High | Keep `xf.setConsent()` provider-neutral; add one small adapter per observed CMP after browser inspection |
| TikTok accepts HTTP request but degrades match quality | High | Persist receipt ids, reconcile Events Manager diagnostics, and gate live activation on test evidence |
| Browser and server ids diverge | High | Caller-owned event id, DOM tests, provider Test Events, and zero unexplained duplicates gate |
| At-least-once queue redelivery | High | Canonical idempotency plus provider event-id deduplication |
| Raw identity leaks into observability | High | Identifier-only event plane, redaction tests, in-memory hashing at the provider boundary |
| Dirty worktree overlaps measurement UI changes | Medium | Keep each task narrowly scoped, inspect pre-existing diffs before editing, and stage only task-owned files |
| Provider API changes | Medium | Isolated native adapter, official-doc contract tests, bounded version/config surface |
| Full Nuxt build memory pressure | Medium | Use repository 16 GB build command and focused tests during slices |

## PRD coverage check

| PRD requirement | Tasks |
|---|---|
| FR-1 consent bridge | 1 |
| FR-2 TikTok identity | 2–4 |
| FR-3 confirmed conversions | 4–5 |
| FR-4 canonical policy | 4, 6, 9 |
| FR-5 destination configuration | 6–7, 13 |
| FR-6 Events API delivery | 8–10 |
| FR-7 agency Signal Centre | 11–13 |
| FR-8 client portal | 14 |
| FR-9 diagnostics | 10–12 |
| FR-10 Werribee gates | 15–17 |
