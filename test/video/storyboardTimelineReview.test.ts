import { expect, it, vi } from 'vitest'
import { TimelineStateSchema } from '~~/server/utils/audio/timelineSchema'
import { reviewAdjustedTimelineIn } from '~~/server/utils/video-storyboard/timelineReview'

const state = vi.hoisted(() => ({ value: null as unknown }))
vi.mock('~~/server/utils/db', () => ({ transaction: vi.fn() }))
vi.mock('~~/server/utils/audio/projects', () => ({ getCurrentTimelineIfMatchingIn: async () => ({ id: 'timeline', editRevision: 1, state: state.value }) }))
vi.mock('~~/server/utils/video-storyboard/access', () => ({ requireStoryboardProjectIn: async () => ({ id: 'project', createdBy: 'actor', clientId: null }) }))
vi.mock('~~/server/utils/video-storyboard/apply', () => ({ fenceWriteAuthorityIn: vi.fn(), fenceDependenciesIn: vi.fn() }))
vi.mock('~~/server/utils/video-storyboard/references', () => ({ canonicalReferenceIn: async () => ({ contentHash: 'hash' }) }))
vi.mock('~~/server/utils/video-storyboard/store', () => ({ getStoryboardIn: async () => ({ referenceSet: { id: 'refs', references: ['logo', 'style'].map(role => ({ role, sourceKind: 'video_asset', assetId: 'asset', contentHash: 'hash', decision: 'approved', approval: { contentHash: 'hash' } })) } }) }))
vi.mock('~~/server/utils/video-storyboard/lineage', () => ({ loadTimelineObligationsIn: async () => ({ applicationId: 'app', baseline: state.value, contract: { revisionId: 'revision', copyRevisionId: 'copy', copyHash: 'hash', sources: [{ clipId: 'clip', shotId: 'shot', sourceKind: 'video_asset', assetId: 'asset', contentHash: 'hash', startFrame: 0, durationFrames: 90, sourceInFrames: 0 }], cues: [] } }) }))
vi.mock('~~/server/utils/video-storyboard/renderValidation', () => ({ remapObligations: (contract: unknown) => structuredClone(contract), prepareStoryboardRenderIn: async () => ({ findings: [] }) }))
it('reviews one canonical source assigned multiple reference roles without treating it as ambiguous media', async () => {
  state.value = TimelineStateSchema.parse({ media_type: 'av', duration_sec: 3, tracks: [{ id: 'video', name: 'Video', kind: 'video', clips: [{ id: 'clip', type: 'video', asset_id: 'asset', r2_key: 'owned/video.mp4', timeline_start_sec: 0, duration_sec: 3, source_in_sec: 0, source_out_sec: 3, base_source: 'uploaded_footage' }] }] })
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('FROM video_assets')) return { rows: [{ id: 'asset', r2_key: 'owned/video.mp4' }] }
    if (sql.includes('INSERT INTO video_storyboard_timeline_reviews')) return { rows: [{ created_at: 'now' }] }
    return { rows: [] }
  })
  const result = await reviewAdjustedTimelineIn({ query }, { actor: { id: 'actor', role: 'member' }, projectId: 'project', operationId: 'operation', expectedTimelineId: 'timeline', expectedEditRevision: 1, obligationMappings: [] })
  expect(result.findings).toEqual([])
  expect(query.mock.calls.some(([sql]) => sql.includes('UPDATE media_timelines'))).toBe(false)
})
