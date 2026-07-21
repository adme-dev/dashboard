import { describe, expect, it } from 'vitest'

import { getAiModelMapSummary, listAiModelMap } from '~~/server/utils/ai/modelRegistry'

describe('ai model registry', () => {
  it('covers the expected phase-1 feature inventory', () => {
    const rows = listAiModelMap()
    const features = new Set(rows.map((row) => row.featureKey))

    expect(features.has('social_spend_ai_analysis')).toBe(true)
    expect(features.has('social_spend_pacing_summary')).toBe(true)
    expect(features.has('agency_ai_tool_loop')).toBe(true)
    expect(features.has('ai_agent_digest_report')).toBe(true)
    expect(features.has('agency_ai_l2_classifier')).toBe(true)
    expect(features.has('agency_ai_l2_specialist_loop')).toBe(true)
    expect(features.has('agency_ai_l2_synthesis')).toBe(true)
    expect(features.has('agency_ai_single_shot_fallback')).toBe(true)
    expect(features.has('agency_ai_intent_lora_classifier')).toBe(true)
    expect(features.has('agency_ai_intent_edge_classifier')).toBe(true)
    expect(features.has('agency_ai_intent_groq_classifier')).toBe(true)
    expect(features.has('ai_memory_distillation')).toBe(true)
    expect(features.has('observe_and_learn_distillation')).toBe(true)
    expect(features.has('financial_advisor')).toBe(true)
    expect(features.has('xero_invoice_ai_briefing')).toBe(true)
    expect(features.has('customer_insights_summary')).toBe(true)
    expect(features.has('cashflow_insights')).toBe(true)
    expect(features.has('expense_insights')).toBe(true)
    expect(features.has('anomaly_driver_narrative')).toBe(true)
    expect(features.has('action_plan_generation')).toBe(true)
    expect(features.has('financial_insights_headline')).toBe(true)
    expect(features.has('financial_insights_recommendations')).toBe(true)
    expect(features.has('budget_change_sanity_check')).toBe(true)
    expect(features.has('social_publishing_plan')).toBe(true)
    expect(features.has('social_reporting_ai_summary')).toBe(true)
    expect(features.has('social_inbox_reply_draft')).toBe(true)
    expect(features.has('social_listening_enrichment')).toBe(true)
    expect(features.has('crm_followup_draft')).toBe(true)
    expect(features.has('banner_image_suggest')).toBe(true)
    expect(features.has('banner_copy_suggest')).toBe(true)
    expect(features.has('banner_code_assist')).toBe(true)
    expect(features.has('video_generation_job')).toBe(true)
    expect(features.has('video_generation_worker_runtime')).toBe(true)
    expect(features.has('video_generation_completion')).toBe(true)
    expect(features.has('video_asset_publish_social_caption')).toBe(true)
    expect(features.has('video_project_ai_assembly')).toBe(true)
    expect(features.has('video_asset_intelligence_job')).toBe(true)
    expect(features.has('video_asset_intelligence_worker_runtime')).toBe(true)
    expect(features.has('audio_music_generation')).toBe(true)
    expect(features.has('audio_music_generation_worker_runtime')).toBe(true)
    expect(features.has('audio_render_publish_social_caption')).toBe(true)
    expect(features.has('workers_ai_edge_generate')).toBe(true)
    expect(features.has('workers_ai_edge_classify')).toBe(true)
    expect(features.has('office_recording_transcription')).toBe(true)
    expect(features.has('office_meeting_cross_search')).toBe(true)
    expect(features.has('office_meeting_question_answer')).toBe(true)
    expect(features.has('task_wiki_summary')).toBe(true)
    expect(features.has('agency_task_assist_creation')).toBe(true)
    expect(features.has('agency_task_assist_analysis')).toBe(true)
    expect(features.has('board_automation_ai_insight')).toBe(true)
    expect(features.has('board_automation_ai_summary')).toBe(true)
    expect(features.has('agency_analytics_ai_summary')).toBe(true)
    expect(features.has('agency_analytics_ask')).toBe(true)
    expect(features.has('rate_card_description')).toBe(true)
    expect(features.has('notification_digest_narrative')).toBe(true)
    expect(features.has('notification_why_explanation')).toBe(true)
    expect(features.has('task_assignment_auto_ack')).toBe(true)
    expect(features.has('portal_ai_tool_loop')).toBe(true)
    expect(features.has('workers_ai_speech_to_text')).toBe(true)
    expect(features.has('workers_ai_text_to_speech')).toBe(true)
    expect(features.has('agent_spend_controller')).toBe(true)
    expect(features.has('agent_publishing_planner')).toBe(true)
    expect(features.has('agent_financial_watch')).toBe(true)
    expect(features.has('agent_traffic_controller')).toBe(true)
    expect(features.has('agent_office_watch')).toBe(true)
  })

  it('registers platform agents as high-risk text surfaces for Model Ops', () => {
    const rows = listAiModelMap()
    const spendController = rows.find((row) => row.featureKey === 'agent_spend_controller')

    expect(spendController).toMatchObject({
      label: 'Spend Controller Agent',
      surface: '/agency/social/spend',
      owner: 'Growth',
      provider: 'workers_ai',
      modality: 'text',
      riskTier: 'high',
    })
  })

  it('attaches warnings for rows with missing pricing metadata', () => {
    const rows = listAiModelMap()
    const music = rows.find((row) => row.featureKey === 'audio_music_generation')

    expect(music).toBeTruthy()
    expect(music?.warnings).toContain('Pricing not yet mapped')
  })

  it('summarises the current inventory', () => {
    const summary = getAiModelMapSummary(listAiModelMap())

    expect(summary.totalRows).toBeGreaterThan(10)
    expect(summary.providers).toContain('groq')
    expect(summary.providers).toContain('workers_ai')
  })
})
