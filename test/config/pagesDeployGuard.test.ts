import { describe, expect, it } from 'vitest'

import {
  ALLOWED_PAGES_PROJECT,
  assertDormantCrmSearch,
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

  it('allows ordinary deployment only while CRM provider calls remain disabled', () => {
    const dormantConfig = `
[env.production.vars]
CRM_SEARCH_PROVIDER_APIS_ENABLED = "false"
`
    const activeConfig = `
[env.production.vars]
CRM_SEARCH_PROVIDER_APIS_ENABLED = "true"
`

    expect(() => assertDormantCrmSearch(dormantConfig, 'main')).not.toThrow()
    expect(() => assertDormantCrmSearch(activeConfig, 'main'))
      .toThrow(/CRM search activation requires the signed release command/i)
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
    const [deploySource, frozenSource] = await import('node:fs/promises').then(async fs => [
      await fs.readFile(new URL('../../scripts/deploy-pages.mjs', import.meta.url), 'utf8'),
      await fs.readFile(new URL('../../scripts/crm-search/deploy-pages-artifact.mjs', import.meta.url), 'utf8')
    ])
    expect(`${deploySource}\n${frozenSource}`).not.toContain('--commit-dirty=true')
    expect(frozenSource).not.toMatch(/run\(['"]pnpm['"],\s*\[['"]build['"]\]\)/)
    expect(deploySource).toContain('runCrmSearchPagesRelease')
    expect(deploySource).toContain('runFrozenPagesRelease')
    expect(deploySource).toContain('production_deploy')
  })

  it('builds ordinary Pages releases while reserving frozen evidence for explicit CRM activation', async () => {
    const [deploySource, workflowSource] = await Promise.all([
      import('node:fs/promises').then(fs => fs.readFile(
        new URL('../../scripts/deploy-pages.mjs', import.meta.url), 'utf8'
      )),
      import('node:fs/promises').then(fs => fs.readFile(
        new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8'
      ))
    ])

    expect(deploySource).toContain('runSourcePagesDeploy')
    expect(deploySource).toContain('--crm-search-release')
    expect(workflowSource).toContain('pnpm crm-search:release:production')
  })

  it('rejects unsupported branch names', () => {
    expect(() => buildPagesDeployArgs('dealer-network')).toThrow(/unsupported Pages branch/i)
  })
})
