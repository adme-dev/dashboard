import { describe, expect, it } from 'vitest'
import { executeDesignTemplates } from '../../server/utils/email-marketing/designTemplates'
import { describeEmailAsset, type DesignAssetStorage } from '../../server/utils/email-marketing/designAssets'
import { executeDesignHistory } from '../../server/utils/email-marketing/designHistory'
import { libraryHarness, actorId, draftId, templateId, initial } from '../helpers/emailDesignLibrary'
import { testEmailRenderer } from '../fixtures/emailRenderer'
import type { DesignTransaction } from '../../server/utils/email-marketing/designRevisions'
import type { DesignTemplateRequest } from '../../shared/emailRendering/designTemplates'

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))
const publication = (): DesignTemplateRequest => ({
  version: 1,
  command: 'publish-template',
  operationId: crypto.randomUUID(),
  draftId,
  expectedRevisionId: initial,
  name: 'Published offer',
  category: 'Offers',
  includedOverridePaths: []
})
function setup() {
  const h = libraryHarness()
  const templates = (
    request: unknown,
    transaction: DesignTransaction = h.transaction,
    renderer = testEmailRenderer,
    storage?: DesignAssetStorage
  ) => executeDesignTemplates(request, h.authority, renderer, storage, transaction)
  const history = (request: unknown, transaction: DesignTransaction = h.transaction, renderer = testEmailRenderer) =>
    executeDesignHistory(request, h.authority, renderer, undefined, transaction)
  return { h, templates, history }
}
describe('canonical template publication and copy', () => {
  it('uses the existing owner and immutable source without losing policy, brand, IDs or pins', async () => {
    const { h, templates } = setup()
    const module = await h.run(h.publish())
    const inserted = await h.run({
      version: 1,
      command: 'insert-module',
      operationId: crypto.randomUUID(),
      draftId,
      expectedDraftRevisionId: initial,
      moduleId: module.moduleId!,
      revisionId: module.revisionId,
      parentId: 'root',
      index: 0
    })
    const source = h.state.revisions[inserted.revisionId].payload
    source.source.brand = {
      kitId: crypto.randomUUID(),
      versionId: crypto.randomUUID(),
      version: 2,
      name: 'Dealer',
      defaults: {
        primaryColor: '#123456',
        fontFamily: 'MODERN_SANS',
        contentWidth: 600,
        fontFallback: false,
        requestedFont: null
      }
    }
    const published = await templates({ ...publication(), expectedRevisionId: inserted.revisionId })
    expect(h.state.templates[published.templateId!].template_kind).toBe('template')
    expect(h.state.revisions[published.revisionId].payload).toEqual(source)
    const copied = await templates({
      version: 1,
      command: 'copy-template-draft',
      operationId: crypto.randomUUID(),
      templateId: published.templateId,
      revisionId: published.revisionId,
      expectedSourceHeadRevisionId: published.revisionId,
      name: 'Working draft',
      category: 'Offers',
      clientId: source.scope.clientId
    })
    expect(h.state.revisions[copied.revisionId].payload).toEqual(source)
    expect(h.state.templates[copied.templateId!].email_design_revision_id).toBe(copied.revisionId)
    expect(h.state.templates[templateId].email_design_revision_id).toBe(inserted.revisionId)
    expect(h.state.campaigns).toEqual({ sent: 'frozen sent html', scheduled: 'frozen scheduled html' })
  })
  it('requires fresh agency publishing but only scoped designer authority to copy a readable template', async () => {
    const { h, templates } = setup()
    const published = await templates(publication())
    h.authority.publisher = async () => {
      throw new Error('not agency publisher')
    }
    await expect(templates(publication())).rejects.toThrow('not agency publisher')
    const request = {
      version: 1,
      command: 'copy-template-draft',
      operationId: crypto.randomUUID(),
      templateId: published.templateId,
      revisionId: published.revisionId,
      expectedSourceHeadRevisionId: published.revisionId,
      name: 'Client working draft',
      category: null,
      clientId: h.state.documents[draftId].client_id
    }
    const copy = await templates(request)
    expect(copy.published).toBe(false)
    h.authority.designer = async () => {
      throw new Error('revoked destination')
    }
    await expect(templates(request)).rejects.toThrow('revoked destination')
  })
  it('allows shared to client copying, rejects client widening/cross-client, and rejects stale expected heads', async () => {
    const { h, templates } = setup()
    h.state.documents[draftId].client_id = null
    h.state.templates[templateId].client_id = null
    h.state.revisions[initial].payload.scope.clientId = null
    const published = await templates(publication())
    const request = {
      version: 1,
      command: 'copy-template-draft',
      operationId: crypto.randomUUID(),
      templateId: published.templateId,
      revisionId: published.revisionId,
      expectedSourceHeadRevisionId: published.revisionId,
      name: 'Client copy',
      category: null,
      clientId: crypto.randomUUID()
    }
    const copy = await templates(request)
    expect(h.state.revisions[copy.revisionId].payload.scope.clientId).toBe(request.clientId)
    await expect(
      templates({ ...request, operationId: crypto.randomUUID(), expectedSourceHeadRevisionId: crypto.randomUUID() })
    ).rejects.toMatchObject({ code: 'REVISION_CONFLICT' })
    h.state.templates[published.templateId!].client_id = request.clientId
    h.state.documents[published.documentId].client_id = request.clientId
    h.state.revisions[published.revisionId].payload.scope.clientId = request.clientId
    await expect(templates({ ...request, operationId: crypto.randomUUID(), clientId: null })).rejects.toMatchObject({
      code: 'SCOPE_MISMATCH'
    })
    await expect(
      templates({ ...request, operationId: crypto.randomUUID(), clientId: crypto.randomUUID() })
    ).rejects.toMatchObject({ code: 'SCOPE_MISMATCH' })
  })
  it('retains one publication after lost acknowledgement and rejects cross-command/action reuse', async () => {
    const { h, templates, history } = setup(),
      request = publication()
    const lost: DesignTransaction = async (callback) => {
      await h.transaction(callback)
      throw new Error('lost commit reply')
    }
    await expect(templates(request, lost)).rejects.toThrow('lost commit reply')
    const result = await templates(request)
    expect(Object.values(h.state.templates).filter(t => t.template_kind === 'template')).toHaveLength(1)
    await expect(templates({ ...request, name: 'Changed' })).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })
    await expect(
      history({
        version: 1,
        command: 'restore-revision',
        draftId,
        expectedRevisionId: initial,
        revisionId: initial,
        operationId: request.operationId
      })
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })
    expect(h.state.receipts[request.operationId].revision_id).toBe(result.revisionId)
  })
  it('requires explicit local override review and checks dependency revocation at commit', async () => {
    const { h, templates } = setup(),
      module = await h.run(h.publish())
    const inserted = await h.run({
      version: 1,
      command: 'insert-module',
      operationId: crypto.randomUUID(),
      draftId,
      expectedDraftRevisionId: initial,
      moduleId: module.moduleId!,
      revisionId: module.revisionId,
      parentId: 'root',
      index: 0
    })
    const source = h.state.revisions[inserted.revisionId].payload
    const id = source.moduleInstances[0].rootBlockIds[0]
    source.blocks[id].data.props.text = 'Locally edited'
    h.state.templates[templateId].body_source = source.blocks
    const request = { ...publication(), expectedRevisionId: inserted.revisionId }
    await expect(templates(request)).rejects.toMatchObject({ code: 'LOCAL_OVERRIDE_REVIEW_REQUIRED' })
    const before = clone(h.state)
    const renderer = {
      ...testEmailRenderer,
      renderDocument: async () => {
        h.revoke()
        return '<p>Rendered</p>'
      }
    }
    await expect(
      templates({ ...request, includedOverridePaths: [`${id}.data.props.text`] }, h.transaction, renderer)
    ).rejects.toThrow('denied')
    expect(h.state).toEqual(before)
  })
})
describe('server history restores under current policy', () => {
  it('lists parent order and appends structural undo without rewriting original IDs or receipts', async () => {
    const { h, history } = setup()
    const module = await h.run(h.publish())
    const inserted = await h.run({
      version: 1,
      command: 'insert-module',
      operationId: crypto.randomUUID(),
      draftId,
      expectedDraftRevisionId: initial,
      moduleId: module.moduleId!,
      revisionId: module.revisionId,
      parentId: 'root',
      index: 0
    })
    const before = clone(h.state.revisions)
    const list = await history({ version: 1, command: 'list-revisions', draftId })
    expect('revisions' in list && list.revisions.map(r => r.id)).toEqual([inserted.revisionId, initial])
    const request = {
      version: 1,
      command: 'restore-revision',
      draftId,
      expectedRevisionId: inserted.revisionId,
      revisionId: initial,
      operationId: crypto.randomUUID()
    }
    const restored = await history(request)
    expect('revisionId' in restored).toBe(true)
    if (!('documentId' in restored)) throw new Error('restore receipt missing')
    expect(h.state.revisions[restored.revisionId].payload.blocks).toEqual(before[initial].payload.blocks)
    expect(h.state.revisions[restored.revisionId].parent_revision_id).toBe(inserted.revisionId)
    for (const [id, snapshot] of Object.entries(before)) expect(h.state.revisions[id]).toEqual(snapshot)
    expect(await history(request)).toEqual(restored)
    expect(h.state.receipts[request.operationId].revision_id).toBe(restored.revisionId)
  })
  it('fails stale/concurrent CAS and rejects restoring historical scope or removed grants/locks', async () => {
    const { h, history } = setup()
    const request = {
      version: 1,
      command: 'restore-revision',
      draftId,
      expectedRevisionId: initial,
      revisionId: initial,
      operationId: crypto.randomUUID()
    }
    const outcomes = await Promise.allSettled([
      history(request),
      history({ ...request, operationId: crypto.randomUUID() })
    ])
    expect(outcomes.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    expect(outcomes.find(r => r.status === 'rejected')).toMatchObject({ reason: { code: 'REVISION_CONFLICT' } })
    const head = h.state.documents[draftId].head_revision_id
    const current = h.state.revisions[head].payload
    current.policy.editableFields = ['cta.data.props.text']
    current.blocks.heading.data.props.text = 'New locked heading'
    h.state.templates[templateId].body_source = current.blocks
    await expect(
      history({ ...request, operationId: crypto.randomUUID(), expectedRevisionId: head })
    ).rejects.toMatchObject({ code: 'EDIT_FORBIDDEN' })
    const preview = await history({
      version: 1,
      command: 'preview-revision',
      draftId,
      expectedRevisionId: head,
      revisionId: initial
    })
    expect(preview).toMatchObject({ restorable: false, blockedReason: 'EDIT_FORBIDDEN' })
  })
  it('reconciles an older committed restore after intervening writes and rechecks authority', async () => {
    const { h, history } = setup()
    const request = {
      version: 1,
      command: 'restore-revision',
      draftId,
      expectedRevisionId: initial,
      revisionId: initial,
      operationId: crypto.randomUUID()
    }
    const lost: DesignTransaction = async (callback) => {
      await h.transaction(callback)
      throw new Error('lost reply')
    }
    await expect(history(request, lost)).rejects.toThrow('lost reply')
    const receipt = h.state.receipts[request.operationId]
    const second = await history({
      ...request,
      operationId: crypto.randomUUID(),
      expectedRevisionId: receipt.revision_id
    })
    const replay = await history(request)
    expect(replay).toMatchObject({ revisionId: receipt.revision_id })
    expect(h.state.documents[draftId].head_revision_id).toBe('revisionId' in second ? second.revisionId : null)
    h.revoke()
    await expect(history(request)).rejects.toThrow('denied')
  })
  it('rechecks designer access after async rendering and leaves no successor on revocation', async () => {
    const { h, history } = setup(),
      before = clone(h.state)
    const renderer = {
      ...testEmailRenderer,
      renderDocument: async () => {
        h.revoke()
        return '<p>Preview</p>'
      }
    }
    await expect(
      history(
        {
          version: 1,
          command: 'restore-revision',
          draftId,
          expectedRevisionId: initial,
          revisionId: initial,
          operationId: crypto.randomUUID()
        },
        h.transaction,
        renderer
      )
    ).rejects.toThrow('denied')
    expect(h.state).toEqual(before)
    expect(actorId).toBe(h.authority.actorId)
  })
})

describe('template published asset authority', () => {
  it('retains exact registered descriptors through publication/copy and blocks scope/digest changes', async () => {
    const { h, templates } = setup()
    const assetId = crypto.randomUUID()
    const bytes = Uint8Array.from(
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6lWQAAAAASUVORK5CYII=',
        'base64'
      )
    )
    const asset = await describeEmailAsset(assetId, bytes)
    const url = `https://app.test/registered/${assetId}`
    h.state.assets[assetId] = {
      id: assetId,
      client_id: h.state.documents[draftId].client_id,
      uploaded_by: actorId,
      r2_key: `banner-assets/${actorId}/${crypto.randomUUID()}/image.png`,
      file_size: bytes.length,
      mime_type: 'image/png',
      email_publication: asset
    }
    const storage: DesignAssetStorage = {
      read: async () => bytes,
      url: async () => url,
      identifyUrl: async value => (value === url ? assetId : null)
    }
    const source = h.state.revisions[initial].payload
    source.blocks.heading = { type: 'Image', data: { props: { url, alt: 'Registered image' } } }
    source.policy.editableFields = ['heading.data.props.alt', 'cta.data.props.text', 'cta.data.props.url']
    source.assets = [asset]
    h.state.templates[templateId].body_source = source.blocks
    const published = await templates(publication(), h.transaction, testEmailRenderer, storage)
    const request = {
      version: 1,
      command: 'copy-template-draft',
      operationId: crypto.randomUUID(),
      templateId: published.templateId,
      revisionId: published.revisionId,
      expectedSourceHeadRevisionId: published.revisionId,
      name: 'Image draft',
      category: null,
      clientId: source.scope.clientId
    }
    const copy = await templates(request, h.transaction, testEmailRenderer, storage)
    expect(h.state.revisions[copy.revisionId].payload.assets).toEqual([asset])
    h.state.assets[assetId].client_id = crypto.randomUUID()
    await expect(
      templates({ ...request, operationId: crypto.randomUUID() }, h.transaction, testEmailRenderer, storage)
    ).rejects.toMatchObject({ code: 'SCOPE_MISMATCH' })
    h.state.assets[assetId].client_id = source.scope.clientId
    h.state.assets[assetId].email_publication.sha256 = 'a'.repeat(64)
    await expect(
      templates({ ...request, operationId: crypto.randomUUID() }, h.transaction, testEmailRenderer, storage)
    ).rejects.toMatchObject({ code: 'ASSET_NOT_READY' })
  })
})

it('duplicates a canonical draft through the exact server-owned source without a legacy fragment save', async () => {
  const { h, templates } = setup()
  const copy = await templates({
    version: 1,
    command: 'copy-template-draft',
    operationId: crypto.randomUUID(),
    templateId,
    revisionId: initial,
    expectedSourceHeadRevisionId: initial,
    name: 'Independent working copy',
    category: null,
    clientId: h.state.documents[draftId].client_id
  })
  expect(h.state.revisions[copy.revisionId].payload).toEqual(h.state.revisions[initial].payload)
  expect(copy.templateId).not.toBe(templateId)
  expect(h.state.templates[copy.templateId!].template_kind).toBe('draft')
})

it('rechecks original shared-source read authority after rendering a scoped draft copy', async () => {
  const { h, templates } = setup()
  h.state.documents[draftId].client_id = null
  h.state.templates[templateId].client_id = null
  h.state.revisions[initial].payload.scope.clientId = null
  const published = await templates(publication())
  const before = clone(h.state)
  const renderer = {
    ...testEmailRenderer,
    renderDocument: async () => {
      h.authority.read = async (scope) => {
        if (scope === null) throw new Error('shared source access revoked')
      }
      return '<p>Rendered copy</p>'
    }
  }
  await expect(
    templates(
      {
        version: 1,
        command: 'copy-template-draft',
        operationId: crypto.randomUUID(),
        templateId: published.templateId,
        revisionId: published.revisionId,
        expectedSourceHeadRevisionId: published.revisionId,
        name: 'Client copy',
        category: null,
        clientId: crypto.randomUUID()
      },
      h.transaction,
      renderer
    )
  ).rejects.toThrow('shared source access revoked')
  expect(h.state).toEqual(before)
})
