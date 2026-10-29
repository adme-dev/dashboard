import { describe, expect, it } from 'vitest'
import { filterTemplateLibrary } from '~~/app/utils/edmTemplateLibrary'
const rows = [
  { id: 'shared', name: 'Shared launch', client_id: null, folder_name: 'Automotive', template_kind: 'template' },
  { id: 'a', name: 'Alpha launch', client_id: 'client-a', folder_name: 'Automotive', template_kind: 'template' },
  { id: 'b', name: 'Beta newsletter', subject: 'Monthly news', client_id: 'client-b', folder_name: 'Newsletters', template_kind: 'draft' }
]
describe('template library views', () => {
  it('combines client and category filtering without exposing another client', () => {
    expect(filterTemplateLibrary(rows, { view: 'folder:Automotive', client: 'client-a' }).map(r => r.id)).toEqual(['a'])
  })
  it('separates shared defaults and drafts', () => {
    expect(filterTemplateLibrary(rows, { view: 'shared', client: 'all' }).map(r => r.id)).toEqual(['shared'])
    expect(filterTemplateLibrary(rows, { view: 'drafts', client: 'all' }).map(r => r.id)).toEqual(['b'])
  })
  it('shows only currently accessible recent rows in viewing order', () => {
    expect(filterTemplateLibrary(rows, { view: 'recent', client: 'all', recentIds: ['foreign', 'b', 'a'] }).map(r => r.id)).toEqual(['b', 'a'])
  })
  it('searches saved names, subjects and categories', () => {
    expect(filterTemplateLibrary(rows, { view: 'templates', client: 'all', search: 'monthly' }).map(r => r.id)).toEqual(['b'])
    expect(filterTemplateLibrary(rows, { view: 'templates', client: 'shared', search: 'automotive' }).map(r => r.id)).toEqual(['shared'])
  })
  it('searches recorded OEM make/provider while combining make and client scope', () => {
    const source=(make:string)=>({root:{type:'EmailLayout',data:{props:{sourceProvenance:{make,provider:'Sesimi'}}}}})
    const sources=[{id:'g-a',name:'Launch',client_id:'a',body_source:source('Geely')},{id:'g-b',name:'Launch',client_id:'b',body_source:source('Geely')},{id:'j-a',name:'Launch',client_id:'a',body_source:source('Jaecoo')}]
    expect(filterTemplateLibrary(sources,{view:'templates',client:'a',make:'Geely',search:'sesimi'}).map(r=>r.id)).toEqual(['g-a'])
    expect(filterTemplateLibrary(sources,{view:'templates',client:'a',search:'jaecoo'}).map(r=>r.id)).toEqual(['j-a'])
  })

})
