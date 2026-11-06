import { CopyRevisionSchema, StoryboardPlanSchema } from './storyboard'
import type { CopyRevision, ReadinessFinding, StoryboardPlan, StoryboardPlanValidation } from './storyboard'

function finding(code: string, message: string, shotId?: string): ReadinessFinding {
  return { code, severity: 'blocker', message, ...(shotId ? { shotId } : {}) }
}

function hasDuplicates(values: string[]): boolean {
  return new Set(values).size !== values.length
}

function copyAssignments(plan: StoryboardPlan): ReadinessFinding[] {
  const findings: ReadinessFinding[] = []
  const segmentIds = plan.copy.scriptSegments.map(segment => segment.id)
  const cueIds = plan.copy.cues.map(cue => cue.id)
  if (hasDuplicates(segmentIds) || hasDuplicates(cueIds)) {
    findings.push(finding('duplicate_copy_id', 'Copy segment and cue IDs must each be unique.'))
  }
  const spoken = plan.shots.flatMap(shot => shot.spokenSegmentIds)
  if (spoken.length !== segmentIds.length || spoken.some((id, index) => id !== segmentIds[index])) {
    findings.push(finding('script_coverage_mismatch', 'Shots must cover the script once, in its original order.'))
  }
  const assignedCues = new Set(plan.shots.flatMap(shot => shot.copyCueIds))
  if (plan.copy.cues.some(cue => cue.required && !assignedCues.has(cue.id))) {
    findings.push(finding('required_copy_missing', 'Required on-screen copy must be assigned to a shot.'))
  }
  for (const shot of plan.shots) {
    if (hasDuplicates(shot.copyCueIds) || shot.copyCueIds.some(id => !cueIds.includes(id))) {
      findings.push(finding('invalid_copy_reference', 'Shot copy references must be known and unique.', shot.id))
    }
    if (shot.captionCues.some(cue => !shot.spokenSegmentIds.includes(cue.spokenSegmentId) || !segmentIds.includes(cue.spokenSegmentId))) {
      findings.push(finding('invalid_caption_reference', 'Caption cues must reference speech assigned to this shot.', shot.id))
    }
    if (shot.overlayCues.some(cue => !shot.copyCueIds.includes(cue.copyCueId) || !cueIds.includes(cue.copyCueId))) {
      findings.push(finding('invalid_overlay_reference', 'Overlay cues must reference copy assigned to this shot.', shot.id))
    }
  }
  return findings
}

/** Structural/semantic validation only. Success does not mean ready to apply or render. */
export function validateStoryboardPlan(input: unknown): StoryboardPlanValidation {
  const parsed = StoryboardPlanSchema.safeParse(input)
  if (!parsed.success) {
    // Zod errors may contain supplied keys/values. Never echo them into findings.
    return { ok: false, findings: [finding('invalid_structure', 'Storyboard fields or limits are invalid.')] }
  }
  const plan = parsed.data
  const findings = copyAssignments(plan)
  if (plan.copyRevisionId !== plan.copy.id) findings.push(finding('copy_revision_mismatch', 'The plan must pin its embedded copy revision.'))
  if (plan.inputMode === 'approved_script' && !plan.copy.approval) findings.push(finding('copy_not_approved', 'Approved-script mode requires a recorded copy approval.'))
  if (hasDuplicates(plan.shots.map(shot => shot.id))) findings.push(finding('duplicate_shot_id', 'Each shot must have its own stable ID.'))
  if (plan.shots.reduce((total, shot) => total + shot.durationFrames, 0) !== plan.durationFrames) {
    findings.push(finding('duration_mismatch', 'Shot durations must sum to the requested duration.'))
  }
  if (plan.recipe && (plan.recipe.resolvedValues.targetFormat !== plan.targetFormat
    || plan.recipe.resolvedValues.durationSeconds !== plan.durationFrames / plan.fps)) {
    findings.push(finding('recipe_plan_mismatch', 'Pinned recipe format and duration must match the plan.'))
  }
  for (const shot of plan.shots) {
    // The resolver still checks actual media/ownership; reject impossible lane kinds here.
    if ((shot.visual.status === 'bound' && !['video_asset', 'source_asset'].includes(shot.visual.sourceKind))
      || shot.audioCues.some(cue => cue.asset.status === 'bound' && cue.asset.sourceKind !== 'audio_asset')
      || shot.overlayCues.some(cue => cue.asset.status === 'bound' && cue.asset.sourceKind !== 'banner_project')) {
      findings.push(finding('invalid_source_kind', 'Asset kind is incompatible with its lane.', shot.id))
    }
    const cues = [...shot.audioCues, ...shot.captionCues, ...shot.overlayCues]
    if (hasDuplicates(cues.map(cue => cue.id))) findings.push(finding('duplicate_cue_id', 'Cue IDs must be unique within a shot.', shot.id))
    if (cues.some(cue => cue.startFrame + cue.durationFrames > shot.durationFrames)) {
      findings.push(finding('cue_outside_shot', 'Cue timing must fit within its shot.', shot.id))
    }
    if (shot.audioCues.some(cue => cue.required && cue.asset.status === 'omitted')) {
      findings.push(finding('required_audio_omitted', 'Required audio cannot be explicitly omitted.', shot.id))
    }
  }
  return findings.length ? { ok: false, findings } : { ok: true, plan }
}

/**
 * The caller MUST load canonicalCopy from authorized server storage. Never pass
 * the client-supplied copy as both arguments. Exact comparison supplements (not
 * replaces) server actor/approval/hash verification and usage authorization.
 */
export function validateApprovedCopy(plan: StoryboardPlan, canonicalCopy: CopyRevision): ReadinessFinding[] {
  const canonical = CopyRevisionSchema.safeParse(canonicalCopy)
  if (!canonical.success || !canonical.data.approval) return [finding('copy_not_approved', 'Canonical copy requires a valid approval.')]
  const candidate = CopyRevisionSchema.safeParse(plan.copy)
  // Parsing creates a canonical property order; no string normalization occurs.
  if (!candidate.success || plan.copyRevisionId !== canonical.data.id
    || JSON.stringify(candidate.data) !== JSON.stringify(canonical.data)) {
    return [finding('copy_revision_mismatch', 'Approved copy differs from the canonical revision.')]
  }
  return copyAssignments(plan)
}
