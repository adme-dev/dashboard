export type AiInternalFetchOptions = {
  method?: string
  body?: unknown
  query?: Record<string, unknown>
  headers?: unknown
}

export const aiInternalFetch = (<T = unknown>(
  request: string,
  options?: AiInternalFetchOptions
) => (globalThis as any).$fetch(request, options) as Promise<T>) as <T = unknown>(
  request: string,
  options?: AiInternalFetchOptions
) => Promise<T>
