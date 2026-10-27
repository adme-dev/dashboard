import { BannerRenderError } from '../../../shared/bannerRenderContract'

export const DOCUMENT_URL = 'https://banner-render.invalid/document'
export const PINNED_FONT_PATH = '/fonts/banner/SourceSans3-Bold.9214b9d95e4231c609802815c2646c98174e2102d0d37f88978a7f8e71006e6a.ttf'
export const GSAP_URLS = ['gsap', 'MotionPathPlugin', 'CustomEase'].map(name => `https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/${name}.min.js`)
export interface ResourceManifest {
  appOrigins: string[]
  assetOrigins: string[]
}
function safeHttps(url: URL): boolean {
  return url.protocol === 'https:' && !url.username && !url.password && !url.port && !url.hash
    && !/^[\d.]+$/.test(url.hostname) && !url.hostname.includes(':')
    && !/(^|\.)(localhost|local|internal|invalid|test)$/.test(url.hostname) && url.hostname.includes('.')
}
export function parseResourceManifest(appOrigins: unknown, assetOrigins: unknown): ResourceManifest {
  const parse = (value: unknown): string[] => {
    if (typeof value !== 'string')
      throw new BannerRenderError('UNAVAILABLE')
    const origins: unknown = JSON.parse(value)
    if (!Array.isArray(origins) || origins.length > 8)
      throw new BannerRenderError('UNAVAILABLE')
    return origins.map((origin) => {
      if (typeof origin !== 'string')
        throw new BannerRenderError('UNAVAILABLE')
      const url = new URL(origin)
      if (!safeHttps(url) || url.origin !== origin)
        throw new BannerRenderError('UNAVAILABLE')
      return origin
    })
  }
  try {
    return { appOrigins: parse(appOrigins), assetOrigins: parse(assetOrigins) }
  } catch {
    throw new BannerRenderError('UNAVAILABLE')
  }
}
export function resourceAllowed(raw: string, type: string, method: string, redirected: boolean, gif: boolean, manifest: ResourceManifest): boolean {
  if (method !== 'GET' || redirected || !['image', 'font', 'stylesheet', 'script'].includes(type))
    return false
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return false
  }
  if (url.protocol === 'data:')
    return type === 'image' || type === 'font'
  if (!safeHttps(url))
    return false
  if (type === 'script')
    return gif && GSAP_URLS.includes(url.href)
  if (type === 'stylesheet')
    return url.origin === 'https://fonts.googleapis.com' && url.pathname === '/css2'
  if (type === 'font' && url.origin === 'https://fonts.gstatic.com')
    return /^\/s\/[A-Za-z0-9/_-]+\.(woff2?|ttf)$/.test(url.pathname) && !url.search
  if (manifest.appOrigins.includes(url.origin)) {
    if (type === 'font' && url.pathname === PINNED_FONT_PATH && !url.search)
      return true
    return ['font', 'image'].includes(type) && /^\/api\/public\/banner-assets\/v1\.[A-Za-z0-9_-]{48}\.[A-Za-z0-9_-]{43}$/.test(url.pathname) && !url.search
  }
  return ['image', 'font'].includes(type) && manifest.assetOrigins.includes(url.origin)
}
export function contentSecurityPolicy(gif: boolean): string {
  return `default-src 'none'; script-src ${gif ? `'unsafe-inline' ${GSAP_URLS.join(' ')}` : '\'none\''}; style-src 'unsafe-inline' https://fonts.googleapis.com; img-src https: data:; font-src https: data:; connect-src 'none'; frame-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; media-src 'none'; frame-ancestors 'none'`
}
