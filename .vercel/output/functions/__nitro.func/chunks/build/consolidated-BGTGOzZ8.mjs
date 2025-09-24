import { _ as _sfc_main$1, a as _sfc_main$2 } from './PageHeader-DF6x_mG2.mjs';
import { e as useFetch, d as _sfc_main$9 } from './server.mjs';
import { _ as _sfc_main$3 } from './PageGrid-CyaRhCNm.mjs';
import { _ as _sfc_main$4 } from './PageCard-BrXkocLW.mjs';
import { _ as _sfc_main$5 } from './Table-DItj4AHg.mjs';
import { defineComponent, withAsyncContext, withCtx, unref, createVNode, toDisplayString, createBlock, openBlock, useSSRContext } from 'vue';
import { ssrRenderComponent, ssrInterpolate } from 'vue/server-renderer';
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
import '@tanstack/vue-table';

const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "consolidated",
  __ssrInlineRender: true,
  async setup(__props) {
    let __temp, __restore;
    const { data, pending, error, refresh } = ([__temp, __restore] = withAsyncContext(() => useFetch("/api/xero/reports/pnl-consolidated", "$jzinXjK6Wv")), __temp = await __temp, __restore(), __temp);
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
              title: "Consolidated P&L",
              description: "Aggregated Profit & Loss across connected organizations"
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
              _push2(`<div${_scopeId}>Loading consolidated P&amp;L…</div>`);
            } else if (unref(error)) {
              _push2(`<div${_scopeId}>Failed to load consolidated P&amp;L.</div>`);
            } else {
              _push2(ssrRenderComponent(_component_UPageGrid, { class: "gap-4 sm:gap-6" }, {
                default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                  if (_push3) {
                    _push3(ssrRenderComponent(_component_UPageCard, {
                      title: "Totals",
                      variant: "subtle"
                    }, {
                      default: withCtx((_3, _push4, _parent4, _scopeId3) => {
                        if (_push4) {
                          _push4(`<div class="grid grid-cols-2 md:grid-cols-4 gap-4"${_scopeId3}><div${_scopeId3}><div class="text-muted text-xs"${_scopeId3}>Revenue</div><div class="text-lg font-semibold"${_scopeId3}>${ssrInterpolate(formatCurrency(unref(data)?.totals?.revenueTotal))}</div></div><div${_scopeId3}><div class="text-muted text-xs"${_scopeId3}>Expenses</div><div class="text-lg font-semibold"${_scopeId3}>${ssrInterpolate(formatCurrency(unref(data)?.totals?.expensesTotal))}</div></div><div${_scopeId3}><div class="text-muted text-xs"${_scopeId3}>Net Profit</div><div class="text-lg font-semibold"${_scopeId3}>${ssrInterpolate(formatCurrency(unref(data)?.totals?.netProfit))}</div></div><div${_scopeId3}><div class="text-muted text-xs"${_scopeId3}>Profit Margin</div><div class="text-lg font-semibold"${_scopeId3}>${ssrInterpolate(Math.round((unref(data)?.totals?.profitMargin || 0) * 100))}%</div></div></div>`);
                        } else {
                          return [
                            createVNode("div", { class: "grid grid-cols-2 md:grid-cols-4 gap-4" }, [
                              createVNode("div", null, [
                                createVNode("div", { class: "text-muted text-xs" }, "Revenue"),
                                createVNode("div", { class: "text-lg font-semibold" }, toDisplayString(formatCurrency(unref(data)?.totals?.revenueTotal)), 1)
                              ]),
                              createVNode("div", null, [
                                createVNode("div", { class: "text-muted text-xs" }, "Expenses"),
                                createVNode("div", { class: "text-lg font-semibold" }, toDisplayString(formatCurrency(unref(data)?.totals?.expensesTotal)), 1)
                              ]),
                              createVNode("div", null, [
                                createVNode("div", { class: "text-muted text-xs" }, "Net Profit"),
                                createVNode("div", { class: "text-lg font-semibold" }, toDisplayString(formatCurrency(unref(data)?.totals?.netProfit)), 1)
                              ]),
                              createVNode("div", null, [
                                createVNode("div", { class: "text-muted text-xs" }, "Profit Margin"),
                                createVNode("div", { class: "text-lg font-semibold" }, toDisplayString(Math.round((unref(data)?.totals?.profitMargin || 0) * 100)) + "%", 1)
                              ])
                            ])
                          ];
                        }
                      }),
                      _: 1
                    }, _parent3, _scopeId2));
                    _push3(ssrRenderComponent(_component_UPageCard, {
                      title: "Per Organization",
                      variant: "subtle"
                    }, {
                      default: withCtx((_3, _push4, _parent4, _scopeId3) => {
                        if (_push4) {
                          _push4(ssrRenderComponent(_component_UTable, {
                            rows: unref(data)?.tenants || [],
                            columns: [
                              { key: "tenantName", label: "Organization" },
                              { key: "revenueTotal", label: "Revenue", class: "text-right" },
                              { key: "expensesTotal", label: "Expenses", class: "text-right" },
                              { key: "netProfit", label: "Net Profit", class: "text-right" },
                              { key: "profitMargin", label: "Margin", class: "text-right" }
                            ]
                          }, {
                            "revenueTotal-data": withCtx(({ row }, _push5, _parent5, _scopeId4) => {
                              if (_push5) {
                                _push5(`<span class="text-right block"${_scopeId4}>${ssrInterpolate(formatCurrency(row.revenueTotal))}</span>`);
                              } else {
                                return [
                                  createVNode("span", { class: "text-right block" }, toDisplayString(formatCurrency(row.revenueTotal)), 1)
                                ];
                              }
                            }),
                            "expensesTotal-data": withCtx(({ row }, _push5, _parent5, _scopeId4) => {
                              if (_push5) {
                                _push5(`<span class="text-right block"${_scopeId4}>${ssrInterpolate(formatCurrency(row.expensesTotal))}</span>`);
                              } else {
                                return [
                                  createVNode("span", { class: "text-right block" }, toDisplayString(formatCurrency(row.expensesTotal)), 1)
                                ];
                              }
                            }),
                            "netProfit-data": withCtx(({ row }, _push5, _parent5, _scopeId4) => {
                              if (_push5) {
                                _push5(`<span class="text-right block"${_scopeId4}>${ssrInterpolate(formatCurrency(row.netProfit))}</span>`);
                              } else {
                                return [
                                  createVNode("span", { class: "text-right block" }, toDisplayString(formatCurrency(row.netProfit)), 1)
                                ];
                              }
                            }),
                            "profitMargin-data": withCtx(({ row }, _push5, _parent5, _scopeId4) => {
                              if (_push5) {
                                _push5(`<span class="text-right block"${_scopeId4}>${ssrInterpolate(Math.round((row.profitMargin || 0) * 100))}%</span>`);
                              } else {
                                return [
                                  createVNode("span", { class: "text-right block" }, toDisplayString(Math.round((row.profitMargin || 0) * 100)) + "%", 1)
                                ];
                              }
                            }),
                            _: 1
                          }, _parent4, _scopeId3));
                        } else {
                          return [
                            createVNode(_component_UTable, {
                              rows: unref(data)?.tenants || [],
                              columns: [
                                { key: "tenantName", label: "Organization" },
                                { key: "revenueTotal", label: "Revenue", class: "text-right" },
                                { key: "expensesTotal", label: "Expenses", class: "text-right" },
                                { key: "netProfit", label: "Net Profit", class: "text-right" },
                                { key: "profitMargin", label: "Margin", class: "text-right" }
                              ]
                            }, {
                              "revenueTotal-data": withCtx(({ row }) => [
                                createVNode("span", { class: "text-right block" }, toDisplayString(formatCurrency(row.revenueTotal)), 1)
                              ]),
                              "expensesTotal-data": withCtx(({ row }) => [
                                createVNode("span", { class: "text-right block" }, toDisplayString(formatCurrency(row.expensesTotal)), 1)
                              ]),
                              "netProfit-data": withCtx(({ row }) => [
                                createVNode("span", { class: "text-right block" }, toDisplayString(formatCurrency(row.netProfit)), 1)
                              ]),
                              "profitMargin-data": withCtx(({ row }) => [
                                createVNode("span", { class: "text-right block" }, toDisplayString(Math.round((row.profitMargin || 0) * 100)) + "%", 1)
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
                        title: "Totals",
                        variant: "subtle"
                      }, {
                        default: withCtx(() => [
                          createVNode("div", { class: "grid grid-cols-2 md:grid-cols-4 gap-4" }, [
                            createVNode("div", null, [
                              createVNode("div", { class: "text-muted text-xs" }, "Revenue"),
                              createVNode("div", { class: "text-lg font-semibold" }, toDisplayString(formatCurrency(unref(data)?.totals?.revenueTotal)), 1)
                            ]),
                            createVNode("div", null, [
                              createVNode("div", { class: "text-muted text-xs" }, "Expenses"),
                              createVNode("div", { class: "text-lg font-semibold" }, toDisplayString(formatCurrency(unref(data)?.totals?.expensesTotal)), 1)
                            ]),
                            createVNode("div", null, [
                              createVNode("div", { class: "text-muted text-xs" }, "Net Profit"),
                              createVNode("div", { class: "text-lg font-semibold" }, toDisplayString(formatCurrency(unref(data)?.totals?.netProfit)), 1)
                            ]),
                            createVNode("div", null, [
                              createVNode("div", { class: "text-muted text-xs" }, "Profit Margin"),
                              createVNode("div", { class: "text-lg font-semibold" }, toDisplayString(Math.round((unref(data)?.totals?.profitMargin || 0) * 100)) + "%", 1)
                            ])
                          ])
                        ]),
                        _: 1
                      }),
                      createVNode(_component_UPageCard, {
                        title: "Per Organization",
                        variant: "subtle"
                      }, {
                        default: withCtx(() => [
                          createVNode(_component_UTable, {
                            rows: unref(data)?.tenants || [],
                            columns: [
                              { key: "tenantName", label: "Organization" },
                              { key: "revenueTotal", label: "Revenue", class: "text-right" },
                              { key: "expensesTotal", label: "Expenses", class: "text-right" },
                              { key: "netProfit", label: "Net Profit", class: "text-right" },
                              { key: "profitMargin", label: "Margin", class: "text-right" }
                            ]
                          }, {
                            "revenueTotal-data": withCtx(({ row }) => [
                              createVNode("span", { class: "text-right block" }, toDisplayString(formatCurrency(row.revenueTotal)), 1)
                            ]),
                            "expensesTotal-data": withCtx(({ row }) => [
                              createVNode("span", { class: "text-right block" }, toDisplayString(formatCurrency(row.expensesTotal)), 1)
                            ]),
                            "netProfit-data": withCtx(({ row }) => [
                              createVNode("span", { class: "text-right block" }, toDisplayString(formatCurrency(row.netProfit)), 1)
                            ]),
                            "profitMargin-data": withCtx(({ row }) => [
                              createVNode("span", { class: "text-right block" }, toDisplayString(Math.round((row.profitMargin || 0) * 100)) + "%", 1)
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
                title: "Consolidated P&L",
                description: "Aggregated Profit & Loss across connected organizations"
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
              unref(pending) ? (openBlock(), createBlock("div", { key: 0 }, "Loading consolidated P&L…")) : unref(error) ? (openBlock(), createBlock("div", { key: 1 }, "Failed to load consolidated P&L.")) : (openBlock(), createBlock(_component_UPageGrid, {
                key: 2,
                class: "gap-4 sm:gap-6"
              }, {
                default: withCtx(() => [
                  createVNode(_component_UPageCard, {
                    title: "Totals",
                    variant: "subtle"
                  }, {
                    default: withCtx(() => [
                      createVNode("div", { class: "grid grid-cols-2 md:grid-cols-4 gap-4" }, [
                        createVNode("div", null, [
                          createVNode("div", { class: "text-muted text-xs" }, "Revenue"),
                          createVNode("div", { class: "text-lg font-semibold" }, toDisplayString(formatCurrency(unref(data)?.totals?.revenueTotal)), 1)
                        ]),
                        createVNode("div", null, [
                          createVNode("div", { class: "text-muted text-xs" }, "Expenses"),
                          createVNode("div", { class: "text-lg font-semibold" }, toDisplayString(formatCurrency(unref(data)?.totals?.expensesTotal)), 1)
                        ]),
                        createVNode("div", null, [
                          createVNode("div", { class: "text-muted text-xs" }, "Net Profit"),
                          createVNode("div", { class: "text-lg font-semibold" }, toDisplayString(formatCurrency(unref(data)?.totals?.netProfit)), 1)
                        ]),
                        createVNode("div", null, [
                          createVNode("div", { class: "text-muted text-xs" }, "Profit Margin"),
                          createVNode("div", { class: "text-lg font-semibold" }, toDisplayString(Math.round((unref(data)?.totals?.profitMargin || 0) * 100)) + "%", 1)
                        ])
                      ])
                    ]),
                    _: 1
                  }),
                  createVNode(_component_UPageCard, {
                    title: "Per Organization",
                    variant: "subtle"
                  }, {
                    default: withCtx(() => [
                      createVNode(_component_UTable, {
                        rows: unref(data)?.tenants || [],
                        columns: [
                          { key: "tenantName", label: "Organization" },
                          { key: "revenueTotal", label: "Revenue", class: "text-right" },
                          { key: "expensesTotal", label: "Expenses", class: "text-right" },
                          { key: "netProfit", label: "Net Profit", class: "text-right" },
                          { key: "profitMargin", label: "Margin", class: "text-right" }
                        ]
                      }, {
                        "revenueTotal-data": withCtx(({ row }) => [
                          createVNode("span", { class: "text-right block" }, toDisplayString(formatCurrency(row.revenueTotal)), 1)
                        ]),
                        "expensesTotal-data": withCtx(({ row }) => [
                          createVNode("span", { class: "text-right block" }, toDisplayString(formatCurrency(row.expensesTotal)), 1)
                        ]),
                        "netProfit-data": withCtx(({ row }) => [
                          createVNode("span", { class: "text-right block" }, toDisplayString(formatCurrency(row.netProfit)), 1)
                        ]),
                        "profitMargin-data": withCtx(({ row }) => [
                          createVNode("span", { class: "text-right block" }, toDisplayString(Math.round((row.profitMargin || 0) * 100)) + "%", 1)
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
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("pages/reports/consolidated.vue");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};

export { _sfc_main as default };
//# sourceMappingURL=consolidated-BGTGOzZ8.mjs.map
