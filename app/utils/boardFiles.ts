import type { BoardFileItem } from '~/types'

export interface BoardFileFilters {
  search: string
  scope: 'all' | BoardFileItem['scope']
  category: 'all' | BoardFileItem['category']
  knowledge: 'all' | 'review' | 'approved' | 'failed' | 'not_submitted'
}

function matchesKnowledge(file: BoardFileItem, filter: BoardFileFilters['knowledge']): boolean {
  if (filter === 'all') return true
  if (filter === 'review') {
    return file.knowledge.reviewStatus === 'pending'
      && (file.knowledge.extractionStatus === 'ready' || file.knowledge.extractionStatus === 'failed')
  }
  if (filter === 'approved') return file.knowledge.reviewStatus === 'approved'
  if (filter === 'failed') {
    return file.knowledge.extractionStatus === 'failed' || file.knowledge.indexStatus === 'failed'
  }
  return file.knowledge.indexable && !file.knowledge.submissionId
}

export function filterBoardFileItems(files: BoardFileItem[], filters: BoardFileFilters): BoardFileItem[] {
  const search = filters.search.trim().toLowerCase()

  return files.filter((file) => {
    if (filters.scope !== 'all' && file.scope !== filters.scope) return false
    if (filters.category !== 'all' && file.category !== filters.category) return false
    if (!matchesKnowledge(file, filters.knowledge)) return false
    if (!search) return true

    return [
      file.fileName,
      file.description,
      file.category,
      file.source,
      file.knowledge.label,
      file.uploadedBy?.name,
      file.uploadedBy?.email,
      file.task?.title
    ].some(value => value?.toLowerCase().includes(search))
  })
}
