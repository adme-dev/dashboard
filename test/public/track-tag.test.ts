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
  // Fresh eval each time so module-level state (WRITE_KEY) resets.
  // eslint-disable-next-line no-new-func
  new Function('window', 'document', 'navigator', TAG_SRC)(window, document, navigator)
}

describe('public/track.js transport', () => {
  let beacons: { url: string, body: string }[]

  beforeEach(() => {
    beacons = []
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
    document.cookie = ''
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

  it('posts a schema-valid batch to /api/public/track?k=KEY with a generated event_id', () => {
    loadTag()
    ;(window as any).xf.init({ writeKey: 'TESTKEY' })
    // init() fires its own page_view; clear and emit a deterministic one.
    beacons = []
    ;(window as any).xf.track('phone_click', { phone_number: '+61399999999' })

    expect(beacons.length).toBe(1)
    const { url, body } = beacons[0]
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

  it('forwards the raw _xf_consent cookie value in the batch (cross-origin relay)', () => {
    const cookie = JSON.stringify({ tracking: true, analytics: true, marketing: false, updatedAt: '2026-05-31T00:00:00Z' })
    document.cookie = '_xf_consent=' + encodeURIComponent(cookie)
    loadTag()
    ;(window as any).xf.init({ writeKey: 'TESTKEY' })
    beacons = []
    ;(window as any).xf.track('phone_click', {})

    expect(beacons.length).toBe(1)
    const payload = JSON.parse(beacons[0].body)
    expect(payload.consent).toBe(cookie)
    // and the server schema accepts it
    expect(parseTrackPayload(payload).ok).toBe(true)
  })
})
