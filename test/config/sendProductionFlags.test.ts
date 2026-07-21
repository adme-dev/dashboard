import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('private Send production flags', () => {
  it('keeps the server and internal UI enabled in the Pages runtime', () => {
    const config = readFileSync('wrangler.toml', 'utf8')

    expect(config).toContain('SEND_ENABLED = "true"')
    expect(config).toContain('NUXT_SEND_ENABLED = "true"')
    expect(config).toContain('NUXT_PUBLIC_SEND_ENABLED = "true"')
  })
})
