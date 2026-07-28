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

  it('retains critical tags when Nuxt groups them with prefetch hints', () => {
    expect(filterPortalResourceHints([
      [
        '<link rel="stylesheet" href="/_nuxt/entry.css">',
        '<script type="module" src="/_nuxt/entry.js"></script>',
        '<link rel="prefetch" href="/_nuxt/projects.js" as="script">'
      ].join('')
    ])).toEqual([
      [
        '<link rel="stylesheet" href="/_nuxt/entry.css">',
        '<script type="module" src="/_nuxt/entry.js"></script>'
      ].join('')
    ])
  })
})
