import { describe, expect, it } from 'vitest'
import { validateObligatedTimeline, remapObligations } from '~~/server/utils/video-storyboard/renderValidation'
import { TimelineStateSchema, type CaptionClip } from '~~/server/utils/audio/timelineSchema'
import type { StoryboardObligations } from '~~/shared/video/storyboardCompile'

const state = () => TimelineStateSchema.parse({ media_type: 'av', schema_version: 2, duration_sec: 3, tracks: [{ id: 'cap', name: 'Caption', kind: 'caption', clips: [{ id: 'c', type: 'caption', text: 'Exact  copy\n*Terms', timeline_start_sec: 0, duration_sec: 3 }] }] })
const contract = (): StoryboardObligations => ({ revisionId: 'revision', copyRevisionId: 'copy', copyHash: 'hash', sources: [], cues: [{ clipId: 'c', shotId: 'shot', cueId: 'cue', copyId: 'text', text: 'Exact  copy\n*Terms', required: true, startFrame: 0, durationFrames: 90 }] })
const codes = (s = state(), baseline = state()) => validateObligatedTimeline(s, baseline, contract()).map(f => f.code)
describe('server-owned render obligations', () => {
  it('accepts exact unchanged copy without advisory provenance', () => expect(codes()).toEqual([]))
  it.each(['delete', 'hidden', 'muted', 'copy', 'outside', 'zero duration', 'duplicate'])('blocks direct save %s', (action) => {
    const s = state()
    const c = s.tracks[0].clips[0] as CaptionClip
    if (action === 'delete') s.tracks[0].clips = []
    if (action === 'hidden') s.tracks[0].hidden = true
    if (action === 'muted') s.tracks[0].muted = true
    if (action === 'copy') c.text = 'Exact copy'
    if (action === 'outside') c.timeline_start_sec = -3
    if (action === 'zero duration') c.duration_sec = 0
    if (action === 'duplicate') s.tracks[0].clips.push({ ...c })
    expect(codes(s).length).toBeGreaterThan(0)
  })
  it('marks only adjusted timing pending and accepts a newly reviewed baseline', () => {
    const s = state()
    s.tracks[0].clips[0].timeline_start_sec = 1
    s.duration_sec = 4
    expect(codes(s)).toContain('adjusted_edit_review_required')
    expect(codes(s, s)).toEqual([])
  })
  it('never lets review approve invalid copy', () => {
    const s = state()
    ;(s.tracks[0].clips[0] as CaptionClip).text = 'short'
    expect(codes(s, s)).toContain('exact_copy_mismatch')
  })
  it('maps explicit replacements without modifying clips or original obligations', () => {
    const source = contract()
    const s = state()
    s.tracks[0].clips[0].id = 'replacement'
    const mapped = remapObligations(source, [{ clipId: 'c', replacementClipId: 'replacement' }])
    expect(mapped.cues[0].clipId).toBe('replacement')
    expect(source.cues[0].clipId).toBe('c')
    expect(validateObligatedTimeline(s, s, mapped)).toEqual([])
  })
  it('rejects unknown and colliding mapping identities', () => {
    expect(() => remapObligations(contract(), [{ clipId: 'missing', replacementClipId: 'x' }])).toThrow()
    expect(() => remapObligations(contract(), [{ clipId: 'c', replacementClipId: 'x' }, { clipId: 'c', replacementClipId: 'y' }])).toThrow()
  })
})

it('blocks added unreviewed media and overlapping copy overlays', () => {
  const s = state()
  s.tracks.push(TimelineStateSchema.parse({ tracks: [{ id: 'video', name: 'Video', kind: 'video', clips: [{ id: 'unapproved', type: 'video', r2_key: 'x', timeline_start_sec: 0, duration_sec: 3, source_out_sec: 3, base_source: 'uploaded_footage' }] }] }).tracks[0])
  expect(codes(s)).toContain('unreviewed_source')
  const overlapping = state()
  overlapping.tracks[0].clips.push({ ...overlapping.tracks[0].clips[0], id: 'covering' })
  expect(codes(overlapping)).toContain('required_copy_overlap')
})
it('does not approve a caption style which the measured renderer cannot preserve', () => {
  const s = state()
  ;(s.tracks[0].clips[0] as CaptionClip).style = 'bold_social'
  expect(codes(s, s)).toContain('caption_style_unsupported')
})

it('reports the 60-second per-copy-clip limit explicitly without limiting total storyboard duration', () => {
  const long = state()
  long.duration_sec = 61
  ;(long.tracks[0].clips[0] as CaptionClip).duration_sec = 61
  const finding = validateObligatedTimeline(long, long, contract()).find(f => f.code === 'copy_clip_duration_unsupported')
  expect(finding?.message).toContain('60 seconds')
  const full = state()
  full.duration_sec = 120
  ;(full.tracks[0].clips[0] as CaptionClip).duration_sec = 60
  full.tracks[0].clips.push({ ...full.tracks[0].clips[0], id: 'second', timeline_start_sec: 60 })
  const obligations = contract()
  obligations.cues.push({ ...obligations.cues[0], clipId: 'second' })
  expect(validateObligatedTimeline(full, full, obligations)).toEqual([])
})
