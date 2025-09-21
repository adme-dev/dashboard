import { e as eventHandler, o as getHeader, r as readBody, i as invalidatePrefix } from '../../../nitro/nitro.mjs';
import 'node:http';
import 'node:https';
import 'node:events';
import 'node:buffer';
import 'node:fs';
import 'node:path';
import 'node:crypto';
import '@iconify/utils';
import 'consola';

const webhook_post = eventHandler(async (event) => {
  var _a;
  const tenantId = getHeader(event, "xero-tenant-id") || ((_a = await readBody(event)) == null ? void 0 : _a.tenantId);
  if (tenantId) {
    await invalidatePrefix(`kpis:${tenantId}`);
  }
  return { ok: true };
});

export { webhook_post as default };
//# sourceMappingURL=webhook.post.mjs.map
