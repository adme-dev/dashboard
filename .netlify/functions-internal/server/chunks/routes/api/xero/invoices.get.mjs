import { e as eventHandler, l as getTokenForSession, c as createError, g as getSelectedTenant, $ as $fetch } from '../../../nitro/nitro.mjs';
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
  var _a, _b;
  const token = await getTokenForSession(event);
  if (!(token == null ? void 0 : token.access_token)) {
    throw createError({ statusCode: 401, statusMessage: "Not connected" });
  }
  const tenantId = getSelectedTenant(event);
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: "No organization selected" });
  }
  const base = "https://api.xero.com/api.xro/2.0/Invoices";
  const headers = {
    Authorization: `Bearer ${token.access_token}`,
    "xero-tenant-id": tenantId
  };
  const [authorised, paid] = await Promise.all([
    $fetch(`${base}?where=Type=="ACCREC"&&Status=="AUTHORISED"&order=DueDate%20ASC&page=1`, { headers }),
    $fetch(`${base}?where=Type=="ACCREC"&&Status=="PAID"&order=Date%20DESC&page=1`, { headers })
  ]);
  const today = toISODate(/* @__PURE__ */ new Date());
  function simplify(inv) {
    var _a2, _b2, _c, _d;
    return {
      id: inv.InvoiceID,
      number: inv.InvoiceNumber,
      contact: (_a2 = inv == null ? void 0 : inv.Contact) == null ? void 0 : _a2.Name,
      date: (inv == null ? void 0 : inv.DateString) || (inv == null ? void 0 : inv.Date),
      dueDate: (inv == null ? void 0 : inv.DueDateString) || (inv == null ? void 0 : inv.DueDate),
      status: inv == null ? void 0 : inv.Status,
      total: (_b2 = inv == null ? void 0 : inv.Total) != null ? _b2 : 0,
      amountPaid: (_c = inv == null ? void 0 : inv.AmountPaid) != null ? _c : 0,
      amountDue: (_d = inv == null ? void 0 : inv.AmountDue) != null ? _d : 0,
      currency: inv == null ? void 0 : inv.CurrencyCode
    };
  }
  function iso(s) {
    if (!s) return void 0;
    return s.slice(0, 10);
  }
  const authorisedList = ((authorised == null ? void 0 : authorised.Invoices) || []).map(simplify);
  const paidList = ((paid == null ? void 0 : paid.Invoices) || []).map(simplify);
  const outstanding = [];
  const overdue = [];
  for (const inv of authorisedList) {
    const due = iso(inv.dueDate);
    if (((_a = inv.amountDue) != null ? _a : 0) > 0 && due && due < today) {
      overdue.push(inv);
    } else if (((_b = inv.amountDue) != null ? _b : 0) > 0) {
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
