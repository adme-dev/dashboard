import { z } from 'zod'
import type { AiTool } from '../toolRegistry'
import {
  readDepartmentBudgetHealth,
  readDepartmentClientInventory,
  readDepartmentCreativeInventory,
  readDepartmentDailyBrief,
  readDepartmentInboxEmailStats,
  readDepartmentLeadQuality,
  readDepartmentSeoOverview,
  readDepartmentWorkCoverage
} from '../marketing/departmentReads'
import { DEPARTMENT_MAX_PAGE, runDepartmentRead } from '../marketing/departmentReadSupport'

/**
 * Marketing department read suite. Every handler re-resolves fresh MARKETING_MANAGEMENT +
 * department_management authority inside the service, scopes to authorised ACTIVE clients before
 * aggregating, and reads stored records only (no provider refresh, internal route or write).
 * Root owns policy admission, registry projection and call wiring.
 */
const page = {
  cursor: z.string().min(1).max(1024).optional(),
  limit: z.number().int().min(1).max(DEPARTMENT_MAX_PAGE).default(25),
  clientId: z.string().uuid().optional()
}
const inventoryArgs = z.strictObject(page)
const briefArgs = z.strictObject({ ...page, minSeverity: z.enum(['high', 'medium', 'low']).default('low') })
const budgetArgs = z.strictObject({
  ...page,
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
  platform: z.enum(['google_ads', 'meta', 'linkedin', 'tiktok', 'programmatic', 'traditional', 'other']).optional()
})
const windowArgs = z.strictObject({ ...page, days: z.enum(['7d', '30d', '90d']).default('30d') })
const seoArgs = z.strictObject({ ...page, days: z.enum(['7d', '28d', '90d']).default('28d') })
const workArgs = z.strictObject({ ...page, dueWithinDays: z.number().int().min(1).max(31).default(7) })

/** Each tool keeps its own typed schema; the suite list is the registry's erased element type. */
const readTool = <A>(tool: AiTool<A>): AiTool<unknown> => tool as AiTool<unknown>

const SHARED = 'Marketing department staff only; covers every authorised active client, stored data only (never refreshes providers). Paginate with cursor/limit (max 50) until page.hasMore is false; pass clientId to narrow to one client.'

export const departmentReadTools: AiTool<unknown>[] = [
  readTool({
    name: 'get_department_client_inventory',
    description: `List every active client in the marketing portfolio with per-channel coverage: paid-media spend lines and sync freshness, ad-connection state, lead routing, Search Authority site, social inbox, email, creative and open work. Portfolio coverage counts are over ALL scoped clients. Missing setup is reported as not_configured/stale, never as zero. ${SHARED}`,
    parameters: inventoryArgs,
    handler: (args, ctx) => runDepartmentRead(() => readDepartmentClientInventory(ctx, args))
  }),
  readTool({
    name: 'get_department_daily_brief',
    description: `Start-of-day exception queue across the whole active portfolio: over-budget lines, stale spend, inactive ad connections, failed or overdue lead deliveries, uncontacted new leads, social SLA breaches, overdue tasks/briefs/proofs and failed Search Console syncs, ranked by severity with evidence timestamps and a safe next action. Reports coverage completeness; owners are null where none is recorded. ${SHARED}`,
    parameters: briefArgs,
    returnsUntrusted: true,
    handler: (args, ctx) => runDepartmentRead(() => readDepartmentDailyBrief(ctx, args))
  }),
  readTool({
    name: 'get_department_budget_health',
    description: `Allocated budget versus stored spend per client, platform and currency for a month (default current), with linear pacing and a named run-rate forecast. Stale, partial-budget and no-budget lines carry no pacing conclusion; portfolio totals are per currency and never summed across currencies. Excludes commission and finance fields. ${SHARED}`,
    parameters: budgetArgs,
    returnsUntrusted: true,
    handler: (args, ctx) => runDepartmentRead(() => readDepartmentBudgetHealth(ctx, args))
  }),
  readTool({
    name: 'get_department_lead_quality',
    description: `Aggregate lead quality and routing health per client for 7/30/90 days: counts by status and source, qualified and spam rates with explicit denominators, uncontacted new leads, enabled routing rules and delivery outcomes by destination type. Never returns lead contact details or form contents; cost per qualified lead is reported as unavailable. ${SHARED}`,
    parameters: windowArgs,
    handler: (args, ctx) => runDepartmentRead(() => readDepartmentLeadQuality(ctx, args))
  }),
  readTool({
    name: 'get_department_seo_overview',
    description: `Search Authority status per client: site and Search Console property state, last sync, stored web clicks/impressions/CTR/weighted position for the window, open opportunities with the top three, and content assets by status. Overlapping properties are listed, not summed. ${SHARED}`,
    parameters: seoArgs,
    returnsUntrusted: true,
    handler: (args, ctx) => runDepartmentRead(() => readDepartmentSeoOverview(ctx, args))
  }),
  readTool({
    name: 'get_department_inbox_email_stats',
    description: `Social inbox service statistics (open, SLA-breached, awaiting reply, first-response time) and email campaign delivery statistics (sent/delivered/bounced/complaints/unsubscribes/clicks with rates from compatible totals) per client. Never returns message text, participant identities, subjects or recipients. ${SHARED}`,
    parameters: windowArgs,
    handler: (args, ctx) => runDepartmentRead(() => readDepartmentInboxEmailStats(ctx, args))
  }),
  readTool({
    name: 'get_department_creative_inventory',
    description: `Creative stock per client: banner projects by status and review state, video assets, brand kits, and creative proofs open/overdue by status. Counts only; no file keys or share links. ${SHARED}`,
    parameters: inventoryArgs,
    handler: (args, ctx) => runDepartmentRead(() => readDepartmentCreativeInventory(ctx, args))
  }),
  readTool({
    name: 'get_department_work_coverage',
    description: `Department delivery coverage per client: open, overdue, blocked, unassigned and due-soon tasks, and briefs open, awaiting review, past deadline or unassigned; plus open-task workload by assignee across the portfolio (top 25). No payroll, rates or time-entry cost. ${SHARED}`,
    parameters: workArgs,
    handler: (args, ctx) => runDepartmentRead(() => readDepartmentWorkCoverage(ctx, args))
  })
]
