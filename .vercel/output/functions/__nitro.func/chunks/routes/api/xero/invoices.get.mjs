import { e as eventHandler, g as getActiveTokenForSession, a as getSelectedTenant, c as createError, d as createXeroClient } from '../../../nitro/nitro.mjs';
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

const invoices_get = eventHandler(async (event) => {
  var _a, _b, _c, _d;
  const token = await getActiveTokenForSession(event);
  const tenantId = getSelectedTenant(event);
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: "No organization selected" });
  }
  const client = await createXeroClient({ tokenSet: token, event });
  const [authorised, paid] = await Promise.all([
    client.accountingApi.getInvoices(
      tenantId,
      void 0,
      'Type=="ACCREC"&&Status=="AUTHORISED"',
      "DueDate ASC",
      void 0,
      void 0,
      void 0,
      void 0,
      1,
      void 0,
      void 0,
      void 0,
      100
    ),
    client.accountingApi.getInvoices(
      tenantId,
      void 0,
      'Type=="ACCREC"&&Status=="PAID"',
      "Date DESC",
      void 0,
      void 0,
      void 0,
      void 0,
      1,
      void 0,
      void 0,
      void 0,
      100
    )
  ]);
  const today = /* @__PURE__ */ new Date();
  const todayISO = today.toISOString().slice(0, 10);
  function simplify(inv) {
    var _a2, _b2, _c2, _d2;
    return {
      id: inv.invoiceID,
      number: inv.invoiceNumber,
      contact: (_a2 = inv == null ? void 0 : inv.contact) == null ? void 0 : _a2.name,
      date: inv == null ? void 0 : inv.date,
      dueDate: inv == null ? void 0 : inv.dueDate,
      fullyPaidOnDate: inv == null ? void 0 : inv.fullyPaidOnDate,
      status: inv == null ? void 0 : inv.status,
      total: Number((_b2 = inv == null ? void 0 : inv.total) != null ? _b2 : 0),
      amountPaid: Number((_c2 = inv == null ? void 0 : inv.amountPaid) != null ? _c2 : 0),
      amountDue: Number((_d2 = inv == null ? void 0 : inv.amountDue) != null ? _d2 : 0),
      currency: inv == null ? void 0 : inv.currencyCode
    };
  }
  function iso(input) {
    if (!input) return void 0;
    if (typeof input === "string") {
      return input.slice(0, 10);
    }
    if (input instanceof Date) {
      return input.toISOString().slice(0, 10);
    }
    return void 0;
  }
  const authorisedList = (((_a = authorised == null ? void 0 : authorised.body) == null ? void 0 : _a.invoices) || []).map(simplify);
  const paidList = (((_b = paid == null ? void 0 : paid.body) == null ? void 0 : _b.invoices) || []).map(simplify);
  const outstanding = [];
  const overdue = [];
  function agingBucketForUpcoming(daysUntilDue) {
    if (daysUntilDue == null) return "current";
    if (daysUntilDue <= 7) return "dueSoon";
    if (daysUntilDue <= 30) return "due30";
    return "current";
  }
  function agingBucketForOverdue(daysOverdue) {
    if (daysOverdue <= 7) return "overdue7";
    if (daysOverdue <= 14) return "overdue14";
    if (daysOverdue <= 30) return "overdue30";
    return "overdue60";
  }
  for (const inv of authorisedList) {
    const due = iso(inv.dueDate);
    if (((_c = inv.amountDue) != null ? _c : 0) > 0 && due) {
      const dueDateObj = new Date(due);
      const diffMs = dueDateObj.getTime() - today.getTime();
      const daysUntilDue = Math.ceil(diffMs / (1e3 * 60 * 60 * 24));
      const ageDays = Math.ceil((today.getTime() - new Date((_d = inv.date) != null ? _d : due).getTime()) / (1e3 * 60 * 60 * 24));
      const enriched = {
        ...inv,
        dueDate: due,
        date: iso(inv.date),
        daysUntilDue,
        ageDays,
        status: "OUTSTANDING",
        agingBucket: agingBucketForUpcoming(daysUntilDue)
      };
      if (due < todayISO) {
        overdue.push({
          ...enriched,
          status: "OVERDUE",
          daysOverdue: Math.abs(daysUntilDue),
          agingBucket: agingBucketForOverdue(Math.abs(daysUntilDue))
        });
      } else {
        outstanding.push(enriched);
      }
    }
  }
  const paidDetailed = paidList.map((inv) => {
    const paidOn = iso(inv.fullyPaidOnDate);
    const issuedOn = iso(inv.date);
    let daysToPay = null;
    if (paidOn && issuedOn) {
      daysToPay = Math.max(0, Math.ceil((new Date(paidOn).getTime() - new Date(issuedOn).getTime()) / (1e3 * 60 * 60 * 24)));
    }
    return {
      ...inv,
      date: issuedOn,
      fullyPaidOnDate: paidOn,
      daysToPay,
      status: "PAID"
    };
  });
  const sumBy = (list, predicate) => list.reduce((total, inv) => predicate(inv) ? total + (inv.amountDue || 0) : total, 0);
  const outstandingTotal = sumBy(outstanding, () => true);
  const overdueTotal = sumBy(overdue, () => true);
  const dueSoonTotal = sumBy(outstanding, (inv) => inv.agingBucket === "dueSoon");
  const paidLast30 = paidDetailed.filter((inv) => {
    if (!inv.fullyPaidOnDate) return false;
    const paidDate = new Date(inv.fullyPaidOnDate);
    return today.getTime() - paidDate.getTime() <= 1e3 * 60 * 60 * 24 * 30;
  });
  const avgDaysToPay = (() => {
    const values = paidDetailed.map((inv) => inv.daysToPay).filter((n) => typeof n === "number" && Number.isFinite(n));
    if (!values.length) return null;
    return Math.round(values.reduce((sum, n) => sum + n, 0) / values.length);
  })();
  const topCustomers = (() => {
    const map = /* @__PURE__ */ new Map();
    const push = (inv, listType) => {
      const key = inv.contact || "Unknown";
      if (!map.has(key)) {
        map.set(key, { name: key, outstanding: 0, overdue: 0, count: 0 });
      }
      const entry = map.get(key);
      entry.count += 1;
      const amt = inv.amountDue || 0;
      if (listType === "overdue") {
        entry.overdue += amt;
      }
      entry.outstanding += amt;
    };
    outstanding.forEach((inv) => push(inv, "outstanding"));
    overdue.forEach((inv) => push(inv, "overdue"));
    return Array.from(map.values()).filter((entry) => entry.outstanding > 0).sort((a, b) => b.outstanding - a.outstanding).slice(0, 8);
  })();
  const allInvoices = [
    ...outstanding,
    ...overdue.map((inv) => ({ ...inv, status: "OVERDUE" })),
    ...paidDetailed
  ].sort((a, b) => {
    const dateA = a.date ? new Date(a.date).getTime() : 0;
    const dateB = b.date ? new Date(b.date).getTime() : 0;
    return dateB - dateA;
  });
  const agingBuckets = {
    current: outstanding.filter((inv) => inv.agingBucket === "current").length,
    dueSoon: outstanding.filter((inv) => inv.agingBucket === "dueSoon").length,
    due30: outstanding.filter((inv) => inv.agingBucket === "due30").length,
    overdue7: overdue.filter((inv) => inv.agingBucket === "overdue7").length,
    overdue14: overdue.filter((inv) => inv.agingBucket === "overdue14").length,
    overdue30: overdue.filter((inv) => inv.agingBucket === "overdue30").length,
    overdue60: overdue.filter((inv) => inv.agingBucket === "overdue60").length
  };
  const agingDetails = {
    current: outstanding.filter((inv) => inv.agingBucket === "current"),
    dueSoon: outstanding.filter((inv) => inv.agingBucket === "dueSoon"),
    due30: outstanding.filter((inv) => inv.agingBucket === "due30"),
    overdue7: overdue.filter((inv) => inv.agingBucket === "overdue7"),
    overdue14: overdue.filter((inv) => inv.agingBucket === "overdue14"),
    overdue30: overdue.filter((inv) => inv.agingBucket === "overdue30"),
    overdue60: overdue.filter((inv) => inv.agingBucket === "overdue60")
  };
  return {
    summary: {
      outstandingTotal,
      outstandingCount: outstanding.length,
      overdueTotal,
      overdueCount: overdue.length,
      dueSoonTotal,
      paidLast30Total: paidLast30.reduce((sum, inv) => sum + (inv.total || 0), 0),
      paidLast30Count: paidLast30.length,
      avgDaysToPay,
      topCustomers,
      agingBuckets,
      agingDetails
    },
    outstanding,
    overdue,
    paid: paidDetailed,
    paidRecent: paidLast30,
    all: allInvoices
  };
});

export { invoices_get as default };
//# sourceMappingURL=invoices.get.mjs.map
