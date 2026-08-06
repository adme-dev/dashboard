import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('Google AI Max readiness page', () => {
  it('is role-gated and mounts the dedicated readiness workspace', () => {
    const source = readFileSync('app/pages/agency/social/google/ai-max.vue', 'utf8')
    expect(source).toContain("middleware: ['role-media']")
    expect(source).toContain('<SocialSpendAiMaxReadiness')
  })

  it('keeps scans observational and exposes scan, export, filtering and evidence actions', () => {
    const source = readFileSync('app/components/social/SpendAiMaxReadiness.vue', 'utf8')
    expect(source).toContain('Observational only')
    expect(source).toContain('Scan now')
    expect(source).toContain(':to="exportHref"')
    expect(source).toContain('<SocialSpendAiMaxTable')
    expect(source).toContain('<SocialSpendAiMaxDetailSlideover')
    expect(source).toContain('pollScan')
    expect(source).not.toContain('Save changes')
  })
})
