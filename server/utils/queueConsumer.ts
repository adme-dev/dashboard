/**
 * Queue Consumer — processes jobs dispatched via Cloudflare Queues.
 *
 * This module is imported by the queue handler endpoint and routes
 * each job to the appropriate processor based on its type.
 */

import type { QueueConsumerJob } from './queue'
import type { GodModeAuditEventInput } from './godMode/audit'

/**
 * Process a single queue job. Called by the queue consumer handler.
 * Throws on failure so the queue runtime can retry.
 */
export async function processJob(job: QueueConsumerJob): Promise<void> {
  const startTime = Date.now()

  try {
    switch (job.type) {
      case 'board.notify':
        await processBoardNotify(job.payload)
        break

      case 'board.automate':
        await processBoardAutomate(job.payload)
        break

      case 'lifecycle.evaluate':
        await processLifecycleEvaluate(job.payload)
        break

      case 'eom.generate':
        await processEomGenerate(job.payload)
        break

      case 'spend.sync.meta':
        await processMetaSpendSync(job.payload)
        break

      case 'spend.sync.meta.account':
        await processMetaAccountSpendSync(job.payload)
        break

      case 'spend.sync.google':
        await processGoogleSpendSync(job.payload)
        break

      case 'spend.sync.google.account':
        await processGoogleAccountSpendSync(job.payload)
        break

      case 'spend.sync.tiktok':
        await processTikTokSpendSync(job.payload)
        break

      case 'persona.audience.sync':
        await processPersonaAudienceSync(job.payload)
        break

      case 'embed.task':
        await processEmbedTask(job.payload)
        break

      case 'embed.brief':
        await processEmbedBrief(job.payload)
        break

      case 'embed.client':
        await processEmbedClient(job.payload)
        break

      case 'embed.rate_card':
        await processEmbedRateCard(job.payload)
        break

      case 'training.extract':
        await processTrainingExtract(job.payload)
        break

      case 'dissect.analyze':
        await processDissectAnalyze(job.payload)
        break

      case 'embed.financial.expenses':
        await processFinancialEmbed(job.payload, 'expenses')
        break

      case 'embed.financial.invoices':
        await processFinancialEmbed(job.payload, 'invoices')
        break

      case 'embed.financial.clients':
        await processFinancialEmbed(job.payload, 'clients')
        break

      case 'embed.financial.pnl':
        await processFinancialEmbed(job.payload, 'pnl')
        break

      case 'embed.financial.cash':
        await processFinancialEmbed(job.payload, 'cash')
        break

      case 'site-intelligence.enrich':
        await processSiteIntelligenceEnrichment(job.payload)
        break

      case 'god-mode.audit-terminal':
        await processGodModeAuditTerminal(job.payload)
        break

      default:
        throw new Error(`Unknown queue job type: ${(job as any).type}`)
    }

    const duration = Date.now() - startTime
    console.log(`[QueueConsumer] ${job.type} completed in ${duration}ms`)
  } catch (err) {
    const duration = Date.now() - startTime
    console.error(`[QueueConsumer] ${job.type} failed after ${duration}ms:`, err)
    throw err // Let the queue retry
  }
}

async function processBoardNotify(payload: Record<string, any>): Promise<void> {
  const { notifyBoardSubscribers } = await import('~~/server/utils/boardNotifications')
  await notifyBoardSubscribers(payload as any)
}

async function processBoardAutomate(payload: Record<string, any>): Promise<void> {
  const { evaluateAutomations } = await import('~~/server/utils/automationEngine')
  await evaluateAutomations(payload.boardId, payload as any)
}

async function processLifecycleEvaluate(payload: Record<string, any>): Promise<void> {
  const { evaluateLifecycleTransition } = await import('~~/server/utils/automation/lifecycleGuard')
  await evaluateLifecycleTransition(payload as any)
}

async function processEomGenerate(payload: Record<string, any>): Promise<void> {
  const { generateEomInvoices } = await import('~~/server/utils/eomEngine')
  await generateEomInvoices(payload.userId, payload.month, payload.year, null as any)
}

async function processMetaSpendSync(payload: Record<string, any>): Promise<void> {
  const { syncMetaSpend } = await import('~~/server/utils/spendSync')
  const jobId = payload.jobId as string | undefined
  try {
    const result = await syncMetaSpend(payload.month, payload.year)
    if (jobId) {
      const { completeSpendSyncJob } = await import('~~/server/utils/spendSyncJobs')
      await completeSpendSyncJob(jobId, result)
    }
  } catch (err: any) {
    if (jobId) {
      const { failSpendSyncJob } = await import('~~/server/utils/spendSyncJobs')
      await failSpendSyncJob(jobId, err?.message || String(err))
    }
    throw err // let the queue retry
  }
}

// Per-account Meta sync chunk. Each message handles one ad account and atomically
// fans its result into the job row; the job completes when the last account lands.
// syncMetaSpendByConnectionId catches per-account Graph errors (returns them as
// failures) so this rarely throws — keeping the fan-in increment exactly-once.
async function processMetaAccountSpendSync(payload: Record<string, any>): Promise<void> {
  const { syncMetaSpendByConnectionId } = await import('~~/server/utils/spendSync')
  const { recordSyncJobAccountResult } = await import('~~/server/utils/spendSyncJobs')
  const jobId = payload.jobId as string | undefined
  const result = await syncMetaSpendByConnectionId(payload.connectionId, payload.month, payload.year)
  if (jobId) await recordSyncJobAccountResult(jobId, result)
}

async function processGoogleSpendSync(payload: Record<string, any>): Promise<void> {
  const { syncGoogleSpend } = await import('~~/server/utils/spendSync')
  await syncGoogleSpend(payload.month, payload.year)
}

async function processGoogleAccountSpendSync(payload: Record<string, any>): Promise<void> {
  const { syncGoogleSpendByConnectionId } = await import('~~/server/utils/spendSync')
  const { recordSyncJobAccountResult } = await import('~~/server/utils/spendSyncJobs')
  const jobId = payload.jobId as string | undefined
  const result = await syncGoogleSpendByConnectionId(payload.connectionId, payload.month, payload.year)
  if (jobId) await recordSyncJobAccountResult(jobId, result)
}

async function processTikTokSpendSync(payload: Record<string, any>): Promise<void> {
  const { syncTikTokSpend } = await import('~~/server/utils/spendSync')
  await syncTikTokSpend(payload.month, payload.year)
}

async function processPersonaAudienceSync(payload: Record<string, any>): Promise<void> {
  const { runPersonaAudienceSync } = await import('~~/server/utils/persona/audienceSync')
  await runPersonaAudienceSync(payload.exportId)
}

async function processEmbedTask(payload: Record<string, any>): Promise<void> {
  const { embedTask } = await import('~~/server/utils/aiEntityEmbedder')
  await embedTask(payload._event as any, payload.taskId)
}

async function processEmbedBrief(payload: Record<string, any>): Promise<void> {
  const { embedBrief } = await import('~~/server/utils/aiEntityEmbedder')
  await embedBrief(payload._event as any, payload.briefId)
}

async function processEmbedClient(payload: Record<string, any>): Promise<void> {
  const { embedClient } = await import('~~/server/utils/aiEntityEmbedder')
  await embedClient(payload._event as any, payload.clientId)
}

async function processEmbedRateCard(payload: Record<string, any>): Promise<void> {
  const { embedRateCard } = await import('~~/server/utils/aiEntityEmbedder')
  await embedRateCard(payload._event as any, payload.rateCardId)
}

async function processTrainingExtract(payload: Record<string, any>): Promise<void> {
  const { extractAndUpload } = await import('~~/server/utils/aiTrainingDataExtractor')
  await extractAndUpload(payload.datasetType, payload.options || {}, payload.userId)
}

async function processDissectAnalyze(payload: Record<string, any>): Promise<void> {
  const { runDissectionPipeline } = await import('./bannerDissectorPipeline')
  // event is null in queue context — pipeline will skip Workers AI and use Groq directly
  await runDissectionPipeline(null, payload.jobId)
}

async function processFinancialEmbed(payload: Record<string, any>, type: string): Promise<void> {
  const event = payload._event as any
  if (!event) {
    console.warn(`[QueueConsumer] embed.financial.${type}: event not available in queue context — financial embeds require authenticated event. Use the /api/ai/finance/embed endpoint instead.`)
    return
  }
  const mod = await import('~~/server/utils/financialEmbedder')
  const period = payload.period as string | undefined
  switch (type) {
    case 'expenses': await mod.embedExpenseSnapshot(event, period); break
    case 'invoices': await mod.embedInvoiceSnapshot(event, period); break
    // Queue messages are not bound by the HTTP request budget, so opt into a
    // longer one — the default is tuned for the interactive endpoint and would
    // otherwise truncate a large client set here without anyone noticing.
    case 'clients': await mod.embedAllFinancialSnapshots(event, period, ['clients'], undefined, { budgetMs: 120_000 }); break
    case 'pnl': await mod.embedPnlSnapshot(event, period); break
    case 'cash': await mod.embedCashPosition(event); break
  }
}

async function processSiteIntelligenceEnrichment(payload: Record<string, unknown>): Promise<void> {
  const { enrichSiteIntelligencePage } = await import('~~/server/utils/siteIntelligence/enrich')
  await enrichSiteIntelligencePage(payload as Parameters<typeof enrichSiteIntelligencePage>[0])
}

async function processGodModeAuditTerminal(payload: GodModeAuditEventInput): Promise<void> {
  const { appendGodModeAuditEvent } = await import('~~/server/utils/godMode/audit')
  try {
    await appendGodModeAuditEvent(payload)
  } catch (error) {
    // Queue delivery is at-least-once. A matching immutable terminal already present is success;
    // malformed payloads and all other database failures still throw for retry/dead-letter.
    if ((error as { code?: string } | null)?.code !== '23505') throw error
    const { queryOneFresh } = await import('~~/server/utils/db')
    const existing = await queryOneFresh<any>(
      `SELECT actor_user_id, correlation_id, session_digest, channel, route_or_tool, phase,
              tenant_id, client_id, entity_type, entity_id, bypassed_controls, outcome_code,
              emergency_disabled
         FROM god_mode_audit_events
        WHERE correlation_id = $1 AND phase IN ('succeeded', 'failed') LIMIT 1`,
      [payload.correlationId]
    )
    const normalizedControls = (values: string[] | undefined) => [...new Set(values ?? [])].sort()
    const exactDuplicate = existing
      && existing.actor_user_id === payload.actorUserId
      && existing.correlation_id === payload.correlationId
      && existing.session_digest === payload.sessionDigest
      && existing.channel === payload.channel
      && existing.route_or_tool === payload.routeOrTool
      && existing.phase === payload.phase
      && (existing.tenant_id ?? null) === (payload.tenantId ?? null)
      && (existing.client_id ?? null) === (payload.clientId ?? null)
      && (existing.entity_type ?? null) === (payload.entityType ?? null)
      && (existing.entity_id ?? null) === (payload.entityId ?? null)
      && JSON.stringify(normalizedControls(existing.bypassed_controls)) === JSON.stringify(normalizedControls(payload.bypassedControls))
      && existing.outcome_code === payload.outcomeCode
      && existing.emergency_disabled === payload.emergencyDisabled
    if (!exactDuplicate) {
      console.error('[God mode audit] conflicting terminal correlation', { correlationId: payload.correlationId })
      throw error
    }
  }
}
