/* eslint-disable @stylistic/max-statements-per-line */
import { readFileSync } from 'node:fs'
import { createEvent, type H3Event } from 'h3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isFinanceReadMachineRequest, requireCronJobSecret, requireFinanceCronJob, getFinanceMachineHeaders } from '~~/server/utils/financeMachineAccess'

function event(path = '/api/xero/reports/pnl', method = 'GET', headers: Record<string, string> = {}, bindings?: Record<string, unknown>): H3Event {
  const e = createEvent({ method, url: path, headers: { host: 'localhost', ...headers } } as never, {} as never)
  if (bindings) e.context.cloudflare = { env: bindings } as never
  return e
}
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })
describe('narrow finance machine authority', () => {
  it.each(['GET', 'HEAD'])('accepts verified %s only on an exact confirmed read path', (method) => {
    expect(isFinanceReadMachineRequest(event('/api/xero/reports/pnl?periods=13', method, { 'x-internal-cron-secret': 'binding' }, { CRON_INTERNAL_SECRET: 'binding' }))).toBe(true)
  })
  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('rejects %s even with a valid internal secret', (method) => {
    expect(isFinanceReadMachineRequest(event(undefined, method, { 'x-internal-cron-secret': 'secret' }, { CRON_INTERNAL_SECRET: 'secret' }))).toBe(false)
  })
  it.each(['/api/xero/disconnect', '/api/xero/reports/pnl-extra', '/api/advisor/recommendations', '/api/ai/financial-advisor', '/api/xero/unknown'])('rejects unlisted read %s', (path) => {
    expect(isFinanceReadMachineRequest(event(path, 'GET', { 'x-internal-cron-secret': 'secret' }, { CRON_INTERNAL_SECRET: 'secret' }))).toBe(false)
  })
  it.each([undefined, '', '   ', false])('does not use process fallback for authoritative invalid binding %s', (binding) => {
    vi.stubEnv('CRON_INTERNAL_SECRET', 'process-secret')
    expect(isFinanceReadMachineRequest(event(undefined, 'GET', { 'x-internal-cron-secret': 'process-secret' }, { CRON_INTERNAL_SECRET: binding }))).toBe(false)
  })
  it('rejects missing, empty, incorrect secrets and forged context roles', () => {
    vi.stubEnv('CRON_INTERNAL_SECRET', '')
    const e = event()
    e.context.user = { id: 'cron', role: 'owner', permissionGroups: ['FINANCE'] }
    expect(isFinanceReadMachineRequest(e)).toBe(false)
    expect(isFinanceReadMachineRequest(event(undefined, 'GET', { 'x-internal-cron-secret': '' }, { CRON_INTERNAL_SECRET: '' }))).toBe(false)
    expect(isFinanceReadMachineRequest(event(undefined, 'GET', { 'x-internal-cron-secret': 'wrong' }, { CRON_INTERNAL_SECRET: 'right' }))).toBe(false)
  })
  it('permits a configured local process secret only without a request binding', () => {
    vi.stubEnv('CRON_INTERNAL_SECRET', 'local')
    expect(isFinanceReadMachineRequest(event(undefined, 'GET', { 'x-internal-cron-secret': 'local' }))).toBe(true)
  })
  it('requires POST and a configured exact job secret in development too', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('CRON_SECRET', '')
    expect(() => requireFinanceCronJob(event('/api/cron/anomaly-detection', 'POST'))).toThrowError(expect.objectContaining({ statusCode: 503 }))
    expect(() => requireFinanceCronJob(event('/api/cron/anomaly-detection', 'GET', { 'x-cron-secret': 'job' }, { CRON_SECRET: 'job' }))).toThrowError(expect.objectContaining({ statusCode: 405 }))
    expect(() => requireFinanceCronJob(event('/api/cron/anomaly-detection', 'POST', { 'x-cron-secret': 'bad' }, { CRON_SECRET: 'job' }))).toThrowError(expect.objectContaining({ statusCode: 401 }))
  })
  it('ignores a process job secret when an invalid request binding is present', () => {
    vi.stubEnv('CRON_SECRET', 'process')
    expect(() => requireFinanceCronJob(event('/api/cron/anomaly-detection', 'POST', { 'x-cron-secret': 'process' }, { CRON_SECRET: false }))).toThrowError(expect.objectContaining({ statusCode: 503 }))
  })
  it('adds internal fanout credentials only to a privately branded verified job', () => {
    const e = event('/api/cron/anomaly-detection', 'POST', { 'x-cron-secret': 'job', 'cookie': 'original' }, { CRON_SECRET: 'job', CRON_INTERNAL_SECRET: 'internal' })
    requireFinanceCronJob(e)
    const headers = getFinanceMachineHeaders(e)
    expect(headers.get('x-internal-cron-secret')).toBe('internal')
    expect(headers.get('cookie')).toBe('original')
    expect(e.headers.get('x-internal-cron-secret')).toBeNull()
    const spoofed = event('/api/cron/anomaly-detection', 'POST', { cookie: 'original' }, { CRON_SECRET: 'job', CRON_INTERNAL_SECRET: 'internal' })
    spoofed.context.user = { id: 'cron', role: 'owner' }
    expect(getFinanceMachineHeaders(spoofed).get('x-internal-cron-secret')).toBeNull()
  })
  it('fails closed if a verified job needs fanout but internal credentials are not configured', () => {
    const e = event('/api/cron/anomaly-detection', 'POST', { 'x-cron-secret': 'job' }, { CRON_SECRET: 'job', CRON_INTERNAL_SECRET: '' })
    requireFinanceCronJob(e)
    expect(() => getFinanceMachineHeaders(e)).toThrowError(expect.objectContaining({ statusCode: 503 }))
  })
})

it('does not grant finance fanout branding to independently authenticated marketing jobs', () => {
  const e = event('/api/cron/spend-auto-action', 'POST', { 'x-cron-secret': 'job' }, { CRON_SECRET: 'job', CRON_INTERNAL_SECRET: 'internal' })
  requireCronJobSecret(e)
  expect(getFinanceMachineHeaders(e).get('x-internal-cron-secret')).toBeNull()
  expect(() => requireFinanceCronJob(e)).toThrowError(expect.objectContaining({ statusCode: 403 }))
})

it('covers the actual exact Xero read paths used by warmup, advisor metrics and anomaly fanout', () => {
  for (const source of ['server/api/internal/warmup.post.ts', 'server/utils/advisorMetrics.ts', 'server/utils/anomalyDetection/sharedData.ts']) {
    const paths = [...readFileSync(source, 'utf8').matchAll(/['"](\/api\/xero\/[^'"]+)['"]/g)].map(m => m[1])
    expect(paths.length).toBeGreaterThan(0)
    for (const path of paths) expect(isFinanceReadMachineRequest(event(path, 'GET', { 'x-internal-cron-secret': 'internal' }, { CRON_INTERNAL_SECRET: 'internal' }))).toBe(true)
  }
})
