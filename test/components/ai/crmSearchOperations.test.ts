import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const projectRoot = new URL('../../../', import.meta.url)
const componentRoot = new URL('../../../app/components/ai/crm-search/', import.meta.url)

const components = [
  'SearchHealthSummary.vue',
  'ClientPolicyTable.vue',
  'PolicyTransitionDialog.vue',
  'GlobalControlDialog.vue',
  'DeadLetterTable.vue',
  'DeadLetterResolutionDialog.vue',
  'EvaluationEvidencePanel.vue',
  'ApprovalLedger.vue',
  'ApprovalCreateDialog.vue',
  'ApprovalImportDialog.vue',
  'ApprovalRevokeDialog.vue',
  'SearchTelemetryPanel.vue'
] as const

const formDialogs = [
  'PolicyTransitionDialog.vue',
  'GlobalControlDialog.vue',
  'DeadLetterResolutionDialog.vue',
  'ApprovalCreateDialog.vue',
  'ApprovalImportDialog.vue',
  'ApprovalRevokeDialog.vue'
] as const

async function readComponent(name: string) {
  return await readFile(new URL(name, componentRoot), 'utf8')
}

async function readProjectFile(path: string) {
  return await readFile(new URL(path, projectRoot), 'utf8')
}

describe('CRM search operator UI design contract', () => {
  it.each(components)('%s uses Nuxt UI v4 and provides bounded loading, error or empty feedback', async (name) => {
    const source = await readComponent(name)

    expect(source).toMatch(/<(?:UCard|UTable|UModal|UAlert|UBadge|USkeleton|UButton|UFormField)\b/)
    expect(source).toMatch(/loading|pending|error|empty|no\s+(?:data|results|records)/i)
    expect(source).not.toMatch(/\b(?:text|bg|border)-(?:gray|slate|zinc|neutral)-/)
  })

  it.each(formDialogs)('%s follows the mandatory modal, form-field and container-grid rules', async (name) => {
    const source = await readComponent(name)

    expect(source).toContain('<UModal')
    expect(source).toContain('<UFormField')
    expect(source).toContain('@container')
    expect(source).toMatch(/grid\s+grid-cols-1\s+gap-4/)
    expect(source).toContain('@lg:grid-cols-2')
    expect(source).not.toMatch(/(?<!@lg:)grid-cols-2/)
    expect(source).not.toMatch(/<(?:input|select|button|textarea|dialog)\b/i)
    expect(source).not.toMatch(/\{\s*label\s*:[^}]+value\s*:\s*["']{2}/)
  })

  it.each(formDialogs)('%s keeps Nuxt UI controls full-width in constrained form grids', async (name) => {
    const source = await readComponent(name)
    const controls = source.match(/<(?:UInput|USelect|USelectMenu|UTextarea)\b[^>]*>/g) ?? []

    expect(controls.length).toBeGreaterThan(0)
    for (const control of controls) expect(control).toContain('w-full')
  })

  it('uses exact typed confirmations and reasons for policy/global/dead-letter/revocation commands', async () => {
    const [policy, global, deadLetter, revoke] = await Promise.all([
      readComponent('PolicyTransitionDialog.vue'),
      readComponent('GlobalControlDialog.vue'),
      readComponent('DeadLetterResolutionDialog.vue'),
      readComponent('ApprovalRevokeDialog.vue')
    ])

    for (const source of [policy, global, deadLetter, revoke]) {
      expect(source).toContain('confirmation')
      expect(source).toContain('reason')
      expect(source).toMatch(/expected(?:Control|Policy)?Revision/)
      expect(source).toMatch(/disabled\s*=|:disabled=/)
    }

    expect(global).toContain('HALT CRM SEARCH')
    expect(deadLetter).toContain('RECOVER CRM SEARCH DEAD LETTER')
    expect(revoke).toContain('REVOKE CRM SEARCH APPROVAL')
  })

  it('shows a refresh action on stale revisions instead of silently retrying', async () => {
    for (const name of ['PolicyTransitionDialog.vue', 'GlobalControlDialog.vue', 'DeadLetterResolutionDialog.vue', 'ApprovalRevokeDialog.vue'] as const) {
      const source = await readComponent(name)
      expect(source).toContain('crm_search_stale_revision')
      expect(source).toMatch(/refresh/i)
      expect(source).not.toMatch(/retry\s*\(\s*\)|setTimeout/i)
    }
  })
})

describe('CRM search operational workflows', () => {
  it('renders actionable 60/80/90 capacity thresholds and treats zero configured budget as disabled', async () => {
    const source = await readComponent('SearchHealthSummary.vue')

    expect(source).toMatch(/60\s*%/)
    expect(source).toMatch(/80\s*%/)
    expect(source).toMatch(/90\s*%/)
    expect(source).toMatch(/warn/i)
    expect(source).toMatch(/page/i)
    expect(source).toMatch(/block(?:ed)?\s+(?:new\s+)?indexing/i)
    expect(source).toMatch(/budget[^\n]*(?:disabled|not configured)|(?:disabled|not configured)[^\n]*budget/i)
  })

  it('offers only the origin-specific dead-letter action with evidence before confirmation', async () => {
    const [table, dialog] = await Promise.all([
      readComponent('DeadLetterTable.vue'),
      readComponent('DeadLetterResolutionDialog.vue')
    ])

    for (const source of [table, dialog]) {
      expect(source).toContain('cloudflare_transport')
      expect(source).toContain('transport_retry')
      expect(source).toContain('provider_confirmation')
      expect(source).toContain('confirmation_reconcile')
    }
    expect(dialog).toMatch(/evidence|origin|failure/i)
  })

  it('exposes exactly six approval types with scope, evidence, cost, expiry and revocation', async () => {
    const [types, create, ledger, revoke] = await Promise.all([
      readProjectFile('app/types/crmSearchOperations.ts'),
      readComponent('ApprovalCreateDialog.vue'),
      readComponent('ApprovalLedger.vue'),
      readComponent('ApprovalRevokeDialog.vue')
    ])
    const exactTypes = [
      'resource_provision',
      'production_migration',
      'production_deploy',
      'client_indexing',
      'client_shadow',
      'client_assist'
    ]

    for (const type of exactTypes) expect(types).toContain(`'${type}'`)
    expect(types.match(/'resource_provision'|'production_migration'|'production_deploy'|'client_indexing'|'client_shadow'|'client_assist'/g)).toHaveLength(6)

    for (const field of [
      'approvalType',
      'environment',
      'organisationScopeId',
      'clientId',
      'evidenceBundleHash',
      'maximumCostUsdMicros',
      'expiresAt',
      'approvedBy'
    ]) expect(create).toContain(field)

    expect(create).toMatch(/implementationGitSha|Git SHA/)
    expect(create).toMatch(/artifactManifestDigest|artifact manifest digest/i)
    expect(create).toMatch(/bindingManifestDigest/)
    expect(create).toMatch(/expectedControlRevision/)
    expect(create).toMatch(/expectedPolicyRevision/)
    expect(create).toMatch(/targetSchemaVersion/)
    expect(create).toMatch(/forecastVectorCount/)
    expect(create).toMatch(/vectorCapacity/)
    expect(create).toMatch(/requestedByActorId|actor separation/i)
    expect(ledger).toMatch(/revoked|expires|scope|evidence|cost/i)
    expect(revoke).toContain('expectedRevision')
  })

  it('limits the bootstrap import workflow to resource_provision and shows preserved provenance', async () => {
    const source = await readComponent('ApprovalImportDialog.vue')

    expect(source).toContain('resource_provision')
    expect(source).toContain('issuedAt')
    expect(source).toContain('importedProvenanceHash')
    expect(source).toMatch(/Original issue timestamp/i)
    expect(source).not.toContain('UCalendar')
    expect(source).not.toContain('getLocalTimeZone')
    expect(source).not.toMatch(/client_shadow|client_assist|production_deploy/)
  })

  it('submits exact dead-letter revision and generation then refreshes on a 409', async () => {
    const source = await readComponent('DeadLetterResolutionDialog.vue')

    expect(source).toContain('expectedRevision: props.item.revision')
    expect(source).toContain('expectedGeneration: props.item.generation')
    expect(source).toContain('crm_search_stale_revision')
    expect(source).toMatch(/emit\(['"]refresh['"]\)/)
  })

  it('assembles all operator panels and every accepted admin endpoint on the admin page', async () => {
    const source = await readProjectFile('app/pages/admin/ai/crm-search.vue')

    for (const component of components) {
      expect(source).toContain(component.replace('.vue', ''))
    }
    for (const endpoint of [
      '/api/admin/crm-search/health',
      '/api/admin/crm-search/policies',
      '/api/admin/crm-search/global-control',
      '/api/admin/crm-search/backfills',
      '/api/admin/crm-search/reconcile',
      '/api/admin/crm-search/dead-letters',
      '/api/admin/crm-search/approvals',
      '/api/admin/crm-search/approvals/import',
      '/api/admin/crm-search/telemetry'
    ]) expect(source).toContain(endpoint)

    expect(source).toMatch(/useHead\s*\(|title:/)
    expect(source).toMatch(/loading|pending/i)
    expect(source).toMatch(/error/i)
  })

  it('adds the ADMIN-only CRM search operations destination to the agency navigation', async () => {
    const source = await readProjectFile('app/layouts/agency.vue')

    expect(source).toContain('/admin/ai/crm-search')
    expect(source).toMatch(/ADMIN/)
    expect(source).toMatch(/CRM Search/i)
  })
})
