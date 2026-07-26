# Phase B Funnel & Intent Signals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add six client-side funnel/intent tracking signals (cross-shop comparison, return-to-vehicle, VDP dwell time, exit-intent, wishlist/save, CTA/price visibility) to the public tracking tag, building on the vehicle-page detection Phase A already shipped.

**Architecture:** All six signals are additions to `public/track.js` (a single-file IIFE tag), following its existing conventions — module-level config vars overridable via `init({ constants: {...} })`, `_xf_*_v1`-named storage keys, and either enriching an existing generic event (`engagement`) or firing a new one gated through the existing `isEventAllowed()` consent check and `DATALAYER_EVENTS` GTM mapping. Three new event names need server-side allowlisting in `track-schema.ts`; everything else is client-only.

**Tech Stack:** Vanilla ES5-style JS (no build step — `track.js` ships as-is to dealer sites), Vitest + happy-dom for tests, Zod for the server-side event schema.

## Global Constraints

- No new backend infrastructure — events flow through the existing `POST /api/public/track` → `tracking_events` pipeline unchanged.
- `event_data` on the ingestion endpoint is freeform JSON (`z.record(z.string(), z.unknown())` in `server/utils/tracking/track-schema.ts:64`) — only event *names* need server-side allowlisting, never payload shape.
- Vehicle identity key is `vehicle_stock_number` if present, else `vehicle_slug`, else the signal doesn't fire — no true VIN is available (see design doc's Non-goals).
- All six signals are gated by a single new `data-funnel-signals="false"` opt-out, independent of the existing `data-behavioral` flag.
- Storage writes (localStorage/sessionStorage) happen unconditionally; only the `track()` send is consent-gated — this mirrors the existing first/last-touch attribution behavior.
- Design doc of record: `docs/superpowers/specs/2026-07-26-phase-b-funnel-intent-signals-design.md`.

---

## Task 1: Server schema — reserve the three new event names

**Files:**
- Modify: `server/utils/tracking/track-schema.ts:19-33`
- Test: `test/server/utils/tracking/track-schema.test.ts`

**Interfaces:**
- Produces: `TRACK_EVENT_NAMES` now includes `'vehicle_comparison'`, `'exit_intent'`, `'cta_visible'` — every later task's `track()` calls with these names will be accepted by `parseTrackPayload()` instead of rejected.

- [ ] **Step 1: Write the failing test**

Add to `test/server/utils/tracking/track-schema.test.ts` (append inside the existing `describe('parseTrackPayload', ...)` block, after the `'rejects an unknown event_name'` test):

```ts
  it('accepts the Phase B funnel-signal event names', () => {
    const names = ['vehicle_comparison', 'exit_intent', 'cta_visible']
    for (const name of names) {
      const r = parseTrackPayload({
        events: [{ ...valid.events[0], event_name: name }]
      })
      expect(r.ok).toBe(true)
    }
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run test/server/utils/tracking/track-schema.test.ts`
Expected: FAIL — `vehicle_comparison`/`exit_intent`/`cta_visible` rejected as invalid enum values.

- [ ] **Step 3: Write minimal implementation**

In `server/utils/tracking/track-schema.ts`, change:

```ts
export const TRACK_EVENT_NAMES = [
  // core behaviour (fire in Slice 1)
  'page_view', 'scroll', 'engagement', 'click', 'phone_click', 'outbound_click',
  'form_start', 'form_submit', 'form_abandonment', 'provider_interaction',
  // tag behavioural signals — dead_click is default-on; the rest fire only when
  // the tag's opt-in `behavioral` mode is enabled. Reserved so the endpoint never
  // 422-rejects a tag-emitted event (see public/track.js).
  'dead_click', 'rage_click', 'idle_start', 'idle_end', 'idle_extended',
  'form_field_timings',
  // reserved richer signals (Slice 3/4 — accepted now, may not fire yet)
  'vehicle_view', 'vehicle_list_view', 'search', 'filter_change',
  'finance_calculator_interact', 'trade_in_start', 'trade_in_complete',
  'test_drive_booking', 'add_to_wishlist', 'video_play', 'video_progress',
  'return_to_vehicle', 'competitive_referrer', 'generate_lead'
] as const
```

to:

```ts
export const TRACK_EVENT_NAMES = [
  // core behaviour (fire in Slice 1)
  'page_view', 'scroll', 'engagement', 'click', 'phone_click', 'outbound_click',
  'form_start', 'form_submit', 'form_abandonment', 'provider_interaction',
  // tag behavioural signals — dead_click is default-on; the rest fire only when
  // the tag's opt-in `behavioral` mode is enabled. Reserved so the endpoint never
  // 422-rejects a tag-emitted event (see public/track.js).
  'dead_click', 'rage_click', 'idle_start', 'idle_end', 'idle_extended',
  'form_field_timings',
  // reserved richer signals (Slice 3/4 — accepted now, may not fire yet)
  'vehicle_view', 'vehicle_list_view', 'search', 'filter_change',
  'finance_calculator_interact', 'trade_in_start', 'trade_in_complete',
  'test_drive_booking', 'add_to_wishlist', 'video_play', 'video_progress',
  'return_to_vehicle', 'competitive_referrer', 'generate_lead',
  // Phase B funnel & intent signals — fire only when the tag's opt-in
  // `funnelSignals` mode is enabled (see public/track.js).
  'vehicle_comparison', 'exit_intent', 'cta_visible'
] as const
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run test/server/utils/tracking/track-schema.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/utils/tracking/track-schema.ts test/server/utils/tracking/track-schema.test.ts
git commit -m "feat(tracking): reserve Phase B funnel-signal event names"
```

---

## Task 2: Funnel-signals flag + return-to-vehicle tracking

**Files:**
- Modify: `public/track.js` (config vars near line 12-27; `isEventAllowed` near line 384; `getVehicleContext`/`trackPageView` region near line 693-789; `init()` near line 1467-1629; boot config near line 1655-1690)
- Test: `test/public/track-tag.test.ts`

**Interfaces:**
- Consumes: `getVehicleContext()` (existing, returns `{ vehicle_stock_number?, vehicle_slug?, ... } | null`), `track(eventName, eventData)` (existing).
- Produces: `vehicleKey(ctx)` → `string | null` (used by Tasks 3, 5), module var `_funnelSignalsEnabled` (used by Tasks 4, 5, 6, 7), `config.funnelSignals` / `data-funnel-signals` opt-out (used by Tasks 5, 6, 7 to gate their `setupXxx()` calls in `init()`), `RETURN_TO_VEHICLE_MIN_DAYS` (overridable via `c.returnToVehicleMinDays`).

- [ ] **Step 1: Write the failing tests**

Add a new describe block to the end of `test/public/track-tag.test.ts`, before the final closing `})` of the file:

```ts
describe('Phase B funnel & intent signals', () => {
  let beacons: { url: string, body: string }[]
  let requests: { url: string, body: string }[]
  let fetchSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    document.head.innerHTML = ''
    document.body.innerHTML = ''
    window.history.replaceState({}, '', '/')
    beacons = []
    requests = []
    ;(navigator as any).sendBeacon = vi.fn((url: string, blob: any) => {
      beacons.push({ url, body: blob?._body ?? '' })
      return true
    })
    const RealBlob = globalThis.Blob
    ;(globalThis as any).Blob = class extends RealBlob {
      _body: string
      constructor(parts: any[], opts: any) {
        super(parts, opts)
        this._body = String(parts?.[0] ?? '')
      }
    }
    fetchSpy = vi.fn((url: string, options?: RequestInit) => {
      if (options?.method === 'POST') {
        requests.push({ url: String(url), body: String(options.body ?? '') })
      }
      return Promise.resolve({ ok: true })
    })
    vi.stubGlobal('fetch', fetchSpy)
    document.cookie = '_xf_consent=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
    localStorage.clear()
    sessionStorage.clear()
  })

  function eventsFrom(reqs: { body: string }[]) {
    return reqs.flatMap(r => JSON.parse(r.body).events)
  }

  it('does not fire return_to_vehicle on a vehicle\'s first-ever visit', () => {
    window.history.pushState({}, '', '/cars/used-black-2021-mercedes-benz-v-class-s20544')
    loadTag()
    ;(window as any).xf.init({ writeKey: 'TESTKEY' })

    const events = eventsFrom(requests)
    expect(events.find((e: any) => e.event_name === 'return_to_vehicle')).toBeUndefined()
    const visits = JSON.parse(localStorage.getItem('_xf_vehicle_visits_v1') || '{}')
    expect(visits['20544']).toBeTruthy()
  })

  it('fires return_to_vehicle when the same vehicle is revisited outside the session window', () => {
    window.history.pushState({}, '', '/cars/used-black-2021-mercedes-benz-v-class-s20544')
    loadTag()
    ;(window as any).xf.init({ writeKey: 'TESTKEY', spa: true, constants: { sessionMinutes: 30 } })

    const visits = JSON.parse(localStorage.getItem('_xf_vehicle_visits_v1') || '{}')
    visits['20544'] = Date.now() - 31 * 60 * 1000
    localStorage.setItem('_xf_vehicle_visits_v1', JSON.stringify(visits))
    requests = []

    window.history.pushState({}, '', '/cars/used-black-2021-mercedes-benz-v-class-s20544')

    const returnEvent = eventsFrom(requests).find((e: any) => e.event_name === 'return_to_vehicle')
    expect(returnEvent).toBeTruthy()
    expect(returnEvent.event_data.vehicle_key).toBe('20544')
    expect(returnEvent.event_data.days_since_last_visit).toBe(0)
  })

  it('does not fire return_to_vehicle when the same vehicle is revisited within the session window', () => {
    window.history.pushState({}, '', '/cars/used-black-2021-mercedes-benz-v-class-s20544')
    loadTag()
    ;(window as any).xf.init({ writeKey: 'TESTKEY', spa: true, constants: { sessionMinutes: 30 } })
    requests = []

    window.history.pushState({}, '', '/cars/used-black-2021-mercedes-benz-v-class-s20544')

    expect(eventsFrom(requests).find((e: any) => e.event_name === 'return_to_vehicle')).toBeUndefined()
  })

  it('respects returnToVehicleMinDays before firing return_to_vehicle', () => {
    window.history.pushState({}, '', '/cars/used-black-2021-mercedes-benz-v-class-s20544')
    loadTag()
    ;(window as any).xf.init({
      writeKey: 'TESTKEY',
      spa: true,
      constants: { sessionMinutes: 30, returnToVehicleMinDays: 2 }
    })

    const visits = JSON.parse(localStorage.getItem('_xf_vehicle_visits_v1') || '{}')
    visits['20544'] = Date.now() - 31 * 60 * 1000 // new session, but < 2 days
    localStorage.setItem('_xf_vehicle_visits_v1', JSON.stringify(visits))
    requests = []

    window.history.pushState({}, '', '/cars/used-black-2021-mercedes-benz-v-class-s20544')

    expect(eventsFrom(requests).find((e: any) => e.event_name === 'return_to_vehicle')).toBeUndefined()
  })

  it('data-funnel-signals="false" suppresses return_to_vehicle', () => {
    const script = document.createElement('script')
    document.head.appendChild(script)
    Object.defineProperty(script, 'src', { value: 'https://app.xeroflow.io/track.js' })
    script.setAttribute('data-key', 'TESTKEY')
    script.setAttribute('data-funnel-signals', 'false')
    const currentScript = vi.spyOn(document, 'currentScript', 'get').mockReturnValue(script)

    window.history.pushState({}, '', '/cars/used-black-2021-mercedes-benz-v-class-s20544')
    loadTag()
    const visits = JSON.parse(localStorage.getItem('_xf_vehicle_visits_v1') || '{}')
    expect(visits).toEqual({})

    currentScript.mockRestore()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run test/public/track-tag.test.ts -t "funnel"`
Expected: FAIL — `_xf_vehicle_visits_v1` is never written, `return_to_vehicle` never fires, `data-funnel-signals` attribute is ignored.

- [ ] **Step 3: Add the config vars and flag**

In `public/track.js`, in the defaults block (currently ending at `var IDLE_ACTIVITY_DEBOUNCE_MS = 500`), add:

```js
  var IDLE_ACTIVITY_DEBOUNCE_MS = 500
  var RETURN_TO_VEHICLE_MIN_DAYS = 0
  var _funnelSignalsEnabled = true
```

- [ ] **Step 4: Add the storage helpers and vehicleKey, right after `getVehicleContext()`**

`getVehicleContext()` currently ends with `return Object.keys(ctx).length > 0 ? ctx : null` followed by `}`, right before `// Auto-track page views` / `function trackPageView() {`. Insert between them:

```js
  var VEHICLE_VISITS_STORAGE_KEY = '_xf_vehicle_visits_v1'
  var VEHICLE_VISITS_MAX_ENTRIES = 50

  function vehicleKey(ctx) {
    if (!ctx) return null
    return ctx.vehicle_stock_number || ctx.vehicle_slug || null
  }

  function readVehicleVisits() {
    try {
      var raw = localStorage.getItem(VEHICLE_VISITS_STORAGE_KEY)
      return raw ? JSON.parse(raw) : {}
    } catch (e) {
      return {}
    }
  }

  function writeVehicleVisits(visits) {
    try {
      var keys = Object.keys(visits)
      if (keys.length > VEHICLE_VISITS_MAX_ENTRIES) {
        keys.sort(function (a, b) { return visits[a] - visits[b] })
        var toRemove = keys.slice(0, keys.length - VEHICLE_VISITS_MAX_ENTRIES)
        for (var i = 0; i < toRemove.length; i++) delete visits[toRemove[i]]
      }
      localStorage.setItem(VEHICLE_VISITS_STORAGE_KEY, JSON.stringify(visits))
    } catch (e) {
      /* storage unavailable or full — ignore */
    }
  }

  // Fires return_to_vehicle when the same vehicle (by stock number/slug) was
  // last seen in an earlier session — the strongest single purchase-intent
  // signal in automotive retargeting. Always records the visit regardless of
  // whether the event fires, so the *next* visit's gap is measured correctly.
  function trackReturnToVehicle(vehicleCtx) {
    var key = vehicleKey(vehicleCtx)
    if (!key) return
    var visits = readVehicleVisits()
    var lastSeen = visits[key]
    if (lastSeen) {
      var elapsedMs = Date.now() - lastSeen
      var isNewSession = elapsedMs > SESSION_MINUTES * 60 * 1000
      var daysSince = Math.floor(elapsedMs / 86400000)
      if (isNewSession && daysSince >= RETURN_TO_VEHICLE_MIN_DAYS) {
        track('return_to_vehicle', { vehicle_key: key, days_since_last_visit: daysSince })
      }
    }
    visits[key] = Date.now()
    writeVehicleVisits(visits)
  }
```

- [ ] **Step 5: Hook `trackReturnToVehicle` into `trackPageView()`**

Change:

```js
    track('page_view', data)

    // Fire separate vehicle_view for dynamic remarketing (maps to view_item in dataLayer)
    if (vehicleCtx) {
      track('vehicle_view', vehicleCtx)
    }
  }
```

to:

```js
    track('page_view', data)

    // Fire separate vehicle_view for dynamic remarketing (maps to view_item in dataLayer)
    if (vehicleCtx) {
      track('vehicle_view', vehicleCtx)
      if (_funnelSignalsEnabled) {
        trackReturnToVehicle(vehicleCtx)
      }
    }
  }
```

- [ ] **Step 6: Wire the config override and boot flag into `init()`**

Change (the last line of the `c.` overrides block):

```js
    if (c.idleActivityDebounceMs) IDLE_ACTIVITY_DEBOUNCE_MS = c.idleActivityDebounceMs
```

to:

```js
    if (c.idleActivityDebounceMs) IDLE_ACTIVITY_DEBOUNCE_MS = c.idleActivityDebounceMs
    if (c.returnToVehicleMinDays !== undefined) RETURN_TO_VEHICLE_MIN_DAYS = c.returnToVehicleMinDays
    if (config.funnelSignals === false) _funnelSignalsEnabled = false
```

- [ ] **Step 7: Add the `data-funnel-signals` boot attribute**

Change:

```js
      var bootCfg = {
        writeKey: bootWriteKey,
        spa: script.getAttribute('data-spa') === 'true',
        behavioral: script.getAttribute('data-behavioral') !== 'false',
      }
```

to:

```js
      var bootCfg = {
        writeKey: bootWriteKey,
        spa: script.getAttribute('data-spa') === 'true',
        behavioral: script.getAttribute('data-behavioral') !== 'false',
        funnelSignals: script.getAttribute('data-funnel-signals') !== 'false',
      }
```

- [ ] **Step 8: Add the (still-empty) funnel-signals setup block to `init()`**

This block is empty for now — Tasks 5, 6, 7 each add one line to it. Change:

```js
    // Behavioral signals (rage clicks, video engagement, idle/return, form
    // field timing) — on by default, like every other auto-tracked category.
    // Opt out with data-behavioral="false" on the script tag.
    if (config.behavioral !== false) {
      setupRageClickDetection()
      setupVideoTracking()
      setupIdleDetection()
      setupFormFieldTracking()
    }
  }
```

to:

```js
    // Behavioral signals (rage clicks, video engagement, idle/return, form
    // field timing) — on by default, like every other auto-tracked category.
    // Opt out with data-behavioral="false" on the script tag.
    if (config.behavioral !== false) {
      setupRageClickDetection()
      setupVideoTracking()
      setupIdleDetection()
      setupFormFieldTracking()
    }

    // Phase B funnel & intent signals — cross-shop, return-to-vehicle, and
    // VDP dwell hook directly into trackPageView()/setupEngagementTracking()
    // and are gated by _funnelSignalsEnabled instead of a setup call here.
    // On by default. Opt out with data-funnel-signals="false".
    if (_funnelSignalsEnabled) {
    }
  }
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `pnpm exec vitest run test/public/track-tag.test.ts -t "funnel"`
Expected: PASS (5 tests)

- [ ] **Step 10: Run the full existing tag test file to confirm no regressions**

Run: `pnpm exec vitest run test/public/track-tag.test.ts`
Expected: PASS (all tests, existing + new)

- [ ] **Step 11: Commit**

```bash
git add public/track.js test/public/track-tag.test.ts
git commit -m "feat(tracking): add return-to-vehicle detection and the funnel-signals flag"
```

---

## Task 3: Cross-shop / comparison-set tracking

**Files:**
- Modify: `public/track.js` (`isEventAllowed`, `DATALAYER_EVENTS`, the vehicle-key helpers region from Task 2, `trackPageView`, `init()`'s `c.` overrides block)
- Test: `test/public/track-tag.test.ts`

**Interfaces:**
- Consumes: `vehicleKey(ctx)`, `_funnelSignalsEnabled` (Task 2).
- Produces: `trackCrossShop(vehicleCtx)` (not consumed elsewhere), `COMPARISON_THRESHOLDS` (overridable via `c.comparisonThresholds`).

- [ ] **Step 1: Write the failing tests**

Add to the `describe('Phase B funnel & intent signals', ...)` block from Task 2:

```ts
  it('fires vehicle_comparison when the distinct-vehicle count crosses a threshold', () => {
    window.history.pushState({}, '', '/cars/used-black-2021-mercedes-benz-v-class-s20544')
    loadTag()
    ;(window as any).xf.init({ writeKey: 'TESTKEY', spa: true })
    requests = []

    window.history.pushState({}, '', '/cars/used-white-2019-toyota-kluger-s20825')

    const comparisonEvent = eventsFrom(requests).find((e: any) => e.event_name === 'vehicle_comparison')
    expect(comparisonEvent).toBeTruthy()
    expect(comparisonEvent.event_data.distinct_vehicles_viewed).toBe(2)
    expect(comparisonEvent.event_data.vehicle_keys).toEqual(['20544', '20825'])
  })

  it('does not re-fire vehicle_comparison for a vehicle already seen this session', () => {
    window.history.pushState({}, '', '/cars/used-black-2021-mercedes-benz-v-class-s20544')
    loadTag()
    ;(window as any).xf.init({ writeKey: 'TESTKEY', spa: true })
    requests = []

    window.history.pushState({}, '', '/cars/used-black-2021-mercedes-benz-v-class-s20544')

    expect(eventsFrom(requests).find((e: any) => e.event_name === 'vehicle_comparison')).toBeUndefined()
  })

  it('respects a comparisonThresholds override', () => {
    window.history.pushState({}, '', '/cars/used-black-2021-mercedes-benz-v-class-s20544')
    loadTag()
    ;(window as any).xf.init({ writeKey: 'TESTKEY', constants: { comparisonThresholds: [1] } })

    const comparisonEvent = eventsFrom(requests).find((e: any) => e.event_name === 'vehicle_comparison')
    expect(comparisonEvent).toBeTruthy()
    expect(comparisonEvent.event_data.distinct_vehicles_viewed).toBe(1)
  })

  it('does not send vehicle_comparison when analytics consent is declined', () => {
    document.cookie = '_xf_consent=' + encodeURIComponent(JSON.stringify({
      tracking: true, analytics: false, marketing: false, updatedAt: '2026-07-24T00:00:00Z'
    })) + '; path=/'
    window.history.pushState({}, '', '/cars/used-black-2021-mercedes-benz-v-class-s20544')
    loadTag()
    ;(window as any).xf.init({ writeKey: 'TESTKEY', spa: true })
    requests = []

    window.history.pushState({}, '', '/cars/used-white-2019-toyota-kluger-s20825')

    expect(eventsFrom(requests).find((e: any) => e.event_name === 'vehicle_comparison')).toBeUndefined()
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run test/public/track-tag.test.ts -t "vehicle_comparison\|comparisonThresholds"`
Expected: FAIL — `vehicle_comparison` never fires.

- [ ] **Step 3: Add the session-vehicles storage and cross-shop tracker**

Right after Task 2's `trackReturnToVehicle` function (still before `trackPageView()`), add:

```js
  var SESSION_VEHICLES_STORAGE_KEY = '_xf_session_vehicles_v1'
  var SESSION_VEHICLES_MAX_ENTRIES = 20
  var COMPARISON_THRESHOLDS = [2, 3, 5]

  function readSessionVehicles() {
    try {
      var raw = sessionStorage.getItem(SESSION_VEHICLES_STORAGE_KEY)
      return raw ? JSON.parse(raw) : []
    } catch (e) {
      return []
    }
  }

  // Fires vehicle_comparison when the count of distinct vehicles viewed this
  // session crosses a configured threshold — "viewed 3+ mid-size SUVs" is a
  // materially better retargeting signal than "visited the site."
  function trackCrossShop(vehicleCtx) {
    var key = vehicleKey(vehicleCtx)
    if (!key) return
    var vehicles = readSessionVehicles()
    if (vehicles.indexOf(key) !== -1) return
    vehicles.push(key)
    if (vehicles.length > SESSION_VEHICLES_MAX_ENTRIES) vehicles.shift()
    try {
      sessionStorage.setItem(SESSION_VEHICLES_STORAGE_KEY, JSON.stringify(vehicles))
    } catch (e) {
      /* storage unavailable or full — ignore */
    }
    if (COMPARISON_THRESHOLDS.indexOf(vehicles.length) !== -1) {
      track('vehicle_comparison', {
        distinct_vehicles_viewed: vehicles.length,
        vehicle_keys: vehicles.slice(-10)
      })
    }
  }
```

- [ ] **Step 4: Hook `trackCrossShop` into `trackPageView()`**

Change:

```js
    if (vehicleCtx) {
      track('vehicle_view', vehicleCtx)
      if (_funnelSignalsEnabled) {
        trackReturnToVehicle(vehicleCtx)
      }
    }
  }
```

to:

```js
    if (vehicleCtx) {
      track('vehicle_view', vehicleCtx)
      if (_funnelSignalsEnabled) {
        trackReturnToVehicle(vehicleCtx)
        trackCrossShop(vehicleCtx)
      }
    }
  }
```

- [ ] **Step 5: Add the `comparisonThresholds` override**

Change (from Task 2's Step 6):

```js
    if (c.returnToVehicleMinDays !== undefined) RETURN_TO_VEHICLE_MIN_DAYS = c.returnToVehicleMinDays
    if (config.funnelSignals === false) _funnelSignalsEnabled = false
```

to:

```js
    if (c.returnToVehicleMinDays !== undefined) RETURN_TO_VEHICLE_MIN_DAYS = c.returnToVehicleMinDays
    if (c.comparisonThresholds) COMPARISON_THRESHOLDS = c.comparisonThresholds
    if (config.funnelSignals === false) _funnelSignalsEnabled = false
```

- [ ] **Step 6: Add `vehicle_comparison` to the analytics consent bucket**

In `isEventAllowed()`, change:

```js
    var analyticsEvents = [
      'vehicle_view',
      'vehicle_list_view',
      'search',
      'filter_change',
      'form_engagement',
      'media_interaction',
      'cta_click',
      'vehicle_comparison',
      'rage_click',
      'video_depth',
      'idle_extended',
      'form_field_focus',
      'form_abandonment',
    ]
```

Note: `'vehicle_comparison'` is already present in this list (a pre-existing placeholder for this exact feature) — verify it's there and leave it unchanged. If Step 1's test still fails after Step 6, check `TRACK_EVENT_NAMES` from Task 1 was applied — this is the more likely cause, not this list.

- [ ] **Step 7: Add the `vehicle_comparison` dataLayer mapping**

In `DATALAYER_EVENTS`, change:

```js
    return_to_vehicle: 'return_to_vehicle',
    competitive_referrer: 'competitive_referrer',
    vdp_scroll_depth: 'vdp_scroll_depth',
  }
```

to:

```js
    return_to_vehicle: 'return_to_vehicle',
    competitive_referrer: 'competitive_referrer',
    vdp_scroll_depth: 'vdp_scroll_depth',
    vehicle_comparison: 'vehicle_comparison',
  }
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `pnpm exec vitest run test/public/track-tag.test.ts -t "vehicle_comparison\|comparisonThresholds"`
Expected: PASS (4 tests)

- [ ] **Step 9: Run the full tag test file**

Run: `pnpm exec vitest run test/public/track-tag.test.ts`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add public/track.js test/public/track-tag.test.ts
git commit -m "feat(tracking): add cross-shop comparison-set tracking"
```

---

## Task 4: VDP dwell time — enrich the engagement event with vehicle context

**Files:**
- Modify: `public/track.js:1157-1172` (`setupEngagementTracking`)
- Test: `test/public/track-tag.test.ts`

**Interfaces:**
- Consumes: `getVehicleContext()`, `_funnelSignalsEnabled` (Task 2).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the failing test**

Add to the `describe('Phase B funnel & intent signals', ...)` block:

```ts
  it('merges vehicle context into the engagement event on a vehicle page', async () => {
    window.history.pushState({}, '', '/cars/used-black-2021-mercedes-benz-v-class-s20544')
    loadTag()
    ;(window as any).xf.init({
      writeKey: 'TESTKEY',
      constants: { engagementIntervals: [0], engagementCheckMs: 10 }
    })
    requests = []

    await vi.waitFor(() => {
      expect(eventsFrom(requests).some((e: any) => e.event_name === 'engagement')).toBe(true)
    })

    const engagementEvent = eventsFrom(requests).find((e: any) => e.event_name === 'engagement')
    expect(engagementEvent.event_data.vehicle_stock_number).toBe('20544')
    expect(engagementEvent.event_data.duration).toBe(0)
  })

  it('does not merge vehicle context into engagement off a vehicle page', async () => {
    window.history.pushState({}, '', '/about-us')
    loadTag()
    ;(window as any).xf.init({
      writeKey: 'TESTKEY',
      constants: { engagementIntervals: [0], engagementCheckMs: 10 }
    })
    requests = []

    await vi.waitFor(() => {
      expect(eventsFrom(requests).some((e: any) => e.event_name === 'engagement')).toBe(true)
    })

    const engagementEvent = eventsFrom(requests).find((e: any) => e.event_name === 'engagement')
    expect(engagementEvent.event_data.vehicle_stock_number).toBeUndefined()
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run test/public/track-tag.test.ts -t "engagement"`
Expected: FAIL — `engagement` payload has no `vehicle_stock_number` field.

- [ ] **Step 3: Enrich the engagement payload**

Change:

```js
  // Track time on page
  function setupEngagementTracking() {
    var startTime = Date.now()
    var intervals = ENGAGEMENT_INTERVALS
    var tracked = {}

    _engagementInterval = setInterval(function () {
      var elapsed = Math.floor((Date.now() - startTime) / 1000)
      for (var i = 0; i < intervals.length; i++) {
        var interval = intervals[i]
        if (elapsed >= interval && !tracked[interval]) {
          tracked[interval] = true
          track('engagement', { duration: interval })
        }
      }
    }, ENGAGEMENT_CHECK_MS)
  }
```

to:

```js
  // Track time on page
  function setupEngagementTracking() {
    var startTime = Date.now()
    var intervals = ENGAGEMENT_INTERVALS
    var tracked = {}

    _engagementInterval = setInterval(function () {
      var elapsed = Math.floor((Date.now() - startTime) / 1000)
      for (var i = 0; i < intervals.length; i++) {
        var interval = intervals[i]
        if (elapsed >= interval && !tracked[interval]) {
          tracked[interval] = true
          var data = { duration: interval }
          // VDP dwell time: distinct from generic engagement only in that it
          // carries vehicle context, letting downstream queries filter for
          // "time actually spent on a vehicle detail page."
          if (_funnelSignalsEnabled) {
            var vehicleCtx = getVehicleContext()
            if (vehicleCtx) {
              for (var key in vehicleCtx) {
                if (vehicleCtx.hasOwnProperty(key)) data[key] = vehicleCtx[key]
              }
            }
          }
          track('engagement', data)
        }
      }
    }, ENGAGEMENT_CHECK_MS)
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run test/public/track-tag.test.ts -t "engagement"`
Expected: PASS (2 new tests)

- [ ] **Step 5: Run the full tag test file**

Run: `pnpm exec vitest run test/public/track-tag.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add public/track.js test/public/track-tag.test.ts
git commit -m "feat(tracking): merge vehicle context into engagement events for VDP dwell time"
```

---

## Task 5: Exit-intent detection

**Files:**
- Modify: `public/track.js` (`isEventAllowed`, `DATALAYER_EVENTS`, new `setupExitIntentDetection()` function, `init()`'s funnel-signals block from Task 2)
- Test: `test/public/track-tag.test.ts`

**Interfaces:**
- Consumes: `getVehicleContext()`, `vehicleKey(ctx)` (Task 2), `_funnelSignalsEnabled` (Task 2).
- Produces: `setupExitIntentDetection()`, called from `init()`'s funnel-signals block.

- [ ] **Step 1: Write the failing tests**

Add to the `describe('Phase B funnel & intent signals', ...)` block:

```ts
  it('fires exit_intent once on an upward mouseout past the top of the viewport', () => {
    window.history.pushState({}, '', '/cars/used-black-2021-mercedes-benz-v-class-s20544')
    loadTag()
    ;(window as any).xf.init({ writeKey: 'TESTKEY' })
    requests = []

    document.dispatchEvent(new MouseEvent('mouseout', { clientY: -1, relatedTarget: null }))
    document.dispatchEvent(new MouseEvent('mouseout', { clientY: -1, relatedTarget: null }))

    const exitEvents = eventsFrom(requests).filter((e: any) => e.event_name === 'exit_intent')
    expect(exitEvents).toHaveLength(1)
    expect(exitEvents[0].event_data.is_vehicle_page).toBe(true)
    expect(exitEvents[0].event_data.vehicle_key).toBe('20544')
    expect(exitEvents[0].event_data.path).toBe('/cars/used-black-2021-mercedes-benz-v-class-s20544')
  })

  it('does not fire exit_intent for a mouseout that stays inside the viewport', () => {
    loadTag()
    ;(window as any).xf.init({ writeKey: 'TESTKEY' })
    requests = []

    const child = document.createElement('div')
    document.body.appendChild(child)
    document.dispatchEvent(new MouseEvent('mouseout', { clientY: 50, relatedTarget: child }))

    expect(eventsFrom(requests).find((e: any) => e.event_name === 'exit_intent')).toBeUndefined()
  })

  it('data-funnel-signals="false" suppresses exit_intent', () => {
    const script = document.createElement('script')
    document.head.appendChild(script)
    Object.defineProperty(script, 'src', { value: 'https://app.xeroflow.io/track.js' })
    script.setAttribute('data-key', 'TESTKEY')
    script.setAttribute('data-funnel-signals', 'false')
    const currentScript = vi.spyOn(document, 'currentScript', 'get').mockReturnValue(script)

    loadTag()
    requests = []
    document.dispatchEvent(new MouseEvent('mouseout', { clientY: -1, relatedTarget: null }))

    expect(eventsFrom(requests).find((e: any) => e.event_name === 'exit_intent')).toBeUndefined()

    currentScript.mockRestore()
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run test/public/track-tag.test.ts -t "exit_intent"`
Expected: FAIL — `exit_intent` never fires (function doesn't exist yet).

- [ ] **Step 3: Add `setupExitIntentDetection()`**

Add this function near the other `setupXxxTracking`/`setupXxxDetection` functions — immediately after `trackCrossShop` (from Task 3) and before `trackPageView()`:

```js
  var EXIT_INTENT_SESSION_KEY = '_xf_exit_intent_fired_v1'

  // Desktop-only (mouse trajectory has no reliable mobile equivalent).
  // Debounced to once per session via a sessionStorage flag, not the
  // comparison-set list, since it's unrelated to which vehicles were viewed.
  function setupExitIntentDetection() {
    document.addEventListener('mouseout', function (e) {
      if (e.clientY > 0 || e.relatedTarget !== null) return
      try {
        if (sessionStorage.getItem(EXIT_INTENT_SESSION_KEY)) return
        sessionStorage.setItem(EXIT_INTENT_SESSION_KEY, '1')
      } catch (err) {
        /* storage unavailable — fall through, worst case a duplicate fire */
      }
      var vehicleCtx = getVehicleContext()
      track('exit_intent', {
        path: window.location.pathname,
        is_vehicle_page: !!vehicleCtx,
        vehicle_key: vehicleKey(vehicleCtx)
      })
    })
  }
```

- [ ] **Step 4: Call it from `init()`'s funnel-signals block**

Change (from Task 2's Step 8):

```js
    if (_funnelSignalsEnabled) {
    }
  }
```

to:

```js
    if (_funnelSignalsEnabled) {
      setupExitIntentDetection()
    }
  }
```

- [ ] **Step 5: Add `exit_intent` to the analytics consent bucket**

In `isEventAllowed()`, change:

```js
      'vehicle_comparison',
      'rage_click',
      'video_depth',
      'idle_extended',
      'form_field_focus',
      'form_abandonment',
    ]
```

to:

```js
      'vehicle_comparison',
      'rage_click',
      'video_depth',
      'idle_extended',
      'form_field_focus',
      'form_abandonment',
      'exit_intent',
    ]
```

- [ ] **Step 6: Add the `exit_intent` dataLayer mapping**

In `DATALAYER_EVENTS`, change:

```js
    vdp_scroll_depth: 'vdp_scroll_depth',
    vehicle_comparison: 'vehicle_comparison',
  }
```

to:

```js
    vdp_scroll_depth: 'vdp_scroll_depth',
    vehicle_comparison: 'vehicle_comparison',
    exit_intent: 'exit_intent',
  }
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm exec vitest run test/public/track-tag.test.ts -t "exit_intent"`
Expected: PASS (3 tests)

- [ ] **Step 8: Run the full tag test file**

Run: `pnpm exec vitest run test/public/track-tag.test.ts`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add public/track.js test/public/track-tag.test.ts
git commit -m "feat(tracking): add exit-intent detection"
```

---

## Task 6: Wishlist / save tracking

**Files:**
- Modify: `public/track.js` (new `setupWishlistTracking()` function, `init()`'s funnel-signals block)
- Test: `test/public/track-tag.test.ts`

**Interfaces:**
- Consumes: `getVehicleContext()`, `track()`, `_funnelSignalsEnabled` (Task 2). Reuses the already-reserved `add_to_wishlist` event name — no `TRACK_EVENT_NAMES`, `isEventAllowed`, or `DATALAYER_EVENTS` changes needed (all three already list it).
- Produces: `setupWishlistTracking()`, called from `init()`'s funnel-signals block.

- [ ] **Step 1: Write the failing tests**

Add to the `describe('Phase B funnel & intent signals', ...)` block. `add_to_wishlist` requires marketing consent per the existing `isEventAllowed()` `marketingEvents` bucket, so these tests set that consent explicitly:

```ts
  function withMarketingConsent() {
    document.cookie = '_xf_consent=' + encodeURIComponent(JSON.stringify({
      tracking: true, analytics: true, marketing: true, updatedAt: '2026-07-24T00:00:00Z'
    })) + '; path=/'
  }

  it('fires add_to_wishlist when a wishlist-classed element is clicked', () => {
    withMarketingConsent()
    window.history.pushState({}, '', '/cars/used-black-2021-mercedes-benz-v-class-s20544')
    const button = document.createElement('button')
    button.className = 'wishlist'
    document.body.appendChild(button)

    loadTag()
    ;(window as any).xf.init({ writeKey: 'TESTKEY' })
    requests = []

    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    const wishlistEvent = eventsFrom(requests).find((e: any) => e.event_name === 'add_to_wishlist')
    expect(wishlistEvent).toBeTruthy()
    expect(wishlistEvent.event_data.vehicle_stock_number).toBe('20544')
  })

  it('fires add_to_wishlist for an aria-label match on a nested icon click', () => {
    withMarketingConsent()
    const wrapper = document.createElement('button')
    wrapper.setAttribute('aria-label', 'Save to Favourites')
    const icon = document.createElement('span')
    icon.className = 'icon-heart'
    wrapper.appendChild(icon)
    document.body.appendChild(wrapper)

    loadTag()
    ;(window as any).xf.init({ writeKey: 'TESTKEY' })
    requests = []

    icon.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(eventsFrom(requests).find((e: any) => e.event_name === 'add_to_wishlist')).toBeTruthy()
  })

  it('does not fire add_to_wishlist for an unrelated click', () => {
    withMarketingConsent()
    const button = document.createElement('button')
    button.textContent = 'Contact us'
    document.body.appendChild(button)

    loadTag()
    ;(window as any).xf.init({ writeKey: 'TESTKEY' })
    requests = []

    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(eventsFrom(requests).find((e: any) => e.event_name === 'add_to_wishlist')).toBeUndefined()
  })

  it('data-funnel-signals="false" suppresses add_to_wishlist', () => {
    withMarketingConsent()
    const script = document.createElement('script')
    document.head.appendChild(script)
    Object.defineProperty(script, 'src', { value: 'https://app.xeroflow.io/track.js' })
    script.setAttribute('data-key', 'TESTKEY')
    script.setAttribute('data-funnel-signals', 'false')
    const currentScript = vi.spyOn(document, 'currentScript', 'get').mockReturnValue(script)

    const button = document.createElement('button')
    button.className = 'wishlist'
    document.body.appendChild(button)

    loadTag()
    requests = []
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(eventsFrom(requests).find((e: any) => e.event_name === 'add_to_wishlist')).toBeUndefined()

    currentScript.mockRestore()
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run test/public/track-tag.test.ts -t "add_to_wishlist"`
Expected: FAIL — `add_to_wishlist` never fires (function doesn't exist yet).

- [ ] **Step 3: Add `setupWishlistTracking()`**

Add this function immediately after `setupExitIntentDetection` (Task 5) and before `trackPageView()`:

```js
  var WISHLIST_SELECTORS = ['[data-wishlist]', '.wishlist', '.favourite', '.save-vehicle']
  var WISHLIST_LABEL_RE = /wishlist|favou?rite|save/i

  function isWishlistElement(el) {
    for (var i = 0; i < WISHLIST_SELECTORS.length; i++) {
      if (el.matches && el.matches(WISHLIST_SELECTORS[i])) return true
    }
    var label = el.getAttribute ? (el.getAttribute('aria-label') || '') : ''
    return WISHLIST_LABEL_RE.test(label)
  }

  // Heuristic detector for save/heart icons near vehicle cards — no dealer
  // CMS convention exists across sites, so this matches a selector list plus
  // aria-label keywords, mirroring the CTA-keyword heuristic in
  // pushToDataLayer(). Walks up to 5 ancestors, matching the phone_click
  // delegation pattern.
  function setupWishlistTracking() {
    document.addEventListener('click', function (e) {
      var target = e.target
      for (var i = 0; i < 5; i++) {
        if (!target) break
        if (isWishlistElement(target)) {
          var vehicleCtx = getVehicleContext()
          var data = {}
          if (vehicleCtx) {
            for (var key in vehicleCtx) {
              if (vehicleCtx.hasOwnProperty(key)) data[key] = vehicleCtx[key]
            }
          }
          track('add_to_wishlist', data)
          return
        }
        target = target.parentElement
      }
    })
  }
```

- [ ] **Step 4: Call it from `init()`'s funnel-signals block**

Change:

```js
    if (_funnelSignalsEnabled) {
      setupExitIntentDetection()
    }
  }
```

to:

```js
    if (_funnelSignalsEnabled) {
      setupExitIntentDetection()
      setupWishlistTracking()
    }
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm exec vitest run test/public/track-tag.test.ts -t "add_to_wishlist"`
Expected: PASS (4 tests)

- [ ] **Step 6: Run the full tag test file**

Run: `pnpm exec vitest run test/public/track-tag.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add public/track.js test/public/track-tag.test.ts
git commit -m "feat(tracking): add wishlist/save click detection"
```

---

## Task 7: CTA / price visibility

**Files:**
- Modify: `public/track.js` (`isEventAllowed`, `DATALAYER_EVENTS`, new `setupCtaVisibilityTracking()` function, `init()`'s funnel-signals block and `c.` overrides)
- Test: `test/public/track-tag.test.ts`

**Interfaces:**
- Consumes: `CTA_CLICK_SELECTORS` (existing, line 71), `track()`, `_funnelSignalsEnabled` (Task 2).
- Produces: `setupCtaVisibilityTracking(threshold)`, called from `init()`'s funnel-signals block; `CTA_VISIBILITY_THRESHOLD` (overridable via `c.ctaVisibilityThreshold`).

- [ ] **Step 1: Write the failing tests**

Add to the `describe('Phase B funnel & intent signals', ...)` block. `window.IntersectionObserver` is stubbed with a capturing fake, matching this file's existing style of manually stubbing browser APIs happy-dom may not implement (see the `sendBeacon` stub in `beforeEach`):

```ts
  it('fires cta_visible when an observed CTA element intersects, and unobserves it after firing', () => {
    const observeSpy = vi.fn()
    const unobserveSpy = vi.fn()
    let capturedCallback: any
    class FakeIntersectionObserver {
      constructor(cb: any) { capturedCallback = cb }
      observe = observeSpy
      unobserve = unobserveSpy
      disconnect = vi.fn()
    }
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)

    const button = document.createElement('button')
    button.setAttribute('data-cta', 'true')
    button.textContent = 'Get a quote'
    document.body.appendChild(button)

    loadTag()
    ;(window as any).xf.init({ writeKey: 'TESTKEY' })
    requests = []

    expect(observeSpy).toHaveBeenCalledWith(button)

    capturedCallback([{ target: button, isIntersecting: true }])

    expect(unobserveSpy).toHaveBeenCalledWith(button)
    const visibleEvent = eventsFrom(requests).find((e: any) => e.event_name === 'cta_visible')
    expect(visibleEvent).toBeTruthy()
    expect(visibleEvent.event_data.text).toBe('Get a quote')

    vi.unstubAllGlobals()
  })

  it('does not fire cta_visible for a non-intersecting entry', () => {
    let capturedCallback: any
    class FakeIntersectionObserver {
      constructor(cb: any) { capturedCallback = cb }
      observe = vi.fn()
      unobserve = vi.fn()
      disconnect = vi.fn()
    }
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)

    const button = document.createElement('button')
    button.setAttribute('data-cta', 'true')
    document.body.appendChild(button)

    loadTag()
    ;(window as any).xf.init({ writeKey: 'TESTKEY' })
    requests = []

    capturedCallback([{ target: button, isIntersecting: false }])

    expect(eventsFrom(requests).find((e: any) => e.event_name === 'cta_visible')).toBeUndefined()

    vi.unstubAllGlobals()
  })

  it('does not throw when IntersectionObserver is unavailable', () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    loadTag()
    expect(() => (window as any).xf.init({ writeKey: 'TESTKEY' })).not.toThrow()
    vi.unstubAllGlobals()
  })

  it('passes a ctaVisibilityThreshold override to the IntersectionObserver', () => {
    const ctorSpy = vi.fn(function (this: any, cb: any) {
      this.observe = vi.fn()
      this.unobserve = vi.fn()
      this.disconnect = vi.fn()
    })
    vi.stubGlobal('IntersectionObserver', ctorSpy)

    loadTag()
    ;(window as any).xf.init({ writeKey: 'TESTKEY', constants: { ctaVisibilityThreshold: 0.75 } })

    expect(ctorSpy).toHaveBeenCalledWith(expect.any(Function), { threshold: 0.75 })

    vi.unstubAllGlobals()
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run test/public/track-tag.test.ts -t "cta_visible\|ctaVisibilityThreshold"`
Expected: FAIL — `cta_visible` never fires, `IntersectionObserver` never constructed.

- [ ] **Step 3: Add `setupCtaVisibilityTracking()`**

Add this function immediately after `setupWishlistTracking` (Task 6) and before `trackPageView()`:

```js
  var CTA_VISIBILITY_SELECTORS = CTA_CLICK_SELECTORS.concat(['[data-price]', '.price', '.vehicle-price'])
  var CTA_VISIBILITY_THRESHOLD = 0.5

  function matchedCtaSelector(el) {
    for (var i = 0; i < CTA_VISIBILITY_SELECTORS.length; i++) {
      if (el.matches && el.matches(CTA_VISIBILITY_SELECTORS[i])) return CTA_VISIBILITY_SELECTORS[i]
    }
    return null
  }

  // "Did they actually see the price/CTA" via real visibility, not "did they
  // scroll past the pixel row it's in." Only observes elements present at
  // setup time — dynamically-rendered CTAs on client-side-routed dealer
  // sites are a known limitation, not handled by this pass.
  function setupCtaVisibilityTracking(threshold) {
    if (typeof window.IntersectionObserver === 'undefined') return
    var observer = new window.IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        var entry = entries[i]
        if (!entry.isIntersecting) continue
        observer.unobserve(entry.target)
        track('cta_visible', {
          selector: matchedCtaSelector(entry.target),
          text: (entry.target.textContent || '').substring(0, 100)
        })
      }
    }, { threshold: threshold })
    var elements = document.querySelectorAll(CTA_VISIBILITY_SELECTORS.join(','))
    for (var j = 0; j < elements.length; j++) observer.observe(elements[j])
  }
```

- [ ] **Step 4: Call it from `init()`'s funnel-signals block**

Change:

```js
    if (_funnelSignalsEnabled) {
      setupExitIntentDetection()
      setupWishlistTracking()
    }
  }
```

to:

```js
    if (_funnelSignalsEnabled) {
      setupExitIntentDetection()
      setupWishlistTracking()
      setupCtaVisibilityTracking(CTA_VISIBILITY_THRESHOLD)
    }
  }
```

- [ ] **Step 5: Add the `ctaVisibilityThreshold` override**

Change (from Task 3's Step 5):

```js
    if (c.comparisonThresholds) COMPARISON_THRESHOLDS = c.comparisonThresholds
    if (config.funnelSignals === false) _funnelSignalsEnabled = false
```

to:

```js
    if (c.comparisonThresholds) COMPARISON_THRESHOLDS = c.comparisonThresholds
    if (c.ctaVisibilityThreshold !== undefined) CTA_VISIBILITY_THRESHOLD = c.ctaVisibilityThreshold
    if (config.funnelSignals === false) _funnelSignalsEnabled = false
```

Note: this override must be applied *before* Step 4's `setupCtaVisibilityTracking(CTA_VISIBILITY_THRESHOLD)` call runs later in the same `init()` function — the `c.` overrides block already runs earlier in `init()` than the funnel-signals block, so no reordering is needed; just confirm this while editing.

- [ ] **Step 6: Add `cta_visible` to the analytics consent bucket**

In `isEventAllowed()`, change:

```js
      'form_field_focus',
      'form_abandonment',
      'exit_intent',
    ]
```

to:

```js
      'form_field_focus',
      'form_abandonment',
      'exit_intent',
      'cta_visible',
    ]
```

- [ ] **Step 7: Add the `cta_visible` dataLayer mapping**

In `DATALAYER_EVENTS`, change:

```js
    vehicle_comparison: 'vehicle_comparison',
    exit_intent: 'exit_intent',
  }
```

to:

```js
    vehicle_comparison: 'vehicle_comparison',
    exit_intent: 'exit_intent',
    cta_visible: 'cta_visible',
  }
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `pnpm exec vitest run test/public/track-tag.test.ts -t "cta_visible\|ctaVisibilityThreshold"`
Expected: PASS (4 tests)

- [ ] **Step 9: Run the full tag test file**

Run: `pnpm exec vitest run test/public/track-tag.test.ts`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add public/track.js test/public/track-tag.test.ts
git commit -m "feat(tracking): add CTA/price visibility detection via IntersectionObserver"
```

---

## Task 8: Integration test — all six signals respect the funnel-signals flag together

**Files:**
- Test only: `test/public/track-tag.test.ts` (no production code changes — this proves Tasks 2-7 compose correctly)

**Interfaces:**
- Consumes: everything produced by Tasks 2-7.

- [ ] **Step 1: Write the integration test**

Add to the `describe('Phase B funnel & intent signals', ...)` block:

```ts
  it('data-funnel-signals="false" disables all six signals together, but generic tracking still works', () => {
    withMarketingConsent()
    const script = document.createElement('script')
    document.head.appendChild(script)
    Object.defineProperty(script, 'src', { value: 'https://app.xeroflow.io/track.js' })
    script.setAttribute('data-key', 'TESTKEY')
    script.setAttribute('data-funnel-signals', 'false')
    const currentScript = vi.spyOn(document, 'currentScript', 'get').mockReturnValue(script)

    window.history.pushState({}, '', '/cars/used-black-2021-mercedes-benz-v-class-s20544')
    const wishlistBtn = document.createElement('button')
    wishlistBtn.className = 'wishlist'
    document.body.appendChild(wishlistBtn)
    const ctaBtn = document.createElement('button')
    ctaBtn.setAttribute('data-cta', 'true')
    document.body.appendChild(ctaBtn)

    loadTag()
    requests = []

    wishlistBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    document.dispatchEvent(new MouseEvent('mouseout', { clientY: -1, relatedTarget: null }))

    const events = eventsFrom(requests)
    expect(events.find((e: any) => e.event_name === 'add_to_wishlist')).toBeUndefined()
    expect(events.find((e: any) => e.event_name === 'exit_intent')).toBeUndefined()
    expect(events.find((e: any) => e.event_name === 'return_to_vehicle')).toBeUndefined()
    expect(events.find((e: any) => e.event_name === 'vehicle_comparison')).toBeUndefined()
    expect(events.find((e: any) => e.event_name === 'cta_visible')).toBeUndefined()
    // vehicle_view (Phase A, unrelated flag) still fires — the tag isn't fully disabled.
    expect(events.find((e: any) => e.event_name === 'vehicle_view')).toBeTruthy()

    currentScript.mockRestore()
  })

  it('all six signals fire when funnel-signals is on (default) and their triggers occur', async () => {
    withMarketingConsent()
    window.history.pushState({}, '', '/cars/used-black-2021-mercedes-benz-v-class-s20544')
    const wishlistBtn = document.createElement('button')
    wishlistBtn.className = 'wishlist'
    document.body.appendChild(wishlistBtn)

    loadTag()
    ;(window as any).xf.init({
      writeKey: 'TESTKEY',
      spa: true,
      constants: { engagementIntervals: [0], engagementCheckMs: 10 }
    })

    // Prime return-to-vehicle by back-dating a prior visit outside the session window.
    const visits = JSON.parse(localStorage.getItem('_xf_vehicle_visits_v1') || '{}')
    visits['20544'] = Date.now() - 31 * 60 * 1000
    localStorage.setItem('_xf_vehicle_visits_v1', JSON.stringify(visits))
    requests = []

    window.history.pushState({}, '', '/cars/used-white-2019-toyota-kluger-s20825') // cross-shop #1
    window.history.pushState({}, '', '/cars/used-black-2021-mercedes-benz-v-class-s20544') // return + comparison #2
    wishlistBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    document.dispatchEvent(new MouseEvent('mouseout', { clientY: -1, relatedTarget: null }))

    await vi.waitFor(() => {
      expect(eventsFrom(requests).some((e: any) => e.event_name === 'engagement')).toBe(true)
    })

    const names = eventsFrom(requests).map((e: any) => e.event_name)
    expect(names).toContain('vehicle_comparison')
    expect(names).toContain('return_to_vehicle')
    expect(names).toContain('exit_intent')
    expect(names).toContain('add_to_wishlist')
    expect(names).toContain('engagement')
  })
```

- [ ] **Step 2: Run the new tests**

Run: `pnpm exec vitest run test/public/track-tag.test.ts -t "disables all six\|all six signals fire"`
Expected: PASS — no production code changes needed if Tasks 2-7 were implemented correctly. If this fails, it means two signals' gating or wiring conflicts with each other; debug by checking which specific `expect` fails and re-reading the corresponding task's Step 4 (the `init()` wiring diff).

- [ ] **Step 3: Run the full tag test file one more time**

Run: `pnpm exec vitest run test/public/track-tag.test.ts`
Expected: PASS (all tests — existing + all Phase B tests)

- [ ] **Step 4: Run the full project test suite to check for regressions elsewhere**

Run: `pnpm exec vitest run test/server`
Expected: PASS, or only the pre-existing unrelated failures already documented in `docs/superpowers/handoffs/2026-07-26-persona-360-tracking-fixes-and-roadmap.md` (roleResolver.test.ts, webhook-google.test.ts) and the session that shipped PR #305 (channelTaxonomy, ga4Funnel, groqFeatureKeyCoverage, actionPlanAi, financialInsightsAi, socialAccountSpendEndpoint, spendControllerAgentEndpoint — all confirmed unrelated to tracking code). No *new* failures should appear.

- [ ] **Step 5: Lint the touched files**

Run: `pnpm exec eslint public/track.js server/utils/tracking/track-schema.ts test/public/track-tag.test.ts test/server/utils/tracking/track-schema.test.ts --fix`
Expected: clean, or auto-fixed formatting only (matches this codebase's stylistic lint rules, e.g. `@stylistic/arrow-parens`).

- [ ] **Step 6: Commit**

```bash
git add test/public/track-tag.test.ts
git commit -m "test(tracking): verify Phase B signals compose correctly under the funnel-signals flag"
```

---

## After all tasks: deploy verification

Not a plan task (no code change) — a reminder for whoever ships this, matching how Phase A was verified this session:

1. Deploy via `pnpm deploy:production` (or through the normal PR → CI → merge → auto-deploy path this repo uses).
2. Query `tracking_events` for South Morang (`site_id = '76ca2d2a-0541-4a29-87fb-23a6045f4ab5'`) for the new event names (`vehicle_comparison`, `return_to_vehicle`, `exit_intent`, `add_to_wishlist`, `cta_visible`, and `engagement` rows with `event_data->>'vehicle_stock_number'` populated) appearing on real traffic post-deploy.
3. If any are still zero after real traffic has passed, check: served `track.js` contains the new code (grep for `VEHICLE_VISITS_STORAGE_KEY`/`setupExitIntentDetection`/`CTA_VISIBILITY_SELECTORS`), and that South Morang's real `/cars/*` pages are being visited (cross-shop/return-to-vehicle/dwell all require vehicle-page traffic first).
