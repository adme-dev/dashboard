import { BlockList, isIP } from 'node:net'
import { lookup as dnsLookup } from 'node:dns/promises'

export interface SiteIntelligenceDnsAddress {
  address: string
  family: number
}

export type SiteIntelligenceDnsResolver = (
  hostname: string,
  options: { all: true, verbatim: true }
) => Promise<SiteIntelligenceDnsAddress[]>

const blockedIpv4Addresses = new BlockList()
const blockedIpv6Addresses = new BlockList()

for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4]
] as const) {
  blockedIpv4Addresses.addSubnet(network, prefix, 'ipv4')
}

for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['::ffff:0:0', 96],
  ['100::', 64],
  ['2001:db8::', 32],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8]
] as const) {
  blockedIpv6Addresses.addSubnet(network, prefix, 'ipv6')
}

function unbracketHostname(hostname: string): string {
  return hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname
}

function isBlockedHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, '')
  return normalized === 'localhost'
    || normalized.endsWith('.localhost')
    || normalized.endsWith('.local')
    || !normalized.includes('.')
}

export function isPublicIpAddress(address: string): boolean {
  const family = isIP(unbracketHostname(address))
  if (family === 4) return !blockedIpv4Addresses.check(address, 'ipv4')
  if (family === 6) return !blockedIpv6Addresses.check(unbracketHostname(address), 'ipv6')
  return false
}

export function normalizeSiteOrigin(input: string): string {
  let url: URL
  try {
    url = new URL(input)
  } catch {
    throw new Error('Public HTTP(S) origin required')
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Public HTTP(S) origin required')
  }
  if (url.username || url.password) throw new Error('Credentials are not allowed')
  if (url.hash) throw new Error('Fragments are not allowed')

  const hostname = unbracketHostname(url.hostname)
  const family = isIP(hostname)
  if (family > 0) {
    if (!isPublicIpAddress(hostname)) throw new Error('Public HTTP(S) origin required')
  } else if (isBlockedHostname(hostname)) {
    throw new Error('Public HTTP(S) origin required')
  }

  return url.origin.toLowerCase()
}

export async function assertPublicSiteOrigin(
  input: string,
  resolver: SiteIntelligenceDnsResolver = dnsLookup as SiteIntelligenceDnsResolver
): Promise<string> {
  const origin = normalizeSiteOrigin(input)
  const hostname = unbracketHostname(new URL(origin).hostname)

  if (isIP(hostname) > 0) return origin

  let addresses: SiteIntelligenceDnsAddress[]
  try {
    addresses = await resolver(hostname, { all: true, verbatim: true })
  } catch {
    throw new Error('Public HTTP(S) origin required')
  }

  if (addresses.length === 0 || addresses.some(result => !isPublicIpAddress(result.address))) {
    throw new Error('Public HTTP(S) origin required')
  }

  return origin
}
