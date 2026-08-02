import type { H3Event } from 'h3'
import type { SiteIntelligenceAuditActor } from '~~/server/utils/siteIntelligence/audit'
import type { SiteIntelligenceRunStatus, SiteIntelligenceRunTrigger } from '~~/app/types/site-intelligence'
import { startSiteIntelligenceCrawlWorkflow } from '~~/server/utils/agencyWorkflows/client'
import {
  createSiteIntelligenceCrawlRun,
  failSiteIntelligenceRun,
  markSiteIntelligenceRunWorkflowStarted,
  type SiteIntelligenceCrawlRunCreateOptions
} from '~~/server/utils/siteIntelligence/repository'
import { assertPublicSiteOrigin } from '~~/server/utils/siteIntelligence/urlPolicy'

export type GovernedSiteIntelligenceCrawlResult
  = { status: 'started', run: Record<string, unknown> & { id: string } }
    | { status: 'existing_run', run: { id: string, status: SiteIntelligenceRunStatus } }
    | { status: 'not_found' | 'inactive' | 'active_run', run: null }
    | { status: 'failed', run: { id: string }, category: 'url_policy' | 'workflow_start' }

export async function startGovernedSiteIntelligenceCrawl(
  event: H3Event,
  actor: SiteIntelligenceAuditActor,
  domainId: string,
  trigger: SiteIntelligenceRunTrigger,
  options?: SiteIntelligenceCrawlRunCreateOptions
): Promise<GovernedSiteIntelligenceCrawlResult> {
  const created = options
    ? await createSiteIntelligenceCrawlRun(actor, domainId, trigger, options)
    : await createSiteIntelligenceCrawlRun(actor, domainId, trigger)
  if (created.status !== 'created') return created
  const { run } = created

  try {
    await assertPublicSiteOrigin(String(run.settings.origin))
  } catch {
    await failSiteIntelligenceRun(run.id, run.clientId, 'url_policy', 'Public origin revalidation failed')
    return { status: 'failed', run: { id: run.id }, category: 'url_policy' }
  }

  const started = await startSiteIntelligenceCrawlWorkflow(event, {
    runId: run.id,
    domainId: run.domainId,
    clientId: run.clientId,
    trigger,
    ...(actor.id ? { requestedBy: actor.id } : {})
  })
  if (!started.ok) {
    const summary = ('error' in started && started.error) || started.reason
    await failSiteIntelligenceRun(run.id, run.clientId, 'workflow_start', summary)
    return { status: 'failed', run: { id: run.id }, category: 'workflow_start' }
  }
  if (!started.instanceId) {
    await failSiteIntelligenceRun(run.id, run.clientId, 'workflow_start', 'Workflow did not return an instance id')
    return { status: 'failed', run: { id: run.id }, category: 'workflow_start' }
  }
  await markSiteIntelligenceRunWorkflowStarted(run.id, run.clientId, started.instanceId)
  return {
    status: 'started',
    run: { ...run, workflowInstanceId: started.instanceId, status: 'running' }
  }
}
