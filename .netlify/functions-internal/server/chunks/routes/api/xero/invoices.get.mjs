import { e as eventHandler, g as getActiveTokenForSession, a as getSelectedTenant, c as createError, d as createXeroClient } from '../../../nitro/nitro.mjs';
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

function toISODate(d) {
  return d.toISOString().slice(0, 10);
}
const invoices_get = eventHandler(async (event) => {
  var _a, _b, _c, _d;
  const token = await getActiveTokenForSession(event);
  const tenantId = getSelectedTenant(event);
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: "No organization selected" });
  }
  const client = await createXeroClient({ tokenSet: token });
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
  const today = toISODate(/* @__PURE__ */ new Date());
  function simplify(inv) {
    var _a2, _b2, _c2, _d2;
    return {
      id: inv.invoiceID,
      number: inv.invoiceNumber,
      contact: (_a2 = inv == null ? void 0 : inv.contact) == null ? void 0 : _a2.name,
      date: inv == null ? void 0 : inv.date,
      dueDate: inv == null ? void 0 : inv.dueDate,
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
  for (const inv of authorisedList) {
    const due = iso(inv.dueDate);
    if (((_c = inv.amountDue) != null ? _c : 0) > 0 && due && due < today) {
      overdue.push(inv);
    } else if (((_d = inv.amountDue) != null ? _d : 0) > 0) {
      outstanding.push(inv);
    }
  }
  return {
    outstanding,
    overdue,
    paid: paidList
  };
});

export { invoices_get as default };
//# sourceMappingURL=invoices.get.mjs.map
