import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  ALLOWED_PAGES_PROJECT,
  assertDormantCrmSearch,
  assertPagesDeployTarget,
  buildPagesDeployArgs,
  flattenRedirectedPagesConfig
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

  it('flattens the generated Pages config to the selected environment before Wrangler deploys', async () => {
    const repositoryRoot = await mkdtemp(path.join(tmpdir(), 'pages-deploy-config-'))
    const redirectDirectory = path.join(repositoryRoot, '.wrangler/deploy')
    const generatedDirectory = path.join(repositoryRoot, 'dist/_worker.js')
    await mkdir(redirectDirectory, { recursive: true })
    await mkdir(generatedDirectory, { recursive: true })
    await writeFile(path.join(redirectDirectory, 'config.json'), JSON.stringify({
      configPath: '../../dist/_worker.js/wrangler.json'
    }))
    await writeFile(path.join(generatedDirectory, 'wrangler.json'), JSON.stringify({
      name: 'agency-dashboard',
      compatibility_date: '2024-12-01',
      vars: { MODE: 'base' },
      env: {
        production: {
          vars: {
            MODE: 'production',
            CRM_SEARCH_PROVIDER_APIS_ENABLED: 'false'
          },
          kv_namespaces: [{ binding: 'CACHE', id: 'production-cache' }]
        },
        preview: {
          vars: {
            MODE: 'preview',
            CRM_SEARCH_PROVIDER_APIS_ENABLED: 'false'
          },
          kv_namespaces: [{ binding: 'CACHE', id: 'preview-cache' }]
        }
      }
    }))

    const generatedPath = flattenRedirectedPagesConfig({ repositoryRoot, branch: 'main' })
    const flattened = JSON.parse(await readFile(generatedPath, 'utf8'))

    expect(flattened).toMatchObject({
      name: 'agency-dashboard',
      compatibility_date: '2024-12-01',
      vars: {
        MODE: 'production',
        CRM_SEARCH_PROVIDER_APIS_ENABLED: 'false'
      },
      kv_namespaces: [{ binding: 'CACHE', id: 'production-cache' }]
    })
    expect(flattened).not.toHaveProperty('env')
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
