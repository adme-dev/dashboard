import { describe, expect, it } from 'vitest'
import { formCatalogue } from '~~/shared/pageStudio/formCatalogue'
import { PageStudioSavedPagesSchema } from '~~/shared/pageStudio/savedPages'

function fixture() {
  const form = { id: 'one', name: 'Booking enquiry', fields: [{ id: 'name', name: 'Name', type: 'text' }] }
  const pages = ['one', 'two'].map(id => ({ id, route: `/${id}`, title: id, visibility: 'public', seo: {}, forms: [{ ...form, id }] }))
  const formLibrary = { schemaVersion: 1, definitions: [{ id: 'booking', revision: 1, form, placements: pages.map(page => ({ pageId: page.id, formId: page.id, fieldIds: { name: 'name' } })) }] }
  return { schemaVersion: 2, pages, formLibrary }
}
describe('shared Forms catalogue', () => {
  it('shows one definition with both placements and keeps legacy forms separate', () => {
    const saved = PageStudioSavedPagesSchema.parse(fixture())
    const catalogue = formCatalogue(saved.pages, saved.formLibrary)
    expect(catalogue).toHaveLength(1)
    expect(catalogue[0]?.placements.map(item => item.route)).toEqual(['/one', '/two'])
    expect(formCatalogue(saved.pages)).toHaveLength(2)
  })
  it('rejects malformed libraries rather than falling back to separate form settings', () => {
    const value = fixture()
    value.formLibrary.definitions[0]!.placements[1]!.pageId = 'foreign'
    expect(PageStudioSavedPagesSchema.safeParse(value).success).toBe(false)
    const missing = fixture()
    missing.formLibrary.definitions[0]!.placements.pop()
    expect(PageStudioSavedPagesSchema.safeParse(missing).success).toBe(false)
  })
})
