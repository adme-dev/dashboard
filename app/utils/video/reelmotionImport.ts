import { sameImportedCanvas } from '../thebrief-import'
import { reelmotionVideoTimeline, type SavedReel, type ManagedAudio } from '~~/shared/video/reelmotionImport'

export { reelmotionVideoTimeline } from '~~/shared/video/reelmotionImport'

type ImportApi = <T>(url: string, options?: Record<string, unknown>) => Promise<T>
export async function createReelmotionVideoDraft(bannerId: string, clientId: string, api: ImportApi): Promise<string> {
  const banner = await api<SavedReel & { status: string, name: string, tags: string[] }>(`/api/agency/banner-studio/projects/${encodeURIComponent(bannerId)}`)
  if (banner.id !== bannerId || banner.clientId !== clientId || banner.status !== 'draft' || !banner.tags.includes('source:reelmotion')) throw new Error('Choose the saved ReelMotion draft for this client')
  const { assets } = await api<{ assets: ManagedAudio[] }>(`/api/agency/banner-studio/assets?clientId=${encodeURIComponent(clientId)}`)
  const initialState = reelmotionVideoTimeline(banner, assets)
  const { project, timeline } = await api<{ project: { id: string }, timeline: { state: unknown } | null }>('/api/agency/audio/projects', {
    method: 'POST', headers: { 'Idempotency-Key': `reelmotion-video:${bannerId}` },
    body: { title: banner.name, clientId, mediaType: 'av', sourceBannerProjectId: bannerId, initialState }
  })
  if (!project?.id || !timeline) throw new Error('Video Studio draft needs a persistence check; the banner draft is retained')
  const saved = await api<{ project: { id: string, clientId: string | null, mediaType: string }, timeline: { state: unknown } | null }>(`/api/agency/audio/projects/${encodeURIComponent(project.id)}`)
  if (saved.project.id !== project.id || saved.project.clientId !== clientId || saved.project.mediaType !== 'av' || !sameImportedCanvas(saved.timeline?.state, timeline.state)) throw new Error('Video Studio draft needs a persistence check; retry the same draft action')
  return project.id
}
