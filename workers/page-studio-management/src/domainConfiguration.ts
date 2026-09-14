import { domainAttachmentService, type DomainActor, type DomainTransaction } from './domainAttachment'
import { Hostname } from './domainAttachmentProvider'

interface CloudflareCustomHostname {
  id: string
  hostname: string
  status?: string
  ownership_verification?: Record<string, unknown>
  ssl?: {
    status?: string
    validation_records?: Array<Record<string, unknown>>
  }
}

function cloudflareConfig(env: Record<string, unknown>) {
  const value = (name: string) => String(env[name] ?? '').trim()
  const target = value('PAGE_STUDIO_CUSTOM_HOSTNAME_TARGET').toLowerCase().replace(/\.$/, '')
  const cnameTarget = Hostname.safeParse(target).success && !/^\d+(?:\.\d+){3}$/.test(target) ? target : ''
  return {
    apiToken: value('PAGE_STUDIO_CLOUDFLARE_API_TOKEN'),
    cnameTarget,
    zoneId: value('PAGE_STUDIO_CLOUDFLARE_ZONE_ID')
  }
}

function domainState(hostname: CloudflareCustomHostname | null, dnsVerified = false) {
  const hostnameStatus = hostname?.status ?? 'pending'
  const tlsStatus = hostname?.ssl?.status ?? 'pending'
  return {
    certificateValidation: hostname?.ssl?.validation_records ?? [],
    cloudflareHostnameId: hostname?.id ?? null,
    dnsStatus: dnsVerified ? 'active' : 'pending',
    hostnameStatus,
    lifecycleState: dnsVerified && hostnameStatus === 'active' && tlsStatus === 'active' ? 'active' : hostname ? 'validating' : dnsVerified ? 'verified' : 'pending',
    ownershipValidation: hostname?.ownership_verification ?? {},
    tlsStatus
  }
}

// Accept only a CNAME chain rooted at the requested hostname. An unrelated
// answer containing our target is not evidence that customer traffic moved.
async function domainDnsMatches(hostname: string, target: string): Promise<boolean> {
  if (!target) return false
  const response = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=CNAME`, {
    headers: { accept: 'application/dns-json' },
    redirect: 'manual',
    signal: AbortSignal.timeout(5_000)
  })
  if (!response.ok) return false
  const dns = await response.json() as { Status?: number, Answer?: Array<{ type?: number, name?: string, data?: string }> }
  if (dns?.Status !== 0 || !Array.isArray(dns.Answer) || dns.Answer.length > 32) return false
  const normalize = (value: string) => value.toLowerCase().replace(/\.$/, '')
  const seen = new Set<string>()
  let current = normalize(hostname)
  for (let hop = 0; hop < 16 && !seen.has(current); hop++) {
    seen.add(current)
    const answers = dns.Answer.filter(answer => answer?.type === 5 && typeof answer.name === 'string' && normalize(answer.name) === current)
    const answer = answers[0]
    if (answers.length !== 1 || !answer || typeof answer.data !== 'string') return false
    current = normalize(answer.data)
    if (current === target) return true
  }
  return false
}

export async function attachPageStudioDomain(input: DomainActor & {
  env: Record<string, unknown>
  hostname: string
  siteId: string
  tenantId: string
}, transaction: DomainTransaction) {
  const service = domainAttachmentService(cloudflareConfig(input.env), { transaction })
  const attachment = await service.prepare(input)
  const state = domainState(attachment.provider)
  state.ownershipValidation = { ...state.ownershipValidation, cnameTarget: cloudflareConfig(input.env).cnameTarget || null,
    providerConfigured: Boolean(attachment.provider), dnsVerified: false }
  // An exact attach retry must not erase a previously verified DNS/TLS state.
  // Refresh explicitly re-evaluates that state; attachment itself only retains identity.
  if (attachment.current.lifecycle_state === 'pending') await service.saveVerification(input, attachment, state)
  return { id: attachment.current.id }
}

export async function refreshPageStudioDomain(input: DomainActor & {
  domainId: string
  env: Record<string, unknown>
  siteId: string
  tenantId: string
}, transaction: DomainTransaction) {
  const config = cloudflareConfig(input.env)
  const service = domainAttachmentService(config, { transaction })
  const attachment = await service.prepare(input)
  const dnsVerified = await domainDnsMatches(attachment.current.normalized_hostname, config.cnameTarget)
  const state = domainState(attachment.provider, dnsVerified)
  state.ownershipValidation = { ...state.ownershipValidation, cnameTarget: config.cnameTarget || null,
    providerConfigured: Boolean(attachment.provider), dnsVerified }
  await service.saveVerification(input, attachment, state)
  return { id: attachment.current.id, ...state }
}
