import { z } from 'zod'

const CLOUDFLARE_API_BASE = 'https://api.cloudflare.com/client/v4/accounts'
const RECORD_PAGE_LIMIT = 10
const STATUS_PAGE_LIMIT = 1
const MAX_SUCCESS_RESPONSE_BYTES = 10 * 1024 * 1024
const MAX_ERROR_RESPONSE_BYTES = 16 * 1024
const MAX_SAFE_SUMMARY_LENGTH = 200

export type CloudflareCrawlStage = 'start' | 'status' | 'records' | 'cancel'

const environmentSchema = z.object({
  accountId: z.string().trim().min(1).max(200).regex(/^[A-Za-z0-9_-]+$/),
  apiToken: z.string().trim().min(1).max(2000),
  fetchImpl: z.function().optional()
})

const startConfigSchema = z.object({
  url: z.string().url().max(4096).refine((value) => {
    const protocol = new URL(value).protocol
    return protocol === 'http:' || protocol === 'https:'
  }, 'url must use HTTP(S)'),
  source: z.enum(['all', 'sitemaps', 'links']),
  formats: z.array(z.enum(['html', 'markdown'])).min(1).max(2),
  render: z.boolean().default(false),
  limit: z.number().int().min(1).max(200),
  depth: z.number().int().min(0).max(5),
  crawlPurposes: z.array(z.enum(['search', 'ai-input'])).min(1).max(2)
    .refine(values => values.includes('search'), 'crawlPurposes must include search'),
  includePatterns: z.array(z.string().trim().min(1).max(500)).max(50).default([]),
  excludePatterns: z.array(z.string().trim().min(1).max(500)).max(50).default([]),
  includeSubdomains: z.boolean().default(false)
})

const apiErrorSchema = z.object({
  code: z.union([z.number(), z.string()]).optional(),
  message: z.string().optional()
}).passthrough()

const apiEnvelopeSchema = z.object({
  success: z.boolean(),
  result: z.unknown().optional(),
  errors: z.array(apiErrorSchema).optional()
}).passthrough()

const jobStatusSchema = z.enum([
  'running',
  'cancelled_due_to_timeout',
  'cancelled_due_to_limits',
  'cancelled_by_user',
  'errored',
  'completed'
])

const crawlRecordSchema = z.object({
  url: z.string().url().max(4096),
  status: z.enum(['queued', 'errored', 'completed', 'disallowed', 'skipped', 'cancelled']),
  html: z.string().max(3_000_000).optional(),
  markdown: z.string().max(2_000_000).optional(),
  json: z.record(z.string(), z.unknown()).optional(),
  metadata: z.object({
    status: z.number().int().min(100).max(599).optional(),
    title: z.string().max(1000).optional(),
    url: z.string().url().max(4096)
  }).passthrough()
}).passthrough()

const crawlResultSchema = z.object({
  id: z.string().trim().min(1).max(200),
  status: jobStatusSchema,
  browserSecondsUsed: z.number().min(0).default(0),
  total: z.number().int().min(0).default(0),
  finished: z.number().int().min(0).default(0),
  skipped: z.number().int().min(0).default(0),
  records: z.array(crawlRecordSchema).default([]),
  cursor: z.union([z.string(), z.number()]).optional()
}).passthrough()

const startResultSchema = z.string().trim().min(1).max(200)
const cancelResultSchema = z.object({
  job_id: z.string().trim().min(1).max(200),
  message: z.string().max(1000)
}).passthrough()
const jobIdSchema = z.string().trim().min(1).max(200).regex(/^[A-Za-z0-9_-]+$/, 'jobId is invalid')
const cursorSchema = z.string().trim().min(1).max(500)

export interface CloudflareCrawlEnv {
  accountId: string
  apiToken: string
  fetchImpl?: typeof fetch
}

export interface CloudflareCrawlConfig {
  url: string
  source: 'all' | 'sitemaps' | 'links'
  formats: ReadonlyArray<'html' | 'markdown'>
  render?: boolean
  limit: number
  depth: number
  crawlPurposes: ReadonlyArray<'search' | 'ai-input'>
  includePatterns?: string[]
  excludePatterns?: string[]
  includeSubdomains?: boolean
}

export type CloudflareCrawlJobStatus = z.infer<typeof jobStatusSchema>
export type CloudflareCrawlRecord = z.infer<typeof crawlRecordSchema>

export interface CrawlStatusPage {
  id: string
  status: CloudflareCrawlJobStatus
  browserSecondsUsed: number
  total: number
  finished: number
  skipped: number
}

export interface CrawlRecordPage extends CrawlStatusPage {
  records: CloudflareCrawlRecord[]
  cursor?: string
}

export class CloudflareCrawlError extends Error {
  readonly status: number
  readonly stage: CloudflareCrawlStage
  readonly safeSummary: string

  constructor(stage: CloudflareCrawlStage, status: number, safeSummary: string) {
    super(`Cloudflare crawl ${stage} failed (${status}): ${safeSummary}`)
    this.name = 'CloudflareCrawlError'
    this.status = status
    this.stage = stage
    this.safeSummary = safeSummary
  }
}

export async function startCloudflareCrawl(
  inputEnv: CloudflareCrawlEnv,
  inputConfig: CloudflareCrawlConfig
): Promise<{ jobId: string }> {
  const env = parseEnvironment(inputEnv, 'start')
  const config = parseStartConfig(inputConfig, env.apiToken)
  const zeroDepth = config.depth === 0
  const body = {
    url: config.url,
    source: config.source,
    formats: config.formats,
    render: config.render,
    limit: zeroDepth ? 1 : config.limit,
    depth: zeroDepth ? 1 : config.depth,
    crawlPurposes: config.crawlPurposes,
    options: {
      includeExternalLinks: false,
      includeSubdomains: config.includeSubdomains,
      includePatterns: config.includePatterns,
      excludePatterns: config.excludePatterns
    }
  }

  const result = await requestCloudflare(env, 'start', '', {
    method: 'POST',
    headers: requestHeaders(env.apiToken),
    body: JSON.stringify(body)
  }, startResultSchema)
  return { jobId: result }
}

export async function getCloudflareCrawlStatus(
  inputEnv: CloudflareCrawlEnv,
  inputJobId: string
): Promise<CrawlStatusPage> {
  const env = parseEnvironment(inputEnv, 'status')
  const jobId = parseJobId(inputJobId, env.apiToken, 'status')
  const result = await requestCloudflare(
    env,
    'status',
    `/${encodeURIComponent(jobId)}?limit=${STATUS_PAGE_LIMIT}`,
    { method: 'GET', headers: requestHeaders(env.apiToken) },
    crawlResultSchema
  )
  return statusPage(result)
}

export async function getCloudflareCrawlRecords(
  inputEnv: CloudflareCrawlEnv,
  inputJobId: string,
  inputCursor?: string
): Promise<CrawlRecordPage> {
  const env = parseEnvironment(inputEnv, 'records')
  const jobId = parseJobId(inputJobId, env.apiToken, 'records')
  const cursor = inputCursor === undefined
    ? undefined
    : parseValue(cursorSchema, inputCursor, env.apiToken, 'records', 'cursor')
  const query = new URLSearchParams({ limit: String(RECORD_PAGE_LIMIT) })
  if (cursor) query.set('cursor', cursor)

  const result = await requestCloudflare(
    env,
    'records',
    `/${encodeURIComponent(jobId)}?${query.toString()}`,
    { method: 'GET', headers: requestHeaders(env.apiToken) },
    crawlResultSchema
  )
  if (result.records.length > RECORD_PAGE_LIMIT) {
    throw crawlError('records', 502, 'Cloudflare returned too many crawl records', env.apiToken)
  }
  return {
    ...statusPage(result),
    records: result.records,
    ...(result.cursor !== undefined ? { cursor: String(result.cursor) } : {})
  }
}

export async function cancelCloudflareCrawl(
  inputEnv: CloudflareCrawlEnv,
  inputJobId: string
): Promise<void> {
  const env = parseEnvironment(inputEnv, 'cancel')
  const jobId = parseJobId(inputJobId, env.apiToken, 'cancel')
  await requestCloudflare(
    env,
    'cancel',
    `/${encodeURIComponent(jobId)}`,
    { method: 'DELETE', headers: requestHeaders(env.apiToken) },
    cancelResultSchema
  )
}

function parseEnvironment(input: CloudflareCrawlEnv, stage: CloudflareCrawlStage) {
  const parsed = environmentSchema.safeParse(input)
  if (!parsed.success) {
    throw crawlError(stage, 500, `Invalid Cloudflare environment: ${parsed.error.issues[0]?.path.join('.') || 'unknown'}`, '')
  }
  return {
    accountId: parsed.data.accountId,
    apiToken: parsed.data.apiToken,
    fetchImpl: (input.fetchImpl ?? fetch) as typeof fetch
  }
}

function parseStartConfig(input: CloudflareCrawlConfig, token: string) {
  const parsed = startConfigSchema.safeParse(input)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    throw crawlError('start', 400, `Invalid ${issue?.path.join('.') || 'crawl configuration'}: ${issue?.message || 'rejected'}`, token)
  }
  return parsed.data
}

function parseJobId(input: string, token: string, stage: CloudflareCrawlStage): string {
  return parseValue(jobIdSchema, input, token, stage, 'jobId')
}

function parseValue<T>(
  schema: z.ZodType<T>,
  input: unknown,
  token: string,
  stage: CloudflareCrawlStage,
  field: string
): T {
  const parsed = schema.safeParse(input)
  if (!parsed.success) throw crawlError(stage, 400, `Invalid ${field}`, token)
  return parsed.data
}

function requestHeaders(token: string): Record<string, string> {
  return {
    'authorization': `Bearer ${token}`,
    'content-type': 'application/json'
  }
}

async function requestCloudflare<T>(
  env: ReturnType<typeof parseEnvironment>,
  stage: CloudflareCrawlStage,
  suffix: string,
  init: RequestInit,
  resultSchema: z.ZodType<T>
): Promise<T> {
  const url = `${CLOUDFLARE_API_BASE}/${encodeURIComponent(env.accountId)}/browser-rendering/crawl${suffix}`
  let response: Response
  try {
    response = await env.fetchImpl(url, init)
  } catch (error) {
    throw crawlError(stage, 0, error instanceof Error ? error.message : 'Network request failed', env.apiToken)
  }

  const responseLimit = response.ok ? MAX_SUCCESS_RESPONSE_BYTES : MAX_ERROR_RESPONSE_BYTES
  const text = await readBoundedText(response, responseLimit).catch((error) => {
    throw crawlError(stage, response.status, error instanceof Error ? error.message : 'Response read failed', env.apiToken)
  })
  const json = parseJson(text)
  const envelope = apiEnvelopeSchema.safeParse(json)

  if (!response.ok || !envelope.success || !envelope.data.success) {
    const summary = envelope.success
      ? envelope.data.errors?.map(error => error.message || String(error.code || '')).filter(Boolean).join('; ')
      : response.statusText || 'Invalid Cloudflare error response'
    throw crawlError(stage, response.status, summary || 'Cloudflare request rejected', env.apiToken)
  }

  const result = resultSchema.safeParse(envelope.data.result)
  if (!result.success) {
    throw crawlError(
      stage,
      response.status,
      `Invalid Cloudflare response: ${result.error.issues[0]?.path.join('.') || 'result'}`,
      env.apiToken
    )
  }
  return result.data
}

async function readBoundedText(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return ''
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let size = 0
  let output = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > maxBytes) {
      await reader.cancel()
      throw new Error('Cloudflare response exceeded the safe size limit')
    }
    output += decoder.decode(value, { stream: true })
  }
  return output + decoder.decode()
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function statusPage(result: z.infer<typeof crawlResultSchema>): CrawlStatusPage {
  return {
    id: result.id,
    status: result.status,
    browserSecondsUsed: result.browserSecondsUsed,
    total: result.total,
    finished: result.finished,
    skipped: result.skipped
  }
}

function crawlError(
  stage: CloudflareCrawlStage,
  status: number,
  summary: string,
  token: string
): CloudflareCrawlError {
  let safe = String(summary || 'Unknown Cloudflare crawl error')
  for (const secret of [token, token ? `Bearer ${token}` : '']) {
    if (secret) safe = safe.split(secret).join('[redacted]')
  }
  safe = safe.replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [redacted]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_SAFE_SUMMARY_LENGTH)
  return new CloudflareCrawlError(stage, status, safe || 'Unknown Cloudflare crawl error')
}
