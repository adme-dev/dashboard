import { draftSchema } from '~~/server/utils/ai/roleSkills/store'
import { describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { createRoleSkillAdminHandlers } from '~~/server/utils/ai/roleSkills/admin'

const event = {} as H3Event
function dependencies() {
  return { authenticate: vi.fn().mockResolvedValue({ id: 'actor', role: 'owner' }), assertAdmin: vi.fn().mockResolvedValue(undefined), catalogue: vi.fn().mockResolvedValue([]),
    roles: vi.fn().mockResolvedValue([{ id: 'role', name: 'Marketing', slug: 'media_buyer', isSystem: true, permissionGroups: ['MEDIA_BUYING'] }]), saveDraft: vi.fn().mockResolvedValue({ key: 'my_tasks' }), publish: vi.fn().mockResolvedValue({ key: 'my_tasks' }) }
}
describe('curated workflow administration authority', () => {
  it('requires explicit fresh ADMIN for reads and writable ADMIN for every mutation', async () => {
    const deps = dependencies()
    const handlers = createRoleSkillAdminHandlers(deps)
    const list = await handlers.list(event)
    expect(list.roles[0]?.permissionGroups).toEqual(['MEDIA_BUYING'])
    expect(deps.assertAdmin).toHaveBeenCalledWith(event, 'actor', false)
    await handlers.saveDraft(event, 'my_tasks', { expectedRevision: 1 })
    expect(deps.assertAdmin).toHaveBeenLastCalledWith(event, 'actor', true)
    await handlers.publish(event, 'my_tasks', { expectedRevision: 2 })
    expect(deps.assertAdmin).toHaveBeenLastCalledWith(event, 'actor', true)
  })
  it('owner/static role and caller payload cannot bypass missing or revoked ADMIN', async () => {
    const deps = dependencies()
    deps.assertAdmin.mockRejectedValue({ statusCode: 403 })
    const handlers = createRoleSkillAdminHandlers(deps)
    await expect(handlers.saveDraft(event, 'my_tasks', { role: 'admin', permissionGroups: ['ADMIN'] })).rejects.toMatchObject({ statusCode: 403 })
    await expect(handlers.publish(event, 'my_tasks', {})).rejects.toMatchObject({ statusCode: 403 })
    expect(deps.saveDraft).not.toHaveBeenCalled()
    expect(deps.publish).not.toHaveBeenCalled()
  })
})

describe('workflow metadata cannot change executable authority', () => {
  it('rejects tool/permission injection while empty bindings default to no roles', () => {
    const draft = { expectedRevision: 1, label: 'My tasks', description: 'Read my work', prompt: 'Review my current tasks.', enabled: true,
      bindings: { roleIds: [], systemRoles: [], permissionGroups: [] }, reason: 'Improve request wording' }
    expect(draftSchema.parse(draft).bindings.allRoles).toBe(false)
    expect(draftSchema.safeParse({ ...draft, tools: ['get_finance_snapshot'] }).success).toBe(false)
    expect(draftSchema.safeParse({ ...draft, permissionGroups: ['ADMIN'] }).success).toBe(false)
    expect(draftSchema.safeParse({ ...draft, persona: 'finance' }).success).toBe(false)
    expect(draftSchema.safeParse({ ...draft, sources: [{ url: 'https://unapproved.invalid/skill.md' }] }).success).toBe(false)
  })
})
