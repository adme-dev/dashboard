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

// --- Publication-stage outcome classification -------------------------------------------------------
//
// Adapters run preparation requests (media uploads, unpublished containers) before the single request
// that makes a post public. Errors thrown by that final request are tagged here so the adapter can tell
// an effect-free preparation failure from an ambiguous publication.

const publicationStageErrors = new WeakSet<object>()

/** Run the request that makes a post public; any error it throws is tagged as publication-stage. */
export async function publicationRequest<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request()
  } catch (error) {
    if (error && typeof error === 'object') publicationStageErrors.add(error)
    throw error
  }
}

export function isPublicationStageError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && publicationStageErrors.has(error))
}

/**
 * An HTTP outcome that does not prove the provider rejected the request: no response at all (transport
 * loss / timeout), a request timeout, or any 5xx/gateway error. At the publication stage the post may
 * exist, so callers hold it for read-back rather than treating it as an effect-free failure.
 */
export function isAmbiguousHttpOutcome(statusCode: number | undefined | null): boolean {
  return statusCode == null || statusCode === 408 || statusCode >= 500
}

// --- Reviewed-media capability redaction ------------------------------------------------------------

const SOCIAL_MEDIA_CAPABILITY_URL = /(\/api\/public\/social-media\/)[^\s"'`<>?#)]+/g

/** Strip signed reviewed-media capability tokens from text bound for logs, provider results or storage. */
export function redactSocialMediaCapabilities(text: string): string {
  return text.replace(SOCIAL_MEDIA_CAPABILITY_URL, '$1[redacted]')
}

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
