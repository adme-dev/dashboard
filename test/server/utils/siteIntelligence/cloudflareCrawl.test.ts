import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  CloudflareCrawlError,
  cancelCloudflareCrawl,
  getCloudflareCrawlRecords,
  getCloudflareCrawlStatus,
  startCloudflareCrawl
} from '~~/server/utils/siteIntelligence/cloudflareCrawl'

const fetchMock = vi.fn()
const env = {
  accountId: 'account-123',
  apiToken: 'super-secret-browser-token',
  fetchImpl: fetchMock
}

const config = {
  url: 'https://www.example.com.au',
  source: 'sitemaps' as const,
  formats: ['html', 'markdown'] as const,
  limit: 100,
  depth: 2,
  crawlPurposes: ['search'] as const,
  includePatterns: ['https://www.example.com.au/offers/**'],
  excludePatterns: ['https://www.example.com.au/privacy/**'],
  includeSubdomains: false
}

function apiResponse(result: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify({ success: true, result }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init
  })
}

beforeEach(() => {
  fetchMock.mockReset()
})

describe('Cloudflare Browser Run crawl client', () => {
  it('starts a static, same-site crawl with explicit content purposes', async () => {
    fetchMock.mockResolvedValue(apiResponse('job-123'))

    await expect(startCloudflareCrawl(env, config)).resolves.toEqual({ jobId: 'job-123' })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.cloudflare.com/client/v4/accounts/account-123/browser-rendering/crawl')
    expect(request.method).toBe('POST')
    expect(request.headers).toMatchObject({
      'authorization': 'Bearer super-secret-browser-token',
      'content-type': 'application/json'
    })
    expect(JSON.parse(String(request.body))).toEqual({
      url: 'https://www.example.com.au',
      source: 'sitemaps',
      formats: ['html', 'markdown'],
      render: false,
      limit: 100,
      depth: 2,
      crawlPurposes: ['search'],
      options: {
        includeExternalLinks: false,
        includeSubdomains: false,
        includePatterns: ['https://www.example.com.au/offers/**'],
        excludePatterns: ['https://www.example.com.au/privacy/**']
      }
    })
  })

  it('constrains zero-depth requests to the start page without widening discovery', async () => {
    fetchMock.mockResolvedValue(apiResponse('job-123'))

    await startCloudflareCrawl(env, { ...config, limit: 200, depth: 0 })

    const body = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body))
    expect(body).toMatchObject({ limit: 1, depth: 1 })
  })

  it.each([
    [{ ...config, limit: 201 }, 'limit'],
    [{ ...config, depth: 6 }, 'depth'],
    [{ ...config, formats: ['json'] }, 'formats'],
    [{ ...config, crawlPurposes: ['ai-train'] }, 'crawlPurposes']
  ])('rejects unsafe crawl configuration before fetch (%s)', async (unsafeConfig, field) => {
    await expect(startCloudflareCrawl(env, unsafeConfig as never)).rejects.toThrow(String(field))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('polls job status with a one-record response cap', async () => {
    fetchMock.mockResolvedValue(apiResponse({
      id: 'job-123',
      status: 'running',
      browserSecondsUsed: 0,
      total: 4,
      finished: 1,
      skipped: 0,
      records: []
    }))

    const result = await getCloudflareCrawlStatus(env, 'job-123')

    expect(result.status).toBe('running')
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://api.cloudflare.com/client/v4/accounts/account-123/browser-rendering/crawl/job-123?limit=1'
    )
  })

  it('reads a bounded cursor page of crawl records', async () => {
    fetchMock.mockResolvedValue(apiResponse({
      id: 'job-123',
      status: 'completed',
      browserSecondsUsed: 1.5,
      total: 1,
      finished: 1,
      skipped: 0,
      cursor: 20,
      records: [{
        url: 'https://www.example.com.au/offers/model-a',
        status: 'completed',
        markdown: '# Model A offer',
        metadata: {
          status: 200,
          title: 'Model A',
          url: 'https://www.example.com.au/offers/model-a'
        }
      }]
    }))

    const result = await getCloudflareCrawlRecords(env, 'job-123', '10')

    expect(result.cursor).toBe('20')
    expect(result.records).toHaveLength(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://api.cloudflare.com/client/v4/accounts/account-123/browser-rendering/crawl/job-123?limit=10&cursor=10'
    )
  })

  it('cancels a crawl through the documented job endpoint', async () => {
    fetchMock.mockResolvedValue(apiResponse({ job_id: 'job-123', message: 'cancelled' }))

    await expect(cancelCloudflareCrawl(env, 'job-123')).resolves.toBeUndefined()

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.cloudflare.com/client/v4/accounts/account-123/browser-rendering/crawl/job-123',
      expect.objectContaining({ method: 'DELETE' })
    )
  })

  it('redacts the API token and complete response body from errors', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      success: false,
      errors: [{
        code: 1000,
        message: `Denied super-secret-browser-token ${'x'.repeat(600)}`
      }]
    }), { status: 403 }))

    const error = await startCloudflareCrawl(env, config).catch(value => value)

    expect(error).toBeInstanceOf(CloudflareCrawlError)
    expect(error).toMatchObject({ status: 403, stage: 'start' })
    expect(error.message).not.toContain('super-secret-browser-token')
    expect(error.safeSummary.length).toBeLessThanOrEqual(200)
    expect(error.message.length).toBeLessThan(280)
  })

  it('rejects undocumented terminal job statuses', async () => {
    fetchMock.mockResolvedValue(apiResponse({
      id: 'job-123',
      status: 'mystery_terminal_state',
      browserSecondsUsed: 0,
      total: 0,
      finished: 0,
      skipped: 0,
      records: []
    }))

    await expect(getCloudflareCrawlStatus(env, 'job-123')).rejects.toMatchObject({ stage: 'status' })
  })
})
