import { e as eventHandler, $ as $fetch } from '../../../nitro/nitro.mjs';
import 'node:http';
import 'node:https';
import 'node:events';
import 'node:buffer';
import 'node:fs';
import 'node:path';
import 'node:crypto';
import '@iconify/utils';
import 'consola';

const recommendations_get = eventHandler(async (event) => {
  var _a, _b;
  const [pnl, invoices, expenses] = await Promise.all([
    $fetch("/api/xero/reports/pnl", { headers: event.headers }).catch(() => null),
    $fetch("/api/xero/invoices", { headers: event.headers }).catch(() => null),
    $fetch("/api/xero/expenses", { headers: event.headers }).catch(() => null)
  ]);
  const recs = [];
  if (invoices) {
    const overdueCount = ((_a = invoices.overdue) == null ? void 0 : _a.length) || 0;
    if (overdueCount > 0) {
      recs.push({ category: "collections", text: `You have ${overdueCount} overdue invoices. Consider sending automated reminders and offering small early-payment discounts.` });
    }
  }
  if (expenses) {
    const top = (_b = expenses.categories) == null ? void 0 : _b[0];
    if (top && top.amount > 1e3) {
      recs.push({ category: "cost", text: `Review top expense category (${top.name}). Negotiate with vendors or reduce recurring services.` });
    }
  }
  if (pnl && (pnl.profitMargin || 0) < 0.1) {
    recs.push({ category: "cash", text: "Low profit margin; consider tightening payment terms to improve short-term cash flow." });
  }
  return { recommendations: recs };
});

export { recommendations_get as default };
//# sourceMappingURL=recommendations.get.mjs.map
