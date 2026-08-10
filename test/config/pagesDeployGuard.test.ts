import { describe, expect, it } from 'vitest'

import {
  ALLOWED_PAGES_PROJECT,
  assertPagesDeployTarget,
  buildPagesDeployArgs
} from '../../scripts/deploy-pages.mjs'

describe('Pages deployment target guard', () => {
  it('allows only the XeroFlow agency-dashboard Pages project', () => {
    expect(ALLOWED_PAGES_PROJECT).toBe('agency-dashboard')
    expect(() => assertPagesDeployTarget({
      configuredProject: 'agency-dashboard',
      requestedProject: 'agency-dashboard'
    })).not.toThrow()
  })

  it('blocks a deployment requested for the dealer-network project', () => {
    expect(() => assertPagesDeployTarget({
      configuredProject: 'agency-dashboard',
      requestedProject: 'dealer-network'
    })).toThrow(/refusing Pages deployment.*dealer-network/i)
  })

  it('blocks deployment when wrangler.toml identifies another project', () => {
    expect(() => assertPagesDeployTarget({
      configuredProject: 'dealer-network',
      requestedProject: 'agency-dashboard'
    })).toThrow(/wrangler\.toml.*dealer-network/i)
  })

  it('builds a deployment command with an immutable project target', () => {
    expect(buildPagesDeployArgs('preview')).toEqual([
      'wrangler',
      '--cwd',
      'dist',
      'pages',
      'deploy',
      '--project-name',
      'agency-dashboard',
      '--branch',
      'preview'
    ])
  })

  it('never rebuilds or permits dirty input in the frozen-artifact deploy wrapper', async () => {
    const source = await import('node:fs/promises').then(async fs => [
      await fs.readFile(new URL('../../scripts/deploy-pages.mjs', import.meta.url), 'utf8'),
      await fs.readFile(new URL('../../scripts/crm-search/deploy-pages-artifact.mjs', import.meta.url), 'utf8')
    ].join('\n'))
    expect(source).not.toContain('--commit-dirty=true')
    expect(source).not.toMatch(/run\(['"]pnpm['"],\s*\[['"]build['"]\]\)/)
    expect(source).toContain('runFrozenPagesRelease')
    expect(source).toContain('production_deploy')
  })

  it('rejects unsupported branch names', () => {
    expect(() => buildPagesDeployArgs('dealer-network')).toThrow(/unsupported Pages branch/i)
  })
})
