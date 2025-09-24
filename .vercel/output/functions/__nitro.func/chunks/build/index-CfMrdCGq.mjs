import { _ as _sfc_main$1, a as _sfc_main$2 } from './PageHeader-DF6x_mG2.mjs';
import { e as useFetch, d as _sfc_main$9 } from './server.mjs';
import { _ as _sfc_main$3 } from './PageGrid-CyaRhCNm.mjs';
import { _ as _sfc_main$4 } from './PageCard-BrXkocLW.mjs';
import { _ as _sfc_main$5 } from './Badge-BfrefdmG.mjs';
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
    const { data, pending, error, refresh } = ([__temp, __restore] = withAsyncContext(() => useFetch("/api/ai/insights", "$bOzTd6AzHy")), __temp = await __temp, __restore(), __temp);
    return (_ctx, _push, _parent, _attrs) => {
      const _component_UPage = _sfc_main$1;
      const _component_UPageHeader = _sfc_main$2;
      const _component_UButton = _sfc_main$9;
      const _component_UPageGrid = _sfc_main$3;
      const _component_UPageCard = _sfc_main$4;
      const _component_UBadge = _sfc_main$5;
      _push(ssrRenderComponent(_component_UPage, _attrs, {
        default: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            _push2(ssrRenderComponent(_component_UPageHeader, {
              title: "AI Insights",
              description: "Plain-English financial insights generated from your Xero data"
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
              _push2(`<div${_scopeId}>Generating insights…</div>`);
            } else if (unref(error)) {
              _push2(`<div${_scopeId}>Failed to load insights.</div>`);
            } else {
              _push2(ssrRenderComponent(_component_UPageGrid, { class: "gap-4 sm:gap-6" }, {
                default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                  if (_push3) {
                    _push3(`<!--[-->`);
                    ssrRenderList(unref(data)?.insights || [], (ins, i) => {
                      _push3(ssrRenderComponent(_component_UPageCard, {
                        key: i,
                        variant: "subtle"
                      }, {
                        default: withCtx((_3, _push4, _parent4, _scopeId3) => {
                          if (_push4) {
                            _push4(`<div class="flex items-center justify-between"${_scopeId3}><div class="font-medium"${_scopeId3}>${ssrInterpolate(ins.title)}</div>`);
                            _push4(ssrRenderComponent(_component_UBadge, {
                              color: ins.severity === "warning" ? "error" : ins.severity === "success" ? "success" : "neutral"
                            }, {
                              default: withCtx((_4, _push5, _parent5, _scopeId4) => {
                                if (_push5) {
                                  _push5(`${ssrInterpolate(ins.severity || "info")}`);
                                } else {
                                  return [
                                    createTextVNode(toDisplayString(ins.severity || "info"), 1)
                                  ];
                                }
                              }),
                              _: 2
                            }, _parent4, _scopeId3));
                            _push4(`</div><p class="text-sm text-muted mt-1"${_scopeId3}>${ssrInterpolate(ins.detail)}</p>`);
                          } else {
                            return [
                              createVNode("div", { class: "flex items-center justify-between" }, [
                                createVNode("div", { class: "font-medium" }, toDisplayString(ins.title), 1),
                                createVNode(_component_UBadge, {
                                  color: ins.severity === "warning" ? "error" : ins.severity === "success" ? "success" : "neutral"
                                }, {
                                  default: withCtx(() => [
                                    createTextVNode(toDisplayString(ins.severity || "info"), 1)
                                  ]),
                                  _: 2
                                }, 1032, ["color"])
                              ]),
                              createVNode("p", { class: "text-sm text-muted mt-1" }, toDisplayString(ins.detail), 1)
                            ];
                          }
                        }),
                        _: 2
                      }, _parent3, _scopeId2));
                    });
                    _push3(`<!--]-->`);
                  } else {
                    return [
                      (openBlock(true), createBlock(Fragment, null, renderList(unref(data)?.insights || [], (ins, i) => {
                        return openBlock(), createBlock(_component_UPageCard, {
                          key: i,
                          variant: "subtle"
                        }, {
                          default: withCtx(() => [
                            createVNode("div", { class: "flex items-center justify-between" }, [
                              createVNode("div", { class: "font-medium" }, toDisplayString(ins.title), 1),
                              createVNode(_component_UBadge, {
                                color: ins.severity === "warning" ? "error" : ins.severity === "success" ? "success" : "neutral"
                              }, {
                                default: withCtx(() => [
                                  createTextVNode(toDisplayString(ins.severity || "info"), 1)
                                ]),
                                _: 2
                              }, 1032, ["color"])
                            ]),
                            createVNode("p", { class: "text-sm text-muted mt-1" }, toDisplayString(ins.detail), 1)
                          ]),
                          _: 2
                        }, 1024);
                      }), 128))
                    ];
                  }
                }),
                _: 1
              }, _parent2, _scopeId));
            }
          } else {
            return [
              createVNode(_component_UPageHeader, {
                title: "AI Insights",
                description: "Plain-English financial insights generated from your Xero data"
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
              unref(pending) ? (openBlock(), createBlock("div", { key: 0 }, "Generating insights…")) : unref(error) ? (openBlock(), createBlock("div", { key: 1 }, "Failed to load insights.")) : (openBlock(), createBlock(_component_UPageGrid, {
                key: 2,
                class: "gap-4 sm:gap-6"
              }, {
                default: withCtx(() => [
                  (openBlock(true), createBlock(Fragment, null, renderList(unref(data)?.insights || [], (ins, i) => {
                    return openBlock(), createBlock(_component_UPageCard, {
                      key: i,
                      variant: "subtle"
                    }, {
                      default: withCtx(() => [
                        createVNode("div", { class: "flex items-center justify-between" }, [
                          createVNode("div", { class: "font-medium" }, toDisplayString(ins.title), 1),
                          createVNode(_component_UBadge, {
                            color: ins.severity === "warning" ? "error" : ins.severity === "success" ? "success" : "neutral"
                          }, {
                            default: withCtx(() => [
                              createTextVNode(toDisplayString(ins.severity || "info"), 1)
                            ]),
                            _: 2
                          }, 1032, ["color"])
                        ]),
                        createVNode("p", { class: "text-sm text-muted mt-1" }, toDisplayString(ins.detail), 1)
                      ]),
                      _: 2
                    }, 1024);
                  }), 128))
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
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("pages/insights/index.vue");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};

export { _sfc_main as default };
//# sourceMappingURL=index-CfMrdCGq.mjs.map
