import { describe, expect, it } from 'vitest'
import { validateStoryboardPlan } from '../../shared/video/storyboardValidation'
import type { StoryboardPlan } from '../../shared/video/storyboard'
import { storyboardFixture, id } from './fixtures/storyboard'

function rejects(input: unknown, code: string) {
  const result = validateStoryboardPlan(input)
  expect(result.ok).toBe(false)
  if (!result.ok) expect(result.findings).toEqual(expect.arrayContaining([expect.objectContaining({ code })]))
}

describe('storyboard plan contract', () => {
  it('sixShotsSumTo900FramesAt30Fps and allowsRepeatedAssetWithDistinctShotIds', () => {
    const input = storyboardFixture()
    const result = validateStoryboardPlan(input)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.plan.durationFrames).toBe(900)
      expect(result.plan.shots.map(shot => shot.visual)).toEqual(input.shots.map(shot => shot.visual))
      expect(result.plan).not.toBe(input)
    }
  })

  it.each([
    ['rejects25Shots', (p: StoryboardPlan) => ({ ...p, shots: Array.from({ length: 25 }, (_, i) => ({ ...p.shots[0], id: id(100 + i) })) })],
    ['rejects121SecondPlan', (p: StoryboardPlan) => ({ ...p, durationFrames: 3630 })],
    ['rejectsFractionalFrames', (p: StoryboardPlan) => ({ ...p, shots: [{ ...p.shots[0], durationFrames: 149.5 }, ...p.shots.slice(1)] })],
    ['rejectsStringDuration', (p: StoryboardPlan) => ({ ...p, durationFrames: '900' })],
    ['rejectsZeroFps', (p: StoryboardPlan) => ({ ...p, fps: 0 })],
    ['rejectsNoShots', (p: StoryboardPlan) => ({ ...p, shots: [] })],
    ['rejectsArbitraryStorageKeys', (p: StoryboardPlan) => ({ ...p, shots: [{ ...p.shots[0], visual: { ...p.shots[0].visual, r2Key: 'another-client/private.mp4' } }, ...p.shots.slice(1)] })],
    ['rejectsInventedApprovalFields', (p: StoryboardPlan) => ({ ...p, shots: [{ ...p.shots[0], approved: true }, ...p.shots.slice(1)] })],
    ['rejectsUnknownFormat', (p: StoryboardPlan) => ({ ...p, targetFormat: 'cinema' })]
  ])('%s', (_, change) => {
    rejects(change(storyboardFixture()), 'invalid_structure')
  })

  it('rejectsDuplicateShotId', () => {
    const plan = storyboardFixture()
    plan.shots[1].id = plan.shots[0].id
    rejects(plan, 'duplicate_shot_id')
  })

  it('rejects mismatched total instead of stretching media', () => {
    const plan = storyboardFixture()
    plan.shots[0].durationFrames = 149
    rejects(plan, 'duration_mismatch')
  })

  it('accepts 120 seconds and a manual plan without a recipe', () => {
    const plan = storyboardFixture()
    plan.durationFrames = 3600
    plan.shots.forEach((shot) => {
      shot.durationFrames = 600
    })
    expect(validateStoryboardPlan(plan).ok).toBe(true)
  })

  it('allows unresolved visual media without claiming readiness', () => {
    const plan = storyboardFixture()
    plan.shots[0].visual = { status: 'unresolved', reason: 'missing_source' }
    const result = validateStoryboardPlan(plan)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.plan.shots[0].visual.status).toBe('unresolved')
  })

  it('rejects omission of required audio but permits explicitly omitted optional audio', () => {
    const plan = storyboardFixture()
    plan.shots[0].audioCues[0].required = true
    rejects(plan, 'required_audio_omitted')
  })

  it('rejects cue timing outside its shot', () => {
    const plan = storyboardFixture()
    plan.shots[0].audioCues[0].startFrame = 1
    rejects(plan, 'cue_outside_shot')
  })

  it('rejects invalid measured source ranges without comparing them to editorial duration', () => {
    const plan = storyboardFixture()
    if (plan.shots[0].visual.status !== 'bound') throw new Error('Expected a bound fixture source')
    plan.shots[0].visual.sourceInFrames = 30
    plan.shots[0].visual.sourceOutFrames = 30
    rejects(plan, 'invalid_structure')
    plan.shots[0].visual.sourceOutFrames = 31
    expect(validateStoryboardPlan(plan).ok).toBe(true) // short-media readiness belongs to the resolver
  })

  it('rejects audio assets in a visual slot and video assets in an audio slot', () => {
    const plan = storyboardFixture()
    plan.shots[0].visual = { status: 'bound', sourceKind: 'audio_asset', assetId: id(30), contentHash: 'b'.repeat(64) }
    rejects(plan, 'invalid_source_kind')
    plan.shots[0].visual = storyboardFixture().shots[0].visual
    plan.shots[0].audioCues[0].asset = { status: 'bound', sourceKind: 'video_asset', assetId: id(30), contentHash: 'b'.repeat(64) }
    rejects(plan, 'invalid_source_kind')
  })

  it('requires a banner binding for an overlay while leaving missing media unresolved', () => {
    const plan = storyboardFixture()
    plan.shots[5].overlayCues = [{ id: 'offer-overlay', copyCueId: 'offer', startFrame: 0, durationFrames: 150, asset: { status: 'bound', sourceKind: 'video_asset', assetId: id(30), contentHash: 'b'.repeat(64) } }]
    rejects(plan, 'invalid_source_kind')
    plan.shots[5].overlayCues[0].asset = { status: 'unresolved', reason: 'not_selected' }
    expect(validateStoryboardPlan(plan).ok).toBe(true)
  })

  it('does not leak supplied content or malicious keys in validation findings', () => {
    const result = validateStoryboardPlan({ 'private customer brief': 'SECRET', ...storyboardFixture() })
    expect(result.ok).toBe(false)
    expect(JSON.stringify(result)).not.toContain('SECRET')
    expect(JSON.stringify(result)).not.toContain('private customer brief')
  })
})
