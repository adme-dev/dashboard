import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('AI Max spend control integration', () => {
  it('loads readiness only for Google-inclusive spend views', () => {
    const page = readFileSync('app/pages/agency/social/spend.vue', 'utf8')
    expect(page).toContain("['all', 'google'].includes(selectedPlatform.value)")
    expect(page).toContain('loadAiMaxReadiness')
    expect(page).toContain(':ai-max-summary="aiMaxReadiness?.summary ?? null"')
  })

  it('links the control room signal to the detailed evidence ledger', () => {
    const controlRoom = readFileSync('app/components/social/SocialSpendControlRoom.vue', 'utf8')
    expect(controlRoom).toContain("label: 'AI Max readiness'")
    expect(controlRoom).toContain('/agency/social/google/ai-max')
    expect(controlRoom).toContain('Needs review')
  })
})
