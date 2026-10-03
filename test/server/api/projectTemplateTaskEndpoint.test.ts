import { beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.fn()
const save = vi.fn()
vi.mock('~~/server/utils/auth', () => ({ requireWriteAccess: (...args: unknown[]) => auth(...args) }))
vi.mock('~~/server/utils/projectTemplateTasks', async original => ({
  ...await original<typeof import('~~/server/utils/projectTemplateTasks')>(),
  saveProjectTemplateTask: (...args: unknown[]) => save(...args)
}))
Object.assign(globalThis, { defineEventHandler: <T>(handler: T) => handler,
  getRouterParam: () => 'template',
  readBody: async (event: { body: unknown }) => event.body
})
const { default: handler } = await import('~~/server/api/agency/templates/[id]/tasks.post')
beforeEach(() => {
  auth.mockReset().mockResolvedValue({ id: 'manager' })
  save.mockReset().mockResolvedValue({ id: 'task' })
})
describe('template task authoring access and validation', () => {
  it('rejects a read-only user before writing', async () => {
    auth.mockRejectedValue({ statusCode: 403 })
    await expect(handler({ body: {} } as never)).rejects.toMatchObject({ statusCode: 403 })
    expect(save).not.toHaveBeenCalled()
  })
  it.each([
    { title: '' }, { title: 'Task', dependsOnTaskIds: ['foreign'] },
    { title: 'Task', durationDays: -1 }, { title: 'Task', estimatedHours: 10000 },
    { title: 'Task', unknownOverride: true }
  ])('rejects invalid task input %#', async (fields) => {
    await expect(handler({ body: { expectedRevision: 'v1', defaultDepartmentId: null, ...fields } } as never)).rejects.toMatchObject({ statusCode: 400 })
    expect(save).not.toHaveBeenCalled()
  })
  it('passes validated fields to the transactional writer', async () => {
    await handler({ body: { title: '  Customer review  ', expectedRevision: 'v1', defaultDepartmentId: null } } as never)
    expect(save).toHaveBeenCalledWith('template', expect.objectContaining({ title: 'Customer review', expectedRevision: 'v1', dependsOnTaskIds: [] }))
  })
})
