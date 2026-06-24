/**
 * Pure position-assignment for "fill queue from drafts" (Slice 3). Given the
 * current max queue_position (null when the queue is empty) and the ordered
 * draft ids to append, return the new {id, position} pairs starting right after
 * the current max.
 */
export function nextQueuePositions(
  currentMax: number | null,
  draftIds: string[]
): { id: string, position: number }[] {
  const start = (currentMax ?? -1) + 1
  return draftIds.map((id, i) => ({ id, position: start + i }))
}
