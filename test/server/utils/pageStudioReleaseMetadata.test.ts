import { describe, expect, it } from 'vitest'
import {
  derivePageStudioReleaseMetadata,
  PageStudioReleaseMetadataError
} from '../../../server/utils/pageStudio/releaseMetadata'

function manifest() {
  return {
    schemaVersion: 2,
    id: 'a27135dc-1374-475c-a56d-7e60310425bb',
    defaultLocale: 'en-AU',
    theme: { id: 'reference', schemaVersion: 1, tokens: { color: '#087f73' } },
    seo: { siteName: 'XeroFlow reference', defaultDescription: 'Reference website' },
    shell: {
      navigation: { enabled: true, items: [{ id: 'home', label: 'Home', target: { kind: 'page', pageId: 'home' }, children: [] }] },
      footer: { enabled: true, columns: [], socialLinks: [] }
    },
    integrations: { forms: { enabled: true } },
    pages: [],
    redirects: []
  }
}

describe('derivePageStudioReleaseMetadata', () => {
  it('creates a site metadata snapshot from a v2 manifest', () => {
    const source = manifest()
    expect(derivePageStudioReleaseMetadata(source)).toEqual({
      defaultLocale: 'en-AU',
      theme: source.theme,
      navigation: source.shell.navigation,
      footer: source.shell.footer,
      seoDefaults: source.seo,
      integrations: source.integrations
    })
  })

  it('rejects unsupported manifests', () => {
    expect(() => derivePageStudioReleaseMetadata({ ...manifest(), schemaVersion: 1 }))
      .toThrow(PageStudioReleaseMetadataError)
  })
})
