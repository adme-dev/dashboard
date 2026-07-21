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
      'preview',
      '--commit-dirty=true',
      '--no-bundle'
    ])
  })

  it('rejects unsupported branch names', () => {
    expect(() => buildPagesDeployArgs('dealer-network')).toThrow(/unsupported Pages branch/i)
  })
})
