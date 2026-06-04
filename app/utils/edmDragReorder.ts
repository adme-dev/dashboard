export type EdmRootDropPlacement = 'before' | 'after'

export function resolveRootDropIndex(
  rootChildrenIds: readonly string[],
  draggedBlockId: string,
  dropBoundaryIndex: number
): number | null {
  const fromIndex = rootChildrenIds.indexOf(draggedBlockId)
  if (fromIndex === -1) return null

  const boundedDropIndex = Math.max(0, Math.min(dropBoundaryIndex, rootChildrenIds.length))
  if (boundedDropIndex === fromIndex || boundedDropIndex === fromIndex + 1) return null

  return boundedDropIndex > fromIndex ? boundedDropIndex - 1 : boundedDropIndex
}
