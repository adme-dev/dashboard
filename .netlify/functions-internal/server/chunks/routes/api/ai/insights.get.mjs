import { e as eventHandler, $ as $fetch } from '../../../nitro/nitro.mjs';
import 'groq-sdk';
import 'xero-node';
import 'node:http';
import 'node:https';
import 'node:events';
import 'node:buffer';
import 'node:fs';
import 'node:path';
import 'node:crypto';
import '@iconify/utils';
import 'consola';

const insights_get = eventHandler(async (event) => {
  var _a, _b, _c;
  const [pnl, cashflow, expenses] = await Promise.all([
    $fetch("/api/xero/reports/pnl", { headers: event.headers }).catch(() => null),
    $fetch("/api/cashflow", { headers: event.headers }).catch(() => null),
    $fetch("/api/xero/expenses", { headers: event.headers }).catch(() => null)
  ]);
  const insights = [];
  if (pnl) {
    const marginPct = Math.round((pnl.profitMargin || 0) * 100);
    insights.push({
      title: "Profitability",
      detail: `Profit margin is ${marginPct}% for the selected period. Net profit is ${Math.round(pnl.netProfit).toLocaleString("en-US")}.`,
      severity: marginPct >= 20 ? "success" : marginPct < 5 ? "warning" : "info"
    });
  }
  if (cashflow) {
    const next30 = (_a = cashflow == null ? void 0 : cashflow.buckets) == null ? void 0 : _a[0];
    if (next30) {
      insights.push({
        title: "30-day Cash Outlook",
        detail: `Projected cash position in 30 days is ${next30.projected.toLocaleString("en-US")} with inflows ${next30.inflow.toLocaleString("en-US")}.`,
        severity: next30.projected < 0 ? "warning" : "info"
      });
    }
  }
  if (expenses) {
    const topVendor = (_b = expenses.vendors) == null ? void 0 : _b[0];
    const topCategory = (_c = expenses.categories) == null ? void 0 : _c[0];
    if (topVendor) {
      insights.push({
        title: "Top Vendor Spend",
        detail: `Highest 90-day vendor spend is ${topVendor.name} at ${Math.round(topVendor.amount).toLocaleString("en-US")}.`,
        severity: "info"
      });
    }
    if (topCategory) {
      insights.push({
        title: "Top Expense Category",
        detail: `Category ${topCategory.name} totals ${Math.round(topCategory.amount).toLocaleString("en-US")} over 90 days. Consider reviewing recurring costs.`,
        severity: "info"
      });
    }
  }
  return { insights };
});

export { insights_get as default };
//# sourceMappingURL=insights.get.mjs.map
