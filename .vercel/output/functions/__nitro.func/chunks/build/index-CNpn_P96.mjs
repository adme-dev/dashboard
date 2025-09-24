import { _ as _sfc_main$1, a as _sfc_main$2 } from './PageHeader-DF6x_mG2.mjs';
import { e as useFetch, d as _sfc_main$9 } from './server.mjs';
import { _ as _sfc_main$3 } from './PageCard-BrXkocLW.mjs';
import { _ as _sfc_main$4 } from './Badge-BfrefdmG.mjs';
import { defineComponent, withAsyncContext, withCtx, unref, createVNode, createTextVNode, toDisplayString, createBlock, openBlock, Fragment, renderList, useSSRContext } from 'vue';
import { ssrRenderComponent, ssrRenderList, ssrInterpolate } from 'vue/server-renderer';
import 'reka-ui';
import '../nitro/nitro.mjs';
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
import 'vue-router';
import '@vue/shared';
import 'perfect-debounce';
import 'tailwindcss/colors';
import '@iconify/vue';
import 'tailwind-variants';
import '@iconify/utils/lib/css/icon';
import '../routes/renderer.mjs';
import 'vue-bundle-renderer/runtime';
import 'unhead/server';
import 'devalue';
import 'unhead/plugins';
import 'unhead/utils';
import './index-Btsu36yb.mjs';

const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "index",
  __ssrInlineRender: true,
  async setup(__props) {
    let __temp, __restore;
    const { data, pending, error, refresh } = ([__temp, __restore] = withAsyncContext(() => useFetch("/api/ai/recommendations", "$SpgVDVgG7n")), __temp = await __temp, __restore(), __temp);
    return (_ctx, _push, _parent, _attrs) => {
      const _component_UPage = _sfc_main$1;
      const _component_UPageHeader = _sfc_main$2;
      const _component_UButton = _sfc_main$9;
      const _component_UPageCard = _sfc_main$3;
      const _component_UBadge = _sfc_main$4;
      _push(ssrRenderComponent(_component_UPage, _attrs, {
        default: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            _push2(ssrRenderComponent(_component_UPageHeader, {
              title: "Recommendations",
              description: "Suggestions to optimize costs and collections"
            }, {
              right: withCtx((_2, _push3, _parent3, _scopeId2) => {
                if (_push3) {
                  _push3(ssrRenderComponent(_component_UButton, {
                    label: "Refresh",
                    color: "neutral",
                    onClick: unref(refresh)
                  }, null, _parent3, _scopeId2));
                } else {
                  return [
                    createVNode(_component_UButton, {
                      label: "Refresh",
                      color: "neutral",
                      onClick: unref(refresh)
                    }, null, 8, ["onClick"])
                  ];
                }
              }),
              _: 1
            }, _parent2, _scopeId));
            if (unref(pending)) {
              _push2(`<div${_scopeId}>Loading recommendations…</div>`);
            } else if (unref(error)) {
              _push2(`<div${_scopeId}>Failed to load recommendations.</div>`);
            } else {
              _push2(ssrRenderComponent(_component_UPageCard, { variant: "subtle" }, {
                default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                  if (_push3) {
                    if (!unref(data)?.recommendations?.length) {
                      _push3(`<div class="text-sm text-muted"${_scopeId2}>No recommendations available.</div>`);
                    } else {
                      _push3(`<ul class="space-y-2"${_scopeId2}><!--[-->`);
                      ssrRenderList(unref(data)?.recommendations, (r, i) => {
                        _push3(`<li class="flex items-center gap-2"${_scopeId2}>`);
                        _push3(ssrRenderComponent(_component_UBadge, null, {
                          default: withCtx((_3, _push4, _parent4, _scopeId3) => {
                            if (_push4) {
                              _push4(`${ssrInterpolate(r.category)}`);
                            } else {
                              return [
                                createTextVNode(toDisplayString(r.category), 1)
                              ];
                            }
                          }),
                          _: 2
                        }, _parent3, _scopeId2));
                        _push3(`<span${_scopeId2}>${ssrInterpolate(r.text)}</span></li>`);
                      });
                      _push3(`<!--]--></ul>`);
                    }
                  } else {
                    return [
                      !unref(data)?.recommendations?.length ? (openBlock(), createBlock("div", {
                        key: 0,
                        class: "text-sm text-muted"
                      }, "No recommendations available.")) : (openBlock(), createBlock("ul", {
                        key: 1,
                        class: "space-y-2"
                      }, [
                        (openBlock(true), createBlock(Fragment, null, renderList(unref(data)?.recommendations, (r, i) => {
                          return openBlock(), createBlock("li", {
                            key: i,
                            class: "flex items-center gap-2"
                          }, [
                            createVNode(_component_UBadge, null, {
                              default: withCtx(() => [
                                createTextVNode(toDisplayString(r.category), 1)
                              ]),
                              _: 2
                            }, 1024),
                            createVNode("span", null, toDisplayString(r.text), 1)
                          ]);
                        }), 128))
                      ]))
                    ];
                  }
                }),
                _: 1
              }, _parent2, _scopeId));
            }
          } else {
            return [
              createVNode(_component_UPageHeader, {
                title: "Recommendations",
                description: "Suggestions to optimize costs and collections"
              }, {
                right: withCtx(() => [
                  createVNode(_component_UButton, {
                    label: "Refresh",
                    color: "neutral",
                    onClick: unref(refresh)
                  }, null, 8, ["onClick"])
                ]),
                _: 1
              }),
              unref(pending) ? (openBlock(), createBlock("div", { key: 0 }, "Loading recommendations…")) : unref(error) ? (openBlock(), createBlock("div", { key: 1 }, "Failed to load recommendations.")) : (openBlock(), createBlock(_component_UPageCard, {
                key: 2,
                variant: "subtle"
              }, {
                default: withCtx(() => [
                  !unref(data)?.recommendations?.length ? (openBlock(), createBlock("div", {
                    key: 0,
                    class: "text-sm text-muted"
                  }, "No recommendations available.")) : (openBlock(), createBlock("ul", {
                    key: 1,
                    class: "space-y-2"
                  }, [
                    (openBlock(true), createBlock(Fragment, null, renderList(unref(data)?.recommendations, (r, i) => {
                      return openBlock(), createBlock("li", {
                        key: i,
                        class: "flex items-center gap-2"
                      }, [
                        createVNode(_component_UBadge, null, {
                          default: withCtx(() => [
                            createTextVNode(toDisplayString(r.category), 1)
                          ]),
                          _: 2
                        }, 1024),
                        createVNode("span", null, toDisplayString(r.text), 1)
                      ]);
                    }), 128))
                  ]))
                ]),
                _: 1
              }))
            ];
          }
        }),
        _: 1
      }, _parent));
    };
  }
});
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("pages/recommendations/index.vue");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};

export { _sfc_main as default };
//# sourceMappingURL=index-CNpn_P96.mjs.map
