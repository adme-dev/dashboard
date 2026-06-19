/**
 * Per-user long-term memory (Phase-0 WS-A). Three scopes per the 2026 standard
 * (memory-architecture spec §1): semantic (facts/prefs), episodic (past interactions),
 * procedural (routines). Distinct from the shared agency Knowledge Base — memory auto-writes
 * and is private; the KB is propose→review→publish. Never conflate the two.
 */

export type MemScope = 'user' | 'org'
export type MemType = 'semantic' | 'episodic' | 'procedural'
export type MemSource = 'inferred' | 'explicit' | 'system'

/** A row of ai_user_memory. */
export interface UserMemory {
  id: string
  user_id: string
  scope: MemScope
  mem_type: MemType
  content: string
  source: MemSource
  salience: number
  embedding_id: string | null
  metadata: Record<string, unknown>
  last_used_at: string | null
  created_at: string
  updated_at: string
}

export interface UpsertMemoryInput {
  userId: string
  memType: MemType
  content: string
  scope?: MemScope
  source?: MemSource
  /** 0..1; defaults 0.5. Re-remembering the same content reinforces (does not duplicate). */
  salience?: number
  metadata?: Record<string, unknown>
}

/** A memory scored for injection (retrieve.ts produces these). */
export interface ScoredMemory {
  memory: UserMemory
  score: number
}
