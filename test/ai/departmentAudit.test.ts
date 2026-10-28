import { expect, it } from 'vitest'
import { departmentAudit } from '~~/server/utils/ai/mcp/departmentAudit'

const proposalId = '11111111-1111-4111-8111-111111111111'
it('records preparation without claiming execution and links only native pending proposals', () => {
  expect(departmentAudit('marketing_propose_budget_allocations', {}, { ok: true, data: { proposalId } })).toMatchObject({ riskTier: 'confirm', outcome: 'proposed', pendingId: proposalId })
})
it('distinguishes peer review from execution and captures rejection', () => {
  expect(departmentAudit('marketing_review_google_ads_plan', { decision: 'reject' }, { ok: true, data: { planId: proposalId } })).toMatchObject({ riskTier: 'confirm', outcome: 'rejected', pendingId: null, actionClass: 'review' })
})
it('retains uncertain provider status and never attaches failed proposal IDs', () => {
  expect(departmentAudit('marketing_execute_social_revision', {}, { ok: true, data: { status: 'unknown' } })).toMatchObject({ outcome: 'unknown', riskTier: 'confirm' })
  expect(departmentAudit('marketing_propose_inventory_feed_setup', {}, { ok: false, error: 'missing permission' })).toMatchObject({ outcome: 'failed', pendingId: null })
})
it('leaves non-department legacy audit behavior to its existing caller', () => {
  expect(departmentAudit('confirm_action', {}, { ok: true, data: {} })).toBeNull()
})

it('preserves uncertain and already-published results instead of recording ordinary failure or re-execution', () => {
  expect(departmentAudit('marketing_publish_content_version', {}, { ok: false, error: 'held', code: 'reconciliation_required' })).toMatchObject({ outcome: 'unknown' })
  expect(departmentAudit('marketing_publish_content_version', {}, { ok: true, data: { status: 'published', ledgerRecorded: false } })).toMatchObject({ outcome: 'unknown' })
  expect(departmentAudit('marketing_execute_social_revision', {}, { ok: true, data: { status: 'reconciliation_required' } })).toMatchObject({ outcome: 'unknown' })
})

it('retains the registered risk tier for consequential provider actions', () => {
  expect(departmentAudit('marketing_execute_email_campaign_send', {}, { ok: true, data: {} }, 'rich_confirm')).toMatchObject({ riskTier: 'rich_confirm', outcome: 'executed' })
})

it.each([
  ['marketing_review_google_ads_plan', 'rejected', 'rejected'],
  ['marketing_review_inventory_feed_change', 'rejected', 'rejected'],
  ['marketing_review_lead_routing_change', 'rejected', 'rejected'],
  ['marketing_review_website_version', 'returned_to_draft', 'returned_to_draft'],
  ['marketing_review_google_ads_plan', 'approved', 'approved'],
  ['marketing_review_budget_allocations', 'reject', 'rejected']
])('records the native decision for %s (%s)', (tool, decision, outcome) => {
  expect(departmentAudit(tool, { decision }, { ok: true, data: {} })).toMatchObject({ actionClass: 'review', outcome })
})

it.each([
  'marketing_propose_lead_routing_change', 'marketing_review_lead_routing_change',
  'marketing_propose_email_campaign_send', 'marketing_get_email_send_proposal',
  'marketing_prepare_meta_ad_launch', 'marketing_execute_meta_ad_launch',
  'marketing_propose_catalog_feed', 'marketing_propose_product_set_change', 'marketing_approve_catalog_change'
])('links the native pending action for %s', (name) => {
  expect(departmentAudit(name, {}, { ok: true, data: { proposalId } })).toMatchObject({ pendingId: proposalId })
})
it.each(['marketing_review_website_version', 'marketing_review_google_ads_plan', 'marketing_review_social_revision'])('does not attach unrelated domain IDs for %s', (name) => {
  expect(departmentAudit(name, { proposalId }, { ok: true, data: { proposalId } })).toMatchObject({ pendingId: null })
})
