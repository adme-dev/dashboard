import { canonicalCodeJson, codeSha256 } from '../../shared/pageStudio/codeContent'

const scope = { tenantId: 'fixture', clientId: '22222222-2222-4222-8222-222222222222', siteId: '11111111-1111-4111-8111-111111111111' }
const userId = '33333333-3333-4333-8333-333333333333'
const createdAt = '2026-11-05T00:00:00.000Z'
export async function codeFixture(options: { scope?: typeof scope, userId?: string, checkpointId?: string, expectedCheckpointId?: string, operationId?: string, pageCount?: number } = {}) {
  const destination = options.scope ?? scope
  const actor = options.userId ?? userId
  const checkpointId = options.checkpointId ?? 'imported'
  const base = options.expectedCheckpointId ?? 'base'
  const operationId = options.operationId ?? 'import_1'

  const bytes = new TextEncoder().encode('<!doctype html><h1>Imported</h1>')
  const sha256 = await codeSha256(bytes)
  const pages = Array.from({ length: options.pageCount ?? 1 }, (_, index) => ({ route: index ? `/page-${index}` : '/kia', file: index ? `page-${index}/index.html` : 'kia/index.html', bytes: bytes.length, sha256, sourceUrl: 'https://example.com/kia' }))
  const inventory = { format: 'xeroflow-code-page-source-export', schemaVersion: 1, sourceCheckpointId: 'source',
    pages, resources: [] }
  const review = { policy: 'reviewed-inline-static-css-v1', inventoryDigest: await codeSha256(canonicalCodeJson(inventory)), reviewId: 'fixture-review', evidenceSha256: 'b'.repeat(64), pages: pages.map(page => ({ file: page.file, sha256, scripts: [], dataAttributes: [], dynamicResources: [], externalNavigations: [], requiredIds: [] })) }
  const content = { format: 'xeroflow-code-page-content-package', schemaVersion: 1, inventory,
    inventoryDigest: await codeSha256(canonicalCodeJson(inventory)), rootRedirect: { from: '/', to: '/kia' },
    inspection: { policy: 'reviewed-inline-static-css-v1', candidateDigest: 'a'.repeat(64), reviewDigest: await codeSha256(canonicalCodeJson(review)) } }
  const contentDigest = await codeSha256(canonicalCodeJson(content))
  const operation = { actorId: actor, checkpointId, contentDigest, createdAt, expectedCheckpointId: base, operationId }
  const index = { schemaVersion: 2, checkpointId, previousCheckpointId: base, parentIndexId: null,
    rootRedirect: content.rootRedirect, pages: Object.fromEntries(pages.map(page => [page.route, { htmlDigest: sha256, savedAt: createdAt, sourceUrl: inventory.pages[0]!.sourceUrl,
      origin: { kind: 'content-package', operationId: operation.operationId, packageDigest: contentDigest, sourceRoute: page.route },
      resources: { kind: 'content-package', packageDigest: contentDigest } }])) }
  const indexDigest = await codeSha256(canonicalCodeJson(index))
  const codeContent = { formatVersion: 1 as const, kind: 'code-pages' as const, operationId: operation.operationId, indexDigest, contentDigest }
  const manifest = { id: destination.siteId, pages: [{ id: 'old-typed-page' }] }
  const digest = await codeSha256(canonicalCodeJson(manifest))
  const envelope = { schemaVersion: 2, checkpointId, createdAt, digest, manifest, scope: destination, userId: actor, codeContent }
  const prefix = `tenants/${destination.tenantId}/clients/${destination.clientId}/sites/${destination.siteId}`
  const input = { checkpoint: { checkpointId, createdAt, digest, etag: 'etag', objectKey: `${prefix}/checkpoints/${checkpointId}.json`, scope: destination, userId: actor, codeContent }, expectedCheckpointId: base }
  const objects = new Map<string, Uint8Array>()
  const set = (key: string, value: unknown) => objects.set(key, new TextEncoder().encode(canonicalCodeJson(value)))
  set(input.checkpoint.objectKey, envelope)
  set(`platform/code-page-import-reviews/v1/${contentDigest}.json`, { schemaVersion: 1, scope: destination, contentDigest, policy: 'reviewed-inline-static-css-v1', review })
  set(`${prefix}/code-pages/imports/v1/${operationId}/intent.json`, { operation, schemaVersion: 1, scope: destination })
  set(`${prefix}/code-pages/imports/v1/${operationId}/prepared.json`, { operation, schemaVersion: 1, scope: destination, contentDigest, indexDigest })
  set(`${prefix}/code-pages/imports/v1/${operationId}/index.json`, index)
  set(`${prefix}/code-pages/packages/v1/${contentDigest}/manifest.json`, content)
  const fileKey = `${prefix}/code-pages/packages/v1/${contentDigest}/files/${await codeSha256('kia/index.html')}`
  for (const page of pages) objects.set(`${prefix}/code-pages/packages/v1/${contentDigest}/files/${await codeSha256(page.file)}`, bytes)
  const bucket = { get: async (key: string) => {
    const value = objects.get(key)
    return value ? { size: value.length, body: new Response(value).body! } : null
  } }
  return { input, objects, bucket, envelope, index, operation, content, set, prefix, fileKey }
}
