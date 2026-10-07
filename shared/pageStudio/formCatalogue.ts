import type { PageStudioSavedPages } from './savedPages'

export function formCatalogue(pages: PageStudioSavedPages['pages'], library?: PageStudioSavedPages['formLibrary']) {
  const placements = pages.flatMap(page => page.forms.map(form => ({ pageId: page.id, formId: form.id, title: page.title, route: page.route, form })))
  if (!library) return placements.map(placement => ({ key: `${placement.pageId}:${placement.formId}`, definitionId: undefined as string | undefined, form: placement.form, placements: [placement] }))
  return library.definitions.map(definition => ({
    key: definition.id,
    definitionId: definition.id,
    form: definition.form,
    placements: definition.placements.map((placement) => {
      const found = placements.find(item => item.pageId === placement.pageId && item.formId === placement.formId)
      if (!found) throw new Error('Shared form placement is unavailable')
      return found
    })
  }))
}
