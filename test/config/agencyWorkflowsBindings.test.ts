import { readFileSync } from 'node:fs'
import { parse } from 'smol-toml'
import { describe, expect, it } from 'vitest'

interface WorkflowToml {
  workers_dev?: boolean
  workflows?: Array<Record<string, unknown>>
}

interface PagesToml {
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

  it('keeps the workflow worker deployable through a root package script', () => {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts?: Record<string, string>
    }

    expect(packageJson.scripts?.['deploy:workflows']).toBe('pnpm --dir workers/agency-workflows run deploy')
  })

  it('binds the Pages app to the agency workflows worker', () => {
    const config = parse(readFileSync('wrangler.toml', 'utf8')) as PagesToml

    expect(config.services).toContainEqual({
      binding: 'AGENCY_WORKFLOWS',
      service: 'agency-workflows'
    })
  })
})
