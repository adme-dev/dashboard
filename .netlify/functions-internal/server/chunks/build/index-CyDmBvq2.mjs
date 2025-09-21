import { _ as _sfc_main$1, a as _sfc_main$2 } from './PageHeader-C7h9LUrz.mjs';
import { _ as _sfc_main$3 } from './PageGrid-DdlW-upS.mjs';
import { _ as _sfc_main$4 } from './PageCard-o0es5OuJ.mjs';
import { defineComponent, withAsyncContext, withCtx, unref, createBlock, openBlock, createVNode, toDisplayString, useSSRContext } from 'vue';
import { ssrRenderComponent, ssrInterpolate } from 'vue/server-renderer';
import { d as useFetch } from './server.mjs';
import 'reka-ui';
import './index-Cc9owYnb.mjs';
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

const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "index",
  __ssrInlineRender: true,
  async setup(__props) {
    let __temp, __restore;
    const { data: pnl, pending: pnlPending, error: pnlError } = ([__temp, __restore] = withAsyncContext(() => useFetch("/api/xero/reports/pnl", "$6HxCvb34Yu")), __temp = await __temp, __restore(), __temp);
    const { data: bs, pending: bsPending, error: bsError } = ([__temp, __restore] = withAsyncContext(() => useFetch("/api/xero/reports/balance-sheet", "$wfZ-X26uM2")), __temp = await __temp, __restore(), __temp);
    function formatCurrency(value) {
      if (typeof value !== "number" || Number.isNaN(value)) return "-";
      return value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
    }
    return (_ctx, _push, _parent, _attrs) => {
      const _component_UPage = _sfc_main$1;
      const _component_UPageHeader = _sfc_main$2;
      const _component_UPageGrid = _sfc_main$3;
      const _component_UPageCard = _sfc_main$4;
      _push(ssrRenderComponent(_component_UPage, _attrs, {
        default: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            _push2(ssrRenderComponent(_component_UPageHeader, {
              title: "Financial Reports",
              description: "Key figures from Profit & Loss and Balance Sheet"
            }, null, _parent2, _scopeId));
            _push2(ssrRenderComponent(_component_UPageGrid, { class: "gap-4 sm:gap-6" }, {
              default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                if (_push3) {
                  _push3(ssrRenderComponent(_component_UPageCard, {
                    title: "Profit & Loss",
                    variant: "subtle"
                  }, {
                    default: withCtx((_3, _push4, _parent4, _scopeId3) => {
                      if (_push4) {
                        if (unref(pnlPending)) {
                          _push4(`<div${_scopeId3}>Loading P&amp;L…</div>`);
                        } else if (unref(pnlError)) {
                          _push4(`<div${_scopeId3}>Failed to load P&amp;L.</div>`);
                        } else {
                          _push4(`<div class="grid grid-cols-2 md:grid-cols-4 gap-4"${_scopeId3}><div${_scopeId3}><div class="text-muted text-xs"${_scopeId3}>Revenue</div><div class="text-lg font-semibold"${_scopeId3}>${ssrInterpolate(formatCurrency(unref(pnl)?.revenueTotal))}</div></div><div${_scopeId3}><div class="text-muted text-xs"${_scopeId3}>Expenses</div><div class="text-lg font-semibold"${_scopeId3}>${ssrInterpolate(formatCurrency(unref(pnl)?.expensesTotal))}</div></div><div${_scopeId3}><div class="text-muted text-xs"${_scopeId3}>Net Profit</div><div class="text-lg font-semibold"${_scopeId3}>${ssrInterpolate(formatCurrency(unref(pnl)?.netProfit))}</div></div><div${_scopeId3}><div class="text-muted text-xs"${_scopeId3}>Profit Margin</div><div class="text-lg font-semibold"${_scopeId3}>${ssrInterpolate(Math.round((unref(pnl)?.profitMargin || 0) * 100))}%</div></div></div>`);
                        }
                      } else {
                        return [
                          unref(pnlPending) ? (openBlock(), createBlock("div", { key: 0 }, "Loading P&L…")) : unref(pnlError) ? (openBlock(), createBlock("div", { key: 1 }, "Failed to load P&L.")) : (openBlock(), createBlock("div", {
                            key: 2,
                            class: "grid grid-cols-2 md:grid-cols-4 gap-4"
                          }, [
                            createVNode("div", null, [
                              createVNode("div", { class: "text-muted text-xs" }, "Revenue"),
                              createVNode("div", { class: "text-lg font-semibold" }, toDisplayString(formatCurrency(unref(pnl)?.revenueTotal)), 1)
                            ]),
                            createVNode("div", null, [
                              createVNode("div", { class: "text-muted text-xs" }, "Expenses"),
                              createVNode("div", { class: "text-lg font-semibold" }, toDisplayString(formatCurrency(unref(pnl)?.expensesTotal)), 1)
                            ]),
                            createVNode("div", null, [
                              createVNode("div", { class: "text-muted text-xs" }, "Net Profit"),
                              createVNode("div", { class: "text-lg font-semibold" }, toDisplayString(formatCurrency(unref(pnl)?.netProfit)), 1)
                            ]),
                            createVNode("div", null, [
                              createVNode("div", { class: "text-muted text-xs" }, "Profit Margin"),
                              createVNode("div", { class: "text-lg font-semibold" }, toDisplayString(Math.round((unref(pnl)?.profitMargin || 0) * 100)) + "%", 1)
                            ])
                          ]))
                        ];
                      }
                    }),
                    _: 1
                  }, _parent3, _scopeId2));
                  _push3(ssrRenderComponent(_component_UPageCard, {
                    title: "Balance Sheet",
                    variant: "subtle"
                  }, {
                    default: withCtx((_3, _push4, _parent4, _scopeId3) => {
                      if (_push4) {
                        if (unref(bsPending)) {
                          _push4(`<div${_scopeId3}>Loading Balance Sheet…</div>`);
                        } else if (unref(bsError)) {
                          _push4(`<div${_scopeId3}>Failed to load Balance Sheet.</div>`);
                        } else {
                          _push4(`<div class="grid grid-cols-2 md:grid-cols-3 gap-4"${_scopeId3}><div${_scopeId3}><div class="text-muted text-xs"${_scopeId3}>Total Assets</div><div class="text-lg font-semibold"${_scopeId3}>${ssrInterpolate(formatCurrency(unref(bs)?.totalAssets))}</div></div><div${_scopeId3}><div class="text-muted text-xs"${_scopeId3}>Total Liabilities</div><div class="text-lg font-semibold"${_scopeId3}>${ssrInterpolate(formatCurrency(unref(bs)?.totalLiabilities))}</div></div><div${_scopeId3}><div class="text-muted text-xs"${_scopeId3}>Total Equity</div><div class="text-lg font-semibold"${_scopeId3}>${ssrInterpolate(formatCurrency(unref(bs)?.totalEquity))}</div></div></div>`);
                        }
                      } else {
                        return [
                          unref(bsPending) ? (openBlock(), createBlock("div", { key: 0 }, "Loading Balance Sheet…")) : unref(bsError) ? (openBlock(), createBlock("div", { key: 1 }, "Failed to load Balance Sheet.")) : (openBlock(), createBlock("div", {
                            key: 2,
                            class: "grid grid-cols-2 md:grid-cols-3 gap-4"
                          }, [
                            createVNode("div", null, [
                              createVNode("div", { class: "text-muted text-xs" }, "Total Assets"),
                              createVNode("div", { class: "text-lg font-semibold" }, toDisplayString(formatCurrency(unref(bs)?.totalAssets)), 1)
                            ]),
                            createVNode("div", null, [
                              createVNode("div", { class: "text-muted text-xs" }, "Total Liabilities"),
                              createVNode("div", { class: "text-lg font-semibold" }, toDisplayString(formatCurrency(unref(bs)?.totalLiabilities)), 1)
                            ]),
                            createVNode("div", null, [
                              createVNode("div", { class: "text-muted text-xs" }, "Total Equity"),
                              createVNode("div", { class: "text-lg font-semibold" }, toDisplayString(formatCurrency(unref(bs)?.totalEquity)), 1)
                            ])
                          ]))
                        ];
                      }
                    }),
                    _: 1
                  }, _parent3, _scopeId2));
                } else {
                  return [
                    createVNode(_component_UPageCard, {
                      title: "Profit & Loss",
                      variant: "subtle"
                    }, {
                      default: withCtx(() => [
                        unref(pnlPending) ? (openBlock(), createBlock("div", { key: 0 }, "Loading P&L…")) : unref(pnlError) ? (openBlock(), createBlock("div", { key: 1 }, "Failed to load P&L.")) : (openBlock(), createBlock("div", {
                          key: 2,
                          class: "grid grid-cols-2 md:grid-cols-4 gap-4"
                        }, [
                          createVNode("div", null, [
                            createVNode("div", { class: "text-muted text-xs" }, "Revenue"),
                            createVNode("div", { class: "text-lg font-semibold" }, toDisplayString(formatCurrency(unref(pnl)?.revenueTotal)), 1)
                          ]),
                          createVNode("div", null, [
                            createVNode("div", { class: "text-muted text-xs" }, "Expenses"),
                            createVNode("div", { class: "text-lg font-semibold" }, toDisplayString(formatCurrency(unref(pnl)?.expensesTotal)), 1)
                          ]),
                          createVNode("div", null, [
                            createVNode("div", { class: "text-muted text-xs" }, "Net Profit"),
                            createVNode("div", { class: "text-lg font-semibold" }, toDisplayString(formatCurrency(unref(pnl)?.netProfit)), 1)
                          ]),
                          createVNode("div", null, [
                            createVNode("div", { class: "text-muted text-xs" }, "Profit Margin"),
                            createVNode("div", { class: "text-lg font-semibold" }, toDisplayString(Math.round((unref(pnl)?.profitMargin || 0) * 100)) + "%", 1)
                          ])
                        ]))
                      ]),
                      _: 1
                    }),
                    createVNode(_component_UPageCard, {
                      title: "Balance Sheet",
                      variant: "subtle"
                    }, {
                      default: withCtx(() => [
                        unref(bsPending) ? (openBlock(), createBlock("div", { key: 0 }, "Loading Balance Sheet…")) : unref(bsError) ? (openBlock(), createBlock("div", { key: 1 }, "Failed to load Balance Sheet.")) : (openBlock(), createBlock("div", {
                          key: 2,
                          class: "grid grid-cols-2 md:grid-cols-3 gap-4"
                        }, [
                          createVNode("div", null, [
                            createVNode("div", { class: "text-muted text-xs" }, "Total Assets"),
                            createVNode("div", { class: "text-lg font-semibold" }, toDisplayString(formatCurrency(unref(bs)?.totalAssets)), 1)
                          ]),
                          createVNode("div", null, [
                            createVNode("div", { class: "text-muted text-xs" }, "Total Liabilities"),
                            createVNode("div", { class: "text-lg font-semibold" }, toDisplayString(formatCurrency(unref(bs)?.totalLiabilities)), 1)
                          ]),
                          createVNode("div", null, [
                            createVNode("div", { class: "text-muted text-xs" }, "Total Equity"),
                            createVNode("div", { class: "text-lg font-semibold" }, toDisplayString(formatCurrency(unref(bs)?.totalEquity)), 1)
                          ])
                        ]))
                      ]),
                      _: 1
                    })
                  ];
                }
              }),
              _: 1
            }, _parent2, _scopeId));
          } else {
            return [
              createVNode(_component_UPageHeader, {
                title: "Financial Reports",
                description: "Key figures from Profit & Loss and Balance Sheet"
              }),
              createVNode(_component_UPageGrid, { class: "gap-4 sm:gap-6" }, {
                default: withCtx(() => [
                  createVNode(_component_UPageCard, {
                    title: "Profit & Loss",
                    variant: "subtle"
                  }, {
                    default: withCtx(() => [
                      unref(pnlPending) ? (openBlock(), createBlock("div", { key: 0 }, "Loading P&L…")) : unref(pnlError) ? (openBlock(), createBlock("div", { key: 1 }, "Failed to load P&L.")) : (openBlock(), createBlock("div", {
                        key: 2,
                        class: "grid grid-cols-2 md:grid-cols-4 gap-4"
                      }, [
                        createVNode("div", null, [
                          createVNode("div", { class: "text-muted text-xs" }, "Revenue"),
                          createVNode("div", { class: "text-lg font-semibold" }, toDisplayString(formatCurrency(unref(pnl)?.revenueTotal)), 1)
                        ]),
                        createVNode("div", null, [
                          createVNode("div", { class: "text-muted text-xs" }, "Expenses"),
                          createVNode("div", { class: "text-lg font-semibold" }, toDisplayString(formatCurrency(unref(pnl)?.expensesTotal)), 1)
                        ]),
                        createVNode("div", null, [
                          createVNode("div", { class: "text-muted text-xs" }, "Net Profit"),
                          createVNode("div", { class: "text-lg font-semibold" }, toDisplayString(formatCurrency(unref(pnl)?.netProfit)), 1)
                        ]),
                        createVNode("div", null, [
                          createVNode("div", { class: "text-muted text-xs" }, "Profit Margin"),
                          createVNode("div", { class: "text-lg font-semibold" }, toDisplayString(Math.round((unref(pnl)?.profitMargin || 0) * 100)) + "%", 1)
                        ])
                      ]))
                    ]),
                    _: 1
                  }),
                  createVNode(_component_UPageCard, {
                    title: "Balance Sheet",
                    variant: "subtle"
                  }, {
                    default: withCtx(() => [
                      unref(bsPending) ? (openBlock(), createBlock("div", { key: 0 }, "Loading Balance Sheet…")) : unref(bsError) ? (openBlock(), createBlock("div", { key: 1 }, "Failed to load Balance Sheet.")) : (openBlock(), createBlock("div", {
                        key: 2,
                        class: "grid grid-cols-2 md:grid-cols-3 gap-4"
                      }, [
                        createVNode("div", null, [
                          createVNode("div", { class: "text-muted text-xs" }, "Total Assets"),
                          createVNode("div", { class: "text-lg font-semibold" }, toDisplayString(formatCurrency(unref(bs)?.totalAssets)), 1)
                        ]),
                        createVNode("div", null, [
                          createVNode("div", { class: "text-muted text-xs" }, "Total Liabilities"),
                          createVNode("div", { class: "text-lg font-semibold" }, toDisplayString(formatCurrency(unref(bs)?.totalLiabilities)), 1)
                        ]),
                        createVNode("div", null, [
                          createVNode("div", { class: "text-muted text-xs" }, "Total Equity"),
                          createVNode("div", { class: "text-lg font-semibold" }, toDisplayString(formatCurrency(unref(bs)?.totalEquity)), 1)
                        ])
                      ]))
                    ]),
                    _: 1
                  })
                ]),
                _: 1
              })
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
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("pages/reports/index.vue");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};

export { _sfc_main as default };
//# sourceMappingURL=index-CyDmBvq2.mjs.map
