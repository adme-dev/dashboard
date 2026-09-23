import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

type WorkflowStep = { uses?: string, with?: Record<string, string>, run?: string, env?: Record<string, string> }

const workflow = parse(readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8'))
describe('manual ordinary Pages production release', () => {
  it('is an explicit dispatch choice, with successful full CI and production environment protection', () => {
    expect(workflow.on.workflow_dispatch.inputs.release_action.options).toContain('source-deploy')
    const job = workflow.jobs.source_deploy
    expect(job.needs).toBe('ci')
    expect(job.if).toBe('github.event_name == \'workflow_dispatch\' && github.ref == \'refs/heads/main\' && inputs.release_action == \'source-deploy\'')
    expect(job.environment).toBe('production_deploy')
    expect(workflow.concurrency['cancel-in-progress']).toBe('${{ github.event_name != \'workflow_dispatch\' }}')
    expect(workflow.concurrency.group).toContain('github.event_name == \'workflow_dispatch\' && \'release\' || \'check\'')
    expect(job.concurrency).toEqual({ 'group': 'agency-dashboard-production-release', 'cancel-in-progress': false })
  })
  it('checks out the tested dispatch SHA and executes only the guarded production deployment', () => {
    const steps = workflow.jobs.source_deploy.steps
    expect(steps.find((step: WorkflowStep) => step.uses?.startsWith('actions/checkout@')).with.ref).toBe('${{ github.sha }}')
    const guard = steps.findIndex((step: WorkflowStep) => step.run?.includes('pnpm deploy:check'))
    const deploy = steps.findIndex((step: WorkflowStep) => step.run === 'pnpm deploy:production')
    expect(guard).toBeGreaterThan(-1)
    expect(deploy).toBeGreaterThan(guard)
    expect(steps[guard].run).toContain('git rev-parse origin/main')
    expect(steps.map((step: WorkflowStep) => step.run ?? '').join('\n')).not.toMatch(/wrangler.*pages.*deploy|--commit-dirty|--project-name/)
    expect(steps[deploy].env.CLOUDFLARE_API_TOKEN).toBe('${{ secrets.CLOUDFLARE_API_TOKEN }}')
    expect(JSON.stringify(workflow.jobs.ci)).not.toContain('CLOUDFLARE_API_TOKEN')
  })
  it('preserves the signed artifact CRM release as a separate explicit operation', () => {
    expect(workflow.jobs.deploy.if).toContain('inputs.release_action == \'deploy\'')
    expect(JSON.stringify(workflow.jobs.deploy)).toContain('pnpm crm-search:release:production')
    expect(JSON.stringify(workflow.jobs.source_deploy)).not.toContain('crm-search:release:production')
  })
})
