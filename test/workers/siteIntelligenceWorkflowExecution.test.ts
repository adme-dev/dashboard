import { describe, expect, it, vi } from 'vitest'

const mockStartCrawl = vi.fn()
const mockGetStatus = vi.fn()
const mockGetRecords = vi.fn()

vi.mock('cloudflare:workers', () => ({
  WorkflowEntrypoint: class {
    env: unknown

    constructor(_ctx: unknown, env: unknown) {
      this.env = env
    }
  }
}))
vi.mock('~~/server/utils/siteIntelligence/cloudflareCrawl', () => ({
  startCloudflareCrawl: (...args: unknown[]) => mockStartCrawl(...args),
  getCloudflareCrawlStatus: (...args: unknown[]) => mockGetStatus(...args),
  getCloudflareCrawlRecords: (...args: unknown[]) => mockGetRecords(...args)
}))

const { SiteIntelligenceCrawlWorkflow } = await import('../../workers/agency-workflows/src/index')

const RUN_ID = '11111111-1111-4111-8111-111111111111'
const DOMAIN_ID = '22222222-2222-4222-8222-222222222222'
const CLIENT_ID = '33333333-3333-4333-8333-333333333333'
const ORIGIN = 'https://www.example.com.au'

function stepHarness() {
  const sleeps: Array<[string, string]> = []
  return {
    sleeps,
    step: {
      do: vi.fn(async (_name: string, optionsOrCallback: unknown, maybeCallback?: () => Promise<unknown>) => {
        const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback
        return await callback!()
      }),
      sleep: vi.fn(async (name: string, duration: string) => {
        sleeps.push([name, duration])
      })
    }
  }
}

function callbackFetch() {
  return vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = new URL(String(input))
    if (url.pathname.endsWith('/config')) {
      return Response.json({
        run: {
          id: RUN_ID,
          clientId: CLIENT_ID,
          domainId: DOMAIN_ID,
          trigger: 'manual',
          settings: {
            origin: ORIGIN,
            discoveryMode: 'sitemaps',
            includePatterns: [],
            excludePatterns: [],
            includeSubdomains: false,
            renderMode: 'auto',
            pageLimit: 100,
            depth: 2,
            crawlPurposes: ['search']
          }
        }
      })
    }
    if (url.pathname.endsWith('/ingest')) return Response.json({ ok: true, replayed: false })
    if (url.pathname.endsWith('/complete')) return Response.json({ run: { id: RUN_ID, status: 'partial' } })
    return new Response('Not found', { status: 404 })
  })
}

describe('site intelligence crawl workflow execution', () => {
  it('durably polls, paginates, ingests, and completes without bypass retries', async () => {
    mockStartCrawl.mockReset().mockResolvedValue({ jobId: 'job-1' })
    mockGetStatus.mockReset()
      .mockResolvedValueOnce({ status: 'running' })
      .mockResolvedValueOnce({ status: 'completed', browserSecondsUsed: 1.2, total: 2, finished: 2, skipped: 0 })
    mockGetRecords.mockReset()
      .mockResolvedValueOnce({
        status: 'completed',
        browserSecondsUsed: 1.2,
        total: 2,
        finished: 2,
        skipped: 0,
        cursor: 'next',
        records: [{ url: ORIGIN, status: 'completed', markdown: '# Offer', metadata: { status: 200, url: ORIGIN } }]
      })
      .mockResolvedValueOnce({
        status: 'completed',
        browserSecondsUsed: 1.2,
        total: 2,
        finished: 2,
        skipped: 0,
        records: [{ url: `${ORIGIN}/blocked`, status: 'disallowed', metadata: { url: `${ORIGIN}/blocked` } }]
      })
    const fetchMock = callbackFetch()
    vi.stubGlobal('fetch', fetchMock)
    const { step, sleeps } = stepHarness()
    const workflow = new SiteIntelligenceCrawlWorkflow({}, {
      APP_BASE_URL: 'https://agency.example.com',
      WORKFLOW_CALLBACK_SECRET: 'callback-secret',
      CLOUDFLARE_ACCOUNT_ID: 'account-1',
      BROWSER_RENDERING_API_TOKEN: 'browser-secret'
    } as never)

    const result = await workflow.run({ payload: {
      kind: 'site.intelligence.crawl',
      runId: RUN_ID,
      domainId: DOMAIN_ID,
      clientId: CLIENT_ID,
      trigger: 'manual'
    } } as never, step as never)

    expect(result).toMatchObject({ status: 'partial', cloudflareJobId: 'job-1' })
    expect(sleeps).toEqual([['wait for crawl', '30 seconds']])
    expect(mockStartCrawl).toHaveBeenCalledTimes(1)
    expect(mockGetRecords).toHaveBeenNthCalledWith(1, expect.anything(), 'job-1', undefined)
    expect(mockGetRecords).toHaveBeenNthCalledWith(2, expect.anything(), 'job-1', 'next')
    const ingestCalls = fetchMock.mock.calls.filter(([input]) => String(input).endsWith('/ingest'))
    expect(ingestCalls).toHaveLength(2)
    const batches = ingestCalls.map(([, init]) => JSON.parse(String(init?.body)))
    expect(batches[0].batchKey).toBe(`${RUN_ID}:start:all`)
    expect(batches[1].batchKey).toBe(`${RUN_ID}:next:all`)
    expect(mockGetStatus).toHaveBeenCalledTimes(2)
  })
})
