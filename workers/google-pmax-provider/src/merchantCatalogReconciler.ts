import { z } from 'zod'
import {
  createGoogleMerchantVehicleClient,
  GoogleMerchantVehicleCatalogError,
  planGoogleMerchantVehicleReconciliation,
  type GoogleMerchantVehicleConfig,
  type GoogleMerchantVehicleProcessedProduct,
  type GoogleMerchantVehicleProduct,
  type GoogleMerchantVehicleProductInput,
  type GoogleMerchantVehiclePublication
} from '../../../server/utils/googleMerchantVehicleCatalog'
import { queryRows, withTransaction } from './db'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DATA_SOURCE = /^accounts\/(\d+)\/dataSources\/\d+$/

const RequestSchema = z.strictObject({
  tenantId: z.string().min(1).max(255),
  clientId: z.string().regex(UUID),
  sourceId: z.string().regex(UUID),
  connection: z.strictObject({
    id: z.string().regex(UUID),
    clientId: z.string().regex(UUID),
    status: z.literal('active'),
    customerId: z.string().regex(/^\d{10}$/),
    accessToken: z.string().min(1),
    developerToken: z.string().min(1),
    loginCustomerId: z.string().optional()
  })
})

interface CatalogScope {
  source: {
    id: string
    clientId: string
    displayName: string
    connectionConfig: Record<string, unknown>
  }
  products: GoogleMerchantVehicleProduct[]
  publications: GoogleMerchantVehiclePublication[]
}

interface ReconcileItemResult {
  productId: string
  offerId: string
  action: 'PUBLISH' | 'DELETE'
  ok: boolean
  requestId: string | null
  productInputName: string | null
  processedProductName: string | null
  errorCode: string | null
  payloadHash: string
}

interface PublicationReadbackResult {
  productId: string
  offerId: string
  dataSource: string
  state: 'SUBMITTED' | 'PROCESSED' | 'DISAPPROVED' | 'DELETION_SUBMITTED' | 'DELETED'
  processedProductName: string | null
  issues: Array<Record<string, unknown>>
  lastErrorCode: string | null
}

interface Repository {
  loadScope(input: z.infer<typeof RequestSchema>): Promise<CatalogScope>
  setDataSource(sourceId: string, clientId: string, dataSource: string): Promise<void>
  beginRun(input: {
    tenantId: string
    clientId: string
    sourceId: string
    merchantAccountId: string
    dataSource: string
    sourceItemCount: number
    publish: Array<{ productId: string, offerId: string, productInput: GoogleMerchantVehicleProductInput, payloadHash: string }>
    deletes: Array<{ productId: string, offerId: string, payloadHash: string }>
    exclusionSummary: Record<string, number>
  }): Promise<string>
  finishRun(runId: string, results: ReconcileItemResult[]): Promise<void>
  verifyPublications?(results: PublicationReadbackResult[]): Promise<void>
}

type MerchantClient = ReturnType<typeof createGoogleMerchantVehicleClient>

interface ReconcilerDependencies {
  repository: Repository
  createClient?: typeof createGoogleMerchantVehicleClient
}

export class MerchantCatalogReconcileError extends Error {
  constructor(public readonly code:
    | 'MERCHANT_CATALOG_SCOPE_INVALID'
    | 'MERCHANT_CATALOG_CONFIG_INVALID'
    | 'MERCHANT_CATALOG_SOURCE_AMBIGUOUS'
    | 'MERCHANT_CATALOG_APPLY_FAILED') {
    super(code)
    this.name = 'MerchantCatalogReconcileError'
  }
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function merchantConfig(scope: CatalogScope, request: z.infer<typeof RequestSchema>) {
  const merchant = object(scope.source.connectionConfig.merchant)
  const accountId = text(merchant?.account_id)
  const dataSource = text(merchant?.data_source)
  const displayName = text(merchant?.api_source_display_name)
  const feedLabel = text(merchant?.feed_label)
  const contentLanguage = text(merchant?.content_language)
  const storeCode = text(merchant?.store_code)
  const developerEmail = text(merchant?.developer_email)
  if (
    scope.source.id !== request.sourceId
    || scope.source.clientId !== request.clientId
    || request.connection.clientId !== request.clientId
    || text(merchant?.tenant_id) !== request.tenantId
    || text(merchant?.ads_connection_id) !== request.connection.id
    || text(merchant?.ads_customer_id) !== request.connection.customerId
    || !accountId
    || !DATA_SOURCE.test(dataSource)
    || DATA_SOURCE.exec(dataSource)?.[1] !== accountId
    || !displayName || !feedLabel || !contentLanguage || !storeCode
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(developerEmail)
    || merchant?.auto_publish !== true
  ) throw new MerchantCatalogReconcileError('MERCHANT_CATALOG_CONFIG_INVALID')
  return { accountId, dataSource, displayName, feedLabel, contentLanguage, storeCode, developerEmail }
}

function compatibleApiSource(source: Awaited<ReturnType<MerchantClient['getDataSource']>>, input: {
  displayName: string
  feedLabel: string
  contentLanguage: string
}) {
  const primary = source.primaryProductDataSource
  return source.writableByApi
    && source.displayName === input.displayName
    && primary?.legacyLocal === true
    && primary.feedLabel === input.feedLabel
    && primary.contentLanguage === input.contentLanguage
    && (primary.countries || []).includes('AU')
    && (primary.destinations || []).some(item => (
      item.destination === 'VEHICLE_ADS' && item.state === 'ENABLED'
    ))
}

async function resolveApiSource(client: MerchantClient, input: {
  accountId: string
  currentDataSource: string
  displayName: string
  feedLabel: string
  contentLanguage: string
}) {
  const current = await client.getDataSource(input.currentDataSource)
  if (compatibleApiSource(current, input)) return current.name
  const matches = (await client.listDataSources(input.accountId))
    .filter(source => compatibleApiSource(source, input))
  if (matches.length > 1) {
    throw new MerchantCatalogReconcileError('MERCHANT_CATALOG_SOURCE_AMBIGUOUS')
  }
  if (matches[0]) return matches[0].name
  const created = await client.createVehicleDataSource({
    merchantAccountId: input.accountId,
    displayName: input.displayName,
    feedLabel: input.feedLabel,
    contentLanguage: input.contentLanguage
  })
  if (!compatibleApiSource(created, input)) {
    throw new MerchantCatalogReconcileError('MERCHANT_CATALOG_CONFIG_INVALID')
  }
  return created.name
}

async function sha256(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

async function concurrentMap<T, R>(items: T[], concurrency: number, callback: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length)
  let cursor = 0
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await callback(items[index]!)
    }
  }))
  return results
}

function safeErrorCode(error: unknown): string {
  const code = object(error)?.code
  return typeof code === 'string' && /^[A-Z0-9_]{1,120}$/.test(code)
    ? code
    : 'MERCHANT_VEHICLE_REQUEST_FAILED'
}

export function createMerchantCatalogReconciler(dependencies: ReconcilerDependencies) {
  return async (raw: unknown) => {
    const request = RequestSchema.safeParse(raw)
    if (!request.success) throw new MerchantCatalogReconcileError('MERCHANT_CATALOG_SCOPE_INVALID')
    const scope = await dependencies.repository.loadScope(request.data)
    const merchant = merchantConfig(scope, request.data)
    const client = (dependencies.createClient || createGoogleMerchantVehicleClient)({
      accessToken: request.data.connection.accessToken
    })
    const sourceInput = {
      accountId: merchant.accountId,
      currentDataSource: merchant.dataSource,
      displayName: merchant.displayName,
      feedLabel: merchant.feedLabel,
      contentLanguage: merchant.contentLanguage
    }
    let dataSource: string
    try {
      dataSource = await resolveApiSource(client, sourceInput)
    } catch (error) {
      if (!(error instanceof GoogleMerchantVehicleCatalogError) || error.httpStatus !== 401) throw error
      await client.registerDeveloper({
        merchantAccountId: merchant.accountId,
        developerEmail: merchant.developerEmail
      })
      dataSource = await resolveApiSource(client, sourceInput)
    }
    if (dataSource !== merchant.dataSource) {
      await dependencies.repository.setDataSource(request.data.sourceId, request.data.clientId, dataSource)
    }
    const config: GoogleMerchantVehicleConfig = {
      merchantAccountId: merchant.accountId,
      dataSource,
      feedLabel: merchant.feedLabel,
      contentLanguage: merchant.contentLanguage,
      storeCode: merchant.storeCode
    }
    const plan = planGoogleMerchantVehicleReconciliation({
      products: scope.products,
      publications: scope.publications.filter(publication => (
        !publication.merchantDataSource || publication.merchantDataSource === dataSource
      )),
      config
    })
    const publish = await Promise.all(plan.publish.map(async item => ({
      ...item,
      payloadHash: await sha256(item.productInput)
    })))
    const deletes = await Promise.all(plan.delete.map(async item => ({
      ...item,
      payloadHash: await sha256({ dataSource, offerId: item.offerId, action: 'DELETE' })
    })))
    const exclusionSummary = plan.excluded.reduce<Record<string, number>>((summary, item) => {
      summary[item.reason] = (summary[item.reason] || 0) + 1
      return summary
    }, {})
    const runId = await dependencies.repository.beginRun({
      tenantId: request.data.tenantId,
      clientId: request.data.clientId,
      sourceId: request.data.sourceId,
      merchantAccountId: merchant.accountId,
      dataSource,
      sourceItemCount: scope.products.length,
      publish,
      deletes,
      exclusionSummary
    })
    const operations = [
      ...publish.map(item => ({ action: 'PUBLISH' as const, ...item })),
      ...deletes.map(item => ({ action: 'DELETE' as const, ...item }))
    ]
    const results = await concurrentMap(operations, 8, async (item): Promise<ReconcileItemResult> => {
      try {
        if (item.action === 'PUBLISH') {
          const response = await client.insertProduct({
            merchantAccountId: merchant.accountId,
            dataSource,
            productInput: item.productInput
          })
          return {
            productId: item.productId, offerId: item.offerId, action: item.action,
            ok: true, requestId: response.requestId,
            productInputName: response.name, processedProductName: response.product,
            errorCode: null, payloadHash: item.payloadHash
          }
        }
        const response = await client.deleteProduct({
          merchantAccountId: merchant.accountId,
          dataSource,
          contentLanguage: merchant.contentLanguage,
          feedLabel: merchant.feedLabel,
          offerId: item.offerId
        })
        return {
          productId: item.productId, offerId: item.offerId, action: item.action,
          ok: true, requestId: response.requestId, productInputName: null,
          processedProductName: null, errorCode: null, payloadHash: item.payloadHash
        }
      } catch (error) {
        return {
          productId: item.productId, offerId: item.offerId, action: item.action,
          ok: false, requestId: null, productInputName: null,
          processedProductName: null, errorCode: safeErrorCode(error), payloadHash: item.payloadHash
        }
      }
    })
    await dependencies.repository.finishRun(runId, results)
    const failed = results.filter(item => !item.ok).length
    const result = {
      runId,
      merchantAccountId: merchant.accountId,
      dataSource,
      sourceItemCount: scope.products.length,
      publishCount: publish.length,
      deleteCount: deletes.length,
      excludedCount: plan.excluded.length,
      exclusionSummary,
      succeededCount: results.length - failed,
      failedCount: failed,
      processingState: 'SUBMITTED_AWAITING_GOOGLE_READBACK' as const
    }
    if (failed) throw new MerchantCatalogReconcileError('MERCHANT_CATALOG_APPLY_FAILED')
    return result
  }
}

function relevantVehicleIssues(product: GoogleMerchantVehicleProcessedProduct | undefined) {
  return (product?.productStatus?.itemLevelIssues || [])
    .filter(issue => (
      (!issue.reportingContext || issue.reportingContext === 'VEHICLE_INVENTORY_ADS')
      && (!issue.applicableCountries.length || issue.applicableCountries.includes('AU'))
    ))
    .map(issue => ({
      code: issue.code.slice(0, 160),
      ...(issue.severity ? { severity: issue.severity.slice(0, 40) } : {}),
      ...(issue.resolution ? { resolution: issue.resolution.slice(0, 160) } : {}),
      ...(issue.attribute ? { attribute: issue.attribute.slice(0, 160) } : {}),
      ...(issue.reportingContext ? { reportingContext: issue.reportingContext.slice(0, 80) } : {}),
      ...(issue.description ? { description: issue.description.slice(0, 1000) } : {}),
      ...(issue.detail ? { detail: issue.detail.slice(0, 4000) } : {}),
      ...(issue.documentation ? { documentation: issue.documentation.slice(0, 2000) } : {}),
      applicableCountries: issue.applicableCountries.slice(0, 100)
    }))
}

function readbackResult(
  publication: GoogleMerchantVehiclePublication,
  dataSource: string,
  product: GoogleMerchantVehicleProcessedProduct | undefined
): PublicationReadbackResult {
  if (publication.state === 'DELETION_SUBMITTED') {
    return {
      productId: publication.productId,
      offerId: publication.offerId,
      dataSource,
      state: product ? 'DELETION_SUBMITTED' : 'DELETED',
      processedProductName: product?.name || null,
      issues: relevantVehicleIssues(product),
      lastErrorCode: null
    }
  }
  const destination = product?.productStatus?.destinationStatuses.find(status => (
    status.reportingContext === 'VEHICLE_INVENTORY_ADS'
  ))
  const issues = relevantVehicleIssues(product)
  const disapproved = destination?.disapprovedCountries?.includes('AU') === true
  const approved = destination?.approvedCountries?.includes('AU') === true
  const state = disapproved ? 'DISAPPROVED' : approved ? 'PROCESSED' : 'SUBMITTED'
  const firstError = issues.find(issue => issue.severity === 'ERROR')
  return {
    productId: publication.productId,
    offerId: publication.offerId,
    dataSource,
    state,
    processedProductName: product?.name || null,
    issues,
    lastErrorCode: state === 'DISAPPROVED' && typeof firstError?.code === 'string'
      ? firstError.code
      : null
  }
}

export function createMerchantCatalogReadback(dependencies: ReconcilerDependencies) {
  return async (raw: unknown) => {
    const request = RequestSchema.safeParse(raw)
    if (!request.success) throw new MerchantCatalogReconcileError('MERCHANT_CATALOG_SCOPE_INVALID')
    if (!dependencies.repository.verifyPublications) {
      throw new MerchantCatalogReconcileError('MERCHANT_CATALOG_CONFIG_INVALID')
    }
    const scope = await dependencies.repository.loadScope(request.data)
    const merchant = merchantConfig(scope, request.data)
    const client = (dependencies.createClient || createGoogleMerchantVehicleClient)({
      accessToken: request.data.connection.accessToken
    })
    const products = (await client.listProducts(merchant.accountId))
      .filter(product => product.dataSource === merchant.dataSource)
    const productsByOfferId = new Map(products.map(product => [product.offerId, product]))
    const publications = scope.publications.filter(publication => (
      publication.state !== 'DELETED'
      && (!publication.merchantDataSource || publication.merchantDataSource === merchant.dataSource)
    ))
    const results = publications.map(publication => readbackResult(
      publication,
      merchant.dataSource,
      productsByOfferId.get(publication.offerId)
    ))
    await dependencies.repository.verifyPublications(results)
    const processedCount = results.filter(result => result.state === 'PROCESSED').length
    const disapprovedCount = results.filter(result => result.state === 'DISAPPROVED').length
    const deletedCount = results.filter(result => result.state === 'DELETED').length
    const deletionPendingCount = results.filter(result => result.state === 'DELETION_SUBMITTED').length
    const pendingCount = results.filter(result => (
      result.state === 'SUBMITTED' || result.state === 'DELETION_SUBMITTED'
    )).length
    return {
      merchantAccountId: merchant.accountId,
      dataSource: merchant.dataSource,
      publicationCount: results.length,
      processedCount,
      disapprovedCount,
      deletedCount,
      deletionPendingCount,
      pendingCount,
      processingState: pendingCount
        ? 'GOOGLE_READBACK_PARTIAL' as const
        : 'GOOGLE_READBACK_COMPLETE' as const
    }
  }
}

function productionRepository(connectionString: string): Repository {
  return {
    async loadScope(input) {
      const sourceRows = await queryRows(connectionString, `
        SELECT id, client_id, display_name, connection_config
          FROM crm_catalog_sources
         WHERE id = $1::uuid AND client_id = $2::uuid AND status = 'active'
         LIMIT 1
      `, [input.sourceId, input.clientId]) as Array<Record<string, unknown>>
      const source = sourceRows[0]
      if (!source) throw new MerchantCatalogReconcileError('MERCHANT_CATALOG_SCOPE_INVALID')
      const [productRows, publicationRows] = await Promise.all([
        queryRows(connectionString, `
          SELECT id, source_product_id, stock_id, name, price, currency,
                 product_url, primary_image_url, availability, attributes
            FROM crm_products
           WHERE client_id = $1::uuid
             AND catalog_source_id = $2::uuid
             AND deleted_at IS NULL
           ORDER BY source_product_id
        `, [input.clientId, input.sourceId]),
        queryRows(connectionString, `
          SELECT product_id, offer_id, state, merchant_data_source
            FROM google_merchant_product_publications
           WHERE client_id = $1::uuid AND catalog_source_id = $2::uuid
        `, [input.clientId, input.sourceId])
      ]) as [Array<Record<string, unknown>>, Array<Record<string, unknown>>]
      return {
        source: {
          id: String(source.id), clientId: String(source.client_id),
          displayName: String(source.display_name),
          connectionConfig: object(source.connection_config) || {}
        },
        products: productRows.map(row => ({
          id: String(row.id), sourceProductId: String(row.source_product_id),
          stockId: String(row.stock_id || ''), name: String(row.name),
          price: String(row.price || ''), currency: String(row.currency || ''),
          productUrl: String(row.product_url || ''), primaryImageUrl: String(row.primary_image_url || ''),
          availability: String(row.availability || ''), attributes: object(row.attributes) || {}
        })),
        publications: publicationRows.map(row => ({
          productId: String(row.product_id), offerId: String(row.offer_id), state: String(row.state),
          merchantDataSource: String(row.merchant_data_source)
        }))
      }
    },
    async setDataSource(sourceId, clientId, dataSource) {
      const rows = await queryRows(connectionString, `
        UPDATE crm_catalog_sources
           SET connection_config = jsonb_set(connection_config, '{merchant,data_source}', to_jsonb($3::text), true),
               updated_at = NOW()
         WHERE id = $1::uuid AND client_id = $2::uuid
         RETURNING id
      `, [sourceId, clientId, dataSource])
      if (rows.length !== 1) throw new MerchantCatalogReconcileError('MERCHANT_CATALOG_SCOPE_INVALID')
    },
    async beginRun(input) {
      return await withTransaction(connectionString, async (db) => {
        const run = (await db.query(`
          INSERT INTO google_merchant_catalog_runs (
            tenant_id, client_id, catalog_source_id, merchant_account_id, merchant_data_source,
            status, source_item_count, publish_item_count, delete_item_count,
            excluded_item_count, exclusion_summary
          ) VALUES ($1, $2::uuid, $3::uuid, $4, $5, 'APPLYING', $6, $7, $8, $9, $10::jsonb)
          RETURNING id
        `, [input.tenantId, input.clientId, input.sourceId, input.merchantAccountId, input.dataSource,
          input.sourceItemCount, input.publish.length, input.deletes.length,
          Object.values(input.exclusionSummary).reduce((sum, count) => sum + count, 0),
          JSON.stringify(input.exclusionSummary)])).rows[0]
        const runId = String(run?.id || '')
        const items = [
          ...input.publish.map(item => ({
            product_id: item.productId, action: 'PUBLISH', offer_id: item.offerId,
            product_input: item.productInput, payload_hash: item.payloadHash
          })),
          ...input.deletes.map(item => ({
            product_id: item.productId, action: 'DELETE', offer_id: item.offerId,
            product_input: {}, payload_hash: item.payloadHash
          }))
        ]
        if (items.length) {
          await db.query(`
            INSERT INTO google_merchant_catalog_run_items (
              run_id, product_id, action, offer_id, product_input, payload_hash, status, started_at
            )
            SELECT $1::uuid, item.product_id, item.action, item.offer_id,
                   item.product_input, item.payload_hash, 'RUNNING', NOW()
              FROM jsonb_to_recordset($2::jsonb) AS item(
                product_id UUID, action TEXT, offer_id TEXT, product_input JSONB, payload_hash TEXT
              )
          `, [runId, JSON.stringify(items)])
        }
        return runId
      })
    },
    async finishRun(runId, results) {
      await withTransaction(connectionString, async (db) => {
        if (results.length) {
          await db.query(`
            UPDATE google_merchant_catalog_run_items item
               SET status = CASE WHEN result.ok THEN 'SUCCEEDED' ELSE 'FAILED' END,
                   attempt_count = item.attempt_count + 1,
                   request_id = result.request_id,
                   product_input_name = result.product_input_name,
                   processed_product_name = result.processed_product_name,
                   error_code = result.error_code,
                   completed_at = NOW(), updated_at = NOW()
              FROM jsonb_to_recordset($2::jsonb) AS result(
                product_id UUID, action TEXT, ok BOOLEAN, request_id TEXT,
                product_input_name TEXT, processed_product_name TEXT, error_code TEXT
              )
             WHERE item.run_id = $1::uuid
               AND item.product_id = result.product_id
               AND item.action = result.action
          `, [runId, JSON.stringify(results.map(result => ({
            product_id: result.productId, action: result.action, ok: result.ok,
            request_id: result.requestId, product_input_name: result.productInputName,
            processed_product_name: result.processedProductName, error_code: result.errorCode
          })))])
          const publishes = results.filter(result => result.ok && result.action === 'PUBLISH')
          if (publishes.length) {
            await db.query(`
              INSERT INTO google_merchant_product_publications (
                client_id, catalog_source_id, product_id, merchant_account_id,
                merchant_data_source, offer_id, product_input_name, processed_product_name,
                payload_hash, state, last_submitted_at
              )
              SELECT run.client_id, run.catalog_source_id, result.product_id,
                     run.merchant_account_id, run.merchant_data_source, result.offer_id,
                     result.product_input_name, result.processed_product_name,
                     result.payload_hash, 'SUBMITTED', NOW()
                FROM google_merchant_catalog_runs run
                CROSS JOIN jsonb_to_recordset($2::jsonb) AS result(
                  product_id UUID, offer_id TEXT, product_input_name TEXT,
                  processed_product_name TEXT, payload_hash TEXT
                )
               WHERE run.id = $1::uuid
              ON CONFLICT (catalog_source_id, product_id, merchant_data_source)
              DO UPDATE SET offer_id = EXCLUDED.offer_id,
                            product_input_name = EXCLUDED.product_input_name,
                            processed_product_name = EXCLUDED.processed_product_name,
                            payload_hash = EXCLUDED.payload_hash,
                            state = 'SUBMITTED', issues = '[]'::jsonb,
                            last_error_code = NULL, last_submitted_at = NOW(),
                            deleted_at = NULL, updated_at = NOW()
            `, [runId, JSON.stringify(publishes.map(result => ({
              product_id: result.productId, offer_id: result.offerId,
              product_input_name: result.productInputName,
              processed_product_name: result.processedProductName, payload_hash: result.payloadHash
            })))])
          }
          const deletes = results.filter(result => result.ok && result.action === 'DELETE')
          if (deletes.length) {
            await db.query(`
              UPDATE google_merchant_product_publications publication
                 SET state = 'DELETION_SUBMITTED', deleted_at = NULL,
                     last_error_code = NULL, updated_at = NOW()
                FROM jsonb_to_recordset($2::jsonb) AS result(product_id UUID, offer_id TEXT)
               WHERE publication.catalog_source_id = (
                       SELECT catalog_source_id FROM google_merchant_catalog_runs WHERE id = $1::uuid
                     )
                 AND publication.product_id = result.product_id
                 AND publication.offer_id = result.offer_id
                 AND publication.merchant_data_source = (
                       SELECT merchant_data_source FROM google_merchant_catalog_runs WHERE id = $1::uuid
                     )
            `, [runId, JSON.stringify(deletes.map(result => ({
              product_id: result.productId, offer_id: result.offerId
            })))])
          }
        }
        const failed = results.filter(result => !result.ok).length
        await db.query(`
          UPDATE google_merchant_catalog_runs
             SET status = $2,
                 succeeded_item_count = $3,
                 failed_item_count = $4,
                 error_code = CASE WHEN $4::int > 0 THEN 'MERCHANT_CATALOG_APPLY_FAILED' END,
                 completed_at = NOW(), updated_at = NOW()
           WHERE id = $1::uuid
        `, [runId, failed ? 'FAILED' : 'SUCCEEDED', results.length - failed, failed])
      })
    },
    async verifyPublications(results) {
      if (!results.length) return
      await queryRows(connectionString, `
        UPDATE google_merchant_product_publications publication
           SET state = result.state,
               processed_product_name = COALESCE(result.processed_product_name, publication.processed_product_name),
               issues = result.issues,
               last_error_code = result.last_error_code,
               last_verified_at = NOW(),
               deleted_at = CASE WHEN result.state = 'DELETED' THEN NOW() ELSE NULL END,
               updated_at = NOW()
          FROM jsonb_to_recordset($1::jsonb) AS result(
            product_id UUID, offer_id TEXT, data_source TEXT, state TEXT,
            processed_product_name TEXT, issues JSONB, last_error_code TEXT
          )
         WHERE publication.product_id = result.product_id
           AND publication.offer_id = result.offer_id
           AND publication.merchant_data_source = result.data_source
      `, [JSON.stringify(results.map(result => ({
        product_id: result.productId,
        offer_id: result.offerId,
        data_source: result.dataSource,
        state: result.state,
        processed_product_name: result.processedProductName,
        issues: result.issues,
        last_error_code: result.lastErrorCode
      })))])
    }
  }
}

export function createProductionMerchantCatalogReconciler(connectionString: string) {
  return createMerchantCatalogReconciler({ repository: productionRepository(connectionString) })
}

export function createProductionMerchantCatalogReadback(connectionString: string) {
  return createMerchantCatalogReadback({ repository: productionRepository(connectionString) })
}
