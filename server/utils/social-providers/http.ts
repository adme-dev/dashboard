import { $fetch as ofetch } from 'ofetch'

type FetchWithTimeoutInit = NonNullable<Parameters<typeof fetch>[1]> & { timeoutMs?: number }

export type SocialProviderFetchOptions = {
  method?: string
  body?: unknown
  query?: Record<string, unknown>
  params?: Record<string, unknown>
  headers?: unknown
  responseType?: string
  ignoreResponseError?: boolean
  retry?: number
  onResponse?: unknown
}

export const providerFetch = ofetch as <T = unknown>(
  request: string,
  options?: SocialProviderFetchOptions
) => Promise<T>

export type SocialProviderFetchRawResponse<T = unknown> = {
  headers: Headers
  _data?: T
}

export const providerFetchRaw = ofetch.raw as <T = unknown>(
  request: string,
  options?: SocialProviderFetchOptions
) => Promise<SocialProviderFetchRawResponse<T>>

export async function fetchWithTimeout(
  input: Parameters<typeof fetch>[0],
  init: FetchWithTimeoutInit = {},
): Promise<Response> {
  const { timeoutMs = 12_000, signal, ...fetchInit } = init
  if (!timeoutMs) return fetch(input, { ...fetchInit, signal })

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  if (signal) {
    if (signal.aborted) {
      controller.abort()
    } else {
      signal.addEventListener('abort', () => controller.abort(), { once: true })
    }
  }

  try {
    return await fetch(input, { ...fetchInit, signal: controller.signal })
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error(`social provider fetch timed out after ${timeoutMs}ms`)
    }
    throw err
  } finally {
    clearTimeout(timeout)
  }
}
