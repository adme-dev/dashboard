// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, Suspense } from 'vue'
import Panel from '~~/app/components/email/TemplatesPanel.vue'
const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222'
const rows = [
  { id: 'a', name: 'Alpha saved', client_id: A, folder_name: 'Launches', template_kind: 'template', updated_at: '' },
  { id: 'b', name: 'Beta draft', client_id: B, folder_name: null, template_kind: 'draft', updated_at: '' },
  { id: 'shared', name: 'Shared original', client_id: null, folder_name: null, template_kind: 'template', updated_at: '' }
]
const fetcher = vi.fn(), navigate = vi.fn(), toast = vi.fn()
let cleanup: () => void
async function flush() { for (let i = 0; i < 10; i++) { await Promise.resolve(); await nextTick() } }
async function mount() {
  const host = document.createElement('div')
  const app = createApp({ render: () => h(Suspense, null, { default: () => h(Panel) }) })
  app.component('UButton', { props: ['label','icon','disabled','to'], template: '<button :data-icon="icon" :data-to="to" :disabled="disabled"><slot />{{ label }}</button>' })
  app.component('USelect', { props: ['modelValue','items'], emits: ['update:modelValue'], template: '<select :value="modelValue" @change="$emit(\'update:modelValue\',$event.target.value)"><option v-for="item in items" :key="item.value" :value="item.value">{{ item.label }}</option></select>' })
  app.component('USelectMenu', { props: ['modelValue','items'], emits: ['update:modelValue'], template: '<select multiple @change="$emit(\'update:modelValue\', Array.from($event.target.selectedOptions).map(option => option.value))"><option v-for="item in items" :key="item.value" :value="item.value">{{ item.label }}</option></select>' })
  app.component('UFormField', { props: ['label'], template: '<label :data-label="label">{{ label }}<slot /></label>' })
  app.component('UInput', { props: ['modelValue'], emits:['update:modelValue'], template: '<input :value="modelValue" @input="$emit(\'update:modelValue\',$event.target.value)" />' })
  app.component('UModal', { props:['open'], template:'<div v-if="open"><slot name="content" /></div>' })
  for (const name of ['UIcon','UBadge','UTooltip','UAlert','EmailBuilderEdmTemplateThumbnail','EmailBuilderEdmDocumentThumbnail','EmailTemplateImportModal']) app.component(name,{template:'<div><slot /></div>'})
  app.mount(host); cleanup=()=>app.unmount(); await flush(); return host
}
function click(host: HTMLElement, label: string) { Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find(b=>b.textContent?.trim()===label)!.click() }
beforeEach(()=>{
  vi.stubGlobal('useToast',()=>({add:toast}));vi.stubGlobal('navigateTo',navigate);vi.stubGlobal('$fetch',fetcher);localStorage.clear();fetcher.mockReset();navigate.mockClear()
  fetcher.mockImplementation(async (url:string)=>url==='/api/email/template-clients'?{clients:[{id:A,name:'Alpha client'},{id:B,name:'Beta client'}],canUseSharedTemplates:true}:{items:rows})
})
afterEach(()=>{cleanup?.();vi.unstubAllGlobals()})
describe('client template library integration',()=>{
  it('switches actual draft/shared/recent views and only resolves accessible recent IDs',async()=>{
    localStorage.setItem('xeroflow:email:recent-template-ids',JSON.stringify({saved:['foreign','a'],starters:['postcards-glidex']}))
    const host=await mount();expect(host.querySelectorAll('.saved-template-card')).toHaveLength(3)
    click(host,'Drafts');await flush();expect(host.querySelectorAll('.saved-template-card')).toHaveLength(1);expect(host.textContent).toContain('Beta draft');expect(host.querySelectorAll('.email-starter-card')).toHaveLength(0)
    click(host,'Shared defaults');await flush();expect(host.querySelectorAll('.saved-template-card')).toHaveLength(1);expect(host.textContent).toContain('Shared original')
    click(host,'Recently viewed');await flush();expect(host.querySelectorAll('.saved-template-card')).toHaveLength(1);expect(host.textContent).toContain('Alpha saved');expect(host.querySelectorAll('.email-starter-card')).toHaveLength(1)
  })
  it('filters client templates and carries the selected client into default reuse',async()=>{
    const host=await mount();const select=host.querySelector<HTMLSelectElement>('[data-label="Client"] select')!;select.value=A;select.dispatchEvent(new Event('change'));await flush()
    expect(host.querySelectorAll('.saved-template-card')).toHaveLength(1);expect(host.textContent).toContain('Alpha saved')
    host.querySelector<HTMLButtonElement>('.email-starter-card')!.click();expect(navigate).toHaveBeenCalledWith(expect.stringContaining('client='+A))
    click(host,'Shared defaults');await flush();click(host,'Use template');expect(navigate).toHaveBeenLastCalledWith('/agency/email/compose?copy=shared&client='+A)
  })
  it('creates a persisted category through scoped template updates and updates the view immediately', async()=>{
    fetcher.mockImplementation(async(url:string, options?:{method?:string,body?:{folder_name?:string}})=>{
      if(url==='/api/email/template-clients')return{clients:[{id:A,name:'Alpha client'},{id:B,name:'Beta client'}],canUseSharedTemplates:true}
      if(options?.method==='PATCH')return{template:{...rows[0],folder_name:options.body?.folder_name}}
      return{items:rows}
    })
    const host=await mount();click(host,'New category');await flush()
    const name=host.querySelector<HTMLInputElement>('[data-label="Category name"] input')!;name.value='Sale weekend';name.dispatchEvent(new Event('input'))
    const selection=host.querySelector<HTMLSelectElement>('[data-label="Templates"] select')!;selection.options[0]!.selected=true;selection.dispatchEvent(new Event('change'));await flush()
    click(host,'Save category');await flush()
    expect(fetcher).toHaveBeenCalledWith('/api/email/templates/a',{method:'PATCH',body:{folder_name:'Sale weekend'}})
    expect(host.querySelectorAll('.saved-template-card')).toHaveLength(1)
    expect(host.textContent).toContain('Sale weekend')
  })

})
