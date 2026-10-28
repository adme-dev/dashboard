/** Non-bearer proof of the genuine app login captured at OAuth consent. Never accepts a JWT. */
export interface McpPageStudioLoginProof {
  role: 'agency'
  userId: string
  tokenHash: string
  /** Original app JWT timestamps, in milliseconds; never the MCP request time. */
  issuedAt: number
  expiresAt: number
}
const keys = new Set(['role', 'userId', 'tokenHash', 'issuedAt', 'expiresAt'])
export function parseMcpPageStudioLogin(value: unknown, expectedUserId: string): McpPageStudioLoginProof | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const v = value as Record<string, unknown>
  if (Object.keys(v).some(key => !keys.has(key)) || v.role !== 'agency' || v.userId !== expectedUserId
    || typeof v.userId !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v.userId)
    || typeof v.tokenHash !== 'string' || !/^[a-f0-9]{64}$/.test(v.tokenHash)
    || !Number.isSafeInteger(v.issuedAt) || !Number.isSafeInteger(v.expiresAt)
    || Number(v.issuedAt) <= 0 || Number(v.expiresAt) <= Number(v.issuedAt)
    || Number(v.expiresAt) > 8_640_000_000_000_000) return null
  return { role: 'agency', userId: v.userId, tokenHash: v.tokenHash, issuedAt: Number(v.issuedAt), expiresAt: Number(v.expiresAt) }
}
