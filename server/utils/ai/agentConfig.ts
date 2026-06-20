import { queryOne as realQueryOne, execute as realExecute } from '~~/server/utils/db'

/**
 * Self-service co-pilot configuration (command-center spec §4a). THE GOLDEN RULE: configuration
 * NARROWS within the RBAC ceiling — it never GRANTS. `disabledTools` is applied by SUBTRACTION over
 * the already-RBAC+persona-filtered tool set, so a config can only ever remove a tool the user already
 * had; it can never add one their role lacks. Pure logic is unit-tested; the store is injected.
 */
export interface AgentConfig {
  ownerUserId: string
  personaKey: string | null
  disabledTools: string[]
  memoryEnabled: boolean
}

/** Subtract the user's disabled tools from an already-permitted set. Pure; the security invariant. */
export function narrowToolsByConfig<T extends { name: string }>(tools: T[], disabledTools: string[] | undefined): T[] {
  if (!disabledTools || disabledTools.length === 0) return tools
  const disabled = new Set(disabledTools)
  return tools.filter(t => !disabled.has(t.name))
}

export interface AgentConfigDb {
  queryOne: <T>(sql: string, params?: unknown[]) => Promise<T | null>
  execute: (sql: string, params?: unknown[]) => Promise<unknown>
}
const defaultDb: AgentConfigDb = { queryOne: realQueryOne as any, execute: realExecute as any }

interface ConfigRow {
  persona_key: string | null
  tool_overrides: { disabled?: unknown } | null
  memory_enabled: boolean
}

/** Load a user's personal config (null when none). Fail-safe: any error → null (no narrowing). */
export async function getAgentConfig(userId: string, db: AgentConfigDb = defaultDb): Promise<AgentConfig | null> {
  if (!userId) return null
  try {
    const row = await db.queryOne<ConfigRow>(
      `SELECT persona_key, tool_overrides, memory_enabled FROM ai_agent_configs
        WHERE owner_user_id = $1 AND scope = 'personal'`,
      [userId],
    )
    if (!row) return null
    const rawDisabled = row.tool_overrides?.disabled
    const disabledTools = Array.isArray(rawDisabled) ? rawDisabled.filter((x): x is string => typeof x === 'string') : []
    return {
      ownerUserId: userId,
      personaKey: row.persona_key,
      disabledTools,
      memoryEnabled: row.memory_enabled !== false,
    }
  } catch {
    return null
  }
}

/** Upsert a user's personal config (the "My Assistant" save). Returns nothing; fail-safe at the caller. */
export async function saveAgentConfig(
  input: { userId: string, personaKey?: string | null, disabledTools?: string[], memoryEnabled?: boolean },
  db: AgentConfigDb = defaultDb,
): Promise<void> {
  await db.execute(
    `INSERT INTO ai_agent_configs (owner_user_id, scope, persona_key, tool_overrides, memory_enabled, created_by)
       VALUES ($1, 'personal', $2, $3, $4, $1)
     ON CONFLICT (owner_user_id, scope)
       DO UPDATE SET persona_key = $2, tool_overrides = $3, memory_enabled = $4, updated_at = NOW()`,
    [
      input.userId,
      input.personaKey ?? null,
      JSON.stringify({ disabled: input.disabledTools ?? [] }),
      input.memoryEnabled !== false,
    ],
  )
}
