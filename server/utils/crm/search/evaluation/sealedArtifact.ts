import type { H3Event } from 'h3'
import { createHash } from 'node:crypto'

const digestPattern = /^[a-f0-9]{64}$/u
const artifactIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u

export interface CrmSearchSealedHoldout {
  sealedJudgementSha256: string
  queries: unknown[]
  [key: string]: unknown
}

export interface CrmSearchSealedArtifactProvider {
  readBytes(input: { artifactId: string }): Promise<Uint8Array>
}

export class CrmSearchSealedArtifactError extends Error {
  readonly code = 'crm_search_sealed_artifact_unavailable'

  constructor() {
    super('CRM search sealed evaluation artifact is unavailable')
    this.name = 'CrmSearchSealedArtifactError'
  }
}

function isProvider(value: unknown): value is CrmSearchSealedArtifactProvider {
  return Boolean(value && typeof value === 'object'
    && typeof (value as { readBytes?: unknown }).readBytes === 'function')
}

export function resolveCrmSearchSealedArtifactProvider(event: H3Event): CrmSearchSealedArtifactProvider {
  const env = (event.context as { cloudflare?: { env?: Record<string, unknown> } }).cloudflare?.env
  const bucket = env?.CRM_SEARCH_SEALED_HOLDOUTS
  if (!bucket || typeof bucket !== 'object'
    || typeof (bucket as { get?: unknown }).get !== 'function') throw new CrmSearchSealedArtifactError()
  return {
    async readBytes({ artifactId }) {
      const object = await (bucket as { get(key: string): Promise<unknown> })
        .get(`crm-search/evaluation/holdouts/${artifactId}.json`)
      if (!object || typeof object !== 'object'
        || typeof (object as { arrayBuffer?: unknown }).arrayBuffer !== 'function') {
        throw new CrmSearchSealedArtifactError()
      }
      const buffer = await (object as { arrayBuffer(): Promise<ArrayBuffer> }).arrayBuffer()
      return new Uint8Array(buffer)
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
  }
  const encoded = JSON.stringify(value)
  if (encoded === undefined) throw new CrmSearchSealedArtifactError()
  return encoded
}

const forbiddenKeyPattern = /^(?:email|emailaddress|phone|phonenumber|rawquery|querytext|sourcetext|notes|providerpayload|providerbody|vector|embedding)$/u
const emailPattern = /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/u
const phonePattern = /(?:\+?\d[\d ()-]{7,}\d)/u

function containsPiiLikeValue(value: string): boolean {
  if (emailPattern.test(value)) return true
  const digitCount = value.replace(/\D/gu, '').length
  return digitCount >= 8 && digitCount <= 15 && phonePattern.test(value)
}

function assertPrivacySafe(value: unknown, key = ''): void {
  const normalizedKey = key.normalize('NFKC').toLocaleLowerCase('en-AU').replace(/[^a-z0-9]/gu, '')
  if (forbiddenKeyPattern.test(normalizedKey)
    || (typeof value === 'string' && containsPiiLikeValue(value))) {
    throw new CrmSearchSealedArtifactError()
  }
  if (Array.isArray(value)) {
    for (const item of value) assertPrivacySafe(item)
  } else if (isRecord(value)) {
    for (const [nestedKey, nested] of Object.entries(value)) assertPrivacySafe(nested, nestedKey)
  }
}

export async function unsealCrmSearchHoldout(
  input: {
    artifactId: string
    expectedSealedJudgementSha256?: string | null
  },
  provider: CrmSearchSealedArtifactProvider
): Promise<CrmSearchSealedHoldout> {
  if (!artifactIdPattern.test(input.artifactId)
    || (input.expectedSealedJudgementSha256 != null
      && !digestPattern.test(input.expectedSealedJudgementSha256))) {
    throw new CrmSearchSealedArtifactError()
  }
  if (!isProvider(provider)) throw new CrmSearchSealedArtifactError()
  let bytes: Uint8Array
  try {
    bytes = await provider.readBytes({ artifactId: input.artifactId })
  } catch {
    throw new CrmSearchSealedArtifactError()
  }
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 2 || bytes.byteLength > 8 * 1024 * 1024) {
    throw new CrmSearchSealedArtifactError()
  }
  try {
    if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
      throw new CrmSearchSealedArtifactError()
    }
    const exactText = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    if (exactText.charCodeAt(0) === 0xFEFF) throw new CrmSearchSealedArtifactError()
    const parsed = JSON.parse(exactText) as unknown
    if (!isRecord(parsed) || !Array.isArray(parsed.queries)
      || canonicalJson(parsed) !== exactText) throw new CrmSearchSealedArtifactError()
    assertPrivacySafe(parsed)
    const sealedJudgementSha256 = createHash('sha256').update(bytes).digest('hex')
    if (input.expectedSealedJudgementSha256 != null
      && sealedJudgementSha256 !== input.expectedSealedJudgementSha256) {
      throw new CrmSearchSealedArtifactError()
    }
    return Object.freeze({ ...parsed, sealedJudgementSha256 }) as CrmSearchSealedHoldout
  } catch (error) {
    if (error instanceof CrmSearchSealedArtifactError) throw error
    throw new CrmSearchSealedArtifactError()
  }
}
