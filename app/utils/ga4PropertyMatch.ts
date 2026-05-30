// app/utils/ga4PropertyMatch.ts
/**
 * Match GA4 property names to agency clients by location prefix, for the
 * "Auto-map" button on the GA4 connect card. Pure + framework-free so it can be
 * unit-tested. High confidence = exactly one client whose location key is a
 * leading whole-word prefix of the property name (longest unique key wins).
 */

export interface MatchableProperty { propertyId: string; propertyDisplayName: string }
export interface MatchableClient { id: string; name: string }
export interface PropertyMatch { propertyId: string; clientId: string | null }

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim()
}

/** Client location key: name minus a trailing " motor group"; else the full name. */
export function locationKey(clientName: string): string {
  const n = normalize(clientName)
  const stripped = n.replace(/\s+motor group$/, '').trim()
  return stripped || n
}

/** Property name normalized: lowercase, drop a trailing "- GA4" / "GA4". */
export function normalizeProperty(name: string): string {
  let n = normalize(name)
  n = n.replace(/[-–]\s*ga4$/, '').trim()
  n = n.replace(/\s+ga4$/, '').trim()
  return n
}

/** True when `key` is a leading whole-word prefix of `name`. */
function isWholeWordPrefix(key: string, name: string): boolean {
  if (!key) return false
  if (name === key) return true
  return name.startsWith(key + ' ')
}

export function matchPropertiesToClients(
  properties: MatchableProperty[],
  clients: MatchableClient[]
): PropertyMatch[] {
  const keyed = clients.map((c) => ({ client: c, key: locationKey(c.name) }))
  return properties.map((p) => {
    const name = normalizeProperty(p.propertyDisplayName)
    const matches = keyed.filter((k) => isWholeWordPrefix(k.key, name))
    if (matches.length === 0) return { propertyId: p.propertyId, clientId: null }
    const maxLen = Math.max(...matches.map((m) => m.key.length))
    const longest = matches.filter((m) => m.key.length === maxLen)
    if (longest.length !== 1) return { propertyId: p.propertyId, clientId: null }
    return { propertyId: p.propertyId, clientId: longest[0].client.id }
  })
}
