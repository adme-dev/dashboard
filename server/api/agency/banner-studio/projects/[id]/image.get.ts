import { fitLibraryPoster } from '~~/server/utils/banner/libraryPoster'
import { bannerShareImage } from '~~/server/utils/banner/shareImage'
import { teamBannerPreviewAccess } from '~~/server/utils/banner/teamPreview'
import { authorizedPosterRevision } from '~~/server/utils/banner/viewerSnapshot'

export default defineEventHandler(async (event) => {
  const { size, formatKey } = getQuery(event)
  const load = teamBannerPreviewAccess(event).load
  const gallery = size === 'list' || size === 'gallery'
  if (!gallery || formatKey !== undefined) return bannerShareImage(event, load, gallery)

  // Resolve access and the revision from current DB rows on every request, including 304s.
  const { id, revision } = await authorizedPosterRevision(event)
  const key = `banner-library-posters/v1/${id}/${size}/${revision}.jpg`
  const headers = {
    'ETag': `"${id}-${size}-v1-${revision}"`,
    'Cache-Control': 'private, no-cache',
    'Vary': 'Cookie, Authorization',
    'Content-Type': 'image/jpeg',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer'
  }
  if (getHeader(event, 'if-none-match') === headers.ETag) return new Response(null, { status: 304, headers })
  const bucket = event.context.cloudflare?.env?.MEDIA_BUCKET
  const cached = await bucket?.get(key)
  if (cached) return new Response(cached.body, { headers })

  const response = await bannerShareImage(event, load, gallery)
  // A save or font change can race a cold screenshot. Only label matching bytes.
  if ((await authorizedPosterRevision(event)).revision !== revision) return response
  const bytes = fitLibraryPoster(await response.arrayBuffer(), size === 'list' ? 160 : 480)
  await bucket?.put(key, bytes, { httpMetadata: { contentType: 'image/jpeg' } })
  return new Response(bytes, { headers })
})
