// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import type { RoleSkillAdminList } from '../../shared/types/roleSkills'
import RoleSkillsManager from '~~/app/components/ai/RoleSkillsManager.vue'

const skill = { key: 'budget-review', versionId: 'published-1', version: 1, label: 'Review budgets', description: 'Review client pacing', prompt: 'Review [client] budgets.', persona: 'marketing', group: 'Marketing', tools: ['get_budget_status'], sources: [{ title: 'Official guide', url: 'https://developers.cloudflare.com/agents/' }] }
const version = { id: 'published-1', workflowKey: skill.key, version: 1, label: skill.label, description: skill.description, prompt: skill.prompt, enabled: true, bindings: { allRoles: false, roleIds: ['role-1'], systemRoles: [], permissionGroups: [] }, createdAt: '2026-11-07', createdBy: null, publishedAt: '2026-11-07', publishedBy: null, publishReason: 'Initial release', auditReason: 'Initial draft' }
const workflow = { key: skill.key, group: skill.group, persona: skill.persona, tools: skill.tools, sources: skill.sources, revision: 2, active: version, draft: { ...version, id: 'draft-2', version: 2, publishedAt: null }, history: [version] }
const management = { workflows: [workflow], roles: [{ id: 'role-1', name: 'Media buyer', slug: 'media-buyer', isSystem: false, permissionGroups: [] }], permissionGroups: ['MARKETING_MANAGEMENT'] }
const apps: ReturnType<typeof createApp>[] = []
const fetcher = vi.fn()
const stubs = {
  UButton: { props: ['disabled', 'loading', 'label', 'to'], template: '<button :disabled="disabled || loading"><slot />{{ label }}</button>' },
  UIcon: { template: '<i />' }, UBadge: { template: '<span><slot /></span>' },
  UAlert: { props: ['title', 'description'], template: '<aside>{{ title }} {{ description }}</aside>' },
  UFormField: { props: ['label', 'help'], template: '<label :data-field="label">{{ label }}<slot /><span>{{ help }}</span></label>' },
  UInput: { props: ['modelValue'], emits: ['update:modelValue'], template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />' },
  UTextarea: { props: ['modelValue'], emits: ['update:modelValue'], template: '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />' },
  UCheckbox: { props: ['modelValue', 'label'], emits: ['update:modelValue'], template: '<label><input type="checkbox" :checked="modelValue" @change="$emit(\'update:modelValue\', $event.target.checked)" />{{ label }}</label>' },
  USelect: { props: ['modelValue', 'items'], emits: ['update:modelValue'], template: '<select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="item in items" :key="item.value" :value="item.value">{{ item.label }}</option></select>' },
  USelectMenu: { template: '<div />' }, UTable: { props: ['data'], template: '<div data-testid="role-matrix">{{ JSON.stringify(data) }}</div>' }
}
async function flush() {
  for (let n = 0; n < 5; n++) {
    await Promise.resolve()
    await nextTick()
  }
}
function mount(canManage: boolean, admin: RoleSkillAdminList = management) {
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp({ render: () => h(RoleSkillsManager, { catalog: { skills: [skill], canManage }, management: admin }) })
  Object.entries(stubs).forEach(([name, component]) => app.component(name, component))
  apps.push(app)
  app.mount(host)
  return host
}
function button(host: HTMLElement, label: string) {
  return Array.from(host.querySelectorAll('button')).find(node => node.textContent?.trim() === label)!
}
async function fill(host: HTMLElement, label: string, value: string) {
  const input = host.querySelector(`[data-field="${label}"] input, [data-field="${label}"] textarea`) as HTMLInputElement
  expect(input).not.toBeNull()
  input.value = value
  input.dispatchEvent(new Event('input'))
  await flush()
}
beforeEach(() => {
  vi.stubGlobal('useToast', () => ({ add: vi.fn() }))
  vi.stubGlobal('$fetch', fetcher)
  fetcher.mockReset()
})
afterEach(() => {
  apps.splice(0).forEach(app => app.unmount())
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

describe('role skill library', () => {
  it('shows staff published skills and immutable tool provenance without management controls', () => {
    const host = mount(false)
    expect(host.textContent).toContain('Review budgets')
    expect(host.textContent).toContain('get_budget_status')
    expect(host.textContent).not.toContain('Save draft')
    expect(host.textContent).not.toContain('Publish draft')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('filters configured attachments by actual role groups, with empty bindings matching none', async () => {
    const bind = (label: string, groups: string[], enabled = true) => ({ ...workflow, key: label, active: { ...version, label, enabled, bindings: { allRoles: false, roleIds: [], systemRoles: [], permissionGroups: groups } } })
    const host = mount(true, {
      ...management,
      roles: [
        { id: 'marketing-manager', name: 'Marketing manager', slug: 'marketing-manager', isSystem: false, permissionGroups: ['MEDIA_BUYING'] },
        { id: 'sales', name: 'Sales', slug: 'sales', isSystem: false, permissionGroups: ['SALES'] }
      ],
      workflows: [bind('Budget pacing', ['MEDIA_BUYING']), bind('Sales review', ['SALES']), bind('No assignments', []), bind('Disabled budgets', ['MEDIA_BUYING'], false)]
    })
    const select = host.querySelector('[data-field="View role"] select') as HTMLSelectElement
    expect(select).not.toBeNull()
    let rows = JSON.parse(host.querySelector('[data-testid="role-matrix"]')!.textContent!)
    expect(rows.find((row: { skill: string }) => row.skill === 'No assignments').roles).toBe('No role assignments')
    select.value = 'marketing-manager'
    select.dispatchEvent(new Event('change'))
    await flush()
    rows = JSON.parse(host.querySelector('[data-testid="role-matrix"]')!.textContent!)
    expect(rows.map((row: { skill: string }) => row.skill)).toEqual(['Budget pacing', 'Disabled budgets'])
    expect(rows[0].roles).toBe('Marketing manager')
    expect(rows[1].published).toContain('disabled')
    expect(host.textContent).toContain('personal restrictions')
  })

  it('previews documentation as escaped text without saving it as instructions', async () => {
    fetcher.mockResolvedValueOnce({ provider: 'cloudflare', requestedUrl: skill.sources[0].url, url: skill.sources[0].url, title: 'Agents', status: 'readable', fetchedAt: '2026-11-07T10:00:00Z', contentDigest: 'digest-1', excerpt: '<script>unsafe()</script>', httpStatus: 200 })
    const host = mount(false)
    await fill(host, 'Official documentation URL', skill.sources[0].url)
    button(host, 'Read documentation').click()
    await flush()
    expect(host.querySelector('pre')?.textContent).toContain('<script>unsafe()</script>')
    expect(host.querySelector('script')).toBeNull()
    expect(host.textContent).toContain('readable')
    expect(host.textContent).toContain('digest-1')
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher).toHaveBeenCalledWith('/api/agency/ai/documentation/read', { query: { url: skill.sources[0].url } })
  })

  it('saves a new draft with its revision and role bindings, without publishing', async () => {
    fetcher.mockResolvedValueOnce({ ...workflow, revision: 3 })
    const host = mount(true)
    await fill(host, 'Label', 'Improve budget review')
    await fill(host, 'Change reason', 'Clarify pacing review')
    button(host, 'Save draft').click()
    await flush()
    expect(fetcher).toHaveBeenCalledWith('/api/admin/ai/skills/budget-review/draft', { method: 'PUT', body: expect.objectContaining({ expectedRevision: 2, label: 'Improve budget review', reason: 'Clarify pacing review', bindings: version.bindings }) })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('does not save a draft without an explicit change reason', async () => {
    const host = mount(true)
    button(host, 'Save draft').click()
    await flush()
    expect(fetcher).not.toHaveBeenCalled()
    expect(host.textContent).toContain('Complete the label, description, request and a change reason of at least 3 characters.')
  })

  it('requires an explicit publish reason and publishes the exact draft version', async () => {
    fetcher.mockResolvedValueOnce({ ...workflow, revision: 3, draft: null })
    const host = mount(true)
    expect(button(host, 'Publish draft').disabled).toBe(true)
    await fill(host, 'Label', 'An unsaved label change')
    await fill(host, 'Publish reason', 'Reviewed workflow wording')
    button(host, 'Publish draft').click()
    await flush()
    expect(fetcher).toHaveBeenCalledWith('/api/admin/ai/skills/budget-review/publish', { method: 'POST', body: { expectedRevision: 2, versionId: 'draft-2', reason: 'Reviewed workflow wording' } })
  })
})
