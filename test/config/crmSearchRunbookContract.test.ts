import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (name: string) => readFileSync(new URL(`../../docs/runbooks/${name}`, import.meta.url), 'utf8')
const project = (name: string) => readFileSync(new URL(`../../${name}`, import.meta.url), 'utf8')

describe('CRM search release runbooks', () => {
  it('pins capacity thresholds and keeps ordinary retries dashboard-only', () => {
    const operations = read('crm-search-operations.md')
    expect(operations).toMatch(/warn[^\n]*60%/i)
    expect(operations).toMatch(/page[^\n]*80%/i)
    expect(operations).toMatch(/block[^\n]*90%/i)
    expect(operations).toMatch(/keyword error rate/i)
    expect(operations).toMatch(/queue age/i)
    expect(operations).toMatch(/keyword error rate[^\n]*1%[^\n]*page/i)
    expect(operations).toMatch(/queue age[^\n]*900[^\n]*page/i)
    expect(operations).toMatch(/90%[^\n]*(?:reject|block)[^\n]*(?:approval|backfill)/i)
    expect(operations).toMatch(/existing[^\n]*(?:delete|reconcil)/i)
    expect(operations).toMatch(/self-healing retries[^\n]*dashboard-only/i)
  })

  it('requires sealed holdout replacement, dedicated key, exact R2 readback and both digests', () => {
    const evaluation = read('crm-search-evaluation.md')
    expect(evaluation).toContain('CRM_SEARCH_SEALED_HOLDOUT_KEYRING')
    expect(evaluation).toContain('crm-search/evaluation/holdouts/holdout-v1.json')
    expect(evaluation).toMatch(/replace[^\n]*synthetic sealed envelope/i)
    expect(evaluation).toMatch(/object SHA-256/i)
    expect(evaluation).toMatch(/decrypted judgement SHA-256/i)
    expect(evaluation).toMatch(/productionReady[^\n]*true/i)
    expect(evaluation).not.toMatch(/CRM_SEARCH_(?:SERVICE|ANALYTICS|CONFIRMATION).*KEY/i)
  })

  it('orders all six approvals and sentinel readiness before backfill/promotion', () => {
    const rollout = read('crm-search-staged-rollout.md')
    const ordered = [
      'resource_provision', 'production_migration', 'production_deploy',
      'client_indexing', 'client_shadow', 'client_assist'
    ].map(value => rollout.indexOf(value))
    expect(ordered.every(value => value >= 0)).toBe(true)
    expect(ordered).toEqual([...ordered].sort((a, b) => a - b))
    expect(rollout.indexOf('metadata indexes')).toBeLessThan(rollout.indexOf('backfill'))
    expect(rollout.indexOf('sentinel readiness')).toBeLessThan(rollout.indexOf('backfill'))
    expect(rollout).toMatch(/reconciliation[^\n]*evaluation[^\n]*promotion/i)
  })

  it('pins Node and makes the production CI job consume frozen artifacts only', () => {
    expect(project('.nvmrc').trim()).toBe('24.18.0')
    const pkg = JSON.parse(project('package.json')) as {
      engines: { node: string }
      scripts: Record<string, string>
    }
    expect(pkg.engines.node).toBe('24.18.0')
    expect(pkg.scripts['crm-search:artifact:verify']).toContain('--dry-run')
    expect(pkg.scripts['crm-search:migrate:test']).toContain('--dry-run')
    const ci = project('.github/workflows/ci.yml')
    expect(ci).toContain('Build and sign frozen release bytes')
    expect(ci).toContain('Upload frozen release artifact')
    const deployJob = ci.slice(ci.indexOf('\n  deploy:'))
    expect(deployJob).toContain('environment: production_deploy')
    expect(deployJob).toContain('Download frozen release artifact')
    expect(deployJob).toContain('Download signed production approval')
    expect(deployJob).not.toContain('pnpm run build')
    expect(deployJob).not.toContain('cloudflare/wrangler-action')
    expect(deployJob).not.toContain('--commit-dirty=true')
    expect(deployJob).toContain('CRM_SEARCH_RELEASE_APPROVAL_DATABASE_URL')
    expect(deployJob).toContain('crm-search:consumer:upload')
  })

  it('documents independent release/sealed keys without a local secret fallback', () => {
    const env = project('.env.example')
    const dev = project('.dev.vars.example')
    for (const name of [
      'CRM_SEARCH_RESOURCE_APPROVAL_VERIFICATION_KEYRING',
      'CRM_SEARCH_RESOURCE_MANIFEST_VERIFICATION_KEYRING',
      'CRM_SEARCH_SEALED_HOLDOUT_KEYRING'
    ]) {
      expect(env).toContain(`${name}=`)
      expect(dev).toContain(`${name}=`)
    }
    expect(project('docs/ENVIRONMENT_VARIABLES.md')).toMatch(/no process-environment fallback/i)
  })
})
