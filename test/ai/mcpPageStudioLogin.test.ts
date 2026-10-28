import { afterEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { signMcpAssertion, verifyMcpAssertion } from '~~/server/utils/ai/mcp/assertion'
import { consumeMcpRequestClaim, getConsumedMcpPageStudioLogin } from '~~/server/utils/ai/mcp/requestClaim'
import { digestMcpRequestBody, MCP_REQUEST_AUDIENCE, signMcpRequestClaim, verifyMcpRequestClaim } from '~~/shared/utils/mcpRequestClaim'

const uid = '11111111-1111-4111-8111-111111111111'
const other = '22222222-2222-4222-8222-222222222222'
const now = 1_800_000_000_000
const proof = { role: 'agency' as const, userId: uid, tokenHash: 'a'.repeat(64), issuedAt: now - 60_000, expiresAt: now + 600_000 }
const secret = 'test-transport-signing-secret'
const tool = 'marketing_publish_website_version'
const body = { userId: uid, tool, args: { siteId: other }, idempotencyKey: `mcp:${'b'.repeat(64)}` }
const event = () => ({ context: {} }) as H3Event
const input = async () => ({ uid, scope: ['mcp:read', 'mcp:write'], godMode: false, audience: MCP_REQUEST_AUDIENCE, method: 'POST' as const, path: '/api/internal/mcp/call' as const, toolName: tool, bodyDigest: await digestMcpRequestBody(body), pageStudioLogin: proof })
const dependencies = { signingSecret: secret, scopeHeader: undefined, now, body, method: 'POST', path: '/api/internal/mcp/call', resolveAuthority: vi.fn().mockResolvedValue(null), consumeNonce: vi.fn().mockResolvedValue(true) }
afterEach(() => vi.useRealTimers())

describe('original Page Studio login proof over MCP', () => {
  it('preserves the actual original login identity through the signed OAuth handshake', async () => {
    const assertion = await signMcpAssertion(uid, secret, { now, pageStudioLogin: proof })
    expect(await verifyMcpAssertion(assertion, secret, { now })).toEqual({ uid, scope: ['mcp:read'], pageStudioLogin: proof })
    for (const invalid of [{ ...proof, userId: other }, { ...proof, role: 'client' }, { ...proof, tokenHash: 'raw-token' }, { ...proof, expiresAt: proof.issuedAt }, { ...proof, credential: 'secret' }]) {
      await expect(signMcpAssertion(uid, secret, { now, pageStudioLogin: invalid as typeof proof })).rejects.toThrow()
    }
  })
  it('signs the proof with the exact operation and denies malformed or cross-actor proof', async () => {
    const encoded = await signMcpRequestClaim(await input(), secret, { now })
    expect(await verifyMcpRequestClaim(encoded, secret, { now })).toMatchObject({ pageStudioLogin: proof, toolName: tool })
    await expect(signMcpRequestClaim({ ...await input(), pageStudioLogin: { ...proof, userId: other } }, secret, { now })).rejects.toThrow()
  })
  it('requires successful nonce consumption and binds the accessor to user, tool and request expiry', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
    const e = event()
    expect(getConsumedMcpPageStudioLogin(e, uid, tool)).toBeNull()
    const encoded = await signMcpRequestClaim(await input(), secret, { now })
    await consumeMcpRequestClaim(e, encoded, uid, dependencies)
    const login = getConsumedMcpPageStudioLogin(e, uid, tool)!
    expect(login).toEqual({ ...proof, issuedAt: new Date(proof.issuedAt), expiresAt: new Date(proof.expiresAt) })
    login.expiresAt.setTime(0)
    expect(getConsumedMcpPageStudioLogin(e, uid, tool)?.expiresAt.getTime()).toBe(proof.expiresAt)
    expect(getConsumedMcpPageStudioLogin(e, other, tool)).toBeNull()
    expect(getConsumedMcpPageStudioLogin(e, uid, 'marketing_submit_website_version')).toBeNull()
    expect(getConsumedMcpPageStudioLogin({ context: e.context } as H3Event, uid, tool)).toBeNull()
    vi.setSystemTime(now + 31_000)
    expect(getConsumedMcpPageStudioLogin(e, uid, tool)).toBeNull()
    const denied = event()
    await expect(consumeMcpRequestClaim(denied, encoded, uid, { ...dependencies, consumeNonce: async () => false })).rejects.toThrow()
    expect(getConsumedMcpPageStudioLogin(denied, uid, tool)).toBeNull()
  })
  it('keeps legacy grants working but gives them no Studio proof and rejects expired original login', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
    const { pageStudioLogin: _proof, ...legacy } = await input()
    const e = event()
    await consumeMcpRequestClaim(e, await signMcpRequestClaim(legacy, secret, { now }), uid, dependencies)
    expect(getConsumedMcpPageStudioLogin(e, uid, tool)).toBeNull()
    const expired = event()
    const encoded = await signMcpRequestClaim({ ...await input(), pageStudioLogin: { ...proof, issuedAt: now - 120_000, expiresAt: now - 1 } }, secret, { now })
    await consumeMcpRequestClaim(expired, encoded, uid, dependencies)
    expect(getConsumedMcpPageStudioLogin(expired, uid, tool)).toBeNull()
  })
})
