import { createError } from 'h3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { boundedMotorstackCall } from '~~/server/utils/banner/motorstackClient'

describe('MotorStack RPC error boundary', () => {
  afterEach(() => vi.useRealTimers())
  it.each([
    ['motorstack_not_configured', 503, 'not configured'],
    ['motorstack_unavailable', 502, 'temporarily unavailable'],
    ['asset_not_found', 502, 'brand or asset is unavailable'],
    ['asset_unavailable', 502, 'brand or asset is unavailable'],
    ['brand_not_available', 502, 'brand or asset is unavailable'],
    ['asset_type_refused', 502, 'safely imported']
  ])('maps %s to an actionable safe response', async (message, statusCode, expected) => {
    const error = Object.assign(new Error(message), { name: 'RPCError' })
    await expect(boundedMotorstackCall(Promise.reject(error))).rejects.toMatchObject({ statusCode, statusMessage: expect.stringContaining(expected) })
    await expect(boundedMotorstackCall(Promise.reject(error))).rejects.toMatchObject({ statusMessage: expect.stringMatching(/retry/i) })
  })
  it.each([
    new Error('Request failed https://provider.test?key=secret-value'),
    { statusCode: 401, statusMessage: 'provider credential secret-value', message: 'secret-value' },
    'secret-value'
  ])('does not expose unknown remote errors or accept their HTTP status', async (error) => {
    await expect(boundedMotorstackCall(Promise.reject(error))).rejects.toMatchObject({ statusCode: 502, statusMessage: 'MotorStack could not complete the request. Retry; if it continues, ask an administrator to check the connection.' })
  })
  it('retains local body-limit errors unchanged', async () => {
    const error = createError({ statusCode: 502, statusMessage: 'MotorStack asset exceeds the size limit' })
    await expect(boundedMotorstackCall(Promise.reject(error))).rejects.toBe(error)
  })
  it('retains the local 504 timeout and clears its timer', async () => {
    vi.useFakeTimers()
    const result = boundedMotorstackCall(new Promise<never>(() => {}), 20)
    const assertion = expect(result).rejects.toMatchObject({ statusCode: 504, statusMessage: 'MotorStack request timed out; retry this brand' })
    await vi.advanceTimersByTimeAsync(20)
    await assertion
    expect(vi.getTimerCount()).toBe(0)
  })
  it('does not change successful results and clears the timer', async () => {
    vi.useFakeTimers()
    expect(await boundedMotorstackCall(Promise.resolve({ ok: true }))).toEqual({ ok: true })
    expect(vi.getTimerCount()).toBe(0)
  })
})
