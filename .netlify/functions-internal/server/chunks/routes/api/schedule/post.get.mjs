import { e as eventHandler, d as getQuery } from '../../../nitro/nitro.mjs';
import 'node:http';
import 'node:https';
import 'node:events';
import 'node:buffer';
import 'node:fs';
import 'node:path';
import 'node:crypto';
import '@iconify/utils';
import 'consola';

const post_get = eventHandler(async (event) => {
  const query = getQuery(event);
  const type = String(query.type || "report");
  const when = String(query.when || "daily");
  return { ok: true, type, when };
});

export { post_get as default };
//# sourceMappingURL=post.get.mjs.map
