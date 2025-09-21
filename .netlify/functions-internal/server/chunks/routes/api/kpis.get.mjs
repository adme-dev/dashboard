import { e as eventHandler, g as getSelectedTenant, a as getCached, $ as $fetch, b as setCached } from '../../nitro/nitro.mjs';
import 'node:http';
import 'node:https';
import 'node:events';
import 'node:buffer';
import 'node:fs';
import 'node:path';
import 'node:crypto';
import '@iconify/utils';
import 'consola';

const kpis_get = eventHandler(async (event) => {
  const tenantId = getSelectedTenant(event);
  const cacheKey = tenantId ? `kpis:${tenantId}` : "kpis:anon";
  const cached = await getCached(cacheKey);
  if (cached) return cached;
  try {
    const pnl = await $fetch("/api/xero/reports/pnl", { headers: event.headers });
    const kpis = [
      {
        title: "Revenue",
        icon: "i-lucide-circle-dollar-sign",
        value: pnl.revenueTotal,
        variation: 0
      },
      {
        title: "Expenses",
        icon: "i-lucide-wallet",
        value: pnl.expensesTotal,
        variation: 0
      },
      {
        title: "Profit",
        icon: "i-lucide-piggy-bank",
        value: pnl.netProfit,
        variation: 0
      },
      {
        title: "Profit Margin",
        icon: "i-lucide-percent",
        value: Math.round((pnl.profitMargin || 0) * 100),
        variation: 0,
        formatter: (v) => `${v}%`
      }
    ];
    await setCached(cacheKey, kpis, 15 * 60 * 1e3);
    return kpis;
  } catch {
    return [];
  }
});

export { kpis_get as default };
//# sourceMappingURL=kpis.get.mjs.map
