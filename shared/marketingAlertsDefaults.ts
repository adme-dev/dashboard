/**
 * Reviewed, versioned defaults for the marketing alerts pipeline (governance plan phase 1,
 * `.planning/todos/008-marketing-automation-governance.md`).
 *
 * Production Pages sits at Cloudflare's 150 text-binding ceiling, so nothing here is an environment
 * variable. The operator-owned settings row `agency_settings (key = 'marketing_alerts')` is merged
 * over these defaults (see server/utils/marketingAlerts/config.ts). With no row the pipeline is
 * fully dormant: the cron returns before reading any marketing data.
 *
 * Alerts are notify-only. Nothing in this pipeline changes a provider account, creates a proposal
 * or executes an action; every suggested next step names a read-only MCP question for a human.
 */
export const MARKETING_ALERTS_DEFAULTS = {
  /** Master switch. false → the cron is a no-op (no reads, no writes, no sends). */
  enabled: false,
  /** Tenant-local clock used for the daily digest hour. */
  timezone: 'Australia/Melbourne',
  /** Local hour (0–23) for the one daily summary. */
  digestHour: 9,
  /**
   * Per-channel delivery switches. Both false = shadow mode: alerts are evaluated and persisted
   * (so phase 2/4 can link to their ids) but nobody is told.
   */
  delivery: {
    slack: false,
    inApp: false
  },
  slack: {
    /** Must be https://hooks.slack.com/services/…; anything else is ignored. */
    webhookUrl: null as string | null,
    channel: null as string | null,
    /** Reuse the Budget Review webhook (agency_settings key 'budget_slack') when webhookUrl is unset. */
    useBudgetSlackWebhook: false
  },
  /**
   * In-app recipient allowlist (emails of active team members). Empty = nobody. Unlike
   * ANOMALY_NOTIFY_ALLOWLIST there is no "empty means everyone" fan-out.
   */
  recipientEmails: [] as string[],
  thresholds: {
    /** Pacing ratio (budget consumed % ÷ month elapsed %) at or above which over-pacing is critical. */
    overPacingCriticalRatio: 1.25,
    /** Pacing ratio at or above which over-pacing is a warning. */
    overPacingWarningRatio: 1.1,
    /** Pacing ratio at or below which under-pacing is a warning (only after underPacingMinDay). */
    underPacingWarningRatio: 0.8,
    underPacingMinDay: 7,
    /** "No budget set" only alerts once the campaign has spent at least this much this month. */
    noBudgetMinSpend: 50,
    /** Pacing is skipped for rows whose last sync is older than this (the sync source covers it). */
    pacingMaxSyncAgeHours: 48,
    /** A platform with no successful spend sync for this long raises a critical staleness alert. */
    syncStaleHours: 36,
    /** Search terms: per-term cost that counts toward wasted spend. */
    searchTermMinTermCost: 20,
    /** Search terms: per-campaign wasted total that raises an alert. */
    searchTermWastedCampaignTotal: 100,
    /** Search terms: ignore snapshots older than this many days. */
    searchTermMaxSnapshotAgeDays: 14,
    /** Immediate (non-digest) delivery only for critical alerts that opened/escalated this recently. */
    immediateWindowHours: 24
  }
}

export type MarketingAlertsDefaults = typeof MARKETING_ALERTS_DEFAULTS
