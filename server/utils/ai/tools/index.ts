import type { AiTool } from '../toolRegistry'

/**
 * The assembled tool registry. Populated in Phase 4.10 once each tool file exists.
 * Kept as an empty array for now so toolRegistry.ts (and its tests) resolve cleanly.
 */
export const registry: AiTool<any>[] = []
