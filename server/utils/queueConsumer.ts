/**
 * Queue Consumer — processes jobs dispatched via Cloudflare Queues.
 *
 * This module is imported by the queue handler endpoint and routes
 * each job to the appropriate processor based on its type.
 */

import type { QueueJob } from './queue'

/**
 * Process a single queue job. Called by the queue consumer handler.
 * Throws on failure so the queue runtime can retry.
 */
export async function processJob(job: QueueJob): Promise<void> {
  const startTime = Date.now()

  try {
    switch (job.type) {
      case 'board.notify':
        await processBoardNotify(job.payload)
        break

      case 'board.automate':
        await processBoardAutomate(job.payload)
        break

      case 'eom.generate':
        await processEomGenerate(job.payload)
        break

      case 'spend.sync.meta':
        await processMetaSpendSync(job.payload)
        break

      case 'spend.sync.google':
        await processGoogleSpendSync(job.payload)
        break

      case 'spend.sync.tiktok':
        await processTikTokSpendSync(job.payload)
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

      default:
        console.warn(`[QueueConsumer] Unknown job type: ${(job as any).type}`)
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

async function processEomGenerate(payload: Record<string, any>): Promise<void> {
  const { generateEomInvoices } = await import('~~/server/utils/eomEngine')
  await generateEomInvoices(payload.userId, payload.month, payload.year, null as any)
}

async function processMetaSpendSync(payload: Record<string, any>): Promise<void> {
  const { syncMetaSpend } = await import('~~/server/utils/spendSync')
  await syncMetaSpend(payload.month, payload.year)
}

async function processGoogleSpendSync(payload: Record<string, any>): Promise<void> {
  const { syncGoogleSpend } = await import('~~/server/utils/spendSync')
  await syncGoogleSpend(payload.month, payload.year)
}

async function processTikTokSpendSync(payload: Record<string, any>): Promise<void> {
  const { syncTikTokSpend } = await import('~~/server/utils/spendSync')
  await syncTikTokSpend(payload.month, payload.year)
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
    case 'clients': await mod.embedAllFinancialSnapshots(event, period, ['clients']); break
    case 'pnl': await mod.embedPnlSnapshot(event, period); break
    case 'cash': await mod.embedCashPosition(event); break
  }
}

