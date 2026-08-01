import { WorkflowEntrypoint } from 'cloudflare:workers'
import type { WorkflowEvent, WorkflowStep } from 'cloudflare:workers'
import {
  getCloudflareCrawlRecords,
  getCloudflareCrawlStatus,
  startCloudflareCrawl
} from '../../../server/utils/siteIntelligence/cloudflareCrawl'

import {
  SOCIAL_INBOX_AUTOMATION_WORKFLOW_KIND,
  SOCIAL_PUBLISHING_WORKFLOW_KIND,
  SOCIAL_SPEND_REVIEW_WORKFLOW_KIND,
  BRIEF_LIFECYCLE_CHECK_WORKFLOW_KIND,
  CRM_FOLLOWUP_REVIEW_WORKFLOW_KIND,
  SITE_INTELLIGENCE_CRAWL_WORKFLOW_KIND,
  type AgencyWorkflowEnv,
  type BriefLifecycleCheckWorkflowPayload,
  type CrmFollowupReviewWorkflowPayload,
  type SocialInboxAutomationWorkflowPayload,
  type SocialPublishingWorkflowPayload,
  type SocialSpendReviewWorkflowPayload,
  type SiteIntelligenceCrawlWorkflowPayload,
  type WorkflowBindingLike,
  buildBriefLifecycleCheckWorkflowInstanceId,
  buildCrmFollowupReviewWorkflowInstanceId,
  buildSocialInboxAutomationWorkflowInstanceId,
  buildSocialPublishingWorkflowInstanceId,
  buildSocialSpendReviewWorkflowInstanceId,
  buildSiteIntelligenceCrawlWorkflowInstanceId,
  normalizeBriefLifecycleCheckWorkflowPayload,
  normalizeCrmFollowupReviewWorkflowPayload,
  normalizeSocialInboxAutomationWorkflowPayload,
  normalizeSocialPublishingWorkflowPayload,
  normalizeSocialSpendReviewWorkflowPayload,
  normalizeSiteIntelligenceCrawlWorkflowPayload,
  parseWorkflowRequestBody,
  workflowFeatureEnabled
} from './contracts'

type JsonRecord = Record<string, unknown>
interface CrawlWorkflowSettings {
  origin: string
  discoveryMode: 'all' | 'sitemaps' | 'links'
  includePatterns: string[]
  excludePatterns: string[]
  includeSubdomains: boolean
  renderMode: 'auto' | 'static' | 'browser'
  pageLimit: number
  depth: number
  crawlPurposes: Array<'search' | 'ai-input'>
}

interface WorkflowCrawlRecord {
  url: string
  status: 'queued' | 'errored' | 'completed' | 'disallowed' | 'skipped' | 'cancelled'
  html?: string
  markdown?: string
  metadata: { status?: number, title?: string, url: string }
}

interface WorkflowCrawlPage {
  status: string
  browserSecondsUsed: number
  total: number
  finished: number
  skipped: number
  records: WorkflowCrawlRecord[]
  cursor?: string
}

function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init)
}

function unauthorized(): Response {
  return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
}

function serviceUnavailable(message: string): Response {
  return json({ ok: false, error: message }, { status: 503 })
}

function requireServiceAuth(request: Request, env: AgencyWorkflowEnv): Response | null {
  const expected = env.WORKFLOW_SERVICE_SECRET?.trim()
  if (!expected) return serviceUnavailable('WORKFLOW_SERVICE_SECRET is not configured')
  return request.headers.get('Authorization') === `Bearer ${expected}` ? null : unauthorized()
}

async function readJson(request: Request): Promise<JsonRecord> {
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('Expected JSON object body')
  }
  return body as JsonRecord
}

function callbackSecret(env: AgencyWorkflowEnv): string {
  const secret = env.WORKFLOW_CALLBACK_SECRET?.trim() || env.WORKFLOW_SERVICE_SECRET?.trim()
  if (!secret) throw new Error('WORKFLOW_CALLBACK_SECRET is not configured')
  return secret
}

function appBaseUrl(env: AgencyWorkflowEnv): string {
  const baseUrl = env.APP_BASE_URL?.trim().replace(/\/+$/, '')
  if (!baseUrl) throw new Error('APP_BASE_URL is not configured')
  return baseUrl
}

export class SocialPublishingWorkflow extends WorkflowEntrypoint<AgencyWorkflowEnv, SocialPublishingWorkflowPayload> {
  async run(event: WorkflowEvent<SocialPublishingWorkflowPayload>, step: WorkflowStep) {
    const payload = normalizeSocialPublishingWorkflowPayload(event.payload)
    if (payload.scheduledAt) {
      const wakeAt = Date.parse(payload.scheduledAt)
      if (wakeAt > Date.now()) {
        await step.sleepUntil('wait until scheduled social publish time', wakeAt)
      }
    }

    return await step.do(
      'publish social post through Pages',
      { retries: { limit: 3, delay: '30 seconds', backoff: 'exponential' }, timeout: '2 minutes' },
      async () => {
        const response = await fetch(`${appBaseUrl(this.env)}/api/internal/workflows/social-publishing/publish`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-workflow-secret': callbackSecret(this.env)
          },
          body: JSON.stringify(payload)
        })
        const text = await response.text()
        if (!response.ok) {
          throw new Error(`Pages publish callback failed: ${response.status} ${text.slice(0, 200)}`)
        }
        return {
          ok: true,
          status: response.status,
          bodyText: text ? text.slice(0, 1000) : null
        }
      }
    )
  }
}

export class SocialInboxAutomationWorkflow extends WorkflowEntrypoint<AgencyWorkflowEnv, SocialInboxAutomationWorkflowPayload> {
  async run(event: WorkflowEvent<SocialInboxAutomationWorkflowPayload>, step: WorkflowStep) {
    const payload = normalizeSocialInboxAutomationWorkflowPayload(event.payload)

    return await step.do(
      'run social inbox automation through Pages',
      { retries: { limit: 3, delay: '30 seconds', backoff: 'exponential' }, timeout: '2 minutes' },
      async () => {
        const response = await fetch(`${appBaseUrl(this.env)}/api/internal/workflows/social-inbox/automation`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-workflow-secret': callbackSecret(this.env)
          },
          body: JSON.stringify(payload)
        })
        const text = await response.text()
        if (!response.ok) {
          throw new Error(`Pages inbox automation callback failed: ${response.status} ${text.slice(0, 200)}`)
        }
        return {
          ok: true,
          status: response.status,
          bodyText: text ? text.slice(0, 1000) : null
        }
      }
    )
  }
}

export class SocialSpendReviewWorkflow extends WorkflowEntrypoint<AgencyWorkflowEnv, SocialSpendReviewWorkflowPayload> {
  async run(event: WorkflowEvent<SocialSpendReviewWorkflowPayload>, step: WorkflowStep) {
    const payload = normalizeSocialSpendReviewWorkflowPayload(event.payload)

    return await step.do(
      'run social spend review through Pages',
      { retries: { limit: 2, delay: '1 minute', backoff: 'exponential' }, timeout: '2 minutes' },
      async () => {
        const response = await fetch(`${appBaseUrl(this.env)}/api/internal/workflows/social-spend/review`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-workflow-secret': callbackSecret(this.env)
          },
          body: JSON.stringify(payload)
        })
        const text = await response.text()
        if (!response.ok) {
          throw new Error(`Pages spend review callback failed: ${response.status} ${text.slice(0, 200)}`)
        }
        return {
          ok: true,
          status: response.status,
          bodyText: text ? text.slice(0, 1000) : null
        }
      }
    )
  }
}

export class BriefLifecycleCheckWorkflow extends WorkflowEntrypoint<AgencyWorkflowEnv, BriefLifecycleCheckWorkflowPayload> {
  async run(event: WorkflowEvent<BriefLifecycleCheckWorkflowPayload>, step: WorkflowStep) {
    const payload = normalizeBriefLifecycleCheckWorkflowPayload(event.payload)

    return await step.do(
      'run brief lifecycle check through Pages',
      { retries: { limit: 2, delay: '1 minute', backoff: 'exponential' }, timeout: '2 minutes' },
      async () => {
        const response = await fetch(`${appBaseUrl(this.env)}/api/internal/workflows/briefs/lifecycle-check`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-workflow-secret': callbackSecret(this.env)
          },
          body: JSON.stringify(payload)
        })
        const text = await response.text()
        if (!response.ok) {
          throw new Error(`Pages brief lifecycle callback failed: ${response.status} ${text.slice(0, 200)}`)
        }
        return {
          ok: true,
          status: response.status,
          bodyText: text ? text.slice(0, 1000) : null
        }
      }
    )
  }
}

export class CrmFollowupReviewWorkflow extends WorkflowEntrypoint<AgencyWorkflowEnv, CrmFollowupReviewWorkflowPayload> {
  async run(event: WorkflowEvent<CrmFollowupReviewWorkflowPayload>, step: WorkflowStep) {
    const payload = normalizeCrmFollowupReviewWorkflowPayload(event.payload)

    return await step.do(
      'run crm follow-up review through Pages',
      { retries: { limit: 2, delay: '1 minute', backoff: 'exponential' }, timeout: '2 minutes' },
      async () => {
        const response = await fetch(`${appBaseUrl(this.env)}/api/internal/workflows/crm/followup-review`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-workflow-secret': callbackSecret(this.env)
          },
          body: JSON.stringify(payload)
        })
        const text = await response.text()
        if (!response.ok) {
          throw new Error(`Pages CRM follow-up review callback failed: ${response.status} ${text.slice(0, 200)}`)
        }
        return {
          ok: true,
          status: response.status,
          bodyText: text ? text.slice(0, 1000) : null
        }
      }
    )
  }
}

export class SiteIntelligenceCrawlWorkflow extends WorkflowEntrypoint<AgencyWorkflowEnv, SiteIntelligenceCrawlWorkflowPayload> {
  async run(event: WorkflowEvent<SiteIntelligenceCrawlWorkflowPayload>, step: WorkflowStep) {
    const payload = normalizeSiteIntelligenceCrawlWorkflowPayload(event.payload)
    const run = await step.do('load immutable crawl configuration', async () => {
      const query = new URLSearchParams({ clientId: payload.clientId, domainId: payload.domainId })
      const response = await workflowCallback(this.env, `/api/internal/workflows/site-intelligence/runs/${payload.runId}/config?${query}`)
      const candidate = response.run as { settings?: Partial<CrawlWorkflowSettings> }
      return { settings: candidate.settings as CrawlWorkflowSettings }
    })
    const browserEnv = {
      accountId: requiredEnv(this.env.CLOUDFLARE_ACCOUNT_ID, 'CLOUDFLARE_ACCOUNT_ID'),
      apiToken: requiredEnv(this.env.BROWSER_RENDERING_API_TOKEN, 'BROWSER_RENDERING_API_TOKEN')
    }
    const settings = run.settings
    const started = await step.do('start Browser Run crawl', async () => startCloudflareCrawl(browserEnv, {
      url: String(settings.origin),
      source: settings.discoveryMode as 'all' | 'sitemaps' | 'links',
      formats: ['html', 'markdown'],
      render: settings.renderMode === 'browser',
      limit: Number(settings.pageLimit),
      depth: Number(settings.depth),
      crawlPurposes: settings.crawlPurposes as Array<'search' | 'ai-input'>,
      includePatterns: settings.includePatterns as string[],
      excludePatterns: settings.excludePatterns as string[],
      includeSubdomains: Boolean(settings.includeSubdomains)
    }))

    let crawlStatus: Awaited<ReturnType<typeof getCloudflareCrawlStatus>> | null = null
    for (let attempt = 0; attempt < 240; attempt++) {
      crawlStatus = await step.do(`poll Browser Run crawl ${attempt + 1}`, async () => (
        getCloudflareCrawlStatus(browserEnv, started.jobId)
      ))
      if (crawlStatus.status !== 'running') break
      await step.sleep('wait for crawl', '30 seconds')
    }

    let completedPages = 0
    let disallowedPages = 0
    let erroredPages = 0
    if (crawlStatus?.status === 'completed') {
      let cursor: string | undefined
      do {
        const pageCursor = cursor
        const page = await step.do(`fetch crawl records ${pageCursor || 'start'}`, async (): Promise<WorkflowCrawlPage> => {
          const raw = await getCloudflareCrawlRecords(browserEnv, started.jobId, pageCursor)
          return {
            status: raw.status,
            browserSecondsUsed: raw.browserSecondsUsed,
            total: raw.total,
            finished: raw.finished,
            skipped: raw.skipped,
            records: raw.records.map(record => ({
              url: record.url,
              status: record.status,
              ...(record.html !== undefined ? { html: record.html } : {}),
              ...(record.markdown !== undefined ? { markdown: record.markdown } : {}),
              metadata: {
                url: record.metadata.url,
                ...(record.metadata.status !== undefined ? { status: record.metadata.status } : {}),
                ...(record.metadata.title !== undefined ? { title: record.metadata.title } : {})
              }
            })),
            ...(raw.cursor ? { cursor: raw.cursor } : {})
          }
        })
        completedPages += page.records.filter(record => record.status === 'completed').length
        disallowedPages += page.records.filter(record => record.status === 'disallowed').length
        erroredPages += page.records.filter(record => record.status === 'errored').length
        await step.do(`ingest crawl records ${pageCursor || 'start'}`, async () => {
          const response = await workflowCallback(this.env, `/api/internal/workflows/site-intelligence/runs/${payload.runId}/ingest`, {
            clientId: payload.clientId,
            domainId: payload.domainId,
            batchKey: `${payload.runId}:${pageCursor || 'start'}:all`,
            records: page.records
          })
          return { ok: response.ok === true, replayed: response.replayed === true }
        })
        cursor = page.cursor
      } while (cursor)
    }

    const status = terminalRunStatus(crawlStatus?.status, completedPages, disallowedPages, erroredPages)
    const completion = {
      clientId: payload.clientId,
      domainId: payload.domainId,
      status,
      cloudflareJobId: started.jobId,
      totalPages: crawlStatus?.total ?? completedPages + disallowedPages + erroredPages,
      completedPages,
      disallowedPages,
      erroredPages,
      browserSeconds: crawlStatus?.browserSecondsUsed ?? 0,
      ...(status === 'failed' ? { errorCategory: 'browser_run', errorSummary: `Browser Run status: ${crawlStatus?.status || 'poll_timeout'}` } : {})
    }
    await step.do('complete crawl run', async () => {
      await workflowCallback(this.env, `/api/internal/workflows/site-intelligence/runs/${payload.runId}/complete`, completion)
      return { ok: true }
    })
    return completion
  }
}

function requiredEnv(value: string | undefined, name: string): string {
  const normalized = value?.trim()
  if (!normalized) throw new Error(`${name} is not configured`)
  return normalized
}

async function workflowCallback(env: AgencyWorkflowEnv, path: string, body?: unknown): Promise<JsonRecord> {
  const response = await fetch(`${appBaseUrl(env)}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'content-type': 'application/json',
      'x-workflow-secret': callbackSecret(env)
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`Pages crawl callback failed: ${response.status} ${text.slice(0, 200)}`)
  const parsed = text ? JSON.parse(text) : {}
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid Pages crawl callback')
  return parsed as JsonRecord
}

function terminalRunStatus(
  cloudflareStatus: string | undefined,
  completed: number,
  disallowed: number,
  errored: number
): 'completed' | 'partial' | 'blocked' | 'failed' | 'cancelled' {
  if (cloudflareStatus === 'completed') {
    if (completed === 0 && disallowed > 0) return 'blocked'
    return disallowed > 0 || errored > 0 ? 'partial' : 'completed'
  }
  if (cloudflareStatus?.startsWith('cancelled_')) return 'cancelled'
  return 'failed'
}

export async function handleAgencyWorkflowsFetch(request: Request, env: AgencyWorkflowEnv): Promise<Response> {
  const url = new URL(request.url)

  if (request.method === 'GET' && url.pathname === '/health') {
    const workflows = workflowHealth(env)
    return json({
      ok: workflows.every(workflow => workflow.bindingConfigured),
      worker: 'agency-workflows',
      enabled: workflowFeatureEnabled(env),
      workflows,
      capabilities: {
        browserRenderingApiConfigured: Boolean(
          env.CLOUDFLARE_ACCOUNT_ID?.trim()
          && env.BROWSER_RENDERING_API_TOKEN?.trim()
        )
      }
    })
  }

  if (url.pathname === '/workflows/start' && request.method === 'POST') {
    const authResponse = requireServiceAuth(request, env)
    if (authResponse) return authResponse
    if (!workflowFeatureEnabled(env)) return serviceUnavailable('Agency workflows are disabled')

    try {
      const body = parseWorkflowRequestBody(await readJson(request))
      const { instance, existing } = body.workflow === SOCIAL_PUBLISHING_WORKFLOW_KIND
        ? await startPublishingWorkflowInstance(env, body.payload)
        : body.workflow === SOCIAL_INBOX_AUTOMATION_WORKFLOW_KIND
          ? await startInboxAutomationWorkflowInstance(env, body.payload)
          : body.workflow === SOCIAL_SPEND_REVIEW_WORKFLOW_KIND
            ? await startSpendReviewWorkflowInstance(env, body.payload)
            : body.workflow === BRIEF_LIFECYCLE_CHECK_WORKFLOW_KIND
              ? await startBriefLifecycleCheckWorkflowInstance(env, body.payload)
              : body.workflow === CRM_FOLLOWUP_REVIEW_WORKFLOW_KIND
                ? await startCrmFollowupReviewWorkflowInstance(env, body.payload)
                : await startSiteIntelligenceCrawlWorkflowInstance(env, body.payload)
      return json({
        ok: true,
        workflow: body.workflow,
        instanceId: instance.id,
        status: await instance.status(),
        ...(existing ? { existing: true } : {})
      })
    } catch (error) {
      return json({ ok: false, error: errorMessage(error) }, { status: 400 })
    }
  }

  if (url.pathname === '/workflows/status' && request.method === 'GET') {
    const authResponse = requireServiceAuth(request, env)
    if (authResponse) return authResponse

    const workflow = url.searchParams.get('workflow')
    const instanceId = url.searchParams.get('instanceId')
    if (!instanceId || !isSupportedWorkflowKind(workflow)) {
      return json({ ok: false, error: 'workflow and instanceId are required' }, { status: 400 })
    }

    const instance = workflow === SOCIAL_PUBLISHING_WORKFLOW_KIND
      ? await env.SOCIAL_PUBLISHING_WORKFLOW.get(instanceId)
      : workflow === SOCIAL_INBOX_AUTOMATION_WORKFLOW_KIND
        ? await env.SOCIAL_INBOX_AUTOMATION_WORKFLOW.get(instanceId)
        : workflow === SOCIAL_SPEND_REVIEW_WORKFLOW_KIND
          ? await env.SOCIAL_SPEND_REVIEW_WORKFLOW.get(instanceId)
          : workflow === BRIEF_LIFECYCLE_CHECK_WORKFLOW_KIND
            ? await env.BRIEF_LIFECYCLE_CHECK_WORKFLOW.get(instanceId)
            : workflow === CRM_FOLLOWUP_REVIEW_WORKFLOW_KIND
              ? await env.CRM_FOLLOWUP_REVIEW_WORKFLOW.get(instanceId)
              : await env.SITE_INTELLIGENCE_CRAWL_WORKFLOW.get(instanceId)
    return json({ ok: true, workflow, instanceId: instance.id, status: await instance.status() })
  }

  return new Response('Not found', { status: 404 })
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isAlreadyExistingWorkflow(error: unknown): boolean {
  return /already exists|already exist|duplicate/i.test(errorMessage(error))
}

async function startPublishingWorkflowInstance(env: AgencyWorkflowEnv, payload: SocialPublishingWorkflowPayload) {
  const instanceId = buildSocialPublishingWorkflowInstanceId(payload)
  return await startWorkflowInstance(env.SOCIAL_PUBLISHING_WORKFLOW, instanceId, payload)
}

async function startInboxAutomationWorkflowInstance(env: AgencyWorkflowEnv, payload: SocialInboxAutomationWorkflowPayload) {
  const instanceId = buildSocialInboxAutomationWorkflowInstanceId(payload)
  return await startWorkflowInstance(env.SOCIAL_INBOX_AUTOMATION_WORKFLOW, instanceId, payload)
}

async function startSpendReviewWorkflowInstance(env: AgencyWorkflowEnv, payload: SocialSpendReviewWorkflowPayload) {
  const instanceId = buildSocialSpendReviewWorkflowInstanceId(payload)
  return await startWorkflowInstance(env.SOCIAL_SPEND_REVIEW_WORKFLOW, instanceId, payload)
}

async function startBriefLifecycleCheckWorkflowInstance(env: AgencyWorkflowEnv, payload: BriefLifecycleCheckWorkflowPayload) {
  const instanceId = buildBriefLifecycleCheckWorkflowInstanceId(payload)
  return await startWorkflowInstance(env.BRIEF_LIFECYCLE_CHECK_WORKFLOW, instanceId, payload)
}

async function startCrmFollowupReviewWorkflowInstance(env: AgencyWorkflowEnv, payload: CrmFollowupReviewWorkflowPayload) {
  const instanceId = buildCrmFollowupReviewWorkflowInstanceId(payload)
  return await startWorkflowInstance(env.CRM_FOLLOWUP_REVIEW_WORKFLOW, instanceId, payload)
}

async function startSiteIntelligenceCrawlWorkflowInstance(
  env: AgencyWorkflowEnv,
  payload: SiteIntelligenceCrawlWorkflowPayload
) {
  const instanceId = buildSiteIntelligenceCrawlWorkflowInstanceId(payload)
  return await startWorkflowInstance(env.SITE_INTELLIGENCE_CRAWL_WORKFLOW, instanceId, payload)
}

async function startWorkflowInstance<TPayload>(
  binding: WorkflowBindingLike<TPayload>,
  instanceId: string,
  payload: TPayload
) {
  let existing = false
  const instance = await binding.create({
    id: instanceId,
    params: payload
  }).catch(async (error: unknown) => {
    if (!isAlreadyExistingWorkflow(error)) throw error
    existing = true
    return await binding.get(instanceId)
  })
  return { instance, existing }
}

function workflowHealth(env: AgencyWorkflowEnv) {
  return [
    {
      kind: SOCIAL_PUBLISHING_WORKFLOW_KIND,
      binding: 'SOCIAL_PUBLISHING_WORKFLOW',
      bindingConfigured: isWorkflowBinding(env.SOCIAL_PUBLISHING_WORKFLOW)
    },
    {
      kind: SOCIAL_INBOX_AUTOMATION_WORKFLOW_KIND,
      binding: 'SOCIAL_INBOX_AUTOMATION_WORKFLOW',
      bindingConfigured: isWorkflowBinding(env.SOCIAL_INBOX_AUTOMATION_WORKFLOW)
    },
    {
      kind: SOCIAL_SPEND_REVIEW_WORKFLOW_KIND,
      binding: 'SOCIAL_SPEND_REVIEW_WORKFLOW',
      bindingConfigured: isWorkflowBinding(env.SOCIAL_SPEND_REVIEW_WORKFLOW)
    },
    {
      kind: BRIEF_LIFECYCLE_CHECK_WORKFLOW_KIND,
      binding: 'BRIEF_LIFECYCLE_CHECK_WORKFLOW',
      bindingConfigured: isWorkflowBinding(env.BRIEF_LIFECYCLE_CHECK_WORKFLOW)
    },
    {
      kind: CRM_FOLLOWUP_REVIEW_WORKFLOW_KIND,
      binding: 'CRM_FOLLOWUP_REVIEW_WORKFLOW',
      bindingConfigured: isWorkflowBinding(env.CRM_FOLLOWUP_REVIEW_WORKFLOW)
    },
    {
      kind: SITE_INTELLIGENCE_CRAWL_WORKFLOW_KIND,
      binding: 'SITE_INTELLIGENCE_CRAWL_WORKFLOW',
      bindingConfigured: isWorkflowBinding(env.SITE_INTELLIGENCE_CRAWL_WORKFLOW)
    }
  ]
}

function isSupportedWorkflowKind(input: string | null): input is typeof SOCIAL_PUBLISHING_WORKFLOW_KIND | typeof SOCIAL_INBOX_AUTOMATION_WORKFLOW_KIND | typeof SOCIAL_SPEND_REVIEW_WORKFLOW_KIND | typeof BRIEF_LIFECYCLE_CHECK_WORKFLOW_KIND | typeof CRM_FOLLOWUP_REVIEW_WORKFLOW_KIND | typeof SITE_INTELLIGENCE_CRAWL_WORKFLOW_KIND {
  return input === SOCIAL_PUBLISHING_WORKFLOW_KIND
    || input === SOCIAL_INBOX_AUTOMATION_WORKFLOW_KIND
    || input === SOCIAL_SPEND_REVIEW_WORKFLOW_KIND
    || input === BRIEF_LIFECYCLE_CHECK_WORKFLOW_KIND
    || input === CRM_FOLLOWUP_REVIEW_WORKFLOW_KIND
    || input === SITE_INTELLIGENCE_CRAWL_WORKFLOW_KIND
}

function isWorkflowBinding(input: unknown): boolean {
  return Boolean(
    input
    && typeof input === 'object'
    && typeof (input as { create?: unknown }).create === 'function'
    && typeof (input as { get?: unknown }).get === 'function'
  )
}

export default {
  fetch: handleAgencyWorkflowsFetch
} satisfies ExportedHandler<AgencyWorkflowEnv>
