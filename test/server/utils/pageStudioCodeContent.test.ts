import { describe, expect, it } from 'vitest'
import { CodeContentBindingSchema, verifyCodePageImport } from '~~/shared/pageStudio/codeContent'

import { codeFixture } from '../../fixtures/pageStudioCodeContent'

const scope = { tenantId: 'fixture', clientId: '22222222-2222-4222-8222-222222222222', siteId: '11111111-1111-4111-8111-111111111111' }

describe('native imported code checkpoint verification', () => {
  it('strictly parses binding without granting authority', () => {
    const value = { formatVersion: 1, kind: 'code-pages', operationId: 'import_1', indexDigest: 'a'.repeat(64), contentDigest: 'b'.repeat(64) }
    expect(CodeContentBindingSchema.parse(value)).toEqual(value)
    expect(CodeContentBindingSchema.safeParse({ ...value, pageCount: 1 }).success).toBe(false)
    expect(CodeContentBindingSchema.safeParse({ ...value, operationId: '../escape' }).success).toBe(false)
  })
  it('cold-verifies exact immutable links and derives route count from stored content', async () => {
    const f = await codeFixture()
    await expect(verifyCodePageImport(f.input, f.bucket)).resolves.toMatchObject({ pageCount: 1, codeContent: f.input.checkpoint.codeContent })
  })
  it.each(['actorId', 'expectedCheckpointId', 'checkpointId', 'createdAt'])('rejects changed operation %s', async (field) => {
    const f = await codeFixture()
    const operation = { ...f.operation, [field]: field === 'createdAt' ? '2026-11-06T00:00:00.000Z' : 'other' }
    f.set(`${f.prefix}/code-pages/imports/v1/import_1/intent.json`, { operation, schemaVersion: 1, scope })
    await expect(verifyCodePageImport(f.input, f.bucket)).rejects.toThrow()
  })
  it('requires the independently registered review', async () => {
    const f = await codeFixture()
    f.objects.delete(`platform/code-page-import-reviews/v1/${f.input.checkpoint.codeContent.contentDigest}.json`)
    await expect(verifyCodePageImport(f.input, f.bucket)).rejects.toThrow()
  })
  it('rejects missing or corrupt package bytes', async () => {
    const f = await codeFixture()
    f.objects.set(f.fileKey, new Uint8Array([1, 2]))
    await expect(verifyCodePageImport(f.input, f.bucket)).rejects.toThrow()
    f.objects.delete(f.fileKey)
    await expect(verifyCodePageImport(f.input, f.bucket)).rejects.toThrow()
  })
  it('rejects typed envelope downgrade and declared fake page count', async () => {
    const f = await codeFixture()
    f.set(f.input.checkpoint.objectKey, { ...f.envelope, schemaVersion: 1 })
    await expect(verifyCodePageImport(f.input, f.bucket)).rejects.toThrow()
    f.set(f.input.checkpoint.objectKey, f.envelope)
    f.set(`${f.prefix}/code-pages/imports/v1/import_1/index.json`, { ...f.index, pages: {} })
    await expect(verifyCodePageImport(f.input, f.bucket)).rejects.toThrow()
  })
  it('rejects foreign scope and changed exact native binding', async () => {
    const f = await codeFixture()
    await expect(verifyCodePageImport({ ...f.input, checkpoint: { ...f.input.checkpoint, codeContent: { ...f.input.checkpoint.codeContent, indexDigest: '0'.repeat(64) } } }, f.bucket)).rejects.toThrow()
    await expect(verifyCodePageImport({ ...f.input, checkpoint: { ...f.input.checkpoint, scope: { ...scope, tenantId: 'foreign' } } }, f.bucket)).rejects.toThrow()
  })
})
