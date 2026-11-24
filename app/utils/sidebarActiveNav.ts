import type { NavigationMenuItem } from '@nuxt/ui'

export interface SidebarMatchedRecord {
  path: string
}

export interface SidebarRouteLocation {
  path: string
  query?: Record<string, unknown>
  matched?: readonly SidebarMatchedRecord[]
}

export interface ApplyActiveSidebarNavOptions {
  collapsed?: boolean
  popover?: boolean
  openPopoverKeys?: ReadonlySet<string> | readonly string[]
  onPopoverOpenChange?: (key: string, open: boolean) => void
}

export interface ActiveMediaProjectContext {
  projectId: string
  mediaType: 'audio' | 'av'
}

export const ACTIVE_MEDIA_PROJECT_NAV_STATE_KEY = 'agency-sidebar-active-media-project'

/**
 * Derives the sidebar media-project context directly from loaded project metadata
 * (and optional timeline media_type fallback), independent of audio engine readiness.
 */
export function resolveLoadedMediaProjectContext(
  project: { id?: string | null, mediaType?: string | null } | null | undefined,
  timelineMediaType?: string | null
): ActiveMediaProjectContext | null {
  if (!project?.id) return null
  const resolvedType = project.mediaType ?? timelineMediaType
  if (resolvedType !== 'av' && resolvedType !== 'audio') return null
  return {
    projectId: project.id,
    mediaType: resolvedType
  }
}

export interface ParsedNavTarget {
  path: string
  query: Array<[string, string]>
}

interface CandidateMatch {
  item: NavigationMenuItem
  target: ParsedNavTarget
  isExactPath: boolean
  queryScore: number
  order: number
}

const EXTERNAL_PROTOCOL_RE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i
const MEDIA_PROJECT_DETAIL_PREFIX = '/agency/audio/projects/'

export function normalizeSidebarPath(path: string): string {
  const withoutHash = path.split('#')[0] ?? ''
  const withoutQuery = withoutHash.split('?')[0] ?? ''
  if (!withoutQuery) return '/'
  const withLeadingSlash = withoutQuery.startsWith('/') ? withoutQuery : `/${withoutQuery}`
  const trimmed = withLeadingSlash.replace(/\/+$/, '')
  return trimmed || '/'
}

/**
 * Canonicalizes static path segments using the deepest matched Vue Router
 * record while preserving exact parameter segment values (e.g. board slugs).
 */
export function canonicalizeMatchedSidebarPath(
  rawPath: string,
  matched?: readonly SidebarMatchedRecord[]
): string {
  const normalized = normalizeSidebarPath(rawPath)
  if (!matched?.length) return normalized

  let recordPath: string | null = null
  for (let i = matched.length - 1; i >= 0; i -= 1) {
    const candidate = matched[i]?.path
    if (typeof candidate === 'string' && candidate.length > 0) {
      recordPath = candidate
      break
    }
  }
  if (!recordPath) return normalized

  const normalizedPattern = normalizeSidebarPath(recordPath)
  if (normalized === '/' && normalizedPattern === '/') return '/'

  const actualSegments = normalized === '/' ? [] : normalized.slice(1).split('/')
  const patternSegments = normalizedPattern === '/' ? [] : normalizedPattern.slice(1).split('/')

  const resolved: string[] = []
  let actualIndex = 0

  for (let i = 0; i < patternSegments.length; i += 1) {
    const patternSegment = patternSegments[i]!
    const isDynamic = patternSegment.includes(':')

    if (actualIndex >= actualSegments.length) {
      if (isDynamic && (patternSegment.endsWith('?') || patternSegment.endsWith('*'))) {
        continue
      }
      return normalized
    }

    const actualSegment = actualSegments[actualIndex]!

    if (isDynamic) {
      if (patternSegment.includes('*') || patternSegment.includes('+')) {
        resolved.push(...actualSegments.slice(actualIndex))
        actualIndex = actualSegments.length
        break
      }
      resolved.push(actualSegment)
      actualIndex += 1
      continue
    }

    if (actualSegment.toLowerCase() !== patternSegment.toLowerCase()) {
      return normalized
    }
    resolved.push(patternSegment)
    actualIndex += 1
  }

  if (actualIndex !== actualSegments.length) {
    return normalized
  }

  return resolved.length ? `/${resolved.join('/')}` : '/'
}

/**
 * Enriches a direct `/agency/audio/projects/:id` editor route with the loaded
 * project's known media type so Video Studio vs Audio Projects highlights
 * accurately even when opened from a bare link without `?mediaType=av`.
 */
export function applyMediaProjectSidebarContext(
  location: SidebarRouteLocation,
  context: ActiveMediaProjectContext | null | undefined
): SidebarRouteLocation {
  if (!context?.projectId) return location

  const canonicalPath = canonicalizeMatchedSidebarPath(location.path, location.matched)
  if (!canonicalPath.startsWith(MEDIA_PROJECT_DETAIL_PREFIX)) return location

  const segment = canonicalPath.slice(MEDIA_PROJECT_DETAIL_PREFIX.length)
  if (!segment || segment.includes('/')) return location

  let decodedId = segment
  try {
    decodedId = decodeURIComponent(segment)
  } catch {
    // Keep raw segment if malformed percent-encoding appears in the URL.
  }

  if (segment !== context.projectId && decodedId !== context.projectId) {
    return location
  }

  return {
    ...location,
    query: {
      ...(location.query ?? {}),
      mediaType: context.mediaType
    }
  }
}

export function parseInternalNavTarget(to: NavigationMenuItem['to']): ParsedNavTarget | null {
  if (!to) return null

  if (typeof to === 'string') {
    const trimmed = to.trim()
    if (!trimmed || EXTERNAL_PROTOCOL_RE.test(trimmed)) return null

    try {
      const parsed = new URL(trimmed, 'http://xeroflow.local')
      const query: Array<[string, string]> = []
      parsed.searchParams.forEach((value, key) => {
        query.push([key, value])
      })
      return {
        path: normalizeSidebarPath(parsed.pathname),
        query
      }
    } catch {
      return null
    }
  }

  if (typeof to === 'object' && 'path' in to && typeof to.path === 'string') {
    const rawPath = to.path.trim()
    if (!rawPath || EXTERNAL_PROTOCOL_RE.test(rawPath)) return null

    const query: Array<[string, string]> = []
    if ('query' in to && to.query && typeof to.query === 'object') {
      for (const [key, value] of Object.entries(to.query as Record<string, unknown>)) {
        if (value === undefined || value === null) continue
        if (Array.isArray(value)) {
          for (const entry of value) {
            if (entry !== undefined && entry !== null) {
              query.push([key, String(entry)])
            }
          }
        } else {
          query.push([key, String(value)])
        }
      }
    }

    return {
      path: normalizeSidebarPath(rawPath),
      query
    }
  }

  return null
}

function isNavigableItem(item: NavigationMenuItem): boolean {
  if (item.type === 'label') return false
  if (item.disabled) return false
  if (item.external) return false
  if (typeof item.target === 'string' && item.target && item.target !== '_self') return false
  // Vertical accordion triggers with children expand/collapse their group;
  // child links own the active highlight when expanded so parent + child never double-activate.
  if (item.type === 'trigger' && item.children?.length) return false
  return Boolean(item.to)
}

/**
 * Matches Vue Router's scalar query semantics used by page filters
 * (e.g. `route.query.mediaType === 'av'`, `route.query.mode === 'voice'`).
 * Repeated query keys produce an array in Vue Router and do not match a scalar check.
 */
function queryMatchesEntry(
  currentQuery: Record<string, unknown> | undefined,
  key: string,
  expected: string
): boolean {
  if (!currentQuery || !(key in currentQuery)) return false
  const raw = currentQuery[key]
  if (raw === undefined || raw === null || Array.isArray(raw)) return false
  return String(raw) === expected
}

function countPresentQueryParams(currentQuery: Record<string, unknown> | undefined): number {
  if (!currentQuery) return 0
  let count = 0
  for (const value of Object.values(currentQuery)) {
    if (value === undefined || value === null) continue
    if (Array.isArray(value)) {
      count += value.filter(entry => entry !== undefined && entry !== null).length
    } else {
      count += 1
    }
  }
  return count
}

function collectCandidates(
  groups: readonly (readonly NavigationMenuItem[])[],
  out: Array<{ item: NavigationMenuItem, target: ParsedNavTarget, order: number }>
): void {
  const visit = (items: readonly NavigationMenuItem[]) => {
    for (const item of items) {
      if (isNavigableItem(item)) {
        const target = parseInternalNavTarget(item.to)
        if (target) {
          out.push({ item, target, order: out.length })
        }
      }
      if (item.children?.length) {
        visit(item.children)
      }
    }
  }

  for (const group of groups) {
    visit(group)
  }
}

function compareMatches(a: CandidateMatch, b: CandidateMatch): number {
  // 1. Most specific (longest) matching path wins so child items beat parent prefixes.
  if (a.target.path.length !== b.target.path.length) {
    return b.target.path.length - a.target.path.length
  }
  // 2. Most specific matching query wins so query-scoped views (e.g. ?mediaType=av, ?mode=voice)
  //    beat the base path item when their query matches.
  if (a.queryScore !== b.queryScore) {
    return b.queryScore - a.queryScore
  }
  // 3. Exact path beats nested prefix on any remaining tie.
  if (a.isExactPath !== b.isExactPath) {
    return a.isExactPath ? -1 : 1
  }
  // 4. Stable document order tie-breaker guarantees strictly one winner.
  return a.order - b.order
}

/**
 * Resolves the single most-specific active navigation item across one or more
 * sidebar navigation groups for the current route path and query.
 */
export function resolveActiveSidebarNavItem(
  groups: readonly (readonly NavigationMenuItem[])[],
  location: SidebarRouteLocation
): NavigationMenuItem | null {
  const currentPath = canonicalizeMatchedSidebarPath(location.path, location.matched)
  const currentQuery = location.query
  const candidates: Array<{ item: NavigationMenuItem, target: ParsedNavTarget, order: number }> = []
  collectCandidates(groups, candidates)

  const pathCounts = new Map<string, number>()
  for (const candidate of candidates) {
    pathCounts.set(candidate.target.path, (pathCounts.get(candidate.target.path) ?? 0) + 1)
  }

  const matches: CandidateMatch[] = []

  for (const { item, target, order } of candidates) {
    const isExactPath = currentPath === target.path
    const isNestedPath = !item.exact
      && target.path !== '/'
      && currentPath.startsWith(`${target.path}/`)

    if (!isExactPath && !isNestedPath) continue

    let queryScore: number
    if (target.query.length === 0) {
      if (item.exactQuery === true && countPresentQueryParams(currentQuery) > 0) {
        continue
      }
      queryScore = 0
    } else {
      const allTargetQueryMatch = target.query.every(([key, value]) =>
        queryMatchesEntry(currentQuery, key, value)
      )

      if (allTargetQueryMatch) {
        if (item.exactQuery === true && countPresentQueryParams(currentQuery) !== target.query.length) {
          continue
        }
        queryScore = target.query.length
      } else {
        const sharesPathWithSibling = (pathCounts.get(target.path) ?? 0) > 1
        if (sharesPathWithSibling || item.exactQuery) {
          continue
        }
        // Sole nav item for this path carrying a default filter query (e.g. /portal/projects?status=active):
        // keep it active when navigating to nested detail routes or different filters.
        queryScore = -1
      }
    }

    matches.push({ item, target, isExactPath, queryScore, order })
  }

  if (!matches.length) return null
  matches.sort(compareMatches)
  return matches[0]!.item
}

function containsDescendant(
  items: readonly NavigationMenuItem[] | undefined,
  target: NavigationMenuItem
): boolean {
  if (!items?.length) return false
  for (const child of items) {
    if (child === target || containsDescendant(child.children, target)) {
      return true
    }
  }
  return false
}

export function collapsedPopoverKey(groupIndex: number, itemIndex: number): string {
  return `g${groupIndex}:i${itemIndex}`
}

function toOpenPopoverSet(keys?: ReadonlySet<string> | readonly string[]): ReadonlySet<string> {
  if (!keys) return new Set<string>()
  return keys instanceof Set ? keys : new Set(keys)
}

function collectCollapsedActiveAncestors(
  groups: readonly (readonly NavigationMenuItem[])[],
  winner: NavigationMenuItem | null,
  openPopoverKeys: ReadonlySet<string>
): Set<NavigationMenuItem> {
  const ancestors = new Set<NavigationMenuItem>()
  if (!winner) return ancestors

  for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
    const group = groups[groupIndex]!
    for (let itemIndex = 0; itemIndex < group.length; itemIndex += 1) {
      const item = group[itemIndex]!
      if (item !== winner && containsDescendant(item.children, winner)) {
        // When a collapsed group's flyout is open, its winning child link is visible inside
        // the flyout, so only the child should carry the active/current-page indicator.
        if (!openPopoverKeys.has(collapsedPopoverKey(groupIndex, itemIndex))) {
          ancestors.add(item)
        }
      }
    }
  }
  return ancestors
}

function withCollapsedPopoverTracking(
  item: NavigationMenuItem,
  key: string,
  onPopoverOpenChange: (key: string, open: boolean) => void
): NavigationMenuItem['popover'] {
  const existingPopover = typeof item.popover === 'object' && item.popover !== null
    ? item.popover as Record<string, unknown>
    : {}
  const existingOnUpdateOpen = existingPopover['onUpdate:open']
  const existingOnVnodeBeforeUnmount = existingPopover.onVnodeBeforeUnmount

  return {
    ...existingPopover,
    'onUpdate:open': (open: boolean) => {
      if (typeof existingOnUpdateOpen === 'function') {
        existingOnUpdateOpen(open)
      }
      onPopoverOpenChange(key, open)
    },
    'onVnodeBeforeUnmount': (...args: unknown[]) => {
      if (typeof existingOnVnodeBeforeUnmount === 'function') {
        existingOnVnodeBeforeUnmount(...args)
      }
      onPopoverOpenChange(key, false)
    }
  } as NavigationMenuItem['popover']
}

function mapGroupWithActive(
  items: readonly NavigationMenuItem[],
  winner: NavigationMenuItem | null,
  collapsedActiveAncestors: ReadonlySet<NavigationMenuItem>,
  groupIndex: number,
  options?: ApplyActiveSidebarNavOptions,
  depth = 0
): NavigationMenuItem[] {
  return items.map((item, itemIndex) => {
    const mappedChildren = item.children?.length
      ? mapGroupWithActive(item.children, winner, collapsedActiveAncestors, groupIndex, options, depth + 1)
      : item.children

    if (item.type === 'label') {
      return mappedChildren !== item.children ? { ...item, children: mappedChildren } : item
    }

    const isWinner = item === winner
    const isCollapsedAncestor = depth === 0 && collapsedActiveAncestors.has(item)
    const isActive = isWinner || isCollapsedAncestor
    const hasLinkOrTrigger = Boolean(item.to) || (item.type === 'trigger' && Boolean(item.children?.length))
    const shouldTrackPopover = depth === 0
      && Boolean(options?.collapsed)
      && Boolean(options?.onPopoverOpenChange)
      && Boolean(item.children?.length)
      && (Boolean(options?.popover) || Boolean(item.popover))

    if (!hasLinkOrTrigger && !isCollapsedAncestor && !shouldTrackPopover) {
      return mappedChildren !== item.children ? { ...item, children: mappedChildren } : item
    }

    const nextItem: NavigationMenuItem = {
      ...item,
      ...(mappedChildren !== item.children ? { children: mappedChildren } : {}),
      ...(shouldTrackPopover
        ? {
            popover: withCollapsedPopoverTracking(
              item,
              collapsedPopoverKey(groupIndex, itemIndex),
              options!.onPopoverOpenChange!
            )
          }
        : {}),
      active: isActive,
      exact: isWinner ? item.exact : false
    }
    nextItem['aria-current'] = isActive && (isWinner || Boolean(item.to)) ? 'page' : undefined
    return nextItem
  })
}

/**
 * Returns cloned navigation groups where strictly at most one item across all
 * groups has `active: true` and every other navigable item has `active: false`.
 * When `collapsed` is true and the winning item is a hidden child inside a
 * top-level group, that visible top-level ancestor is marked active while its
 * flyout is closed, and yields back to the child link when the flyout opens.
 */
export function applyActiveSidebarNav(
  groups: readonly (readonly NavigationMenuItem[])[],
  location: SidebarRouteLocation,
  options?: ApplyActiveSidebarNavOptions
): NavigationMenuItem[][] {
  const winner = resolveActiveSidebarNavItem(groups, location)
  const openPopoverKeys = options?.collapsed ? toOpenPopoverSet(options.openPopoverKeys) : new Set<string>()
  const collapsedActiveAncestors = options?.collapsed
    ? collectCollapsedActiveAncestors(groups, winner, openPopoverKeys)
    : new Set<NavigationMenuItem>()
  return groups.map((group, groupIndex) =>
    mapGroupWithActive(group, winner, collapsedActiveAncestors, groupIndex, options)
  )
}

export function applyActiveSidebarNavGroup(
  items: readonly NavigationMenuItem[],
  location: SidebarRouteLocation,
  options?: ApplyActiveSidebarNavOptions
): NavigationMenuItem[] {
  return applyActiveSidebarNav([items], location, options)[0] ?? []
}
