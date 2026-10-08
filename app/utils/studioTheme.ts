export const studioThemeCookie = 'studio-color-mode'
export const studioThemeCookieOptions = { path: '/studio', sameSite: 'lax' as const, maxAge: 60 * 60 * 24 * 365 }

export function resolveStudioTheme(value: unknown): 'light' | 'dark' {
  return value === 'dark' ? 'dark' : 'light'
}
