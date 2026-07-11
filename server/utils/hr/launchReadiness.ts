export const HR_LAUNCH_GATE_KEYS = [
  'privacy_impact_assessment',
  'staff_notice_and_consultation',
  'source_scope_review',
  'accessibility_review',
  'scoring_calibration',
  'ai_safety_review',
  'human_decision_only',
  'no_hidden_monitoring',
  'pilot_approval',
] as const

export type HrLaunchGateKey = typeof HR_LAUNCH_GATE_KEYS[number]

export const hrLaunchAttestationSchema = z.object({
  gateKey: z.enum(HR_LAUNCH_GATE_KEYS),
  status: z.enum(['approved', 'rejected', 'pending']),
  evidenceReference: z.string().trim().min(10).max(2000),
  limitations: z.string().trim().max(3000).optional(),
  expiresAt: z.string().datetime().optional(),
}).superRefine((input, context) => {
  if (input.expiresAt && Date.parse(input.expiresAt) <= Date.now()) {
    context.addIssue({ code: 'custom', path: ['expiresAt'], message: 'Expiry must be in the future.' })
  }
})

export interface HrLaunchGateApproval {
  status: 'approved' | 'rejected' | 'pending'
  approvedAt: string | null
  expiresAt: string | null
}

export type HrLaunchGateApprovals = Partial<Record<HrLaunchGateKey, HrLaunchGateApproval>>

export interface HrLaunchReadiness {
  ready: boolean
  missing: HrLaunchGateKey[]
  expired: HrLaunchGateKey[]
}

/** Fail-closed launch decision. This function never infers or auto-approves a gate. */
export function evaluateHrLaunchReadiness(
  approvals: HrLaunchGateApprovals,
  now = new Date(),
): HrLaunchReadiness {
  const missing: HrLaunchGateKey[] = []
  const expired: HrLaunchGateKey[] = []

  for (const key of HR_LAUNCH_GATE_KEYS) {
    const approval = approvals[key]
    if (!approval || approval.status !== 'approved' || !approval.approvedAt) {
      missing.push(key)
      continue
    }
    if (approval.expiresAt && Date.parse(approval.expiresAt) <= now.getTime()) {
      expired.push(key)
    }
  }

  return { ready: missing.length === 0 && expired.length === 0, missing, expired }
}
import { z } from 'zod'
