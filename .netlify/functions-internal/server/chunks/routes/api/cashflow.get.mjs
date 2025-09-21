import { e as eventHandler, $ as $fetch } from '../../nitro/nitro.mjs';
import 'node:http';
import 'node:https';
import 'node:events';
import 'node:buffer';
import 'node:fs';
import 'node:path';
import 'node:crypto';
import '@iconify/utils';
import 'consola';

function addDays(d, days) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}
function ensureDateString(d) {
  return d.toISOString().slice(0, 10);
}
const cashflow_get = eventHandler(async (event) => {
  var _a, _b;
  const today = /* @__PURE__ */ new Date();
  const todayStr = ensureDateString(today);
  const [bank, invoices] = await Promise.all([
    $fetch("/api/xero/reports/bank-summary", { headers: event.headers }),
    $fetch("/api/xero/invoices", { headers: event.headers })
  ]);
  const starting = (_a = bank == null ? void 0 : bank.totalBalance) != null ? _a : 0;
  const buckets = [
    { label: "30d", end: addDays(today, 30), inflow: 0, outflow: 0 },
    { label: "60d", end: addDays(today, 60), inflow: 0, outflow: 0 },
    { label: "90d", end: addDays(today, 90), inflow: 0, outflow: 0 }
  ];
  function parseDate(s) {
    if (!s) return void 0;
    const d = new Date(s);
    return isNaN(+d) ? void 0 : d;
  }
  for (const inv of ((invoices == null ? void 0 : invoices.outstanding) || []).concat((invoices == null ? void 0 : invoices.overdue) || [])) {
    const due = parseDate(inv == null ? void 0 : inv.dueDate);
    if (!due) continue;
    for (const b of buckets) {
      if (due <= b.end) {
        b.inflow += (_b = inv == null ? void 0 : inv.amountDue) != null ? _b : 0;
        break;
      }
    }
  }
  const result = buckets.map((b) => ({
    label: b.label,
    end: ensureDateString(b.end),
    inflow: Math.round(b.inflow),
    outflow: Math.round(b.outflow),
    projected: Math.round(starting + b.inflow - b.outflow)
  }));
  return { asOf: todayStr, startingBalance: starting, buckets: result };
});

export { cashflow_get as default };
//# sourceMappingURL=cashflow.get.mjs.map
