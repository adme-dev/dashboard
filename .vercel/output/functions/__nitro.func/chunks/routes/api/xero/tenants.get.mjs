import { e as eventHandler, g as getActiveTokenForSession, d as createXeroClient } from '../../../nitro/nitro.mjs';
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

const tenants_get = eventHandler(async (event) => {
  const token = await getActiveTokenForSession(event);
  const client = await createXeroClient({ tokenSet: token, event });
  const tenants = await client.updateTenants(false);
  return tenants;
});

export { tenants_get as default };
//# sourceMappingURL=tenants.get.mjs.map
