import type { FetchLike } from './contracts'
import type { CrmInboundArtifactManifest } from './r2Artifacts'
import type { InboundEmailRoute } from './routing'

type CrmWorkerRoute = Extract<
  InboundEmailRoute,
  { kind: 'lead' | 'crm_reply' }
>

interface DeliverCrmInboundEmailInput {
  route: CrmWorkerRoute
  recipient: string
  messageId: string | null
  manifest: CrmInboundArtifactManifest
  receivedAt: string
  apiUrl: string
  workerSecret: string
}

export interface CrmInboundAdapterResult {
  accepted: boolean
  status: number
}

function recipientDomain(recipient: string): string {
  const parts = recipient.split('@')
  const domain = parts.length === 2 ? parts[1]?.toLowerCase() : undefined
  if (!domain) throw new Error('Invalid CRM email recipient')
  return domain
}

export async function deliverCrmInboundEmail(
  input: DeliverCrmInboundEmailInput,
  dependencies: { fetch: FetchLike }
): Promise<CrmInboundAdapterResult> {
  const response = await dependencies.fetch(
    `${input.apiUrl.replace(/\/+$/, '')}/api/internal/crm-email/inbound`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-crm-email-secret': input.workerSecret
      },
      body: JSON.stringify({
        routeKind: input.route.kind === 'lead'
          ? 'lead_inbox'
          : 'conversation_reply',
        routeToken: input.route.token,
        recipientDomain: recipientDomain(input.recipient),
        providerMessageId: input.messageId?.trim()
          || `sha256:${input.manifest.rawMimeSha256}`,
        ...input.manifest,
        receivedAt: input.receivedAt
      })
    }
  )

  return {
    accepted: response.ok,
    status: response.status
  }
}
