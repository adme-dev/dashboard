import { createRequire } from 'node:module'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { CmsFreezeReceiptSchema, CmsPreparationSchema, CmsPreparationReceiptSchema, contentScopeKey } from '../../shared/pageStudio/cmsManaged'
import { collectionCanonical, collectionDigest } from '../../shared/pageStudio/collectionApi'

/** Actual local D1 store, initialized with an already accepted fixture's exact
 * immutable schema preparation. Restart keeps only its owned persisted files. */
export async function createPublicCmsFixture(root: string, rawFreeze: unknown, rawOperation: { request: unknown, receipt: unknown }) {
  const freeze = CmsFreezeReceiptSchema.parse(rawFreeze)
  const preparation = CmsPreparationSchema.parse(rawOperation.request)
  const receipt = CmsPreparationReceiptSchema.parse(rawOperation.receipt)
  const directory = mkdtempSync(join(tmpdir(), 'public-cms-connected-'))
  const studioRequire = createRequire(join(root, 'services/business-content-worker/package.json'))
  const wranglerRequire = createRequire(studioRequire.resolve('wrangler/package.json'))
  const { build } = wranglerRequire('esbuild')
  const { Miniflare, convertV4MiniflareOptions } = wranglerRequire('miniflare')
  const output = join(directory, 'store.mjs')
  type Store = { prepare(input: unknown): Promise<unknown>, readOperation(input: unknown): Promise<unknown>, readObjects(input: unknown): Promise<unknown>, readFreeze(input: unknown): Promise<unknown> }
  let physical: { ready: Promise<unknown>, dispose(): Promise<void>, getD1Database(name: string): Promise<{ exec(sql: string): Promise<unknown>, prepare(sql: string): { bind(...args: unknown[]): { run(): Promise<unknown> } }, withSession(name: string): unknown }> }
  let store: Store
  async function start(initialize: boolean) {
    physical = new Miniflare(convertV4MiniflareOptions({ cf: false, host: '127.0.0.1', port: 0, compatibilityDate: '2026-08-18', modules: true,
      d1Databases: { DB: 'public-connected' }, resourcePersistencePath: join(directory, 'd1'),
      script: 'export default {fetch(){return new Response("private fixture")}}', telemetry: { enabled: false } }))
    await physical.ready
    const db = await physical.getD1Database('DB')
    if (initialize) {
      for (const migration of ['migrations/0001_content_revisions.sql', 'builder-migrations/0001_collection_versions.sql', 'staging-migrations/0001_collection_proposals.sql', 'managed-migrations/0001_cms_preparation.sql']) {
        await db.exec(readFileSync(join(root, 'services/business-content-worker', migration), 'utf8').replace(/--[^\n]*/g, '').trim().replace(/\s+/g, ' '))
      }
      const key = contentScopeKey(preparation.scope), { digest, ...freezeBody } = freeze
      await db.prepare('INSERT INTO builder_cms_cutovers(scope_key,adoption_id,request_digest,payload,digest) VALUES(?,?,?,?,?)')
        .bind(key, freeze.request.adoptionId, await collectionDigest(freeze.request), collectionCanonical(freezeBody), digest).run()
      await db.prepare('INSERT INTO builder_cms_preparations(scope_key,operation_id,freeze_digest,request_digest,request,receipt) VALUES(?,?,?,?,?,?)')
        .bind(key, preparation.operationId, preparation.freezeDigest, receipt.requestDigest, collectionCanonical(preparation), collectionCanonical(receipt)).run()
      for (let index = 0; index < preparation.items.length; index++) {
        const item = preparation.items[index]!, pin = receipt.items[index]!
        await db.prepare('INSERT INTO builder_cms_prepared_objects(scope_key,operation_id,kind,collection_id,record_id,version,payload,digest,bytes) VALUES(?,?,?,?,?,?,?,?,?)')
          .bind(key, preparation.operationId, pin.kind, pin.collectionId, pin.recordId, pin.version, collectionCanonical(item.body), pin.sha256, pin.bytes).run()
      }
    }
    const module = await import(/* @vite-ignore */ pathToFileURL(output).href)
    store = new module.ManagedCmsStore(db.withSession('first-primary'), preparation.scope, freeze.request.target)
  }
  const dispose = async () => {
    try {
      await physical?.dispose()
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  }
  try {
    await build({ stdin: { contents: `export {ManagedCmsStore} from ${JSON.stringify(join(root, 'services/business-content-worker/src/cms-managed-store.ts'))};`, resolveDir: root, loader: 'ts' },
      bundle: true, platform: 'node', format: 'esm', outfile: output, alias: { '@xeroflow/protocol': join(root, 'packages/protocol/src/index.ts') } })
    await start(true)
    return {
      router: {
        readManagedCmsTarget: async () => freeze.request.target,
        prepareManagedCmsOperation: (input: unknown) => store.prepare(input),
        readManagedCmsOperation: (input: unknown) => store.readOperation(input),
        readManagedCmsObjects: (input: unknown) => store.readObjects(input),
        readManagedCmsFreeze: (input: unknown) => store.readFreeze(input)
      },
      restart: async () => {
        await physical.dispose()
        await start(false)
      },
      dispose
    }
  } catch (error) {
    await dispose()
    throw error
  }
}
