import { e as eventHandler, l as getTokenForSession, g as getSelectedTenant } from '../../../nitro/nitro.mjs';
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
  const token = await getTokenForSession(event);
  const connected = Boolean(token && token.access_token && token.expires_at > Date.now());
  const selectedTenantId = getSelectedTenant(event);
  return {
    connected,
    selectedTenantId
  };
});

export { status_get as default };
//# sourceMappingURL=status.get.mjs.map
