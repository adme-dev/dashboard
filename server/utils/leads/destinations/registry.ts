// server/utils/leads/destinations/registry.ts
import type { DestinationAdapter } from './types'

const REGISTRY = new Map<string, DestinationAdapter>()

export function registerAdapter(a: DestinationAdapter): void {
  REGISTRY.set(a.type, a)
}

export function resolveAdapter(type: string): DestinationAdapter | null {
  return REGISTRY.get(type) ?? null
}

export function registeredAdapterTypes(): string[] {
  return [...REGISTRY.keys()]
}
