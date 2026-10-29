export const bannerThemeCookie = 'banner-studio-color-mode'
// Both the agency and full-screen editor share this choice, independent of the
// agency-wide preference. A year-long cookie also avoids a dark first render.
export const bannerThemeCookieOptions = { path: '/', sameSite: 'lax' as const, maxAge: 60 * 60 * 24 * 365 }

export function resolveBannerTheme(value: unknown): 'light' | 'dark' {
  return value === 'dark' ? 'dark' : 'light'
}

export function isBannerStudioRoute(path: string): boolean {
  return ['/agency/banner-studio', '/creative/banner-studio'].some(base => path === base || path.startsWith(`${base}/`))
}
