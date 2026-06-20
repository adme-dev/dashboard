import { describe, it, expect } from 'vitest'
import { signMcpAssertion, verifyMcpAssertion } from '~~/server/utils/ai/mcp/assertion'

const SECRET = 'test-handshake-secret'

describe('MCP assertion sign/verify', () => {
  it('round-trips a userId', async () => {
    const a = await signMcpAssertion('user-123', SECRET)
    expect(await verifyMcpAssertion(a, SECRET)).toBe('user-123')
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
    expect(await verifyMcpAssertion(a, SECRET, { now: t0 + 59_000 })).toBe('user-123')
  })

  it('is fail-safe on malformed input', async () => {
    expect(await verifyMcpAssertion('', SECRET)).toBeNull()
    expect(await verifyMcpAssertion('garbage', SECRET)).toBeNull()
    expect(await verifyMcpAssertion('a.b.c', SECRET)).toBeNull()
    expect(await verifyMcpAssertion('only-one-part', '')).toBeNull()
  })
})
