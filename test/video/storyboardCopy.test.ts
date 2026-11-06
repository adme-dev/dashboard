import { describe, expect, it } from 'vitest'
import { validateApprovedCopy, validateStoryboardPlan } from '../../shared/video/storyboardValidation'
import { storyboardFixture } from './fixtures/storyboard'

function codes(plan: unknown) {
  const result = validateStoryboardPlan(plan)
  return result.ok ? [] : result.findings.map(finding => finding.code)
}

describe('storyboard exact copy', () => {
  it('approvedCopyPreservesUnicodeAndOrder without trimming or normalizing', () => {
    const plan = storyboardFixture()
    expect(validateApprovedCopy(plan, structuredClone(plan.copy))).toEqual([])
    const result = validateStoryboardPlan(plan)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.plan.copy.cues[0].text).toBe('$39,990 drive away*\n*T&Cs apply.  ')
  })

  it.each(['omit', 'duplicate', 'reorder', 'unknown'])('rejects %s script assignment', (change) => {
    const plan = storyboardFixture()
    if (change === 'omit') plan.shots[5].spokenSegmentIds = []
    if (change === 'duplicate') plan.shots[1].spokenSegmentIds = ['intro']
    if (change === 'reorder') {
      plan.shots[0].spokenSegmentIds = ['close']
      plan.shots[5].spokenSegmentIds = ['intro']
    }
    if (change === 'unknown') plan.shots[5].spokenSegmentIds = ['invented']
    expect(codes(plan)).toContain('script_coverage_mismatch')
  })

  it.each(['wording', 'price', 'whitespace', 'required', 'hash', 'approval'])('rejects changed %s even when client claims the same revision', (change) => {
    const plan = storyboardFixture()
    const canonical = structuredClone(plan.copy)
    if (change === 'wording') plan.copy.scriptSegments[0].text = 'A different approved script'
    if (change === 'price') plan.copy.cues[0].text = '$29,990 drive away'
    if (change === 'whitespace') plan.copy.cues[0].text = plan.copy.cues[0].text.trim()
    if (change === 'required') plan.copy.cues[0].required = false
    if (change === 'hash') plan.copy.contentHash = 'c'.repeat(64)
    if (change === 'approval') plan.copy.approval!.actorId = plan.projectId
    expect(validateApprovedCopy(plan, canonical).map(finding => finding.code)).toContain('copy_revision_mismatch')
  })

  it('requires a trusted approved canonical revision, not just a matching client hash', () => {
    const plan = storyboardFixture()
    const canonical = structuredClone(plan.copy)
    canonical.approval = null
    expect(validateApprovedCopy(plan, canonical).map(finding => finding.code)).toContain('copy_not_approved')
  })

  it('rejects duplicate script IDs and missing required on-screen copy', () => {
    const plan = storyboardFixture()
    plan.copy.scriptSegments[1].id = 'intro'
    expect(codes(plan)).toContain('duplicate_copy_id')
    plan.shots[5].copyCueIds = []
    expect(codes(plan)).toContain('required_copy_missing')
  })

  it('validates cue references in idea mode too', () => {
    const plan = storyboardFixture()
    plan.inputMode = 'idea'
    plan.shots[0].captionCues = [{ id: 'caption', spokenSegmentId: 'missing', startFrame: 0, durationFrames: 30, timing: 'proposed' }]
    plan.shots[0].overlayCues = [{ id: 'overlay', copyCueId: 'missing', startFrame: 0, durationFrames: 30, asset: { status: 'unresolved', reason: 'missing_source' } }]
    expect(codes(plan)).toContain('invalid_caption_reference')
    expect(codes(plan)).toContain('invalid_overlay_reference')
  })
})
