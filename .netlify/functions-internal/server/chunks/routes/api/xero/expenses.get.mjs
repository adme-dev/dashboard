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

function toISO(d) {
  return d.toISOString().slice(0, 10);
}
const expenses_get = eventHandler(async (event) => {
  var _a, _b, _c;
  const token = await getTokenForSession(event);
  if (!(token == null ? void 0 : token.access_token)) throw createError({ statusCode: 401, statusMessage: "Not connected" });
  const tenantId = getSelectedTenant(event);
  if (!tenantId) throw createError({ statusCode: 400, statusMessage: "No organization selected" });
  const today = /* @__PURE__ */ new Date();
  const from = /* @__PURE__ */ new Date();
  from.setDate(today.getDate() - 90);
  const base = "https://api.xero.com/api.xro/2.0/Invoices";
  const headers = { Authorization: `Bearer ${token.access_token}`, "xero-tenant-id": tenantId };
  const [authorised, paid] = await Promise.all([
    $fetch(`${base}?where=Type=="ACCPAY"&&Status=="AUTHORISED"&&Date>=DateTime(${toISO(from)})&order=Date%20DESC&page=1`, { headers }),
    $fetch(`${base}?where=Type=="ACCPAY"&&Status=="PAID"&&Date>=DateTime(${toISO(from)})&order=Date%20DESC&page=1`, { headers })
  ]);
  const all = [].concat((authorised == null ? void 0 : authorised.Invoices) || [], (paid == null ? void 0 : paid.Invoices) || []);
  const byCategory = /* @__PURE__ */ new Map();
  const byVendor = /* @__PURE__ */ new Map();
  for (const inv of all) {
    const vendor = ((_a = inv == null ? void 0 : inv.Contact) == null ? void 0 : _a.Name) || "Unknown";
    const total = (_b = inv == null ? void 0 : inv.Total) != null ? _b : 0;
    byVendor.set(vendor, (byVendor.get(vendor) || 0) + total);
    const lines = (inv == null ? void 0 : inv.LineItems) || [];
    if (lines.length) {
      for (const li of lines) {
        const cat = (li == null ? void 0 : li.AccountCode) || (li == null ? void 0 : li.AccountID) || "Uncategorized";
        const amount = (_c = li == null ? void 0 : li.LineAmount) != null ? _c : 0;
        byCategory.set(cat, (byCategory.get(cat) || 0) + amount);
      }
    } else {
      byCategory.set("Uncategorized", (byCategory.get("Uncategorized") || 0) + total);
    }
  }
  const categories = Array.from(byCategory.entries()).map(([name, amount]) => ({ name, amount }));
  const vendors = Array.from(byVendor.entries()).map(([name, amount]) => ({ name, amount }));
  categories.sort((a, b) => b.amount - a.amount);
  vendors.sort((a, b) => b.amount - a.amount);
  return { range: { from: toISO(from), to: toISO(today) }, categories, vendors };
});

export { expenses_get as default };
//# sourceMappingURL=expenses.get.mjs.map
