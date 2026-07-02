import { readFileSync } from 'node:fs'
import { parse } from 'smol-toml'
import { describe, expect, it } from 'vitest'

interface WorkflowToml {
  workers_dev?: boolean
  vars?: Record<string, unknown>
  workflows?: Array<Record<string, unknown>>
}

interface PagesToml {
  vars?: Record<string, unknown>
  services?: Array<Record<string, unknown>>
}

describe('agency workflows worker config', () => {
  it('does not expose the control worker on workers.dev by default', () => {
    const config = parse(readFileSync('workers/agency-workflows/wrangler.toml', 'utf8')) as WorkflowToml

    expect(config.workers_dev).toBe(false)
  })

  it('declares the social publishing workflow binding', () => {
    const config = parse(readFileSync('workers/agency-workflows/wrangler.toml', 'utf8')) as WorkflowToml

    expect(config.workflows).toContainEqual({
      name: 'social-publishing-workflow',
      binding: 'SOCIAL_PUBLISHING_WORKFLOW',
      class_name: 'SocialPublishingWorkflow'
    })
  })

  it('declares the social inbox automation workflow binding', () => {
    const config = parse(readFileSync('workers/agency-workflows/wrangler.toml', 'utf8')) as WorkflowToml

    expect(config.workflows).toContainEqual({
      name: 'social-inbox-automation-workflow',
      binding: 'SOCIAL_INBOX_AUTOMATION_WORKFLOW',
      class_name: 'SocialInboxAutomationWorkflow'
    })
  })

  it('enables the workflow control plane explicitly in deploy config', () => {
    const workerConfig = parse(readFileSync('workers/agency-workflows/wrangler.toml', 'utf8')) as WorkflowToml
    const pagesConfig = parse(readFileSync('wrangler.toml', 'utf8')) as PagesToml

    expect(workerConfig.vars?.AGENCY_WORKFLOWS_ENABLED).toBe('true')
    expect(pagesConfig.vars?.AGENCY_WORKFLOWS_ENABLED).toBe('true')
  })

  it('keeps scheduled publishing workflow-primary cutover explicitly dormant until production smoke passes', () => {
    const pagesConfig = parse(readFileSync('wrangler.toml', 'utf8')) as PagesToml

    expect(pagesConfig.vars?.AGENCY_WORKFLOWS_SCHEDULED_PUBLISHING_PRIMARY).toBe('false')
  })

  it('keeps the workflow worker deployable through a root package script', () => {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts?: Record<string, string>
    }
    const workerPackageJson = JSON.parse(readFileSync('workers/agency-workflows/package.json', 'utf8')) as {
      scripts?: Record<string, string>
    }

    expect(packageJson.scripts?.['deploy:workflows']).toBe('pnpm --dir workers/agency-workflows run deploy')
    expect(packageJson.scripts?.['deploy:workflows:dry-run']).toBe('pnpm --dir workers/agency-workflows run deploy:dry-run')
    expect(workerPackageJson.scripts?.deploy).toBe('wrangler deploy --config wrangler.toml')
    expect(workerPackageJson.scripts?.['deploy:dry-run']).toBe('WRANGLER_WRITE_LOGS=false wrangler deploy --config wrangler.toml --dry-run')
  })

  it('binds the Pages app to the agency workflows worker', () => {
    const config = parse(readFileSync('wrangler.toml', 'utf8')) as PagesToml

    expect(config.services).toContainEqual({
      binding: 'AGENCY_WORKFLOWS',
      service: 'agency-workflows'
    })
  })
})
