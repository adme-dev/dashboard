export const ADS_STAFF_READ_NAMES = [
  'google_ads_list_connections',
  'google_ads_list_campaigns',
  'google_ads_list_ad_groups',
  'google_ads_list_ads',
  'google_ads_list_keywords',
  'google_ads_list_targeting',
  'google_ads_list_assets',
  'google_ads_list_conversion_actions',
  'google_ads_list_recommendations',
  'google_ads_resolve_measurement_account',
  'google_ads_get_measurement_health',
  'google_ads_get_conversion_reconciliation',
  'google_ads_get_call_summary',
  'google_ads_get_sync_status',
  'google_ads_get_action_status',
  'google_ads_get_drift',
  'google_ads_validate_action_plan',
  'google_ads_reverify_resource'
] as const
export const ADS_STAFF_PLAN_NAMES = [
  'google_ads_plan_pause',
  'google_ads_plan_archive',
  'google_ads_plan_enable',
  'google_ads_plan_add_negative_keywords',
  'google_ads_plan_manage_shared_negative_set',
  'google_ads_plan_create_budget',
  'google_ads_plan_update_budget',
  'google_ads_plan_create_search_campaign',
  'google_ads_plan_update_campaign',
  'google_ads_plan_create_bidding_strategy',
  'google_ads_plan_update_bidding_strategy',
  'google_ads_plan_create_ad_group',
  'google_ads_plan_update_ad_group',
  'google_ads_plan_create_responsive_search_ad',
  'google_ads_plan_replace_responsive_search_ad',
  'google_ads_plan_add_keywords',
  'google_ads_plan_update_keyword',
  'google_ads_plan_set_locations',
  'google_ads_plan_set_location_match_mode',
  'google_ads_plan_set_languages',
  'google_ads_plan_set_ad_schedule',
  'google_ads_plan_set_devices',
  'google_ads_plan_set_demographics',
  'google_ads_plan_set_placements',
  'google_ads_plan_set_content_exclusions',
  'google_ads_plan_set_audience_associations',
  'google_ads_plan_set_campaign_conversion_goals',
  'google_ads_plan_set_campaign_goal_config',
  'google_ads_plan_set_customer_goal_biddability',
  'google_ads_plan_set_conversion_primary_state',
  'google_ads_plan_create_conversion_action',
  'google_ads_plan_update_conversion_action',
  'google_ads_plan_archive_conversion_action',
  'google_ads_plan_create_custom_conversion_goal',
  'google_ads_plan_update_custom_conversion_goal',
  'google_ads_plan_create_asset',
  'google_ads_plan_attach_asset',
  'google_ads_plan_archive_asset_link',
  'google_ads_plan_create_asset_group',
  'google_ads_plan_update_asset_group',
  'google_ads_plan_set_asset_group_assets',
  'google_ads_plan_set_listing_groups',
  'google_ads_plan_apply_recommendation',
  'google_ads_plan_dismiss_recommendation',
  'google_ads_plan_create_custom_audience',
  'google_ads_plan_update_custom_audience',
  'google_ads_plan_set_pmax_audience_signals',
  'google_ads_plan_set_pmax_search_themes'
] as const
export const GTM_STAFF_NAMES = [
  'list_gtm_site_inventory',
  'get_gtm_tracking_ownership',
  'record_gtm_tracking_ownership',
  'propose_gtm_container_binding',
  'propose_gtm_workspace_change',
  'propose_gtm_xeroflow_installation',
  'propose_gtm_publish',
  'propose_gtm_rollback',
  'get_gtm_change_status',
  'list_client_gtm_connections'
] as const
export const TASK4_STAFF_NAMES: readonly string[] = [
  ...ADS_STAFF_READ_NAMES,
  ...ADS_STAFF_PLAN_NAMES,
  ...GTM_STAFF_NAMES
]
export const isTask4StaffTool = (name: string) =>
  TASK4_STAFF_NAMES.includes(name)
export const isTask4WriteTool = (name: string) =>
  ADS_STAFF_PLAN_NAMES.includes(name as any)
  || name.startsWith('propose_gtm_')
  || name === 'record_gtm_tracking_ownership'
export const isLegacyAdsMutation = (name: string) =>
  name === 'propose_google_ads_action' || name.startsWith('google_ads_run_')
