import { DEPARTMENT_LEAD_READ_NAMES, DEPARTMENT_LEAD_WRITE_NAMES } from '../marketing/departmentLeadSchemas'
import { DEPARTMENT_CREATIVE_READ_NAMES, DEPARTMENT_CREATIVE_WRITE_NAMES } from '../marketing/departmentCreativeSchemas'
import { DEPARTMENT_WEBSITE_READ_NAMES, DEPARTMENT_WEBSITE_WRITE_NAMES } from '../marketing/departmentWebsiteSchemas'
import { DEPARTMENT_EMAIL_READ_NAMES, DEPARTMENT_EMAIL_WRITE_NAMES } from '../marketing/departmentEmailSchemas'
import { DEPARTMENT_INBOX_READ_NAMES, DEPARTMENT_INBOX_WRITE_NAMES } from '../marketing/departmentInboxSchemas'
import { departmentCampaignContracts } from '../marketing/departmentCampaignSchemas'
import { departmentMetaCampaignContracts } from '../marketing/departmentMetaCampaignSchemas'
import { departmentCatalogContracts } from '../marketing/departmentCatalogSchemas'
import { departmentUtilityContracts } from '../marketing/departmentUtilitySchemas'
import { DEPARTMENT_WORK_READ_NAMES, DEPARTMENT_WORK_WRITE_NAMES } from '../marketing/departmentWorkSchemas'
import { DEPARTMENT_CONTENT_READ_NAMES, DEPARTMENT_CONTENT_WRITE_NAMES } from '../marketing/departmentContentSchemas'

export { DEPARTMENT_LEAD_READ_NAMES, DEPARTMENT_LEAD_WRITE_NAMES, DEPARTMENT_CREATIVE_READ_NAMES, DEPARTMENT_CREATIVE_WRITE_NAMES, DEPARTMENT_WEBSITE_READ_NAMES, DEPARTMENT_WEBSITE_WRITE_NAMES, DEPARTMENT_EMAIL_READ_NAMES, DEPARTMENT_EMAIL_WRITE_NAMES, DEPARTMENT_INBOX_READ_NAMES, DEPARTMENT_INBOX_WRITE_NAMES, DEPARTMENT_WORK_READ_NAMES, DEPARTMENT_WORK_WRITE_NAMES, DEPARTMENT_CONTENT_READ_NAMES, DEPARTMENT_CONTENT_WRITE_NAMES }
export const DEPARTMENT_CAMPAIGN_READ_NAMES: readonly string[] = [...departmentCampaignContracts, ...departmentMetaCampaignContracts].filter(row => !row[2]).map(row => row[0])
export const DEPARTMENT_CAMPAIGN_WRITE_NAMES: readonly string[] = [...departmentCampaignContracts, ...departmentMetaCampaignContracts].filter(row => row[2]).map(row => row[0])
export const DEPARTMENT_CATALOG_READ_NAMES: readonly string[] = departmentCatalogContracts.filter(row => !row[2]).map(row => row[0])
export const DEPARTMENT_CATALOG_WRITE_NAMES: readonly string[] = departmentCatalogContracts.filter(row => row[2]).map(row => row[0])
export const DEPARTMENT_UTILITY_READ_NAMES: readonly string[] = departmentUtilityContracts.filter(row => !row[2]).map(row => row[0])
export const DEPARTMENT_UTILITY_WRITE_NAMES: readonly string[] = departmentUtilityContracts.filter(row => row[2]).map(row => row[0])
// Dependency-free policy/scope inventory. Executable services are loaded only by the department suite.
export const DEPARTMENT_READ_TOOL_NAMES = [
  'get_department_client_inventory', 'get_department_daily_brief', 'get_department_budget_health',
  'get_department_lead_quality', 'get_department_seo_overview', 'get_department_inbox_email_stats',
  'get_department_creative_inventory', 'get_department_work_coverage'
] as const
export const DEPARTMENT_REVIEW_READ_NAMES = [
  'marketing_list_google_ads_reviews', 'marketing_get_google_ads_review',
  'marketing_list_gtm_reviews', 'marketing_get_gtm_review',
  'marketing_list_social_reviews', 'marketing_get_social_review'
] as const
export const DEPARTMENT_REVIEW_WRITE_NAMES = [
  'marketing_review_google_ads_plan', 'marketing_execute_google_ads_plan',
  'marketing_review_gtm_proposal', 'marketing_execute_gtm_proposal',
  'marketing_review_social_revision', 'marketing_execute_social_revision'
] as const
export const DEPARTMENT_BUDGET_READ_NAMES = ['marketing_list_budget_allocations', 'marketing_get_budget_proposal'] as const
export const DEPARTMENT_BUDGET_WRITE_NAMES = ['marketing_set_budget_allocations', 'marketing_propose_budget_allocations', 'marketing_review_budget_allocations'] as const
export const DEPARTMENT_FEED_READ_NAMES = ['marketing_get_inventory_feed_health', 'marketing_preview_inventory_feed', 'marketing_get_inventory_feed_change'] as const
export const DEPARTMENT_FEED_WRITE_NAMES = ['marketing_propose_inventory_feed_setup', 'marketing_propose_inventory_feed_change', 'marketing_execute_inventory_feed_change', 'marketing_review_inventory_feed_change', 'marketing_propose_inventory_feed_regeneration'] as const
export const DEPARTMENT_WRITE_TOOL_NAMES: readonly string[] = [...DEPARTMENT_LEAD_WRITE_NAMES, ...DEPARTMENT_CREATIVE_WRITE_NAMES, ...DEPARTMENT_WEBSITE_WRITE_NAMES, ...DEPARTMENT_EMAIL_WRITE_NAMES, ...DEPARTMENT_INBOX_WRITE_NAMES, ...DEPARTMENT_REVIEW_WRITE_NAMES, ...DEPARTMENT_BUDGET_WRITE_NAMES, ...DEPARTMENT_FEED_WRITE_NAMES, ...DEPARTMENT_CAMPAIGN_WRITE_NAMES, ...DEPARTMENT_CATALOG_WRITE_NAMES, ...DEPARTMENT_UTILITY_WRITE_NAMES, ...DEPARTMENT_WORK_WRITE_NAMES, ...DEPARTMENT_CONTENT_WRITE_NAMES]
export const DEPARTMENT_TOOL_NAMES: readonly string[] = [
  ...DEPARTMENT_LEAD_READ_NAMES, ...DEPARTMENT_CREATIVE_READ_NAMES, ...DEPARTMENT_WEBSITE_READ_NAMES, ...DEPARTMENT_EMAIL_READ_NAMES, ...DEPARTMENT_INBOX_READ_NAMES, ...DEPARTMENT_CAMPAIGN_READ_NAMES, ...DEPARTMENT_CATALOG_READ_NAMES, ...DEPARTMENT_UTILITY_READ_NAMES, ...DEPARTMENT_WORK_READ_NAMES, ...DEPARTMENT_CONTENT_READ_NAMES, ...DEPARTMENT_READ_TOOL_NAMES, ...DEPARTMENT_REVIEW_READ_NAMES, ...DEPARTMENT_BUDGET_READ_NAMES, ...DEPARTMENT_FEED_READ_NAMES, ...DEPARTMENT_WRITE_TOOL_NAMES
]
export const isDepartmentTool = (name: string) => DEPARTMENT_TOOL_NAMES.includes(name)
export const isDepartmentWriteTool = (name: string) => DEPARTMENT_WRITE_TOOL_NAMES.includes(name)
