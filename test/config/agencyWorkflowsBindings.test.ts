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

  it('declares the social spend review workflow binding', () => {
    const config = parse(readFileSync('workers/agency-workflows/wrangler.toml', 'utf8')) as WorkflowToml

    expect(config.workflows).toContainEqual({
      name: 'social-spend-review-workflow',
      binding: 'SOCIAL_SPEND_REVIEW_WORKFLOW',
      class_name: 'SocialSpendReviewWorkflow'
    })
  })

  it('declares the brief lifecycle check workflow binding', () => {
    const config = parse(readFileSync('workers/agency-workflows/wrangler.toml', 'utf8')) as WorkflowToml

    expect(config.workflows).toContainEqual({
      name: 'brief-lifecycle-check-workflow',
      binding: 'BRIEF_LIFECYCLE_CHECK_WORKFLOW',
      class_name: 'BriefLifecycleCheckWorkflow'
    })
  })

  it('declares the crm follow-up review workflow binding', () => {
    const config = parse(readFileSync('workers/agency-workflows/wrangler.toml', 'utf8')) as WorkflowToml

    expect(config.workflows).toContainEqual({
      name: 'crm-followup-review-workflow',
      binding: 'CRM_FOLLOWUP_REVIEW_WORKFLOW',
      class_name: 'CrmFollowupReviewWorkflow'
    })
  })

  it('enables the workflow control plane explicitly in deploy config', () => {
    const workerConfig = parse(readFileSync('workers/agency-workflows/wrangler.toml', 'utf8')) as WorkflowToml
    const pagesConfig = parse(readFileSync('wrangler.toml', 'utf8')) as PagesToml

    expect(workerConfig.vars?.AGENCY_WORKFLOWS_ENABLED).toBe('true')
    expect(pagesConfig.vars?.AGENCY_WORKFLOWS_ENABLED).toBe('true')
  })

  it('keeps a deployed CI smoke verifier hash in Pages config', () => {
    const pagesConfig = parse(readFileSync('wrangler.toml', 'utf8')) as PagesToml

    expect(pagesConfig.vars?.AGENCY_WORKFLOWS_SMOKE_SHARED_SECRET_SHA256).toMatch(/^[a-f0-9]{64}$/)
  })

  it('keeps scheduled publishing workflow-primary cutover explicitly dormant until production smoke passes', () => {
    const pagesConfig = parse(readFileSync('wrangler.toml', 'utf8')) as PagesToml

    expect(pagesConfig.vars?.AGENCY_WORKFLOWS_SCHEDULED_PUBLISHING_PRIMARY).toBe('false')
  })

  it('keeps CRM follow-up workflow writes and primary cron delegation explicitly dormant', () => {
    const pagesConfig = parse(readFileSync('wrangler.toml', 'utf8')) as PagesToml

    expect(pagesConfig.vars?.AGENCY_WORKFLOWS_CRM_FOLLOWUP_WRITES_ENABLED).toBe('false')
    expect(pagesConfig.vars?.AGENCY_WORKFLOWS_CRM_FOLLOWUP_PRIMARY).toBe('false')
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

  it('keeps the workflow readiness gate available as a root package script', () => {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts?: Record<string, string>
    }

    expect(packageJson.scripts?.['readiness:agency-workflows']).toBe('node scripts/agency-workflows-readiness.mjs')
  })

  it('keeps Workflows readiness governance tests in the deploy-critical social publishing suite', () => {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts?: Record<string, string>
    }
    const socialPublishingTestCommand = packageJson.scripts?.['test:social-publishing'] ?? ''

    expect(socialPublishingTestCommand).toContain('test/config/agencyWorkflowsReadinessScript.test.ts')
    expect(socialPublishingTestCommand).toContain('test/config/agencyWorkflowsBindings.test.ts')
  })

  it('runs authenticated Workflows smoke after production deploy when CI auth secrets are configured', () => {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts?: Record<string, string>
    }
    const workflow = readFileSync('.github/workflows/ci.yml', 'utf8')

    expect(packageJson.scripts?.['smoke:agency-workflows:ci']).toBe('node scripts/agency-workflows-ci-smoke-gate.mjs')
    expect(workflow).toContain('Smoke agency workflows readiness')
    expect(workflow).toContain('AGENCY_WORKFLOWS_SMOKE_SHARED_SECRET')
    expect(workflow).toContain('AGENCY_WORKFLOWS_SMOKE_AUTH_TOKEN')
    expect(workflow).toContain('AGENCY_WORKFLOWS_SMOKE_COOKIE')
    expect(workflow).toContain('Sync agency workflows smoke verifier')
    expect(workflow).toContain('node scripts/sync-agency-workflows-smoke-verifier.mjs')
    expect(workflow).toContain('id: deploy')
    expect(workflow).toContain('AGENCY_WORKFLOWS_SMOKE_BASE_URL: ${{ steps.deploy.outputs.deployment-url }}')
    expect(workflow).toContain('pnpm run smoke:agency-workflows:ci')
  })

  it('binds the Pages app to the agency workflows worker', () => {
    const config = parse(readFileSync('wrangler.toml', 'utf8')) as PagesToml

    expect(config.services).toContainEqual({
      binding: 'AGENCY_WORKFLOWS',
      service: 'agency-workflows'
    })
  })
})
