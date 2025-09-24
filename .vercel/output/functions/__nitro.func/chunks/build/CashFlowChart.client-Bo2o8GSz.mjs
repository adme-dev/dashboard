import { _ as _sfc_main$1 } from './Card-jqGRZ5Ik.mjs';
import { _ as _sfc_main$2 } from './Skeleton-p2Vkb_Gp.mjs';
import { _ as _sfc_main$3 } from './Alert-CLlAchtu.mjs';
import { f as __nuxt_component_2$1, _ as _sfc_main$e } from './server.mjs';
import { defineComponent, computed, mergeProps, withCtx, unref, createVNode, createBlock, openBlock, createCommentVNode, Fragment, renderList, toDisplayString, useSSRContext } from 'vue';
import { ssrRenderComponent, ssrRenderList, ssrInterpolate, ssrRenderClass } from 'vue/server-renderer';
import { _ as _export_sfc } from './_plugin-vue_export-helper-1tPrXgE0.mjs';
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

const chartWidth = 680;
const chartHeight = 280;
const innerHeight = 240;
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "CashFlowChart.client",
  __ssrInlineRender: true,
  props: {
    data: {},
    loading: { type: Boolean }
  },
  setup(__props) {
    const props = __props;
    const chartData = computed(() => {
      const source = props.data?.forecast?.length ? props.data.forecast : props.data?.dailyForecast?.length ? props.data.dailyForecast : [];
      if (!source.length) return [];
      return source.map((item, index) => ({
        ...item,
        index,
        dateFormatted: new Date(item.date).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric"
        }),
        isShortfall: item.balance < 0,
        isWarning: item.balance < 1e4 && item.balance > 0
      }));
    });
    const formatCurrency = (value) => {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0
      }).format(value);
    };
    const maxIndex = computed(() => Math.max(1, chartData.value.length - 1));
    const chartBounds = computed(() => {
      if (!chartData.value.length) return { min: 0, max: 1 };
      const balances = chartData.value.map((point) => point.balance);
      const max = Math.max(...balances, 0);
      const min = Math.min(...balances, 0);
      if (max === min) {
        const padding = max === 0 ? 1 : Math.abs(max) * 0.1 || 1;
        return { min: min - padding, max: max + padding };
      }
      return { min, max };
    });
    const yScale = (value) => {
      const { min, max } = chartBounds.value;
      const range = max - min || 1;
      return chartHeight - (value - min) / range * innerHeight;
    };
    const zeroLineY = computed(() => yScale(0));
    const areaPath = computed(() => {
      if (chartData.value.length === 0) return "";
      const baseY = yScale(Math.min(chartBounds.value.min, 0));
      const segments = chartData.value.map((d, i) => `L${i / maxIndex.value * chartWidth},${yScale(d.balance)}`);
      return `M0,${baseY} ${segments.join(" ")} L${chartWidth},${baseY} Z`;
    });
    const yLabels = computed(() => {
      const { min, max } = chartBounds.value;
      return {
        top: max,
        mid: max - (max - min) / 2,
        bottom: min
      };
    });
    const insights = computed(() => {
      if (!props.data || !chartData.value.length) return [];
      const insights2 = [];
      if (props.data.shortfallDates.length > 0) {
        insights2.push({
          type: "critical",
          icon: "i-lucide-alert-triangle",
          message: `Cash shortfall predicted in ${props.data.shortfallDates.length} period${props.data.shortfallDates.length > 1 ? "s" : ""}`
        });
      }
      if (props.data.projectedEndBalance < props.data.currentCash * 0.5) {
        insights2.push({
          type: "warning",
          icon: "i-lucide-trending-down",
          message: "Cash position expected to decline significantly"
        });
      }
      if (props.data.minProjectedBalance < 5e3) {
        insights2.push({
          type: "warning",
          icon: "i-lucide-alert-circle",
          message: "Minimum projected balance below safety threshold"
        });
      }
      return insights2;
    });
    return (_ctx, _push, _parent, _attrs) => {
      const _component_UCard = _sfc_main$1;
      const _component_USkeleton = _sfc_main$2;
      const _component_UAlert = _sfc_main$3;
      const _component_ClientOnly = __nuxt_component_2$1;
      const _component_UIcon = _sfc_main$e;
      _push(ssrRenderComponent(_component_UCard, mergeProps({ class: "h-full" }, _attrs), {
        header: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            _push2(`<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" data-v-5a183785${_scopeId}><div data-v-5a183785${_scopeId}><h3 class="text-lg font-semibold" data-v-5a183785${_scopeId}>Cash Flow Forecast</h3><p class="text-sm text-muted" data-v-5a183785${_scopeId}>${ssrInterpolate(_ctx.data ? `${_ctx.data.forecastPeriod}-day projection` : "Loading forecast...")}</p></div>`);
            if (!_ctx.loading && _ctx.data) {
              _push2(`<div class="flex flex-col items-start sm:items-end gap-0.5" data-v-5a183785${_scopeId}><span class="text-xs uppercase tracking-wide text-muted" data-v-5a183785${_scopeId}>Projected End Balance</span><span class="${ssrRenderClass([{
                "text-red-600": _ctx.data.projectedEndBalance < 0,
                "text-amber-600": _ctx.data.projectedEndBalance > 0 && _ctx.data.projectedEndBalance < 1e4,
                "text-emerald-600": _ctx.data.projectedEndBalance >= 1e4
              }, "text-xl font-semibold"])}" data-v-5a183785${_scopeId}>${ssrInterpolate(formatCurrency(_ctx.data.projectedEndBalance))}</span></div>`);
            } else {
              _push2(`<!---->`);
            }
            _push2(`</div>`);
          } else {
            return [
              createVNode("div", { class: "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" }, [
                createVNode("div", null, [
                  createVNode("h3", { class: "text-lg font-semibold" }, "Cash Flow Forecast"),
                  createVNode("p", { class: "text-sm text-muted" }, toDisplayString(_ctx.data ? `${_ctx.data.forecastPeriod}-day projection` : "Loading forecast..."), 1)
                ]),
                !_ctx.loading && _ctx.data ? (openBlock(), createBlock("div", {
                  key: 0,
                  class: "flex flex-col items-start sm:items-end gap-0.5"
                }, [
                  createVNode("span", { class: "text-xs uppercase tracking-wide text-muted" }, "Projected End Balance"),
                  createVNode("span", {
                    class: [{
                      "text-red-600": _ctx.data.projectedEndBalance < 0,
                      "text-amber-600": _ctx.data.projectedEndBalance > 0 && _ctx.data.projectedEndBalance < 1e4,
                      "text-emerald-600": _ctx.data.projectedEndBalance >= 1e4
                    }, "text-xl font-semibold"]
                  }, toDisplayString(formatCurrency(_ctx.data.projectedEndBalance)), 3)
                ])) : createCommentVNode("", true)
              ])
            ];
          }
        }),
        default: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            if (_ctx.loading) {
              _push2(`<div class="flex items-center justify-center h-80" data-v-5a183785${_scopeId}><div class="text-center" data-v-5a183785${_scopeId}>`);
              _push2(ssrRenderComponent(_component_USkeleton, { class: "h-64 w-full mb-4" }, null, _parent2, _scopeId));
              _push2(ssrRenderComponent(_component_USkeleton, { class: "h-4 w-48 mx-auto" }, null, _parent2, _scopeId));
              _push2(`</div></div>`);
            } else if (unref(chartData).length > 0) {
              _push2(`<div class="space-y-6" data-v-5a183785${_scopeId}>`);
              if (unref(insights).length > 0) {
                _push2(`<div class="grid gap-3 sm:grid-cols-2" data-v-5a183785${_scopeId}><!--[-->`);
                ssrRenderList(unref(insights), (insight) => {
                  _push2(ssrRenderComponent(_component_UAlert, {
                    key: insight.message,
                    icon: insight.icon,
                    color: insight.type === "critical" ? "red" : "amber",
                    variant: "subtle",
                    description: insight.message,
                    class: "text-sm"
                  }, null, _parent2, _scopeId));
                });
                _push2(`<!--]--></div>`);
              } else {
                _push2(`<!---->`);
              }
              _push2(`<div class="h-80 w-full" data-v-5a183785${_scopeId}>`);
              _push2(ssrRenderComponent(_component_ClientOnly, null, {
                fallback: withCtx((_2, _push3, _parent3, _scopeId2) => {
                  if (_push3) {
                    _push3(`<div class="flex items-center justify-center h-80" data-v-5a183785${_scopeId2}>`);
                    _push3(ssrRenderComponent(_component_USkeleton, { class: "h-full w-full" }, null, _parent3, _scopeId2));
                    _push3(`</div>`);
                  } else {
                    return [
                      createVNode("div", { class: "flex items-center justify-center h-80" }, [
                        createVNode(_component_USkeleton, { class: "h-full w-full" })
                      ])
                    ];
                  }
                })
              }, _parent2, _scopeId));
              _push2(`</div><div class="flex flex-wrap items-center gap-4 text-xs text-muted" data-v-5a183785${_scopeId}><div class="flex items-center gap-2" data-v-5a183785${_scopeId}><span class="block h-2 w-2 rounded-full bg-blue-500" data-v-5a183785${_scopeId}></span><span data-v-5a183785${_scopeId}>Healthy Balance</span></div><div class="flex items-center gap-2" data-v-5a183785${_scopeId}><span class="block h-2 w-2 rounded-full bg-amber-500" data-v-5a183785${_scopeId}></span><span data-v-5a183785${_scopeId}>Low Balance</span></div><div class="flex items-center gap-2" data-v-5a183785${_scopeId}><span class="block h-2 w-2 rounded-full bg-red-500" data-v-5a183785${_scopeId}></span><span data-v-5a183785${_scopeId}>Critical/Negative</span></div></div></div>`);
            } else {
              _push2(`<div class="flex items-center justify-center h-80" data-v-5a183785${_scopeId}><div class="text-center" data-v-5a183785${_scopeId}>`);
              _push2(ssrRenderComponent(_component_UIcon, {
                name: "i-lucide-trending-up",
                class: "h-12 w-12 text-muted/50 mx-auto mb-4"
              }, null, _parent2, _scopeId));
              _push2(`<p class="text-muted" data-v-5a183785${_scopeId}>No cash flow data available</p><p class="text-sm text-muted/70" data-v-5a183785${_scopeId}>Connect to Xero to see your cash flow forecast</p></div></div>`);
            }
          } else {
            return [
              _ctx.loading ? (openBlock(), createBlock("div", {
                key: 0,
                class: "flex items-center justify-center h-80"
              }, [
                createVNode("div", { class: "text-center" }, [
                  createVNode(_component_USkeleton, { class: "h-64 w-full mb-4" }),
                  createVNode(_component_USkeleton, { class: "h-4 w-48 mx-auto" })
                ])
              ])) : unref(chartData).length > 0 ? (openBlock(), createBlock("div", {
                key: 1,
                class: "space-y-6"
              }, [
                unref(insights).length > 0 ? (openBlock(), createBlock("div", {
                  key: 0,
                  class: "grid gap-3 sm:grid-cols-2"
                }, [
                  (openBlock(true), createBlock(Fragment, null, renderList(unref(insights), (insight) => {
                    return openBlock(), createBlock(_component_UAlert, {
                      key: insight.message,
                      icon: insight.icon,
                      color: insight.type === "critical" ? "red" : "amber",
                      variant: "subtle",
                      description: insight.message,
                      class: "text-sm"
                    }, null, 8, ["icon", "color", "description"]);
                  }), 128))
                ])) : createCommentVNode("", true),
                createVNode("div", { class: "h-80 w-full" }, [
                  createVNode(_component_ClientOnly, null, {
                    fallback: withCtx(() => [
                      createVNode("div", { class: "flex items-center justify-center h-80" }, [
                        createVNode(_component_USkeleton, { class: "h-full w-full" })
                      ])
                    ]),
                    default: withCtx(() => [
                      createVNode("div", { class: "w-full h-80 flex items-center justify-center" }, [
                        (openBlock(), createBlock("svg", {
                          width: "100%",
                          height: "100%",
                          viewBox: "0 0 800 320",
                          class: "border border-gray-200 dark:border-gray-700 rounded-xl bg-white/60 dark:bg-gray-900/40"
                        }, [
                          createVNode("defs", null, [
                            createVNode("pattern", {
                              id: "cashflow-grid",
                              width: "80",
                              height: "32",
                              patternUnits: "userSpaceOnUse"
                            }, [
                              createVNode("path", {
                                d: "M 80 0 L 0 0 0 32",
                                fill: "none",
                                stroke: "#e5e7eb",
                                "stroke-width": "1",
                                opacity: "0.3"
                              })
                            ])
                          ]),
                          createVNode("rect", {
                            width: "100%",
                            height: "100%",
                            fill: "url(#cashflow-grid)"
                          }),
                          unref(chartData).length > 0 ? (openBlock(), createBlock("g", {
                            key: 0,
                            transform: "translate(60, 20)"
                          }, [
                            createVNode("path", {
                              d: unref(areaPath),
                              fill: unref(chartData).some((d) => d.balance < 0) ? "rgba(239, 68, 68, 0.1)" : "rgba(59, 130, 246, 0.1)",
                              class: "transition-all duration-300"
                            }, null, 8, ["d", "fill"]),
                            createVNode("polyline", {
                              points: unref(chartData).map((d, i) => `${i / unref(maxIndex) * chartWidth},${yScale(d.balance)}`).join(" "),
                              fill: "none",
                              stroke: unref(chartData).some((d) => d.balance < 0) ? "#ef4444" : "#3b82f6",
                              "stroke-width": "3",
                              class: "transition-all duration-300"
                            }, null, 8, ["points", "stroke"]),
                            createVNode("line", {
                              x1: "0",
                              y1: unref(zeroLineY),
                              x2: chartWidth,
                              y2: unref(zeroLineY),
                              stroke: "#6b7280",
                              "stroke-width": "1",
                              "stroke-dasharray": "4,4",
                              opacity: "0.5"
                            }, null, 8, ["y1", "y2"]),
                            createVNode("g", null, [
                              (openBlock(true), createBlock(Fragment, null, renderList(unref(chartData), (point, index) => {
                                return openBlock(), createBlock("circle", {
                                  key: index,
                                  cx: index / unref(maxIndex) * chartWidth,
                                  cy: yScale(point.balance),
                                  r: "4",
                                  fill: point.balance < 0 ? "#ef4444" : point.balance < 1e4 ? "#f59e0b" : "#3b82f6",
                                  stroke: "white",
                                  "stroke-width": "2",
                                  class: "cursor-pointer hover:r-6 transition-all",
                                  title: `${point.dateFormatted}: ${formatCurrency(point.balance)}`
                                }, null, 8, ["cx", "cy", "fill", "title"]);
                              }), 128))
                            ])
                          ])) : createCommentVNode("", true),
                          createVNode("g", { class: "text-[11px] fill-gray-500 dark:fill-gray-400" }, [
                            createVNode("text", {
                              x: "50",
                              y: "25",
                              "text-anchor": "end"
                            }, toDisplayString(formatCurrency(unref(yLabels).top)), 1),
                            createVNode("text", {
                              x: "50",
                              y: "165",
                              "text-anchor": "end"
                            }, toDisplayString(formatCurrency(unref(yLabels).mid)), 1),
                            createVNode("text", {
                              x: "50",
                              y: "305",
                              "text-anchor": "end"
                            }, toDisplayString(formatCurrency(unref(yLabels).bottom)), 1)
                          ]),
                          createVNode("g", { class: "text-[11px] fill-gray-500 dark:fill-gray-400" }, [
                            unref(chartData).length > 0 ? (openBlock(), createBlock("text", {
                              key: 0,
                              x: "80",
                              y: "315",
                              "text-anchor": "start"
                            }, toDisplayString(unref(chartData)[0]?.dateFormatted), 1)) : createCommentVNode("", true),
                            unref(chartData).length > 1 ? (openBlock(), createBlock("text", {
                              key: 1,
                              x: "720",
                              y: "315",
                              "text-anchor": "end"
                            }, toDisplayString(unref(chartData)[unref(chartData).length - 1]?.dateFormatted), 1)) : createCommentVNode("", true)
                          ])
                        ]))
                      ])
                    ]),
                    _: 1
                  })
                ]),
                createVNode("div", { class: "flex flex-wrap items-center gap-4 text-xs text-muted" }, [
                  createVNode("div", { class: "flex items-center gap-2" }, [
                    createVNode("span", { class: "block h-2 w-2 rounded-full bg-blue-500" }),
                    createVNode("span", null, "Healthy Balance")
                  ]),
                  createVNode("div", { class: "flex items-center gap-2" }, [
                    createVNode("span", { class: "block h-2 w-2 rounded-full bg-amber-500" }),
                    createVNode("span", null, "Low Balance")
                  ]),
                  createVNode("div", { class: "flex items-center gap-2" }, [
                    createVNode("span", { class: "block h-2 w-2 rounded-full bg-red-500" }),
                    createVNode("span", null, "Critical/Negative")
                  ])
                ])
              ])) : (openBlock(), createBlock("div", {
                key: 2,
                class: "flex items-center justify-center h-80"
              }, [
                createVNode("div", { class: "text-center" }, [
                  createVNode(_component_UIcon, {
                    name: "i-lucide-trending-up",
                    class: "h-12 w-12 text-muted/50 mx-auto mb-4"
                  }),
                  createVNode("p", { class: "text-muted" }, "No cash flow data available"),
                  createVNode("p", { class: "text-sm text-muted/70" }, "Connect to Xero to see your cash flow forecast")
                ])
              ]))
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
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("components/dashboard/CashFlowChart.client.vue");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const CashFlowChart = /* @__PURE__ */ Object.assign(_export_sfc(_sfc_main, [["__scopeId", "data-v-5a183785"]]), { __name: "DashboardCashFlowChart" });

export { CashFlowChart as default };
//# sourceMappingURL=CashFlowChart.client-Bo2o8GSz.mjs.map
