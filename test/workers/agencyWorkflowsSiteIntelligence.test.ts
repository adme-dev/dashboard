import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import {
  SITE_INTELLIGENCE_CRAWL_WORKFLOW_KIND as SERVER_KIND,
  buildSiteIntelligenceCrawlWorkflowInstanceId as buildServerInstanceId,
  normalizeSiteIntelligenceCrawlWorkflowPayload as normalizeServerPayload
} from '~~/server/utils/agencyWorkflows/siteIntelligenceCrawl'
import {
  SITE_INTELLIGENCE_CRAWL_WORKFLOW_KIND,
  buildSiteIntelligenceCrawlWorkflowInstanceId,
  normalizeSiteIntelligenceCrawlWorkflowPayload,
  parseWorkflowRequestBody
} from '../../workers/agency-workflows/src/contracts'
import { handleAgencyWorkflowsFetch } from '../../workers/agency-workflows/src/index'

vi.mock('cloudflare:workers', () => ({
  WorkflowEntrypoint: class {
    env: unknown

    constructor(_ctx: unknown, env: unknown) {
      this.env = env
    }
  }
}))

const RUN_ID = '11111111-1111-4111-8111-111111111111'
const DOMAIN_ID = '22222222-2222-4222-8222-222222222222'
const CLIENT_ID = '33333333-3333-4333-8333-333333333333'
const USER_ID = '44444444-4444-4444-8444-444444444444'

const payloadInput = {
  kind: 'site.intelligence.crawl',
  runId: RUN_ID,
  domainId: DOMAIN_ID,
  clientId: CLIENT_ID,
  trigger: 'manual',
  requestedBy: USER_ID
}

function workflowBinding() {
  return {
    create: vi.fn(async (options: { id?: string, params?: unknown }) => ({
      id: options.id ?? 'generated-id',
      status: async () => ({ status: 'queued' })
    })),
    get: vi.fn(async (id: string) => ({
      id,
      status: async () => ({ status: 'running' })
    }))
  }
}

function workflowEnv() {
  return {
    APP_BASE_URL: 'https://agency.example.com',
    AGENCY_WORKFLOWS_ENABLED: 'true',
    WORKFLOW_SERVICE_SECRET: 'workflow-secret',
    WORKFLOW_CALLBACK_SECRET: 'callback-secret',
    SOCIAL_PUBLISHING_WORKFLOW: workflowBinding(),
    SOCIAL_INBOX_AUTOMATION_WORKFLOW: workflowBinding(),
    SOCIAL_SPEND_REVIEW_WORKFLOW: workflowBinding(),
    BRIEF_LIFECYCLE_CHECK_WORKFLOW: workflowBinding(),
    CRM_FOLLOWUP_REVIEW_WORKFLOW: workflowBinding(),
    SITE_INTELLIGENCE_CRAWL_WORKFLOW: workflowBinding()
  }
}

describe('site intelligence workflow contract', () => {
  it('normalizes identical UUID-bound payloads on Pages and Worker sides', () => {
    expect(SERVER_KIND).toBe(SITE_INTELLIGENCE_CRAWL_WORKFLOW_KIND)
    expect(normalizeServerPayload(payloadInput)).toEqual(payloadInput)
    expect(normalizeSiteIntelligenceCrawlWorkflowPayload(payloadInput)).toEqual(payloadInput)
  })

  it('builds the deterministic run-scoped workflow instance id', () => {
    const payload = normalizeSiteIntelligenceCrawlWorkflowPayload(payloadInput)
    expect(buildSiteIntelligenceCrawlWorkflowInstanceId(payload)).toBe(`site-intel-${RUN_ID}`)
    expect(buildServerInstanceId(payload)).toBe(`site-intel-${RUN_ID}`)
  })

  it.each([
    [{ ...payloadInput, runId: undefined }, 'runId required'],
    [{ ...payloadInput, domainId: 'domain-1' }, 'domainId must be a UUID'],
    [{ ...payloadInput, clientId: '' }, 'clientId required'],
    [{ ...payloadInput, requestedBy: 'user-1' }, 'requestedBy must be a UUID'],
    [{ ...payloadInput, trigger: 'cron' }, 'Unsupported trigger: cron']
  ])('rejects malformed site intelligence payloads', (input, message) => {
    expect(() => normalizeSiteIntelligenceCrawlWorkflowPayload(input)).toThrow(message)
  })

  it('parses the stable start-workflow discriminator', () => {
    const body = parseWorkflowRequestBody({
      workflow: SITE_INTELLIGENCE_CRAWL_WORKFLOW_KIND,
      payload: payloadInput
    })

    expect(body).toEqual({
      workflow: SITE_INTELLIGENCE_CRAWL_WORKFLOW_KIND,
      payload: payloadInput
    })
  })

  it('advertises and starts the crawl workflow on its own binding', async () => {
    const env = workflowEnv()
    const health = await handleAgencyWorkflowsFetch(
      new Request('https://agency-workflows.example.com/health'),
      env as never
    )
    await expect(health.json()).resolves.toMatchObject({
      ok: true,
      workflows: expect.arrayContaining([{
        kind: SITE_INTELLIGENCE_CRAWL_WORKFLOW_KIND,
        binding: 'SITE_INTELLIGENCE_CRAWL_WORKFLOW',
        bindingConfigured: true
      }])
    })

    const response = await handleAgencyWorkflowsFetch(
      new Request('https://agency-workflows.example.com/workflows/start', {
        method: 'POST',
        headers: {
          'authorization': 'Bearer workflow-secret',
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          workflow: SITE_INTELLIGENCE_CRAWL_WORKFLOW_KIND,
          payload: payloadInput
        })
      }),
      env as never
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      workflow: SITE_INTELLIGENCE_CRAWL_WORKFLOW_KIND,
      instanceId: `site-intel-${RUN_ID}`
    })
    expect(env.SITE_INTELLIGENCE_CRAWL_WORKFLOW.create).toHaveBeenCalledWith({
      id: `site-intel-${RUN_ID}`,
      params: payloadInput
    })
  })

  it('declares the crawl workflow binding in Wrangler', () => {
    const config = readFileSync('workers/agency-workflows/wrangler.toml', 'utf8')
    expect(config).toContain('name = "site-intelligence-crawl-workflow"')
    expect(config).toContain('binding = "SITE_INTELLIGENCE_CRAWL_WORKFLOW"')
    expect(config).toContain('class_name = "SiteIntelligenceCrawlWorkflow"')
  })
})
