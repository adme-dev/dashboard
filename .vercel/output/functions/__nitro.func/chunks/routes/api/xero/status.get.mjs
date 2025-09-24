import { e as eventHandler, q as getTokenForSession, g as getActiveTokenForSession, a as getSelectedTenant } from '../../../nitro/nitro.mjs';
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

const status_get = eventHandler(async (event) => {
  let token = await getTokenForSession(event);
  let connected = Boolean(token && token.access_token);
  if (connected) {
    try {
      token = await getActiveTokenForSession(event, { minTtlMs: 0 });
      connected = Boolean(token && token.access_token);
    } catch {
      connected = false;
    }
  }
  const selectedTenantId = getSelectedTenant(event);
  return {
    connected,
    selectedTenantId
  };
});

export { status_get as default };
//# sourceMappingURL=status.get.mjs.map
