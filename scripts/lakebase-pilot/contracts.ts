export type LakebasePilotIntent = 'read' | 'mutate'
export type LakebasePilotMode = 'off' | 'shadow' | 'bm25'

export interface LakebasePilotTarget {
  projectId: string
  endpointId: string
  databaseUrl: string
  databaseHost: string
  productionProjectId: string
}

export class LakebasePilotSafetyError extends Error {
  constructor(readonly code: string) {
    super(code)
    this.name = 'LakebasePilotSafetyError'
  }
}

function required(env: Record<string, string | undefined>, key: string): string {
  const value = env[key]?.trim()
  if (!value) throw new LakebasePilotSafetyError(`missing_${key.toLowerCase()}`)
  return value
}

function endpointFromHost(hostname: string): string {
  return hostname.split('.')[0]?.replace(/-pooler$/, '') || ''
}

export function resolvePilotTarget(
  env: Record<string, string | undefined>,
  intent: LakebasePilotIntent
): LakebasePilotTarget {
  const projectId = required(env, 'LAKEBASE_PILOT_PROJECT_ID')
  const endpointId = required(env, 'LAKEBASE_PILOT_ENDPOINT_ID')
  const databaseUrl = required(env, 'LAKEBASE_PILOT_DATABASE_URL')
  const productionProjectId = required(env, 'NEON_PRODUCTION_PROJECT_ID')
  let databaseHost: string
  try {
    databaseHost = new URL(databaseUrl).hostname
  } catch {
    throw new LakebasePilotSafetyError('invalid_pilot_database_url')
  }
  if (!databaseHost.endsWith('.neon.tech')) throw new LakebasePilotSafetyError('non_neon_database_host')
  if (projectId === productionProjectId) throw new LakebasePilotSafetyError('production_project_targeted')
  if (env.DATABASE_URL?.trim()) {
    let productionHost: string
    try {
      productionHost = new URL(env.DATABASE_URL).hostname
    } catch {
      throw new LakebasePilotSafetyError('invalid_production_database_url')
    }
    if (databaseUrl === env.DATABASE_URL.trim() || endpointFromHost(databaseHost) === endpointFromHost(productionHost)) {
      throw new LakebasePilotSafetyError('production_database_targeted')
    }
  }
  if (endpointFromHost(databaseHost) !== endpointId) {
    throw new LakebasePilotSafetyError('pilot_endpoint_database_mismatch')
  }
  if (intent === 'mutate' && env.LAKEBASE_PILOT_CONFIRM_NON_PRODUCTION_PROJECT !== '1') {
    throw new LakebasePilotSafetyError('mutation_not_confirmed')
  }
  return { projectId, endpointId, databaseUrl, databaseHost, productionProjectId }
}

export function redactPilotTarget(target: LakebasePilotTarget) {
  return { projectId: target.projectId, endpointId: target.endpointId, databaseHost: target.databaseHost }
}

export function resolvePilotMode(value: string | undefined, _target: LakebasePilotTarget): LakebasePilotMode {
  const mode = value?.trim() || 'off'
  if (mode === 'hybrid') throw new LakebasePilotSafetyError('hybrid_not_approved')
  if (mode === 'off' || mode === 'shadow' || mode === 'bm25') return mode
  throw new LakebasePilotSafetyError('invalid_pilot_mode')
}
