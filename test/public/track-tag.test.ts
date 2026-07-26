// @vitest-environment happy-dom
/**
 * Loads the real public/track.js IIFE in a DOM harness and asserts the rewired
 * transport: it posts the Slice-1 batch shape to OUR origin with the write key
 * on the query string. Complements the live browser proof in the plan's Task 10.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseTrackPayload } from '../../server/utils/tracking/track-schema'

const TAG_SRC = readFileSync(resolve(__dirname, '../../public/track.js'), 'utf8')

function loadTag() {
  ;(window as any).xf?.destroy?.()
  // Fresh eval each time so module-level state (WRITE_KEY) resets.
  // eslint-disable-next-line no-new-func
  new Function('window', 'document', 'navigator', TAG_SRC)(window, document, navigator)
}

const NATIVE_PUSH_STATE = window.history.pushState

describe('public/track.js transport', () => {
  let beacons: { url: string, body: string }[]
  let requests: { url: string, body: string }[]
  let fetchSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    document.head.innerHTML = ''
    document.body.innerHTML = ''
    window.history.replaceState({}, '', '/')
    beacons = []
    requests = []
    // happy-dom may not implement sendBeacon — define a capturing stub.
    ;(navigator as any).sendBeacon = vi.fn((url: string, blob: any) => {
      // Blob.text() is async; read the stored parts synchronously via our own shape.
      beacons.push({ url, body: blob?._body ?? '' })
      return true
    })
    // Capture Blob contents synchronously for assertion.
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

  it('records campaign-attributed provider iframe interactions without treating them as leads', async () => {
    window.history.pushState({}, '', '/service?utm_source=meta&utm_medium=paid_social&utm_campaign=service-july')
    // A focusable frame-shaped element avoids happy-dom making a real network
    // request when an iframe with an external src is attached.
    const xtime = document.createElement('button') as any
    Object.defineProperty(xtime, 'tagName', { value: 'IFRAME' })
    Object.defineProperty(xtime, 'src', {
      value: 'https://consumer.xtime.net.au/xt/scheduling/?webKey=dealer-key'
    })
    document.body.appendChild(xtime)
    const podium = document.createElement('iframe')
    podium.id = 'podium-bubble'
    podium.dataset.cy = 'podium-website-widget-iframe'
    document.body.appendChild(podium)

    loadTag()
    ;(window as any).xf.init({ writeKey: 'TESTKEY' })
    requests = []

    xtime.focus()
    window.dispatchEvent(new Event('blur'))
    await vi.waitFor(() => expect(requests).toHaveLength(1))

    const xtimeEvent = JSON.parse(requests[0].body).events[0]
    expect(xtimeEvent.event_name).toBe('provider_interaction')
    expect(xtimeEvent.event_data).toEqual(expect.objectContaining({
      provider: 'xtime',
      interaction_type: 'iframe_focus',
      attribution_confidence: 'interaction_observed',
      provider_host: 'consumer.xtime.net.au'
    }))
    expect(xtimeEvent.attribution).toEqual(expect.objectContaining({
      utm_source: 'meta',
      utm_campaign: 'service-july'
    }))

    podium.focus()
    window.dispatchEvent(new Event('blur'))
    await vi.waitFor(() => expect(requests).toHaveLength(2))
    window.dispatchEvent(new Event('blur'))
    await new Promise(resolve => setTimeout(resolve, 1))

    expect(requests).toHaveLength(2)
    const podiumEvent = JSON.parse(requests[1].body).events[0]
    expect(podiumEvent.event_name).toBe('provider_interaction')
    expect(podiumEvent.event_data).toEqual(expect.objectContaining({
      provider: 'podium',
      interaction_type: 'iframe_focus',
      attribution_confidence: 'interaction_observed',
      provider_host: 'connect.podium.com'
    }))
  })

  it('exposes window.xf (not engagrTrack)', () => {
    loadTag()
    expect((window as any).xf).toBeTruthy()
    expect(typeof (window as any).xf.track).toBe('function')
    expect((window as any).engagrTrack).toBeUndefined()
  })

  it('drops events when no write key is set', () => {
    loadTag()
    ;(window as any).xf.init({}) // no writeKey
    ;(window as any).xf.track('page_view', { a: 1 })
    expect(beacons.length).toBe(0)
  })

  it('waits for manual init when GTM strips the script write key', () => {
    const script = document.createElement('script')
    document.head.appendChild(script)
    Object.defineProperty(script, 'src', { value: 'https://app.xeroflow.io/track.js' })
    const currentScript = vi.spyOn(document, 'currentScript', 'get').mockReturnValue(script)
    const addListener = vi.spyOn(window, 'addEventListener')

    loadTag()

    expect(addListener.mock.calls.filter(([name]) => name === 'blur')).toHaveLength(0)
    expect(requests).toHaveLength(0)

    ;(window as any).xf.init({ writeKey: 'TESTKEY', spa: true })

    expect(addListener.mock.calls.filter(([name]) => name === 'blur')).toHaveLength(1)
    expect(requests).toHaveLength(1)
    expect(requests[0].url).toContain('/api/public/track?k=TESTKEY')

    ;(window as any).xf.init({ writeKey: 'TESTKEY', spa: true })

    expect(addListener.mock.calls.filter(([name]) => name === 'blur')).toHaveLength(1)
    expect(requests).toHaveLength(1)

    currentScript.mockRestore()
    addListener.mockRestore()
  })

  it('posts to the tracker origin when GTM calls init from an inline bootstrap', () => {
    const trackerScript = document.createElement('script')
    Object.defineProperty(trackerScript, 'src', {
      value: 'https://app.xeroflow.io/track.js?v=gtm-cache-bust'
    })
    const querySelector = vi.spyOn(document, 'querySelector').mockImplementation((selector: string) => {
      return selector === 'script[src*="track.js"]' ? trackerScript : null
    })

    const inlineBootstrap = document.createElement('script')
    document.head.appendChild(inlineBootstrap)
    const currentScript = vi.spyOn(document, 'currentScript', 'get').mockReturnValue(inlineBootstrap)

    loadTag()
    ;(window as any).xf.init({ writeKey: 'TESTKEY', spa: true })

    expect(requests).toHaveLength(1)
    expect(requests[0].url).toBe('https://app.xeroflow.io/api/public/track?k=TESTKEY')

    currentScript.mockRestore()
    querySelector.mockRestore()
  })

  it('posts a schema-valid batch to /api/public/track?k=KEY with a generated event_id', () => {
    loadTag()
    ;(window as any).xf.init({ writeKey: 'TESTKEY' })
    // init() fires its own page_view; clear and emit a deterministic one.
    requests = []
    ;(window as any).xf.track('phone_click', { phone_number: '+61399999999' })

    expect(requests.length).toBe(1)
    const { url, body } = requests[0]
    expect(url).toContain('/api/public/track?k=TESTKEY')

    const parsed = parseTrackPayload(JSON.parse(body))
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      const ev = parsed.payload.events[0]
      expect(ev.event_name).toBe('phone_click')
      expect(ev.event_id).toBeTruthy()
      expect(ev.anon_id).toBeTruthy()
      expect(typeof ev.occurred_at).toBe('number')
    }
  })

  it('prefers fetch delivery when sendBeacon is available', () => {
    loadTag()
    ;(window as any).xf.init({ writeKey: 'TESTKEY' })
    fetchSpy.mockClear()
    requests = []
    beacons = []

    ;(window as any).xf.track('page_view', { verification: 'fetch-first' })

    expect(fetchSpy).toHaveBeenCalledOnce()
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/public/track?k=TESTKEY'),
      expect.objectContaining({
        method: 'POST',
        body: expect.any(String),
        keepalive: true,
        mode: 'cors'
      })
    )
    expect(beacons).toHaveLength(0)
  })

  it('falls back to sendBeacon after a fetch network failure', async () => {
    loadTag()
    ;(window as any).xf.init({ writeKey: 'TESTKEY' })
    await Promise.resolve()
    fetchSpy.mockRejectedValueOnce(new Error('network unavailable'))
    beacons = []

    ;(window as any).xf.track('page_view', { verification: 'beacon-fallback' })

    await vi.waitFor(() => expect(beacons).toHaveLength(1))
    expect(beacons[0].url).toContain('/api/public/track?k=TESTKEY')
  })

  it('reuses one conversion event ID for the server batch and GTM data layer', async () => {
    const script = document.createElement('script')
    script.setAttribute('data-auto', 'false')
    document.head.appendChild(script)
    Object.defineProperty(script, 'src', { value: 'https://dashboard.example/track.js' })
    const currentScript = vi.spyOn(document, 'currentScript', 'get').mockReturnValue(script)
    const insertScript = vi.spyOn(document.head, 'insertBefore').mockImplementation(node => node)

    vi.stubGlobal('fetch', vi.fn((url: string, options?: RequestInit) => {
      if (options?.method === 'POST') {
        requests.push({ url: String(url), body: String(options.body ?? '') })
        return Promise.resolve({ ok: true })
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          gtm: {
            enabled: true,
            containerId: 'GTM-TEST'
          }
        })
      })
    }))

    loadTag()
    ;(window as any).xf.init({ writeKey: 'TESTKEY', gtmBridge: true })
    // dataLayer is truthy as soon as init() pushes the Consent Mode v2
    // 'default' signal, which happens synchronously and before the async GTM
    // config fetch resolves — wait for GTM's own bootstrap marker instead so
    // this doesn't race ahead of injectGtmScript() and leak a pending
    // insertBefore call into a later test.
    await vi.waitFor(() => {
      expect((window as any).dataLayer.some((entry: any) => entry && entry.event === 'gtm.js')).toBe(true)
    })

    requests = []
    ;(window as any).dataLayer = []
    ;(window as any).xf.track('lead', { form_id: 'test-lead-form' })

    expect(requests).toHaveLength(1)
    expect((window as any).dataLayer).toHaveLength(1)

    const serverEvent = JSON.parse(requests[0].body).events[0]
    const browserEvent = (window as any).dataLayer[0]
    expect(browserEvent.event).toBe('generate_lead')
    expect(browserEvent.event_id).toBe(serverEvent.event_id)

    currentScript.mockRestore()
    insertScript.mockRestore()
  })

  it('bridges a caller-owned conversion ID to an existing dataLayer without injecting GTM', () => {
    const insertScript = vi.spyOn(document.head, 'insertBefore').mockImplementation(node => node)
    ;(window as any).dataLayer = []

    loadTag()
    ;(window as any).xf.init({
      writeKey: 'TESTKEY',
      dataLayerBridge: true,
      forms: false
    })
    fetchSpy.mockClear()
    requests = []
    ;(window as any).dataLayer = []

    const eventId = (window as any).xf.createEventId()
    const returnedEventId = (window as any).xf.track(
      'generate_lead',
      { form_id: 'big-garage-enquiry' },
      { eventId }
    )

    expect(returnedEventId).toBe(eventId)
    expect(requests).toHaveLength(1)
    expect((window as any).dataLayer).toEqual([
      expect.objectContaining({
        event: 'generate_lead',
        event_id: eventId,
        form_id: 'big-garage-enquiry'
      })
    ])
    expect(JSON.parse(requests[0].body).events[0].event_id).toBe(eventId)
    expect(fetchSpy).toHaveBeenCalledOnce()
    expect(insertScript).not.toHaveBeenCalled()

    insertScript.mockRestore()
  })

  it('replaces an invalid caller event ID before transport', () => {
    loadTag()
    ;(window as any).xf.init({ writeKey: 'TESTKEY' })
    requests = []

    const eventId = (window as any).xf.track('generate_lead', {}, { eventId: '   ' })

    expect(eventId).toBeTruthy()
    expect(eventId).not.toBe('   ')
    expect(JSON.parse(requests[0].body).events[0].event_id).toBe(eventId)
  })

  it('forwards email click IDs from the landing URL attribution', () => {
    window.history.pushState({}, '', '/offers?utm_source=email&utm_medium=email&utm_campaign=camp-1&email_click_id=click-1')
    loadTag()
    ;(window as any).xf.init({ writeKey: 'TESTKEY' })
    requests = []
    ;(window as any).xf.track('page_view', {})

    const parsed = parseTrackPayload(JSON.parse(requests[0].body))
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.payload.events[0].attribution?.email_click_id).toBe('click-1')
    }
  })

  it('forwards the raw _xf_consent cookie value in the batch (cross-origin relay)', () => {
    const cookie = JSON.stringify({ tracking: true, analytics: true, marketing: false, updatedAt: '2026-05-31T00:00:00Z' })
    document.cookie = '_xf_consent=' + encodeURIComponent(cookie)
    loadTag()
    ;(window as any).xf.init({ writeKey: 'TESTKEY' })
    requests = []
    ;(window as any).xf.track('phone_click', {})

    expect(requests.length).toBe(1)
    const payload = JSON.parse(requests[0].body)
    expect(payload.consent).toBe(cookie)
    // and the server schema accepts it
    expect(parseTrackPayload(payload).ok).toBe(true)
  })

  it('sends only submission identity and attribution to the reconciliation endpoint', () => {
    document.cookie = '_xf_consent=' + encodeURIComponent(JSON.stringify({
      tracking: true,
      analytics: true,
      marketing: true,
      updatedAt: '2026-07-24T00:00:00Z'
    })) + '; path=/'
    loadTag()
    ;(window as any).xf.init({ writeKey: 'TESTKEY' })
    requests = []

    const form = document.createElement('form')
    form.id = 'vehicle-enquiry'
    form.innerHTML = `
      <input type="email" name="email" value="person@example.com">
      <input type="tel" name="mobile" value="0400123456">
      <input type="hidden" name="stock_number" value="S1234">
      <textarea name="message">Private free-text message</textarea>
    `
    document.body.appendChild(form)
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))

    const intent = requests.find(request => request.url.includes('/api/public/lead-intent'))
    const tracking = requests.find(request => request.url.includes('/api/public/track'))
    expect(intent).toBeTruthy()
    expect(tracking).toBeTruthy()

    const payload = JSON.parse(intent!.body)
    expect(payload.identity).toEqual({
      email: 'person@example.com',
      phone: '0400123456'
    })
    expect(payload.vehicle_reference).toBe('S1234')
    expect(payload.browser_event_id).toBe(JSON.parse(tracking!.body).events[0].event_id)
    expect(intent!.body).not.toContain('Private free-text message')
  })
})

describe('Phase B funnel & intent signals', () => {
  let beacons: { url: string, body: string }[]
  let requests: { url: string, body: string }[]
  let fetchSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    window.history.pushState = NATIVE_PUSH_STATE
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
