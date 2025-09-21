import { e as eventHandler } from '../../nitro/nitro.mjs';
import 'node:http';
import 'node:https';
import 'node:events';
import 'node:buffer';
import 'node:fs';
import 'node:path';
import 'node:crypto';
import '@iconify/utils';
import 'consola';

const health_get = eventHandler(async () => {
  return { ok: true, ts: Date.now() };
});

export { health_get as default };
//# sourceMappingURL=health.get.mjs.map
