// app/composables/useTimelineUndo.ts — bounded undo/redo over snapshot states.
export function createUndoStack<T>({ limit = 100 }: { limit?: number } = {}) {
  const past: T[] = []
  const future: T[] = []
  return {
    push(prev: T) { past.push(prev); if (past.length > limit) past.shift(); future.length = 0 },
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
    undo(current: T): T | undefined { if (!past.length) return undefined; future.push(current); return past.pop() },
    redo(current: T): T | undefined { if (!future.length) return undefined; past.push(current); return future.pop() },
    clear() { past.length = 0; future.length = 0 }
  }
}
