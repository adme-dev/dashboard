import { describe, expect, it } from 'vitest'
import pkg from '../../package.json'
import { buildPagesDeployArgs } from '../../scripts/deploy-pages.mjs'

describe('deploy scripts', () => {
  it('defaults to guarded preview while keeping production explicit', () => {
    expect(pkg.scripts.deploy).toBe('node scripts/deploy-pages.mjs preview')
    expect(pkg.scripts['deploy:preview']).toBe('node scripts/deploy-pages.mjs preview')
    expect(pkg.scripts['deploy:production']).toBe('node scripts/deploy-pages.mjs main')
    expect(buildPagesDeployArgs('preview')).toContain('preview')
    expect(buildPagesDeployArgs('main')).toContain('main')
  })
})
