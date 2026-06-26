# AI Model Ops Platform Sweep

Date: 2026-06-26

## Coverage Legend

- `runtime-routed`: Feature calls `resolveAiModelAssignment(...)`; Model Ops assignments affect production model selection.
- `registered`: Feature appears in the AI Model Ops registry.
- `telemetry`: Feature records `featureKey` invocation telemetry.
- `direct`: Feature still chooses provider/model in code or worker config.

## Runtime-Routed Today

- `banner_copy_suggest` - Banner Studio copy suggestions. `runtime-routed`, `registered`, `telemetry`.
- `banner_image_suggest` - Banner Studio image keyword suggestions. `runtime-routed`, `registered`, `telemetry`.
- `banner_code_assist` - Banner Studio code assistant. `runtime-routed`, `registered`, `telemetry`.
- `social_spend_ai_analysis` - Social spend review panel analysis. `runtime-routed`, `registered`, `telemetry`.
- `agency_ai_tool_loop` - Main agency AI tool loop. `runtime-routed`, `registered`, `telemetry`.
- `agency_ai_l2_specialist_loop` - Routed through the shared tool loop when called as a delegated loop. `runtime-routed`, `registered`, `telemetry`.
- `portal_ai_tool_loop` - Client portal assistant. `runtime-routed`, `registered`, `telemetry`.
- `agency_ai_l2_classifier` - Agency AI L2 traffic classifier. `runtime-routed`, `registered`, `telemetry`.
- `agency_ai_l2_synthesis` - Agency AI L2 synthesis. `runtime-routed`, `registered`, `telemetry`.
- `agency_ai_single_shot_fallback` - Agency AI single-shot fallback. `runtime-routed`, `registered`, `telemetry`.
- `agency_ai_intent_lora_classifier` - Intent LoRA classifier. `runtime-routed`, `registered`, `telemetry`.
- `agency_ai_intent_edge_classifier` - Intent edge classifier. `runtime-routed`, `registered`, `telemetry`.
- `agency_ai_intent_groq_classifier` - Intent Groq fallback classifier. `runtime-routed`, `registered`, `telemetry`.
- `agency_ai_voice_stt` - Agency voice transcription. `runtime-routed`, `registered`, `telemetry`.
- `agency_ai_voice_tts` - Agency voice synthesis. `runtime-routed`, `registered`, `telemetry`.
- `workers_ai_speech_to_text` - Shared Workers AI STT helper. `runtime-routed`, `registered`, `telemetry`.
- `workers_ai_text_to_speech` - Shared Workers AI TTS helper. `runtime-routed`, `registered`, `telemetry`.
- `financial_advisor` - Financial advisor. `runtime-routed`, `registered`, `telemetry`.
- `cashflow_insights` - Cashflow insights. `runtime-routed`, `registered`, `telemetry`.
- `expense_insights` - Expense insights. `runtime-routed`, `registered`, `telemetry`.
- `anomaly_driver_narrative` - Anomaly narrative. `runtime-routed`, `registered`, `telemetry`.
- `action_plan_generation` - Financial action plan. `runtime-routed`, `registered`, `telemetry`.
- `financial_insights_headline` - Financial insights headline. `runtime-routed`, `registered`, `telemetry`.
- `financial_insights_recommendations` - Financial recommendations. `runtime-routed`, `registered`, `telemetry`.
- `xero_invoice_ai_briefing` - Xero invoice briefing. `runtime-routed`, `registered`, `telemetry`.
- `customer_insights_summary` - Customer insights summary. `runtime-routed`, `registered`, `telemetry`.
- `ai_agent_digest_report` - Agent digest report. `runtime-routed`, `registered`, `telemetry`.
- `ai_memory_distillation` - AI memory distillation. `runtime-routed`, `registered`, `telemetry`.
- `observe_and_learn_distillation` - Observe-and-learn cron distillation. `runtime-routed`, `registered`, `telemetry`.
- `budget_change_sanity_check` - Budget-change tool sanity check. `runtime-routed`, `registered`, `telemetry`.
- `social_spend_pacing_summary` - Social spend pacing summary. `runtime-routed`, `registered`, `telemetry`.
- `social_publishing_plan` - Social publishing planner. `runtime-routed`, `registered`, `telemetry`.
- `social_publishing_caption` - Social caption generator. `runtime-routed`, `registered`, `telemetry`.
- `social_reporting_ai_summary` - Social reporting summary. `runtime-routed`, `registered`, `telemetry`.
- `social_inbox_reply_draft` - Social inbox reply draft. `runtime-routed`, `registered`, `telemetry`.
- `social_listening_enrichment` - Social listening enrichment. `runtime-routed`, `registered`, `telemetry`.
- `crm_followup_draft` - CRM follow-up draft. `runtime-routed`, `registered`, `telemetry`.
- `task_wiki_summary` - Task wiki summary. `runtime-routed`, `registered`, `telemetry`.
- `agency_task_assist_creation` - Task creation assistant. `runtime-routed`, `registered`, `telemetry`.
- `agency_task_assist_analysis` - Task analysis assistant. `runtime-routed`, `registered`, `telemetry`.
- `board_automation_ai_insight` - Board automation insight. `runtime-routed`, `registered`, `telemetry`.
- `board_automation_ai_summary` - Board automation summary. `runtime-routed`, `registered`, `telemetry`.
- `agency_analytics_ai_summary` - Agency analytics summary. `runtime-routed`, `registered`, `telemetry`.
- `agency_analytics_ask` - Agency analytics Q&A. `runtime-routed`, `registered`, `telemetry`.
- `rate_card_description` - Rate card description generation. `runtime-routed`, `registered`, `telemetry`.
- `notification_digest_narrative` - Notification digest narrative. `runtime-routed`, `registered`, `telemetry`.
- `notification_why_explanation` - Notification why explanation. `runtime-routed`, `registered`, `telemetry`.
- `task_assignment_auto_ack` - Task auto-ack draft. `runtime-routed`, `registered`, `telemetry`.
- `office_meeting_cross_search` - Office meeting cross-search. `runtime-routed`, `registered`, `telemetry`.
- `office_meeting_question_answer` - Office meeting Q&A. `runtime-routed`, `registered`, `telemetry`.
- `workers_ai_edge_generate` - Shared edge generation helper. `runtime-routed`, `registered`, `telemetry`.
- `workers_ai_edge_classify` - Shared edge classifier. `runtime-routed`, `registered`, `telemetry`.
- `workers_ai_edge_summarize` - Shared edge summarizer. `runtime-routed`, `registered`, `telemetry`.
- `workers_ai_edge_generate_lora` - Shared LoRA edge generation. `runtime-routed`, `registered`, `telemetry`.
- `video_asset_publish_social_caption` - Video asset social caption. `runtime-routed`, `registered`, `telemetry`.
- `video_project_ai_assembly` - Video project AI assembly. `runtime-routed`, `registered`, `telemetry`.
- `audio_render_publish_social_caption` - Audio render social caption. `runtime-routed`, `registered`, `telemetry`.

## Remaining App-Server AI Surfaces

- `office_recording_transcription` - Groq-generated summary/action-item text is runtime-routed. The raw Groq audio transcription model remains direct and should be split into an audio-specific assignment feature.
- `banner_dissector_vision`, `ai_vectorize_embeddings`, and ad-hoc visual analysis helpers are not registered Model Ops features yet.

## Worker-Side Slice

These require a separate model-assignment distribution mechanism because Workers cannot rely on direct app database reads:

- `video_generation_job` - Video generation selected model. `registered`, `telemetry`, currently registry/policy-driven.
- `video_generation_worker_runtime` - Video generation worker runtime. `registered`, `telemetry`, currently worker-config-driven.
- `video_generation_completion` - Video generation completion/reconcile. `registered`, `telemetry`, currently job-driven.
- `video_asset_intelligence_job` - Video asset intelligence job. `registered`, `telemetry`, currently registry-driven.
- `video_asset_intelligence_worker_runtime` - Asset intelligence worker runtime. `registered`, `telemetry`, currently worker-config-driven.
- `audio_music_generation` - Audio music generation API. `registered`, `telemetry`, currently worker/job-driven.
- `audio_music_generation_worker_runtime` - Audio music worker runtime. `registered`, `telemetry`, currently worker-config-driven.

## Rollout Order

1. Complete audio-specific routing for `office_recording_transcription`.
2. Worker-side video/audio/asset-intelligence config sync.
3. Decide whether to register and route currently unregistered helpers such as banner dissector vision and Vectorize embeddings.
