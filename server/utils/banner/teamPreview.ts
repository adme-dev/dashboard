import type { H3Event } from 'h3'
import type { loadPublicBannerShare } from './publicShare'
import { authorizedBannerSnapshot } from './viewerSnapshot'
import { resolveCanvasFonts, fontAssetMetadata } from './fontAssets'
import { withBannerFontDelivery } from './fontDelivery'

/** Reuse the existing render pipeline without creating a public capability link. */
export function teamBannerPreviewAccess(event: H3Event) {
  return {
    basePath: `/api/agency/banner-studio/projects/${getRouterParam(event, 'id')}`,
    load: async (): Promise<Awaited<ReturnType<typeof loadPublicBannerShare>>> => {
      setHeader(event, 'Cache-Control', 'private, no-store')
      const snapshot = await authorizedBannerSnapshot(event)
      const project = { id: snapshot.document.projectId, name: snapshot.document.name,
        canvasData: snapshot.document.canvasData as Awaited<ReturnType<typeof loadPublicBannerShare>>['project']['canvasData'],
        clientId: snapshot.clientId, clientName: snapshot.clientName }
      const canvas = typeof project.canvasData === 'string' ? JSON.parse(project.canvasData) : project.canvasData
      const fonts = await withBannerFontDelivery(event, await resolveCanvasFonts(canvas, project.clientId))
      return { project, fonts: fonts.map((font) => {
        const { id, name, url, tags, clientId, sha256 } = fontAssetMetadata(font)
        return { id, name, url, tags, clientId, sha256 }
      }) }
    }
  }
}
