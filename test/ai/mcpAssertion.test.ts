import { describe, it, expect } from 'vitest'
import { signMcpAssertion, verifyMcpAssertion } from '~~/server/utils/ai/mcp/assertion'

const SECRET = 'test-handshake-secret'

describe('MCP assertion sign/verify', () => {
  it('round-trips a userId (defaults to mcp:read scope)', async () => {
    const a = await signMcpAssertion('user-123', SECRET)
    expect(await verifyMcpAssertion(a, SECRET)).toEqual({ uid: 'user-123', scope: ['mcp:read'] })
  })

  it('round-trips a granted write scope', async () => {
    const a = await signMcpAssertion('user-123', SECRET, { scope: ['mcp:read', 'mcp:write'] })
    expect(await verifyMcpAssertion(a, SECRET)).toEqual({ uid: 'user-123', scope: ['mcp:read', 'mcp:write'] })
  })

  it('does not accept or carry a client-supplied God-mode bit', async () => {
    const a = await signMcpAssertion('user-123', SECRET, {
      scope: ['mcp:read'],
      godMode: true
    } as any)

    expect(await verifyMcpAssertion(a, SECRET)).toEqual({ uid: 'user-123', scope: ['mcp:read'] })
    expect(Buffer.from(a.split('.')[0], 'base64url').toString()).not.toContain('godMode')
  })

  it('scope is integrity-protected (tampering the scp breaks the signature)', async () => {
    const a = await signMcpAssertion('user-123', SECRET, { scope: ['mcp:read'] })
    const [, sig] = a.split('.')
    // Forge a body that grants write, keep the old signature → must fail.
    const forgedBody = Buffer.from(JSON.stringify({ uid: 'user-123', exp: 9999999999, scp: ['mcp:read', 'mcp:write'] })).toString('base64url')
    expect(await verifyMcpAssertion(`${forgedBody}.${sig}`, SECRET)).toBeNull()
  })

  it('rejects a wrong secret', async () => {
    const a = await signMcpAssertion('user-123', SECRET)
    expect(await verifyMcpAssertion(a, 'other-secret')).toBeNull()
  })

  it('rejects a tampered body (signature mismatch)', async () => {
    const a = await signMcpAssertion('user-123', SECRET)
    const [, sig] = a.split('.')
    // Swap in a different uid body, keep the old signature → must fail.
    const forgedBody = Buffer.from(JSON.stringify({ uid: 'attacker', exp: 9999999999 })).toString('base64url')
    expect(await verifyMcpAssertion(`${forgedBody}.${sig}`, SECRET)).toBeNull()
  })

  it('rejects an expired assertion', async () => {
    const t0 = 1_000_000_000_000
    const a = await signMcpAssertion('user-123', SECRET, { ttlSec: 60, now: t0 })
    // verify 61s later → expired
    expect(await verifyMcpAssertion(a, SECRET, { now: t0 + 61_000 })).toBeNull()
    // still valid at 59s
    expect(await verifyMcpAssertion(a, SECRET, { now: t0 + 59_000 })).toEqual({ uid: 'user-123', scope: ['mcp:read'] })
  })

  it('is fail-safe on malformed input', async () => {
    expect(await verifyMcpAssertion('', SECRET)).toBeNull()
    expect(await verifyMcpAssertion('garbage', SECRET)).toBeNull()
    expect(await verifyMcpAssertion('a.b.c', SECRET)).toBeNull()
    expect(await verifyMcpAssertion('only-one-part', '')).toBeNull()
  })
})
