// server/utils/xeroReconcile.ts
/**
 * Deterministic Xero-customer → existing-client matcher (location prefix).
 * Pure + framework-free for unit testing. The AI pass handles whatever this
 * leaves with matchedClientId === null.
 */

export interface XeroCustomer { contactId: string; name: string; tenantId: string; receivableCents: number }
export interface ClientRef { id: string; name: string }
export interface ReconcileCandidate {
  contactId: string; name: string; tenantId: string; receivableCents: number
  matchedClientId: string | null
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim()
}

/** Client location key: name minus trailing " motor group", else full name. */
export function locationKey(name: string): string {
  const n = normalize(name)
  const stripped = n.replace(/\s+motor group$/, '').trim()
  return stripped || n
}

function isWholeWordPrefix(key: string, name: string): boolean {
  if (!key) return false
  if (name === key) return true
  return name.startsWith(key + ' ')
}

export function buildReconcileCandidates(
  customers: XeroCustomer[],
  clients: ClientRef[],
  linkedContactIds: Set<string>
): ReconcileCandidate[] {
  const keyed = clients.map((c) => ({ client: c, key: locationKey(c.name) }))
  const out: ReconcileCandidate[] = []
  for (const cust of customers) {
    if (linkedContactIds.has(cust.contactId)) continue
    const lname = normalize(cust.name)
    const matches = keyed.filter((k) => isWholeWordPrefix(k.key, lname))
    let matchedClientId: string | null = null
    if (matches.length > 0) {
      const maxLen = Math.max(...matches.map((m) => m.key.length))
      const longest = matches.filter((m) => m.key.length === maxLen)
      if (longest.length === 1) matchedClientId = longest[0].client.id
    }
    out.push({
      contactId: cust.contactId, name: cust.name, tenantId: cust.tenantId,
      receivableCents: cust.receivableCents, matchedClientId
    })
  }
  return out
}
