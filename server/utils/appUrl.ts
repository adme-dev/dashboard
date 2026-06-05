import type { H3Event } from 'h3'

const APP_HOST = 'app.xeroflow.io'
const ROOT_HOSTS = new Set(['xeroflow.io', 'www.xeroflow.io'])
type CloudflareEnv = Record<string, string | undefined>

function normalizeUrl(value: string, allowLocalhost: boolean): string | null {
  try {
    const url = value.includes('://') ? new URL(value) : new URL(`https://${value}`)

    if (!allowLocalhost && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')) {
      return null
    }

    if (!allowLocalhost && ROOT_HOSTS.has(url.hostname)) {
      url.hostname = APP_HOST
    }

    return url.origin
  } catch {
    return null
  }
}

function readEventBinding(event: H3Event | undefined, key: string): string | undefined {
  if (!event) return undefined

  try {
    const context = event.context as { cloudflare?: { env?: CloudflareEnv } }
    const value = context.cloudflare?.env?.[key]
    return typeof value === 'string' ? value : undefined
  } catch {
    return undefined
  }
}

export function getAppUrl(event?: H3Event): string {
  const config = useRuntimeConfig() as { public?: { appUrl?: string } }
  const candidates = [
    readEventBinding(event, 'APP_URL'),
    config.public?.appUrl,
    process.env.APP_URL
  ].filter((value): value is string => typeof value === 'string' && value.length > 0)

  const allowLocalhost = import.meta.dev

  for (const candidate of candidates) {
    const normalized = normalizeUrl(candidate, allowLocalhost)
    if (normalized) return normalized
  }

  return allowLocalhost ? 'http://localhost:3000' : `https://${APP_HOST}`
}
