/* eslint-disable @typescript-eslint/no-explicit-any -- Execute isolated composer save/load boundary. */
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import ts from 'typescript'
import { templateCopyCategory, markTemplateClientCopy, templateCopyName } from '~~/app/utils/edmTemplateProvenance'
const source = readFileSync(new URL('../../app/components/email/builder/EdmFlyhubBuilder.client.vue', import.meta.url), 'utf8')
const state = source.slice(source.indexOf('const templateId ='), source.indexOf('// ── Save selection'))
const mounted = source.slice(source.indexOf('onMounted(async () => {'), source.indexOf('</script>'))
async function setup(query: Record<string, string>, shared = false, fail = false, templateFailure = false, deferTemplate?: Promise<void>) {
  const apiFetch = vi.fn(async (url: string) => {
    if (url === '/api/email/template-clients') {
      if (fail) throw new Error('offline')
      return { clients: [{ id: 'allowed', name: 'Allowed' }], canUseSharedTemplates: shared }
    }
    if (deferTemplate) await deferTemplate
    if (templateFailure) throw new Error('template offline')
    return { template: { id: 'original', name: 'Newsletter', subject: 'Subject', client_id: 'allowed', folder_name: 'News', body_source: { root: {} } } }
  })
  let mount: () => Promise<void> = async () => {}
  const store = { document: ref({ root: {} }), resetDocument: vi.fn() }
  const router = { replace: vi.fn(async () => {}) }
  const args = { router, ref, computed, templateCopyCategory, markTemplateClientCopy, templateCopyName, route: { query }, apiFetch, store, toast: { add: vi.fn() }, onMounted: (fn: () => Promise<void>) => { mount = fn }, findStarterTemplate: () => null }
  const js = ts.transpile(`${state}\n${mounted}\nreturn {save, templateLoading, templateLoadError, templateClient, templateId, name, templateFolderName, hasValidTemplateClient, templateClientsError}`, { target: ts.ScriptTarget.ES2022 })
  const result = new Function(...Object.keys(args), js)(...Object.values(args))
  const mounting = mount()
  if (!deferTemplate) await mounting
  return { ...result, apiFetch, store, router, mounting }
}
describe('composer client save', () => {
  it('accepts only allowed route clients and requires an explicit client for restricted staff', async () => {
    const rejected = await setup({ client: 'foreign' })
    expect(rejected.hasValidTemplateClient.value).toBe(false)
    rejected.name.value = 'New'
    await rejected.save()
    expect(rejected.apiFetch).toHaveBeenCalledTimes(1)
    const accepted = await setup({ client: 'allowed' })
    accepted.name.value = 'New'
    await accepted.save()
    expect(accepted.apiFetch).toHaveBeenLastCalledWith('/api/email/templates', expect.objectContaining({ body: expect.objectContaining({ client_id: 'allowed' }) }))
  })
  it('uses shared only with capability and fails closed on choice loading error', async () => {
    const shared = await setup({}, true)
    shared.name.value = 'Shared'
    expect(shared.hasValidTemplateClient.value).toBe(false)
    shared.templateClient.value = '__shared__'
    await shared.save()
    expect(shared.apiFetch).toHaveBeenLastCalledWith('/api/email/templates', expect.objectContaining({ body: expect.objectContaining({ client_id: null }) }))
    const failed = await setup({}, true, true)
    failed.name.value = 'New'
    await failed.save()
    expect(failed.apiFetch).toHaveBeenCalledTimes(1)
  })
  it('preserves loaded ownership and category, overriding route defaults', async () => {
    const existing = await setup({ id: 'original' }, true)
    expect(existing.templateClient.value).toBe('allowed')
    expect(existing.templateFolderName.value).toBe('News')
    await existing.save()
    expect(existing.apiFetch).toHaveBeenLastCalledWith('/api/email/templates/original', expect.objectContaining({ method: 'PATCH', body: expect.objectContaining({ client_id: 'allowed', folder_name: 'News' }) }))
  })
  it('copies through scoped GET and POST without overwriting original', async () => {
    const copy = await setup({ copy: 'original', client: 'allowed' }, true)
    expect(copy.templateId.value).toBeNull()
    expect(copy.name.value).toBe('Newsletter (copy)')
    expect(copy.templateClient.value).toBe('allowed')
    await copy.save()
    expect(copy.router.replace).toHaveBeenCalledWith({query:{client:'allowed',id:'original'}})
    expect(copy.apiFetch).toHaveBeenLastCalledWith('/api/email/templates', expect.objectContaining({ method: 'POST', body: expect.objectContaining({ name: 'Newsletter (copy)', folder_name: 'News' }) }))
  })
  it('blocks save after a template load failure and identifies missing starters', async () => {
    const failed = await setup({id:'original'},true,false,true)
    expect(failed.templateLoading.value).toBe(false)
    expect(failed.templateLoadError.value).toContain('Could not load this template')
    await failed.save()
    expect(failed.apiFetch.mock.calls.every((call:any[])=>call.length===1)).toBe(true)
    const missing = await setup({starter:'missing'},true)
    expect(missing.templateLoadError.value).toContain('not available')
  })

  it('blocks edits/saves until a delayed template load settles', async () => {
    let release!: () => void
    const held=new Promise<void>(resolve=>{release=resolve})
    const pending=await setup({id:'original'},true,false,false,held)
    expect(pending.templateLoading.value).toBe(true)
    await pending.save()
    expect(pending.apiFetch.mock.calls.every((call:any[])=>call.length===1)).toBe(true)
    release();await pending.mounting
    expect(pending.templateLoading.value).toBe(false)
    expect(pending.store.resetDocument).toHaveBeenCalledTimes(1)
  })

})
