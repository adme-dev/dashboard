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
})
