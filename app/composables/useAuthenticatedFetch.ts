interface AuthenticatedRequestOptions {
  method?: string
  body?: unknown
  query?: Record<string, unknown>
  headers?: Record<string, string>
}

function getAuthTokenFallback(): string | null {
  // SSR can read request cookies directly; no localStorage available.
  if (!import.meta.client) {
    return useCookie('auth_token')?.value || useCookie('auth_token_client')?.value || null
  }

  const cookieToken = useCookie('auth_token_client')?.value || useCookie('auth_token')?.value
  if (cookieToken) return cookieToken

  // Use fallback localStorage token only when the app previously marked the
  // user as logged in. This avoids sending a stale localStorage token after
  // explicit logout when cookies are missing.
  if (useCookie('auth_status')?.value === 'logged_in') {
    return localStorage.getItem('auth_token_backup')
  }

  return null
}

export function getAuthHeaders(): Record<string, string> {
  const token = getAuthTokenFallback()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export function useAuthenticatedFetch() {
  const baseFetch = $fetch as <T>(
    request: string,
    options?: AuthenticatedRequestOptions,
  ) => Promise<T>

  const fetch: <T>(
    request: string,
    options?: AuthenticatedRequestOptions,
  ) => Promise<T> = (request, options) => {
    const headers = {
      ...(options?.headers || {}),
      ...getAuthHeaders(),
    }

    return baseFetch<T>(request, {
      ...options,
      ...(Object.keys(headers).length ? { headers } : {}),
    })
  }

  return { fetch }
}
