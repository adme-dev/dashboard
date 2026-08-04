import type { BoardFileItem } from '~/types'

export interface BoardFileFilters {
  search: string
  scope: 'all' | BoardFileItem['scope']
  category: 'all' | BoardFileItem['category']
}

export function filterBoardFileItems(files: BoardFileItem[], filters: BoardFileFilters): BoardFileItem[] {
  const search = filters.search.trim().toLowerCase()

  return files.filter((file) => {
    if (filters.scope !== 'all' && file.scope !== filters.scope) return false
    if (filters.category !== 'all' && file.category !== filters.category) return false
    if (!search) return true

    return [
      file.fileName,
      file.description,
      file.category,
      file.source,
      file.uploadedBy?.name,
      file.uploadedBy?.email,
      file.task?.title
    ].some(value => value?.toLowerCase().includes(search))
  })
}
