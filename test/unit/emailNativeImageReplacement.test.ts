import { describe, expect, it } from 'vitest'
import { describeEmailAsset, type DesignAssetStorage } from '../../server/utils/email-marketing/designAssets'
import type { DesignTransaction } from '../../server/utils/email-marketing/designRevisions'
import { libraryHarness, draftId, initial, actorId, templateId } from '../helpers/emailDesignLibrary'
import { testEmailRenderer } from '../fixtures/emailRenderer'

const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1])
async function setup() {
  const h = libraryHarness()
  const query = h.db.query
  h.db.query = async (sql, params = []) => {
    if (sql.startsWith('SELECT r.payload,r.parent_revision_id,c.payload_sha256')) {
      const receipt = h.state.receipts[String(params[1])]
      const revision = receipt && h.state.revisions[receipt.revision_id]
      return { rows: revision?.document_id === params[0] ? [{ ...revision, payload_sha256: receipt.payload_sha256 }] : [] }
    }
    return query(sql, params)
  }
  const old = crypto.randomUUID(), fresh = crypto.randomUUID()
  for (const id of [old, fresh])
    h.state.assets[id] = { id, client_id: h.state.documents[draftId].client_id, uploaded_by: actorId, r2_key: `banner-assets/${actorId}/${id}/image.png`, file_size: png.length, mime_type: 'image/png', email_publication: await describeEmailAsset(id, png) }
  const storage: DesignAssetStorage = { read: async () => png, url: async id => `https://app.test/${id}.png`, identifyUrl: async url => url.split('/').at(-1)!.replace('.png', '') }
  const inserted = await h.run({ version: 1, command: 'insert-published-image', operationId: crypto.randomUUID(), draftId, expectedDraftRevisionId: initial, assetId: old, parentId: 'root', index: 1 }, h.transaction, testEmailRenderer, storage)
  const blockId = h.state.revisions[inserted.revisionId].payload.blocks.root.data.childrenIds[1]
  const command = { version: 1 as const, command: 'replace-published-image' as const, operationId: crypto.randomUUID(), draftId, expectedDraftRevisionId: inserted.revisionId, assetId: fresh, blockId }
  return { h, storage, command, old, fresh }
}
describe('registered image replacement transaction', () => {
  it('atomically saves projection and immutable receipt; committed lost reply replays once after a newer head', async () => {
    const { h, storage, command, old, fresh } = await setup()
    const lost: DesignTransaction = async (callback) => {
      await h.transaction(callback)
      throw new Error('lost reply')
    }
    await expect(h.run(command, lost, testEmailRenderer, storage)).rejects.toThrow('lost reply')
    const receipt = await h.run(command, h.transaction, testEmailRenderer, storage)
    const design = h.state.revisions[receipt.revisionId].payload
    expect(design.blocks[command.blockId].data.props.url).toBe(`https://app.test/${fresh}.png`)
    expect(design.assets.map((asset: {
      id: string
    }) => asset.id)).toEqual([old, fresh])
    expect(h.state.templates[templateId].email_design_revision_id).toBe(receipt.revisionId)
    await h.run({ ...command, operationId: crypto.randomUUID(), expectedDraftRevisionId: receipt.revisionId, assetId: old }, h.transaction, testEmailRenderer, storage)
    expect(await h.run(command, h.transaction, testEmailRenderer, storage)).toEqual(receipt)
    await expect(h.run({ ...command, assetId: old }, h.transaction, testEmailRenderer, storage)).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })
  })
  it('refuses foreign bytes, stale heads and revocation without a revision effect', async () => {
    const { h, storage, command, fresh } = await setup()
    const before = h.state.documents[draftId].head_revision_id
    await expect(h.run({ ...command, expectedDraftRevisionId: initial }, h.transaction, testEmailRenderer, storage)).rejects.toMatchObject({ code: 'REVISION_CONFLICT' })
    h.state.assets[fresh].client_id = crypto.randomUUID()
    await expect(h.run(command, h.transaction, testEmailRenderer, storage)).rejects.toMatchObject({ code: 'SCOPE_MISMATCH' })
    h.state.assets[fresh].client_id = h.state.documents[draftId].client_id
    await expect(h.run(command, h.transaction, testEmailRenderer, { ...storage, read: async () => new Uint8Array() })).rejects.toMatchObject({ code: 'ASSET_NOT_READY' })
    h.authority.designer = async () => {
      throw new Error('revoked')
    }
    await expect(h.run(command, h.transaction, testEmailRenderer, storage)).rejects.toThrow('revoked')
    expect(h.state.documents[draftId].head_revision_id).toBe(before)
  })
  it('refuses a forged library-shaped lineage with registered assets but no matching immutable insertion receipt', async () => {
    const { h, storage, command } = await setup()
    const original = h.state.revisions[command.expectedDraftRevisionId].payload
    const op = crypto.randomUUID(), id = `img_${op}`
    original.blocks[id] = original.blocks[command.blockId]
    Reflect.deleteProperty(original.blocks, command.blockId)
    original.blocks.root.data.childrenIds[1] = id
    original.lineage = original.lineage.filter((item: { blockId: string }) => item.blockId !== command.blockId)
    original.lineage.push({ blockId: id, nodeId: `imgn_${op}`, fields: { alt: `imgf_${op}` } })
    original.policy.editableFields = original.policy.editableFields.map((path: string) => path.replace(command.blockId, id))
    h.state.templates[templateId].body_source = structuredClone(original.blocks)
    const before = structuredClone(h.state)
    await expect(h.run({ ...command, blockId: id }, h.transaction, testEmailRenderer, storage)).rejects.toMatchObject({ code: 'EDIT_FORBIDDEN' })
    expect(h.state).toEqual(before)
  })
  it('requires the immutable receipt digest to prove insertion rather than lineage shape alone', async () => {
    const { h, storage, command } = await setup()
    const op = command.blockId.slice('img_'.length)
    h.state.receipts[op].payload_sha256 = '0'.repeat(64)
    const before = structuredClone(h.state)
    await expect(h.run(command, h.transaction, testEmailRenderer, storage)).rejects.toMatchObject({ code: 'EDIT_FORBIDDEN' })
    expect(h.state).toEqual(before)
  })
  it('rechecks designer after renderer awaits and before accepting replay', async () => {
    const { h, storage, command } = await setup()
    const before = h.state.documents[draftId].head_revision_id
    await expect(h.run(command, h.transaction, { ...testEmailRenderer, renderDocument: async (...args) => {
      const html = await testEmailRenderer.renderDocument(...args)
      h.revoke()
      return html
    } }, storage)).rejects.toThrow('denied')
    expect(h.state.documents[draftId].head_revision_id).toBe(before)
    const next = await setup()
    await next.h.run(next.command, next.h.transaction, testEmailRenderer, next.storage)
    next.h.revoke()
    await expect(next.h.run(next.command, next.h.transaction, testEmailRenderer, next.storage)).rejects.toThrow('denied')
  })
})
