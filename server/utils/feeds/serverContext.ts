import type { H3Event } from 'h3'

type Env = Record<string, string | undefined>

export function cloudflareRuntimeEnv(event: H3Event): Env {
  return ((event.context as any)?.cloudflare?.env ?? {}) as Env
}

export function mergedRuntimeEnv(event: H3Event, fallback: Env = process.env): Env {
  return { ...fallback, ...cloudflareRuntimeEnv(event) }
}
