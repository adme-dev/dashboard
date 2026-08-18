import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('AutoGate lead destination configuration', () => {
  const ruleEditor = readFileSync('app/components/leads/RuleEditor.vue', 'utf8')
  const destinationEditor = readFileSync('app/components/leads/DestinationEditor.vue', 'utf8')
  const configEditor = readFileSync('app/components/leads/DestinationConfigAutogate.vue', 'utf8')
  const filterBuilder = readFileSync('app/components/leads/FilterBuilder.vue', 'utf8')
  const testFirePanel = readFileSync('app/components/leads/TestFirePanel.vue', 'utf8')
  const testFireRoute = readFileSync('server/api/leads/rules/[ruleId]/test-fire.post.ts', 'utf8')
  const rulesListRoute = readFileSync('server/api/leads/rules/list.get.ts', 'utf8')

  it('exposes AutoGate as a configurable Nuxt UI destination', () => {
    expect(ruleEditor).toContain("{ type: 'autogate', label: 'AutoGate CRM'")
    expect(destinationEditor).toContain("case 'autogate': return resolveComponent('LeadsDestinationConfigAutogate')")
    expect(configEditor).toContain('<UFormField label="Seller Identifier"')
    expect(configEditor).toContain('<UFormField label="Lead type"')
    expect(configEditor).toContain('<USelectMenu')
    expect(configEditor).not.toMatch(/<select\b|<input\b|<button\b/)
  })

  it('offers stable campaign and automotive filter paths', () => {
    for (const field of [
      'campaign_id',
      'campaign_name',
      'ad_id',
      'ad_name',
      'field_data.vehicle_make',
      'field_data.vehicle_model',
      'field_data.retailer_item_id',
      'field_data.stock_number',
    ]) {
      expect(filterBuilder).toContain(`value: '${field}'`)
    }
  })

  it('uses a valid unique lead identifier and supports campaign-aware test fires', () => {
    expect(testFireRoute).toContain('const testLeadId = crypto.randomUUID()')
    expect(testFireRoute).toContain('campaign_id: overrides?.campaign_id ?? null')
    expect(testFirePanel).toContain('v-model="contextOverrides.campaign_id"')
    expect(testFirePanel).toContain('v-model="contextOverrides.campaign_name"')
  })

  it('keeps proactively configured rules visible before the first lead arrives', () => {
    expect(rulesListRoute).toContain('FULL OUTER JOIN lead_form_rules')
    expect(rulesListRoute).toContain('COALESCE(m.form_id, r.form_id) AS form_id')
  })
})
