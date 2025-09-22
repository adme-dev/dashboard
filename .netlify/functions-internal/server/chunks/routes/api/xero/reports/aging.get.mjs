import { e as eventHandler, g as getActiveTokenForSession, a as getSelectedTenant, c as createError, b as getQuery, d as createXeroClient } from '../../../../nitro/nitro.mjs';
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

function ensureDateString(d) {
  return d.toISOString().slice(0, 10);
}
function daysBetween(date1, date2) {
  const diffTime = Math.abs(date2.getTime() - date1.getTime());
  return Math.ceil(diffTime / (1e3 * 60 * 60 * 24));
}
function getAgingBucket(daysPastDue) {
  if (daysPastDue <= 0) return "current";
  if (daysPastDue <= 30) return "1-30";
  if (daysPastDue <= 60) return "31-60";
  if (daysPastDue <= 90) return "61-90";
  return "90+";
}
const aging_get = eventHandler(async (event) => {
  var _a;
  const token = await getActiveTokenForSession(event);
  const tenantId = getSelectedTenant(event);
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: "No organization selected" });
  }
  const query = getQuery(event);
  const reportType = String(query.type || "receivables");
  const today = /* @__PURE__ */ new Date();
  const client = await createXeroClient({ tokenSet: token });
  const invoiceType = reportType === "receivables" ? "ACCREC" : "ACCPAY";
  const statusFilter = "AUTHORISED";
  const { body: invoicesResponse } = await client.accountingApi.getInvoices(
    tenantId,
    void 0,
    `Type=="${invoiceType}"&&Status=="${statusFilter}"`,
    "DueDate ASC",
    void 0,
    void 0,
    void 0,
    void 0,
    1,
    void 0,
    void 0,
    void 0,
    500
  );
  const invoices = (invoicesResponse == null ? void 0 : invoicesResponse.invoices) || [];
  const agingData = {
    current: { amount: 0, count: 0, invoices: [] },
    "1-30": { amount: 0, count: 0, invoices: [] },
    "31-60": { amount: 0, count: 0, invoices: [] },
    "61-90": { amount: 0, count: 0, invoices: [] },
    "90+": { amount: 0, count: 0, invoices: [] }
  };
  let totalOutstanding = 0;
  const contactSummary = /* @__PURE__ */ new Map();
  for (const invoice of invoices) {
    const dueDate = (invoice == null ? void 0 : invoice.dueDate) ? new Date(invoice.dueDate) : null;
    const amountDue = Number(invoice == null ? void 0 : invoice.amountDue) || 0;
    const contactName = ((_a = invoice == null ? void 0 : invoice.contact) == null ? void 0 : _a.name) || "Unknown";
    if (!dueDate || amountDue <= 0) continue;
    const daysPastDue = daysBetween(dueDate, today);
    const bucket = getAgingBucket(daysPastDue);
    const invoiceData = {
      id: invoice.invoiceID,
      number: invoice.invoiceNumber,
      contact: contactName,
      dueDate: ensureDateString(dueDate),
      amount: amountDue,
      daysPastDue,
      status: invoice.status
    };
    agingData[bucket].amount += amountDue;
    agingData[bucket].count += 1;
    agingData[bucket].invoices.push(invoiceData);
    totalOutstanding += amountDue;
    const existing = contactSummary.get(contactName) || { amount: 0, count: 0, oldestDays: 0 };
    contactSummary.set(contactName, {
      amount: existing.amount + amountDue,
      count: existing.count + 1,
      oldestDays: Math.max(existing.oldestDays, daysPastDue)
    });
  }
  const topContacts = Array.from(contactSummary.entries()).map(([name, data]) => ({ name, ...data })).sort((a, b) => b.amount - a.amount).slice(0, 10);
  const agingSummary = Object.entries(agingData).map(([bucket, data]) => ({
    bucket,
    amount: Math.round(data.amount * 100) / 100,
    count: data.count,
    percentage: totalOutstanding > 0 ? Math.round(data.amount / totalOutstanding * 100 * 100) / 100 : 0
  }));
  const averageDaysPastDue = invoices.length > 0 ? invoices.reduce((sum, inv) => {
    const dueDate = (inv == null ? void 0 : inv.dueDate) ? new Date(inv.dueDate) : null;
    return sum + (dueDate ? daysBetween(dueDate, today) : 0);
  }, 0) / invoices.length : 0;
  const criticalCount = agingData["90+"].count;
  const criticalAmount = agingData["90+"].amount;
  return {
    reportType,
    asOfDate: ensureDateString(today),
    totalOutstanding: Math.round(totalOutstanding * 100) / 100,
    totalInvoices: invoices.length,
    averageDaysPastDue: Math.round(averageDaysPastDue * 100) / 100,
    criticalCount,
    criticalAmount: Math.round(criticalAmount * 100) / 100,
    agingSummary,
    agingDetails: agingData,
    topContacts,
    trends: {
      // This could be enhanced with historical data comparison
      weekOverWeek: null,
      monthOverMonth: null
    }
  };
});

export { aging_get as default };
//# sourceMappingURL=aging.get.mjs.map
