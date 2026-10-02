import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'
import {
  composerToBody,
  emptyComposerState,
  missingAccountPlatforms,
  resolveComposerContent,
  syncComposerAccountIds
} from '../../app/composables/useSocialComposer'

describe('resolveComposerContent', () => {
  const base = { ...emptyComposerState(), content: 'Base', mediaUrls: ['a.jpg'] }

  it('returns base when customization is off, even if an override exists', () => {
    const s = { ...base, customizePerNetwork: false, platformOverrides: { instagram: { content: 'IG' } } }
    expect(resolveComposerContent(s, 'instagram')).toEqual({ content: 'Base', mediaUrls: ['a.jpg'] })
  })
  it('applies an override only when customization is on', () => {
    const s = { ...base, customizePerNetwork: true, platformOverrides: { instagram: { content: 'IG' } } }
    expect(resolveComposerContent(s, 'instagram')).toEqual({ content: 'IG', mediaUrls: ['a.jpg'] })
  })
  it('inherits base for a platform without an override', () => {
    const s = { ...base, customizePerNetwork: true, platformOverrides: { instagram: { content: 'IG' } } }
    expect(resolveComposerContent(s, 'facebook')).toEqual({ content: 'Base', mediaUrls: ['a.jpg'] })
  })
})

describe('composerToBody', () => {
  it('preserves video project provenance while changing creative selection', () => {
    const source = { source: 'video_studio', projectId: 'project-1', assetId: 'asset-1', prompt: 'Approved motion', creativeId: 'old' }
    const state = { ...emptyComposerState(), metadata: source, creativeId: 'new' }
    expect(composerToBody(state, 'client-1').metadata).toEqual({ ...source, creativeId: 'new' })
    state.creativeId = null
    expect(composerToBody(state, 'client-1').metadata).toEqual({ source: 'video_studio', projectId: 'project-1', assetId: 'asset-1', prompt: 'Approved motion' })
  })
  it('serializes an optional campaign and supports clearing it', () => {
    const state = { ...emptyComposerState(), campaignId: 'campaign-1' }
    expect(composerToBody(state, 'client-1').campaignId).toBe('campaign-1')
    state.campaignId = null
    expect(composerToBody(state, 'client-1').campaignId).toBeNull()
  })
  it('hydrates a saved campaign along with video provenance', async () => {
    vi.stubGlobal('useState', (_key: string, init: () => unknown) => ref(init()))
    const { useSocialComposer } = await import('../../app/composables/useSocialComposer')
    const composer = useSocialComposer()
    composer.loadFromPost({ id: 'post-1', campaign_id: 'campaign-1', metadata: { source: 'video_studio' } } as never)
    expect(composer.state.value.campaignId).toBe('campaign-1')
    expect(composer.toBody('client-1').metadata).toEqual({ source: 'video_studio' })
    composer.reset()
    expect(composer.state.value.campaignId).toBeNull()
    vi.unstubAllGlobals()
  })
  it('omits overrides when customization is off and nulls empty arrays', () => {
    const s = { ...emptyComposerState(), content: 'hi', platforms: ['facebook' as const], platformOverrides: { x: {} } }
    const body = composerToBody(s, 'C1')
    expect(body.clientId).toBe('C1')
    expect(body.platformOverrides).toEqual({})
    expect(body.mediaUrls).toBeNull()
    expect(body.tags).toBeNull()
    expect(body).not.toHaveProperty('status')
  })
  it('drops scheduledAt in "now" mode', () => {
    const s = { ...emptyComposerState(), scheduleMode: 'now' as const, scheduledAt: '2026-06-10T00:00:00Z' }
    expect(composerToBody(s, 'C1').scheduledAt).toBeNull()
  })
  it('keeps scheduledAt in schedule mode and includes overrides when on', () => {
    const s = { ...emptyComposerState(), scheduleMode: 'schedule' as const, scheduledAt: '2026-06-10T00:00:00Z',
      customizePerNetwork: true, platformOverrides: { instagram: { content: 'IG' } } }
    const body = composerToBody(s, 'C1')
    expect(body.scheduledAt).toBe('2026-06-10T00:00:00Z')
    expect(body.platformOverrides).toEqual({ instagram: { content: 'IG' } })
  })
})

describe('composer account binding', () => {
  const accounts = [
    { id: 'fb1', platform: 'facebook' as const, is_active: true, last_error: null },
    { id: 'ig1', platform: 'instagram' as const, is_active: true, last_error: null },
    { id: 'old', platform: 'linkedin' as const, is_active: false, last_error: null }
  ]

  it('auto-selects the only active account for each selected platform', () => {
    expect(syncComposerAccountIds(['facebook', 'instagram'], [], accounts)).toEqual(['fb1', 'ig1'])
  })

  it('drops accounts for unselected or inactive platforms', () => {
    expect(syncComposerAccountIds(['facebook'], ['ig1', 'old'], accounts)).toEqual(['fb1'])
  })

  it('reports platforms that still need a selected account', () => {
    expect(missingAccountPlatforms(['facebook', 'linkedin'], ['fb1'], accounts)).toEqual(['linkedin'])
  })

  it('does not bind accounts that require reconnect', () => {
    const reconnectAccounts = [
      { id: 'fb1', platform: 'facebook' as const, is_active: true, last_error: null },
      { id: 'expired', platform: 'facebook' as const, is_active: true, last_error: null, requires_reconnect: true }
    ]
    expect(syncComposerAccountIds(['facebook'], ['expired'], reconnectAccounts)).toEqual(['fb1'])
    expect(missingAccountPlatforms(['facebook'], ['expired'], reconnectAccounts)).toEqual(['facebook'])
  })

  it('keeps non-publishing account attention selectable', () => {
    const attentionAccounts = [
      { id: 'webhook', platform: 'facebook' as const, is_active: true, last_error: 'webhook subscribe failed: timeout', requires_reconnect: false, connection_health: 'attention' as const }
    ]
    expect(syncComposerAccountIds(['facebook'], ['webhook'], attentionAccounts)).toEqual(['webhook'])
  })
})

describe('approved composer payload integrity', () => {
  it('allows only the exact approved saved payload', async () => {
    const { isApprovedComposerUnchanged } = await import('../../app/composables/useSocialComposer')
    const saved = { ...emptyComposerState(), id: 'saved-post', content: 'Approved text', platforms: ['facebook' as const], accountIds: ['correct-page'] }
    const approvedBody = JSON.stringify(composerToBody(saved, 'client-1'))
    expect(isApprovedComposerUnchanged(saved, 'client-1', 'approved', approvedBody)).toBe(true)
    for (const status of ['draft', 'scheduled', 'publishing', 'published', 'partially_published', 'failed', 'cancelled']) {
      expect(isApprovedComposerUnchanged(saved, 'client-1', status, approvedBody)).toBe(false)
    }
    expect(isApprovedComposerUnchanged({ ...saved, content: 'Unreviewed change' }, 'client-1', 'approved', approvedBody)).toBe(false)
    expect(isApprovedComposerUnchanged({ ...saved, accountIds: ['other-page'] }, 'client-1', 'approved', approvedBody)).toBe(false)
    expect(isApprovedComposerUnchanged(saved, 'other-client', 'approved', approvedBody)).toBe(false)
    expect(isApprovedComposerUnchanged({ ...saved, id: null }, 'client-1', 'approved', approvedBody)).toBe(false)
  })
})
