import { describe, expect, it } from 'vitest'
import { normalizePortalRedirect } from '../../../server/utils/portalSession'

describe('Page Studio customer sign-in destinations', () => {
  it.each(['/studio/sites', '/studio/sites/site-a/content', '/studio/sites?page=2', '%2Fstudio%2Fsites'])('retains an internal product destination: %s', (path) => {
    expect(normalizePortalRedirect(path)).toBe(decodeURIComponent(path))
  })

  it.each(['https://evil.example/studio/sites', '//evil.example/studio/sites', '/studio/sites/../../agency', '/studio/sites/../admin', '/studio/sites-other', '/studio', '/studio/sites%5Cevil', '/studio/sites/%252f%252fevil.example', '/studio/sites\n/evil'])('rejects a destination outside the product scope: %s', (path) => {
    expect(normalizePortalRedirect(path)).toBe('/portal')
  })

  it('retains established portal destinations', () => {
    expect(normalizePortalRedirect('/portal/page-studio?tab=sites')).toBe('/portal/page-studio?tab=sites')
  })
})
