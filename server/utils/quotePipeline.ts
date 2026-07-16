/**
 * Shared quote-pipeline business rules.
 *
 * Quotes older than this are treated as dead deals nobody marked Declined,
 * not forward pipeline — they're excluded from both the /invoices "Forward
 * Pipeline" card (quotes-summary) and the Get Out pipeline-coverage ratio.
 * One constant so the two surfaces can never disagree on the window.
 */
export const QUOTE_PIPELINE_MAX_AGE_DAYS = 365

export function quotePipelineDateFrom(now: Date = new Date()): string {
  return new Date(now.getTime() - QUOTE_PIPELINE_MAX_AGE_DAYS * 86400_000).toISOString().slice(0, 10)
}
