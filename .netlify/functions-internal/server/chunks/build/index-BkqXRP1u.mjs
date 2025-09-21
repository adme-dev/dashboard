import { _ as _sfc_main$1, a as _sfc_main$2 } from './PageHeader-C7h9LUrz.mjs';
import { d as useFetch, a as _sfc_main$9 } from './server.mjs';
import { _ as _sfc_main$3 } from './PageGrid-DdlW-upS.mjs';
import { _ as _sfc_main$4 } from './PageCard-o0es5OuJ.mjs';
import { _ as _sfc_main$5 } from './Table-ahnJ44ag.mjs';
import { defineComponent, withAsyncContext, withCtx, unref, createVNode, toDisplayString, createBlock, openBlock, useSSRContext } from 'vue';
import { ssrRenderComponent, ssrInterpolate } from 'vue/server-renderer';
import 'reka-ui';
import '../nitro/nitro.mjs';
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
import './index-Cc9owYnb.mjs';
import '@tanstack/vue-table';

const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "index",
  __ssrInlineRender: true,
  async setup(__props) {
    let __temp, __restore;
    const { data, pending, error, refresh } = ([__temp, __restore] = withAsyncContext(() => useFetch("/api/cashflow", "$ITl0nfxEHC")), __temp = await __temp, __restore(), __temp);
    function formatCurrency(value) {
      if (typeof value !== "number" || Number.isNaN(value)) return "-";
      return value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
    }
    return (_ctx, _push, _parent, _attrs) => {
      const _component_UPage = _sfc_main$1;
      const _component_UPageHeader = _sfc_main$2;
      const _component_UButton = _sfc_main$9;
      const _component_UPageGrid = _sfc_main$3;
      const _component_UPageCard = _sfc_main$4;
      const _component_UTable = _sfc_main$5;
      _push(ssrRenderComponent(_component_UPage, _attrs, {
        default: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            _push2(ssrRenderComponent(_component_UPageHeader, {
              title: "Cash Flow",
              description: "Current position and 30/60/90 day projections"
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
              _push2(`<div${_scopeId}>Loading cash flow…</div>`);
            } else if (unref(error)) {
              _push2(`<div${_scopeId}>Failed to load cash flow.</div>`);
            } else {
              _push2(ssrRenderComponent(_component_UPageGrid, { class: "gap-4 sm:gap-6" }, {
                default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                  if (_push3) {
                    _push3(ssrRenderComponent(_component_UPageCard, {
                      title: "Current Bank Balance",
                      variant: "subtle"
                    }, {
                      default: withCtx((_3, _push4, _parent4, _scopeId3) => {
                        if (_push4) {
                          _push4(`<div class="text-2xl font-semibold"${_scopeId3}>${ssrInterpolate(formatCurrency(unref(data)?.startingBalance))}</div><div class="text-muted text-xs mt-1"${_scopeId3}>As of ${ssrInterpolate(unref(data)?.asOf)}</div>`);
                        } else {
                          return [
                            createVNode("div", { class: "text-2xl font-semibold" }, toDisplayString(formatCurrency(unref(data)?.startingBalance)), 1),
                            createVNode("div", { class: "text-muted text-xs mt-1" }, "As of " + toDisplayString(unref(data)?.asOf), 1)
                          ];
                        }
                      }),
                      _: 1
                    }, _parent3, _scopeId2));
                    _push3(ssrRenderComponent(_component_UPageCard, {
                      title: "Projections",
                      variant: "subtle"
                    }, {
                      default: withCtx((_3, _push4, _parent4, _scopeId3) => {
                        if (_push4) {
                          _push4(ssrRenderComponent(_component_UTable, {
                            rows: unref(data)?.buckets || [],
                            columns: [
                              { key: "label", label: "Horizon" },
                              { key: "end", label: "Until" },
                              { key: "inflow", label: "Inflow", class: "text-right" },
                              { key: "outflow", label: "Outflow", class: "text-right" },
                              { key: "projected", label: "Projected", class: "text-right" }
                            ]
                          }, {
                            "inflow-data": withCtx(({ row }, _push5, _parent5, _scopeId4) => {
                              if (_push5) {
                                _push5(`<span class="text-right block"${_scopeId4}>${ssrInterpolate(formatCurrency(row.inflow))}</span>`);
                              } else {
                                return [
                                  createVNode("span", { class: "text-right block" }, toDisplayString(formatCurrency(row.inflow)), 1)
                                ];
                              }
                            }),
                            "outflow-data": withCtx(({ row }, _push5, _parent5, _scopeId4) => {
                              if (_push5) {
                                _push5(`<span class="text-right block"${_scopeId4}>${ssrInterpolate(formatCurrency(row.outflow))}</span>`);
                              } else {
                                return [
                                  createVNode("span", { class: "text-right block" }, toDisplayString(formatCurrency(row.outflow)), 1)
                                ];
                              }
                            }),
                            "projected-data": withCtx(({ row }, _push5, _parent5, _scopeId4) => {
                              if (_push5) {
                                _push5(`<span class="text-right block"${_scopeId4}>${ssrInterpolate(formatCurrency(row.projected))}</span>`);
                              } else {
                                return [
                                  createVNode("span", { class: "text-right block" }, toDisplayString(formatCurrency(row.projected)), 1)
                                ];
                              }
                            }),
                            _: 1
                          }, _parent4, _scopeId3));
                        } else {
                          return [
                            createVNode(_component_UTable, {
                              rows: unref(data)?.buckets || [],
                              columns: [
                                { key: "label", label: "Horizon" },
                                { key: "end", label: "Until" },
                                { key: "inflow", label: "Inflow", class: "text-right" },
                                { key: "outflow", label: "Outflow", class: "text-right" },
                                { key: "projected", label: "Projected", class: "text-right" }
                              ]
                            }, {
                              "inflow-data": withCtx(({ row }) => [
                                createVNode("span", { class: "text-right block" }, toDisplayString(formatCurrency(row.inflow)), 1)
                              ]),
                              "outflow-data": withCtx(({ row }) => [
                                createVNode("span", { class: "text-right block" }, toDisplayString(formatCurrency(row.outflow)), 1)
                              ]),
                              "projected-data": withCtx(({ row }) => [
                                createVNode("span", { class: "text-right block" }, toDisplayString(formatCurrency(row.projected)), 1)
                              ]),
                              _: 1
                            }, 8, ["rows"])
                          ];
                        }
                      }),
                      _: 1
                    }, _parent3, _scopeId2));
                  } else {
                    return [
                      createVNode(_component_UPageCard, {
                        title: "Current Bank Balance",
                        variant: "subtle"
                      }, {
                        default: withCtx(() => [
                          createVNode("div", { class: "text-2xl font-semibold" }, toDisplayString(formatCurrency(unref(data)?.startingBalance)), 1),
                          createVNode("div", { class: "text-muted text-xs mt-1" }, "As of " + toDisplayString(unref(data)?.asOf), 1)
                        ]),
                        _: 1
                      }),
                      createVNode(_component_UPageCard, {
                        title: "Projections",
                        variant: "subtle"
                      }, {
                        default: withCtx(() => [
                          createVNode(_component_UTable, {
                            rows: unref(data)?.buckets || [],
                            columns: [
                              { key: "label", label: "Horizon" },
                              { key: "end", label: "Until" },
                              { key: "inflow", label: "Inflow", class: "text-right" },
                              { key: "outflow", label: "Outflow", class: "text-right" },
                              { key: "projected", label: "Projected", class: "text-right" }
                            ]
                          }, {
                            "inflow-data": withCtx(({ row }) => [
                              createVNode("span", { class: "text-right block" }, toDisplayString(formatCurrency(row.inflow)), 1)
                            ]),
                            "outflow-data": withCtx(({ row }) => [
                              createVNode("span", { class: "text-right block" }, toDisplayString(formatCurrency(row.outflow)), 1)
                            ]),
                            "projected-data": withCtx(({ row }) => [
                              createVNode("span", { class: "text-right block" }, toDisplayString(formatCurrency(row.projected)), 1)
                            ]),
                            _: 1
                          }, 8, ["rows"])
                        ]),
                        _: 1
                      })
                    ];
                  }
                }),
                _: 1
              }, _parent2, _scopeId));
            }
          } else {
            return [
              createVNode(_component_UPageHeader, {
                title: "Cash Flow",
                description: "Current position and 30/60/90 day projections"
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
              unref(pending) ? (openBlock(), createBlock("div", { key: 0 }, "Loading cash flow…")) : unref(error) ? (openBlock(), createBlock("div", { key: 1 }, "Failed to load cash flow.")) : (openBlock(), createBlock(_component_UPageGrid, {
                key: 2,
                class: "gap-4 sm:gap-6"
              }, {
                default: withCtx(() => [
                  createVNode(_component_UPageCard, {
                    title: "Current Bank Balance",
                    variant: "subtle"
                  }, {
                    default: withCtx(() => [
                      createVNode("div", { class: "text-2xl font-semibold" }, toDisplayString(formatCurrency(unref(data)?.startingBalance)), 1),
                      createVNode("div", { class: "text-muted text-xs mt-1" }, "As of " + toDisplayString(unref(data)?.asOf), 1)
                    ]),
                    _: 1
                  }),
                  createVNode(_component_UPageCard, {
                    title: "Projections",
                    variant: "subtle"
                  }, {
                    default: withCtx(() => [
                      createVNode(_component_UTable, {
                        rows: unref(data)?.buckets || [],
                        columns: [
                          { key: "label", label: "Horizon" },
                          { key: "end", label: "Until" },
                          { key: "inflow", label: "Inflow", class: "text-right" },
                          { key: "outflow", label: "Outflow", class: "text-right" },
                          { key: "projected", label: "Projected", class: "text-right" }
                        ]
                      }, {
                        "inflow-data": withCtx(({ row }) => [
                          createVNode("span", { class: "text-right block" }, toDisplayString(formatCurrency(row.inflow)), 1)
                        ]),
                        "outflow-data": withCtx(({ row }) => [
                          createVNode("span", { class: "text-right block" }, toDisplayString(formatCurrency(row.outflow)), 1)
                        ]),
                        "projected-data": withCtx(({ row }) => [
                          createVNode("span", { class: "text-right block" }, toDisplayString(formatCurrency(row.projected)), 1)
                        ]),
                        _: 1
                      }, 8, ["rows"])
                    ]),
                    _: 1
                  })
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
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("pages/cashflow/index.vue");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};

export { _sfc_main as default };
//# sourceMappingURL=index-BkqXRP1u.mjs.map
