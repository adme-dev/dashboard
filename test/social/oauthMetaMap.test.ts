import { describe, it, expect } from 'vitest'
import { buildMetaAuthUrl, mapPagesToAccountRows, type ManagedPage } from '~~/server/utils/socialOAuth/meta'

describe('buildMetaAuthUrl', () => {
  it('includes appId, redirect, state, response_type=code and the D2 scopes (not ad scopes)', () => {
    const url = buildMetaAuthUrl('APPID', 'https://x/cb', 'STATE')
    expect(url).toContain('client_id=APPID')
    expect(url).toContain('state=STATE')
    expect(url).toContain('response_type=code')
    expect(decodeURIComponent(url)).toContain('instagram_content_publish')
    expect(decodeURIComponent(url)).toContain('pages_manage_metadata')
    expect(decodeURIComponent(url)).not.toContain('ads_management')
  })
})

describe('mapPagesToAccountRows', () => {
  const expiresAt = '2026-08-01T00:00:00.000Z'
  it('maps a plain page to a single facebook row', () => {
    const page: ManagedPage = { id: 'P1', name: 'Acme', accessToken: 'PT', category: 'Brand' }
    const rows = mapPagesToAccountRows(page, expiresAt)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ platform: 'facebook', platform_account_id: 'P1', account_name: 'Acme', access_token: 'PT', token_expires_at: expiresAt })
    expect(rows[0].metadata.page_category).toBe('Brand')
    expect(rows[0].metadata.webhook_subscribed).toBe(false)
  })
  it('adds an instagram row when the page has a linked IG business account', () => {
    const page: ManagedPage = { id: 'P1', name: 'Acme', accessToken: 'PT', igId: 'IG9', igUsername: 'acme_ig' }
    const rows = mapPagesToAccountRows(page, expiresAt)
    expect(rows.map(r => r.platform)).toEqual(['facebook', 'instagram'])
    const ig = rows[1]
    expect(ig).toMatchObject({ platform: 'instagram', platform_account_id: 'IG9', account_name: 'acme_ig', access_token: 'PT' })
    expect(ig.metadata.via_page_id).toBe('P1')
    expect(rows[0].metadata.linked_ig_id).toBe('IG9')
  })
  it('falls back to the page name when IG username is missing', () => {
    const page: ManagedPage = { id: 'P1', name: 'Acme', accessToken: 'PT', igId: 'IG9' }
    expect(mapPagesToAccountRows(page, expiresAt)[1].account_name).toBe('Acme')
  })
})
