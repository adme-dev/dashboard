type Layout = 'list' | 'grid'
const storageKey = 'banner-library-first-poster-v1'

export function bannerPosterUrl(projectId: string, size: 'list' | 'gallery', version = '') {
  return `/api/agency/banner-studio/projects/${encodeURIComponent(projectId)}/image?${new URLSearchParams({ size, v: version })}`
}

// Keep only a request hint for the last folder in this tab. The image request
// itself always rechecks the signed-in user's current project access.
export function rememberFirstPoster(route: string, layout: Layout, projectId: string, version?: string) {
  try {
    sessionStorage.setItem(storageKey, JSON.stringify({ route, layout, projectId, version }))
  } catch { /* Storage is optional in private browsing. */ }
}

export function preloadFirstPoster(route: string, layout: Layout) {
  try {
    const hint = JSON.parse(sessionStorage.getItem(storageKey) || 'null')
    if (hint?.route !== route || hint.layout !== layout || typeof hint.projectId !== 'string'
      || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(hint.projectId)) return
    const link = document.createElement('link')
    link.rel = 'preload'
    link.as = 'image'
    link.href = bannerPosterUrl(hint.projectId, layout === 'list' ? 'list' : 'gallery', hint.version)
    document.head.appendChild(link)
  } catch { /* A missing or outdated hint falls back to normal viewport loading. */ }
}
