import { createHmac } from 'node:crypto'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import ts from 'typescript'

const root = resolve(import.meta.dirname, '../../../../..')
const require = createRequire(import.meta.url)
const { rollup } = createRequire(require.resolve('nitropack/package.json'))('rollup')

afterEach(() => vi.unstubAllGlobals())

it('dispatches a signed Meta lead through all real bundled adapters with Nitro-style side-effect pruning', async () => {
  const lead = {
    id: 'lead-1', client_id: 'client-1', source: 'meta', source_lead_id: 'meta-lead-1',
    form_id: 'form-1', submitted_at: '2026-10-05T05:19:32.000Z',
    field_data: { email: 'test@example.test' }, attribution: { provider: 'meta_lead_ads' }, status: 'new'
  }
  const delivery = {
    id: 'delivery-1', lead_id: lead.id, rule_destination_id: 'destination-1',
    destination_type: 'webhook', scheduled_at: '2020-01-01T00:00:00Z', retry_count: 0,
    idempotency_key: 'delivery-1'
  }
  const hooks = {
    claimDelivery: vi.fn(async () => delivery), loadLead: vi.fn(async () => lead),
    loadRuleForForm: vi.fn(async () => ({ rule: { id: 'rule-1', client_id: 'client-1', enabled: true } })),
    queryOne: vi.fn(async () => ({ id: 'destination-1', rule_id: 'rule-1', enabled: true, config: { url: 'https://dealer.example.test/intake', secret: 'test-signing-secret' } })),
    markDelivered: vi.fn(), markFailed: vi.fn(), markSkipped: vi.fn()
  }
  vi.stubGlobal('__bundledLeadHooks', hooks)
  const fetch = vi.fn(async () => new Response('{}', { status: 200 }))
  vi.stubGlobal('fetch', fetch)

  // Compile the actual dispatch entry and every built-in adapter. Only database,
  // queue and unrelated service boundaries are replaced; registration is real.
  const stubs: Record<string, string> = {
    'server/utils/leads/db.ts': ['claimDelivery', 'loadLead', 'loadRuleForForm', 'releaseClaim', 'markDelivered', 'markFailed', 'markSkipped'].map(name => `export const ${name} = (...args) => globalThis.__bundledLeadHooks.${name}(...args);`).join('\n'),
    'server/utils/db.ts': 'export const queryOne = (...args) => globalThis.__bundledLeadHooks.queryOne(...args); export const execute = () => {};',
    'server/utils/leads/rulesEngine.ts': 'export const evaluateLead = () => {};',
    'server/utils/leads/crmPromotion.ts': 'export const crmLeadPromotionService = { promote() {} };',
    'server/utils/leads/crmPromotionState.ts': 'export const markCrmPromotionFailure = () => {}; export const markCrmPromotionResult = () => {}; export const markCrmPromotionStarted = () => {};',
    'server/utils/leads/queue.ts': 'export const enqueueLeadJob = () => {};',
    'server/utils/googleCredentialProfiles.ts': 'export const GOOGLE_CREDENTIAL_PROFILE_JOIN = ""; export const GOOGLE_CREDENTIAL_PROFILE_SELECT = ""; export const resolveGoogleCredential = () => {};'
  }
  const bundle = await rollup({
    input: 'test-entry',
    treeshake: { moduleSideEffects: false },
    external: (id: string) => id.startsWith('node:'),
    plugins: [{
      name: 'actual-lead-source-with-infrastructure-stubs',
      resolveId(id: string, importer?: string) {
        if (id === 'test-entry' || id === 'resend') return id
        const path = id.startsWith('~~/') ? resolve(root, id.slice(3)) : id.startsWith('.') ? resolve(dirname(importer!), id) : id
        if (path.startsWith(root)) return path.endsWith('.ts') ? path : path.endsWith('/destinations') ? `${path}/index.ts` : `${path}.ts`
      },
      async load(id: string) {
        if (id === 'test-entry') return `export { handleQueueMessage } from '${root}/server/utils/leads/dispatch.ts'; export { listAdapterTypes } from '${root}/server/utils/leads/destinations/index.ts';`
        if (id === 'resend') return 'export class Resend {}'
        if (!id.startsWith(root)) return null
        const stub = stubs[id.slice(root.length + 1)]
        if (stub) return stub
        return ts.transpileModule(await readFile(id, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
      }
    }]
  })
  let code: string
  try {
    const result = await bundle.generate({ format: 'es', inlineDynamicImports: true })
    code = result.output[0].code
  } finally {
    await bundle.close()
  }
  const compiled = await import(/* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
  expect(compiled.listAdapterTypes().sort()).toEqual(['assign_user', 'autogate', 'email', 'portal', 'sheets', 'slack', 'webhook'])
  await compiled.handleQueueMessage({ type: 'delivery.dispatch', payload: { delivery_id: delivery.id } })
  expect(fetch).toHaveBeenCalledOnce()
  const [url, options] = fetch.mock.calls[0] as unknown as [string, RequestInit]
  expect(url).toBe('https://dealer.example.test/intake')
  const body = options.body as string
  expect(JSON.parse(body)).toMatchObject({ delivery_id: delivery.id, idempotency_key: delivery.idempotency_key, lead: { source_lead_id: lead.source_lead_id, field_data: lead.field_data } })
  expect(options.headers).toMatchObject({ 'X-Leads-Signature': `sha256=${createHmac('sha256', 'test-signing-secret').update(body).digest('hex')}` })
  expect(hooks.markDelivered).toHaveBeenCalledWith(delivery.id, { http_status: 200 })
  expect(hooks.markFailed).not.toHaveBeenCalled()
  expect(hooks.markSkipped).not.toHaveBeenCalled()
})
