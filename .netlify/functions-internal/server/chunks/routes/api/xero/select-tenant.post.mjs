import { e as eventHandler, r as readBody, c as createError, x as setSelectedTenant } from '../../../nitro/nitro.mjs';
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

const selectTenant_post = eventHandler(async (event) => {
  const body = await readBody(event);
  const tenantId = body.tenantId;
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: "tenantId required" });
  }
  setSelectedTenant(event, tenantId);
  return { ok: true };
});

export { selectTenant_post as default };
//# sourceMappingURL=select-tenant.post.mjs.map
