import { describe, expect, it } from 'vitest'
import pkg from '../../package.json'
import { buildPagesDeployArgs } from '../../scripts/deploy-pages.mjs'

describe('deploy scripts', () => {
  it('routes default and production deploys through the guarded main-branch launcher', () => {
    expect(pkg.scripts.deploy).toBe('node scripts/deploy-pages.mjs main')
    expect(pkg.scripts['deploy:production']).toBe('node scripts/deploy-pages.mjs main')
    expect(buildPagesDeployArgs('main')).toContain('main')
  })
})
