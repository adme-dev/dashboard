import { e as eventHandler } from '../../nitro/nitro.mjs';
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

const members = [{
  name: "Anthony Fu",
  username: "antfu",
  role: "member",
  avatar: { src: "https://ipx.nuxt.com/f_auto,s_192x192/gh_avatar/antfu" }
}, {
  name: "Baptiste Leproux",
  username: "larbish",
  role: "member",
  avatar: { src: "https://ipx.nuxt.com/f_auto,s_192x192/gh_avatar/larbish" }
}, {
  name: "Benjamin Canac",
  username: "benjamincanac",
  role: "owner",
  avatar: { src: "https://ipx.nuxt.com/f_auto,s_192x192/gh_avatar/benjamincanac" }
}, {
  name: "C\xE9line Dumerc",
  username: "celinedumerc",
  role: "member",
  avatar: { src: "https://ipx.nuxt.com/f_auto,s_192x192/gh_avatar/celinedumerc" }
}, {
  name: "Daniel Roe",
  username: "danielroe",
  role: "member",
  avatar: { src: "https://ipx.nuxt.com/f_auto,s_192x192/gh_avatar/danielroe" }
}, {
  name: "Farnabaz",
  username: "farnabaz",
  role: "member",
  avatar: { src: "https://ipx.nuxt.com/f_auto,s_192x192/gh_avatar/farnabaz" }
}, {
  name: "Ferdinand Coumau",
  username: "FerdinandCoumau",
  role: "member",
  avatar: { src: "https://ipx.nuxt.com/f_auto,s_192x192/gh_avatar/FerdinandCoumau" }
}, {
  name: "Hugo Richard",
  username: "hugorcd",
  role: "owner",
  avatar: { src: "https://ipx.nuxt.com/f_auto,s_192x192/gh_avatar/hugorcd" }
}, {
  name: "Pooya Parsa",
  username: "pi0",
  role: "member",
  avatar: { src: "https://ipx.nuxt.com/f_auto,s_192x192/gh_avatar/pi0" }
}, {
  name: "Sarah Moriceau",
  username: "SarahM19",
  role: "member",
  avatar: { src: "https://ipx.nuxt.com/f_auto,s_192x192/gh_avatar/SarahM19" }
}, {
  name: "S\xE9bastien Chopin",
  username: "Atinux",
  role: "owner",
  avatar: { src: "https://ipx.nuxt.com/f_auto,s_192x192/gh_avatar/atinux" }
}];
const members$1 = eventHandler(async () => {
  return members;
});

export { members$1 as default };
//# sourceMappingURL=members.mjs.map
