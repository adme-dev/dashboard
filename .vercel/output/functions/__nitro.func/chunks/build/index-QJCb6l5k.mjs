import { _ as _sfc_main$1, a as _sfc_main$2 } from './PageHeader-DF6x_mG2.mjs';
import { _ as _sfc_main$3 } from './PageGrid-CyaRhCNm.mjs';
import { _ as _sfc_main$4 } from './PageCard-BrXkocLW.mjs';
import { _ as _sfc_main$5 } from './Skeleton-p2Vkb_Gp.mjs';
import { _ as _sfc_main$6 } from './Badge-BfrefdmG.mjs';
import { defineComponent, withAsyncContext, computed, resolveComponent, withCtx, unref, createTextVNode, toDisplayString, createBlock, openBlock, createVNode, Fragment, renderList, createCommentVNode, useSSRContext } from 'vue';
import { ssrRenderComponent, ssrRenderList, ssrInterpolate } from 'vue/server-renderer';
import { e as useFetch } from './server.mjs';
import 'reka-ui';
import './index-Btsu36yb.mjs';
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

const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "index",
  __ssrInlineRender: true,
  async setup(__props) {
    let __temp, __restore;
    const { data: pnl, pending: pnlPending, error: pnlError } = ([__temp, __restore] = withAsyncContext(() => useFetch("/api/xero/reports/pnl", "$6HxCvb34Yu")), __temp = await __temp, __restore(), __temp);
    const { data: bs, pending: bsPending, error: bsError } = ([__temp, __restore] = withAsyncContext(() => useFetch("/api/xero/reports/balance-sheet", "$wfZ-X26uM2")), __temp = await __temp, __restore(), __temp);
    const pnlData = computed(() => pnl.value ?? null);
    const latestPeriod = computed(() => {
      const periods = pnlData.value?.periods ?? [];
      return periods[periods.length - 1];
    });
    const previousPeriod = computed(() => {
      const periods = pnlData.value?.periods ?? [];
      return periods.length > 1 ? periods[periods.length - 2] : void 0;
    });
    const netProfitChange = computed(() => {
      if (!latestPeriod.value || !previousPeriod.value) return null;
      return latestPeriod.value.netProfit - previousPeriod.value.netProfit;
    });
    const profitMarginChange = computed(() => {
      if (!latestPeriod.value || !previousPeriod.value) return null;
      return (latestPeriod.value.profitMargin - previousPeriod.value.profitMargin) * 100;
    });
    function formatCurrency(value) {
      if (typeof value !== "number" || Number.isNaN(value)) return "-";
      return value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
    }
    function formatPercent(value) {
      if (typeof value !== "number" || Number.isNaN(value)) return "-";
      return `${value.toFixed(1)}%`;
    }
    function trendBadgeColor(value) {
      if (value === null) return "neutral";
      if (value > 0) return "success";
      if (value < 0) return "error";
      return "neutral";
    }
    function formatMultiple(value) {
      if (typeof value !== "number" || Number.isNaN(value)) return "-";
      return `${value.toFixed(2)}x`;
    }
    return (_ctx, _push, _parent, _attrs) => {
      const _component_UPage = _sfc_main$1;
      const _component_UPageHeader = _sfc_main$2;
      const _component_UPageGrid = _sfc_main$3;
      const _component_UPageCard = _sfc_main$4;
      const _component_USkeleton = _sfc_main$5;
      const _component_UBadge = _sfc_main$6;
      const _component_ProfitTrendChart = resolveComponent("ProfitTrendChart");
      const _component_ExpenseBreakdownChart = resolveComponent("ExpenseBreakdownChart");
      _push(ssrRenderComponent(_component_UPage, _attrs, {
        default: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            _push2(ssrRenderComponent(_component_UPageHeader, {
              title: "Financial Reports",
              description: "Visualize profit trends and balance sheet health"
            }, null, _parent2, _scopeId));
            _push2(ssrRenderComponent(_component_UPageGrid, { class: "gap-4 sm:gap-6" }, {
              default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                if (_push3) {
                  _push3(ssrRenderComponent(_component_UPageCard, {
                    title: "Profit & Loss Snapshot",
                    variant: "subtle"
                  }, {
                    default: withCtx((_3, _push4, _parent4, _scopeId3) => {
                      if (_push4) {
                        if (unref(pnlPending)) {
                          _push4(`<div class="space-y-3"${_scopeId3}>`);
                          _push4(ssrRenderComponent(_component_USkeleton, { class: "h-4 w-32" }, null, _parent4, _scopeId3));
                          _push4(`<!--[-->`);
                          ssrRenderList(3, (n) => {
                            _push4(ssrRenderComponent(_component_USkeleton, {
                              key: n,
                              class: "h-4 w-full"
                            }, null, _parent4, _scopeId3));
                          });
                          _push4(`<!--]--></div>`);
                        } else if (unref(pnlError)) {
                          _push4(`<div class="text-sm text-negative"${_scopeId3}> Failed to load Profit &amp; Loss data. </div>`);
                        } else {
                          _push4(`<div class="grid grid-cols-2 md:grid-cols-4 gap-4"${_scopeId3}><div${_scopeId3}><p class="text-xs text-muted uppercase mb-1"${_scopeId3}> Revenue </p><p class="text-xl font-semibold"${_scopeId3}>${ssrInterpolate(formatCurrency(unref(pnl)?.revenueTotal))}</p><p class="text-xs text-muted"${_scopeId3}>${ssrInterpolate(unref(latestPeriod)?.label || "Current period")}</p></div><div${_scopeId3}><p class="text-xs text-muted uppercase mb-1"${_scopeId3}> Expenses </p><p class="text-xl font-semibold"${_scopeId3}>${ssrInterpolate(formatCurrency(unref(pnl)?.expensesTotal))}</p><p class="text-xs text-muted"${_scopeId3}> Including operating costs &amp; overhead </p></div><div${_scopeId3}><p class="text-xs text-muted uppercase mb-1"${_scopeId3}> Net Profit </p><div class="flex items-baseline gap-2"${_scopeId3}><p class="text-xl font-semibold"${_scopeId3}>${ssrInterpolate(formatCurrency(unref(pnl)?.netProfit))}</p>`);
                          if (unref(netProfitChange) !== null) {
                            _push4(ssrRenderComponent(_component_UBadge, {
                              color: trendBadgeColor(unref(netProfitChange))
                            }, {
                              default: withCtx((_4, _push5, _parent5, _scopeId4) => {
                                if (_push5) {
                                  _push5(`${ssrInterpolate(unref(netProfitChange) > 0 ? "+" : "")}${ssrInterpolate(formatCurrency(unref(netProfitChange)))} vs previous `);
                                } else {
                                  return [
                                    createTextVNode(toDisplayString(unref(netProfitChange) > 0 ? "+" : "") + toDisplayString(formatCurrency(unref(netProfitChange))) + " vs previous ", 1)
                                  ];
                                }
                              }),
                              _: 1
                            }, _parent4, _scopeId3));
                          } else {
                            _push4(`<!---->`);
                          }
                          _push4(`</div><p class="text-xs text-muted"${_scopeId3}>${ssrInterpolate(unref(previousPeriod)?.label || "No prior period")}</p></div><div${_scopeId3}><p class="text-xs text-muted uppercase mb-1"${_scopeId3}> Profit Margin </p><div class="flex items-baseline gap-2"${_scopeId3}><p class="text-xl font-semibold"${_scopeId3}>${ssrInterpolate(formatPercent((unref(pnl)?.profitMargin || 0) * 100))}</p>`);
                          if (unref(profitMarginChange) !== null) {
                            _push4(ssrRenderComponent(_component_UBadge, {
                              color: trendBadgeColor(unref(profitMarginChange))
                            }, {
                              default: withCtx((_4, _push5, _parent5, _scopeId4) => {
                                if (_push5) {
                                  _push5(`${ssrInterpolate(unref(profitMarginChange) > 0 ? "+" : "")}${ssrInterpolate(unref(profitMarginChange).toFixed(1))} pts `);
                                } else {
                                  return [
                                    createTextVNode(toDisplayString(unref(profitMarginChange) > 0 ? "+" : "") + toDisplayString(unref(profitMarginChange).toFixed(1)) + " pts ", 1)
                                  ];
                                }
                              }),
                              _: 1
                            }, _parent4, _scopeId3));
                          } else {
                            _push4(`<!---->`);
                          }
                          _push4(`</div><p class="text-xs text-muted"${_scopeId3}> Change period-over-period </p></div></div>`);
                        }
                      } else {
                        return [
                          unref(pnlPending) ? (openBlock(), createBlock("div", {
                            key: 0,
                            class: "space-y-3"
                          }, [
                            createVNode(_component_USkeleton, { class: "h-4 w-32" }),
                            (openBlock(), createBlock(Fragment, null, renderList(3, (n) => {
                              return createVNode(_component_USkeleton, {
                                key: n,
                                class: "h-4 w-full"
                              });
                            }), 64))
                          ])) : unref(pnlError) ? (openBlock(), createBlock("div", {
                            key: 1,
                            class: "text-sm text-negative"
                          }, " Failed to load Profit & Loss data. ")) : (openBlock(), createBlock("div", {
                            key: 2,
                            class: "grid grid-cols-2 md:grid-cols-4 gap-4"
                          }, [
                            createVNode("div", null, [
                              createVNode("p", { class: "text-xs text-muted uppercase mb-1" }, " Revenue "),
                              createVNode("p", { class: "text-xl font-semibold" }, toDisplayString(formatCurrency(unref(pnl)?.revenueTotal)), 1),
                              createVNode("p", { class: "text-xs text-muted" }, toDisplayString(unref(latestPeriod)?.label || "Current period"), 1)
                            ]),
                            createVNode("div", null, [
                              createVNode("p", { class: "text-xs text-muted uppercase mb-1" }, " Expenses "),
                              createVNode("p", { class: "text-xl font-semibold" }, toDisplayString(formatCurrency(unref(pnl)?.expensesTotal)), 1),
                              createVNode("p", { class: "text-xs text-muted" }, " Including operating costs & overhead ")
                            ]),
                            createVNode("div", null, [
                              createVNode("p", { class: "text-xs text-muted uppercase mb-1" }, " Net Profit "),
                              createVNode("div", { class: "flex items-baseline gap-2" }, [
                                createVNode("p", { class: "text-xl font-semibold" }, toDisplayString(formatCurrency(unref(pnl)?.netProfit)), 1),
                                unref(netProfitChange) !== null ? (openBlock(), createBlock(_component_UBadge, {
                                  key: 0,
                                  color: trendBadgeColor(unref(netProfitChange))
                                }, {
                                  default: withCtx(() => [
                                    createTextVNode(toDisplayString(unref(netProfitChange) > 0 ? "+" : "") + toDisplayString(formatCurrency(unref(netProfitChange))) + " vs previous ", 1)
                                  ]),
                                  _: 1
                                }, 8, ["color"])) : createCommentVNode("", true)
                              ]),
                              createVNode("p", { class: "text-xs text-muted" }, toDisplayString(unref(previousPeriod)?.label || "No prior period"), 1)
                            ]),
                            createVNode("div", null, [
                              createVNode("p", { class: "text-xs text-muted uppercase mb-1" }, " Profit Margin "),
                              createVNode("div", { class: "flex items-baseline gap-2" }, [
                                createVNode("p", { class: "text-xl font-semibold" }, toDisplayString(formatPercent((unref(pnl)?.profitMargin || 0) * 100)), 1),
                                unref(profitMarginChange) !== null ? (openBlock(), createBlock(_component_UBadge, {
                                  key: 0,
                                  color: trendBadgeColor(unref(profitMarginChange))
                                }, {
                                  default: withCtx(() => [
                                    createTextVNode(toDisplayString(unref(profitMarginChange) > 0 ? "+" : "") + toDisplayString(unref(profitMarginChange).toFixed(1)) + " pts ", 1)
                                  ]),
                                  _: 1
                                }, 8, ["color"])) : createCommentVNode("", true)
                              ]),
                              createVNode("p", { class: "text-xs text-muted" }, " Change period-over-period ")
                            ])
                          ]))
                        ];
                      }
                    }),
                    _: 1
                  }, _parent3, _scopeId2));
                  if (!unref(pnlPending) && !unref(pnlError)) {
                    _push3(`<!--[-->`);
                    if ((unref(pnl)?.periods?.length || 0) > 1) {
                      _push3(ssrRenderComponent(_component_ProfitTrendChart, {
                        periods: unref(pnl)?.periods || []
                      }, null, _parent3, _scopeId2));
                    } else {
                      _push3(ssrRenderComponent(_component_UPageCard, { variant: "subtle" }, {
                        default: withCtx((_3, _push4, _parent4, _scopeId3) => {
                          if (_push4) {
                            _push4(`<p class="text-sm text-muted"${_scopeId3}> More than one reporting period is needed to show the profit trend. </p>`);
                          } else {
                            return [
                              createVNode("p", { class: "text-sm text-muted" }, " More than one reporting period is needed to show the profit trend. ")
                            ];
                          }
                        }),
                        _: 1
                      }, _parent3, _scopeId2));
                    }
                    if ((unref(pnl)?.expensesByCategory?.length || 0) > 0) {
                      _push3(ssrRenderComponent(_component_ExpenseBreakdownChart, {
                        items: unref(pnl)?.expensesByCategory || []
                      }, null, _parent3, _scopeId2));
                    } else {
                      _push3(ssrRenderComponent(_component_UPageCard, { variant: "subtle" }, {
                        default: withCtx((_3, _push4, _parent4, _scopeId3) => {
                          if (_push4) {
                            _push4(`<p class="text-sm text-muted"${_scopeId3}> Expense categories will appear once Xero returns a detailed breakdown. </p>`);
                          } else {
                            return [
                              createVNode("p", { class: "text-sm text-muted" }, " Expense categories will appear once Xero returns a detailed breakdown. ")
                            ];
                          }
                        }),
                        _: 1
                      }, _parent3, _scopeId2));
                    }
                    _push3(`<!--]-->`);
                  } else {
                    _push3(`<!---->`);
                  }
                  _push3(ssrRenderComponent(_component_UPageCard, {
                    title: "Balance Sheet",
                    variant: "subtle",
                    class: "md:col-span-2"
                  }, {
                    default: withCtx((_3, _push4, _parent4, _scopeId3) => {
                      if (_push4) {
                        if (unref(bsPending)) {
                          _push4(`<div class="space-y-3"${_scopeId3}>`);
                          _push4(ssrRenderComponent(_component_USkeleton, { class: "h-4 w-32" }, null, _parent4, _scopeId3));
                          _push4(`<!--[-->`);
                          ssrRenderList(3, (n) => {
                            _push4(ssrRenderComponent(_component_USkeleton, {
                              key: n,
                              class: "h-4 w-full"
                            }, null, _parent4, _scopeId3));
                          });
                          _push4(`<!--]--></div>`);
                        } else if (unref(bsError)) {
                          _push4(`<div class="text-sm text-negative"${_scopeId3}> Failed to load Balance Sheet data. </div>`);
                        } else {
                          _push4(`<div${_scopeId3}><div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6"${_scopeId3}><div${_scopeId3}><p class="text-xs text-muted uppercase mb-1"${_scopeId3}> Total Assets </p><p class="text-xl font-semibold"${_scopeId3}>${ssrInterpolate(formatCurrency(unref(bs)?.totalAssets))}</p></div><div${_scopeId3}><p class="text-xs text-muted uppercase mb-1"${_scopeId3}> Total Liabilities </p><p class="text-xl font-semibold"${_scopeId3}>${ssrInterpolate(formatCurrency(unref(bs)?.totalLiabilities))}</p></div><div${_scopeId3}><p class="text-xs text-muted uppercase mb-1"${_scopeId3}> Total Equity </p><p class="text-xl font-semibold"${_scopeId3}>${ssrInterpolate(formatCurrency(unref(bs)?.totalEquity))}</p></div></div><div class="grid grid-cols-1 sm:grid-cols-3 gap-4"${_scopeId3}><div class="rounded-lg border border-border/60 p-4"${_scopeId3}><p class="text-xs text-muted uppercase mb-1"${_scopeId3}> Working Capital </p><p class="text-lg font-semibold"${_scopeId3}>${ssrInterpolate(formatCurrency(unref(bs)?.workingCapital))}</p><p class="text-xs text-muted"${_scopeId3}> Liquidity to cover short-term obligations </p></div><div class="rounded-lg border border-border/60 p-4"${_scopeId3}><p class="text-xs text-muted uppercase mb-1"${_scopeId3}> Debt-to-Equity </p><p class="text-lg font-semibold"${_scopeId3}>${ssrInterpolate(formatMultiple(unref(bs)?.debtToEquity))}</p><p class="text-xs text-muted"${_scopeId3}> Leverage compared to shareholder equity </p></div><div class="rounded-lg border border-border/60 p-4"${_scopeId3}><p class="text-xs text-muted uppercase mb-1"${_scopeId3}> Equity Ratio </p><p class="text-lg font-semibold"${_scopeId3}>${ssrInterpolate(formatPercent((unref(bs)?.equityRatio || 0) * 100))}</p><p class="text-xs text-muted"${_scopeId3}> Share of assets financed by equity </p></div></div></div>`);
                        }
                      } else {
                        return [
                          unref(bsPending) ? (openBlock(), createBlock("div", {
                            key: 0,
                            class: "space-y-3"
                          }, [
                            createVNode(_component_USkeleton, { class: "h-4 w-32" }),
                            (openBlock(), createBlock(Fragment, null, renderList(3, (n) => {
                              return createVNode(_component_USkeleton, {
                                key: n,
                                class: "h-4 w-full"
                              });
                            }), 64))
                          ])) : unref(bsError) ? (openBlock(), createBlock("div", {
                            key: 1,
                            class: "text-sm text-negative"
                          }, " Failed to load Balance Sheet data. ")) : (openBlock(), createBlock("div", { key: 2 }, [
                            createVNode("div", { class: "grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6" }, [
                              createVNode("div", null, [
                                createVNode("p", { class: "text-xs text-muted uppercase mb-1" }, " Total Assets "),
                                createVNode("p", { class: "text-xl font-semibold" }, toDisplayString(formatCurrency(unref(bs)?.totalAssets)), 1)
                              ]),
                              createVNode("div", null, [
                                createVNode("p", { class: "text-xs text-muted uppercase mb-1" }, " Total Liabilities "),
                                createVNode("p", { class: "text-xl font-semibold" }, toDisplayString(formatCurrency(unref(bs)?.totalLiabilities)), 1)
                              ]),
                              createVNode("div", null, [
                                createVNode("p", { class: "text-xs text-muted uppercase mb-1" }, " Total Equity "),
                                createVNode("p", { class: "text-xl font-semibold" }, toDisplayString(formatCurrency(unref(bs)?.totalEquity)), 1)
                              ])
                            ]),
                            createVNode("div", { class: "grid grid-cols-1 sm:grid-cols-3 gap-4" }, [
                              createVNode("div", { class: "rounded-lg border border-border/60 p-4" }, [
                                createVNode("p", { class: "text-xs text-muted uppercase mb-1" }, " Working Capital "),
                                createVNode("p", { class: "text-lg font-semibold" }, toDisplayString(formatCurrency(unref(bs)?.workingCapital)), 1),
                                createVNode("p", { class: "text-xs text-muted" }, " Liquidity to cover short-term obligations ")
                              ]),
                              createVNode("div", { class: "rounded-lg border border-border/60 p-4" }, [
                                createVNode("p", { class: "text-xs text-muted uppercase mb-1" }, " Debt-to-Equity "),
                                createVNode("p", { class: "text-lg font-semibold" }, toDisplayString(formatMultiple(unref(bs)?.debtToEquity)), 1),
                                createVNode("p", { class: "text-xs text-muted" }, " Leverage compared to shareholder equity ")
                              ]),
                              createVNode("div", { class: "rounded-lg border border-border/60 p-4" }, [
                                createVNode("p", { class: "text-xs text-muted uppercase mb-1" }, " Equity Ratio "),
                                createVNode("p", { class: "text-lg font-semibold" }, toDisplayString(formatPercent((unref(bs)?.equityRatio || 0) * 100)), 1),
                                createVNode("p", { class: "text-xs text-muted" }, " Share of assets financed by equity ")
                              ])
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
                      title: "Profit & Loss Snapshot",
                      variant: "subtle"
                    }, {
                      default: withCtx(() => [
                        unref(pnlPending) ? (openBlock(), createBlock("div", {
                          key: 0,
                          class: "space-y-3"
                        }, [
                          createVNode(_component_USkeleton, { class: "h-4 w-32" }),
                          (openBlock(), createBlock(Fragment, null, renderList(3, (n) => {
                            return createVNode(_component_USkeleton, {
                              key: n,
                              class: "h-4 w-full"
                            });
                          }), 64))
                        ])) : unref(pnlError) ? (openBlock(), createBlock("div", {
                          key: 1,
                          class: "text-sm text-negative"
                        }, " Failed to load Profit & Loss data. ")) : (openBlock(), createBlock("div", {
                          key: 2,
                          class: "grid grid-cols-2 md:grid-cols-4 gap-4"
                        }, [
                          createVNode("div", null, [
                            createVNode("p", { class: "text-xs text-muted uppercase mb-1" }, " Revenue "),
                            createVNode("p", { class: "text-xl font-semibold" }, toDisplayString(formatCurrency(unref(pnl)?.revenueTotal)), 1),
                            createVNode("p", { class: "text-xs text-muted" }, toDisplayString(unref(latestPeriod)?.label || "Current period"), 1)
                          ]),
                          createVNode("div", null, [
                            createVNode("p", { class: "text-xs text-muted uppercase mb-1" }, " Expenses "),
                            createVNode("p", { class: "text-xl font-semibold" }, toDisplayString(formatCurrency(unref(pnl)?.expensesTotal)), 1),
                            createVNode("p", { class: "text-xs text-muted" }, " Including operating costs & overhead ")
                          ]),
                          createVNode("div", null, [
                            createVNode("p", { class: "text-xs text-muted uppercase mb-1" }, " Net Profit "),
                            createVNode("div", { class: "flex items-baseline gap-2" }, [
                              createVNode("p", { class: "text-xl font-semibold" }, toDisplayString(formatCurrency(unref(pnl)?.netProfit)), 1),
                              unref(netProfitChange) !== null ? (openBlock(), createBlock(_component_UBadge, {
                                key: 0,
                                color: trendBadgeColor(unref(netProfitChange))
                              }, {
                                default: withCtx(() => [
                                  createTextVNode(toDisplayString(unref(netProfitChange) > 0 ? "+" : "") + toDisplayString(formatCurrency(unref(netProfitChange))) + " vs previous ", 1)
                                ]),
                                _: 1
                              }, 8, ["color"])) : createCommentVNode("", true)
                            ]),
                            createVNode("p", { class: "text-xs text-muted" }, toDisplayString(unref(previousPeriod)?.label || "No prior period"), 1)
                          ]),
                          createVNode("div", null, [
                            createVNode("p", { class: "text-xs text-muted uppercase mb-1" }, " Profit Margin "),
                            createVNode("div", { class: "flex items-baseline gap-2" }, [
                              createVNode("p", { class: "text-xl font-semibold" }, toDisplayString(formatPercent((unref(pnl)?.profitMargin || 0) * 100)), 1),
                              unref(profitMarginChange) !== null ? (openBlock(), createBlock(_component_UBadge, {
                                key: 0,
                                color: trendBadgeColor(unref(profitMarginChange))
                              }, {
                                default: withCtx(() => [
                                  createTextVNode(toDisplayString(unref(profitMarginChange) > 0 ? "+" : "") + toDisplayString(unref(profitMarginChange).toFixed(1)) + " pts ", 1)
                                ]),
                                _: 1
                              }, 8, ["color"])) : createCommentVNode("", true)
                            ]),
                            createVNode("p", { class: "text-xs text-muted" }, " Change period-over-period ")
                          ])
                        ]))
                      ]),
                      _: 1
                    }),
                    !unref(pnlPending) && !unref(pnlError) ? (openBlock(), createBlock(Fragment, { key: 0 }, [
                      (unref(pnl)?.periods?.length || 0) > 1 ? (openBlock(), createBlock(_component_ProfitTrendChart, {
                        key: 0,
                        periods: unref(pnl)?.periods || []
                      }, null, 8, ["periods"])) : (openBlock(), createBlock(_component_UPageCard, {
                        key: 1,
                        variant: "subtle"
                      }, {
                        default: withCtx(() => [
                          createVNode("p", { class: "text-sm text-muted" }, " More than one reporting period is needed to show the profit trend. ")
                        ]),
                        _: 1
                      })),
                      (unref(pnl)?.expensesByCategory?.length || 0) > 0 ? (openBlock(), createBlock(_component_ExpenseBreakdownChart, {
                        key: 2,
                        items: unref(pnl)?.expensesByCategory || []
                      }, null, 8, ["items"])) : (openBlock(), createBlock(_component_UPageCard, {
                        key: 3,
                        variant: "subtle"
                      }, {
                        default: withCtx(() => [
                          createVNode("p", { class: "text-sm text-muted" }, " Expense categories will appear once Xero returns a detailed breakdown. ")
                        ]),
                        _: 1
                      }))
                    ], 64)) : createCommentVNode("", true),
                    createVNode(_component_UPageCard, {
                      title: "Balance Sheet",
                      variant: "subtle",
                      class: "md:col-span-2"
                    }, {
                      default: withCtx(() => [
                        unref(bsPending) ? (openBlock(), createBlock("div", {
                          key: 0,
                          class: "space-y-3"
                        }, [
                          createVNode(_component_USkeleton, { class: "h-4 w-32" }),
                          (openBlock(), createBlock(Fragment, null, renderList(3, (n) => {
                            return createVNode(_component_USkeleton, {
                              key: n,
                              class: "h-4 w-full"
                            });
                          }), 64))
                        ])) : unref(bsError) ? (openBlock(), createBlock("div", {
                          key: 1,
                          class: "text-sm text-negative"
                        }, " Failed to load Balance Sheet data. ")) : (openBlock(), createBlock("div", { key: 2 }, [
                          createVNode("div", { class: "grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6" }, [
                            createVNode("div", null, [
                              createVNode("p", { class: "text-xs text-muted uppercase mb-1" }, " Total Assets "),
                              createVNode("p", { class: "text-xl font-semibold" }, toDisplayString(formatCurrency(unref(bs)?.totalAssets)), 1)
                            ]),
                            createVNode("div", null, [
                              createVNode("p", { class: "text-xs text-muted uppercase mb-1" }, " Total Liabilities "),
                              createVNode("p", { class: "text-xl font-semibold" }, toDisplayString(formatCurrency(unref(bs)?.totalLiabilities)), 1)
                            ]),
                            createVNode("div", null, [
                              createVNode("p", { class: "text-xs text-muted uppercase mb-1" }, " Total Equity "),
                              createVNode("p", { class: "text-xl font-semibold" }, toDisplayString(formatCurrency(unref(bs)?.totalEquity)), 1)
                            ])
                          ]),
                          createVNode("div", { class: "grid grid-cols-1 sm:grid-cols-3 gap-4" }, [
                            createVNode("div", { class: "rounded-lg border border-border/60 p-4" }, [
                              createVNode("p", { class: "text-xs text-muted uppercase mb-1" }, " Working Capital "),
                              createVNode("p", { class: "text-lg font-semibold" }, toDisplayString(formatCurrency(unref(bs)?.workingCapital)), 1),
                              createVNode("p", { class: "text-xs text-muted" }, " Liquidity to cover short-term obligations ")
                            ]),
                            createVNode("div", { class: "rounded-lg border border-border/60 p-4" }, [
                              createVNode("p", { class: "text-xs text-muted uppercase mb-1" }, " Debt-to-Equity "),
                              createVNode("p", { class: "text-lg font-semibold" }, toDisplayString(formatMultiple(unref(bs)?.debtToEquity)), 1),
                              createVNode("p", { class: "text-xs text-muted" }, " Leverage compared to shareholder equity ")
                            ]),
                            createVNode("div", { class: "rounded-lg border border-border/60 p-4" }, [
                              createVNode("p", { class: "text-xs text-muted uppercase mb-1" }, " Equity Ratio "),
                              createVNode("p", { class: "text-lg font-semibold" }, toDisplayString(formatPercent((unref(bs)?.equityRatio || 0) * 100)), 1),
                              createVNode("p", { class: "text-xs text-muted" }, " Share of assets financed by equity ")
                            ])
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
                description: "Visualize profit trends and balance sheet health"
              }),
              createVNode(_component_UPageGrid, { class: "gap-4 sm:gap-6" }, {
                default: withCtx(() => [
                  createVNode(_component_UPageCard, {
                    title: "Profit & Loss Snapshot",
                    variant: "subtle"
                  }, {
                    default: withCtx(() => [
                      unref(pnlPending) ? (openBlock(), createBlock("div", {
                        key: 0,
                        class: "space-y-3"
                      }, [
                        createVNode(_component_USkeleton, { class: "h-4 w-32" }),
                        (openBlock(), createBlock(Fragment, null, renderList(3, (n) => {
                          return createVNode(_component_USkeleton, {
                            key: n,
                            class: "h-4 w-full"
                          });
                        }), 64))
                      ])) : unref(pnlError) ? (openBlock(), createBlock("div", {
                        key: 1,
                        class: "text-sm text-negative"
                      }, " Failed to load Profit & Loss data. ")) : (openBlock(), createBlock("div", {
                        key: 2,
                        class: "grid grid-cols-2 md:grid-cols-4 gap-4"
                      }, [
                        createVNode("div", null, [
                          createVNode("p", { class: "text-xs text-muted uppercase mb-1" }, " Revenue "),
                          createVNode("p", { class: "text-xl font-semibold" }, toDisplayString(formatCurrency(unref(pnl)?.revenueTotal)), 1),
                          createVNode("p", { class: "text-xs text-muted" }, toDisplayString(unref(latestPeriod)?.label || "Current period"), 1)
                        ]),
                        createVNode("div", null, [
                          createVNode("p", { class: "text-xs text-muted uppercase mb-1" }, " Expenses "),
                          createVNode("p", { class: "text-xl font-semibold" }, toDisplayString(formatCurrency(unref(pnl)?.expensesTotal)), 1),
                          createVNode("p", { class: "text-xs text-muted" }, " Including operating costs & overhead ")
                        ]),
                        createVNode("div", null, [
                          createVNode("p", { class: "text-xs text-muted uppercase mb-1" }, " Net Profit "),
                          createVNode("div", { class: "flex items-baseline gap-2" }, [
                            createVNode("p", { class: "text-xl font-semibold" }, toDisplayString(formatCurrency(unref(pnl)?.netProfit)), 1),
                            unref(netProfitChange) !== null ? (openBlock(), createBlock(_component_UBadge, {
                              key: 0,
                              color: trendBadgeColor(unref(netProfitChange))
                            }, {
                              default: withCtx(() => [
                                createTextVNode(toDisplayString(unref(netProfitChange) > 0 ? "+" : "") + toDisplayString(formatCurrency(unref(netProfitChange))) + " vs previous ", 1)
                              ]),
                              _: 1
                            }, 8, ["color"])) : createCommentVNode("", true)
                          ]),
                          createVNode("p", { class: "text-xs text-muted" }, toDisplayString(unref(previousPeriod)?.label || "No prior period"), 1)
                        ]),
                        createVNode("div", null, [
                          createVNode("p", { class: "text-xs text-muted uppercase mb-1" }, " Profit Margin "),
                          createVNode("div", { class: "flex items-baseline gap-2" }, [
                            createVNode("p", { class: "text-xl font-semibold" }, toDisplayString(formatPercent((unref(pnl)?.profitMargin || 0) * 100)), 1),
                            unref(profitMarginChange) !== null ? (openBlock(), createBlock(_component_UBadge, {
                              key: 0,
                              color: trendBadgeColor(unref(profitMarginChange))
                            }, {
                              default: withCtx(() => [
                                createTextVNode(toDisplayString(unref(profitMarginChange) > 0 ? "+" : "") + toDisplayString(unref(profitMarginChange).toFixed(1)) + " pts ", 1)
                              ]),
                              _: 1
                            }, 8, ["color"])) : createCommentVNode("", true)
                          ]),
                          createVNode("p", { class: "text-xs text-muted" }, " Change period-over-period ")
                        ])
                      ]))
                    ]),
                    _: 1
                  }),
                  !unref(pnlPending) && !unref(pnlError) ? (openBlock(), createBlock(Fragment, { key: 0 }, [
                    (unref(pnl)?.periods?.length || 0) > 1 ? (openBlock(), createBlock(_component_ProfitTrendChart, {
                      key: 0,
                      periods: unref(pnl)?.periods || []
                    }, null, 8, ["periods"])) : (openBlock(), createBlock(_component_UPageCard, {
                      key: 1,
                      variant: "subtle"
                    }, {
                      default: withCtx(() => [
                        createVNode("p", { class: "text-sm text-muted" }, " More than one reporting period is needed to show the profit trend. ")
                      ]),
                      _: 1
                    })),
                    (unref(pnl)?.expensesByCategory?.length || 0) > 0 ? (openBlock(), createBlock(_component_ExpenseBreakdownChart, {
                      key: 2,
                      items: unref(pnl)?.expensesByCategory || []
                    }, null, 8, ["items"])) : (openBlock(), createBlock(_component_UPageCard, {
                      key: 3,
                      variant: "subtle"
                    }, {
                      default: withCtx(() => [
                        createVNode("p", { class: "text-sm text-muted" }, " Expense categories will appear once Xero returns a detailed breakdown. ")
                      ]),
                      _: 1
                    }))
                  ], 64)) : createCommentVNode("", true),
                  createVNode(_component_UPageCard, {
                    title: "Balance Sheet",
                    variant: "subtle",
                    class: "md:col-span-2"
                  }, {
                    default: withCtx(() => [
                      unref(bsPending) ? (openBlock(), createBlock("div", {
                        key: 0,
                        class: "space-y-3"
                      }, [
                        createVNode(_component_USkeleton, { class: "h-4 w-32" }),
                        (openBlock(), createBlock(Fragment, null, renderList(3, (n) => {
                          return createVNode(_component_USkeleton, {
                            key: n,
                            class: "h-4 w-full"
                          });
                        }), 64))
                      ])) : unref(bsError) ? (openBlock(), createBlock("div", {
                        key: 1,
                        class: "text-sm text-negative"
                      }, " Failed to load Balance Sheet data. ")) : (openBlock(), createBlock("div", { key: 2 }, [
                        createVNode("div", { class: "grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6" }, [
                          createVNode("div", null, [
                            createVNode("p", { class: "text-xs text-muted uppercase mb-1" }, " Total Assets "),
                            createVNode("p", { class: "text-xl font-semibold" }, toDisplayString(formatCurrency(unref(bs)?.totalAssets)), 1)
                          ]),
                          createVNode("div", null, [
                            createVNode("p", { class: "text-xs text-muted uppercase mb-1" }, " Total Liabilities "),
                            createVNode("p", { class: "text-xl font-semibold" }, toDisplayString(formatCurrency(unref(bs)?.totalLiabilities)), 1)
                          ]),
                          createVNode("div", null, [
                            createVNode("p", { class: "text-xs text-muted uppercase mb-1" }, " Total Equity "),
                            createVNode("p", { class: "text-xl font-semibold" }, toDisplayString(formatCurrency(unref(bs)?.totalEquity)), 1)
                          ])
                        ]),
                        createVNode("div", { class: "grid grid-cols-1 sm:grid-cols-3 gap-4" }, [
                          createVNode("div", { class: "rounded-lg border border-border/60 p-4" }, [
                            createVNode("p", { class: "text-xs text-muted uppercase mb-1" }, " Working Capital "),
                            createVNode("p", { class: "text-lg font-semibold" }, toDisplayString(formatCurrency(unref(bs)?.workingCapital)), 1),
                            createVNode("p", { class: "text-xs text-muted" }, " Liquidity to cover short-term obligations ")
                          ]),
                          createVNode("div", { class: "rounded-lg border border-border/60 p-4" }, [
                            createVNode("p", { class: "text-xs text-muted uppercase mb-1" }, " Debt-to-Equity "),
                            createVNode("p", { class: "text-lg font-semibold" }, toDisplayString(formatMultiple(unref(bs)?.debtToEquity)), 1),
                            createVNode("p", { class: "text-xs text-muted" }, " Leverage compared to shareholder equity ")
                          ]),
                          createVNode("div", { class: "rounded-lg border border-border/60 p-4" }, [
                            createVNode("p", { class: "text-xs text-muted uppercase mb-1" }, " Equity Ratio "),
                            createVNode("p", { class: "text-lg font-semibold" }, toDisplayString(formatPercent((unref(bs)?.equityRatio || 0) * 100)), 1),
                            createVNode("p", { class: "text-xs text-muted" }, " Share of assets financed by equity ")
                          ])
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
//# sourceMappingURL=index-QJCb6l5k.mjs.map
