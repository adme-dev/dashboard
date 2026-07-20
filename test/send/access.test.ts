import { describe, expect, it, vi } from 'vitest'
import { canAccessSendTransfer } from '../../server/utils/send/access'

const workspaceTransfer = {
  id: '44444444-4444-4444-8444-444444444444',
  senderClass: 'workspace' as const,
  ownerTeamMemberId: 'owner-1',
  publicSenderId: null,
  clientId: '11111111-1111-4111-8111-111111111111'
}

describe('Send transfer access', () => {
  it('allows the workspace owner without an assignment lookup', async () => {
    const hasClientAssignment = vi.fn()

    await expect(canAccessSendTransfer(workspaceTransfer, {
      kind: 'workspace',
      id: 'owner-1',
      role: 'member'
    }, { hasClientAssignment })).resolves.toBe(true)
    expect(hasClientAssignment).not.toHaveBeenCalled()
  })

  it('allows an assigned collaborator and denies an unassigned cross-client actor', async () => {
    const hasClientAssignment = vi.fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
    const actor = { kind: 'workspace' as const, id: 'collaborator-1', role: 'member' }

    await expect(canAccessSendTransfer(workspaceTransfer, actor, { hasClientAssignment })).resolves.toBe(true)
    await expect(canAccessSendTransfer(workspaceTransfer, actor, { hasClientAssignment })).resolves.toBe(false)
    expect(hasClientAssignment).toHaveBeenNthCalledWith(
      1,
      '11111111-1111-4111-8111-111111111111',
      'collaborator-1'
    )
  })

  it('allows management while keeping non-client workspace transfers owner-only for members', async () => {
    const hasClientAssignment = vi.fn()
    const unscopedTransfer = { ...workspaceTransfer, clientId: null }

    await expect(canAccessSendTransfer(unscopedTransfer, {
      kind: 'workspace',
      id: 'admin-1',
      role: 'admin'
    }, { hasClientAssignment })).resolves.toBe(true)
    await expect(canAccessSendTransfer(unscopedTransfer, {
      kind: 'workspace',
      id: 'member-1',
      role: 'member'
    }, { hasClientAssignment })).resolves.toBe(false)
  })

  it('scopes a public sender to exactly their own public transfers', async () => {
    const hasClientAssignment = vi.fn()
    const publicTransfer = {
      ...workspaceTransfer,
      senderClass: 'public' as const,
      ownerTeamMemberId: null,
      publicSenderId: 'public-sender-1',
      clientId: null
    }

    await expect(canAccessSendTransfer(publicTransfer, {
      kind: 'public_sender',
      id: 'public-sender-1'
    }, { hasClientAssignment })).resolves.toBe(true)
    await expect(canAccessSendTransfer(publicTransfer, {
      kind: 'public_sender',
      id: 'public-sender-2'
    }, { hasClientAssignment })).resolves.toBe(false)
    await expect(canAccessSendTransfer(workspaceTransfer, {
      kind: 'public_sender',
      id: 'public-sender-1'
    }, { hasClientAssignment })).resolves.toBe(false)
  })
})
