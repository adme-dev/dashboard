import type { H3Event } from 'h3'
import { senderDomainFromEmail } from './campaignSend'

function eventBinding(event: H3Event | undefined, key: string): string | undefined {
  const value = (event?.context as { cloudflare?: { env?: Record<string, unknown> } } | undefined)
    ?.cloudflare?.env?.[key]
  return typeof value === 'string' ? value : undefined
}

function configValue(key: 'emailSenderDomains' | 'emailFrom'): string | undefined {
  if (typeof useRuntimeConfig !== 'function') return undefined
  try {
    const config = useRuntimeConfig()
    const value = config[key]
    return typeof value === 'string' ? value : undefined
  } catch {
    return undefined
  }
}

export function parseSenderDomains(value: string | null | undefined): string[] {
  if (!value) return []
  const domains = new Set<string>()
  const addDomain = (part: string) => {
    const cleaned = part
      .trim()
      .toLowerCase()
      .replace(/^@/, '')
      .replace(/[<>"']/g, '')
      .replace(/[.;]+$/g, '')
    const domain = senderDomainFromEmail(cleaned) || cleaned
    if (domain.includes('.')) domains.add(domain)
  }

  for (const entry of value.split(',')) {
    const bracketed = entry.match(/<([^>]+)>/)?.[1]
    if (bracketed) {
      addDomain(bracketed)
      continue
    }
    for (const part of entry.split(/\s+/)) addDomain(part)
  }

  return [...domains]
}

export function resolveCampaignSenderDomains(event?: H3Event): string[] {
  const explicit = eventBinding(event, 'EMAIL_SENDER_DOMAINS')
    || configValue('emailSenderDomains')
    || process.env.EMAIL_SENDER_DOMAINS
  const explicitDomains = parseSenderDomains(explicit)
  if (explicitDomains.length) return explicitDomains

  return parseSenderDomains(
    eventBinding(event, 'EMAIL_FROM')
    || configValue('emailFrom')
    || process.env.EMAIL_FROM
  )
}
