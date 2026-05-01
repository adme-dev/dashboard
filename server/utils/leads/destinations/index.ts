// server/utils/leads/destinations/index.ts
import type { DestinationAdapter } from './types'

const REGISTRY = new Map<string, DestinationAdapter>()

export function registerAdapter(a: DestinationAdapter): void {
  REGISTRY.set(a.type, a)
}

export function getAdapter(type: string): DestinationAdapter | null {
  return REGISTRY.get(type) ?? null
}

export function listAdapterTypes(): string[] {
  return [...REGISTRY.keys()]
}

// Side-effect import: each adapter file calls registerAdapter on load.
import './portal'
import './webhook'
import './slack'
import './email'
import './sheets'
import './assignUser'
