import { beforeEach, describe, expect, it, vi } from 'vitest'
import { saveDesignCondition } from '../../server/utils/email-marketing/designConditions'
import { structuredDesign } from '../fixtures/email-design/structured'
import { DesignRevisionError } from '../../server/utils/email-marketing/designRevisions'

vi.mock('~~/server/utils/db', () => ({
  queryOneFresh: vi.fn(),
  transactionWithoutRetry: vi.fn()
}))
const id = '10000000-0000-4000-8000-000000000001'
const client = '10000000-0000-4000-8000-000000000002'
const condition = {
  version: 1,
  name: 'Named copy',
  predicate: { field: 'first_name', op: 'exists' }
}
const request = {
  documentId: id,
  expectedRevisionId: id,
  operationId: id,
  blockId: 'heading',
  condition
}
const renderer = {} as Parameters<typeof saveDesignCondition>[2]
function fixture() {
  const source = structuredDesign()
  source.kind = 'template'
  source.scope.clientId = client
  source.blocks = {
    root: { type: 'EmailLayout', data: { childrenIds: ['heading'] } },
    heading: { type: 'Heading', data: { props: { text: 'Offer' } } }
  }
  source.rootChildrenIds = ['root']
  source.lineage = []
  source.policy.editableFields = ['heading.data.props.text']
  return source
}
const authority = { actorId: id, authorize: vi.fn() }
const read = vi.fn()
const save = vi.fn()
beforeEach(() => {
  vi.resetAllMocks()
  authority.authorize.mockResolvedValue('designer')
  read.mockResolvedValue({
    rows: [
      {
        payload: fixture(),
        schema_version: 1,
        client_id: client,
        owner_client_id: client,
        template_kind: 'draft'
      }
    ]
  })
  save.mockImplementation(async (input, authorize) => {
    await authorize(input.design.scope.clientId)
    return { documentId: id, revisionId: id }
  })
})
describe('narrow canonical condition mutation service', () => {
  it('derives a condition-only design from an immutable revision and preserves policy', async () => {
    await expect(
      saveDesignCondition(request, authority, renderer, read, save)
    ).resolves.toEqual({ documentId: id, revisionId: id })
    const [input, authorize, passedRenderer, actionDigest, , dependencies]
      = save.mock.calls[0]!
    expect(input.design.blocks.heading.data.props.visibilityCondition).toEqual(
      condition
    )
    expect(input.design.policy).toEqual(fixture().policy)
    expect(input.design.blocks.heading.data.props.text).toBe('Offer')
    expect(input.actorId).toBe(id)
    expect(read.mock.calls[0]![0]).toContain('r.id=$2')
    expect(read.mock.calls[0]![1]).toEqual([id, id])
    expect(passedRenderer).toBe(renderer)
    expect(actionDigest).toMatch(/^[a-f0-9]{64}$/)
    await dependencies.authorizeModuleRead('module', client)
    expect(authority.authorize).toHaveBeenCalledWith(client, 'read')
    authority.authorize.mockResolvedValue('staff')
    await expect(authorize(client)).rejects.toMatchObject({ statusCode: 403 })
  })
  it('replays the identical derived source after unknown acknowledgement, not a new head', async () => {
    save
      .mockRejectedValueOnce(new Error('unknown commit'))
      .mockResolvedValue({ documentId: id, revisionId: id })
    await expect(
      saveDesignCondition(request, authority, renderer, read, save)
    ).rejects.toThrow('unknown commit')
    await saveDesignCondition(request, authority, renderer, read, save)
    expect(save.mock.calls[0]![0]).toEqual(save.mock.calls[1]![0])
    expect(save.mock.calls[1]![0].expectedRevisionId).toBe(
      request.expectedRevisionId
    )
  })
  it('supports shared saved drafts and binds distinct no-op targets to distinct receipts', async () => {
    const source = fixture()
    source.scope.clientId = null
    source.blocks.other = { type: 'Heading', data: { props: { text: 'Other' } } }
    source.blocks.root.data.childrenIds!.push('other')
    read.mockResolvedValue({ rows: [{ payload: source, schema_version: 1, client_id: null, owner_client_id: null, template_kind: 'draft' }] })
    await saveDesignCondition({ ...request, condition: null }, authority, renderer, read, save)
    await saveDesignCondition({ ...request, blockId: 'other', condition: null }, authority, renderer, read, save)
    expect(authority.authorize).toHaveBeenCalledWith(null, 'write')
    expect(save.mock.calls[0]![3]).not.toBe(save.mock.calls[1]![3])
  })
  it('requires fresh designer scope and rejects staff, forged source/policy/client and unsupported targets', async () => {
    authority.authorize.mockResolvedValueOnce('staff')
    await expect(
      saveDesignCondition(request, authority, renderer, read, save)
    ).rejects.toMatchObject({ statusCode: 403 })
    for (const extra of [
      { design: fixture() },
      { actorId: id },
      { policy: {} },
      { clientId: client }
    ])
      await expect(
        saveDesignCondition(
          { ...request, ...extra },
          authority,
          renderer,
          read,
          save
        )
      ).rejects.toThrow()
    const base = fixture()
    base.blocks.heading.data.props!.required = true
    read.mockResolvedValue({
      rows: [
        {
          payload: base,
          schema_version: 1,
          client_id: client,
          owner_client_id: client,
          template_kind: 'draft'
        }
      ]
    })
    await expect(
      saveDesignCondition(request, authority, renderer, read, save)
    ).rejects.toThrow('PROTECTED_CONDITION_TARGET')
    expect(save).not.toHaveBeenCalled()
  })
  it('rejects stale owner scope, library templates and absent baselines; preserves CAS conflicts', async () => {
    read.mockResolvedValueOnce({ rows: [] })
    await expect(
      saveDesignCondition(request, authority, renderer, read, save)
    ).rejects.toThrow('NOT_FOUND')
    read.mockResolvedValueOnce({
      rows: [
        {
          payload: fixture(),
          schema_version: 1,
          client_id: client,
          owner_client_id: id,
          template_kind: 'draft'
        }
      ]
    })
    await expect(
      saveDesignCondition(request, authority, renderer, read, save)
    ).rejects.toThrow('TEMPLATE_DRAFT_REQUIRED')
    read.mockResolvedValueOnce({
      rows: [
        {
          payload: fixture(),
          schema_version: 1,
          client_id: client,
          owner_client_id: client,
          template_kind: 'template'
        }
      ]
    })
    await expect(
      saveDesignCondition(request, authority, renderer, read, save)
    ).rejects.toThrow('TEMPLATE_DRAFT_REQUIRED')
    save.mockRejectedValueOnce(new DesignRevisionError('REVISION_CONFLICT'))
    await expect(
      saveDesignCondition(request, authority, renderer, read, save)
    ).rejects.toThrow('REVISION_CONFLICT')
  })
})
