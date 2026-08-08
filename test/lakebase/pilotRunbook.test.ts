import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const runbookPath = resolve(repositoryRoot, 'docs/runbooks/neon-lakebase-search-pilot.md')

const expectedScripts = {
  'pilot:lakebase:preflight': 'tsx scripts/lakebase-pilot/preflight.ts --json',
  'pilot:lakebase:enable': 'tsx scripts/lakebase-pilot/enable.ts --json',
  'pilot:lakebase:setup': 'tsx scripts/lakebase-pilot/setup.ts --json',
  'pilot:lakebase:evaluate': 'tsx scripts/lakebase-pilot/evaluate.ts',
  'pilot:lakebase:teardown': 'tsx scripts/lakebase-pilot/teardown.ts --json'
} as const

const expectedEnvironment = [
  'LAKEBASE_PILOT_PROJECT_ID=',
  'LAKEBASE_PILOT_ENDPOINT_ID=',
  'LAKEBASE_PILOT_DATABASE_URL=',
  'NEON_PRODUCTION_PROJECT_ID=',
  'LAKEBASE_PILOT_CONFIRM_NON_PRODUCTION_PROJECT=',
  'LAKEBASE_PILOT_MODE=off',
  'NEON_API_KEY='
]

describe('Lakebase pilot operator contract', () => {
  it('exposes only the stable local pilot commands and empty pilot environment examples', async () => {
    const packageJson = JSON.parse(await readFile(resolve(repositoryRoot, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>
    }
    const environment = await readFile(resolve(repositoryRoot, '.env.example'), 'utf8')

    expect(Object.fromEntries(Object.entries(packageJson.scripts || {})
      .filter(([name]) => name.startsWith('pilot:lakebase:'))))
      .toEqual(expectedScripts)
    expect(environment.split(/\r?\n/).filter(line => line.startsWith('LAKEBASE_PILOT_') || line.startsWith('NEON_PRODUCTION_PROJECT_ID=') || line.startsWith('NEON_API_KEY=')))
      .toEqual(expectedEnvironment)
  })

  it('documents a fail-closed non-production pilot sequence without credentials or complete URLs', async () => {
    const runbook = await readFile(runbookPath, 'utf8')

    expect(runbook).toMatch(/separate non-production Neon project/i)
    expect(runbook).toMatch(/refus(?:e|es|al)[\s\S]*production project/i)
    expect(runbook).toMatch(/refus(?:e|es|al)[\s\S]*production database/i)
    expect(runbook).toMatch(/pnpm pilot:lakebase:preflight[\s\S]*pnpm pilot:lakebase:enable[\s\S]*wake\/restart confirmation[\s\S]*pnpm pilot:lakebase:preflight[\s\S]*pnpm pilot:lakebase:setup[\s\S]*pnpm pilot:lakebase:evaluate -- --runs 20/i)
    expect(runbook).toMatch(/at least five minutes[\s\S]*no pilot\s+connections[\s\S]*pnpm pilot:lakebase:evaluate -- --runs 20 --cold-start/i)
    expect(runbook).toMatch(/--cold-start[\s\S]*operator assertion[\s\S]*does not suspend or\s+restart compute/i)
    expect(runbook).toMatch(/Cloudflare Vectorize[\s\S]*production migrations[\s\S]*deployments[\s\S]*untouched/i)
    expect(runbook).toMatch(/MRR improvement.*>=?\s*0\.10[\s\S]*Precision@5.*not worse/i)
    expect(runbook).toMatch(/p95 improvement.*>=?\s*0\.30[\s\S]*Precision@5.*MRR.*do not regress/i)
    expect(runbook).toMatch(/review eligibility only/i)
    expect(runbook).toMatch(/evidence retention[\s\S]*exact target\s+re-verification[\s\S]*teardown/i)
    expect(runbook).toMatch(/removes only.*lakebase_pilot[\s\S]*never[\s\S]*project[\s\S]*endpoint[\s\S]*database/i)
    expect(runbook).toMatch(/publication-recovery[\s\S]*inspect.*preserve evidence[\s\S]*not.*delet.*broad/i)
    expect(runbook).not.toMatch(/(?:postgres(?:ql)?:\/\/|https?:\/\/|NEON_API_KEY=[^\s`#]+)/i)
  })
})
