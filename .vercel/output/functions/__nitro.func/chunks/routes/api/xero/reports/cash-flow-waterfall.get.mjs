import { e as eventHandler, g as getActiveTokenForSession, a as getSelectedTenant, c as createError, b as getQuery, d as createXeroClient } from '../../../../nitro/nitro.mjs';
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

function ensureDateString(d) {
  return d.toISOString().slice(0, 10);
}
function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}
function toXeroDateTime(date) {
  return `DateTime(${date.getUTCFullYear()}, ${date.getUTCMonth() + 1}, ${date.getUTCDate()})`;
}
const cashFlowWaterfall_get = eventHandler(async (event) => {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i;
  const token = await getActiveTokenForSession(event);
  const tenantId = getSelectedTenant(event);
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: "No organization selected" });
  }
  const query = getQuery(event);
  const period = String(query.period || "30");
  const daysAhead = Number(period);
  const today = /* @__PURE__ */ new Date();
  addDays(today, daysAhead);
  const client = await createXeroClient({ tokenSet: token, event });
  const fromDate = addDays(today, -30);
  const { body: bankReport } = await client.accountingApi.getReportBankSummary(
    tenantId,
    ensureDateString(fromDate),
    ensureDateString(today),
    void 0,
    false
  );
  let startingBalance = 0;
  const reportRows = ((_b = (_a = bankReport == null ? void 0 : bankReport.reports) == null ? void 0 : _a[0]) == null ? void 0 : _b.rows) || ((_d = (_c = bankReport == null ? void 0 : bankReport.Reports) == null ? void 0 : _c[0]) == null ? void 0 : _d.Rows) || [];
  function flattenRows(rows, out = []) {
    for (const row of rows) {
      out.push(row);
      if ((row == null ? void 0 : row.Rows) || (row == null ? void 0 : row.rows)) {
        flattenRows(row.Rows || row.rows, out);
      }
    }
    return out;
  }
  const allRows = flattenRows(reportRows);
  for (const row of allRows) {
    const cells = (row == null ? void 0 : row.Cells) || (row == null ? void 0 : row.cells) || [];
    const lastCell = cells[cells.length - 1];
    const value = (_e = lastCell == null ? void 0 : lastCell.Value) != null ? _e : lastCell == null ? void 0 : lastCell.value;
    if (typeof value === "number") {
      startingBalance += value;
    } else if (typeof value === "string") {
      const parsed = Number(value);
      if (!isNaN(parsed)) startingBalance += parsed;
    }
  }
  const [receivables, payables] = await Promise.all([
    client.accountingApi.getInvoices(
      tenantId,
      void 0,
      `Type=="ACCREC"&&Status=="AUTHORISED"`,
      "DueDate ASC",
      void 0,
      void 0,
      void 0,
      void 0,
      1,
      void 0,
      void 0,
      void 0,
      200
    ),
    client.accountingApi.getInvoices(
      tenantId,
      void 0,
      `Type=="ACCPAY"&&Status=="AUTHORISED"`,
      "DueDate ASC",
      void 0,
      void 0,
      void 0,
      void 0,
      1,
      void 0,
      void 0,
      void 0,
      200
    )
  ]);
  const receivableCategories = /* @__PURE__ */ new Map();
  const overdueReceivables = /* @__PURE__ */ new Map();
  for (const invoice of ((_f = receivables == null ? void 0 : receivables.body) == null ? void 0 : _f.invoices) || []) {
    const dueDate = (invoice == null ? void 0 : invoice.dueDate) ? new Date(invoice.dueDate) : null;
    const amountDue = Number(invoice == null ? void 0 : invoice.amountDue) || 0;
    const contactName = ((_g = invoice == null ? void 0 : invoice.contact) == null ? void 0 : _g.name) || "Unknown Customer";
    if (dueDate && amountDue > 0) {
      if (dueDate < today) {
        const current = overdueReceivables.get(contactName) || 0;
        overdueReceivables.set(contactName, current + amountDue);
      } else {
        const current = receivableCategories.get(contactName) || 0;
        receivableCategories.set(contactName, current + amountDue);
      }
    }
  }
  const payableCategories = /* @__PURE__ */ new Map();
  const overduePayables = /* @__PURE__ */ new Map();
  for (const invoice of ((_h = payables == null ? void 0 : payables.body) == null ? void 0 : _h.invoices) || []) {
    const dueDate = (invoice == null ? void 0 : invoice.dueDate) ? new Date(invoice.dueDate) : null;
    const amountDue = Number(invoice == null ? void 0 : invoice.amountDue) || 0;
    const contactName = ((_i = invoice == null ? void 0 : invoice.contact) == null ? void 0 : _i.name) || "Unknown Vendor";
    if (dueDate && amountDue > 0) {
      if (dueDate < today) {
        const current = overduePayables.get(contactName) || 0;
        overduePayables.set(contactName, current + amountDue);
      } else {
        const current = payableCategories.get(contactName) || 0;
        payableCategories.set(contactName, current + amountDue);
      }
    }
  }
  const pastDate = addDays(today, -90);
  const { body: recentExpenses } = await client.accountingApi.getInvoices(
    tenantId,
    void 0,
    `Type=="ACCPAY"&&Status=="PAID"&&Date>=${toXeroDateTime(pastDate)}`,
    "Date DESC",
    void 0,
    void 0,
    void 0,
    void 0,
    1,
    void 0,
    void 0,
    void 0,
    300
  );
  const totalHistoricalExpenses = ((recentExpenses == null ? void 0 : recentExpenses.invoices) || []).reduce((sum, inv) => sum + (Number(inv == null ? void 0 : inv.total) || 0), 0);
  const avgDailyExpenses = totalHistoricalExpenses / 90;
  const projectedOperatingExpenses = avgDailyExpenses * daysAhead;
  const inflows = [];
  if (overdueReceivables.size > 0) {
    const totalOverdue = Array.from(overdueReceivables.values()).reduce((sum, amt) => sum + amt, 0);
    inflows.push({
      category: "Overdue Receivables",
      amount: totalOverdue
    });
  }
  const sortedReceivables = Array.from(receivableCategories.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
  for (const [customer, amount] of sortedReceivables) {
    inflows.push({
      category: customer.length > 20 ? customer.substring(0, 20) + "..." : customer,
      amount
    });
  }
  const outflows = [];
  if (projectedOperatingExpenses > 0) {
    outflows.push({
      category: `Operating Expenses (${daysAhead}d)`,
      amount: projectedOperatingExpenses
    });
  }
  if (overduePayables.size > 0) {
    const totalOverduePayables = Array.from(overduePayables.values()).reduce((sum, amt) => sum + amt, 0);
    outflows.push({
      category: "Overdue Payables",
      amount: totalOverduePayables
    });
  }
  const sortedPayables = Array.from(payableCategories.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
  for (const [vendor, amount] of sortedPayables) {
    outflows.push({
      category: vendor.length > 20 ? vendor.substring(0, 20) + "..." : vendor,
      amount
    });
  }
  const totalInflows = inflows.reduce((sum, item) => sum + item.amount, 0);
  const totalOutflows = outflows.reduce((sum, item) => sum + item.amount, 0);
  const endingBalance = startingBalance + totalInflows - totalOutflows;
  return {
    period: `${daysAhead} days`,
    startingBalance: Math.round(startingBalance * 100) / 100,
    endingBalance: Math.round(endingBalance * 100) / 100,
    netChange: Math.round((endingBalance - startingBalance) * 100) / 100,
    inflows: inflows.map((item) => ({
      ...item,
      amount: Math.round(item.amount * 100) / 100
    })),
    outflows: outflows.map((item) => ({
      ...item,
      amount: Math.round(item.amount * 100) / 100
    })),
    totals: {
      totalInflows: Math.round(totalInflows * 100) / 100,
      totalOutflows: Math.round(totalOutflows * 100) / 100,
      netCashFlow: Math.round((totalInflows - totalOutflows) * 100) / 100
    },
    breakdown: {
      overdueReceivables: Array.from(overdueReceivables.entries()).map(([customer, amount]) => ({
        customer,
        amount: Math.round(amount * 100) / 100
      })),
      overduePayables: Array.from(overduePayables.entries()).map(([vendor, amount]) => ({
        vendor,
        amount: Math.round(amount * 100) / 100
      })),
      projectedExpenses: Math.round(projectedOperatingExpenses * 100) / 100
    }
  };
});

export { cashFlowWaterfall_get as default };
//# sourceMappingURL=cash-flow-waterfall.get.mjs.map
