import { afterEach, expect, it, vi } from 'vitest'
import { assertPublicFormChallenge, verifyPublicFormChallenge } from '~~/server/utils/pageStudio/publicFormChallenge'

const identity = { hostname: 'site.example.com', clientAddress: '203.0.113.4', identityDigest: 'a'.repeat(64) }
const env = { PAGE_STUDIO_PUBLIC_FORM_TURNSTILE_SECRET: 'test-only-secret' }
const success = { success: true, hostname: identity.hostname, action: 'page_studio_public_form' }
afterEach(() => vi.useRealTimers())
it('verifies a fixed provider endpoint and binds a local proof to the exact admitted intent', async () => {
  const fetch = vi.fn(async (_url: string, _init?: RequestInit) => Response.json(success))
  const proof = await verifyPublicFormChallenge(identity, 'challenge', env, { fetch })
  expect(fetch.mock.calls[0]?.[0]).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify')
  const init = fetch.mock.calls[0]?.[1]
  expect(init?.redirect).toBe('error')
  expect(init?.method).toBe('POST')
  expect(JSON.parse(String(init?.body))).toEqual({ secret: env.PAGE_STUDIO_PUBLIC_FORM_TURNSTILE_SECRET, response: 'challenge', remoteip: identity.clientAddress, idempotency_key: expect.any(String) })
  expect(assertPublicFormChallenge(proof, identity)).toMatchObject({ challengeDigest: expect.stringMatching(/^[a-f0-9]{64}$/) })
  expect(JSON.stringify(proof)).toBe('{}')
  expect(() => assertPublicFormChallenge({}, identity)).toThrow()
  expect(() => assertPublicFormChallenge(proof, { ...identity, identityDigest: 'b'.repeat(64) })).toThrow()
  expect(() => assertPublicFormChallenge(proof, { ...identity, clientAddress: '203.0.113.5' })).toThrow()
})
it.each(['failure', 'hostname', 'action', 'http', 'invalid-json', 'oversize', 'stream-oversize', 'redirect', 'network'])('denies %s without returning a proof or provider detail', async (kind) => {
  const fetch = vi.fn(async () => {
    if (kind === 'network') throw new Error('secret provider detail')
    if (kind === 'failure') return Response.json({ ...success, success: false })
    if (kind === 'hostname') return Response.json({ ...success, hostname: 'other.example.com' })
    if (kind === 'action') return Response.json({ ...success, action: 'login' })
    if (kind === 'http') return new Response('provider detail', { status: 500 })
    if (kind === 'redirect') return new Response(null, { status: 302, headers: { location: 'https://attacker.invalid' } })
    if (kind === 'invalid-json') return new Response('invalid')
    if (kind === 'stream-oversize') return new Response(new ReadableStream({ start(controller) {
      controller.enqueue(new Uint8Array(16_385))
      controller.close()
    } }), { headers: { 'content-length': '1' } })
    return new Response(' '.repeat(16_385))
  })
  await expect(verifyPublicFormChallenge(identity, 'challenge', env, { fetch })).rejects.toMatchObject({ code: 'PUBLIC_FORM_CHALLENGE_REQUIRED' })
})
it('requires configured keys, a bounded token and an observed single IP before any request', async () => {
  const fetch = vi.fn()
  for (const [input, token, config] of [[identity, '', env], [identity, 'a'.repeat(2049), env], [identity, 'challenge', {}], [{ ...identity, clientAddress: '203.0.113.4, 127.0.0.1' }, 'challenge', env]] as const) {
    await expect(verifyPublicFormChallenge(input, token, config, { fetch })).rejects.toThrow()
  }
  expect(fetch).not.toHaveBeenCalled()
})
it('expires verified local proofs and bounds stalled response bodies', async () => {
  vi.useFakeTimers()
  const proof = await verifyPublicFormChallenge(identity, 'challenge', env, { fetch: async () => Response.json(success) })
  vi.advanceTimersByTime(30_001)
  expect(() => assertPublicFormChallenge(proof, identity)).toThrow()
  const cancel = vi.fn()
  const pending = verifyPublicFormChallenge(identity, 'challenge', env, { fetch: async () => new Response(new ReadableStream({ cancel })) })
  const rejection = expect(pending).rejects.toMatchObject({ code: 'PUBLIC_FORM_CHALLENGE_REQUIRED' })
  await vi.advanceTimersByTimeAsync(5001)
  await rejection
  expect(cancel).toHaveBeenCalledOnce()
})
