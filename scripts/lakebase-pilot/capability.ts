export type LakebaseQuery
  = (
    sql: string,
    params?: unknown[]
  ) =>
  Promise<Record<string, unknown>[]>

export type LakebaseReadinessBlocker
  = | 'postgres_16_required'
    | 'lakebase_preloads_missing'
    | 'lakebase_extensions_unavailable'

export interface LakebaseCapabilityReport {
  serverVersionNum: number | null
  databaseName: string | null
  preloadedLibraries: string[]
  extensions: Array<{
    name: 'lakebase_text' | 'lakebase_vector'
    defaultVersion: string | null
    installedVersion: string | null
    available: boolean
  }>
  pilotSchemaExists: boolean
}

export interface LakebaseReadiness {
  ready: boolean
  blockers: LakebaseReadinessBlocker[]
}

const REQUIRED_EXTENSIONS = ['lakebase_text', 'lakebase_vector'] as const

function firstRow(rows: Record<string, unknown>[]): Record<string, unknown> {
  return rows[0] || {}
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export async function inspectLakebaseCapability(query: LakebaseQuery): Promise<LakebaseCapabilityReport> {
  const server = await query(`
  SELECT current_setting('server_version_num')::int AS server_version_num,
         current_database() AS database_name
`)
  const preload = await query(`
  SELECT current_setting('shared_preload_libraries') AS shared_preload_libraries
`)
  const extensions = await query(`
  SELECT name, default_version, installed_version
  FROM pg_available_extensions
  WHERE name = ANY($1::text[])
  ORDER BY name
`, [REQUIRED_EXTENSIONS.slice()])
  const schema = await query(`
  SELECT to_regnamespace('lakebase_pilot') IS NOT NULL AS pilot_schema_exists
`)

  const serverRow = firstRow(server)
  const preloadRow = firstRow(preload)
  const schemaRow = firstRow(schema)
  const extensionByName = new Map(
    extensions
      .map(row => ({
        name: asString(row.name),
        defaultVersion: asString(row.default_version),
        installedVersion: asString(row.installed_version)
      }))
      .filter((extension): extension is {
        name: typeof REQUIRED_EXTENSIONS[number]
        defaultVersion: string | null
        installedVersion: string | null
      } => REQUIRED_EXTENSIONS.includes(extension.name as typeof REQUIRED_EXTENSIONS[number]))
      .map(extension => [extension.name, extension])
  )

  return {
    serverVersionNum: asNumber(serverRow.server_version_num),
    databaseName: asString(serverRow.database_name),
    preloadedLibraries: (asString(preloadRow.shared_preload_libraries) || '')
      .split(',')
      .map(value => value.trim())
      .filter(Boolean),
    extensions: REQUIRED_EXTENSIONS.map((name) => {
      const extension = extensionByName.get(name)
      return {
        name,
        defaultVersion: extension?.defaultVersion || null,
        installedVersion: extension?.installedVersion || null,
        available: Boolean(extension?.defaultVersion)
      }
    }),
    pilotSchemaExists: schemaRow.pilot_schema_exists === true
  }
}

export function classifyLakebaseReadiness(capability: LakebaseCapabilityReport): LakebaseReadiness {
  const blockers: LakebaseReadinessBlocker[] = []
  if (capability.serverVersionNum === null || capability.serverVersionNum < 160000) {
    blockers.push('postgres_16_required')
  }
  if (!REQUIRED_EXTENSIONS.every(name => capability.preloadedLibraries.includes(name))) {
    blockers.push('lakebase_preloads_missing')
  }
  if (!capability.extensions.every(extension => extension.available)) {
    blockers.push('lakebase_extensions_unavailable')
  }
  return { ready: blockers.length === 0, blockers }
}
