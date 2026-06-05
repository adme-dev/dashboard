import type { EdmCustomModule } from '~~/app/composables/useEdmCustomModules'

export const CUSTOM_MODULE_NEW_CATEGORY = '__new__'

export const EDM_CUSTOM_MODULE_CATEGORY_OPTIONS = [
  { value: 'header', label: 'Header', icon: 'i-lucide-panel-top' },
  { value: 'hero', label: 'Hero', icon: 'i-lucide-panels-top-left' },
  { value: 'content', label: 'Content', icon: 'i-lucide-layout-list' },
  { value: 'feature', label: 'Feature', icon: 'i-lucide-sparkles' },
  { value: 'call-to-action', label: 'Call to action', icon: 'i-lucide-megaphone' },
  { value: 'e-commerce', label: 'E-Commerce', icon: 'i-lucide-shopping-cart' },
  { value: 'transactional', label: 'Transactional', icon: 'i-lucide-receipt-text' },
  { value: 'footer', label: 'Footer', icon: 'i-lucide-panel-bottom' },
  { value: 'imported', label: 'Imported / Postcards', icon: 'i-lucide-import' },
  { value: 'custom', label: 'Misc', icon: 'i-lucide-bookmark' }
] as const

export type EdmCustomModuleCategory = typeof EDM_CUSTOM_MODULE_CATEGORY_OPTIONS[number]['value']

export function normaliseCustomModuleCategory(value: string | null | undefined): string {
  const slug = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
  return slug || 'custom'
}

export function labelCustomModuleCategory(value: string | null | undefined): string {
  const category = normaliseCustomModuleCategory(value)
  const known = EDM_CUSTOM_MODULE_CATEGORY_OPTIONS.find(option => option.value === category)
  if (known) return known.label
  return category
    .split('-')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || 'Misc'
}

export function iconCustomModuleCategory(value: string | null | undefined): string {
  const category = normaliseCustomModuleCategory(value)
  return EDM_CUSTOM_MODULE_CATEGORY_OPTIONS.find(option => option.value === category)?.icon || 'i-lucide-folder'
}

export function inferCustomModuleCategoryFromBlockType(type: string | null | undefined): string {
  const blockType = String(type || '').toLowerCase()
  if (blockType.includes('header') || blockType === 'menu') return 'header'
  if (blockType.includes('footer')) return 'footer'
  if (blockType.includes('hero')) return 'hero'
  if (blockType.includes('feature')) return 'feature'
  if (blockType.includes('button') || blockType.includes('cta')) return 'call-to-action'
  if (blockType.includes('product') || blockType.includes('commerce')) return 'e-commerce'
  if (blockType.includes('transactional') || blockType.includes('order')) return 'transactional'
  if (blockType === 'html') return 'imported'
  if (blockType.includes('text') || blockType.includes('heading') || blockType.includes('content')) return 'content'
  return 'custom'
}

export function resolveCustomModuleCategorySelection(selected: string, customLabel: string): string {
  if (selected === CUSTOM_MODULE_NEW_CATEGORY) return normaliseCustomModuleCategory(customLabel)
  return normaliseCustomModuleCategory(selected)
}

export interface EdmCustomModuleCategoryGroup {
  category: string
  label: string
  icon: string
  modules: EdmCustomModule[]
}

export function groupCustomModulesByCategory(modules: EdmCustomModule[]): EdmCustomModuleCategoryGroup[] {
  const order = EDM_CUSTOM_MODULE_CATEGORY_OPTIONS.map(option => option.value)
  const grouped = new Map<string, EdmCustomModule[]>()
  for (const module of modules) {
    const category = normaliseCustomModuleCategory(module.category)
    grouped.set(category, [...(grouped.get(category) || []), module])
  }

  return Array.from(grouped.entries())
    .sort(([a], [b]) => {
      const aIndex = order.indexOf(a as EdmCustomModuleCategory)
      const bIndex = order.indexOf(b as EdmCustomModuleCategory)
      if (aIndex !== -1 || bIndex !== -1) {
        if (aIndex === -1) return 1
        if (bIndex === -1) return -1
        return aIndex - bIndex
      }
      return labelCustomModuleCategory(a).localeCompare(labelCustomModuleCategory(b))
    })
    .map(([category, items]) => ({
      category,
      label: labelCustomModuleCategory(category),
      icon: iconCustomModuleCategory(category),
      modules: items
    }))
}
