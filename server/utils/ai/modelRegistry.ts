import { CLAUDE_MODELS } from '~~/server/utils/claudeClient'
import { GROQ_AUDIO_MODELS, GROQ_MODELS } from '~~/server/utils/groqClient'
import { listSelectableVideoGenerationModels } from '~~/server/utils/video-generation/modelRegistry'
import { listAssetIntelligenceModels } from '~~/server/utils/video-asset-intelligence/registry'

export type AiModelStatus = 'production' | 'preview' | 'deprecated' | 'unknown'
export type AiRiskTier = 'low' | 'medium' | 'high'

export interface AiModelPricing {
  inputPricePerMillionUsd?: number
  outputPricePerMillionUsd?: number
  cachedInputPricePerMillionUsd?: number
  unitPriceCents?: number
  unitName?: string
}

export interface AiModelMapRow {
  featureKey: string
  label: string
  surface: string
  owner: string
  provider: string
  modelId: string
  fallback: string | null
  modality: 'text' | 'vision' | 'image' | 'audio' | 'video' | 'multimodal'
  riskTier: AiRiskTier
  sourceFile: string
  status: AiModelStatus
  pricing: AiModelPricing | null
  warnings: string[]
}

interface FeatureSeed {
  featureKey: string
  label: string
  surface: string
  owner: string
  provider: string
  modelId: string
  fallback?: string | null
  modality: AiModelMapRow['modality']
  riskTier: AiRiskTier
  sourceFile: string
}

interface ModelCatalogEntry {
  status: AiModelStatus
  pricing?: AiModelPricing
}

export interface AiModelCatalogOption {
  provider: string
  modelId: string
  status: AiModelStatus
  pricing: AiModelPricing | null
  warnings: string[]
}

const DEFAULT_AI_LOOP_MODEL = 'groq/openai/gpt-oss-120b'
const DEFAULT_AI_LOOP_FALLBACK_MODEL = 'groq/openai/gpt-oss-20b'
const DEFAULT_PLATFORM_AGENT_THINK_MODEL = '@cf/moonshotai/kimi-k2.7-code'

const MODEL_CATALOG: Record<string, ModelCatalogEntry> = {
  [GROQ_MODELS.REASONING_120B]: {
    status: 'production',
    pricing: { inputPricePerMillionUsd: 0.15, outputPricePerMillionUsd: 0.60 }
  },
  [GROQ_MODELS.REASONING_20B]: {
    status: 'production',
    pricing: { inputPricePerMillionUsd: 0.10, outputPricePerMillionUsd: 0.40 }
  },
  [GROQ_MODELS.LLAMA_70B]: {
    status: 'production',
    pricing: { inputPricePerMillionUsd: 0.59, outputPricePerMillionUsd: 0.79 }
  },
  [GROQ_MODELS.LLAMA_8B]: {
    status: 'production',
    pricing: { inputPricePerMillionUsd: 0.05, outputPricePerMillionUsd: 0.08 }
  },
  [GROQ_MODELS.LLAMA_4_SCOUT]: {
    status: 'preview'
  },
  [GROQ_MODELS.QWEN3_32B]: {
    status: 'preview'
  },
  [GROQ_AUDIO_MODELS.WHISPER_LARGE_V3]: {
    status: 'production'
  },
  [GROQ_AUDIO_MODELS.WHISPER_LARGE_V3_TURBO]: {
    status: 'production'
  },
  [CLAUDE_MODELS.SONNET_4_6]: {
    status: 'production',
    pricing: { inputPricePerMillionUsd: 3, outputPricePerMillionUsd: 15 }
  },
  [CLAUDE_MODELS.OPUS_4_7]: {
    status: 'production'
  },
  [CLAUDE_MODELS.HAIKU_4_5]: {
    status: 'production'
  },
  '@cf/openai/whisper-large-v3-turbo': {
    status: 'production'
  },
  '@cf/myshell-ai/melotts': {
    status: 'production'
  },
  'minimax/music-2.6': {
    status: 'production'
  },
  '@cf/moonshotai/kimi-k2-instruct': {
    status: 'production'
  },
  [DEFAULT_PLATFORM_AGENT_THINK_MODEL]: {
    status: 'production',
    pricing: {
      inputPricePerMillionUsd: 0.95,
      outputPricePerMillionUsd: 4,
      cachedInputPricePerMillionUsd: 0.19
    }
  },
  '@cf/meta/llama-3.1-8b-instruct': {
    status: 'production'
  },
  '@cf/meta/llama-3.1-8b-instruct-fast': {
    status: 'production'
  },
  '@cf/black-forest-labs/flux-1-schnell': {
    status: 'production'
  },
  'Qwen/Qwen-Image-2512': {
    status: 'production'
  },
  'Qwen/Qwen-Image-Edit-2511': {
    status: 'production'
  },
  'Qwen/Qwen-Image-Layered': {
    status: 'production'
  },
  'recraft/recraftv4-1': {
    status: 'production'
  },
  'pruna/p-image-upscale': {
    status: 'production'
  },
  'qwen/qwen3.6-27b': {
    status: 'production'
  }
}

const FEATURE_SEEDS: FeatureSeed[] = [
  {
    featureKey: 'social_spend_ai_analysis',
    label: 'Social spend review panel analysis',
    surface: '/agency/social/spend',
    owner: 'Growth',
    provider: 'groq',
    modelId: GROQ_MODELS.REASONING_120B,
    modality: 'text',
    riskTier: 'high',
    sourceFile: 'server/api/agency/social/spend/[id]/ai-analysis.post.ts'
  },
  {
    featureKey: 'social_spend_pacing_summary',
    label: 'Social spend pacing summary',
    surface: '/agency/social/spend',
    owner: 'Growth',
    provider: 'groq',
    modelId: GROQ_MODELS.LLAMA_8B,
    modality: 'text',
    riskTier: 'medium',
    sourceFile: 'server/api/agency/social/spend/pacing-review.get.ts'
  },
  {
    featureKey: 'agent_spend_controller',
    label: 'Spend Controller Agent',
    surface: '/agency/social/spend',
    owner: 'Growth',
    provider: 'workers_ai',
    modelId: DEFAULT_PLATFORM_AGENT_THINK_MODEL,
    fallback: null,
    modality: 'text',
    riskTier: 'high',
    sourceFile: 'workers/platform-agents/src/index.ts'
  },
  {
    featureKey: 'agent_publishing_planner',
    label: 'Publishing Planner Agent',
    surface: '/agency/social/publishing/planner',
    owner: 'Creative',
    provider: 'workers_ai',
    modelId: DEFAULT_PLATFORM_AGENT_THINK_MODEL,
    fallback: null,
    modality: 'text',
    riskTier: 'high',
    sourceFile: 'workers/platform-agents/src/index.ts'
  },
  {
    featureKey: 'agent_financial_watch',
    label: 'Financial Watch Agent',
    surface: '/agency/ai/finance',
    owner: 'Finance',
    provider: 'workers_ai',
    modelId: DEFAULT_PLATFORM_AGENT_THINK_MODEL,
    fallback: null,
    modality: 'text',
    riskTier: 'high',
    sourceFile: 'workers/platform-agents/src/index.ts'
  },
  {
    featureKey: 'agent_traffic_controller',
    label: 'Traffic Controller Agent',
    surface: '/agency/social/spend',
    owner: 'Growth',
    provider: 'workers_ai',
    modelId: DEFAULT_PLATFORM_AGENT_THINK_MODEL,
    fallback: null,
    modality: 'text',
    riskTier: 'high',
    sourceFile: 'workers/platform-agents/src/index.ts'
  },
  {
    featureKey: 'agent_office_watch',
    label: 'Office Watch Agent',
    surface: '/office',
    owner: 'Operations',
    provider: 'groq',
    modelId: GROQ_MODELS.REASONING_20B,
    fallback: GROQ_MODELS.LLAMA_8B,
    modality: 'text',
    riskTier: 'medium',
    sourceFile: 'workers/platform-agents/src/agents/OfficeWatchAgent.ts'
  },
  {
    featureKey: 'agency_ai_tool_loop',
    label: 'Agency AI tool loop',
    surface: '/agency/ai',
    owner: 'Platform',
    provider: 'groq',
    modelId: DEFAULT_AI_LOOP_MODEL,
    fallback: DEFAULT_AI_LOOP_FALLBACK_MODEL,
    modality: 'text',
    riskTier: 'high',
    sourceFile: 'server/utils/ai/toolLoop.ts'
  },
  {
    featureKey: 'ai_agent_digest_report',
    label: 'AI agent digest report generator',
    surface: '/agency/ai/agent',
    owner: 'Platform',
    provider: 'groq',
    modelId: GROQ_MODELS.LLAMA_70B,
    modality: 'text',
    riskTier: 'medium',
    sourceFile: 'server/utils/aiAgentRunner.ts'
  },
  {
    featureKey: 'agency_ai_l2_classifier',
    label: 'Agency AI L2 traffic classifier',
    surface: '/agency/ai',
    owner: 'Platform',
    provider: 'groq',
    modelId: GROQ_MODELS.REASONING_20B,
    modality: 'text',
    riskTier: 'medium',
    sourceFile: 'server/utils/aiChatEngine.ts'
  },
  {
    featureKey: 'agency_ai_l2_specialist_loop',
    label: 'Agency AI L2 read-only specialist loop',
    surface: '/agency/ai',
    owner: 'Platform',
    provider: 'groq',
    modelId: DEFAULT_AI_LOOP_MODEL,
    fallback: DEFAULT_AI_LOOP_FALLBACK_MODEL,
    modality: 'text',
    riskTier: 'high',
    sourceFile: 'server/utils/aiChatEngine.ts'
  },
  {
    featureKey: 'agency_ai_l2_synthesis',
    label: 'Agency AI L2 synthesis',
    surface: '/agency/ai',
    owner: 'Platform',
    provider: 'groq',
    modelId: GROQ_MODELS.REASONING_120B,
    modality: 'text',
    riskTier: 'high',
    sourceFile: 'server/utils/aiChatEngine.ts'
  },
  {
    featureKey: 'agency_ai_single_shot_fallback',
    label: 'Agency AI single-shot fallback',
    surface: '/agency/ai',
    owner: 'Platform',
    provider: 'groq',
    modelId: DEFAULT_AI_LOOP_MODEL,
    fallback: GROQ_MODELS.LLAMA_8B,
    modality: 'text',
    riskTier: 'medium',
    sourceFile: 'server/utils/aiChatEngine.ts'
  },
  {
    featureKey: 'agency_ai_intent_lora_classifier',
    label: 'Agency AI intent LoRA classifier',
    surface: '/agency/ai',
    owner: 'Platform',
    provider: 'workers_ai',
    modelId: '@cf/meta/llama-3.1-8b-instruct-fast',
    fallback: '@cf/meta/llama-3.1-8b-instruct',
    modality: 'text',
    riskTier: 'medium',
    sourceFile: 'server/utils/aiIntentClassifier.ts'
  },
  {
    featureKey: 'agency_ai_intent_edge_classifier',
    label: 'Agency AI intent edge classifier',
    surface: '/agency/ai',
    owner: 'Platform',
    provider: 'workers_ai',
    modelId: '@cf/meta/llama-3.1-8b-instruct',
    modality: 'text',
    riskTier: 'medium',
    sourceFile: 'server/utils/aiIntentClassifier.ts'
  },
  {
    featureKey: 'agency_ai_intent_groq_classifier',
    label: 'Agency AI intent Groq fallback classifier',
    surface: '/agency/ai',
    owner: 'Platform',
    provider: 'groq',
    modelId: GROQ_MODELS.LLAMA_8B,
    modality: 'text',
    riskTier: 'medium',
    sourceFile: 'server/utils/aiIntentClassifier.ts'
  },
  {
    featureKey: 'portal_ai_tool_loop',
    label: 'Portal AI tool loop',
    surface: '/portal',
    owner: 'Platform',
    provider: 'groq',
    modelId: DEFAULT_AI_LOOP_MODEL,
    fallback: DEFAULT_AI_LOOP_FALLBACK_MODEL,
    modality: 'text',
    riskTier: 'high',
    sourceFile: 'server/utils/ai/portalLoop.ts'
  },
  {
    featureKey: 'ai_memory_distillation',
    label: 'AI memory distillation',
    surface: '/agency/ai',
    owner: 'Platform',
    provider: 'groq',
    modelId: GROQ_MODELS.REASONING_20B,
    modality: 'text',
    riskTier: 'medium',
    sourceFile: 'server/utils/ai/memory/orchestrate.ts'
  },
  {
    featureKey: 'observe_and_learn_distillation',
    label: 'Observe-and-learn routine distillation',
    surface: '/api/cron/observe-and-learn',
    owner: 'Platform',
    provider: 'groq',
    modelId: GROQ_MODELS.REASONING_20B,
    modality: 'text',
    riskTier: 'medium',
    sourceFile: 'server/api/cron/observe-and-learn.post.ts'
  },
  {
    featureKey: 'financial_advisor',
    label: 'Financial advisor',
    surface: '/ai/financial-advisor',
    owner: 'Finance',
    provider: 'groq',
    modelId: GROQ_MODELS.REASONING_120B,
    fallback: GROQ_MODELS.LLAMA_70B,
    modality: 'text',
    riskTier: 'high',
    sourceFile: 'server/api/ai/financial-advisor.get.ts'
  },
  {
    featureKey: 'xero_invoice_ai_briefing',
    label: 'Xero invoice AI briefing',
    surface: '/invoices',
    owner: 'Finance',
    provider: 'groq',
    modelId: GROQ_MODELS.REASONING_120B,
    modality: 'text',
    riskTier: 'high',
    sourceFile: 'server/api/xero/invoices/ai-briefing.get.ts'
  },
  {
    featureKey: 'customer_insights_summary',
    label: 'Customer insights AI summary',
    surface: '/customers/:contactId/insights',
    owner: 'Finance',
    provider: 'groq',
    modelId: GROQ_MODELS.LLAMA_70B,
    modality: 'text',
    riskTier: 'medium',
    sourceFile: 'server/api/customers/[contactId]/insights.get.ts'
  },
  {
    featureKey: 'cashflow_insights',
    label: 'Cashflow insights generator',
    surface: '/ai/cashflow-insights',
    owner: 'Finance',
    provider: 'groq',
    modelId: GROQ_MODELS.LLAMA_8B,
    modality: 'text',
    riskTier: 'high',
    sourceFile: 'server/api/ai/cashflow-insights.post.ts'
  },
  {
    featureKey: 'expense_insights',
    label: 'Expense insights generator',
    surface: '/ai/expense-insights',
    owner: 'Finance',
    provider: 'groq',
    modelId: GROQ_MODELS.LLAMA_70B,
    modality: 'text',
    riskTier: 'high',
    sourceFile: 'server/api/ai/expense-insights.get.ts'
  },
  {
    featureKey: 'anomaly_driver_narrative',
    label: 'Anomaly driver narrative',
    surface: '/ai/anomalies/:id/narrative',
    owner: 'Finance',
    provider: 'groq',
    modelId: GROQ_MODELS.LLAMA_70B,
    modality: 'text',
    riskTier: 'high',
    sourceFile: 'server/api/ai/anomalies/[id]/narrative.get.ts'
  },
  {
    featureKey: 'action_plan_generation',
    label: 'Financial action plan generator',
    surface: '/ai/action-plan',
    owner: 'Finance',
    provider: 'groq',
    modelId: GROQ_MODELS.LLAMA_70B,
    modality: 'text',
    riskTier: 'high',
    sourceFile: 'server/api/ai/action-plan.post.ts'
  },
  {
    featureKey: 'financial_insights_headline',
    label: 'Financial insights executive headline',
    surface: '/ai/insights',
    owner: 'Finance',
    provider: 'groq',
    modelId: GROQ_MODELS.LLAMA_8B,
    modality: 'text',
    riskTier: 'medium',
    sourceFile: 'server/api/ai/insights.get.ts'
  },
  {
    featureKey: 'financial_insights_recommendations',
    label: 'Financial insights recommendation enhancement',
    surface: '/ai/insights',
    owner: 'Finance',
    provider: 'groq',
    modelId: GROQ_MODELS.LLAMA_8B,
    modality: 'text',
    riskTier: 'high',
    sourceFile: 'server/api/ai/insights.get.ts'
  },
  {
    featureKey: 'budget_change_sanity_check',
    label: 'Budget change sanity check',
    surface: '/agency/ai',
    owner: 'Growth',
    provider: 'groq',
    modelId: GROQ_MODELS.REASONING_20B,
    modality: 'text',
    riskTier: 'high',
    sourceFile: 'server/utils/ai/tools/proposeBudgetChange.ts'
  },
  {
    featureKey: 'social_publishing_plan',
    label: 'Social publishing planner',
    surface: '/agency/social/publishing',
    owner: 'Creative',
    provider: 'groq',
    modelId: GROQ_MODELS.LLAMA_70B,
    modality: 'text',
    riskTier: 'medium',
    sourceFile: 'server/api/agency/social/publishing/ai/generate-plan.post.ts'
  },
  {
    featureKey: 'social_publishing_caption',
    label: 'Social publishing caption generator',
    surface: '/agency/social/publishing',
    owner: 'Creative',
    provider: 'groq',
    modelId: GROQ_MODELS.LLAMA_70B,
    modality: 'text',
    riskTier: 'medium',
    sourceFile: 'server/api/agency/social/publishing/ai/generate-caption.post.ts'
  },
  {
    featureKey: 'social_reporting_ai_summary',
    label: 'Social reporting AI summary',
    surface: '/agency/social/reporting',
    owner: 'Growth',
    provider: 'groq',
    modelId: GROQ_MODELS.LLAMA_70B,
    modality: 'text',
    riskTier: 'medium',
    sourceFile: 'server/utils/socialReporting/aiSummary.ts'
  },
  {
    featureKey: 'social_inbox_reply_draft',
    label: 'Social inbox reply draft',
    surface: '/agency/social/inbox',
    owner: 'Support',
    provider: 'groq',
    modelId: GROQ_MODELS.LLAMA_70B,
    modality: 'text',
    riskTier: 'high',
    sourceFile: 'server/utils/socialInbox/aiDraft.ts'
  },
  {
    featureKey: 'social_listening_enrichment',
    label: 'Social listening mention enrichment',
    surface: '/agency/social/listening',
    owner: 'Growth',
    provider: 'groq',
    modelId: GROQ_MODELS.LLAMA_8B,
    modality: 'text',
    riskTier: 'medium',
    sourceFile: 'server/api/cron/sync-social-listening.post.ts'
  },
  {
    featureKey: 'crm_followup_draft',
    label: 'CRM follow-up draft',
    surface: '/agency/crm',
    owner: 'Sales',
    provider: 'groq',
    modelId: GROQ_MODELS.LLAMA_70B,
    modality: 'text',
    riskTier: 'medium',
    sourceFile: 'server/utils/crm/aiDraft.ts'
  },
  {
    featureKey: 'banner_image_suggest',
    label: 'Banner Studio image suggestion',
    surface: '/agency/banner-studio',
    owner: 'Creative',
    provider: 'workers_ai',
    modelId: '@cf/meta/llama-3.1-8b-instruct',
    fallback: GROQ_MODELS.LLAMA_8B,
    modality: 'text',
    riskTier: 'medium',
    sourceFile: 'server/api/agency/banner-studio/ai/image-suggest.post.ts'
  },
  {
    featureKey: 'banner_image_generation',
    label: 'Banner Studio text-to-image generation',
    surface: '/agency/banner-studio',
    owner: 'Creative',
    provider: 'aigateway',
    modelId: 'recraft/recraftv4-1',
    modality: 'image',
    riskTier: 'high',
    sourceFile: 'server/utils/creative-generation/aiGatewayProvider.ts'
  },
  {
    featureKey: 'banner_image_upscale',
    label: 'Banner Studio approved-source image upscale',
    surface: '/agency/banner-studio + MCP',
    owner: 'Creative',
    provider: 'aigateway',
    modelId: 'pruna/p-image-upscale',
    modality: 'image',
    riskTier: 'high',
    sourceFile: 'server/utils/creative-generation/aiGatewayProvider.ts'
  },
  {
    featureKey: 'creative_compliance_preflight',
    label: 'Creative vision compliance pre-flight',
    surface: '/agency/banner-studio + MCP',
    owner: 'Creative',
    provider: 'groq',
    modelId: 'qwen/qwen3.6-27b',
    modality: 'vision',
    riskTier: 'high',
    sourceFile: 'server/utils/creativeCompliance.ts'
  },
  {
    featureKey: 'banner_image_edit',
    label: 'Banner Studio image editing',
    surface: '/agency/banner-studio',
    owner: 'Creative',
    provider: 'huggingface_space',
    modelId: 'Qwen/Qwen-Image-Edit-2511',
    modality: 'image',
    riskTier: 'high',
    sourceFile: 'server/utils/qwenImageEditor.ts'
  },
  {
    featureKey: 'banner_image_layer_decomposition',
    label: 'Banner Studio image layer decomposition',
    surface: '/agency/banner-studio',
    owner: 'Creative',
    provider: 'huggingface_space',
    modelId: 'Qwen/Qwen-Image-Layered',
    modality: 'image',
    riskTier: 'high',
    sourceFile: 'server/utils/qwenLayerDecomposer.ts'
  },
  {
    featureKey: 'banner_copy_suggest',
    label: 'Banner Studio copy suggestion',
    surface: '/agency/banner-studio',
    owner: 'Creative',
    provider: 'workers_ai',
    modelId: '@cf/meta/llama-3.1-8b-instruct',
    fallback: GROQ_MODELS.LLAMA_8B,
    modality: 'text',
    riskTier: 'medium',
    sourceFile: 'server/api/agency/banner-studio/ai/copy-suggest.post.ts'
  },
  {
    featureKey: 'banner_code_assist',
    label: 'Banner Studio code assist',
    surface: '/agency/banner-studio',
    owner: 'Creative',
    provider: 'workers_ai',
    modelId: '@cf/meta/llama-3.1-8b-instruct',
    fallback: GROQ_MODELS.LLAMA_70B,
    modality: 'text',
    riskTier: 'high',
    sourceFile: 'server/api/agency/banner-studio/ai/code-assist.post.ts'
  },
  {
    featureKey: 'task_wiki_summary',
    label: 'Task wiki summary',
    surface: '/agency/tasks/:id/wiki',
    owner: 'Ops',
    provider: 'groq',
    modelId: GROQ_MODELS.LLAMA_70B,
    modality: 'multimodal',
    riskTier: 'medium',
    sourceFile: 'server/utils/taskWiki.ts'
  },
  {
    featureKey: 'agency_task_assist_creation',
    label: 'Agency task creation assistant',
    surface: '/agency/tasks',
    owner: 'Ops',
    provider: 'groq',
    modelId: GROQ_MODELS.LLAMA_70B,
    modality: 'text',
    riskTier: 'medium',
    sourceFile: 'server/api/agency/ai/task-assist.post.ts'
  },
  {
    featureKey: 'agency_task_assist_analysis',
    label: 'Agency task analysis assistant',
    surface: '/agency/tasks',
    owner: 'Ops',
    provider: 'groq',
    modelId: GROQ_MODELS.LLAMA_70B,
    modality: 'text',
    riskTier: 'medium',
    sourceFile: 'server/api/agency/ai/task-assist.post.ts'
  },
  {
    featureKey: 'board_automation_ai_insight',
    label: 'Board automation AI insight',
    surface: '/agency/boards',
    owner: 'Ops',
    provider: 'groq',
    modelId: GROQ_MODELS.LLAMA_8B,
    modality: 'text',
    riskTier: 'medium',
    sourceFile: 'server/utils/automationEngine.ts'
  },
  {
    featureKey: 'board_automation_ai_summary',
    label: 'Board automation AI summary',
    surface: '/agency/boards',
    owner: 'Ops',
    provider: 'groq',
    modelId: GROQ_MODELS.LLAMA_8B,
    modality: 'text',
    riskTier: 'medium',
    sourceFile: 'server/utils/automationEngine.ts'
  },
  {
    featureKey: 'agency_analytics_ai_summary',
    label: 'Agency analytics AI summary',
    surface: '/agency/analytics',
    owner: 'Growth',
    provider: 'workers_ai',
    modelId: '@cf/meta/llama-3.1-8b-instruct',
    modality: 'text',
    riskTier: 'medium',
    sourceFile: 'server/api/agency/analytics/ai-summary.post.ts'
  },
  {
    featureKey: 'agency_analytics_ask',
    label: 'Agency analytics natural-language Q&A',
    surface: '/agency/analytics',
    owner: 'Growth',
    provider: 'groq',
    modelId: GROQ_MODELS.LLAMA_70B,
    modality: 'text',
    riskTier: 'medium',
    sourceFile: 'server/api/agency/analytics/ask.post.ts'
  },
  {
    featureKey: 'agency_audience_analytics_ask',
    label: 'Website audience analytics Q&A',
    surface: '/agency/analytics/audiences',
    owner: 'Growth',
    provider: 'groq',
    modelId: GROQ_MODELS.LLAMA_70B,
    modality: 'text',
    riskTier: 'medium',
    sourceFile: 'server/api/agency/tracking/audiences/ask.post.ts'
  },
  {
    featureKey: 'site_intelligence_enrichment',
    label: 'Automotive site intelligence enrichment',
    surface: '/agency/analytics/audiences/intelligence',
    owner: 'Growth',
    provider: 'groq',
    modelId: GROQ_MODELS.LLAMA_8B,
    modality: 'text',
    riskTier: 'medium',
    sourceFile: 'server/utils/siteIntelligence/enrich.ts'
  },
  {
    featureKey: 'rate_card_description',
    label: 'Rate card service description',
    surface: '/agency/rate-cards',
    owner: 'Operations',
    provider: 'groq',
    modelId: GROQ_MODELS.LLAMA_70B,
    modality: 'text',
    riskTier: 'medium',
    sourceFile: 'server/api/agency/rate-cards/generate-description.post.ts'
  },
  {
    featureKey: 'notification_digest_narrative',
    label: 'Notification digest board narrative',
    surface: '/notifications/digest',
    owner: 'Platform',
    provider: 'groq',
    modelId: GROQ_MODELS.LLAMA_8B,
    modality: 'text',
    riskTier: 'low',
    sourceFile: 'server/api/notifications/digest.get.ts'
  },
  {
    featureKey: 'notification_why_explanation',
    label: 'Notification why explanation',
    surface: '/notifications/:id/why',
    owner: 'Platform',
    provider: 'groq',
    modelId: GROQ_MODELS.LLAMA_8B,
    modality: 'text',
    riskTier: 'low',
    sourceFile: 'server/api/notifications/[id]/why.get.ts'
  },
  {
    featureKey: 'task_assignment_auto_ack',
    label: 'Task assignment auto-ack draft',
    surface: 'task assignment notifications',
    owner: 'Ops',
    provider: 'groq',
    modelId: GROQ_MODELS.LLAMA_8B,
    modality: 'text',
    riskTier: 'medium',
    sourceFile: 'server/utils/notifications.ts'
  },
  {
    featureKey: 'office_recording_transcription',
    label: 'Office recording transcription',
    surface: '/office',
    owner: 'Ops',
    provider: 'groq',
    modelId: GROQ_AUDIO_MODELS.WHISPER_LARGE_V3_TURBO,
    modality: 'audio',
    riskTier: 'medium',
    sourceFile: 'server/utils/officeTranscription.ts'
  },
  {
    featureKey: 'office_meeting_cross_search',
    label: 'Office meeting cross-meeting search',
    surface: '/office/:officeId/meetings/search',
    owner: 'Ops',
    provider: 'groq',
    modelId: GROQ_MODELS.LLAMA_70B,
    modality: 'text',
    riskTier: 'medium',
    sourceFile: 'server/api/office/[officeId]/meetings/search.post.ts'
  },
  {
    featureKey: 'office_meeting_question_answer',
    label: 'Office meeting question answering',
    surface: '/office/:officeId/meetings/:meetingId/ask',
    owner: 'Ops',
    provider: 'groq',
    modelId: GROQ_MODELS.LLAMA_70B,
    modality: 'text',
    riskTier: 'medium',
    sourceFile: 'server/api/office/[officeId]/meetings/[meetingId]/ask.post.ts'
  },
  {
    featureKey: 'agency_ai_voice_stt',
    label: 'Agency AI voice transcription',
    surface: '/agency/ai',
    owner: 'Platform',
    provider: 'workers_ai',
    modelId: '@cf/openai/whisper-large-v3-turbo',
    modality: 'audio',
    riskTier: 'medium',
    sourceFile: 'server/utils/aiVoice.ts'
  },
  {
    featureKey: 'agency_ai_voice_tts',
    label: 'Agency AI voice synthesis',
    surface: '/agency/ai',
    owner: 'Platform',
    provider: 'workers_ai',
    modelId: '@cf/myshell-ai/melotts',
    modality: 'audio',
    riskTier: 'medium',
    sourceFile: 'server/utils/aiVoice.ts'
  },
  {
    featureKey: 'workers_ai_speech_to_text',
    label: 'Workers AI shared speech-to-text',
    surface: 'shared voice helper',
    owner: 'Platform',
    provider: 'workers_ai',
    modelId: '@cf/openai/whisper-large-v3-turbo',
    modality: 'audio',
    riskTier: 'medium',
    sourceFile: 'server/utils/aiVoice.ts'
  },
  {
    featureKey: 'workers_ai_text_to_speech',
    label: 'Workers AI shared text-to-speech',
    surface: 'shared voice helper',
    owner: 'Platform',
    provider: 'workers_ai',
    modelId: '@cf/myshell-ai/melotts',
    modality: 'audio',
    riskTier: 'medium',
    sourceFile: 'server/utils/aiVoice.ts'
  },
  {
    featureKey: 'audio_music_generation',
    label: 'Audio music generation',
    surface: '/agency/audio',
    owner: 'Media Studio',
    provider: 'workers_ai',
    modelId: 'minimax/music-2.6',
    modality: 'audio',
    riskTier: 'high',
    sourceFile: 'workers/audio-jobs/src/musicWorker.ts'
  },
  {
    featureKey: 'audio_music_generation_worker_runtime',
    label: 'Audio music generation worker runtime',
    surface: 'audio-jobs Worker',
    owner: 'Media Studio',
    provider: 'workers_ai',
    modelId: 'minimax/music-2.6',
    modality: 'audio',
    riskTier: 'high',
    sourceFile: 'workers/audio-jobs/src/musicWorker.ts'
  },
  {
    featureKey: 'video_generation_worker_runtime',
    label: 'Video generation worker runtime',
    surface: 'video-generation Worker',
    owner: 'Media Studio',
    provider: 'aigateway',
    modelId: 'bytedance/seedance-2.0-fast',
    modality: 'video',
    riskTier: 'high',
    sourceFile: 'workers/video-generation/src/worker.ts'
  },
  {
    featureKey: 'video_generation_completion',
    label: 'Video generation async completion',
    surface: 'video-generation webhook/reconcile',
    owner: 'Media Studio',
    provider: 'aigateway',
    modelId: 'bytedance/seedance-2.0-fast',
    modality: 'video',
    riskTier: 'high',
    sourceFile: 'server/utils/video-generation/finalize.ts'
  },
  {
    featureKey: 'video_asset_publish_social_caption',
    label: 'Video asset social caption draft',
    surface: '/agency/video/assets/:id/publish-social',
    owner: 'Media Studio',
    provider: 'groq',
    modelId: GROQ_MODELS.LLAMA_70B,
    modality: 'text',
    riskTier: 'medium',
    sourceFile: 'server/api/agency/video/assets/[id]/publish-social.post.ts'
  },
  {
    featureKey: 'video_project_ai_assembly',
    label: 'Video project AI assembly',
    surface: '/agency/video/projects/:id/assemble',
    owner: 'Media Studio',
    provider: 'groq',
    modelId: GROQ_MODELS.LLAMA_70B,
    modality: 'text',
    riskTier: 'medium',
    sourceFile: 'server/api/agency/video/projects/[id]/assemble.post.ts'
  },
  {
    featureKey: 'video_asset_intelligence_worker_runtime',
    label: 'Video asset intelligence worker runtime',
    surface: 'asset-intelligence Worker',
    owner: 'Media Studio',
    provider: 'workers-ai',
    modelId: '@cf/moonshotai/kimi-k2-instruct',
    modality: 'vision',
    riskTier: 'high',
    sourceFile: 'workers/asset-intelligence/src/worker.ts'
  },
  {
    featureKey: 'audio_render_publish_social_caption',
    label: 'Audio render social caption draft',
    surface: '/agency/audio/projects/:id/renders/:jobId/publish-social',
    owner: 'Media Studio',
    provider: 'groq',
    modelId: GROQ_MODELS.LLAMA_70B,
    modality: 'text',
    riskTier: 'medium',
    sourceFile: 'server/api/agency/audio/projects/[id]/renders/[jobId]/publish-social.post.ts'
  },
  {
    featureKey: 'workers_ai_edge_generate',
    label: 'Workers AI edge generation',
    surface: 'shared edge helper',
    owner: 'Platform',
    provider: 'workers_ai',
    modelId: '@cf/meta/llama-3.1-8b-instruct',
    fallback: null,
    modality: 'text',
    riskTier: 'medium',
    sourceFile: 'server/utils/edgeAi.ts'
  },
  {
    featureKey: 'workers_ai_edge_classify',
    label: 'Workers AI edge classification',
    surface: 'shared edge helper',
    owner: 'Platform',
    provider: 'workers_ai',
    modelId: '@cf/meta/llama-3.1-8b-instruct',
    fallback: null,
    modality: 'text',
    riskTier: 'medium',
    sourceFile: 'server/utils/edgeAi.ts'
  },
  {
    featureKey: 'workers_ai_edge_summarize',
    label: 'Workers AI edge summarization',
    surface: 'shared edge helper',
    owner: 'Platform',
    provider: 'workers_ai',
    modelId: '@cf/meta/llama-3.1-8b-instruct',
    fallback: null,
    modality: 'text',
    riskTier: 'medium',
    sourceFile: 'server/utils/edgeAi.ts'
  },
  {
    featureKey: 'workers_ai_edge_generate_lora',
    label: 'Workers AI edge LoRA generation',
    surface: 'shared edge helper',
    owner: 'Platform',
    provider: 'workers_ai',
    modelId: '@cf/meta/llama-3.1-8b-instruct-fast',
    fallback: '@cf/meta/llama-3.1-8b-instruct',
    modality: 'text',
    riskTier: 'medium',
    sourceFile: 'server/utils/edgeAi.ts'
  }
]

export function metadataForModel(modelId: string): ModelCatalogEntry {
  const normalized = modelId.replace(/^groq\//, '').replace(/^anthropic\//, '')
  return MODEL_CATALOG[modelId] || MODEL_CATALOG[normalized] || { status: 'unknown' }
}

export function buildWarnings(modelId: string, entry: ModelCatalogEntry): string[] {
  const warnings: string[] = []
  if (entry.status === 'preview') warnings.push('Preview model')
  if (entry.status === 'deprecated') warnings.push('Deprecated model')
  if (entry.status === 'unknown') warnings.push('Model metadata not catalogued')
  const pricing = entry.pricing
  const hasTokenPricing = pricing && (pricing.inputPricePerMillionUsd != null || pricing.outputPricePerMillionUsd != null)
  const hasUnitPricing = pricing && pricing.unitPriceCents != null
  if (!hasTokenPricing && !hasUnitPricing) warnings.push('Pricing not yet mapped')
  if (modelId.includes('workersai/') || modelId.startsWith('@cf/')) warnings.push('Workers AI pricing should be validated against neuron billing')
  return warnings
}

export function providerForModel(modelId: string) {
  if (modelId.startsWith('@cf/')) return 'workers_ai'
  if (modelId.startsWith('groq/')) return 'groq'
  if (modelId.startsWith('anthropic/')) return 'anthropic'
  if (modelId.startsWith('minimax/')) return 'minimax'
  if (modelId.startsWith('Qwen/')) return 'huggingface_space'
  if (modelId.includes('claude')) return 'anthropic'
  return 'groq'
}

export function listAiModelCatalogOptions(): AiModelCatalogOption[] {
  return Object.keys(MODEL_CATALOG)
    .map((modelId) => {
      const meta = metadataForModel(modelId)
      return {
        provider: providerForModel(modelId),
        modelId,
        status: meta.status,
        pricing: meta.pricing ?? null,
        warnings: buildWarnings(modelId, meta)
      }
    })
    .sort((a, b) => a.provider.localeCompare(b.provider) || a.modelId.localeCompare(b.modelId))
}

/** Pure provider-scoped lookup used before converting trusted text-token prices. */
export function getAiModelCatalogOption(provider: string, modelId: string): AiModelCatalogOption | null {
  const prefix = provider === 'workers_ai' ? 'workersai/' : `${provider}/`
  const normalizedModelId = modelId.startsWith(prefix) ? modelId.slice(prefix.length) : modelId
  return listAiModelCatalogOptions().find(
    option => option.provider === provider && option.modelId === normalizedModelId
  ) ?? null
}

function toRow(seed: FeatureSeed): AiModelMapRow {
  const meta = metadataForModel(seed.modelId)
  return {
    featureKey: seed.featureKey,
    label: seed.label,
    surface: seed.surface,
    owner: seed.owner,
    provider: seed.provider,
    modelId: seed.modelId,
    fallback: seed.fallback ?? null,
    modality: seed.modality,
    riskTier: seed.riskTier,
    sourceFile: seed.sourceFile,
    status: meta.status,
    pricing: meta.pricing ?? null,
    warnings: buildWarnings(seed.modelId, meta)
  }
}

function buildVideoGenerationRows(): AiModelMapRow[] {
  return listSelectableVideoGenerationModels().map(model => ({
    featureKey: 'video_generation_job',
    label: `Video generation: ${model.displayName}`,
    surface: '/agency/video',
    owner: 'Media Studio',
    provider: model.provider,
    modelId: model.cfModel || model.id,
    fallback: null,
    modality: 'video',
    riskTier: 'high',
    sourceFile: 'server/utils/video-generation/modelRegistry.ts',
    status: 'production',
    pricing: model.estimatedCostCents != null
      ? { unitPriceCents: model.estimatedCostCents, unitName: model.costUnit }
      : null,
    warnings: model.estimatedCostCents != null ? [] : ['Pricing not yet mapped']
  }))
}

function buildAssetIntelligenceRows(): AiModelMapRow[] {
  return listAssetIntelligenceModels().map(model => ({
    featureKey: 'video_asset_intelligence_job',
    label: `Video asset intelligence: ${model.displayName}`,
    surface: '/agency/video',
    owner: 'Media Studio',
    provider: model.provider,
    modelId: model.cfModel || model.id,
    fallback: null,
    modality: model.actions.includes('caption-generation') ? 'audio' : 'vision',
    riskTier: model.defaultEnabled ? 'high' : 'medium',
    sourceFile: 'server/utils/video-asset-intelligence/registry.ts',
    status: model.defaultEnabled ? 'production' : 'preview',
    pricing: null,
    warnings: ['Pricing not yet mapped']
  }))
}

export function listAiModelMap(): AiModelMapRow[] {
  return [...FEATURE_SEEDS.map(toRow), ...buildVideoGenerationRows(), ...buildAssetIntelligenceRows()]
    .sort((a, b) => a.featureKey.localeCompare(b.featureKey) || a.modelId.localeCompare(b.modelId))
}

export function getAiModelMapSummary(rows = listAiModelMap()) {
  const warningCount = rows.reduce((sum, row) => sum + row.warnings.length, 0)
  return {
    totalRows: rows.length,
    providers: Array.from(new Set(rows.map(row => row.provider))).sort(),
    highRiskCount: rows.filter(row => row.riskTier === 'high').length,
    warningCount
  }
}
