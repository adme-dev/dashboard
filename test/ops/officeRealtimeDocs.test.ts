import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(__dirname, '../..')

describe('office realtime ops notes', () => {
  it('documents the worker Realtime secrets and local-preview fallback', () => {
    const wrangler = readFileSync(resolve(root, 'workers/office-room/wrangler.toml'), 'utf8')
    const phasePlan = readFileSync(
      resolve(root, 'docs/superpowers/plans/2026-05-22-virtual-office-phase-1b-media.md'),
      'utf8'
    )

    for (const text of [wrangler, phasePlan]) {
      expect(text).toContain('REALTIME_APP_ID')
      expect(text).toContain('REALTIME_APP_SECRET')
      expect(text).toContain('wrangler secret put REALTIME_APP_ID')
      expect(text).toContain('wrangler secret put REALTIME_APP_SECRET')
    }

    expect(wrangler).toContain('local-preview mode')
  })

  it('keeps dealer guest media behind a session-bound rollout contract', () => {
    const decision = readFileSync(
      resolve(root, 'docs/decisions/ADR-006-dealer-guest-realtime-media-boundary.md'),
      'utf8'
    )
    const rollout = readFileSync(
      resolve(root, 'docs/superpowers/plans/2026-07-31-dealer-guest-video-meeting-rollout.md'),
      'utf8'
    )

    expect(decision).toContain('Status')
    expect(decision).toContain('Proposed')
    expect(decision).toContain('DO-issued grants')
    expect(decision).toContain('sessionId')
    expect(decision).toContain('guest badge')
    expect(decision).toContain('same-zone published-track registry')

    expect(rollout).toContain('not yet production-verified')
    expect(rollout).toContain('OFFICE_GUEST_REALTIME_MEDIA_ENABLED=false')
    expect(rollout).toContain('OFFICE_GUEST_REALTIME_PILOT_OFFICE_IDS')
    expect(rollout).toContain('wrong office, zone, session, actor, or operation scope')
    expect(rollout).toMatch(/signed remote-track\s+capabilit(?:y|ies)/)
    expect(rollout).toContain('Host end and badge revocation stop guest media')
    expect(rollout).toContain('at least 95%')
  })
})
