import type { NormalizedInboundEmail } from '../types'
import type { EmailProviderAdapter, ProviderMatch } from './types'

export interface EmailProviderRegistry {
  readonly adapters: readonly EmailProviderAdapter[]
  match(input: NormalizedInboundEmail, expectedProvider: string | null): { adapter: EmailProviderAdapter, match: ProviderMatch } | null
}

function evidenceStrength(evidence: readonly string[]): number {
  if (evidence.some(item => item.startsWith('body:'))) return 4
  if (evidence.some(item => item.startsWith('subject:'))) return 3
  if (evidence.some(item => item.startsWith('sender:'))) return 2
  return 0
}

function isExpected(evidence: readonly string[]): number {
  return evidence.some(item => item.startsWith('expected:')) ? 1 : 0
}

export function registerProviderAdapters(adapters: EmailProviderAdapter[]): EmailProviderRegistry {
  const ids = new Set<string>()
  const priorities = new Set<number>()
  for (const adapter of adapters) {
    if (!/^[a-z][a-z0-9_-]{0,63}$/.test(adapter.id)) throw new Error(`Invalid provider adapter ID: ${adapter.id}`)
    if (!Number.isSafeInteger(adapter.priority) || adapter.priority < 1) throw new Error(`Invalid provider adapter priority: ${adapter.id}`)
    if (ids.has(adapter.id)) throw new Error(`Duplicate provider adapter ID: ${adapter.id}`)
    if (priorities.has(adapter.priority)) throw new Error(`Duplicate provider adapter priority: ${adapter.priority}`)
    ids.add(adapter.id); priorities.add(adapter.priority)
  }
  const ordered = Object.freeze([...adapters].sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id)))
  return Object.freeze({
    adapters: ordered,
    match(input, expectedProvider) {
      const candidates = ordered.map(adapter => ({ adapter, match: adapter.matches(input, expectedProvider) }))
        .filter(candidate => candidate.match.matched)
        .sort((a, b) => evidenceStrength(b.match.evidence) - evidenceStrength(a.match.evidence) || isExpected(b.match.evidence) - isExpected(a.match.evidence) || a.adapter.priority - b.adapter.priority || a.adapter.id.localeCompare(b.adapter.id))
      return candidates[0] ?? null
    }
  })
}
