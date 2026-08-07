import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const loginPages = [
  'app/pages/auth/login.vue',
  'app/pages/auth/xeroflow.vue',
  'app/pages/portal/login.vue'
]

describe('login support links', () => {
  it.each(loginPages)('%s opens a support email', (pagePath) => {
    const pageSource = readFileSync(pagePath, 'utf8')

    expect(pageSource).toContain('href="mailto:support@xeroflow.io"')
    expect(pageSource).not.toMatch(/Need help\?\s*<a href="#">/)
  })
})
