import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const layout = readFileSync('app/layouts/agency.vue', 'utf8')
const chat = readFileSync('app/pages/agency/ai/chat.vue', 'utf8')

describe('Voice AI dashboard discoverability', () => {
  it('provides a dedicated Voice AI entry under Tools', () => {
    expect(layout).toContain('label: \'Voice AI\'')
    expect(layout).toContain('to: \'/agency/ai/chat?mode=voice\'')
  })

  it('labels both voice actions and exposes readiness guidance', () => {
    expect(chat).toContain('<AiVoiceDiscoveryGuide')
    expect(chat).toContain('Start Voice')
    expect(chat).toContain('Voice message')
    expect(chat).toContain('Voice ready')
  })
})
