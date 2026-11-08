import { queryOne } from './db'
import type { StoryboardRenderManifest } from '../../../shared/video-storyboard/renderManifest'
import { StoryboardPublicationUncertainError } from './videoCompositeRender'
import { digestMcpRequestBody } from '../../../shared/utils/mcpRequestClaim'
import type { VideoRenderMessage } from './videoCompositeRender'

/** Queue fields are routing hints; only persisted rows can exempt legacy renders. */
export async function loadStoryboardRenderInputs(msg: VideoRenderMessage) {
  const row = await queryOne<{
    project_id: string
    timeline_id: string
    status: string
    manifest: StoryboardRenderManifest | null
    manifest_hash: string | null
    obligated: boolean
  }>(`SELECT j.project_id, j.timeline_id, j.status, m.manifest, m.manifest_hash,
      EXISTS(SELECT 1 FROM video_storyboard_timeline_obligations o WHERE o.timeline_id=j.timeline_id) AS obligated
    FROM media_render_jobs j LEFT JOIN video_storyboard_render_manifests m ON m.job_id=j.id WHERE j.id=$1`, [msg.jobId])
  if (!row || row.project_id !== msg.projectId || row.timeline_id !== msg.timelineId)
    throw new Error('Render job identity mismatch')
  if (row.status === 'done') return { completed: true as const }
  if (!row.manifest) {
    if (row.obligated) throw new Error('Storyboard render manifest required')
    return null
  }
  if (!row.manifest_hash || await digestMcpRequestBody(row.manifest) !== row.manifest_hash) throw new Error('Render manifest fingerprint mismatch')
  return { manifest: row.manifest, manifestHash: row.manifest_hash }
}
interface AuthorityEnv { STORYBOARD_APP_ORIGIN?: string, STORYBOARD_RENDER_SECRET?: string }
/** Fixed deployment configuration only; never accepts callback URLs from messages. */
export async function callStoryboardRenderAuthority(env: AuthorityEnv, body: {
  action: 'check' | 'publish'
  jobId: string
  manifestHash: string
  variants?: Record<string, string>
  costCents?: number
}): Promise<void> {
  if (!env.STORYBOARD_RENDER_SECRET || !env.STORYBOARD_APP_ORIGIN) throw new Error('Storyboard render authority unavailable')
  const origin = new URL(env.STORYBOARD_APP_ORIGIN)
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash
    || !['app.xeroflow.io', 'agency-dashboard.pages.dev'].includes(origin.hostname) || origin.port)
    throw new Error('Storyboard render authority origin invalid')
  let response: Response
  try {
    response = await fetch(new URL('/api/internal/video-storyboard/render-eligibility', origin), {
      method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(60_000),
      headers: { 'content-type': 'application/json', 'authorization': `Bearer ${env.STORYBOARD_RENDER_SECRET}` },
      body: JSON.stringify(body)
    })
  } catch (error) {
    if (body.action === 'publish') throw new StoryboardPublicationUncertainError('Storyboard publication response unavailable')
    throw error
  }
  if (body.action === 'publish' && (response.status >= 500 || response.status === 408 || response.status === 429)) throw new StoryboardPublicationUncertainError('Storyboard publication response unavailable')
  if (!response.ok) throw new Error('Storyboard render eligibility rejected')
}
