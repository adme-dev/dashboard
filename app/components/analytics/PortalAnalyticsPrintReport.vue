<script setup lang="ts">
import type { PortalAnalyticsPrintReport } from '~/types'

const props = defineProps<{
  report: PortalAnalyticsPrintReport
  clientName: string
  clientLogo?: string | null
}>()

const currency = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 2 })
const compact = new Intl.NumberFormat('en-AU', { notation: 'compact', maximumFractionDigits: 1 })
const date = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
const dateTime = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })

function fmtCurrency(value: number | null | undefined): string {
  return value == null ? '—' : currency.format(value)
}

function fmtCompact(value: number | null | undefined): string {
  return compact.format(value || 0)
}

function fmtPercent(value: number | null | undefined, fraction = false): string {
  if (value == null) return '—'
  return `${(fraction ? value * 100 : value).toFixed(1)}%`
}

function fmtDate(value: string): string {
  return date.format(new Date(`${value.slice(0, 10)}T00:00:00`))
}

function fmtDateTime(value: string | null | undefined): string {
  return value ? dateTime.format(new Date(value)) : 'Not available'
}

function titleCase(value: string): string {
  return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase())
}

function pctChange(current: number | null | undefined, previous: number | null | undefined): number | null {
  if (current == null || previous == null || previous === 0) return null
  return ((current - previous) / previous) * 100
}

const totals = computed(() => props.report.overview.totals)
const previous = computed(() => props.report.overview.previousPeriod)
const kpis = computed(() => [
  { label: 'Total spend', value: fmtCurrency(totals.value.spend), change: pctChange(totals.value.spend, previous.value.spend) },
  { label: 'Impressions', value: fmtCompact(totals.value.impressions), change: pctChange(totals.value.impressions, previous.value.impressions) },
  { label: 'Clicks', value: fmtCompact(totals.value.clicks), change: pctChange(totals.value.clicks, previous.value.clicks) },
  { label: 'Leads', value: fmtCompact(totals.value.leads), change: pctChange(totals.value.leads, previous.value.leads) },
  { label: 'CTR', value: fmtPercent(totals.value.ctr), change: pctChange(totals.value.ctr, previous.value.ctr) },
  { label: 'CPC', value: fmtCurrency(totals.value.cpc), change: pctChange(totals.value.cpc, previous.value.cpc), invert: true },
  { label: 'Cost / lead', value: fmtCurrency(totals.value.costPerLead), change: pctChange(totals.value.costPerLead, previous.value.costPerLead), invert: true },
  { label: 'Conversions', value: fmtCompact(totals.value.conversions), change: pctChange(totals.value.conversions, previous.value.conversions) }
])

const trendPath = computed(() => linePath(props.report.trend.dataPoints.map(point => point.value), 760, 165))
const visitorPath = computed(() => linePath(
  props.report.sections.trackingTimeseries.data?.points.map(point => point.visitors) || [],
  760,
  130
))

function linePath(values: number[], width: number, height: number): string {
  if (!values.length) return ''
  const max = Math.max(...values, 1)
  const step = values.length > 1 ? width / (values.length - 1) : 0
  return values.map((value, index) => {
    const x = values.length > 1 ? index * step : width / 2
    const y = height - (value / max) * (height - 10)
    return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
}

const leadStages = computed(() => [
  { label: 'New', value: totals.value.leadNew || 0 },
  { label: 'Contacted', value: totals.value.leadContacted || 0 },
  { label: 'Qualified', value: totals.value.leadQualified || 0 },
  { label: 'Won', value: totals.value.leadWon || 0 },
  { label: 'Lost', value: totals.value.leadLost || 0 }
])
const maxLeadStage = computed(() => Math.max(...leadStages.value.map(stage => stage.value), 1))
const contactedRate = computed(() => {
  const leads = totals.value.leads || 0
  const contacted = totals.value.leadContactedAt || totals.value.leadContacted || 0
  return leads > 0 ? Math.round((contacted / leads) * 100) : 0
})
const winRate = computed(() => {
  const leads = totals.value.leads || 0
  return leads > 0 ? Math.round(((totals.value.leadWon || 0) / leads) * 100) : 0
})
const platformMaxSpend = computed(() => Math.max(...props.report.overview.byPlatform.map(row => row.spend), 1))
</script>

<template>
  <article class="portal-analytics-print-report">
    <header class="print-report-header">
      <div class="print-brand">
        <img v-if="clientLogo" :src="clientLogo" alt="" class="print-logo">
        <div>
          <p class="print-eyebrow">XeroFlow client portal</p>
          <h1>{{ clientName }} — Ad performance</h1>
        </div>
      </div>
      <div class="print-period">
        <strong>{{ fmtDate(report.filters.startDate) }} – {{ fmtDate(report.filters.endDate) }}</strong>
        <span>Generated {{ fmtDateTime(report.generatedAt) }}</span>
      </div>
    </header>

    <section aria-labelledby="executive-summary">
      <div class="print-section-heading">
        <div>
          <p class="print-eyebrow">Advertising performance</p>
          <h2 id="executive-summary">Executive summary</h2>
        </div>
        <p>{{ report.filters.platforms.length ? report.filters.platforms.map(titleCase).join(', ') : 'All connected platforms' }}<span v-if="report.filters.runningOnly"> · Running campaigns only</span></p>
      </div>

      <div class="print-kpi-grid">
        <div v-for="kpi in kpis" :key="kpi.label" class="print-card print-kpi">
          <span>{{ kpi.label }}</span>
          <strong>{{ kpi.value }}</strong>
          <small v-if="kpi.change != null" :class="(kpi.invert ? kpi.change < 0 : kpi.change > 0) ? 'print-positive' : 'print-negative'">
            {{ kpi.change > 0 ? '+' : '' }}{{ kpi.change.toFixed(1) }}% vs previous period
          </small>
          <small v-else>No prior comparison</small>
        </div>
      </div>

      <div class="print-two-column print-summary-row">
        <div class="print-card">
          <div class="print-card-heading">
            <h3>{{ titleCase(report.filters.metric) }} trend</h3>
            <span>{{ report.trend.resolution || 'day' }} resolution</span>
          </div>
          <div v-if="report.trend.dataPoints.length" class="print-chart">
            <svg viewBox="0 0 760 175" role="img" aria-label="Selected metric trend">
              <line x1="0" y1="165" x2="760" y2="165" class="print-chart-axis" />
              <path :d="trendPath" class="print-chart-line" />
            </svg>
            <div class="print-chart-range">
              <span>{{ report.trend.dataPoints[0]?.date }}</span>
              <span>{{ report.trend.dataPoints.at(-1)?.date }}</span>
            </div>
          </div>
          <p v-else class="print-empty">No trend data for this period.</p>
        </div>

        <div class="print-card">
          <div class="print-card-heading"><h3>By platform</h3><span>Spend share</span></div>
          <div v-if="report.overview.byPlatform.length" class="print-stack">
            <div v-for="platform in report.overview.byPlatform" :key="platform.platform" class="print-bar-row">
              <div><strong>{{ platform.displayName }}</strong><span>{{ fmtCurrency(platform.spend) }}</span></div>
              <div class="print-bar"><i :style="{ width: `${Math.max(2, (platform.spend / platformMaxSpend) * 100)}%`, backgroundColor: platform.color }" /></div>
              <small>{{ fmtCompact(platform.impressions) }} impr. · {{ fmtCompact(platform.leads) }} leads · {{ fmtPercent(platform.ctr) }} CTR</small>
            </div>
          </div>
          <p v-else class="print-empty">No platform activity for this period.</p>
        </div>
      </div>
    </section>

    <section class="print-section print-page-start" aria-labelledby="campaign-performance">
      <div class="print-section-heading">
        <div><p class="print-eyebrow">Advertising detail</p><h2 id="campaign-performance">Campaign performance</h2></div>
        <p>{{ report.campaigns.total }} campaign{{ report.campaigns.total === 1 ? '' : 's' }}</p>
      </div>

      <div v-if="report.sections.freshness.status === 'available'" class="print-freshness">
        <div v-for="source in report.sections.freshness.data.sources" :key="source.platform" class="print-card print-freshness-card">
          <strong>{{ titleCase(source.platform) }}</strong>
          <span>{{ source.campaignCount }} campaigns</span>
          <small>Source synced {{ fmtDateTime(source.lastSourceSyncAt) }}</small>
          <small v-if="source.failedCount" class="print-negative">{{ source.failedCount }} refresh failures</small>
        </div>
        <p v-if="!report.sections.freshness.data.sources.length" class="print-empty">No source freshness records for this period.</p>
      </div>
      <p v-else class="print-unavailable">Data freshness is unavailable for this report.</p>

      <table v-if="report.campaigns.campaigns.length" class="print-table print-campaign-table">
        <thead>
          <tr><th>Campaign</th><th>Platform</th><th>Status</th><th>Spend</th><th>Impressions</th><th>Clicks</th><th>Leads</th><th>CPL</th></tr>
        </thead>
        <tbody>
          <tr v-for="campaign in report.campaigns.campaigns" :key="campaign.mediaSpendId">
            <td>{{ campaign.campaignName }}</td>
            <td>{{ titleCase(campaign.platform) }}</td>
            <td>{{ titleCase(campaign.campaignStatus || 'Unknown') }}</td>
            <td>{{ fmtCurrency(campaign.spend) }}</td>
            <td>{{ fmtCompact(campaign.impressions) }}</td>
            <td>{{ fmtCompact(campaign.clicks) }}</td>
            <td>{{ fmtCompact(campaign.leadCount) }}</td>
            <td>{{ fmtCurrency(campaign.costPerLead) }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else class="print-empty print-card">No campaigns matched the selected report filters.</p>
    </section>

    <section class="print-section print-page-start" aria-labelledby="lead-outcomes">
      <div class="print-section-heading">
        <div><p class="print-eyebrow">From click to customer</p><h2 id="lead-outcomes">Lead &amp; outcome performance</h2></div>
      </div>

      <div class="print-kpi-grid">
        <div class="print-card print-kpi"><span>Contacted rate</span><strong>{{ contactedRate }}%</strong><small>Leads with follow-up</small></div>
        <div class="print-card print-kpi"><span>Win rate</span><strong>{{ winRate }}%</strong><small>Won from portal-visible leads</small></div>
        <div class="print-card print-kpi"><span>Avg response</span><strong>{{ totals.avgResponseMinutes == null ? '—' : `${Math.round(totals.avgResponseMinutes)}m` }}</strong><small>Time to first contact</small></div>
        <div class="print-card print-kpi"><span>Uncontacted</span><strong>{{ fmtCompact(totals.leadUncontacted) }}</strong><small>Needs follow-up</small></div>
      </div>

      <div class="print-two-column">
        <div class="print-card">
          <div class="print-card-heading"><h3>Lead progression</h3><span>{{ fmtCompact(totals.leads) }} total</span></div>
          <div class="print-stack">
            <div v-for="stage in leadStages" :key="stage.label" class="print-bar-row">
              <div><strong>{{ stage.label }}</strong><span>{{ stage.value }}</span></div>
              <div class="print-bar"><i :style="{ width: `${Math.max(stage.value ? 4 : 0, (stage.value / maxLeadStage) * 100)}%` }" /></div>
            </div>
          </div>
        </div>

        <div class="print-card">
          <div class="print-card-heading"><h3>Performance insights</h3></div>
          <dl class="print-definition-grid">
            <div><dt>CPM</dt><dd>{{ fmtCurrency(totals.cpm) }}</dd></div>
            <div><dt>Cost / conversion</dt><dd>{{ fmtCurrency(totals.costPerConversion) }}</dd></div>
            <div><dt>Conversion rate</dt><dd>{{ fmtPercent(totals.conversionRate) }}</dd></div>
            <div><dt>ROAS</dt><dd>{{ totals.roas == null ? '—' : `${totals.roas.toFixed(2)}x` }}</dd></div>
          </dl>
        </div>
      </div>
    </section>

    <section class="print-section print-page-start" aria-labelledby="website-funnel">
      <div class="print-section-heading">
        <div><p class="print-eyebrow">Owned experience</p><h2 id="website-funnel">Website &amp; funnel performance</h2></div>
      </div>

      <template v-if="report.sections.websiteFunnel.status === 'available' && report.sections.websiteFunnel.data.hasGa4">
        <div class="print-kpi-grid">
          <div class="print-card print-kpi"><span>Sessions</span><strong>{{ fmtCompact(report.sections.websiteFunnel.data.totals.sessions) }}</strong><small>GA4 sessions</small></div>
          <div class="print-card print-kpi"><span>Users</span><strong>{{ fmtCompact(report.sections.websiteFunnel.data.totals.totalUsers) }}</strong><small>Total users</small></div>
          <div class="print-card print-kpi"><span>Engagement</span><strong>{{ fmtPercent(report.sections.websiteFunnel.data.totals.engagementRate, true) }}</strong><small>Engaged sessions</small></div>
          <div class="print-card print-kpi"><span>Key events</span><strong>{{ fmtCompact(report.sections.websiteFunnel.data.totals.keyEvents) }}</strong><small>GA4 conversions</small></div>
        </div>
        <table class="print-table">
          <thead><tr><th>Channel</th><th>Spend</th><th>Sessions</th><th>Users</th><th>Engagement</th><th>Key events</th><th>Leads</th><th>Cost / lead</th></tr></thead>
          <tbody><tr v-for="channel in report.sections.websiteFunnel.data.channels" :key="channel.channel"><td>{{ channel.channel }}</td><td>{{ fmtCurrency(channel.spend) }}</td><td>{{ fmtCompact(channel.sessions) }}</td><td>{{ fmtCompact(channel.totalUsers) }}</td><td>{{ fmtPercent(channel.engagementRate, true) }}</td><td>{{ fmtCompact(channel.keyEvents) }}</td><td>{{ fmtCompact(channel.leads) }}</td><td>{{ fmtCurrency(channel.costPerLead) }}</td></tr></tbody>
        </table>
      </template>
      <p v-else-if="report.sections.websiteFunnel.status === 'unavailable'" class="print-unavailable">Website funnel data is unavailable for this report.</p>
      <p v-else class="print-empty print-card">No GA4 property is connected for this reporting period.</p>

      <div v-if="report.sections.trackingSummary.status === 'available'" class="print-kpi-grid print-subsection">
        <div class="print-card print-kpi"><span>Visitors</span><strong>{{ fmtCompact(report.sections.trackingSummary.data.visitors) }}</strong><small>Known browser visitors</small></div>
        <div class="print-card print-kpi"><span>Page views</span><strong>{{ fmtCompact(report.sections.trackingSummary.data.pageViews) }}</strong><small>Tracked views</small></div>
        <div class="print-card print-kpi"><span>Form submits</span><strong>{{ fmtCompact(report.sections.trackingSummary.data.formSubmits) }}</strong><small>Lead intents</small></div>
        <div class="print-card print-kpi"><span>Vehicle views</span><strong>{{ fmtCompact(report.sections.trackingSummary.data.vehicleViews) }}</strong><small>Product intent</small></div>
      </div>

      <div class="print-two-column print-subsection">
        <div class="print-card">
          <div class="print-card-heading"><h3>Visitor trend</h3><span>Daily visitors</span></div>
          <div v-if="visitorPath" class="print-chart print-chart-compact"><svg viewBox="0 0 760 140" role="img" aria-label="Visitor trend"><line x1="0" y1="130" x2="760" y2="130" class="print-chart-axis" /><path :d="visitorPath" class="print-chart-line" /></svg></div>
          <p v-else class="print-empty">No tracked visitor activity for this period.</p>
        </div>
        <div class="print-card">
          <div class="print-card-heading"><h3>Acquisition sources</h3></div>
          <ol v-if="report.sections.trackingSources.status === 'available' && report.sections.trackingSources.data.rows.length" class="print-ranked-list">
            <li v-for="row in report.sections.trackingSources.data.rows" :key="row.key"><span class="print-wrap">{{ row.key }}</span><strong>{{ fmtCompact(row.count) }}</strong></li>
          </ol>
          <p v-else class="print-empty">No source data for this period.</p>
        </div>
      </div>

      <div class="print-two-column print-subsection">
        <div class="print-card">
          <div class="print-card-heading"><h3>Lead capture health</h3></div>
          <template v-if="report.sections.trackingHealth.status === 'available'">
            <dl class="print-definition-grid"><div><dt>Confirmed leads</dt><dd>{{ report.sections.trackingHealth.data.confirmedLeads }}</dd></div><div><dt>CRM linked</dt><dd>{{ report.sections.trackingHealth.data.crmLinkedLeads }}</dd></div><div><dt>Attributed</dt><dd>{{ report.sections.trackingHealth.data.attributionCoverage }}%</dd></div><div><dt>Unmatched</dt><dd>{{ report.sections.trackingHealth.data.unmatchedSubmissions }}</dd></div></dl>
            <ul v-if="report.sections.trackingHealth.data.issues.length" class="print-issues"><li v-for="issue in report.sections.trackingHealth.data.issues" :key="issue">{{ issue }}</li></ul>
          </template>
          <p v-else class="print-unavailable">Lead health is unavailable for this report.</p>
        </div>
        <div class="print-card">
          <div class="print-card-heading"><h3>Website conversion funnel</h3></div>
          <ol v-if="report.sections.trackingFunnel.status === 'available'" class="print-ranked-list"><li v-for="step in report.sections.trackingFunnel.data.steps" :key="step.step"><span>{{ step.step }}</span><strong>{{ step.sessions }} · {{ step.rate }}%</strong></li></ol>
          <p v-else class="print-unavailable">Website conversion funnel is unavailable.</p>
        </div>
      </div>

      <div class="print-two-column print-subsection">
        <div class="print-card"><div class="print-card-heading"><h3>Top pages</h3></div><ol v-if="report.sections.trackingPages.status === 'available'" class="print-ranked-list"><li v-for="row in report.sections.trackingPages.data.rows" :key="row.key"><span class="print-wrap">{{ row.key }}</span><strong>{{ fmtCompact(row.count) }}</strong></li></ol><p v-else class="print-unavailable">Page data is unavailable.</p></div>
        <div class="print-card"><div class="print-card-heading"><h3>Devices</h3></div><ol v-if="report.sections.trackingDevices.status === 'available'" class="print-ranked-list"><li v-for="row in report.sections.trackingDevices.data.rows" :key="row.key"><span>{{ titleCase(row.key) }}</span><strong>{{ fmtCompact(row.count) }}</strong></li></ol><p v-else class="print-unavailable">Device data is unavailable.</p></div>
      </div>
    </section>

    <section class="print-section print-page-start" aria-labelledby="audience-insights">
      <div class="print-section-heading">
        <div><p class="print-eyebrow">Privacy-safe signals</p><h2 id="audience-insights">Audience &amp; identity insights</h2></div>
      </div>

      <template v-if="report.sections.personas.status === 'available' && report.sections.personas.data.enabled && report.sections.personas.data.metrics">
        <div class="print-kpi-grid">
          <div class="print-card print-kpi"><span>Known personas</span><strong>{{ fmtCompact(report.sections.personas.data.metrics.totalPersonas) }}</strong><small>Deterministically resolved</small></div>
          <div class="print-card print-kpi"><span>Returning personas</span><strong>{{ fmtCompact(report.sections.personas.data.metrics.returningPersonas) }}</strong><small>{{ report.sections.personas.data.metrics.returningRate }}% returning</small></div>
          <div class="print-card print-kpi"><span>Confirmed leads</span><strong>{{ fmtCompact(report.sections.personas.data.metrics.confirmedLeads) }}</strong><small>{{ report.sections.personas.data.metrics.websiteMatchRate }}% website matched</small></div>
          <div class="print-card print-kpi"><span>Attribution coverage</span><strong>{{ report.sections.personas.data.metrics.attributionCoverage }}%</strong><small>{{ report.sections.personas.data.metrics.attributedLeads }} attributed</small></div>
        </div>
        <div class="print-two-column">
          <div class="print-card"><div class="print-card-heading"><h3>Lead source mix</h3></div><ol class="print-ranked-list"><li v-for="source in report.sections.personas.data.sourceMix" :key="source.source"><span>{{ titleCase(source.source) }}</span><strong>{{ source.count }}</strong></li></ol><p v-if="!report.sections.personas.data.sourceMix.length" class="print-empty">Source signals will appear as attributed leads resolve.</p></div>
          <div class="print-card"><div class="print-card-heading"><h3>Identity summary</h3></div><dl class="print-definition-grid"><div><dt>CRM match</dt><dd>{{ report.sections.personas.data.metrics.crmMatchRate }}%</dd></div><div><dt>Product intent</dt><dd>{{ report.sections.personas.data.metrics.productIntentPersonas }}</dd></div><div><dt>Website matches</dt><dd>{{ report.sections.personas.data.metrics.websiteMatchedLeads }}</dd></div><div><dt>Identity conflicts</dt><dd>{{ report.sections.personas.data.metrics.conflictPersonas }}</dd></div></dl></div>
        </div>
      </template>
      <p v-else-if="report.sections.personas.status === 'unavailable'" class="print-unavailable">Audience and identity data is unavailable for this report.</p>
      <p v-else class="print-empty print-card">Persona audience signals are not enabled for this client.</p>

      <footer class="print-report-footer">Generated by XeroFlow · {{ clientName }} · {{ fmtDate(report.filters.startDate) }} – {{ fmtDate(report.filters.endDate) }}</footer>
    </section>
  </article>
</template>

<style>
@page {
  size: A4 portrait;
  margin: 12mm;
}

.portal-analytics-print-report {
  --print-ink: #172033;
  --print-muted: #667085;
  --print-border: #d7dce5;
  --print-soft: #f5f7fa;
  --print-primary: #117a65;
  width: 100%;
  max-width: 186mm;
  margin: 0 auto;
  color: var(--print-ink);
  background: #fff;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 9.5pt;
  line-height: 1.35;
}

.portal-analytics-print-report *,
.portal-analytics-print-report *::before,
.portal-analytics-print-report *::after { box-sizing: border-box; }
.portal-analytics-print-report h1,
.portal-analytics-print-report h2,
.portal-analytics-print-report h3,
.portal-analytics-print-report p { margin: 0; }
.portal-analytics-print-report h1 { font-size: 18pt; line-height: 1.15; }
.portal-analytics-print-report h2 { font-size: 15pt; line-height: 1.2; }
.portal-analytics-print-report h3 { font-size: 10pt; }
.print-report-header { display: flex; align-items: center; justify-content: space-between; gap: 8mm; padding-bottom: 5mm; margin-bottom: 6mm; border-bottom: 1px solid var(--print-border); }
.print-brand { display: flex; align-items: center; gap: 4mm; min-width: 0; }
.print-logo { width: 13mm; height: 13mm; border-radius: 3mm; object-fit: contain; }
.print-eyebrow { margin-bottom: 1mm !important; color: var(--print-primary); font-size: 7pt; font-weight: 700; letter-spacing: .09em; text-transform: uppercase; }
.print-period { display: flex; flex-direction: column; flex: none; align-items: flex-end; gap: 1mm; color: var(--print-muted); font-size: 7.5pt; }
.print-period strong { color: var(--print-ink); font-size: 8pt; }
.print-section { margin-top: 9mm; }
.print-section-heading { display: flex; align-items: end; justify-content: space-between; gap: 6mm; padding-bottom: 3mm; margin-bottom: 4mm; border-bottom: 1px solid var(--print-border); }
.print-section-heading > p { color: var(--print-muted); font-size: 8pt; text-align: right; }
.print-kpi-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 3mm; }
.print-two-column { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4mm; }
.print-card { min-width: 0; padding: 3.5mm; border: 1px solid var(--print-border); border-radius: 2.5mm; background: #fff; break-inside: avoid; }
.print-kpi { display: flex; min-height: 22mm; flex-direction: column; justify-content: space-between; }
.print-kpi > span { color: var(--print-muted); font-size: 7.5pt; }
.print-kpi > strong { margin: 1mm 0; font-size: 15pt; line-height: 1; }
.print-kpi > small { color: var(--print-muted); font-size: 6.8pt; }
.print-positive { color: #067647 !important; }
.print-negative { color: #b42318 !important; }
.print-summary-row { margin-top: 4mm; }
.print-card-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 4mm; margin-bottom: 3mm; }
.print-card-heading span { color: var(--print-muted); font-size: 7pt; }
.print-chart { width: 100%; height: 46mm; }
.print-chart-compact { height: 32mm; }
.print-chart svg { display: block; width: 100%; height: 100%; overflow: visible; }
.print-chart-axis { stroke: var(--print-border); stroke-width: 1; }
.print-chart-line { fill: none; stroke: var(--print-primary); stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
.print-chart-range { display: flex; justify-content: space-between; color: var(--print-muted); font-size: 6.5pt; }
.print-stack { display: flex; flex-direction: column; gap: 2.4mm; }
.print-bar-row > div:first-child { display: flex; justify-content: space-between; gap: 4mm; font-size: 7.5pt; }
.print-bar-row small { color: var(--print-muted); font-size: 6.5pt; }
.print-bar { height: 1.8mm; margin: 1mm 0; overflow: hidden; border-radius: 999px; background: #e9edf3; }
.print-bar i { display: block; height: 100%; border-radius: inherit; background: var(--print-primary); }
.print-freshness { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 3mm; margin-bottom: 4mm; }
.print-freshness-card { display: flex; flex-direction: column; gap: .8mm; }
.print-freshness-card span,
.print-freshness-card small { color: var(--print-muted); font-size: 7pt; }
.print-table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 6.8pt; }
.print-table thead { display: table-header-group; }
.print-table tr { break-inside: avoid; page-break-inside: avoid; }
.print-table th { color: #475467; background: var(--print-soft); font-weight: 700; text-align: left; }
.print-table th,
.print-table td { padding: 2.1mm 1.6mm; border: 1px solid var(--print-border); overflow-wrap: anywhere; vertical-align: top; }
.print-campaign-table th:first-child { width: 25%; }
.print-campaign-table th:nth-child(2) { width: 11%; }
.print-campaign-table th:nth-child(3) { width: 11%; }
.print-definition-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 2.5mm; margin: 0; }
.print-definition-grid > div { padding: 2.5mm; border-radius: 2mm; background: var(--print-soft); }
.print-definition-grid dt { color: var(--print-muted); font-size: 7pt; }
.print-definition-grid dd { margin: 1mm 0 0; font-size: 11pt; font-weight: 700; }
.print-subsection { margin-top: 4mm; }
.print-ranked-list { display: flex; flex-direction: column; gap: 1.6mm; padding: 0; margin: 0; list-style: none; }
.print-ranked-list li { display: flex; justify-content: space-between; gap: 4mm; padding-bottom: 1.4mm; border-bottom: 1px solid #eaecf0; font-size: 7.5pt; }
.print-ranked-list li span { min-width: 0; }
.print-ranked-list li strong { flex: none; }
.print-wrap { overflow-wrap: anywhere; word-break: break-word; }
.print-issues { padding-left: 4mm; margin: 3mm 0 0; color: #b42318; font-size: 7pt; }
.print-empty,
.print-unavailable { color: var(--print-muted); font-size: 8pt; }
.print-unavailable { padding: 3mm; border: 1px dashed #f2b8b5; border-radius: 2mm; background: #fff7f6; color: #912018; }
.print-report-footer { padding-top: 4mm; margin-top: 8mm; border-top: 1px solid var(--print-border); color: var(--print-muted); font-size: 7pt; text-align: center; }

@media print {
  html, body { width: auto !important; height: auto !important; overflow: visible !important; background: #fff !important; }
  .portal-analytics-print-report { max-width: none; margin: 0; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  .print-page-start { break-before: page; page-break-before: always; }
  .print-section-heading,
  .print-report-header,
  .print-kpi,
  .print-card-heading { break-after: avoid; page-break-after: avoid; }
  .print-table { break-inside: auto; page-break-inside: auto; }
}
</style>
