import { z } from 'zod'

const client = z.strictObject({ clientId: z.string().uuid() })
const launch = client.extend({ launchId: z.string().uuid() })
const exact = launch.extend({ expectedConfigVersion: z.number().int().positive(), expectedConfigHash: z.string().regex(/^[a-f0-9]{64}$/), ack: z.literal(true) })
const review = exact.extend({ reason: z.string().trim().min(10).max(1000) })
export const departmentCampaignContracts = [
  ['marketing_list_pmax_briefs', client, false, 'List up to 50 approved client PMax briefs eligible for preparation.'],
  ['marketing_get_pmax_launch', launch, false, 'Read safe launch state, exact config identity and provider resource IDs. No serving claim.'],
  ['marketing_prepare_pmax_launch', client.extend({ briefId: z.string().uuid() }), true, 'Prepare an approved PMax inventory brief through the existing rollout and launch store.'],
  ['marketing_preflight_pmax_launch', exact, true, 'Collect live provider evidence and persist deterministic preflight and remediation tasks for this exact launch.'],
  ['marketing_approve_pmax_launch', review, true, 'Independently approve this exact launch for PAUSED creation only.'],
  ['marketing_execute_pmax_launch', exact, true, 'Execute exact independently approved PAUSED creation. Unknown outcomes require reconciliation.'],
  ['marketing_approve_pmax_activation', review, true, 'Independently approve activation of an exact verified PAUSED launch.'],
  ['marketing_activate_pmax_launch', exact, true, 'Activate only an exact separately approved launch under the activation kill switch.']
] as const
