import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const component = readFileSync('app/components/dealer-feeds/MetaCatalogPlatformCard.vue', 'utf8')
const composable = readFileSync('app/composables/useMetaConnect.ts', 'utf8')
const page = readFileSync('app/pages/agency/dealer-feeds.vue', 'utf8')
const accounts = readFileSync('server/api/agency/social/meta/accounts.get.ts', 'utf8')

describe('Meta catalogue platform UI', () => {
  it('renders the exact readiness states and authenticated platform actions', () => {
    expect(component).toContain('\'/api/admin/meta-catalogs/readiness\'')
    expect(component).toContain('\'/api/admin/meta-catalogs/feeds\'')
    expect(component).toContain('\'USER_GRANT_REQUIRED\'')
    expect(component).toContain('\'APP_REVIEW_REQUIRED\'')
    expect(component).toContain('\'FEED_SETUP_REQUIRED\'')
    expect(component).toContain('\'READY\'')
    expect(component).toContain('connectMetaWithIntent(\'catalog_management\')')
    expect(component).toContain('UFormField')
    expect(component).toContain('USelectMenu')
    expect(component).toContain('UButton')
    expect(component).toContain('Latest upload')
    expect(component).toContain('lastVerifiedAt')
    expect(component).not.toMatch(/<select\b|<input\b|<button\b|\bconfirm\(/)
  })

  it('places the workflow in the existing client-scoped dealer feed operations page', () => {
    expect(page).toContain('<DealerFeedsMetaCatalogPlatformCard')
    expect(page).toContain(':client-id="selectedClientId"')
  })

  it('upgrades the existing Meta connection rather than requiring disconnect/reconnect', () => {
    expect(composable).toContain("connect(intent: 'baseline' | 'catalog' = 'baseline', connectionId?: string)")
    expect(composable).toContain('connectWithIntent(')
    expect(composable).toContain("intent: 'connection' | 'catalog_management'")
    expect(composable).toContain('new URLSearchParams({ intent })')
    expect(composable).toContain("query.set('connectionId', connectionId)")
    expect(component).not.toMatch(/label="(?:Disconnect|Reconnect)"/)
  })

  it('reserves the OAuth popup during the user gesture before fetching the signed URL', () => {
    const popupReservation = composable.indexOf('popup = openPopup(\'about:blank\')')
    const signedUrlFetch = composable.indexOf('await apiFetch<{ url: string }>(endpoint)')
    const popupNavigation = composable.indexOf('popup.location.replace(url)')

    expect(popupReservation).toBeGreaterThan(-1)
    expect(signedUrlFetch).toBeGreaterThan(popupReservation)
    expect(popupNavigation).toBeGreaterThan(signedUrlFetch)
    expect(composable).toContain('popup.close()')
  })

  it('opens a fresh popup in the active Chrome profile instead of reusing a stale named window', () => {
    expect(composable).toContain('window.open(url, \'_blank\'')
    expect(composable).not.toContain('window.open(url, \'meta-oauth\'')
  })

  it('returns the client mapping needed to select the exact connection', () => {
    expect(accounts).toMatch(/sc\.client_id/)
    expect(accounts).toContain('clientId: a.client_id')
  })
})
