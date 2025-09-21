import { e as eventHandler, g as getSelectedTenant, i as invalidatePrefix } from '../../nitro/nitro.mjs';
import 'node:http';
import 'node:https';
import 'node:events';
import 'node:buffer';
import 'node:fs';
import 'node:path';
import 'node:crypto';
import '@iconify/utils';
import 'consola';

const sync_post = eventHandler(async (event) => {
  const tenantId = getSelectedTenant(event);
  const prefix = tenantId ? `kpis:${tenantId}` : "kpis:";
  await invalidatePrefix(prefix);
  return { ok: true };
});

export { sync_post as default };
//# sourceMappingURL=sync.post.mjs.map
