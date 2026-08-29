export const BOARD_VIEW_OPTIONS = [
  { id: 'table', label: 'Table', icon: 'i-lucide-table-2' },
  { id: 'kanban', label: 'Kanban', icon: 'i-lucide-kanban' },
  { id: 'timeline', label: 'Timeline', icon: 'i-lucide-gantt-chart' },
  { id: 'calendar', label: 'Calendar', icon: 'i-lucide-calendar' },
  { id: 'list', label: 'List', icon: 'i-lucide-list' },
  { id: 'gallery', label: 'Gallery', icon: 'i-lucide-layout-grid' },
  { id: 'files', label: 'Files', icon: 'i-lucide-folder-open' }
] as const

export type BoardViewType = typeof BOARD_VIEW_OPTIONS[number]['id']

const BOARD_VIEW_TYPE_SET = new Set<string>(BOARD_VIEW_OPTIONS.map(view => view.id))

export function isBoardViewType(value: unknown): value is BoardViewType {
  return typeof value === 'string' && BOARD_VIEW_TYPE_SET.has(value)
}
