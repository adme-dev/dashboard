import { describe, expect, it } from 'vitest'
import {
  FileDeclarationSchema,
  PublicTransferDraftSchema,
  WorkspaceTransferDraftSchema,
  canTransitionFile,
  canTransitionTransfer
} from '../../shared/types/send'

const future = '2026-08-01T00:00:00.000Z'

describe('Send external contracts', () => {
  it('parses and normalizes a strict workspace draft', () => {
    const result = WorkspaceTransferDraftSchema.parse({
      title: '  Quarterly assets  ',
      message: ' Ready for review ',
      clientId: '11111111-1111-4111-8111-111111111111',
      projectId: '22222222-2222-4222-8222-222222222222',
      recipients: [' Client@Example.COM '],
      expiresAt: future,
      maxDownloads: 5,
      idempotencyKey: 'draft-idempotency-0001'
    })

    expect(result.title).toBe('Quarterly assets')
    expect(result.message).toBe('Ready for review')
    expect(result.recipients).toEqual(['client@example.com'])
  })

  it('rejects unknown keys and a project without a client', () => {
    const draft = {
      title: 'Assets',
      recipients: [],
      expiresAt: future,
      idempotencyKey: 'draft-idempotency-0001'
    }

    expect(WorkspaceTransferDraftSchema.safeParse({ ...draft, isAdmin: true }).success).toBe(false)
    expect(WorkspaceTransferDraftSchema.safeParse({
      ...draft,
      projectId: '22222222-2222-4222-8222-222222222222'
    }).success).toBe(false)
  })

  it('keeps the public draft free of workspace identity claims', () => {
    const draft = {
      title: 'Public assets',
      recipients: ['recipient@example.com'],
      expiresAt: future,
      password: 'correct horse battery staple',
      idempotencyKey: 'draft-idempotency-0002'
    }

    expect(PublicTransferDraftSchema.parse(draft).recipients).toEqual(['recipient@example.com'])
    expect(PublicTransferDraftSchema.safeParse({
      ...draft,
      clientId: '11111111-1111-4111-8111-111111111111'
    }).success).toBe(false)
    expect(PublicTransferDraftSchema.safeParse({ ...draft, password: 'short' }).success).toBe(false)
    expect(PublicTransferDraftSchema.safeParse({
      ...draft,
      recipients: ['Recipient@example.com', 'recipient@example.com']
    }).success).toBe(false)
  })

  it('rejects passwords that exceed bcrypt input capacity in UTF-8 bytes', () => {
    const draft = {
      title: 'Protected assets',
      recipients: [],
      expiresAt: future,
      idempotencyKey: 'draft-idempotency-0003'
    }

    expect(WorkspaceTransferDraftSchema.safeParse({ ...draft, password: 'a'.repeat(72) }).success).toBe(true)
    expect(WorkspaceTransferDraftSchema.safeParse({ ...draft, password: 'é'.repeat(37) }).success).toBe(false)
  })

  it('validates file declarations without accepting an object key', () => {
    expect(FileDeclarationSchema.parse({
      fileName: ' campaign.zip ',
      fileSize: 1024,
      contentType: 'application/zip'
    }).fileName).toBe('campaign.zip')

    expect(FileDeclarationSchema.safeParse({
      fileName: 'campaign.zip',
      fileSize: 1024,
      contentType: 'application/zip',
      objectKey: 'caller/selected/key'
    }).success).toBe(false)
    expect(FileDeclarationSchema.safeParse({
      fileName: 'campaign.zip',
      fileSize: 1024,
      contentType: 'application/zip\r\nx-injected: true'
    }).success).toBe(false)
  })
})

describe('Send lifecycle transitions', () => {
  it('allows the approved transfer path and cleanup terminals', () => {
    expect(canTransitionTransfer('draft', 'uploading')).toBe(true)
    expect(canTransitionTransfer('draft', 'awaiting_verification')).toBe(true)
    expect(canTransitionTransfer('uploading', 'scanning')).toBe(true)
    expect(canTransitionTransfer('scanning', 'ready')).toBe(true)
    expect(canTransitionTransfer('ready', 'revoked')).toBe(true)
    expect(canTransitionTransfer('revoked', 'deletion_pending')).toBe(true)
    expect(canTransitionTransfer('deletion_pending', 'deleted')).toBe(true)
  })

  it('rejects skips, self transitions, and terminal regression', () => {
    expect(canTransitionTransfer('draft', 'ready')).toBe(false)
    expect(canTransitionTransfer('ready', 'uploading')).toBe(false)
    expect(canTransitionTransfer('deleted', 'draft')).toBe(false)
    expect(canTransitionTransfer('uploading', 'uploading')).toBe(false)
  })

  it('enforces upload, quarantine, and deletion ordering for files', () => {
    expect(canTransitionFile('pending', 'uploading')).toBe(true)
    expect(canTransitionFile('uploading', 'uploaded')).toBe(true)
    expect(canTransitionFile('uploaded', 'quarantined')).toBe(true)
    expect(canTransitionFile('quarantined', 'clean')).toBe(true)
    expect(canTransitionFile('clean', 'deleted')).toBe(true)
    expect(canTransitionFile('pending', 'clean')).toBe(false)
    expect(canTransitionFile('deleted', 'uploading')).toBe(false)
  })
})
