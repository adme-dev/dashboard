import { e as eventHandler, r as readBody, c as createError, $ as $fetch } from '../../../nitro/nitro.mjs';
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

const chat_post = eventHandler(async (event) => {
  var _a, _b, _c, _d, _e;
  const body = await readBody(event);
  const prompt = ((body == null ? void 0 : body.prompt) || "").toLowerCase();
  if (!prompt) throw createError({ statusCode: 400, statusMessage: "prompt required" });
  const want = {
    pnl: /p&l|profit|revenue|expenses|margin/.test(prompt),
    cash: /cash|balance|bank|runway|forecast/.test(prompt),
    invoices: /invoice|overdue|outstanding|paid/.test(prompt),
    expenses: /expense|vendor|category|spend/.test(prompt)
  };
  const results = [];
  if (want.pnl) {
    const pnl = await $fetch("/api/xero/reports/pnl", { headers: event.headers }).catch(() => null);
    if (pnl) {
      results.push(`P&L: Revenue ${Math.round(pnl.revenueTotal).toLocaleString("en-US")}, Expenses ${Math.round(pnl.expensesTotal).toLocaleString("en-US")}, Profit ${Math.round(pnl.netProfit).toLocaleString("en-US")}, Margin ${Math.round((pnl.profitMargin || 0) * 100)}%`);
    }
  }
  if (want.cash) {
    const cash = await $fetch("/api/cashflow", { headers: event.headers }).catch(() => null);
    if (cash) {
      const next30 = (_a = cash.buckets) == null ? void 0 : _a[0];
      results.push(`Cash: Starting ${Math.round(cash.startingBalance).toLocaleString("en-US")}; 30d projected ${Math.round((next30 == null ? void 0 : next30.projected) || 0).toLocaleString("en-US")}`);
    }
  }
  if (want.invoices) {
    const inv = await $fetch("/api/xero/invoices", { headers: event.headers }).catch(() => null);
    if (inv) {
      results.push(`Invoices: Outstanding ${((_b = inv.outstanding) == null ? void 0 : _b.length) || 0}, Overdue ${((_c = inv.overdue) == null ? void 0 : _c.length) || 0}, Paid (recent) ${((_d = inv.paid) == null ? void 0 : _d.length) || 0}`);
    }
  }
  if (want.expenses) {
    const ex = await $fetch("/api/xero/expenses", { headers: event.headers }).catch(() => null);
    if (ex) {
      const top = (_e = ex.categories) == null ? void 0 : _e[0];
      results.push(`Expenses: Top category ${(top == null ? void 0 : top.name) || "N/A"} at ${Math.round((top == null ? void 0 : top.amount) || 0).toLocaleString("en-US")} last 90d`);
    }
  }
  if (!results.length) {
    results.push("Try asking about P&L, cash flow, invoices, or expenses.");
  }
  return { reply: results.join(" | ") };
});

export { chat_post as default };
//# sourceMappingURL=chat.post.mjs.map
