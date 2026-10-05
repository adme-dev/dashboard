// server/utils/leads/destinations/index.ts
import portal from './portal'
import webhook from './webhook'
import slack from './slack'
import email from './email'
import sheets from './sheets'
import assignUser from './assignUser'
import autogate from './autogate'
import { registeredAdapterTypes, resolveAdapter } from './registry'
import type { DestinationAdapter } from './types'

// Nitro prunes side-effect-only registration imports. Reference the adapter
// values directly so every built-in survives the production bundle.
const builtins = new Map<string, DestinationAdapter>(
  [portal, webhook, slack, email, sheets, assignUser, autogate]
    .map(adapter => [adapter.type, adapter])
)

export function getAdapter(type: string): DestinationAdapter | null {
  return resolveAdapter(type) ?? builtins.get(type) ?? null
}

export function listAdapterTypes(): string[] {
  return [...new Set([...builtins.keys(), ...registeredAdapterTypes()])]
}
