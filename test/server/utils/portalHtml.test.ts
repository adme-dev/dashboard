import { describe, expect, it } from 'vitest'
import { filterPortalResourceHints } from '../../../server/utils/portalHtml'

describe('portal HTML resource hints', () => {
  it('removes route prefetch hints while retaining critical module and style links', () => {
    expect(filterPortalResourceHints([
      '<link rel="prefetch" href="/_nuxt/projects.js" as="script">',
      '<link rel="modulepreload" href="/_nuxt/entry.js">',
      '<link rel="stylesheet" href="/_nuxt/entry.css">'
    ])).toEqual([
      '<link rel="modulepreload" href="/_nuxt/entry.js">',
      '<link rel="stylesheet" href="/_nuxt/entry.css">'
    ])
  })
})
