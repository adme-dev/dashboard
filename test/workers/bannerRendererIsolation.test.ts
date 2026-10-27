import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { validateBannerRendererTarget } from '../../workers/banner-renderer/deploy.mjs'

describe('private renderer deployment isolation', () => {
  const read = (environment: string) => JSON.parse(readFileSync(`workers/banner-renderer/wrangler.${environment}.jsonc`, 'utf8'))
  it.each(['production', 'staging'])('validates the reviewed %s target', (environment) => {
    expect(() => validateBannerRendererTarget(read(environment), environment)).not.toThrow()
  })
  it.each(['production', 'staging'])('requires public resource routing for %s calls inherited from Pages', (environment) => {
    const config = read(environment)
    expect(config.compatibility_flags).toContain('global_fetch_strictly_public')
    for (const flags of [['nodejs_compat'], ['nodejs_compat', 'global_fetch_private_origin']]) {
      expect(() => validateBannerRendererTarget({ ...config, compatibility_flags: flags }, environment)).toThrow()
    }
  })
  it.each([
    { workers_dev: true }, { preview_urls: true }, { routes: ['*'] },
    { services: [{ binding: 'DB' }] }, { browser: { binding: 'BROWSER', remote: true } },
    { vars: { BANNER_RENDER_ENVIRONMENT: 'staging' } }
  ])('rejects unreviewed capability or environment %s', (change) => {
    expect(() => validateBannerRendererTarget({ ...read('production'), ...change }, 'production')).toThrow()
  })
  it('keeps Puppeteer out of the pure shared module', () => {
    const contract = readFileSync('shared/bannerRenderContract.ts', 'utf8')
    expect(contract).not.toMatch(/\bimport\s|\brequire\(/)
  })
})
