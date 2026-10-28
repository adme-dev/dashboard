import { z } from 'zod'
import { clientKpiTargetsSchema } from '~~/server/utils/clients/kpiTargets'
import { CreateQrSchema } from '~~/server/utils/qr/schemas'

const client = z.strictObject({ clientId: z.string().uuid() })
const page = client.extend({ afterId: z.string().uuid().optional(), limit: z.number().int().min(1).max(100).default(50) })
const text = z.string().trim().min(1).max(160)
export const departmentUtilityContracts = [
  ['marketing_list_lead_followups', page.extend({ status: z.enum(['new', 'contacted', 'qualified', 'won', 'lost', 'spam_suspected']).optional() }), false, 'Read stored lead IDs, status, campaign and follow-up ownership for one active client. Test/deleted leads excluded; no customer payload or contacts.'],
  ['marketing_list_qr_codes', page, false, 'List client QR links, destinations, activity and scan totals with bounded pagination.'],
  ['marketing_build_campaign_url', client.extend({ url: z.string().url().max(2048), source: text, medium: text, campaign: text, content: text.optional(), term: text.optional() }), false, 'Prepare a validated campaign URL with explicit UTM fields. Does not fetch or publish it.'],
  ['marketing_create_qr_code', CreateQrSchema.omit({ ab: true }).extend({ ack: z.literal(true) }), true, 'Create a client-scoped QR link with validated destination and native UTM/style settings. Saves history and a replay-safe receipt; does not distribute the link.'],
  ['marketing_get_qr_metrics', client.extend({ qrCodeId: z.string().uuid(), days: z.number().int().min(1).max(366).default(30) }), false, 'Read daily QR scan totals and distinct hashed-device counts for this client and QR. No raw IP or visitor data.'],
  ['marketing_get_client_kpi_targets', client, false, 'Read the active client campaign-health targets and exact revision; stored data only.'],
  ['marketing_set_client_kpi_targets', client.extend({ targets: clientKpiTargetsSchema, expectedRevision: z.string().regex(/^[a-f0-9]{64}$/), ack: z.literal(true) }), true, 'Replace the active client campaign-health targets against an exact read revision. Local atomic change with replay-safe receipt; no advertising spend or provider call.']
] as const
