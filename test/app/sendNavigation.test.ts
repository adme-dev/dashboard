import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

describe('private Send navigation', () => {
  it('shows Send only behind the public UI feature flag', () => {
    const source = readFileSync('app/layouts/agency.vue', 'utf8')

    expect(source).toContain('runtimeConfig.public.sendEnabled')
    expect(source).toContain('label: \'Send\'')
    expect(source).toContain('to: \'/agency/send\'')
  })
})
