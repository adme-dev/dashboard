import { describe, expect, it } from 'vitest'
import pkg from '../../package.json'

describe('deploy scripts', () => {
  it('deploys the default Pages command to the production main branch', () => {
    expect(pkg.scripts.deploy).toContain('--branch main')
    expect(pkg.scripts['deploy:production']).toContain('--branch main')
  })
})
