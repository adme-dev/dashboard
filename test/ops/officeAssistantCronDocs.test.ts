import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(__dirname, '../..')

describe('office assistant cron ops notes', () => {
  it('documents the implemented assistant Pages cron target and auth header', () => {
    const wrangler = readFileSync(resolve(root, 'wrangler.toml'), 'utf8')
    const roadmap = readFileSync(
      resolve(root, 'docs/superpowers/specs/2026-05-24-virtual-office-roam-rd-roadmap.md'),
      'utf8'
    )

    for (const text of [wrangler, roadmap]) {
      expect(text).toContain('POST /api/cron/office-assistant')
      expect(text).toContain('x-cron-secret')
      expect(text).toContain('*/5 * * * *')
    }
  })

  it('documents the implemented retention Pages cron target and auth header', () => {
    const wrangler = readFileSync(resolve(root, 'wrangler.toml'), 'utf8')
    const roadmap = readFileSync(
      resolve(root, 'docs/superpowers/specs/2026-05-24-virtual-office-roam-rd-roadmap.md'),
      'utf8'
    )

    for (const text of [wrangler, roadmap]) {
      expect(text).toContain('POST /api/cron/office-retention')
      expect(text).toContain('x-cron-secret')
      expect(text).toContain('35 3 * * *')
    }
  })
})
