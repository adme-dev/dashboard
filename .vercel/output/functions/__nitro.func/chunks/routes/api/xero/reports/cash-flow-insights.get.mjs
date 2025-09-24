import { e as eventHandler, g as getActiveTokenForSession, a as getSelectedTenant, c as createError, d as createXeroClient } from '../../../../nitro/nitro.mjs';
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
function parseNumeric(value) {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    const isNegative = value.includes("(") && value.includes(")");
    const cleaned = value.replace(/[^0-9.\-]/g, "");
    const num = Number(cleaned || 0);
    return isNegative ? -Math.abs(num) : num;
  }
  return 0;
}
function extractValueFromRow(row) {
  var _a, _b, _c;
  const cells = (row == null ? void 0 : row.Cells) || (row == null ? void 0 : row.cells) || [];
  if (!cells.length) return 0;
  return parseNumeric((_c = (_a = cells[cells.length - 1]) == null ? void 0 : _a.Value) != null ? _c : (_b = cells[cells.length - 1]) == null ? void 0 : _b.value);
}
function flattenRows(rows, out = []) {
  for (const row of rows || []) {
    out.push(row);
    const childRows = (row == null ? void 0 : row.Rows) || (row == null ? void 0 : row.rows);
    if (childRows == null ? void 0 : childRows.length) {
      flattenRows(childRows, out);
    }
  }
  return out;
}
async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function safeApiCall(label, fn) {
  var _a, _b;
  try {
    return await fn();
  } catch (err) {
    const status = ((_a = err == null ? void 0 : err.response) == null ? void 0 : _a.statusCode) || ((_b = err == null ? void 0 : err.response) == null ? void 0 : _b.status) || (err == null ? void 0 : err.statusCode);
    if (status === 429) {
      console.warn(`[cash-flow-insights] Rate limited on ${label}, retrying once...`);
      await sleep(300);
      try {
        return await fn();
      } catch (retryErr) {
        console.error(`[cash-flow-insights] Retry failed for ${label}:`, retryErr);
        return null;
      }
    }
    console.error(`[cash-flow-insights] Failed to fetch ${label}:`, err);
    return null;
  }
}
async function fetchInvoiceSummary(client, tenantId, status, type) {
  var _a;
  const response = await safeApiCall(
    `${type}-${status}`,
    () => client.accountingApi.getInvoices(
      tenantId,
      void 0,
      `Type=="${type}"&&Status=="${status}"`,
      "Date DESC",
      void 0,
      void 0,
      void 0,
      void 0,
      1,
      void 0,
      void 0,
      void 0,
      500
    )
  );
  const invoices = ((_a = response == null ? void 0 : response.body) == null ? void 0 : _a.invoices) || [];
  const total = invoices.reduce((sum, inv) => sum + (Number(inv == null ? void 0 : inv.total) || 0), 0);
  return {
    status,
    count: invoices.length,
    total
  };
}
async function fetchOutstandingReceivables(client, tenantId) {
  var _a;
  const response = await safeApiCall(
    "invoices-outstanding",
    () => client.accountingApi.getInvoices(
      tenantId,
      void 0,
      'Type=="ACCREC"&&Status=="AUTHORISED"&&AmountDue>0',
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
    )
  );
  const invoices = ((_a = response == null ? void 0 : response.body) == null ? void 0 : _a.invoices) || [];
  const today = /* @__PURE__ */ new Date();
  const grouped = /* @__PURE__ */ new Map();
  for (const invoice of invoices) {
    const contact = invoice == null ? void 0 : invoice.contact;
    if (!(contact == null ? void 0 : contact.contactID)) continue;
    const key = contact.contactID;
    const amountDue = Number(invoice == null ? void 0 : invoice.amountDue) || 0;
    const total = Number(invoice == null ? void 0 : invoice.total) || 0;
    const dueDate = (invoice == null ? void 0 : invoice.dueDate) ? new Date(invoice.dueDate) : null;
    const invoiceDate = (invoice == null ? void 0 : invoice.date) ? new Date(invoice.date) : null;
    const isOverdue = !!(dueDate && dueDate < today);
    if (!grouped.has(key)) {
      grouped.set(key, {
        contactId: key,
        name: (contact == null ? void 0 : contact.name) || "Unknown Client",
        totalOutstanding: 0,
        totalInvoices: 0,
        overdueAmount: 0,
        overdueCount: 0,
        earliestDueDate: null,
        latestInvoiceDate: null,
        invoices: []
      });
    }
    const entry = grouped.get(key);
    entry.totalOutstanding += amountDue;
    entry.totalInvoices += 1;
    if (isOverdue) {
      entry.overdueAmount += amountDue;
      entry.overdueCount += 1;
    }
    if (!entry.earliestDueDate || dueDate && dueDate < entry.earliestDueDate) {
      entry.earliestDueDate = dueDate;
    }
    if (!entry.latestInvoiceDate || invoiceDate && invoiceDate > entry.latestInvoiceDate) {
      entry.latestInvoiceDate = invoiceDate;
    }
    entry.invoices.push({
      id: invoice.invoiceID,
      number: invoice.invoiceNumber,
      reference: invoice.reference,
      amountDue,
      total,
      dueDate: dueDate ? dueDate.toISOString() : null,
      date: invoiceDate ? invoiceDate.toISOString() : null,
      isOverdue
    });
  }
  const summary = Array.from(grouped.values()).map((entry) => ({
    ...entry,
    overdueRatio: entry.totalOutstanding > 0 ? entry.overdueAmount / entry.totalOutstanding : 0,
    earliestDueDate: entry.earliestDueDate ? entry.earliestDueDate.toISOString() : null,
    latestInvoiceDate: entry.latestInvoiceDate ? entry.latestInvoiceDate.toISOString() : null,
    invoices: entry.invoices.sort((a, b) => {
      const da = a.dueDate ? new Date(a.dueDate) : null;
      const db = b.dueDate ? new Date(b.dueDate) : null;
      if (da && db) return da.getTime() - db.getTime();
      if (da) return -1;
      if (db) return 1;
      return 0;
    }).slice(0, 3)
  })).sort((a, b) => b.totalOutstanding - a.totalOutstanding);
  return summary;
}
async function fetchQuotesByStatus(client, tenantId, status) {
  var _a;
  const response = await safeApiCall(
    `quotes-${status}`,
    () => client.accountingApi.getQuotes(
      tenantId,
      void 0,
      void 0,
      void 0,
      void 0,
      void 0,
      void 0,
      status,
      void 0,
      void 0,
      void 0
    )
  );
  const quotes = ((_a = response == null ? void 0 : response.body) == null ? void 0 : _a.quotes) || [];
  const total = quotes.reduce((sum, quote) => sum + (Number(quote == null ? void 0 : quote.total) || 0), 0);
  return {
    status,
    count: quotes.length,
    total
  };
}
async function fetchPurchaseOrders(client, tenantId, status) {
  var _a;
  const response = await safeApiCall(
    `purchase-orders-${status}`,
    () => client.accountingApi.getPurchaseOrders(
      tenantId,
      void 0,
      status,
      void 0,
      void 0,
      void 0,
      1,
      200
    )
  );
  const purchaseOrders = ((_a = response == null ? void 0 : response.body) == null ? void 0 : _a.purchaseOrders) || [];
  const total = purchaseOrders.reduce((sum, po) => sum + (Number(po == null ? void 0 : po.total) || 0), 0);
  return {
    status,
    count: purchaseOrders.length,
    total
  };
}
function computeWorkingCapital(report) {
  var _a, _b, _c, _d;
  const rows = ((_b = (_a = report == null ? void 0 : report.reports) == null ? void 0 : _a[0]) == null ? void 0 : _b.rows) || ((_d = (_c = report == null ? void 0 : report.Reports) == null ? void 0 : _c[0]) == null ? void 0 : _d.Rows) || [];
  const flatRows = flattenRows(rows);
  const totalCurrentAssets = flatRows.find((row) => {
    var _a2, _b2, _c2, _d2;
    const title = (row == null ? void 0 : row.Title) || (row == null ? void 0 : row.title) || ((_b2 = (_a2 = row == null ? void 0 : row.Cells) == null ? void 0 : _a2[0]) == null ? void 0 : _b2.Value) || ((_d2 = (_c2 = row == null ? void 0 : row.cells) == null ? void 0 : _c2[0]) == null ? void 0 : _d2.value);
    return typeof title === "string" && title.toLowerCase().includes("total current assets");
  });
  const totalCurrentLiabilities = flatRows.find((row) => {
    var _a2, _b2, _c2, _d2;
    const title = (row == null ? void 0 : row.Title) || (row == null ? void 0 : row.title) || ((_b2 = (_a2 = row == null ? void 0 : row.Cells) == null ? void 0 : _a2[0]) == null ? void 0 : _b2.Value) || ((_d2 = (_c2 = row == null ? void 0 : row.cells) == null ? void 0 : _c2[0]) == null ? void 0 : _d2.value);
    return typeof title === "string" && title.toLowerCase().includes("total current liabilities");
  });
  const cashRow = flatRows.find((row) => {
    var _a2, _b2, _c2, _d2;
    const title = (row == null ? void 0 : row.Title) || (row == null ? void 0 : row.title) || ((_b2 = (_a2 = row == null ? void 0 : row.Cells) == null ? void 0 : _a2[0]) == null ? void 0 : _b2.Value) || ((_d2 = (_c2 = row == null ? void 0 : row.cells) == null ? void 0 : _c2[0]) == null ? void 0 : _d2.value);
    return typeof title === "string" && title.toLowerCase().includes("bank");
  });
  const currentAssets = extractValueFromRow(totalCurrentAssets);
  const currentLiabilities = extractValueFromRow(totalCurrentLiabilities);
  const cashBalance = extractValueFromRow(cashRow);
  const workingCapital = currentAssets - currentLiabilities;
  const quickRatio = currentLiabilities !== 0 ? currentAssets / currentLiabilities : null;
  return {
    currentAssets,
    currentLiabilities,
    workingCapital,
    quickRatio,
    cashBalance
  };
}
const cashFlowInsights_get = eventHandler(async (event) => {
  var _a;
  const token = await getActiveTokenForSession(event);
  const tenantId = getSelectedTenant(event);
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: "No organization selected" });
  }
  const client = await createXeroClient({ tokenSet: token, event });
  const today = /* @__PURE__ */ new Date();
  const balanceSheetResponse = await safeApiCall(
    "balance-sheet",
    () => client.accountingApi.getReportBalanceSheet(tenantId, ensureDateString(today))
  );
  const draftInvoices = await fetchInvoiceSummary(client, tenantId, "DRAFT", "ACCREC");
  const submittedInvoices = await fetchInvoiceSummary(client, tenantId, "SUBMITTED", "ACCREC");
  const draftBills = await fetchInvoiceSummary(client, tenantId, "DRAFT", "ACCPAY");
  const submittedBills = await fetchInvoiceSummary(client, tenantId, "SUBMITTED", "ACCPAY");
  const draftQuotes = await fetchQuotesByStatus(client, tenantId, "DRAFT");
  const sentQuotes = await fetchQuotesByStatus(client, tenantId, "SENT");
  const acceptedQuotes = await fetchQuotesByStatus(client, tenantId, "ACCEPTED");
  const draftPurchaseOrders = await fetchPurchaseOrders(client, tenantId, "DRAFT");
  const submittedPurchaseOrders = await fetchPurchaseOrders(client, tenantId, "SUBMITTED");
  const outstandingClients = await fetchOutstandingReceivables(client, tenantId);
  const contactsResponse = await safeApiCall(
    "contacts",
    () => client.accountingApi.getContacts(tenantId, void 0, void 0, "Name ASC", void 0, 1, false, false, void 0, 200)
  );
  const workingCapital = computeWorkingCapital(balanceSheetResponse == null ? void 0 : balanceSheetResponse.body);
  const contacts = ((_a = contactsResponse == null ? void 0 : contactsResponse.body) == null ? void 0 : _a.contacts) || [];
  const topOutstanding = outstandingClients.map((entry) => {
    const contact = contacts.find((c) => (c == null ? void 0 : c.contactID) === entry.contactId);
    const creditLimit = (contact == null ? void 0 : contact.creditLimit) ? Number(contact.creditLimit) : void 0;
    return {
      id: entry.contactId,
      name: entry.name,
      outstanding: entry.totalOutstanding,
      overdue: entry.overdueAmount,
      overdueRatio: entry.overdueRatio,
      creditLimit,
      invoiceCount: entry.totalInvoices,
      overdueCount: entry.overdueCount,
      earliestDueDate: entry.earliestDueDate,
      latestInvoiceDate: entry.latestInvoiceDate,
      sampleInvoices: entry.invoices
    };
  }).slice(0, 8);
  return {
    generatedAt: today.toISOString(),
    workingCapital,
    receivables: {
      draftInvoices,
      submittedInvoices,
      quotes: {
        draft: draftQuotes,
        sent: sentQuotes,
        accepted: acceptedQuotes,
        totalPipeline: ((draftQuotes == null ? void 0 : draftQuotes.total) || 0) + ((sentQuotes == null ? void 0 : sentQuotes.total) || 0) + ((acceptedQuotes == null ? void 0 : acceptedQuotes.total) || 0)
      }
    },
    payables: {
      draftBills,
      submittedBills,
      purchaseOrders: {
        draft: draftPurchaseOrders,
        submitted: submittedPurchaseOrders,
        totalPipeline: ((draftPurchaseOrders == null ? void 0 : draftPurchaseOrders.total) || 0) + ((submittedPurchaseOrders == null ? void 0 : submittedPurchaseOrders.total) || 0)
      }
    },
    clients: {
      topOutstanding
    }
  };
});

export { cashFlowInsights_get as default };
//# sourceMappingURL=cash-flow-insights.get.mjs.map
