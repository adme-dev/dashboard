import { z } from 'zod'
import * as api from '~~/server/utils/googleTagManagerClient'
import { reserveGtmApiQuota } from '~~/server/utils/googleTagManagerStore'
import { GtmTemplateSchema, compileGtmTemplate } from './gtmTemplateRegistry'
import { gtmHash } from './gtmOwnership'
export const GtmTypedChangeSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('create'), template: GtmTemplateSchema }),
  z.strictObject({
    action: z.literal('update'),
    template: GtmTemplateSchema,
    entityPath: z.string().min(1).max(300),
    expectedFingerprint: z.string().min(1).max(200)
  })
])
export const GtmChangesSchema = z.array(GtmTypedChangeSchema).min(1).max(5)
const identity = new Set([
  'path',
  'accountId',
  'containerId',
  'workspaceId',
  'tagId',
  'triggerId',
  'variableId',
  'folderId',
  'fingerprint',
  'tagManagerUrl'
])
function normalized(value: any): any {
  if (Array.isArray(value)) {
    const rows = value.map(normalized)
    if (
      rows.every((v) => v && typeof v === 'object' && typeof v.key === 'string')
    ) {
      if (new Set(rows.map((v) => v.key)).size !== rows.length)
        throw new Error('Duplicate GTM parameter key')
      return rows.sort((a, b) => a.key.localeCompare(b.key))
    }
    return rows
  }
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, normalized(v)])
    )
  return value
}
export function assertManagedGtmUpdate(
  current: Record<string, any>,
  desired: Record<string, any>
) {
  for (const key of Object.keys(current))
    if (!identity.has(key) && !Object.hasOwn(desired, key))
      throw new Error(`Unreviewed existing GTM configuration: ${key}`)
  if (current.type !== desired.type)
    throw new Error('Changing GTM template type is unsupported')
  const expected = new Set((desired.parameter ?? []).map((p: any) => p.key))
  for (const p of current.parameter ?? [])
    if (!expected.has(p.key))
      throw new Error('Unreviewed existing GTM parameter')
  const inspectParameter = (p: any) => {
    if (
      Object.keys(p).some(
        (k) => !['type', 'key', 'value', 'list', 'map'].includes(k)
      )
    )
      throw new Error('Unreviewed nested GTM parameter')
    for (const nested of [...(p.list ?? []), ...(p.map ?? [])])
      inspectParameter(nested)
    if (
      p.type === 'map' &&
      (p.map ?? []).some(
        (entry: any) => !['parameter', 'parameterValue'].includes(entry.key)
      )
    )
      throw new Error('Unreviewed GTM event setting')
  }
  for (const p of current.parameter ?? []) inspectParameter(p)
  normalized(current)
}
/** Returns provider additions separately; every requested parameter must survive exact read-back. */
export function verifyGtmManagedEntity(
  desired: Record<string, any>,
  actual: Record<string, any>
) {
  normalized(actual)
  for (const [key, value] of Object.entries(desired)) {
    if (key === 'parameter') {
      for (const p of value as any[]) {
        const found = (actual.parameter ?? []).find((v: any) => v.key === p.key)
        if (!found || gtmHash(normalized(found)) !== gtmHash(normalized(p)))
          throw new Error('GTM managed parameter read-back mismatch')
      }
    } else if (
      gtmHash(normalized(actual[key] ?? null)) !== gtmHash(normalized(value))
    )
      throw new Error(`GTM read-back mismatch: ${key}`)
  }
  return Object.fromEntries(
    Object.entries(actual).filter(
      ([key]) => !identity.has(key) && !Object.hasOwn(desired, key)
    )
  )
}
/** Upper bound including preflight, references, writes and every verification read; excludes outer live read. */
export function gtmTypedChangeRequestCount(raw: unknown): number {
  return 5 + GtmChangesSchema.parse(raw).reduce((sum, change) => {
    const { body } = compileGtmTemplate(change.template)
    return sum + 2 + (change.action === 'update' ? 2 : 0)
      + (body.firingTriggerId ?? []).filter((id: string) => !['2147479553', '2147479573'].includes(id)).length
      + (body.parentFolderId ? 1 : 0)
  }, 0)
}
export interface GtmExecutionEffects {
  /** Called immediately before attempting a provider mutation, never on service entry. */
  beforeWrite(): void
}
export async function executeGtmTypedChanges(
  token: string,
  container: string,
  raw: unknown,
  name: string,
  base: api.GtmContainerVersion,
  execution?: { call: <T>(fn: () => Promise<T>) => Promise<T> } & GtmExecutionEffects
) {
  const changes = GtmChangesSchema.parse(raw)
  api.assertGtmContainerPath(container)
  if (!execution) await reserveGtmApiQuota(gtmTypedChangeRequestCount(changes))
  const call = execution?.call ?? (async <T>(fn: () => Promise<T>) => fn())
  const write = <T>(fn: () => Promise<T>) => call(() => {
    execution?.beforeWrite()
    return fn()
  })
  // Verify every update before the first provider write, including configuration we cannot preserve.
  for (const change of changes)
    if (change.action === 'update') {
      const { kind, body } = compileGtmTemplate(change.template)
      api.assertGtmEntityPath(change.entityPath, kind)
      if (!change.entityPath.startsWith(`${container}/workspaces/`))
        throw new Error('Cross-container entity')
      const current = await call(() =>
        api.getGtmEntity(token, change.entityPath, kind)
      )
      if (current.fingerprint !== change.expectedFingerprint)
        throw new Error('GTM entity drift')
      assertManagedGtmUpdate(current, body)
    }
  const workspace = await write(() =>
    api.createGtmWorkspace(token, container, { name })
  )
  if (
    !workspace.path.startsWith(`${container}/workspaces/`) ||
    !workspace.fingerprint
  )
    throw new Error('Invalid workspace receipt')
  const managed: any[] = []
  for (const change of changes) {
    const { kind, body } = compileGtmTemplate(change.template)
    // References must resolve within the exact isolated workspace, never arbitrary interpolation.
    for (const trigger of body.firingTriggerId ?? []) {
      if (!['2147479553', '2147479573'].includes(trigger))
        await call(() =>
          api.getGtmEntity(
            token,
            `${workspace.path}/triggers/${trigger}`,
            'triggers'
          )
        )
    }
    if (body.parentFolderId)
      await call(() =>
        api.getGtmEntity(
          token,
          `${workspace.path}/folders/${body.parentFolderId}`,
          'folders'
        )
      )
    let update: { path: string; fingerprint: string } | undefined
    if (change.action === 'update') {
      const path = `${workspace.path}/${kind}/${change.entityPath.split('/').at(-1)}`
      const current = await call(() => api.getGtmEntity(token, path, kind))
      if (current.fingerprint !== change.expectedFingerprint)
        throw new Error('GTM isolated entity drift')
      assertManagedGtmUpdate(current, body)
      update = { path, fingerprint: change.expectedFingerprint }
    }
    const saved = await write(() =>
      api.writeGtmEntity(token, workspace.path, kind, body, update)
    )
    if (
      !saved.path ||
      !saved.fingerprint ||
      !saved.path.startsWith(`${workspace.path}/${kind}/`)
    )
      throw new Error('Invalid GTM entity receipt')
    api.assertGtmEntityPath(saved.path, kind)
    const actual = await call(() => api.getGtmEntity(token, saved.path!, kind))
    if (actual.path !== saved.path || actual.fingerprint !== saved.fingerprint)
      throw new Error('GTM entity read-back identity mismatch')
    const additions = verifyGtmManagedEntity(body, actual)
    managed.push({
      action: change.action,
      kind,
      id: saved.path.split('/').at(-1),
      body,
      providerAdditions: additions
    })
  }
  const status = await call(() =>
    api.getGtmWorkspaceStatus(token, workspace.path)
  )
  if (status.mergeConflict?.length) throw new Error('GTM merge conflict')
  const preview = await call(() =>
    api.quickPreviewGtmWorkspace(token, workspace.path)
  )
  if (
    preview.compilerError ||
    preview.syncStatus?.mergeConflict ||
    preview.syncStatus?.syncError ||
    !preview.containerVersion
  )
    throw new Error('GTM compile failed')
  assertGtmOnlyManagedChanges(base, preview.containerVersion, managed)
  const version = await write(() =>
    api.createGtmVersion(token, workspace.path, { name })
  )
  if (
    version.compilerError ||
    version.syncStatus?.mergeConflict ||
    version.syncStatus?.syncError ||
    !version.containerVersion?.path ||
    !version.containerVersion.fingerprint
  )
    throw new Error('Invalid GTM version receipt')
  const exact = await call(() =>
    api.getGtmVersion(token, version.containerVersion!.path)
  )
  assertGtmOnlyManagedChanges(base, exact, managed)
  verifyGtmVersion(managed, exact, container)
  if (exact.fingerprint !== version.containerVersion.fingerprint)
    throw new Error('GTM version drift')
  return {
    versionPath: exact.path,
    versionFingerprint: exact.fingerprint,
    managed,
    workspacePath: workspace.path
  }
}
export function verifyGtmVersion(
  managed: any[],
  version: api.GtmContainerVersion,
  container: string
) {
  api.assertGtmVersionPath(version.path)
  if (!version.path.startsWith(`${container}/versions/`))
    throw new Error('Cross-container version')
  for (const item of managed) {
    const field = item.kind.slice(0, -1)
    const entity = ((version as any)[field] ?? []).find(
      (e: any) => e[`${field}Id`] === item.id
    )
    if (!entity) throw new Error('Managed GTM entity missing from version')
    verifyGtmManagedEntity(item.body, entity)
  }
}

/** A newly created workspace can inherit a non-live base. Never publish those unrelated changes. */
export function assertGtmOnlyManagedChanges(
  base: api.GtmContainerVersion,
  version: api.GtmContainerVersion,
  managed: any[]
) {
  const clean = (entity: any) =>
    Object.fromEntries(
      Object.entries(entity).filter(
        ([key]) =>
          ![
            'path',
            'accountId',
            'containerId',
            'workspaceId',
            'fingerprint',
            'tagManagerUrl'
          ].includes(key)
      )
    )
  const collectionFields = new Set([
    'tag',
    'trigger',
    'variable',
    'folder',
    'builtInVariable',
    'gtagConfig',
    'customTemplate',
    'zone',
    'client',
    'transformation',
    ...Object.keys(base).filter((key) => Array.isArray((base as any)[key])),
    ...Object.keys(version).filter((key) =>
      Array.isArray((version as any)[key])
    )
  ])
  for (const field of collectionFields) {
    const before: any[] = (base as any)[field] ?? [],
      after: any[] = (version as any)[field] ?? []
    const key = field === 'customTemplate' ? 'templateId' : `${field}Id`
    const relevant = managed.filter((m) => m.kind.slice(0, -1) === field)
    const untouchedBefore = before.filter(
      (e) => !relevant.some((m) => m.id === e[key])
    )
    const untouchedAfter = after.filter(
      (e) => !relevant.some((m) => m.id === e[key])
    )
    const order = (rows: any[]) =>
      rows.map(clean).sort((a, b) => gtmHash(a).localeCompare(gtmHash(b)))
    if (gtmHash(order(untouchedBefore)) !== gtmHash(order(untouchedAfter)))
      throw new Error('Unreviewed changes in isolated GTM version')
    for (const item of relevant) {
      const existed = before.some((e) => e[key] === item.id)
      if (
        (item.action === 'create' && existed) ||
        (item.action === 'update' && !existed)
      )
        throw new Error('GTM managed identity changed')
    }
  }
}
