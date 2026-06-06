import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetQuery = vi.fn()
const mockReadBody = vi.fn()
const mockGetRouterParam = vi.fn()
const mockRequireAuth = vi.fn()
const mockRequireWriteAccess = vi.fn()
const mockGetAssignedClientIds = vi.fn()
const mockQueryOne = vi.fn()
const mockListLists = vi.fn()
const mockCreateList = vi.fn()
const mockListSubscribers = vi.fn()
const mockUpsertSubscriber = vi.fn()
const mockAddToList = vi.fn()
const mockListCampaigns = vi.fn()
const mockCreateCampaign = vi.fn()
const mockGetCampaign = vi.fn()
const mockGetListClientIds = vi.fn()
const mockSetCampaignLists = vi.fn()
const mockGetCampaignListIds = vi.fn()
const mockListTemplates = vi.fn()
const mockCreateTemplate = vi.fn()
const mockGetTemplate = vi.fn()
const mockUpdateTemplate = vi.fn()
const mockDeleteTemplate = vi.fn()
const mockListCustomModules = vi.fn()
const mockCreateCustomModule = vi.fn()
const mockGetCustomModule = vi.fn()
const mockUpdateCustomModule = vi.fn()
const mockDeleteCustomModule = vi.fn()
const mockValidateModuleFragment = vi.fn()

const CLIENT_1 = '11111111-1111-4111-8111-111111111111'
const CLIENT_2 = '22222222-2222-4222-8222-222222222222'
const LIST_1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const LIST_2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

const scopedUser = {
  id: 'user-1',
  email: 'am@example.com',
  name: 'Account Manager',
  role: 'account_manager',
  is_active: true
}

const agencyUser = {
  id: 'admin-1',
  email: 'admin@example.com',
  name: 'Admin',
  role: 'admin',
  is_active: true
}

const testGlobal = globalThis as unknown as {
  defineEventHandler: <T>(fn: T) => T
  createError: (input: { statusCode: number, statusMessage: string, data?: unknown }) => Error & {
    statusCode: number
    statusMessage: string
    data?: unknown
  }
  getQuery: typeof mockGetQuery
  readBody: typeof mockReadBody
  getRouterParam: typeof mockGetRouterParam
}

testGlobal.defineEventHandler = fn => fn
testGlobal.createError = input => Object.assign(new Error(input.statusMessage), input)
testGlobal.getQuery = mockGetQuery
testGlobal.readBody = mockReadBody
testGlobal.getRouterParam = mockGetRouterParam

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
  requireWriteAccess: (...args: unknown[]) => mockRequireWriteAccess(...args)
}))

vi.mock('~~/server/utils/clientScoping', () => ({
  getAssignedClientIds: (...args: unknown[]) => mockGetAssignedClientIds(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  queryRows: vi.fn(),
  execute: vi.fn()
}))

vi.mock('~~/server/utils/email-marketing/db', () => ({
  listLists: (...args: unknown[]) => mockListLists(...args),
  createList: (...args: unknown[]) => mockCreateList(...args),
  listSubscribers: (...args: unknown[]) => mockListSubscribers(...args),
  upsertSubscriber: (...args: unknown[]) => mockUpsertSubscriber(...args),
  addToList: (...args: unknown[]) => mockAddToList(...args),
  getListClientIds: (...args: unknown[]) => mockGetListClientIds(...args)
}))

vi.mock('~~/server/utils/email-marketing/campaigns', () => ({
  listCampaigns: (...args: unknown[]) => mockListCampaigns(...args),
  createCampaign: (...args: unknown[]) => mockCreateCampaign(...args),
  getCampaign: (...args: unknown[]) => mockGetCampaign(...args),
  setCampaignLists: (...args: unknown[]) => mockSetCampaignLists(...args),
  getCampaignListIds: (...args: unknown[]) => mockGetCampaignListIds(...args)
}))

vi.mock('~~/server/utils/email-marketing/templates', () => ({
  listTemplates: (...args: unknown[]) => mockListTemplates(...args),
  createTemplate: (...args: unknown[]) => mockCreateTemplate(...args),
  getTemplate: (...args: unknown[]) => mockGetTemplate(...args),
  updateTemplate: (...args: unknown[]) => mockUpdateTemplate(...args),
  deleteTemplate: (...args: unknown[]) => mockDeleteTemplate(...args)
}))

vi.mock('~~/server/utils/email-marketing/customModules', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~~/server/utils/email-marketing/customModules')>()
  return {
    ...actual,
    listCustomModules: (...args: unknown[]) => mockListCustomModules(...args),
    createCustomModule: (...args: unknown[]) => mockCreateCustomModule(...args),
    getCustomModule: (...args: unknown[]) => mockGetCustomModule(...args),
    updateCustomModule: (...args: unknown[]) => mockUpdateCustomModule(...args),
    deleteCustomModule: (...args: unknown[]) => mockDeleteCustomModule(...args),
    validateModuleFragment: (...args: unknown[]) => mockValidateModuleFragment(...args)
  }
})

describe('email client-scoped route policy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetQuery.mockReturnValue({})
    mockReadBody.mockResolvedValue({})
    mockGetRouterParam.mockReturnValue('camp-1')
    mockRequireAuth.mockResolvedValue(scopedUser)
    mockRequireWriteAccess.mockResolvedValue(scopedUser)
    mockGetAssignedClientIds.mockResolvedValue([CLIENT_1])
    mockQueryOne.mockResolvedValue(null)
    mockListLists.mockResolvedValue([])
    mockCreateList.mockResolvedValue({ id: LIST_1, client_id: CLIENT_1 })
    mockListSubscribers.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 50 })
    mockUpsertSubscriber.mockResolvedValue('sub-1')
    mockAddToList.mockResolvedValue(undefined)
    mockListCampaigns.mockResolvedValue([])
    mockCreateCampaign.mockResolvedValue({ id: 'camp-1', client_id: CLIENT_1 })
    mockGetCampaign.mockResolvedValue({ id: 'camp-1', client_id: CLIENT_1, status: 'draft' })
    mockGetListClientIds.mockResolvedValue([{ id: LIST_1, client_id: CLIENT_1 }])
    mockSetCampaignLists.mockResolvedValue(undefined)
    mockGetCampaignListIds.mockResolvedValue(['list-1'])
    mockListTemplates.mockResolvedValue([])
    mockCreateTemplate.mockResolvedValue({ id: 'tpl-1', client_id: CLIENT_1 })
    mockGetTemplate.mockResolvedValue({ id: 'tpl-1', client_id: CLIENT_1 })
    mockUpdateTemplate.mockResolvedValue({ id: 'tpl-1', client_id: CLIENT_1 })
    mockDeleteTemplate.mockResolvedValue(undefined)
    mockListCustomModules.mockResolvedValue([])
    mockCreateCustomModule.mockResolvedValue({ id: 'mod-1', client_id: CLIENT_1 })
    mockGetCustomModule.mockResolvedValue({ id: 'mod-1', client_id: CLIENT_1 })
    mockUpdateCustomModule.mockResolvedValue({ id: 'mod-1', client_id: CLIENT_1 })
    mockDeleteCustomModule.mockResolvedValue(undefined)
    mockValidateModuleFragment.mockImplementation(input => input)
  })

  it('passes assigned client ids into list reads for scoped users', async () => {
    const handler = (await import('~~/server/api/email/lists/index.get')).default

    await handler({} as never)

    expect(mockGetAssignedClientIds).toHaveBeenCalledWith(expect.anything(), 'user-1')
    expect(mockListLists).toHaveBeenCalledWith({
      includeArchived: undefined,
      clientIds: [CLIENT_1]
    })
  })

  it('keeps agency list reads unfiltered so agency-wide lists remain visible', async () => {
    const handler = (await import('~~/server/api/email/lists/index.get')).default
    mockRequireAuth.mockResolvedValueOnce(agencyUser)

    await handler({} as never)

    expect(mockGetAssignedClientIds).not.toHaveBeenCalled()
    expect(mockListLists).toHaveBeenCalledWith({
      includeArchived: undefined,
      clientIds: 'all'
    })
  })

  it('defaults new scoped lists to the actor assigned client', async () => {
    const handler = (await import('~~/server/api/email/lists/index.post')).default
    mockReadBody.mockResolvedValueOnce({ name: 'Client newsletter' })

    await handler({} as never)

    expect(mockCreateList).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Client newsletter',
      client_id: CLIENT_1,
      created_by: 'user-1'
    }))
  })

  it('passes assigned client ids into subscriber reads for scoped users', async () => {
    const handler = (await import('~~/server/api/email/subscribers/index.get')).default
    mockGetQuery.mockReturnValueOnce({ page: '1', page_size: '50' })

    await handler({} as never)

    expect(mockListSubscribers).toHaveBeenCalledWith(expect.objectContaining({
      clientIds: [CLIENT_1]
    }))
  })

  it('passes deliverability filters into subscriber reads', async () => {
    const handler = (await import('~~/server/api/email/subscribers/index.get')).default
    mockGetQuery.mockReturnValueOnce({
      page: '1',
      page_size: '50',
      deliverability: 'suppressed'
    })

    await handler({} as never)

    expect(mockListSubscribers).toHaveBeenCalledWith(expect.objectContaining({
      deliverability: 'suppressed',
      clientIds: [CLIENT_1]
    }))
  })

  it('blocks scoped manual subscriber add when the email already belongs to another client', async () => {
    const handler = (await import('~~/server/api/email/subscribers/index.post')).default
    mockReadBody.mockResolvedValueOnce({
      email: 'existing@example.com',
      list_ids: [LIST_1]
    })
    mockQueryOne.mockResolvedValueOnce({ id: 'sub-other', client_id: CLIENT_2 })

    await expect(handler({} as never)).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'email_list_client_mismatch'
    })
    expect(mockUpsertSubscriber).not.toHaveBeenCalled()
    expect(mockAddToList).not.toHaveBeenCalled()
  })

  it('passes assigned client ids into campaign reads for scoped users', async () => {
    const handler = (await import('~~/server/api/email/campaigns/index.get')).default

    await handler({} as never)

    expect(mockListCampaigns).toHaveBeenCalledWith([CLIENT_1])
  })

  it('blocks campaign creation for an inaccessible client', async () => {
    const handler = (await import('~~/server/api/email/campaigns/index.post')).default
    mockReadBody.mockResolvedValueOnce({ name: 'Other client campaign', client_id: CLIENT_2 })

    await expect(handler({} as never)).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'email_client_forbidden'
    })
    expect(mockCreateCampaign).not.toHaveBeenCalled()
  })

  it('blocks mixed-client campaign targets for scoped users', async () => {
    const handler = (await import('~~/server/api/email/campaigns/[id]/lists.put')).default
    mockReadBody.mockResolvedValueOnce({ list_ids: [LIST_1, LIST_2] })
    mockGetListClientIds.mockResolvedValueOnce([
      { id: LIST_1, client_id: CLIENT_1 },
      { id: LIST_2, client_id: CLIENT_2 }
    ])

    await expect(handler({} as never)).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'campaign_mixed_client_lists'
    })
    expect(mockSetCampaignLists).not.toHaveBeenCalled()
  })

  it('passes assigned client ids into template reads for scoped users', async () => {
    const handler = (await import('~~/server/api/email/templates/index.get')).default

    await handler({} as never)

    expect(mockListTemplates).toHaveBeenCalledWith([CLIENT_1])
  })

  it('defaults new scoped templates to the actor assigned client', async () => {
    const handler = (await import('~~/server/api/email/templates/index.post')).default
    mockReadBody.mockResolvedValueOnce({ name: 'Client template' })

    await handler({} as never)

    expect(mockCreateTemplate).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Client template',
      client_id: CLIENT_1,
      created_by: 'user-1'
    }))
  })

  it('blocks template updates across client scope', async () => {
    const handler = (await import('~~/server/api/email/templates/[id].patch')).default
    mockGetRouterParam.mockReturnValueOnce('tpl-2')
    mockReadBody.mockResolvedValueOnce({ name: 'Other client template' })
    mockGetTemplate.mockResolvedValueOnce({ id: 'tpl-2', client_id: CLIENT_2 })

    await expect(handler({} as never)).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'email_client_forbidden'
    })
    expect(mockUpdateTemplate).not.toHaveBeenCalled()
  })

  it('passes assigned client ids into custom module reads for scoped users', async () => {
    const handler = (await import('~~/server/api/agency/email/modules/index.get')).default

    await handler({} as never)

    expect(mockListCustomModules).toHaveBeenCalledWith([CLIENT_1])
  })

  it('defaults new scoped custom modules to the actor assigned client', async () => {
    const handler = (await import('~~/server/api/agency/email/modules/index.post')).default
    const blocks = {
      blocks: { block_1: { type: 'Text', data: { props: { text: 'Saved' } } } },
      rootChildrenIds: ['block_1']
    }
    mockReadBody.mockResolvedValueOnce({ name: 'Client module', blocks })

    await handler({} as never)

    expect(mockCreateCustomModule).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Client module',
      blocks,
      client_id: CLIENT_1,
      created_by: 'user-1'
    }))
  })

  it('blocks custom module updates across client scope', async () => {
    const handler = (await import('~~/server/api/agency/email/modules/[id].patch')).default
    mockGetRouterParam.mockReturnValueOnce('mod-2')
    mockReadBody.mockResolvedValueOnce({ name: 'Other client module' })
    mockGetCustomModule.mockResolvedValueOnce({ id: 'mod-2', client_id: CLIENT_2 })

    await expect(handler({} as never)).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'email_client_forbidden'
    })
    expect(mockUpdateCustomModule).not.toHaveBeenCalled()
  })
})
