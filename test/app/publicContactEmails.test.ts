import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const publicContactPages = [
  'app/pages/privacy.vue',
  'app/pages/resources/index.vue',
  'app/pages/support.vue',
  'app/pages/terms.vue'
]

describe('public XeroFlow contact addresses', () => {
  it.each(publicContactPages)('%s uses the xeroflow.io email domain', (pagePath) => {
    const pageSource = readFileSync(pagePath, 'utf8')

    expect(pageSource).not.toMatch(/@xeroflow\.agency\b/i)
    expect(pageSource).toMatch(/@xeroflow\.io\b/i)
  })
})
