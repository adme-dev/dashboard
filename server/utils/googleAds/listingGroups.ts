import { z } from 'zod'
import type { GoogleAdsProviderMutation } from '~~/server/utils/googleAds/contracts'

const KeySchema = z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/)
const ValueSchema = z.string().trim().min(1).max(255)
const LevelSchema = z.enum(['LEVEL1', 'LEVEL2', 'LEVEL3', 'LEVEL4', 'LEVEL5'])
const CustomIndexSchema = z.enum(['INDEX0', 'INDEX1', 'INDEX2', 'INDEX3', 'INDEX4'])

export const ListingGroupDimensionSchema = z.union([
  z.strictObject({ kind: z.literal('PRODUCT_BRAND'), value: ValueSchema }),
  z.strictObject({ kind: z.literal('PRODUCT_BRAND'), other: z.literal(true) }),
  z.strictObject({ kind: z.literal('PRODUCT_CATEGORY'), level: LevelSchema, categoryId: z.string().regex(/^\d+$/) }),
  z.strictObject({ kind: z.literal('PRODUCT_CATEGORY'), level: LevelSchema, other: z.literal(true) }),
  z.strictObject({ kind: z.literal('PRODUCT_CHANNEL'), value: z.enum(['LOCAL', 'ONLINE']) }),
  z.strictObject({ kind: z.literal('PRODUCT_CHANNEL'), other: z.literal(true) }),
  z.strictObject({ kind: z.literal('PRODUCT_CONDITION'), value: z.enum(['NEW', 'REFURBISHED', 'USED']) }),
  z.strictObject({ kind: z.literal('PRODUCT_CONDITION'), other: z.literal(true) }),
  z.strictObject({ kind: z.literal('PRODUCT_CUSTOM_ATTRIBUTE'), index: CustomIndexSchema, value: ValueSchema }),
  z.strictObject({ kind: z.literal('PRODUCT_CUSTOM_ATTRIBUTE'), index: CustomIndexSchema, other: z.literal(true) }),
  z.strictObject({ kind: z.literal('PRODUCT_ITEM_ID'), value: ValueSchema }),
  z.strictObject({ kind: z.literal('PRODUCT_ITEM_ID'), other: z.literal(true) }),
  z.strictObject({ kind: z.literal('PRODUCT_TYPE'), level: LevelSchema, value: ValueSchema }),
  z.strictObject({ kind: z.literal('PRODUCT_TYPE'), level: LevelSchema, other: z.literal(true) })
])

export const ListingGroupNodeInputSchema = z.strictObject({
  key: KeySchema,
  parentKey: KeySchema.optional(),
  type: z.enum(['SUBDIVISION', 'UNIT_INCLUDED', 'UNIT_EXCLUDED']),
  dimension: ListingGroupDimensionSchema.optional()
})

export const ListingGroupNodesInputSchema = z.array(ListingGroupNodeInputSchema).min(1).max(1_000)

export const SemanticListingGroupNodeSchema = z.strictObject({
  path: z.array(ListingGroupDimensionSchema).max(20),
  type: z.enum(['SUBDIVISION', 'UNIT_INCLUDED', 'UNIT_EXCLUDED'])
})

export const ExistingListingGroupFilterSchema = z.object({
  resourceName: z.string(),
  assetGroup: z.string(),
  parentListingGroupFilter: z.string().optional(),
  type: z.enum(['SUBDIVISION', 'UNIT_INCLUDED', 'UNIT_EXCLUDED']),
  listingSource: z.literal('SHOPPING'),
  caseValue: z.record(z.string(), z.unknown()).optional()
})

export type ListingGroupDimension = z.infer<typeof ListingGroupDimensionSchema>
export type ListingGroupNodeInput = z.infer<typeof ListingGroupNodeInputSchema>
export type SemanticListingGroupNode = z.infer<typeof SemanticListingGroupNodeSchema>
export type ExistingListingGroupFilter = z.infer<typeof ExistingListingGroupFilterSchema>

function isOther(dimension: ListingGroupDimension): boolean {
  return 'other' in dimension && dimension.other === true
}

function dimensionPartitionKey(dimension: ListingGroupDimension): string {
  if (dimension.kind === 'PRODUCT_CATEGORY' || dimension.kind === 'PRODUCT_TYPE') {
    return `${dimension.kind}:${dimension.level}`
  }
  if (dimension.kind === 'PRODUCT_CUSTOM_ATTRIBUTE') return `${dimension.kind}:${dimension.index}`
  return dimension.kind
}

function dimensionValueKey(dimension: ListingGroupDimension): string {
  if ('other' in dimension) return `${dimensionPartitionKey(dimension)}:1:OTHER`
  if (dimension.kind === 'PRODUCT_CATEGORY') return `${dimensionPartitionKey(dimension)}:0:${dimension.categoryId}`
  return `${dimensionPartitionKey(dimension)}:0:${dimension.value}`
}

function pathKey(path: ListingGroupDimension[]): string {
  return JSON.stringify(path)
}

function compareSemanticNodes(left: SemanticListingGroupNode, right: SemanticListingGroupNode): number {
  if (left.path.length !== right.path.length) return left.path.length - right.path.length
  for (let index = 0; index < left.path.length; index += 1) {
    const compared = dimensionValueKey(left.path[index]!).localeCompare(dimensionValueKey(right.path[index]!))
    if (compared !== 0) return compared
  }
  return 0
}

export function validateAndNormalizeListingGroupNodes(value: unknown): SemanticListingGroupNode[] {
  const nodes = ListingGroupNodesInputSchema.parse(value)
  const byKey = new Map<string, ListingGroupNodeInput>()
  for (const node of nodes) {
    if (byKey.has(node.key)) throw new Error(`Listing-group node key "${node.key}" is duplicated`)
    byKey.set(node.key, node)
  }
  const roots = nodes.filter(node => node.parentKey === undefined)
  if (roots.length !== 1) throw new Error('A listing-group tree must contain exactly one root node')
  const root = roots[0]!
  if (root.dimension !== undefined) throw new Error('The listing-group root cannot have a dimension')
  if (root.type === 'UNIT_EXCLUDED') throw new Error('The listing-group root cannot exclude all products')

  const children = new Map<string, ListingGroupNodeInput[]>()
  for (const node of nodes) {
    if (node === root) continue
    if (!node.parentKey || !byKey.has(node.parentKey)) {
      throw new Error(`Listing-group node "${node.key}" has an unknown parent`)
    }
    if (!node.dimension) throw new Error(`Listing-group node "${node.key}" requires a dimension`)
    const siblings = children.get(node.parentKey) ?? []
    siblings.push(node)
    children.set(node.parentKey, siblings)
  }

  for (const node of nodes) {
    const nodeChildren = children.get(node.key) ?? []
    if (node.type !== 'SUBDIVISION' && nodeChildren.length > 0) {
      throw new Error(`Unit listing-group node "${node.key}" cannot have children`)
    }
    if (node.type !== 'SUBDIVISION') continue
    if (nodeChildren.length < 2) {
      throw new Error(`Subdivision "${node.key}" requires at least one explicit child and one Other child`)
    }
    const dimensions = nodeChildren.map(child => child.dimension!)
    const partition = dimensionPartitionKey(dimensions[0]!)
    if (dimensions.some(dimension => dimensionPartitionKey(dimension) !== partition)) {
      throw new Error(`All children of subdivision "${node.key}" must use the same dimension and level`)
    }
    if (dimensions.filter(isOther).length !== 1) {
      throw new Error(`Subdivision "${node.key}" must contain exactly one Other child`)
    }
    if (new Set(dimensions.map(dimensionValueKey)).size !== dimensions.length) {
      throw new Error(`Subdivision "${node.key}" contains duplicate dimension values`)
    }
  }

  const visiting = new Set<string>()
  const visited = new Set<string>()
  const semantic: SemanticListingGroupNode[] = []
  const visit = (node: ListingGroupNodeInput, path: ListingGroupDimension[]): void => {
    if (visiting.has(node.key)) throw new Error('Listing-group tree contains a cycle')
    if (visited.has(node.key)) return
    if (path.length > 20) throw new Error('Listing-group trees cannot exceed 20 levels')
    visiting.add(node.key)
    semantic.push({ path, type: node.type })
    const orderedChildren = [...(children.get(node.key) ?? [])]
      .sort((left, right) => dimensionValueKey(left.dimension!).localeCompare(dimensionValueKey(right.dimension!)))
    for (const child of orderedChildren) visit(child, [...path, child.dimension!])
    visiting.delete(node.key)
    visited.add(node.key)
  }
  visit(root, [])
  if (visited.size !== nodes.length) throw new Error('Every listing-group node must be connected to the root')
  return semantic.sort(compareSemanticNodes)
}

export function validateSemanticListingGroupNodes(value: unknown): SemanticListingGroupNode[] {
  const nodes = z.array(SemanticListingGroupNodeSchema).min(1).max(1_000).parse(value)
  const keyByPath = new Map<string, string>()
  nodes.forEach((node, index) => {
    const key = pathKey(node.path)
    if (keyByPath.has(key)) throw new Error('Semantic listing-group tree contains a duplicate path')
    keyByPath.set(key, `node${index}`)
  })
  const inputNodes: ListingGroupNodeInput[] = nodes.map((node, index) => {
    const parentPath = node.path.slice(0, -1)
    const parentKey = node.path.length === 0 ? undefined : keyByPath.get(pathKey(parentPath))
    if (node.path.length > 0 && !parentKey) {
      throw new Error('Semantic listing-group tree contains a node with a missing parent')
    }
    return {
      key: `node${index}`,
      ...(parentKey ? { parentKey } : {}),
      type: node.type,
      ...(node.path.length > 0 ? { dimension: node.path.at(-1)! } : {})
    }
  })
  const normalized = validateAndNormalizeListingGroupNodes(inputNodes)
  if (JSON.stringify(normalized) !== JSON.stringify(nodes)) {
    throw new Error('Semantic listing-group nodes are not in canonical order')
  }
  return normalized
}

function oneRecord(value: unknown, key: string): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const nested = record[key]
  return nested && typeof nested === 'object' && !Array.isArray(nested)
    ? nested as Record<string, unknown>
    : undefined
}

export function listingGroupDimensionFromCaseValue(caseValue: unknown): ListingGroupDimension {
  const brand = oneRecord(caseValue, 'productBrand')
  if (brand) return ListingGroupDimensionSchema.parse(brand.value === undefined
    ? { kind: 'PRODUCT_BRAND', other: true }
    : { kind: 'PRODUCT_BRAND', value: brand.value })
  const category = oneRecord(caseValue, 'productCategory')
  if (category) return ListingGroupDimensionSchema.parse(category.categoryId === undefined
    ? { kind: 'PRODUCT_CATEGORY', level: category.level, other: true }
    : { kind: 'PRODUCT_CATEGORY', level: category.level, categoryId: String(category.categoryId) })
  const channel = oneRecord(caseValue, 'productChannel')
  if (channel) return ListingGroupDimensionSchema.parse(channel.channel === undefined
    ? { kind: 'PRODUCT_CHANNEL', other: true }
    : { kind: 'PRODUCT_CHANNEL', value: channel.channel })
  const condition = oneRecord(caseValue, 'productCondition')
  if (condition) return ListingGroupDimensionSchema.parse(condition.condition === undefined
    ? { kind: 'PRODUCT_CONDITION', other: true }
    : { kind: 'PRODUCT_CONDITION', value: condition.condition })
  const custom = oneRecord(caseValue, 'productCustomAttribute')
  if (custom) return ListingGroupDimensionSchema.parse(custom.value === undefined
    ? { kind: 'PRODUCT_CUSTOM_ATTRIBUTE', index: custom.index, other: true }
    : { kind: 'PRODUCT_CUSTOM_ATTRIBUTE', index: custom.index, value: custom.value })
  const item = oneRecord(caseValue, 'productItemId')
  if (item) return ListingGroupDimensionSchema.parse(item.value === undefined
    ? { kind: 'PRODUCT_ITEM_ID', other: true }
    : { kind: 'PRODUCT_ITEM_ID', value: item.value })
  const type = oneRecord(caseValue, 'productType')
  if (type) return ListingGroupDimensionSchema.parse(type.value === undefined
    ? { kind: 'PRODUCT_TYPE', level: type.level, other: true }
    : { kind: 'PRODUCT_TYPE', level: type.level, value: type.value })
  throw new Error('Google Ads returned an unsupported listing-group dimension')
}

export function listingGroupCaseValue(dimension: ListingGroupDimension): Record<string, unknown> {
  if (dimension.kind === 'PRODUCT_BRAND') return { productBrand: 'other' in dimension ? {} : { value: dimension.value } }
  if (dimension.kind === 'PRODUCT_CATEGORY') return {
    productCategory: 'other' in dimension
      ? { level: dimension.level }
      : { level: dimension.level, categoryId: dimension.categoryId }
  }
  if (dimension.kind === 'PRODUCT_CHANNEL') return {
    productChannel: 'other' in dimension ? {} : { channel: dimension.value }
  }
  if (dimension.kind === 'PRODUCT_CONDITION') return {
    productCondition: 'other' in dimension ? {} : { condition: dimension.value }
  }
  if (dimension.kind === 'PRODUCT_CUSTOM_ATTRIBUTE') return {
    productCustomAttribute: 'other' in dimension
      ? { index: dimension.index }
      : { index: dimension.index, value: dimension.value }
  }
  if (dimension.kind === 'PRODUCT_ITEM_ID') return {
    productItemId: 'other' in dimension ? {} : { value: dimension.value }
  }
  return {
    productType: 'other' in dimension
      ? { level: dimension.level }
      : { level: dimension.level, value: dimension.value }
  }
}

export function normalizeExistingListingGroupFilters(value: unknown): SemanticListingGroupNode[] {
  const filters = z.array(ExistingListingGroupFilterSchema).parse(value)
  if (filters.length === 0) return []
  const byName = new Map(filters.map(filter => [filter.resourceName, filter]))
  const roots = filters.filter(filter => !filter.parentListingGroupFilter)
  if (roots.length !== 1) throw new Error('Google Ads returned a listing-group tree without exactly one root')
  const semantic: SemanticListingGroupNode[] = []
  const visiting = new Set<string>()
  const visit = (filter: ExistingListingGroupFilter, path: ListingGroupDimension[]): void => {
    if (visiting.has(filter.resourceName)) throw new Error('Google Ads returned a cyclic listing-group tree')
    visiting.add(filter.resourceName)
    semantic.push({ path, type: filter.type })
    const childFilters = filters.filter(candidate => candidate.parentListingGroupFilter === filter.resourceName)
    for (const child of childFilters) {
      if (!child.caseValue) throw new Error('Google Ads returned a non-root listing group without a dimension')
      visit(child, [...path, listingGroupDimensionFromCaseValue(child.caseValue)])
    }
    visiting.delete(filter.resourceName)
  }
  visit(roots[0]!, [])
  if (semantic.length !== byName.size) throw new Error('Google Ads returned a disconnected listing-group tree')
  return semantic.sort(compareSemanticNodes)
}

function listingGroupResourceName(customerId: string, assetGroupId: string, filterId: number): string {
  return `customers/${customerId}/assetGroupListingGroupFilters/${assetGroupId}~${filterId}`
}

export function buildListingGroupProviderOperations(input: {
  customerId: string
  assetGroupResourceName: string
  desiredNodes: SemanticListingGroupNode[]
  existingFilters: ExistingListingGroupFilter[]
}): GoogleAdsProviderMutation['operations'] {
  const match = input.assetGroupResourceName.match(/^customers\/(\d+)\/assetGroups\/(\d+)$/)
  if (!match || match[1] !== input.customerId) throw new Error('Listing-group asset group does not belong to the selected Google Ads customer')
  const assetGroupId = match[2]!
  const existingResourcePattern = new RegExp(
    `^customers/${input.customerId}/assetGroupListingGroupFilters/${assetGroupId}~\\d+$`
  )
  const resourceNames = new Set<string>()
  for (const filter of input.existingFilters) {
    if (filter.assetGroup !== input.assetGroupResourceName
      || !existingResourcePattern.test(filter.resourceName)) {
      throw new Error('Listing-group state does not belong to the selected asset group')
    }
    if (resourceNames.has(filter.resourceName)) throw new Error('Listing-group state contains a duplicate resource')
    resourceNames.add(filter.resourceName)
    if (filter.parentListingGroupFilter && !existingResourcePattern.test(filter.parentListingGroupFilter)) {
      throw new Error('Listing-group parent does not belong to the selected asset group')
    }
  }
  const depth = (filter: ExistingListingGroupFilter): number => {
    let current = filter
    let result = 0
    const seen = new Set<string>()
    while (current.parentListingGroupFilter) {
      if (seen.has(current.resourceName)) throw new Error('Google Ads returned a cyclic listing-group tree')
      seen.add(current.resourceName)
      const parent = input.existingFilters.find(item => item.resourceName === current.parentListingGroupFilter)
      if (!parent) throw new Error('Google Ads returned a listing-group node with a missing parent')
      current = parent
      result += 1
    }
    return result
  }
  const desiredNodes = validateSemanticListingGroupNodes(input.desiredNodes)
  if (input.existingFilters.length + desiredNodes.length > 1_000) {
    throw new Error('Listing-group replacement exceeds the 1,000-operation atomic safety limit')
  }
  const operations: GoogleAdsProviderMutation['operations'] = [...input.existingFilters]
    .sort((left, right) => depth(right) - depth(left) || left.resourceName.localeCompare(right.resourceName))
    .map(filter => ({ mutate: { assetGroupListingGroupFilterOperation: { remove: filter.resourceName } } }))

  const temporaryNames = new Map<string, string>()
  desiredNodes.forEach((node, index) => {
    temporaryNames.set(pathKey(node.path), listingGroupResourceName(input.customerId, assetGroupId, -(index + 1)))
  })
  for (const node of desiredNodes) {
    const create: Record<string, unknown> = {
      resourceName: temporaryNames.get(pathKey(node.path)),
      assetGroup: input.assetGroupResourceName,
      type: node.type,
      listingSource: 'SHOPPING'
    }
    if (node.path.length > 0) {
      const parentPath = node.path.slice(0, -1)
      create.parentListingGroupFilter = temporaryNames.get(pathKey(parentPath))
      create.caseValue = listingGroupCaseValue(node.path.at(-1)!)
    }
    operations.push({ mutate: { assetGroupListingGroupFilterOperation: { create } } })
  }
  return operations
}
