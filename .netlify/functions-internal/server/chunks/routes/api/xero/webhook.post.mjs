import { e as eventHandler, y as getHeader, r as readBody, m as invalidatePrefix } from '../../../nitro/nitro.mjs';
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
