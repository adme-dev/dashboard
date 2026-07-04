import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import {
  checkAutomationGovernanceDocs,
  checkGraphifyArtifacts,
  resolveReadinessConfig,
  runAgencyWorkflowsReadiness
} from '../../scripts/agency-workflows-readiness.mjs'

function tempGraphifyDir(reportDate = '2026-07-02') {
  const dir = mkdtempSync(join(tmpdir(), 'graphify-readiness-'))
  writeFileSync(
    join(dir, 'graph.json'),
    JSON.stringify({
      nodes: [
        { id: 'server_utils_socialPublishing_ts', label: 'socialPublishing.ts' },
        { id: 'workers_agency-workflows_src_index_ts', label: 'workers/agency-workflows/src/index.ts' }
      ],
      links: [{ source: 'a', target: 'b' }]
    })
  )
  writeFileSync(
    join(dir, 'GRAPH_REPORT.md'),
    [
      `# Graph Report - .  (${reportDate})`,
      '',
      '## Summary',
      '- 2 nodes / 1 edges / 1 communities detected',
      ''
    ].join('\n')
  )
  return dir
}

function tempGovernanceRoot({ includeAdr = true, includePurpose = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'agency-workflows-governance-'))
  mkdirSync(join(root, 'docs', 'decisions'), { recursive: true })

  if (includePurpose) {
    writeFileSync(
      join(root, 'docs', 'project-purpose.md'),
      [
        '# Project Purpose',
        '',
        'Graphify stays current as the architecture map for agents.',
        '',
        '## Enterprise Bar',
        '',
        '- server-side authorization and tenant/client scoping;',
        '- updated architecture documentation when behavior changes.'
      ].join('\n')
    )
  }

  if (includeAdr) {
    writeFileSync(
      join(root, 'docs', 'decisions', 'ADR-003-cloudflare-workflows-automation-spine.md'),
      [
        '# ADR-003: Use Cloudflare Workflows as the Automation Spine',
        '',
        '## Decision',
        '',
        'Use Cloudflare Workflows as the durable automation spine.',
        '',
        'The Nuxt app remains the source of truth for:',
        '',
        '- authentication and RBAC;',
        '- audit logs;',
        '',
        '## Implementation Standards',
        '',
        '- Every Workflow instance ID must be deterministic.',
        '- App callbacks must validate shared secrets, feature flags, payload schema, and current database state.'
      ].join('\n')
    )
  }

  return root
}

describe('agency workflows readiness script', () => {
  it('requires project purpose and Workflows automation spine docs for enterprise automation releases', () => {
    const root = tempGovernanceRoot()
    try {
      const result = checkAutomationGovernanceDocs({ rootDir: root })

      expect(result.ok).toBe(true)
      expect(result.files).toEqual([
        'docs/project-purpose.md',
        'docs/decisions/ADR-003-cloudflare-workflows-automation-spine.md'
      ])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('blocks when the Workflows automation spine ADR is missing', () => {
    const root = tempGovernanceRoot({ includeAdr: false })
    try {
      const result = checkAutomationGovernanceDocs({ rootDir: root })

      expect(result.ok).toBe(false)
      expect(result.reason).toContain('ADR-003')
      expect(result.remediation).toContain('docs/decisions/ADR-003-cloudflare-workflows-automation-spine.md')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('requires current local Graphy artifacts for architecture-aware releases', () => {
    const dir = tempGraphifyDir('2026-07-02')
    try {
      const result = checkGraphifyArtifacts({
        graphifyDir: dir,
        now: new Date('2026-07-02T12:00:00Z'),
        maxAgeDays: 7
      })

      expect(result.ok).toBe(true)
      expect(result.nodeCount).toBe(2)
      expect(result.edgeCount).toBe(1)
      expect(result.reportDate).toBe('2026-07-02')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('fails when local Graphy artifacts are stale', () => {
    const dir = tempGraphifyDir('2026-06-15')
    try {
      const result = checkGraphifyArtifacts({
        graphifyDir: dir,
        now: new Date('2026-07-02T12:00:00Z'),
        maxAgeDays: 7
      })

      expect(result.ok).toBe(false)
      expect(result.reason).toContain('stale')
      expect(result.remediation).toContain('upload-graphify')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('points missing local Graphy setup at Obsidian when it is installed', () => {
    const root = mkdtempSync(join(tmpdir(), 'graphify-readiness-missing-'))
    const obsidianAppPath = join(root, 'Obsidian.app')
    mkdirSync(obsidianAppPath)
    try {
      const result = checkGraphifyArtifacts({
        graphifyDir: join(root, 'graphify-out'),
        now: new Date('2026-07-02T12:00:00Z'),
        maxAgeDays: 7,
        obsidianAppPath
      })

      expect(result.ok).toBe(false)
      expect(result.reason).toContain('missing')
      expect(result.remediation).toContain(obsidianAppPath)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('runs mandatory local gates and marks authenticated smoke blocked when no auth is configured', async () => {
    const dir = tempGraphifyDir('2026-07-02')
    const run = vi.fn(async () => ({ code: 0, stdout: 'ok', stderr: '' }))
    const log = vi.fn()
    try {
      const result = await runAgencyWorkflowsReadiness({
        env: {
          GRAPHIFY_OUT_DIR: dir,
          AGENCY_WORKFLOWS_READINESS_NOW: '2026-07-02T12:00:00Z'
        },
        runCommand: run,
        log
      })

      expect(result.ok).toBe(false)
      expect(result.status).toBe('blocked')
      expect(result.steps.map(step => step.name)).toEqual([
        'git status',
        'automation governance docs',
        'graphify artifacts',
        'workflow config tests',
        'worker typecheck',
        'worker deploy dry-run',
        'authenticated production smoke'
      ])
      expect(result.steps.find(step => step.name === 'authenticated production smoke')?.status).toBe('blocked')
      expect(run).toHaveBeenCalledWith('git', ['status', '--short', '--branch'])
      expect(run).toHaveBeenCalledWith('pnpm', ['exec', 'vitest', 'run', 'test/config/agencyWorkflowsBindings.test.ts'])
      expect(run).toHaveBeenCalledWith('pnpm', ['--dir', 'workers/agency-workflows', 'run', 'typecheck'])
      expect(run).toHaveBeenCalledWith('pnpm', ['run', 'deploy:workflows:dry-run'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('includes production smoke when shared-secret auth is configured', async () => {
    const config = resolveReadinessConfig({
      AGENCY_WORKFLOWS_SMOKE_SHARED_SECRET: 'machine-secret'
    })

    expect(config.hasProductionSmokeAuth).toBe(true)
  })
})
