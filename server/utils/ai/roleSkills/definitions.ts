import type { RoleSkillSource } from '~~/shared/types/roleSkills'

export interface RoleSkillDefinition {
  key: string
  group: string
  persona: string
  tools: readonly string[]
  sources: readonly RoleSkillSource[]
}
const workRef = (path: string, title: string): RoleSkillSource => ({
  title, url: `https://github.com/anthropics/knowledge-work-plugins/blob/e050c2ec856373787143d7057663a6ebd1277df3/${path}/SKILL.md`
})
const references = {
  campaign: workRef('marketing/skills/campaign-plan', 'Campaign planning patterns'),
  content: workRef('marketing/skills/draft-content', 'Content drafting patterns'),
  brand: workRef('marketing/skills/brand-review', 'Creative review patterns'),
  performance: workRef('marketing/skills/performance-report', 'Performance reporting patterns'),
  account: workRef('sales/skills/account-plan', 'Account planning patterns'),
  status: workRef('product-management/skills/stakeholder-update', 'Stakeholder update patterns'),
  variance: workRef('finance/skills/variance-analysis', 'Variance analysis patterns'),
  reconciliation: workRef('finance/skills/reconciliation', 'Reconciliation patterns'),
  canvas: { title: 'Visual brief patterns', url: 'https://github.com/anthropics/skills/blob/2c5958ecac7cee2b583967a2c4981d0f4a75c579/skills/canvas-design/SKILL.md' }
}
/** Independently written guided requests. Tool dependencies and provenance are code-owned: editing a
 * prompt or attaching a role cannot register a tool, grant a permission or bypass an evaluated release. */
export const ROLE_SKILL_DEFINITIONS: readonly RoleSkillDefinition[] = [
  { key: 'marketing_promotion_plan', group: 'Marketing', persona: 'marketing', tools: ['get_briefs', 'get_project_status'], sources: [references.campaign, references.content] },
  { key: 'creative_graphics_brief', group: 'Creative', persona: 'general', tools: ['get_my_creative_queue', 'search_creative_workspace'], sources: [references.canvas, references.brand, { title: 'OpenAI Creative Production reference (proprietary; not imported)', url: 'https://github.com/openai/plugins/blob/d420d13051bffe4543ed39e30fa46b87148e47dd/plugins/creative-production/.codex-plugin/plugin.json' }] },
  { key: 'marketing_budget_health', group: 'Marketing', persona: 'media_buyer', tools: ['get_budget_health'], sources: [references.performance] },
  { key: 'marketing_campaign_breakdown', group: 'Marketing', persona: 'media_buyer', tools: ['get_campaign_breakdown'], sources: [references.campaign, references.performance] },
  { key: 'marketing_inventory_health', group: 'Marketing', persona: 'media_buyer', tools: ['marketing_get_inventory_feed_health'], sources: [references.performance] },
  { key: 'creative_review_queue', group: 'Creative', persona: 'marketing', tools: ['get_my_creative_queue'], sources: [references.brand] },
  { key: 'creative_brief_review', group: 'Creative', persona: 'marketing', tools: ['get_briefs'], sources: [references.content, references.canvas] },
  { key: 'account_delivery_status', group: 'Account management', persona: 'account', tools: ['get_client_overview', 'get_project_status', 'get_tasks'], sources: [references.status] },
  { key: 'sales_pipeline_brief', group: 'Sales', persona: 'sales', tools: ['get_crm_pipeline', 'search_crm'], sources: [references.account] },
  { key: 'finance_variance', group: 'Finance', persona: 'finance', tools: ['get_finance_snapshot'], sources: [references.variance] },
  { key: 'my_tasks', group: 'General', persona: 'general', tools: ['get_tasks'], sources: [references.status] },
  { key: 'official_documentation', group: 'Reference', persona: 'general', tools: ['read_official_documentation'], sources: [{ title: 'OpenAI skill and plugin architecture', url: 'https://github.com/openai/plugins/blob/d420d13051bffe4543ed39e30fa46b87148e47dd/README.md' }, { title: 'OpenAI official skills documentation', url: 'https://developers.openai.com/plugins/concepts/skills' }] },
  { key: 'spend_controller', group: 'Specialists', persona: 'media_buyer', tools: ['get_agent_clients', 'ask_spend_controller'], sources: [references.performance] },
  { key: 'publishing_planner', group: 'Specialists', persona: 'marketing', tools: ['get_agent_clients', 'ask_publishing_planner'], sources: [references.campaign, references.content] },
  { key: 'financial_watch', group: 'Specialists', persona: 'finance', tools: ['ask_financial_watch'], sources: [references.reconciliation] },
  { key: 'traffic_controller', group: 'Specialists', persona: 'general', tools: ['get_agent_clients', 'ask_traffic_controller'], sources: [references.status] }
]
export const roleSkillDefinition = (key: string) => ROLE_SKILL_DEFINITIONS.find(definition => definition.key === key)
