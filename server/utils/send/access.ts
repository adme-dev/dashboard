export type SendActor
  = { kind: 'workspace', id: string, role: string }
    | { kind: 'public_sender', id: string }

export interface SendTransferAccessRecord {
  id: string
  senderClass: 'workspace' | 'public'
  ownerTeamMemberId: string | null
  publicSenderId: string | null
  clientId: string | null
}

export interface SendAccessDeps {
  hasClientAssignment(clientId: string, actorId: string): Promise<boolean>
}

const MANAGEMENT_ROLES = new Set(['owner', 'admin', 'lead', 'project_manager'])

export async function canAccessSendTransfer(
  transfer: SendTransferAccessRecord,
  actor: SendActor,
  deps: SendAccessDeps
): Promise<boolean> {
  if (actor.kind === 'public_sender') {
    return transfer.senderClass === 'public' && transfer.publicSenderId === actor.id
  }

  if (transfer.senderClass !== 'workspace') return false
  if (transfer.ownerTeamMemberId === actor.id) return true
  if (MANAGEMENT_ROLES.has(actor.role)) return true
  if (!transfer.clientId) return false
  return deps.hasClientAssignment(transfer.clientId, actor.id)
}
