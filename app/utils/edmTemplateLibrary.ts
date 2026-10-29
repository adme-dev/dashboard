export interface TemplateLibraryRow {
  id: string
  name: string
  subject?: string | null
  preview_text?: string | null
  client_id?: string | null
  client_name?: string | null
  folder_name?: string | null
  template_kind?: string | null
}
export function filterTemplateLibrary<T extends TemplateLibraryRow>(rows: T[], options: { view: string, client: string, search?: string, recentIds?: string[] }): T[] {
  const query = options.search?.trim().toLowerCase() || ''
  const filtered = rows.filter(row => {
    const shared = !row.client_id
    if (options.view === 'shared' ? !shared || row.template_kind === 'draft' : options.client === 'shared' ? !shared : options.client !== 'all' && row.client_id !== options.client) return false
    if (options.view === 'drafts' && row.template_kind !== 'draft') return false
    if (options.view.startsWith('folder:') && row.folder_name?.trim() !== options.view.slice(7)) return false
    if (options.view === 'recent' && !options.recentIds?.includes(row.id)) return false
    return !query || [row.name, row.subject, row.preview_text, row.folder_name, row.client_name].some(value => value?.toLowerCase().includes(query))
  })
  return options.view === 'recent' ? filtered.sort((a, b) => options.recentIds!.indexOf(a.id) - options.recentIds!.indexOf(b.id)) : filtered
}
