import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const card = readFileSync(new URL('../../app/components/social/SocialPlatformCard.vue', import.meta.url), 'utf8')
const page = readFileSync(new URL('../../app/pages/agency/social/index.vue', import.meta.url), 'utf8')
const composable = readFileSync(new URL('../../app/composables/useSocialConnections.ts', import.meta.url), 'utf8')

describe('agency Google multi-connection UI', () => {
  it('offers an explicit additive connection action when Google is already connected', () => {
    expect(card).toContain('\'add-connection\'')
    expect(card).toContain('Add connection')
    expect(page).toContain(':allow-multiple="p.key === \'google\'"')
    expect(page).toContain('@add-connection="handleConnect"')
  })

  it('shows credential-profile count independently from ad-account count', () => {
    expect(card).toContain('credentialProfileCount')
    expect(card).toContain('Google connections')
    expect(page).toContain('credentialProfileCount')
  })

  it('uses a unique popup name for concurrent OAuth attempts', () => {
    expect(composable).toContain('`${platform}_connect_${Date.now()}`')
  })
})
