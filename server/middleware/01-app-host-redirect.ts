import { defineEventHandler, getRequestURL, sendRedirect } from 'h3'

const APP_HOST = 'app.xeroflow.io'

const PUBLIC_MARKETING_PATHS = [
  '/',
  '/landing',
  '/features',
  '/pricing',
  '/contact',
  '/resources',
  '/about',
  '/support',
  '/creativity',
  '/ai-training',
  '/voice-ai',
  '/banner-studio',
  '/platform',
  '/privacy',
  '/terms'
]

export function shouldRedirectAppHostPath(pathname: string): boolean {
  const normalizedPath = pathname.replace(/\/+$/, '') || '/'

  return PUBLIC_MARKETING_PATHS.some((path) => {
    if (normalizedPath === path) return true
    return path !== '/' && normalizedPath.startsWith(`${path}/`)
  })
}

export default defineEventHandler((event) => {
  const { host, pathname } = getRequestURL(event)
  const normalizedHost = host.toLowerCase().split(':')[0]
  if (normalizedHost !== APP_HOST) return

  if (!shouldRedirectAppHostPath(pathname)) return

  return sendRedirect(event, '/auth/login/', 302)
})
