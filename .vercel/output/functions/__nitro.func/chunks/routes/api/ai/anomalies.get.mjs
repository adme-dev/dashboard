import { e as eventHandler, $ as $fetch } from '../../../nitro/nitro.mjs';
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

const anomalies_get = eventHandler(async (event) => {
  var _a, _b;
  const [pnl, expenses] = await Promise.all([
    $fetch("/api/xero/reports/pnl", { headers: event.headers }).catch(() => null),
    $fetch("/api/xero/expenses", { headers: event.headers }).catch(() => null)
  ]);
  const anomalies = [];
  if (pnl) {
    const margin = pnl.profitMargin || 0;
    if (margin < 0.05) {
      anomalies.push({ type: "revenue", message: `Low profit margin (${Math.round(margin * 100)}%)`, severity: "warning" });
    }
  }
  if (expenses) {
    const top = (_a = expenses.categories) == null ? void 0 : _a[0];
    const second = (_b = expenses.categories) == null ? void 0 : _b[1];
    if (top && second && top.amount > second.amount * 2) {
      anomalies.push({ type: "expense", message: `Category ${top.name} is over 2x next category`, severity: "warning" });
    }
  }
  return { anomalies };
});

export { anomalies_get as default };
//# sourceMappingURL=anomalies.get.mjs.map
