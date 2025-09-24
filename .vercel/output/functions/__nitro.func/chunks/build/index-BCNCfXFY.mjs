import { _ as _sfc_main$1$1, a as _sfc_main$8 } from './DashboardNavbar-Dma8e2D0.mjs';
import { _ as _sfc_main$b } from './DashboardSidebarCollapse-Bb0ddWxH.mjs';
import { _ as _sfc_main$a } from './Tooltip-B1rd475P.mjs';
import { e as useFetch, _ as _sfc_main$e, d as _sfc_main$9, f as __nuxt_component_2$1, c as useToast } from './server.mjs';
import { _ as _sfc_main$c } from './DashboardToolbar-C9qyFRVV.mjs';
import { _ as _sfc_main$5 } from './Skeleton-p2Vkb_Gp.mjs';
import { _ as _sfc_main$6 } from './Alert-CLlAchtu.mjs';
import { _ as _sfc_main$7 } from './Card-jqGRZ5Ik.mjs';
import { defineComponent, withAsyncContext, computed, ref, resolveComponent, mergeProps, withCtx, unref, createVNode, toDisplayString, createBlock, createCommentVNode, openBlock, createTextVNode, Fragment, renderList, isRef, watch, useModel, useSSRContext } from 'vue';
import { ssrRenderComponent, ssrRenderList, ssrInterpolate, ssrRenderClass, ssrRenderStyle } from 'vue/server-renderer';
import CashFlowChart from './CashFlowChart.client-Bo2o8GSz.mjs';
import { _ as _export_sfc } from './_plugin-vue_export-helper-1tPrXgE0.mjs';
import { _ as _sfc_main$d } from './Badge-BfrefdmG.mjs';
import { _ as _sfc_main$f } from './Modal-Dnvi62H3.mjs';
import { _ as _sfc_main$g } from './SelectMenu-BG51Bku2.mjs';
import { _ as _sfc_main$h } from './Checkbox-wFRNthBN.mjs';
import { u as useDashboard } from './useDashboard-DTZ5yh-t.mjs';
import './DashboardSidebarToggle-NWn7wtB9.mjs';
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
import 'reka-ui';
import './Kbd-8hyXBZ7D.mjs';
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
import './Input-Bc3-FTjC.mjs';
import './defineShortcuts-qA-CwxU2.mjs';

const _sfc_main$4 = /* @__PURE__ */ defineComponent({
  __name: "WaterfallChart.client",
  __ssrInlineRender: true,
  props: {
    data: {},
    loading: { type: Boolean }
  },
  setup(__props) {
    const props = __props;
    const chartData = computed(() => {
      if (!props.data) return [];
      const data = [];
      let cumulative = 0;
      data.push({
        category: "Starting Cash",
        value: props.data.startingBalance,
        cumulative: props.data.startingBalance,
        type: "start",
        color: "#6b7280"
      });
      cumulative = props.data.startingBalance;
      props.data.inflows.forEach((inflow) => {
        data.push({
          category: inflow.category,
          value: inflow.amount,
          cumulative: cumulative + inflow.amount,
          type: "increase",
          color: "#10b981"
        });
        cumulative += inflow.amount;
      });
      props.data.outflows.forEach((outflow) => {
        data.push({
          category: outflow.category,
          value: -outflow.amount,
          cumulative: cumulative - outflow.amount,
          type: "decrease",
          color: "#ef4444"
        });
        cumulative -= outflow.amount;
      });
      data.push({
        category: "Ending Cash",
        value: props.data.endingBalance,
        cumulative: props.data.endingBalance,
        type: "end",
        color: cumulative > props.data.startingBalance ? "#10b981" : cumulative < props.data.startingBalance ? "#ef4444" : "#6b7280"
      });
      return data;
    });
    const formatCurrency = (value) => {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0
      }).format(Math.abs(value));
    };
    return (_ctx, _push, _parent, _attrs) => {
      const _component_UCard = _sfc_main$7;
      const _component_USkeleton = _sfc_main$5;
      const _component_ClientOnly = __nuxt_component_2$1;
      const _component_UIcon = _sfc_main$e;
      _push(ssrRenderComponent(_component_UCard, mergeProps({ class: "h-full" }, _attrs), {
        header: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            _push2(`<div class="flex items-center justify-between" data-v-20da611f${_scopeId}><div data-v-20da611f${_scopeId}><h3 class="text-lg font-semibold" data-v-20da611f${_scopeId}>Cash Flow Waterfall</h3><p class="text-sm text-muted" data-v-20da611f${_scopeId}> Visual breakdown of cash flow components </p></div></div>`);
          } else {
            return [
              createVNode("div", { class: "flex items-center justify-between" }, [
                createVNode("div", null, [
                  createVNode("h3", { class: "text-lg font-semibold" }, "Cash Flow Waterfall"),
                  createVNode("p", { class: "text-sm text-muted" }, " Visual breakdown of cash flow components ")
                ])
              ])
            ];
          }
        }),
        default: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            if (_ctx.loading) {
              _push2(`<div class="flex items-center justify-center h-96" data-v-20da611f${_scopeId}><div class="text-center" data-v-20da611f${_scopeId}>`);
              _push2(ssrRenderComponent(_component_USkeleton, { class: "h-80 w-full mb-4" }, null, _parent2, _scopeId));
              _push2(ssrRenderComponent(_component_USkeleton, { class: "h-4 w-48 mx-auto" }, null, _parent2, _scopeId));
              _push2(`</div></div>`);
            } else if (unref(chartData).length > 0) {
              _push2(`<div class="space-y-4" data-v-20da611f${_scopeId}><div class="h-96 w-full" data-v-20da611f${_scopeId}>`);
              _push2(ssrRenderComponent(_component_ClientOnly, null, {
                fallback: withCtx((_2, _push3, _parent3, _scopeId2) => {
                  if (_push3) {
                    _push3(`<div class="flex items-center justify-center h-96" data-v-20da611f${_scopeId2}>`);
                    _push3(ssrRenderComponent(_component_USkeleton, { class: "h-full w-full" }, null, _parent3, _scopeId2));
                    _push3(`</div>`);
                  } else {
                    return [
                      createVNode("div", { class: "flex items-center justify-center h-96" }, [
                        createVNode(_component_USkeleton, { class: "h-full w-full" })
                      ])
                    ];
                  }
                })
              }, _parent2, _scopeId));
              _push2(`</div><div class="flex items-center justify-center gap-6 text-sm" data-v-20da611f${_scopeId}><div class="flex items-center gap-2" data-v-20da611f${_scopeId}><div class="w-3 h-3 bg-emerald-500 rounded-full" data-v-20da611f${_scopeId}></div><span class="text-muted" data-v-20da611f${_scopeId}>Inflows</span></div><div class="flex items-center gap-2" data-v-20da611f${_scopeId}><div class="w-3 h-3 bg-red-500 rounded-full" data-v-20da611f${_scopeId}></div><span class="text-muted" data-v-20da611f${_scopeId}>Outflows</span></div><div class="flex items-center gap-2" data-v-20da611f${_scopeId}><div class="w-3 h-3 bg-gray-500 rounded-full" data-v-20da611f${_scopeId}></div><span class="text-muted" data-v-20da611f${_scopeId}>Balance</span></div></div><div class="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-gray-200 dark:border-gray-800" data-v-20da611f${_scopeId}><div class="text-center" data-v-20da611f${_scopeId}><p class="text-sm text-muted" data-v-20da611f${_scopeId}>Total Inflows</p><p class="text-lg font-semibold text-emerald-600" data-v-20da611f${_scopeId}>${ssrInterpolate(formatCurrency(_ctx.data?.inflows.reduce((sum, item) => sum + item.amount, 0) || 0))}</p></div><div class="text-center" data-v-20da611f${_scopeId}><p class="text-sm text-muted" data-v-20da611f${_scopeId}>Total Outflows</p><p class="text-lg font-semibold text-red-600" data-v-20da611f${_scopeId}>${ssrInterpolate(formatCurrency(_ctx.data?.outflows.reduce((sum, item) => sum + item.amount, 0) || 0))}</p></div><div class="text-center" data-v-20da611f${_scopeId}><p class="text-sm text-muted" data-v-20da611f${_scopeId}>Net Change</p><p class="${ssrRenderClass([{
                "text-emerald-600": (_ctx.data?.endingBalance || 0) > (_ctx.data?.startingBalance || 0),
                "text-red-600": (_ctx.data?.endingBalance || 0) < (_ctx.data?.startingBalance || 0),
                "text-gray-600": (_ctx.data?.endingBalance || 0) === (_ctx.data?.startingBalance || 0)
              }, "text-lg font-semibold"])}" data-v-20da611f${_scopeId}>${ssrInterpolate(formatCurrency((_ctx.data?.endingBalance || 0) - (_ctx.data?.startingBalance || 0)))}</p></div></div></div>`);
            } else {
              _push2(`<div class="flex items-center justify-center h-96" data-v-20da611f${_scopeId}><div class="text-center" data-v-20da611f${_scopeId}>`);
              _push2(ssrRenderComponent(_component_UIcon, {
                name: "i-lucide-bar-chart-3",
                class: "h-12 w-12 text-muted/50 mx-auto mb-4"
              }, null, _parent2, _scopeId));
              _push2(`<p class="text-muted" data-v-20da611f${_scopeId}>No cash flow data available</p><p class="text-sm text-muted/70" data-v-20da611f${_scopeId}>Connect to Xero to see your cash flow breakdown</p></div></div>`);
            }
          } else {
            return [
              _ctx.loading ? (openBlock(), createBlock("div", {
                key: 0,
                class: "flex items-center justify-center h-96"
              }, [
                createVNode("div", { class: "text-center" }, [
                  createVNode(_component_USkeleton, { class: "h-80 w-full mb-4" }),
                  createVNode(_component_USkeleton, { class: "h-4 w-48 mx-auto" })
                ])
              ])) : unref(chartData).length > 0 ? (openBlock(), createBlock("div", {
                key: 1,
                class: "space-y-4"
              }, [
                createVNode("div", { class: "h-96 w-full" }, [
                  createVNode(_component_ClientOnly, null, {
                    fallback: withCtx(() => [
                      createVNode("div", { class: "flex items-center justify-center h-96" }, [
                        createVNode(_component_USkeleton, { class: "h-full w-full" })
                      ])
                    ]),
                    default: withCtx(() => [
                      createVNode("div", { class: "w-full h-96 flex items-center justify-center" }, [
                        createVNode("div", { class: "w-full h-80 flex items-end justify-center gap-2 px-4" }, [
                          (openBlock(true), createBlock(Fragment, null, renderList(unref(chartData), (item, index) => {
                            return openBlock(), createBlock("div", {
                              key: index,
                              class: "flex flex-col items-center gap-2",
                              style: { minWidth: `${Math.max(60, 100 / unref(chartData).length)}px` }
                            }, [
                              createVNode("div", { class: "relative flex flex-col items-center" }, [
                                createVNode("div", {
                                  class: ["w-12 rounded-t transition-all duration-300 hover:opacity-80 cursor-pointer", {
                                    "bg-emerald-500": item.type === "increase",
                                    "bg-red-500": item.type === "decrease",
                                    "bg-gray-500": item.type === "start" || item.type === "end"
                                  }],
                                  style: {
                                    height: `${Math.max(20, Math.abs(item.value) / Math.max(...unref(chartData).map((d) => Math.abs(d.value))) * 200)}px`
                                  },
                                  title: `${item.category}: ${formatCurrency(item.value)}`
                                }, null, 14, ["title"]),
                                createVNode("div", { class: "text-xs font-medium mt-1 text-center" }, toDisplayString(formatCurrency(item.value)), 1)
                              ]),
                              createVNode("div", { class: "text-xs text-muted text-center leading-tight max-w-16" }, toDisplayString(item.category.length > 10 ? item.category.substring(0, 10) + "..." : item.category), 1)
                            ], 4);
                          }), 128))
                        ])
                      ])
                    ]),
                    _: 1
                  })
                ]),
                createVNode("div", { class: "flex items-center justify-center gap-6 text-sm" }, [
                  createVNode("div", { class: "flex items-center gap-2" }, [
                    createVNode("div", { class: "w-3 h-3 bg-emerald-500 rounded-full" }),
                    createVNode("span", { class: "text-muted" }, "Inflows")
                  ]),
                  createVNode("div", { class: "flex items-center gap-2" }, [
                    createVNode("div", { class: "w-3 h-3 bg-red-500 rounded-full" }),
                    createVNode("span", { class: "text-muted" }, "Outflows")
                  ]),
                  createVNode("div", { class: "flex items-center gap-2" }, [
                    createVNode("div", { class: "w-3 h-3 bg-gray-500 rounded-full" }),
                    createVNode("span", { class: "text-muted" }, "Balance")
                  ])
                ]),
                createVNode("div", { class: "grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-gray-200 dark:border-gray-800" }, [
                  createVNode("div", { class: "text-center" }, [
                    createVNode("p", { class: "text-sm text-muted" }, "Total Inflows"),
                    createVNode("p", { class: "text-lg font-semibold text-emerald-600" }, toDisplayString(formatCurrency(_ctx.data?.inflows.reduce((sum, item) => sum + item.amount, 0) || 0)), 1)
                  ]),
                  createVNode("div", { class: "text-center" }, [
                    createVNode("p", { class: "text-sm text-muted" }, "Total Outflows"),
                    createVNode("p", { class: "text-lg font-semibold text-red-600" }, toDisplayString(formatCurrency(_ctx.data?.outflows.reduce((sum, item) => sum + item.amount, 0) || 0)), 1)
                  ]),
                  createVNode("div", { class: "text-center" }, [
                    createVNode("p", { class: "text-sm text-muted" }, "Net Change"),
                    createVNode("p", {
                      class: ["text-lg font-semibold", {
                        "text-emerald-600": (_ctx.data?.endingBalance || 0) > (_ctx.data?.startingBalance || 0),
                        "text-red-600": (_ctx.data?.endingBalance || 0) < (_ctx.data?.startingBalance || 0),
                        "text-gray-600": (_ctx.data?.endingBalance || 0) === (_ctx.data?.startingBalance || 0)
                      }]
                    }, toDisplayString(formatCurrency((_ctx.data?.endingBalance || 0) - (_ctx.data?.startingBalance || 0))), 3)
                  ])
                ])
              ])) : (openBlock(), createBlock("div", {
                key: 2,
                class: "flex items-center justify-center h-96"
              }, [
                createVNode("div", { class: "text-center" }, [
                  createVNode(_component_UIcon, {
                    name: "i-lucide-bar-chart-3",
                    class: "h-12 w-12 text-muted/50 mx-auto mb-4"
                  }),
                  createVNode("p", { class: "text-muted" }, "No cash flow data available"),
                  createVNode("p", { class: "text-sm text-muted/70" }, "Connect to Xero to see your cash flow breakdown")
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
const _sfc_setup$4 = _sfc_main$4.setup;
_sfc_main$4.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("components/cashflow/WaterfallChart.client.vue");
  return _sfc_setup$4 ? _sfc_setup$4(props, ctx) : void 0;
};
const WaterfallChart = /* @__PURE__ */ Object.assign(_export_sfc(_sfc_main$4, [["__scopeId", "data-v-20da611f"]]), { __name: "CashflowWaterfallChart" });
const bestCaseColor = "#10b981";
const likelyCaseColor = "#3b82f6";
const worstCaseColor = "#ef4444";
const chartWidth = 760;
const chartHeight = 280;
const _sfc_main$3 = /* @__PURE__ */ defineComponent({
  __name: "ScenarioAnalysis.client",
  __ssrInlineRender: true,
  props: {
    data: {},
    loading: { type: Boolean }
  },
  setup(__props) {
    const props = __props;
    const selectedScenario = ref("all");
    const toNumber = (value, fallback = 0) => {
      if (typeof value === "number" && !Number.isNaN(value)) return value;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    };
    const chartData = computed(() => {
      if (!props.data?.scenarios) return [];
      const combined = props.data.scenarios.combined || [];
      if (combined.length) {
        return combined.map((item, index) => ({
          date: item.date,
          index,
          dateFormatted: new Date(item.date).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric"
          }),
          bestCase: toNumber(item.bestCase ?? item.balance ?? 0),
          likelyCase: toNumber(item.likelyCase ?? item.balance ?? 0),
          worstCase: toNumber(item.worstCase ?? item.balance ?? 0)
        }));
      }
      const likely = props.data.scenarios.likely || [];
      return likely.map((item, index) => {
        const best = props.data?.scenarios.best?.[index];
        const worst = props.data?.scenarios.worst?.[index];
        return {
          date: item.date,
          index,
          dateFormatted: new Date(item.date).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric"
          }),
          bestCase: toNumber(best?.bestCase ?? best?.balance ?? item.likelyCase ?? item.balance ?? 0),
          likelyCase: toNumber(item?.likelyCase ?? item.balance ?? 0),
          worstCase: toNumber(worst?.worstCase ?? worst?.balance ?? item.likelyCase ?? item.balance ?? 0)
        };
      });
    });
    const formatCurrency = (value) => {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0
      }).format(value);
    };
    const scenarios = [
      { key: "all", label: "All Scenarios", color: "gray", icon: "i-lucide-layers" },
      { key: "best", label: "Best Case", color: "emerald", icon: "i-lucide-trending-up" },
      { key: "likely", label: "Most Likely", color: "blue", icon: "i-lucide-target" },
      { key: "worst", label: "Worst Case", color: "red", icon: "i-lucide-trending-down" }
    ];
    const scenarioMetrics = computed(() => {
      if (!props.data) return null;
      const valueFromScenario = (key) => {
        if (chartData.value.length) {
          const accessor = key === "best" ? "bestCase" : key === "likely" ? "likelyCase" : "worstCase";
          return chartData.value.map((item) => item[accessor]);
        }
        const series = props.data.scenarios[key] || [];
        return series.map((entry) => toNumber(entry[`${key}Case`] ?? entry.balance ?? 0));
      };
      const currentCash = toNumber(props.data.currentCash, 0);
      const calculateMetrics = (values) => {
        if (!values.length) {
          return {
            endBalance: 0,
            minBalance: 0,
            maxBalance: 0,
            shortfallDays: 0,
            changePercent: 0
          };
        }
        const endBalance = values[values.length - 1];
        const minBalance = Math.min(...values);
        const maxBalance = Math.max(...values);
        const shortfallDays = values.filter((v) => v < 0).length;
        const base = currentCash !== 0 ? (endBalance - currentCash) / Math.abs(currentCash) * 100 : 0;
        return {
          endBalance,
          minBalance,
          maxBalance,
          shortfallDays,
          changePercent: base
        };
      };
      return {
        best: calculateMetrics(valueFromScenario("best")),
        likely: calculateMetrics(valueFromScenario("likely")),
        worst: calculateMetrics(valueFromScenario("worst"))
      };
    });
    const maxIndex = computed(() => Math.max(1, chartData.value.length - 1));
    const chartBounds = computed(() => {
      if (!chartData.value.length) {
        return { min: 0, max: 1 };
      }
      const values = chartData.value.flatMap((item) => [item.bestCase, item.likelyCase, item.worstCase]);
      const max = Math.max(...values, 0);
      const min = Math.min(...values, 0);
      if (max === min) {
        const padding = max === 0 ? 1 : Math.abs(max) * 0.1 || 1;
        return { min: min - padding, max: max + padding };
      }
      return { min, max };
    });
    const yLabels = computed(() => {
      const { min, max } = chartBounds.value;
      return {
        top: max,
        mid: max - (max - min) / 2,
        bottom: min
      };
    });
    const yPosition = (value) => {
      const { min, max } = chartBounds.value;
      const range = max - min || 1;
      return chartHeight - (value - min) / range * chartHeight;
    };
    return (_ctx, _push, _parent, _attrs) => {
      const _component_UCard = _sfc_main$7;
      const _component_UButton = _sfc_main$9;
      const _component_USkeleton = _sfc_main$5;
      const _component_UIcon = _sfc_main$e;
      const _component_ClientOnly = __nuxt_component_2$1;
      _push(ssrRenderComponent(_component_UCard, mergeProps({ class: "h-full" }, _attrs), {
        header: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            _push2(`<div class="flex items-center justify-between" data-v-6a01d34d${_scopeId}><div data-v-6a01d34d${_scopeId}><h3 class="text-lg font-semibold" data-v-6a01d34d${_scopeId}>Scenario Analysis</h3><p class="text-sm text-muted" data-v-6a01d34d${_scopeId}> Best case, most likely, and worst case projections </p></div><div class="flex gap-1" data-v-6a01d34d${_scopeId}><!--[-->`);
            ssrRenderList(scenarios, (scenario) => {
              _push2(ssrRenderComponent(_component_UButton, {
                key: scenario.key,
                label: scenario.label,
                icon: scenario.icon,
                color: unref(selectedScenario) === scenario.key ? scenario.color : "gray",
                variant: unref(selectedScenario) === scenario.key ? "solid" : "ghost",
                size: "sm",
                onClick: ($event) => selectedScenario.value = scenario.key
              }, null, _parent2, _scopeId));
            });
            _push2(`<!--]--></div></div>`);
          } else {
            return [
              createVNode("div", { class: "flex items-center justify-between" }, [
                createVNode("div", null, [
                  createVNode("h3", { class: "text-lg font-semibold" }, "Scenario Analysis"),
                  createVNode("p", { class: "text-sm text-muted" }, " Best case, most likely, and worst case projections ")
                ]),
                createVNode("div", { class: "flex gap-1" }, [
                  (openBlock(), createBlock(Fragment, null, renderList(scenarios, (scenario) => {
                    return createVNode(_component_UButton, {
                      key: scenario.key,
                      label: scenario.label,
                      icon: scenario.icon,
                      color: unref(selectedScenario) === scenario.key ? scenario.color : "gray",
                      variant: unref(selectedScenario) === scenario.key ? "solid" : "ghost",
                      size: "sm",
                      onClick: ($event) => selectedScenario.value = scenario.key
                    }, null, 8, ["label", "icon", "color", "variant", "onClick"]);
                  }), 64))
                ])
              ])
            ];
          }
        }),
        default: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            if (_ctx.loading) {
              _push2(`<div class="flex items-center justify-center h-96" data-v-6a01d34d${_scopeId}><div class="text-center" data-v-6a01d34d${_scopeId}>`);
              _push2(ssrRenderComponent(_component_USkeleton, { class: "h-80 w-full mb-4" }, null, _parent2, _scopeId));
              _push2(ssrRenderComponent(_component_USkeleton, { class: "h-4 w-48 mx-auto" }, null, _parent2, _scopeId));
              _push2(`</div></div>`);
            } else if (unref(chartData).length > 0) {
              _push2(`<div class="space-y-6" data-v-6a01d34d${_scopeId}>`);
              if (unref(scenarioMetrics)) {
                _push2(`<div class="grid grid-cols-1 md:grid-cols-3 gap-4" data-v-6a01d34d${_scopeId}><div class="p-4 bg-emerald-50 dark:bg-emerald-950/20 rounded-lg" data-v-6a01d34d${_scopeId}><div class="flex items-center gap-2 mb-2" data-v-6a01d34d${_scopeId}>`);
                _push2(ssrRenderComponent(_component_UIcon, {
                  name: "i-lucide-trending-up",
                  class: "h-4 w-4 text-emerald-600"
                }, null, _parent2, _scopeId));
                _push2(`<h4 class="font-medium text-emerald-800 dark:text-emerald-200" data-v-6a01d34d${_scopeId}>Best Case</h4></div><p class="text-lg font-bold text-emerald-800 dark:text-emerald-200" data-v-6a01d34d${_scopeId}>${ssrInterpolate(formatCurrency(unref(scenarioMetrics).best.endBalance))}</p><p class="text-xs text-emerald-600 dark:text-emerald-400" data-v-6a01d34d${_scopeId}>${ssrInterpolate(unref(scenarioMetrics).best.changePercent > 0 ? "+" : "")}${ssrInterpolate(unref(scenarioMetrics).best.changePercent.toFixed(1))}% change </p></div><div class="p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg" data-v-6a01d34d${_scopeId}><div class="flex items-center gap-2 mb-2" data-v-6a01d34d${_scopeId}>`);
                _push2(ssrRenderComponent(_component_UIcon, {
                  name: "i-lucide-target",
                  class: "h-4 w-4 text-blue-600"
                }, null, _parent2, _scopeId));
                _push2(`<h4 class="font-medium text-blue-800 dark:text-blue-200" data-v-6a01d34d${_scopeId}>Most Likely</h4></div><p class="text-lg font-bold text-blue-800 dark:text-blue-200" data-v-6a01d34d${_scopeId}>${ssrInterpolate(formatCurrency(unref(scenarioMetrics).likely.endBalance))}</p><p class="text-xs text-blue-600 dark:text-blue-400" data-v-6a01d34d${_scopeId}>${ssrInterpolate(unref(scenarioMetrics).likely.changePercent > 0 ? "+" : "")}${ssrInterpolate(unref(scenarioMetrics).likely.changePercent.toFixed(1))}% change </p></div><div class="p-4 bg-red-50 dark:bg-red-950/20 rounded-lg" data-v-6a01d34d${_scopeId}><div class="flex items-center gap-2 mb-2" data-v-6a01d34d${_scopeId}>`);
                _push2(ssrRenderComponent(_component_UIcon, {
                  name: "i-lucide-trending-down",
                  class: "h-4 w-4 text-red-600"
                }, null, _parent2, _scopeId));
                _push2(`<h4 class="font-medium text-red-800 dark:text-red-200" data-v-6a01d34d${_scopeId}>Worst Case</h4></div><p class="text-lg font-bold text-red-800 dark:text-red-200" data-v-6a01d34d${_scopeId}>${ssrInterpolate(formatCurrency(unref(scenarioMetrics).worst.endBalance))}</p><p class="text-xs text-red-600 dark:text-red-400" data-v-6a01d34d${_scopeId}>${ssrInterpolate(unref(scenarioMetrics).worst.changePercent > 0 ? "+" : "")}${ssrInterpolate(unref(scenarioMetrics).worst.changePercent.toFixed(1))}% change </p></div></div>`);
              } else {
                _push2(`<!---->`);
              }
              _push2(`<div class="h-80 w-full" data-v-6a01d34d${_scopeId}>`);
              _push2(ssrRenderComponent(_component_ClientOnly, null, {
                fallback: withCtx((_2, _push3, _parent3, _scopeId2) => {
                  if (_push3) {
                    _push3(`<div class="flex items-center justify-center h-80" data-v-6a01d34d${_scopeId2}>`);
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
              _push2(`</div><div class="flex items-center justify-center gap-6 text-sm" data-v-6a01d34d${_scopeId}>`);
              if (unref(selectedScenario) === "all" || unref(selectedScenario) === "best") {
                _push2(`<div class="flex items-center gap-2" data-v-6a01d34d${_scopeId}><div class="w-3 h-3 bg-emerald-500 rounded-full" data-v-6a01d34d${_scopeId}></div><span class="text-muted" data-v-6a01d34d${_scopeId}>Best Case</span></div>`);
              } else {
                _push2(`<!---->`);
              }
              if (unref(selectedScenario) === "all" || unref(selectedScenario) === "likely") {
                _push2(`<div class="flex items-center gap-2" data-v-6a01d34d${_scopeId}><div class="w-3 h-3 bg-blue-500 rounded-full" data-v-6a01d34d${_scopeId}></div><span class="text-muted" data-v-6a01d34d${_scopeId}>Most Likely</span></div>`);
              } else {
                _push2(`<!---->`);
              }
              if (unref(selectedScenario) === "all" || unref(selectedScenario) === "worst") {
                _push2(`<div class="flex items-center gap-2" data-v-6a01d34d${_scopeId}><div class="w-3 h-3 bg-red-500 rounded-full" data-v-6a01d34d${_scopeId}></div><span class="text-muted" data-v-6a01d34d${_scopeId}>Worst Case</span></div>`);
              } else {
                _push2(`<!---->`);
              }
              _push2(`</div>`);
              if (unref(scenarioMetrics)) {
                _push2(`<div class="pt-4 border-t border-gray-200 dark:border-gray-800" data-v-6a01d34d${_scopeId}><h4 class="font-medium text-sm mb-3" data-v-6a01d34d${_scopeId}>Risk Analysis</h4><div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm" data-v-6a01d34d${_scopeId}><div data-v-6a01d34d${_scopeId}><span class="text-muted" data-v-6a01d34d${_scopeId}>Probability of Shortfall:</span><div class="mt-1" data-v-6a01d34d${_scopeId}><span class="${ssrRenderClass([{
                  "text-red-600": unref(scenarioMetrics).worst.shortfallDays > 0,
                  "text-amber-600": unref(scenarioMetrics).likely.shortfallDays > 0,
                  "text-emerald-600": unref(scenarioMetrics).worst.shortfallDays === 0
                }, "font-medium"])}" data-v-6a01d34d${_scopeId}>${ssrInterpolate(unref(scenarioMetrics).worst.shortfallDays > 0 ? "High" : unref(scenarioMetrics).likely.shortfallDays > 0 ? "Medium" : "Low")}</span></div></div><div data-v-6a01d34d${_scopeId}><span class="text-muted" data-v-6a01d34d${_scopeId}>Upside Potential:</span><div class="mt-1" data-v-6a01d34d${_scopeId}><span class="font-medium text-emerald-600" data-v-6a01d34d${_scopeId}>${ssrInterpolate(formatCurrency(unref(scenarioMetrics).best.endBalance - unref(scenarioMetrics).likely.endBalance))}</span></div></div><div data-v-6a01d34d${_scopeId}><span class="text-muted" data-v-6a01d34d${_scopeId}>Downside Risk:</span><div class="mt-1" data-v-6a01d34d${_scopeId}><span class="font-medium text-red-600" data-v-6a01d34d${_scopeId}>${ssrInterpolate(formatCurrency(unref(scenarioMetrics).likely.endBalance - unref(scenarioMetrics).worst.endBalance))}</span></div></div></div></div>`);
              } else {
                _push2(`<!---->`);
              }
              _push2(`</div>`);
            } else {
              _push2(`<div class="flex items-center justify-center h-96" data-v-6a01d34d${_scopeId}><div class="text-center" data-v-6a01d34d${_scopeId}>`);
              _push2(ssrRenderComponent(_component_UIcon, {
                name: "i-lucide-git-branch",
                class: "h-12 w-12 text-muted/50 mx-auto mb-4"
              }, null, _parent2, _scopeId));
              _push2(`<p class="text-muted" data-v-6a01d34d${_scopeId}>No scenario data available</p><p class="text-sm text-muted/70" data-v-6a01d34d${_scopeId}>Connect to Xero to see scenario analysis</p></div></div>`);
            }
          } else {
            return [
              _ctx.loading ? (openBlock(), createBlock("div", {
                key: 0,
                class: "flex items-center justify-center h-96"
              }, [
                createVNode("div", { class: "text-center" }, [
                  createVNode(_component_USkeleton, { class: "h-80 w-full mb-4" }),
                  createVNode(_component_USkeleton, { class: "h-4 w-48 mx-auto" })
                ])
              ])) : unref(chartData).length > 0 ? (openBlock(), createBlock("div", {
                key: 1,
                class: "space-y-6"
              }, [
                unref(scenarioMetrics) ? (openBlock(), createBlock("div", {
                  key: 0,
                  class: "grid grid-cols-1 md:grid-cols-3 gap-4"
                }, [
                  createVNode("div", { class: "p-4 bg-emerald-50 dark:bg-emerald-950/20 rounded-lg" }, [
                    createVNode("div", { class: "flex items-center gap-2 mb-2" }, [
                      createVNode(_component_UIcon, {
                        name: "i-lucide-trending-up",
                        class: "h-4 w-4 text-emerald-600"
                      }),
                      createVNode("h4", { class: "font-medium text-emerald-800 dark:text-emerald-200" }, "Best Case")
                    ]),
                    createVNode("p", { class: "text-lg font-bold text-emerald-800 dark:text-emerald-200" }, toDisplayString(formatCurrency(unref(scenarioMetrics).best.endBalance)), 1),
                    createVNode("p", { class: "text-xs text-emerald-600 dark:text-emerald-400" }, toDisplayString(unref(scenarioMetrics).best.changePercent > 0 ? "+" : "") + toDisplayString(unref(scenarioMetrics).best.changePercent.toFixed(1)) + "% change ", 1)
                  ]),
                  createVNode("div", { class: "p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg" }, [
                    createVNode("div", { class: "flex items-center gap-2 mb-2" }, [
                      createVNode(_component_UIcon, {
                        name: "i-lucide-target",
                        class: "h-4 w-4 text-blue-600"
                      }),
                      createVNode("h4", { class: "font-medium text-blue-800 dark:text-blue-200" }, "Most Likely")
                    ]),
                    createVNode("p", { class: "text-lg font-bold text-blue-800 dark:text-blue-200" }, toDisplayString(formatCurrency(unref(scenarioMetrics).likely.endBalance)), 1),
                    createVNode("p", { class: "text-xs text-blue-600 dark:text-blue-400" }, toDisplayString(unref(scenarioMetrics).likely.changePercent > 0 ? "+" : "") + toDisplayString(unref(scenarioMetrics).likely.changePercent.toFixed(1)) + "% change ", 1)
                  ]),
                  createVNode("div", { class: "p-4 bg-red-50 dark:bg-red-950/20 rounded-lg" }, [
                    createVNode("div", { class: "flex items-center gap-2 mb-2" }, [
                      createVNode(_component_UIcon, {
                        name: "i-lucide-trending-down",
                        class: "h-4 w-4 text-red-600"
                      }),
                      createVNode("h4", { class: "font-medium text-red-800 dark:text-red-200" }, "Worst Case")
                    ]),
                    createVNode("p", { class: "text-lg font-bold text-red-800 dark:text-red-200" }, toDisplayString(formatCurrency(unref(scenarioMetrics).worst.endBalance)), 1),
                    createVNode("p", { class: "text-xs text-red-600 dark:text-red-400" }, toDisplayString(unref(scenarioMetrics).worst.changePercent > 0 ? "+" : "") + toDisplayString(unref(scenarioMetrics).worst.changePercent.toFixed(1)) + "% change ", 1)
                  ])
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
                          viewBox: "0 0 880 320",
                          preserveAspectRatio: "xMidYMid meet",
                          class: "border border-gray-200 dark:border-gray-700 rounded"
                        }, [
                          createVNode("defs", null, [
                            createVNode("pattern", {
                              id: "grid",
                              width: "92",
                              height: "32",
                              patternUnits: "userSpaceOnUse"
                            }, [
                              createVNode("path", {
                                d: "M 92 0 L 0 0 0 32",
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
                            fill: "url(#grid)"
                          }),
                          unref(chartData).length > 0 ? (openBlock(), createBlock("g", {
                            key: 0,
                            transform: "translate(50, 20)"
                          }, [
                            unref(selectedScenario) === "all" || unref(selectedScenario) === "best" ? (openBlock(), createBlock("polyline", {
                              key: 0,
                              points: unref(chartData).map((d, i) => `${i / unref(maxIndex) * chartWidth},${yPosition(d.bestCase)}`).join(" "),
                              fill: "none",
                              stroke: bestCaseColor,
                              "stroke-width": "2",
                              "stroke-dasharray": unref(selectedScenario) === "best" ? "none" : "5,5",
                              class: "transition-all duration-300"
                            }, null, 8, ["points", "stroke-dasharray"])) : createCommentVNode("", true),
                            unref(selectedScenario) === "all" || unref(selectedScenario) === "likely" ? (openBlock(), createBlock("polyline", {
                              key: 1,
                              points: unref(chartData).map((d, i) => `${i / unref(maxIndex) * chartWidth},${yPosition(d.likelyCase)}`).join(" "),
                              fill: "none",
                              stroke: likelyCaseColor,
                              "stroke-width": "3",
                              class: "transition-all duration-300"
                            }, null, 8, ["points"])) : createCommentVNode("", true),
                            unref(selectedScenario) === "all" || unref(selectedScenario) === "worst" ? (openBlock(), createBlock("polyline", {
                              key: 2,
                              points: unref(chartData).map((d, i) => `${i / unref(maxIndex) * chartWidth},${yPosition(d.worstCase)}`).join(" "),
                              fill: "none",
                              stroke: worstCaseColor,
                              "stroke-width": "2",
                              "stroke-dasharray": unref(selectedScenario) === "worst" ? "none" : "5,5",
                              class: "transition-all duration-300"
                            }, null, 8, ["points", "stroke-dasharray"])) : createCommentVNode("", true),
                            createVNode("line", {
                              x1: "0",
                              y1: yPosition(0),
                              x2: chartWidth,
                              y2: yPosition(0),
                              stroke: "#6b7280",
                              "stroke-width": "1",
                              "stroke-dasharray": "4,4",
                              opacity: "0.5"
                            }, null, 8, ["y1", "y2"]),
                            unref(selectedScenario) !== "all" ? (openBlock(), createBlock("g", { key: 3 }, [
                              (openBlock(true), createBlock(Fragment, null, renderList(unref(chartData), (point, index) => {
                                return openBlock(), createBlock("circle", {
                                  key: index,
                                  cx: index / unref(maxIndex) * chartWidth,
                                  cy: yPosition(point[unref(selectedScenario) === "best" ? "bestCase" : unref(selectedScenario) === "likely" ? "likelyCase" : "worstCase"]),
                                  r: "3",
                                  fill: unref(selectedScenario) === "best" ? bestCaseColor : unref(selectedScenario) === "likely" ? likelyCaseColor : worstCaseColor,
                                  class: "cursor-pointer hover:r-4 transition-all",
                                  title: `${point.dateFormatted}: ${formatCurrency(point[unref(selectedScenario) === "best" ? "bestCase" : unref(selectedScenario) === "likely" ? "likelyCase" : "worstCase"])}`
                                }, null, 8, ["cx", "cy", "fill", "title"]);
                              }), 128))
                            ])) : createCommentVNode("", true)
                          ])) : createCommentVNode("", true),
                          createVNode("g", { class: "text-xs fill-gray-600" }, [
                            createVNode("text", {
                              x: "35",
                              y: "15",
                              "text-anchor": "end"
                            }, toDisplayString(formatCurrency(unref(yLabels).top)), 1),
                            createVNode("text", {
                              x: "35",
                              y: "180",
                              "text-anchor": "end"
                            }, toDisplayString(formatCurrency(unref(yLabels).mid)), 1),
                            createVNode("text", {
                              x: "35",
                              y: "315",
                              "text-anchor": "end"
                            }, toDisplayString(formatCurrency(unref(yLabels).bottom)), 1)
                          ])
                        ]))
                      ])
                    ]),
                    _: 1
                  })
                ]),
                createVNode("div", { class: "flex items-center justify-center gap-6 text-sm" }, [
                  unref(selectedScenario) === "all" || unref(selectedScenario) === "best" ? (openBlock(), createBlock("div", {
                    key: 0,
                    class: "flex items-center gap-2"
                  }, [
                    createVNode("div", { class: "w-3 h-3 bg-emerald-500 rounded-full" }),
                    createVNode("span", { class: "text-muted" }, "Best Case")
                  ])) : createCommentVNode("", true),
                  unref(selectedScenario) === "all" || unref(selectedScenario) === "likely" ? (openBlock(), createBlock("div", {
                    key: 1,
                    class: "flex items-center gap-2"
                  }, [
                    createVNode("div", { class: "w-3 h-3 bg-blue-500 rounded-full" }),
                    createVNode("span", { class: "text-muted" }, "Most Likely")
                  ])) : createCommentVNode("", true),
                  unref(selectedScenario) === "all" || unref(selectedScenario) === "worst" ? (openBlock(), createBlock("div", {
                    key: 2,
                    class: "flex items-center gap-2"
                  }, [
                    createVNode("div", { class: "w-3 h-3 bg-red-500 rounded-full" }),
                    createVNode("span", { class: "text-muted" }, "Worst Case")
                  ])) : createCommentVNode("", true)
                ]),
                unref(scenarioMetrics) ? (openBlock(), createBlock("div", {
                  key: 1,
                  class: "pt-4 border-t border-gray-200 dark:border-gray-800"
                }, [
                  createVNode("h4", { class: "font-medium text-sm mb-3" }, "Risk Analysis"),
                  createVNode("div", { class: "grid grid-cols-1 md:grid-cols-3 gap-4 text-sm" }, [
                    createVNode("div", null, [
                      createVNode("span", { class: "text-muted" }, "Probability of Shortfall:"),
                      createVNode("div", { class: "mt-1" }, [
                        createVNode("span", {
                          class: ["font-medium", {
                            "text-red-600": unref(scenarioMetrics).worst.shortfallDays > 0,
                            "text-amber-600": unref(scenarioMetrics).likely.shortfallDays > 0,
                            "text-emerald-600": unref(scenarioMetrics).worst.shortfallDays === 0
                          }]
                        }, toDisplayString(unref(scenarioMetrics).worst.shortfallDays > 0 ? "High" : unref(scenarioMetrics).likely.shortfallDays > 0 ? "Medium" : "Low"), 3)
                      ])
                    ]),
                    createVNode("div", null, [
                      createVNode("span", { class: "text-muted" }, "Upside Potential:"),
                      createVNode("div", { class: "mt-1" }, [
                        createVNode("span", { class: "font-medium text-emerald-600" }, toDisplayString(formatCurrency(unref(scenarioMetrics).best.endBalance - unref(scenarioMetrics).likely.endBalance)), 1)
                      ])
                    ]),
                    createVNode("div", null, [
                      createVNode("span", { class: "text-muted" }, "Downside Risk:"),
                      createVNode("div", { class: "mt-1" }, [
                        createVNode("span", { class: "font-medium text-red-600" }, toDisplayString(formatCurrency(unref(scenarioMetrics).likely.endBalance - unref(scenarioMetrics).worst.endBalance)), 1)
                      ])
                    ])
                  ])
                ])) : createCommentVNode("", true)
              ])) : (openBlock(), createBlock("div", {
                key: 2,
                class: "flex items-center justify-center h-96"
              }, [
                createVNode("div", { class: "text-center" }, [
                  createVNode(_component_UIcon, {
                    name: "i-lucide-git-branch",
                    class: "h-12 w-12 text-muted/50 mx-auto mb-4"
                  }),
                  createVNode("p", { class: "text-muted" }, "No scenario data available"),
                  createVNode("p", { class: "text-sm text-muted/70" }, "Connect to Xero to see scenario analysis")
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
const _sfc_setup$3 = _sfc_main$3.setup;
_sfc_main$3.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("components/cashflow/ScenarioAnalysis.client.vue");
  return _sfc_setup$3 ? _sfc_setup$3(props, ctx) : void 0;
};
const ScenarioAnalysis = /* @__PURE__ */ Object.assign(_export_sfc(_sfc_main$3, [["__scopeId", "data-v-6a01d34d"]]), { __name: "CashflowScenarioAnalysis" });
const _sfc_main$2 = /* @__PURE__ */ defineComponent({
  __name: "AIInsights",
  __ssrInlineRender: true,
  props: {
    cashflowData: {},
    invoiceData: {},
    scenarioData: {},
    loading: { type: Boolean }
  },
  setup(__props) {
    const props = __props;
    const insights = ref(null);
    const pending = ref(false);
    const error = ref(null);
    async function execute() {
      if (!props.cashflowData || !props.invoiceData) return;
      pending.value = true;
      error.value = null;
      try {
        const outstanding = props.invoiceData.outstanding || [];
        const overdue = props.invoiceData.overdue || [];
        const requestBody = {
          currentCash: props.cashflowData.currentCash || 0,
          projectedEndBalance: props.cashflowData.projectedEndBalance || 0,
          minProjectedBalance: props.cashflowData.minProjectedBalance || 0,
          maxProjectedBalance: props.cashflowData.maxProjectedBalance || 0,
          burnRate: props.cashflowData.dailyBurnRate || 0,
          runway: props.cashflowData.dailyBurnRate > 0 ? props.cashflowData.currentCash / props.cashflowData.dailyBurnRate : 365,
          shortfallCount: props.cashflowData.shortfallDates?.length || 0,
          outstandingReceivables: outstanding.reduce((sum, inv) => sum + (inv.amountDue || 0), 0),
          overdueReceivables: overdue.reduce((sum, inv) => sum + (inv.amountDue || 0), 0),
          outstandingCount: outstanding.length,
          overdueCount: overdue.length,
          forecastPeriod: props.cashflowData.forecastPeriod || 90,
          scenarios: props.scenarioData?.summaries
        };
        const result = await $fetch("/api/ai/cashflow-insights", {
          method: "POST",
          body: requestBody
        });
        insights.value = result;
      } catch (err) {
        error.value = err;
        console.error("AI Insights Error:", err);
      } finally {
        pending.value = false;
      }
    }
    watch(() => props.cashflowData, (newData) => {
      if (newData && props.invoiceData && !pending.value) {
        execute();
      }
    }, { immediate: true });
    const statusConfig = {
      healthy: { color: "emerald", icon: "i-lucide-check-circle", bgColor: "bg-emerald-50 dark:bg-emerald-950/20" },
      concerning: { color: "amber", icon: "i-lucide-alert-triangle", bgColor: "bg-amber-50 dark:bg-amber-950/20" },
      critical: { color: "red", icon: "i-lucide-alert-octagon", bgColor: "bg-red-50 dark:bg-red-950/20" }
    };
    const impactConfig = {
      high: { color: "red", label: "High Impact" },
      medium: { color: "amber", label: "Medium Impact" },
      low: { color: "gray", label: "Low Impact" }
    };
    const timeframeConfig = {
      immediate: { color: "red", label: "Immediate", icon: "i-lucide-zap" },
      "short-term": { color: "amber", label: "Short-term", icon: "i-lucide-clock" },
      "long-term": { color: "blue", label: "Long-term", icon: "i-lucide-calendar" }
    };
    const categoryIcons = {
      collections: "i-lucide-receipt",
      expenses: "i-lucide-trending-down",
      funding: "i-lucide-piggy-bank",
      operations: "i-lucide-settings"
    };
    const probabilityConfig = {
      high: { color: "red", label: "High" },
      medium: { color: "amber", label: "Medium" },
      low: { color: "green", label: "Low" }
    };
    const effortConfig = {
      high: { color: "red", label: "High Effort" },
      medium: { color: "amber", label: "Medium Effort" },
      low: { color: "green", label: "Low Effort" }
    };
    return (_ctx, _push, _parent, _attrs) => {
      const _component_UCard = _sfc_main$7;
      const _component_UIcon = _sfc_main$e;
      const _component_UButton = _sfc_main$9;
      const _component_USkeleton = _sfc_main$5;
      const _component_UAlert = _sfc_main$6;
      const _component_UBadge = _sfc_main$d;
      _push(ssrRenderComponent(_component_UCard, mergeProps({ class: "h-full overflow-hidden border-none shadow-none ring-1 ring-black/5 dark:ring-white/5" }, _attrs), {
        header: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            _push2(`<div class="flex items-center justify-between"${_scopeId}><div class="flex items-center gap-2"${_scopeId}>`);
            _push2(ssrRenderComponent(_component_UIcon, {
              name: "i-lucide-brain",
              class: "h-5 w-5 text-primary"
            }, null, _parent2, _scopeId));
            _push2(`<h3 class="text-lg font-semibold"${_scopeId}>AI-Powered Insights</h3></div>`);
            if (!unref(pending)) {
              _push2(ssrRenderComponent(_component_UButton, {
                icon: "i-lucide-refresh-cw",
                size: "sm",
                color: "neutral",
                variant: "ghost",
                onClick: ($event) => execute()
              }, null, _parent2, _scopeId));
            } else {
              _push2(`<!---->`);
            }
            _push2(`</div>`);
          } else {
            return [
              createVNode("div", { class: "flex items-center justify-between" }, [
                createVNode("div", { class: "flex items-center gap-2" }, [
                  createVNode(_component_UIcon, {
                    name: "i-lucide-brain",
                    class: "h-5 w-5 text-primary"
                  }),
                  createVNode("h3", { class: "text-lg font-semibold" }, "AI-Powered Insights")
                ]),
                !unref(pending) ? (openBlock(), createBlock(_component_UButton, {
                  key: 0,
                  icon: "i-lucide-refresh-cw",
                  size: "sm",
                  color: "neutral",
                  variant: "ghost",
                  onClick: ($event) => execute()
                }, null, 8, ["onClick"])) : createCommentVNode("", true)
              ])
            ];
          }
        }),
        default: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            if (_ctx.loading || unref(pending)) {
              _push2(`<div class="space-y-4"${_scopeId}>`);
              _push2(ssrRenderComponent(_component_USkeleton, { class: "h-20 w-full" }, null, _parent2, _scopeId));
              _push2(ssrRenderComponent(_component_USkeleton, { class: "h-32 w-full" }, null, _parent2, _scopeId));
              _push2(ssrRenderComponent(_component_USkeleton, { class: "h-24 w-full" }, null, _parent2, _scopeId));
              _push2(`</div>`);
            } else if (unref(error)) {
              _push2(ssrRenderComponent(_component_UAlert, {
                icon: "i-lucide-alert-circle",
                color: "red",
                variant: "subtle",
                title: "Unable to generate insights",
                description: "AI analysis is temporarily unavailable. Please try again later."
              }, null, _parent2, _scopeId));
            } else if (unref(insights)) {
              _push2(`<div class="space-y-6"${_scopeId}><div class="${ssrRenderClass([statusConfig[unref(insights).healthAssessment.status].bgColor, "p-4 rounded-lg"])}"${_scopeId}><div class="flex items-center gap-3 mb-2"${_scopeId}>`);
              _push2(ssrRenderComponent(_component_UIcon, {
                name: statusConfig[unref(insights).healthAssessment.status].icon,
                class: [`text-${statusConfig[unref(insights).healthAssessment.status].color}-600`, "h-6 w-6"]
              }, null, _parent2, _scopeId));
              _push2(`<div class="flex-1"${_scopeId}><h4 class="${ssrRenderClass([`text-${statusConfig[unref(insights).healthAssessment.status].color}-800 dark:text-${statusConfig[unref(insights).healthAssessment.status].color}-200`, "font-semibold"])}"${_scopeId}> Financial Health: ${ssrInterpolate(unref(insights).healthAssessment.status.charAt(0).toUpperCase() + unref(insights).healthAssessment.status.slice(1))}</h4><div class="flex items-center gap-2 mt-1"${_scopeId}><div class="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2"${_scopeId}><div class="${ssrRenderClass([`bg-${statusConfig[unref(insights).healthAssessment.status].color}-500`, "h-2 rounded-full transition-all duration-300"])}" style="${ssrRenderStyle({ width: `${unref(insights).healthAssessment.score}%` })}"${_scopeId}></div></div><span class="${ssrRenderClass([`text-${statusConfig[unref(insights).healthAssessment.status].color}-600`, "text-sm font-medium"])}"${_scopeId}>${ssrInterpolate(unref(insights).healthAssessment.score)}/100 </span></div></div></div><p class="${ssrRenderClass([`text-${statusConfig[unref(insights).healthAssessment.status].color}-700 dark:text-${statusConfig[unref(insights).healthAssessment.status].color}-300`, "text-sm"])}"${_scopeId}>${ssrInterpolate(unref(insights).healthAssessment.summary)}</p></div>`);
              if (unref(insights).priorityActions.length > 0) {
                _push2(`<div${_scopeId}><h4 class="font-semibold mb-3 flex items-center gap-2"${_scopeId}>`);
                _push2(ssrRenderComponent(_component_UIcon, {
                  name: "i-lucide-target",
                  class: "h-4 w-4"
                }, null, _parent2, _scopeId));
                _push2(` Priority Actions </h4><div class="space-y-3"${_scopeId}><!--[-->`);
                ssrRenderList(unref(insights).priorityActions, (action, index) => {
                  _push2(`<div class="p-3 border border-gray-200 dark:border-gray-800 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"${_scopeId}><div class="flex items-start gap-3"${_scopeId}>`);
                  _push2(ssrRenderComponent(_component_UIcon, {
                    name: categoryIcons[action.category],
                    class: "h-5 w-5 text-primary mt-0.5"
                  }, null, _parent2, _scopeId));
                  _push2(`<div class="flex-1"${_scopeId}><div class="flex items-center gap-2 mb-1"${_scopeId}><h5 class="font-medium"${_scopeId}>${ssrInterpolate(action.title)}</h5>`);
                  _push2(ssrRenderComponent(_component_UBadge, {
                    color: impactConfig[action.impact].color,
                    variant: "subtle",
                    size: "xs"
                  }, {
                    default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                      if (_push3) {
                        _push3(`${ssrInterpolate(impactConfig[action.impact].label)}`);
                      } else {
                        return [
                          createTextVNode(toDisplayString(impactConfig[action.impact].label), 1)
                        ];
                      }
                    }),
                    _: 2
                  }, _parent2, _scopeId));
                  _push2(ssrRenderComponent(_component_UBadge, {
                    color: timeframeConfig[action.timeframe].color,
                    variant: "outline",
                    size: "xs"
                  }, {
                    default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                      if (_push3) {
                        _push3(ssrRenderComponent(_component_UIcon, {
                          name: timeframeConfig[action.timeframe].icon,
                          class: "h-3 w-3 mr-1"
                        }, null, _parent3, _scopeId2));
                        _push3(` ${ssrInterpolate(timeframeConfig[action.timeframe].label)}`);
                      } else {
                        return [
                          createVNode(_component_UIcon, {
                            name: timeframeConfig[action.timeframe].icon,
                            class: "h-3 w-3 mr-1"
                          }, null, 8, ["name"]),
                          createTextVNode(" " + toDisplayString(timeframeConfig[action.timeframe].label), 1)
                        ];
                      }
                    }),
                    _: 2
                  }, _parent2, _scopeId));
                  _push2(`</div><p class="text-sm text-muted"${_scopeId}>${ssrInterpolate(action.description)}</p></div></div></div>`);
                });
                _push2(`<!--]--></div></div>`);
              } else {
                _push2(`<!---->`);
              }
              if (unref(insights).risks.length > 0) {
                _push2(`<div${_scopeId}><h4 class="font-semibold mb-3 flex items-center gap-2"${_scopeId}>`);
                _push2(ssrRenderComponent(_component_UIcon, {
                  name: "i-lucide-shield-alert",
                  class: "h-4 w-4"
                }, null, _parent2, _scopeId));
                _push2(` Risk Assessment </h4><div class="space-y-3"${_scopeId}><!--[-->`);
                ssrRenderList(unref(insights).risks, (risk, index) => {
                  _push2(`<div class="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg"${_scopeId}><div class="flex items-start gap-3"${_scopeId}>`);
                  _push2(ssrRenderComponent(_component_UIcon, {
                    name: "i-lucide-alert-triangle",
                    class: "h-5 w-5 text-red-600 mt-0.5"
                  }, null, _parent2, _scopeId));
                  _push2(`<div class="flex-1"${_scopeId}><div class="flex items-center gap-2 mb-1"${_scopeId}><h5 class="font-medium text-red-800 dark:text-red-200"${_scopeId}>${ssrInterpolate(risk.risk)}</h5>`);
                  _push2(ssrRenderComponent(_component_UBadge, {
                    color: probabilityConfig[risk.probability].color,
                    variant: "subtle",
                    size: "xs"
                  }, {
                    default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                      if (_push3) {
                        _push3(`${ssrInterpolate(probabilityConfig[risk.probability].label)} Probability `);
                      } else {
                        return [
                          createTextVNode(toDisplayString(probabilityConfig[risk.probability].label) + " Probability ", 1)
                        ];
                      }
                    }),
                    _: 2
                  }, _parent2, _scopeId));
                  _push2(ssrRenderComponent(_component_UBadge, {
                    color: impactConfig[risk.impact].color,
                    variant: "subtle",
                    size: "xs"
                  }, {
                    default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                      if (_push3) {
                        _push3(`${ssrInterpolate(impactConfig[risk.impact].label)}`);
                      } else {
                        return [
                          createTextVNode(toDisplayString(impactConfig[risk.impact].label), 1)
                        ];
                      }
                    }),
                    _: 2
                  }, _parent2, _scopeId));
                  _push2(`</div><p class="text-sm text-red-700 dark:text-red-300"${_scopeId}><strong${_scopeId}>Mitigation:</strong> ${ssrInterpolate(risk.mitigation)}</p></div></div></div>`);
                });
                _push2(`<!--]--></div></div>`);
              } else {
                _push2(`<!---->`);
              }
              if (unref(insights).opportunities.length > 0) {
                _push2(`<div${_scopeId}><h4 class="font-semibold mb-3 flex items-center gap-2"${_scopeId}>`);
                _push2(ssrRenderComponent(_component_UIcon, {
                  name: "i-lucide-lightbulb",
                  class: "h-4 w-4"
                }, null, _parent2, _scopeId));
                _push2(` Opportunities </h4><div class="space-y-3"${_scopeId}><!--[-->`);
                ssrRenderList(unref(insights).opportunities, (opportunity, index) => {
                  _push2(`<div class="p-3 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-lg"${_scopeId}><div class="flex items-start gap-3"${_scopeId}>`);
                  _push2(ssrRenderComponent(_component_UIcon, {
                    name: "i-lucide-trending-up",
                    class: "h-5 w-5 text-emerald-600 mt-0.5"
                  }, null, _parent2, _scopeId));
                  _push2(`<div class="flex-1"${_scopeId}><div class="flex items-center gap-2 mb-1"${_scopeId}><h5 class="font-medium text-emerald-800 dark:text-emerald-200"${_scopeId}>${ssrInterpolate(opportunity.opportunity)}</h5>`);
                  _push2(ssrRenderComponent(_component_UBadge, {
                    color: effortConfig[opportunity.effort].color,
                    variant: "subtle",
                    size: "xs"
                  }, {
                    default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                      if (_push3) {
                        _push3(`${ssrInterpolate(effortConfig[opportunity.effort].label)}`);
                      } else {
                        return [
                          createTextVNode(toDisplayString(effortConfig[opportunity.effort].label), 1)
                        ];
                      }
                    }),
                    _: 2
                  }, _parent2, _scopeId));
                  _push2(`</div><p class="text-sm text-emerald-700 dark:text-emerald-300"${_scopeId}>${ssrInterpolate(opportunity.benefit)}</p></div></div></div>`);
                });
                _push2(`<!--]--></div></div>`);
              } else {
                _push2(`<!---->`);
              }
              _push2(`<div class="pt-3 border-t border-gray-200 dark:border-gray-800"${_scopeId}><div class="flex items-center justify-between text-xs text-muted"${_scopeId}><span${_scopeId}> Generated by ${ssrInterpolate(unref(insights).metadata.model)} ${ssrInterpolate(unref(insights).metadata.note ? `(${unref(insights).metadata.note})` : "")}</span><span${_scopeId}>${ssrInterpolate(new Date(unref(insights).metadata.generatedAt).toLocaleString())}</span></div></div></div>`);
            } else {
              _push2(`<div class="flex items-center justify-center h-48"${_scopeId}><div class="text-center"${_scopeId}>`);
              _push2(ssrRenderComponent(_component_UIcon, {
                name: "i-lucide-brain",
                class: "h-12 w-12 text-muted/50 mx-auto mb-4"
              }, null, _parent2, _scopeId));
              _push2(`<p class="text-muted"${_scopeId}>No data available for AI analysis</p><p class="text-sm text-muted/70"${_scopeId}>Connect to Xero and refresh to get insights</p></div></div>`);
            }
          } else {
            return [
              _ctx.loading || unref(pending) ? (openBlock(), createBlock("div", {
                key: 0,
                class: "space-y-4"
              }, [
                createVNode(_component_USkeleton, { class: "h-20 w-full" }),
                createVNode(_component_USkeleton, { class: "h-32 w-full" }),
                createVNode(_component_USkeleton, { class: "h-24 w-full" })
              ])) : unref(error) ? (openBlock(), createBlock(_component_UAlert, {
                key: 1,
                icon: "i-lucide-alert-circle",
                color: "red",
                variant: "subtle",
                title: "Unable to generate insights",
                description: "AI analysis is temporarily unavailable. Please try again later."
              })) : unref(insights) ? (openBlock(), createBlock("div", {
                key: 2,
                class: "space-y-6"
              }, [
                createVNode("div", {
                  class: [statusConfig[unref(insights).healthAssessment.status].bgColor, "p-4 rounded-lg"]
                }, [
                  createVNode("div", { class: "flex items-center gap-3 mb-2" }, [
                    createVNode(_component_UIcon, {
                      name: statusConfig[unref(insights).healthAssessment.status].icon,
                      class: [`text-${statusConfig[unref(insights).healthAssessment.status].color}-600`, "h-6 w-6"]
                    }, null, 8, ["name", "class"]),
                    createVNode("div", { class: "flex-1" }, [
                      createVNode("h4", {
                        class: ["font-semibold", `text-${statusConfig[unref(insights).healthAssessment.status].color}-800 dark:text-${statusConfig[unref(insights).healthAssessment.status].color}-200`]
                      }, " Financial Health: " + toDisplayString(unref(insights).healthAssessment.status.charAt(0).toUpperCase() + unref(insights).healthAssessment.status.slice(1)), 3),
                      createVNode("div", { class: "flex items-center gap-2 mt-1" }, [
                        createVNode("div", { class: "flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2" }, [
                          createVNode("div", {
                            class: [`bg-${statusConfig[unref(insights).healthAssessment.status].color}-500`, "h-2 rounded-full transition-all duration-300"],
                            style: { width: `${unref(insights).healthAssessment.score}%` }
                          }, null, 6)
                        ]),
                        createVNode("span", {
                          class: ["text-sm font-medium", `text-${statusConfig[unref(insights).healthAssessment.status].color}-600`]
                        }, toDisplayString(unref(insights).healthAssessment.score) + "/100 ", 3)
                      ])
                    ])
                  ]),
                  createVNode("p", {
                    class: ["text-sm", `text-${statusConfig[unref(insights).healthAssessment.status].color}-700 dark:text-${statusConfig[unref(insights).healthAssessment.status].color}-300`]
                  }, toDisplayString(unref(insights).healthAssessment.summary), 3)
                ], 2),
                unref(insights).priorityActions.length > 0 ? (openBlock(), createBlock("div", { key: 0 }, [
                  createVNode("h4", { class: "font-semibold mb-3 flex items-center gap-2" }, [
                    createVNode(_component_UIcon, {
                      name: "i-lucide-target",
                      class: "h-4 w-4"
                    }),
                    createTextVNode(" Priority Actions ")
                  ]),
                  createVNode("div", { class: "space-y-3" }, [
                    (openBlock(true), createBlock(Fragment, null, renderList(unref(insights).priorityActions, (action, index) => {
                      return openBlock(), createBlock("div", {
                        key: index,
                        class: "p-3 border border-gray-200 dark:border-gray-800 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
                      }, [
                        createVNode("div", { class: "flex items-start gap-3" }, [
                          createVNode(_component_UIcon, {
                            name: categoryIcons[action.category],
                            class: "h-5 w-5 text-primary mt-0.5"
                          }, null, 8, ["name"]),
                          createVNode("div", { class: "flex-1" }, [
                            createVNode("div", { class: "flex items-center gap-2 mb-1" }, [
                              createVNode("h5", { class: "font-medium" }, toDisplayString(action.title), 1),
                              createVNode(_component_UBadge, {
                                color: impactConfig[action.impact].color,
                                variant: "subtle",
                                size: "xs"
                              }, {
                                default: withCtx(() => [
                                  createTextVNode(toDisplayString(impactConfig[action.impact].label), 1)
                                ]),
                                _: 2
                              }, 1032, ["color"]),
                              createVNode(_component_UBadge, {
                                color: timeframeConfig[action.timeframe].color,
                                variant: "outline",
                                size: "xs"
                              }, {
                                default: withCtx(() => [
                                  createVNode(_component_UIcon, {
                                    name: timeframeConfig[action.timeframe].icon,
                                    class: "h-3 w-3 mr-1"
                                  }, null, 8, ["name"]),
                                  createTextVNode(" " + toDisplayString(timeframeConfig[action.timeframe].label), 1)
                                ]),
                                _: 2
                              }, 1032, ["color"])
                            ]),
                            createVNode("p", { class: "text-sm text-muted" }, toDisplayString(action.description), 1)
                          ])
                        ])
                      ]);
                    }), 128))
                  ])
                ])) : createCommentVNode("", true),
                unref(insights).risks.length > 0 ? (openBlock(), createBlock("div", { key: 1 }, [
                  createVNode("h4", { class: "font-semibold mb-3 flex items-center gap-2" }, [
                    createVNode(_component_UIcon, {
                      name: "i-lucide-shield-alert",
                      class: "h-4 w-4"
                    }),
                    createTextVNode(" Risk Assessment ")
                  ]),
                  createVNode("div", { class: "space-y-3" }, [
                    (openBlock(true), createBlock(Fragment, null, renderList(unref(insights).risks, (risk, index) => {
                      return openBlock(), createBlock("div", {
                        key: index,
                        class: "p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg"
                      }, [
                        createVNode("div", { class: "flex items-start gap-3" }, [
                          createVNode(_component_UIcon, {
                            name: "i-lucide-alert-triangle",
                            class: "h-5 w-5 text-red-600 mt-0.5"
                          }),
                          createVNode("div", { class: "flex-1" }, [
                            createVNode("div", { class: "flex items-center gap-2 mb-1" }, [
                              createVNode("h5", { class: "font-medium text-red-800 dark:text-red-200" }, toDisplayString(risk.risk), 1),
                              createVNode(_component_UBadge, {
                                color: probabilityConfig[risk.probability].color,
                                variant: "subtle",
                                size: "xs"
                              }, {
                                default: withCtx(() => [
                                  createTextVNode(toDisplayString(probabilityConfig[risk.probability].label) + " Probability ", 1)
                                ]),
                                _: 2
                              }, 1032, ["color"]),
                              createVNode(_component_UBadge, {
                                color: impactConfig[risk.impact].color,
                                variant: "subtle",
                                size: "xs"
                              }, {
                                default: withCtx(() => [
                                  createTextVNode(toDisplayString(impactConfig[risk.impact].label), 1)
                                ]),
                                _: 2
                              }, 1032, ["color"])
                            ]),
                            createVNode("p", { class: "text-sm text-red-700 dark:text-red-300" }, [
                              createVNode("strong", null, "Mitigation:"),
                              createTextVNode(" " + toDisplayString(risk.mitigation), 1)
                            ])
                          ])
                        ])
                      ]);
                    }), 128))
                  ])
                ])) : createCommentVNode("", true),
                unref(insights).opportunities.length > 0 ? (openBlock(), createBlock("div", { key: 2 }, [
                  createVNode("h4", { class: "font-semibold mb-3 flex items-center gap-2" }, [
                    createVNode(_component_UIcon, {
                      name: "i-lucide-lightbulb",
                      class: "h-4 w-4"
                    }),
                    createTextVNode(" Opportunities ")
                  ]),
                  createVNode("div", { class: "space-y-3" }, [
                    (openBlock(true), createBlock(Fragment, null, renderList(unref(insights).opportunities, (opportunity, index) => {
                      return openBlock(), createBlock("div", {
                        key: index,
                        class: "p-3 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-lg"
                      }, [
                        createVNode("div", { class: "flex items-start gap-3" }, [
                          createVNode(_component_UIcon, {
                            name: "i-lucide-trending-up",
                            class: "h-5 w-5 text-emerald-600 mt-0.5"
                          }),
                          createVNode("div", { class: "flex-1" }, [
                            createVNode("div", { class: "flex items-center gap-2 mb-1" }, [
                              createVNode("h5", { class: "font-medium text-emerald-800 dark:text-emerald-200" }, toDisplayString(opportunity.opportunity), 1),
                              createVNode(_component_UBadge, {
                                color: effortConfig[opportunity.effort].color,
                                variant: "subtle",
                                size: "xs"
                              }, {
                                default: withCtx(() => [
                                  createTextVNode(toDisplayString(effortConfig[opportunity.effort].label), 1)
                                ]),
                                _: 2
                              }, 1032, ["color"])
                            ]),
                            createVNode("p", { class: "text-sm text-emerald-700 dark:text-emerald-300" }, toDisplayString(opportunity.benefit), 1)
                          ])
                        ])
                      ]);
                    }), 128))
                  ])
                ])) : createCommentVNode("", true),
                createVNode("div", { class: "pt-3 border-t border-gray-200 dark:border-gray-800" }, [
                  createVNode("div", { class: "flex items-center justify-between text-xs text-muted" }, [
                    createVNode("span", null, " Generated by " + toDisplayString(unref(insights).metadata.model) + " " + toDisplayString(unref(insights).metadata.note ? `(${unref(insights).metadata.note})` : ""), 1),
                    createVNode("span", null, toDisplayString(new Date(unref(insights).metadata.generatedAt).toLocaleString()), 1)
                  ])
                ])
              ])) : (openBlock(), createBlock("div", {
                key: 3,
                class: "flex items-center justify-center h-48"
              }, [
                createVNode("div", { class: "text-center" }, [
                  createVNode(_component_UIcon, {
                    name: "i-lucide-brain",
                    class: "h-12 w-12 text-muted/50 mx-auto mb-4"
                  }),
                  createVNode("p", { class: "text-muted" }, "No data available for AI analysis"),
                  createVNode("p", { class: "text-sm text-muted/70" }, "Connect to Xero and refresh to get insights")
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
const _sfc_setup$2 = _sfc_main$2.setup;
_sfc_main$2.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("components/cashflow/AIInsights.vue");
  return _sfc_setup$2 ? _sfc_setup$2(props, ctx) : void 0;
};
const AIInsights = Object.assign(_sfc_main$2, { __name: "CashflowAIInsights" });
const _sfc_main$1 = /* @__PURE__ */ defineComponent({
  __name: "ExportModal",
  __ssrInlineRender: true,
  props: {
    "open": { type: Boolean, ...{ default: false } },
    "openModifiers": {}
  },
  emits: ["update:open"],
  setup(__props) {
    const isOpen = useModel(__props, "open");
    const exportOptions = ref({
      format: "csv",
      period: "90",
      includeScenarios: true,
      includeWaterfall: true,
      includeInvoices: true
    });
    const isExporting = ref(false);
    const formatOptions = [
      { value: "csv", label: "CSV (Excel Compatible)", description: "Comma-separated values for spreadsheet applications" },
      { value: "excel", label: "Excel Workbook", description: "Multi-sheet Excel file with detailed data" },
      { value: "json", label: "JSON Data", description: "Raw data format for developers and APIs" }
    ];
    const periodOptions = [
      { value: "30", label: "30 Days", description: "Next 30 days forecast" },
      { value: "60", label: "60 Days", description: "Next 60 days forecast" },
      { value: "90", label: "90 Days", description: "Next 90 days forecast" }
    ];
    async function exportData() {
      if (isExporting.value) return;
      isExporting.value = true;
      try {
        const params = new URLSearchParams({
          format: exportOptions.value.format,
          period: exportOptions.value.period,
          scenarios: exportOptions.value.includeScenarios.toString(),
          waterfall: exportOptions.value.includeWaterfall.toString(),
          download: "true"
        });
        if (exportOptions.value.format === "excel") {
          const response = await $fetch(`/api/exports/cashflow?${params}`);
          if (response.type === "excel" && false) ;
        } else {
          const url = `/api/exports/cashflow?${params}`;
          const link = (void 0).createElement("a");
          link.href = url;
          link.download = `cashflow-export-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.${exportOptions.value.format}`;
          (void 0).body.appendChild(link);
          link.click();
          (void 0).body.removeChild(link);
        }
        isOpen.value = false;
        useToast().add({
          title: "Export Successful",
          description: `Cash flow data exported as ${exportOptions.value.format.toUpperCase()}`,
          icon: "i-lucide-download",
          color: "green"
        });
      } catch (error) {
        console.error("Export failed:", error);
        useToast().add({
          title: "Export Failed",
          description: error.message || "Failed to export cash flow data",
          icon: "i-lucide-alert-circle",
          color: "red"
        });
      } finally {
        isExporting.value = false;
      }
    }
    const estimatedSize = computed(() => {
      const baseSize = exportOptions.value.period === "30" ? 2 : exportOptions.value.period === "60" ? 4 : 6;
      const multiplier = exportOptions.value.format === "excel" ? 3 : exportOptions.value.format === "csv" ? 1 : 2;
      const additionalData = (exportOptions.value.includeScenarios ? 1.5 : 0) + (exportOptions.value.includeWaterfall ? 0.5 : 0) + (exportOptions.value.includeInvoices ? 1 : 0);
      return Math.round((baseSize + additionalData) * multiplier * 10) / 10;
    });
    return (_ctx, _push, _parent, _attrs) => {
      const _component_UModal = _sfc_main$f;
      const _component_UCard = _sfc_main$7;
      const _component_UButton = _sfc_main$9;
      const _component_USelectMenu = _sfc_main$g;
      const _component_UCheckbox = _sfc_main$h;
      const _component_UIcon = _sfc_main$e;
      _push(ssrRenderComponent(_component_UModal, mergeProps({
        modelValue: isOpen.value,
        "onUpdate:modelValue": ($event) => isOpen.value = $event,
        ui: { width: "sm:max-w-md" }
      }, _attrs), {
        default: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            _push2(ssrRenderComponent(_component_UCard, { ui: { ring: "", divide: "divide-y divide-gray-200 dark:divide-gray-800" } }, {
              header: withCtx((_2, _push3, _parent3, _scopeId2) => {
                if (_push3) {
                  _push3(`<div class="flex items-center justify-between"${_scopeId2}><h3 class="text-lg font-semibold"${_scopeId2}>Export Cash Flow Data</h3>`);
                  _push3(ssrRenderComponent(_component_UButton, {
                    color: "gray",
                    variant: "ghost",
                    icon: "i-lucide-x",
                    onClick: ($event) => isOpen.value = false
                  }, null, _parent3, _scopeId2));
                  _push3(`</div>`);
                } else {
                  return [
                    createVNode("div", { class: "flex items-center justify-between" }, [
                      createVNode("h3", { class: "text-lg font-semibold" }, "Export Cash Flow Data"),
                      createVNode(_component_UButton, {
                        color: "gray",
                        variant: "ghost",
                        icon: "i-lucide-x",
                        onClick: ($event) => isOpen.value = false
                      }, null, 8, ["onClick"])
                    ])
                  ];
                }
              }),
              footer: withCtx((_2, _push3, _parent3, _scopeId2) => {
                if (_push3) {
                  _push3(`<div class="flex justify-end gap-2"${_scopeId2}>`);
                  _push3(ssrRenderComponent(_component_UButton, {
                    color: "gray",
                    variant: "ghost",
                    onClick: ($event) => isOpen.value = false,
                    disabled: unref(isExporting)
                  }, {
                    default: withCtx((_3, _push4, _parent4, _scopeId3) => {
                      if (_push4) {
                        _push4(` Cancel `);
                      } else {
                        return [
                          createTextVNode(" Cancel ")
                        ];
                      }
                    }),
                    _: 1
                  }, _parent3, _scopeId2));
                  _push3(ssrRenderComponent(_component_UButton, {
                    icon: "i-lucide-download",
                    loading: unref(isExporting),
                    onClick: exportData
                  }, {
                    default: withCtx((_3, _push4, _parent4, _scopeId3) => {
                      if (_push4) {
                        _push4(`${ssrInterpolate(unref(isExporting) ? "Exporting..." : "Export Data")}`);
                      } else {
                        return [
                          createTextVNode(toDisplayString(unref(isExporting) ? "Exporting..." : "Export Data"), 1)
                        ];
                      }
                    }),
                    _: 1
                  }, _parent3, _scopeId2));
                  _push3(`</div>`);
                } else {
                  return [
                    createVNode("div", { class: "flex justify-end gap-2" }, [
                      createVNode(_component_UButton, {
                        color: "gray",
                        variant: "ghost",
                        onClick: ($event) => isOpen.value = false,
                        disabled: unref(isExporting)
                      }, {
                        default: withCtx(() => [
                          createTextVNode(" Cancel ")
                        ]),
                        _: 1
                      }, 8, ["onClick", "disabled"]),
                      createVNode(_component_UButton, {
                        icon: "i-lucide-download",
                        loading: unref(isExporting),
                        onClick: exportData
                      }, {
                        default: withCtx(() => [
                          createTextVNode(toDisplayString(unref(isExporting) ? "Exporting..." : "Export Data"), 1)
                        ]),
                        _: 1
                      }, 8, ["loading"])
                    ])
                  ];
                }
              }),
              default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                if (_push3) {
                  _push3(`<div class="space-y-6"${_scopeId2}><div${_scopeId2}><label class="block text-sm font-medium mb-3"${_scopeId2}>Export Format</label><div class="space-y-2"${_scopeId2}><!--[-->`);
                  ssrRenderList(formatOptions, (format) => {
                    _push3(`<div class="${ssrRenderClass([{
                      "border-primary bg-primary/5": unref(exportOptions).format === format.value,
                      "border-gray-200 dark:border-gray-800": unref(exportOptions).format !== format.value
                    }, "flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"])}"${_scopeId2}><div class="${ssrRenderClass([{
                      "border-primary bg-primary": unref(exportOptions).format === format.value,
                      "border-gray-300 dark:border-gray-600": unref(exportOptions).format !== format.value
                    }, "w-4 h-4 rounded-full border-2 flex items-center justify-center"])}"${_scopeId2}>`);
                    if (unref(exportOptions).format === format.value) {
                      _push3(`<div class="w-2 h-2 rounded-full bg-white"${_scopeId2}></div>`);
                    } else {
                      _push3(`<!---->`);
                    }
                    _push3(`</div><div class="flex-1"${_scopeId2}><div class="font-medium text-sm"${_scopeId2}>${ssrInterpolate(format.label)}</div><div class="text-xs text-muted"${_scopeId2}>${ssrInterpolate(format.description)}</div></div></div>`);
                  });
                  _push3(`<!--]--></div></div><div${_scopeId2}><label class="block text-sm font-medium mb-3"${_scopeId2}>Forecast Period</label>`);
                  _push3(ssrRenderComponent(_component_USelectMenu, {
                    modelValue: unref(exportOptions).period,
                    "onUpdate:modelValue": ($event) => unref(exportOptions).period = $event,
                    options: periodOptions,
                    "option-attribute": "label",
                    "value-attribute": "value",
                    class: "w-full"
                  }, {
                    option: withCtx(({ option }, _push4, _parent4, _scopeId3) => {
                      if (_push4) {
                        _push4(`<div${_scopeId3}><div class="font-medium"${_scopeId3}>${ssrInterpolate(option.label)}</div><div class="text-xs text-muted"${_scopeId3}>${ssrInterpolate(option.description)}</div></div>`);
                      } else {
                        return [
                          createVNode("div", null, [
                            createVNode("div", { class: "font-medium" }, toDisplayString(option.label), 1),
                            createVNode("div", { class: "text-xs text-muted" }, toDisplayString(option.description), 1)
                          ])
                        ];
                      }
                    }),
                    _: 1
                  }, _parent3, _scopeId2));
                  _push3(`</div><div${_scopeId2}><label class="block text-sm font-medium mb-3"${_scopeId2}>Include Additional Data</label><div class="space-y-3"${_scopeId2}>`);
                  _push3(ssrRenderComponent(_component_UCheckbox, {
                    modelValue: unref(exportOptions).includeScenarios,
                    "onUpdate:modelValue": ($event) => unref(exportOptions).includeScenarios = $event,
                    label: "Scenario Analysis",
                    help: "Best/worst/likely case projections"
                  }, null, _parent3, _scopeId2));
                  _push3(ssrRenderComponent(_component_UCheckbox, {
                    modelValue: unref(exportOptions).includeWaterfall,
                    "onUpdate:modelValue": ($event) => unref(exportOptions).includeWaterfall = $event,
                    label: "Waterfall Breakdown",
                    help: "Detailed cash flow components"
                  }, null, _parent3, _scopeId2));
                  _push3(ssrRenderComponent(_component_UCheckbox, {
                    modelValue: unref(exportOptions).includeInvoices,
                    "onUpdate:modelValue": ($event) => unref(exportOptions).includeInvoices = $event,
                    label: "Outstanding Invoices",
                    help: "Receivables and payables details"
                  }, null, _parent3, _scopeId2));
                  _push3(`</div></div><div class="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg"${_scopeId2}><div class="flex items-center gap-2 text-sm"${_scopeId2}>`);
                  _push3(ssrRenderComponent(_component_UIcon, {
                    name: "i-lucide-info",
                    class: "h-4 w-4 text-blue-500"
                  }, null, _parent3, _scopeId2));
                  _push3(`<span class="text-muted"${_scopeId2}> Estimated file size: <strong${_scopeId2}>~${ssrInterpolate(unref(estimatedSize))} KB</strong></span></div></div></div>`);
                } else {
                  return [
                    createVNode("div", { class: "space-y-6" }, [
                      createVNode("div", null, [
                        createVNode("label", { class: "block text-sm font-medium mb-3" }, "Export Format"),
                        createVNode("div", { class: "space-y-2" }, [
                          (openBlock(), createBlock(Fragment, null, renderList(formatOptions, (format) => {
                            return createVNode("div", {
                              key: format.value,
                              class: ["flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors", {
                                "border-primary bg-primary/5": unref(exportOptions).format === format.value,
                                "border-gray-200 dark:border-gray-800": unref(exportOptions).format !== format.value
                              }],
                              onClick: ($event) => unref(exportOptions).format = format.value
                            }, [
                              createVNode("div", {
                                class: ["w-4 h-4 rounded-full border-2 flex items-center justify-center", {
                                  "border-primary bg-primary": unref(exportOptions).format === format.value,
                                  "border-gray-300 dark:border-gray-600": unref(exportOptions).format !== format.value
                                }]
                              }, [
                                unref(exportOptions).format === format.value ? (openBlock(), createBlock("div", {
                                  key: 0,
                                  class: "w-2 h-2 rounded-full bg-white"
                                })) : createCommentVNode("", true)
                              ], 2),
                              createVNode("div", { class: "flex-1" }, [
                                createVNode("div", { class: "font-medium text-sm" }, toDisplayString(format.label), 1),
                                createVNode("div", { class: "text-xs text-muted" }, toDisplayString(format.description), 1)
                              ])
                            ], 10, ["onClick"]);
                          }), 64))
                        ])
                      ]),
                      createVNode("div", null, [
                        createVNode("label", { class: "block text-sm font-medium mb-3" }, "Forecast Period"),
                        createVNode(_component_USelectMenu, {
                          modelValue: unref(exportOptions).period,
                          "onUpdate:modelValue": ($event) => unref(exportOptions).period = $event,
                          options: periodOptions,
                          "option-attribute": "label",
                          "value-attribute": "value",
                          class: "w-full"
                        }, {
                          option: withCtx(({ option }) => [
                            createVNode("div", null, [
                              createVNode("div", { class: "font-medium" }, toDisplayString(option.label), 1),
                              createVNode("div", { class: "text-xs text-muted" }, toDisplayString(option.description), 1)
                            ])
                          ]),
                          _: 1
                        }, 8, ["modelValue", "onUpdate:modelValue"])
                      ]),
                      createVNode("div", null, [
                        createVNode("label", { class: "block text-sm font-medium mb-3" }, "Include Additional Data"),
                        createVNode("div", { class: "space-y-3" }, [
                          createVNode(_component_UCheckbox, {
                            modelValue: unref(exportOptions).includeScenarios,
                            "onUpdate:modelValue": ($event) => unref(exportOptions).includeScenarios = $event,
                            label: "Scenario Analysis",
                            help: "Best/worst/likely case projections"
                          }, null, 8, ["modelValue", "onUpdate:modelValue"]),
                          createVNode(_component_UCheckbox, {
                            modelValue: unref(exportOptions).includeWaterfall,
                            "onUpdate:modelValue": ($event) => unref(exportOptions).includeWaterfall = $event,
                            label: "Waterfall Breakdown",
                            help: "Detailed cash flow components"
                          }, null, 8, ["modelValue", "onUpdate:modelValue"]),
                          createVNode(_component_UCheckbox, {
                            modelValue: unref(exportOptions).includeInvoices,
                            "onUpdate:modelValue": ($event) => unref(exportOptions).includeInvoices = $event,
                            label: "Outstanding Invoices",
                            help: "Receivables and payables details"
                          }, null, 8, ["modelValue", "onUpdate:modelValue"])
                        ])
                      ]),
                      createVNode("div", { class: "p-3 bg-gray-50 dark:bg-gray-900 rounded-lg" }, [
                        createVNode("div", { class: "flex items-center gap-2 text-sm" }, [
                          createVNode(_component_UIcon, {
                            name: "i-lucide-info",
                            class: "h-4 w-4 text-blue-500"
                          }),
                          createVNode("span", { class: "text-muted" }, [
                            createTextVNode(" Estimated file size: "),
                            createVNode("strong", null, "~" + toDisplayString(unref(estimatedSize)) + " KB", 1)
                          ])
                        ])
                      ])
                    ])
                  ];
                }
              }),
              _: 1
            }, _parent2, _scopeId));
          } else {
            return [
              createVNode(_component_UCard, { ui: { ring: "", divide: "divide-y divide-gray-200 dark:divide-gray-800" } }, {
                header: withCtx(() => [
                  createVNode("div", { class: "flex items-center justify-between" }, [
                    createVNode("h3", { class: "text-lg font-semibold" }, "Export Cash Flow Data"),
                    createVNode(_component_UButton, {
                      color: "gray",
                      variant: "ghost",
                      icon: "i-lucide-x",
                      onClick: ($event) => isOpen.value = false
                    }, null, 8, ["onClick"])
                  ])
                ]),
                footer: withCtx(() => [
                  createVNode("div", { class: "flex justify-end gap-2" }, [
                    createVNode(_component_UButton, {
                      color: "gray",
                      variant: "ghost",
                      onClick: ($event) => isOpen.value = false,
                      disabled: unref(isExporting)
                    }, {
                      default: withCtx(() => [
                        createTextVNode(" Cancel ")
                      ]),
                      _: 1
                    }, 8, ["onClick", "disabled"]),
                    createVNode(_component_UButton, {
                      icon: "i-lucide-download",
                      loading: unref(isExporting),
                      onClick: exportData
                    }, {
                      default: withCtx(() => [
                        createTextVNode(toDisplayString(unref(isExporting) ? "Exporting..." : "Export Data"), 1)
                      ]),
                      _: 1
                    }, 8, ["loading"])
                  ])
                ]),
                default: withCtx(() => [
                  createVNode("div", { class: "space-y-6" }, [
                    createVNode("div", null, [
                      createVNode("label", { class: "block text-sm font-medium mb-3" }, "Export Format"),
                      createVNode("div", { class: "space-y-2" }, [
                        (openBlock(), createBlock(Fragment, null, renderList(formatOptions, (format) => {
                          return createVNode("div", {
                            key: format.value,
                            class: ["flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors", {
                              "border-primary bg-primary/5": unref(exportOptions).format === format.value,
                              "border-gray-200 dark:border-gray-800": unref(exportOptions).format !== format.value
                            }],
                            onClick: ($event) => unref(exportOptions).format = format.value
                          }, [
                            createVNode("div", {
                              class: ["w-4 h-4 rounded-full border-2 flex items-center justify-center", {
                                "border-primary bg-primary": unref(exportOptions).format === format.value,
                                "border-gray-300 dark:border-gray-600": unref(exportOptions).format !== format.value
                              }]
                            }, [
                              unref(exportOptions).format === format.value ? (openBlock(), createBlock("div", {
                                key: 0,
                                class: "w-2 h-2 rounded-full bg-white"
                              })) : createCommentVNode("", true)
                            ], 2),
                            createVNode("div", { class: "flex-1" }, [
                              createVNode("div", { class: "font-medium text-sm" }, toDisplayString(format.label), 1),
                              createVNode("div", { class: "text-xs text-muted" }, toDisplayString(format.description), 1)
                            ])
                          ], 10, ["onClick"]);
                        }), 64))
                      ])
                    ]),
                    createVNode("div", null, [
                      createVNode("label", { class: "block text-sm font-medium mb-3" }, "Forecast Period"),
                      createVNode(_component_USelectMenu, {
                        modelValue: unref(exportOptions).period,
                        "onUpdate:modelValue": ($event) => unref(exportOptions).period = $event,
                        options: periodOptions,
                        "option-attribute": "label",
                        "value-attribute": "value",
                        class: "w-full"
                      }, {
                        option: withCtx(({ option }) => [
                          createVNode("div", null, [
                            createVNode("div", { class: "font-medium" }, toDisplayString(option.label), 1),
                            createVNode("div", { class: "text-xs text-muted" }, toDisplayString(option.description), 1)
                          ])
                        ]),
                        _: 1
                      }, 8, ["modelValue", "onUpdate:modelValue"])
                    ]),
                    createVNode("div", null, [
                      createVNode("label", { class: "block text-sm font-medium mb-3" }, "Include Additional Data"),
                      createVNode("div", { class: "space-y-3" }, [
                        createVNode(_component_UCheckbox, {
                          modelValue: unref(exportOptions).includeScenarios,
                          "onUpdate:modelValue": ($event) => unref(exportOptions).includeScenarios = $event,
                          label: "Scenario Analysis",
                          help: "Best/worst/likely case projections"
                        }, null, 8, ["modelValue", "onUpdate:modelValue"]),
                        createVNode(_component_UCheckbox, {
                          modelValue: unref(exportOptions).includeWaterfall,
                          "onUpdate:modelValue": ($event) => unref(exportOptions).includeWaterfall = $event,
                          label: "Waterfall Breakdown",
                          help: "Detailed cash flow components"
                        }, null, 8, ["modelValue", "onUpdate:modelValue"]),
                        createVNode(_component_UCheckbox, {
                          modelValue: unref(exportOptions).includeInvoices,
                          "onUpdate:modelValue": ($event) => unref(exportOptions).includeInvoices = $event,
                          label: "Outstanding Invoices",
                          help: "Receivables and payables details"
                        }, null, 8, ["modelValue", "onUpdate:modelValue"])
                      ])
                    ]),
                    createVNode("div", { class: "p-3 bg-gray-50 dark:bg-gray-900 rounded-lg" }, [
                      createVNode("div", { class: "flex items-center gap-2 text-sm" }, [
                        createVNode(_component_UIcon, {
                          name: "i-lucide-info",
                          class: "h-4 w-4 text-blue-500"
                        }),
                        createVNode("span", { class: "text-muted" }, [
                          createTextVNode(" Estimated file size: "),
                          createVNode("strong", null, "~" + toDisplayString(unref(estimatedSize)) + " KB", 1)
                        ])
                      ])
                    ])
                  ])
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
const _sfc_setup$1 = _sfc_main$1.setup;
_sfc_main$1.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("components/cashflow/ExportModal.vue");
  return _sfc_setup$1 ? _sfc_setup$1(props, ctx) : void 0;
};
const ExportModal = Object.assign(_sfc_main$1, { __name: "CashflowExportModal" });
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "index",
  __ssrInlineRender: true,
  async setup(__props) {
    let __temp, __restore;
    const { data: cashflowData, pending: cashflowPending, error: cashflowError, refresh: refreshCashflow } = ([__temp, __restore] = withAsyncContext(() => useFetch("/api/xero/reports/cash-flow-forecast?days=90", "$ITl0nfxEHC")), __temp = await __temp, __restore(), __temp);
    const { data: scenarioData, pending: scenarioPending, error: scenarioError, refresh: refreshScenarios } = ([__temp, __restore] = withAsyncContext(() => useFetch("/api/xero/reports/cash-flow-scenarios?days=90", "$umF28GU8xq")), __temp = await __temp, __restore(), __temp);
    const { data: waterfallData, pending: waterfallPending, error: waterfallError, refresh: refreshWaterfall } = ([__temp, __restore] = withAsyncContext(() => useFetch("/api/xero/reports/cash-flow-waterfall?period=30", "$V35LDDvQLm")), __temp = await __temp, __restore(), __temp);
    const { data: invoiceData, pending: invoicePending, error: invoiceError, refresh: refreshInvoices } = ([__temp, __restore] = withAsyncContext(() => useFetch("/api/xero/invoices", "$8E11KH14lV")), __temp = await __temp, __restore(), __temp);
    const { data: bankData, pending: bankPending, error: bankError, refresh: refreshBank } = ([__temp, __restore] = withAsyncContext(() => useFetch("/api/xero/reports/bank-summary", "$jR5wa_bebx")), __temp = await __temp, __restore(), __temp);
    const { data: financialInsights, pending: insightsPending, error: insightsError, refresh: refreshInsights } = ([__temp, __restore] = withAsyncContext(() => useFetch("/api/xero/reports/cash-flow-insights", "$AT_5KfJsFo")), __temp = await __temp, __restore(), __temp);
    const loading = computed(() => cashflowPending.value || scenarioPending.value || waterfallPending.value || invoicePending.value || bankPending.value || insightsPending.value);
    const error = computed(() => cashflowError.value || scenarioError.value || waterfallError.value || invoiceError.value || bankError.value || insightsError.value);
    const { isNotificationsSlideoverOpen } = useDashboard();
    function formatCurrency(value) {
      if (typeof value !== "number" || Number.isNaN(value)) return "-";
      return value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
    }
    function formatPercent(value) {
      if (typeof value !== "number" || Number.isNaN(value)) return "-";
      return value.toLocaleString("en-US", { style: "percent", maximumFractionDigits: 1 });
    }
    function formatDays(value) {
      if (typeof value !== "number" || Number.isNaN(value)) return "-";
      return `${Math.round(value)} days`;
    }
    function formatDate(value) {
      if (!value) return "-";
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return "-";
      return date.toLocaleDateString(void 0, { month: "short", day: "numeric", year: "numeric" });
    }
    function formatRatio(value) {
      if (typeof value !== "number" || Number.isNaN(value)) return "-";
      return value.toFixed(2);
    }
    async function refreshAll() {
      await Promise.all([refreshCashflow(), refreshScenarios(), refreshWaterfall(), refreshInvoices(), refreshBank(), refreshInsights()]);
    }
    const metrics = computed(() => {
      if (!cashflowData.value) return null;
      const data = cashflowData.value;
      const runway = data.dailyBurnRate > 0 ? data.currentCash / data.dailyBurnRate : null;
      const changePercent = data.currentCash > 0 ? (data.projectedEndBalance - data.currentCash) / data.currentCash * 100 : 0;
      return {
        currentCash: data.currentCash,
        projectedEndBalance: data.projectedEndBalance,
        changePercent,
        minProjectedBalance: data.minProjectedBalance,
        maxProjectedBalance: data.maxProjectedBalance,
        burnRate: data.dailyBurnRate,
        runway,
        shortfallCount: data.shortfallDates?.length || 0
      };
    });
    const outstandingSummary = computed(() => {
      if (!invoiceData.value) return null;
      const outstanding = invoiceData.value.outstanding || [];
      const overdue = invoiceData.value.overdue || [];
      const outstandingTotal = outstanding.reduce((sum, inv) => sum + (inv.amountDue || 0), 0);
      const overdueTotal = overdue.reduce((sum, inv) => sum + (inv.amountDue || 0), 0);
      return {
        outstandingCount: outstanding.length,
        outstandingTotal,
        overdueCount: overdue.length,
        overdueTotal,
        totalReceivables: outstandingTotal + overdueTotal
      };
    });
    const workingCapitalMetrics = computed(() => {
      const data = financialInsights.value?.workingCapital;
      if (!data) return null;
      return {
        currentAssets: data.currentAssets,
        currentLiabilities: data.currentLiabilities,
        workingCapital: data.workingCapital,
        quickRatio: data.quickRatio ?? null,
        cashBalance: data.cashBalance
      };
    });
    const receivableInsights = computed(() => {
      const data = financialInsights.value?.receivables;
      if (!data) return null;
      return {
        draftInvoices: data.draftInvoices,
        submittedInvoices: data.submittedInvoices,
        quotes: data.quotes,
        totalPipeline: (data.quotes?.totalPipeline ?? 0) + (data.submittedInvoices?.total ?? 0)
      };
    });
    const payableInsights = computed(() => {
      const data = financialInsights.value?.payables;
      if (!data) return null;
      return {
        draftBills: data.draftBills,
        submittedBills: data.submittedBills,
        purchaseOrders: data.purchaseOrders,
        totalPipeline: (data.purchaseOrders?.totalPipeline ?? 0) + (data.submittedBills?.total ?? 0)
      };
    });
    const topOutstandingClients = computed(() => financialInsights.value?.clients?.topOutstanding || []);
    const forecastChartData = computed(() => ({
      data: cashflowData.value,
      loading: loading.value
    }));
    const cashflowStatus = computed(() => {
      if (!metrics.value) return "unknown";
      if (metrics.value.shortfallCount > 0) return "critical";
      if (metrics.value.minProjectedBalance < 1e4) return "warning";
      if (metrics.value.changePercent < -20) return "caution";
      return "healthy";
    });
    const statusConfig = {
      healthy: { color: "emerald", icon: "i-lucide-trending-up" },
      caution: { color: "amber", icon: "i-lucide-alert-triangle" },
      warning: { color: "orange", icon: "i-lucide-alert-circle" },
      critical: { color: "red", icon: "i-lucide-alert-octagon" },
      unknown: { color: "gray", icon: "i-lucide-help-circle" }
    };
    const showExportModal = ref(false);
    const breadcrumbs = computed(() => [
      { label: "Reports", to: "/reports" },
      { label: "Cash Flow", to: "/cashflow" }
    ]);
    return (_ctx, _push, _parent, _attrs) => {
      const _component_UDashboardPanel = _sfc_main$1$1;
      const _component_UDashboardNavbar = _sfc_main$8;
      const _component_UDashboardSidebarCollapse = _sfc_main$b;
      const _component_UTooltip = _sfc_main$a;
      const _component_UButton = _sfc_main$9;
      const _component_UIcon = _sfc_main$e;
      const _component_UDashboardToolbar = _sfc_main$c;
      const _component_UDashboardBreadcrumb = resolveComponent("UDashboardBreadcrumb");
      const _component_USkeleton = _sfc_main$5;
      const _component_UAlert = _sfc_main$6;
      const _component_UCard = _sfc_main$7;
      _push(ssrRenderComponent(_component_UDashboardPanel, mergeProps({ id: "cashflow" }, _attrs), {
        header: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            _push2(ssrRenderComponent(_component_UDashboardNavbar, {
              title: "Cash Flow",
              description: "Real-time cash position, forecast, and insights"
            }, {
              leading: withCtx((_2, _push3, _parent3, _scopeId2) => {
                if (_push3) {
                  _push3(ssrRenderComponent(_component_UDashboardSidebarCollapse, null, null, _parent3, _scopeId2));
                } else {
                  return [
                    createVNode(_component_UDashboardSidebarCollapse)
                  ];
                }
              }),
              right: withCtx((_2, _push3, _parent3, _scopeId2) => {
                if (_push3) {
                  _push3(ssrRenderComponent(_component_UTooltip, {
                    text: "Notifications",
                    shortcuts: ["N"]
                  }, {
                    default: withCtx((_3, _push4, _parent4, _scopeId3) => {
                      if (_push4) {
                        _push4(ssrRenderComponent(_component_UButton, {
                          color: "neutral",
                          variant: "ghost",
                          square: "",
                          onClick: ($event) => isNotificationsSlideoverOpen.value = true
                        }, {
                          default: withCtx((_4, _push5, _parent5, _scopeId4) => {
                            if (_push5) {
                              _push5(ssrRenderComponent(_component_UIcon, {
                                name: "i-lucide-bell",
                                class: "size-5"
                              }, null, _parent5, _scopeId4));
                            } else {
                              return [
                                createVNode(_component_UIcon, {
                                  name: "i-lucide-bell",
                                  class: "size-5"
                                })
                              ];
                            }
                          }),
                          _: 1
                        }, _parent4, _scopeId3));
                      } else {
                        return [
                          createVNode(_component_UButton, {
                            color: "neutral",
                            variant: "ghost",
                            square: "",
                            onClick: ($event) => isNotificationsSlideoverOpen.value = true
                          }, {
                            default: withCtx(() => [
                              createVNode(_component_UIcon, {
                                name: "i-lucide-bell",
                                class: "size-5"
                              })
                            ]),
                            _: 1
                          }, 8, ["onClick"])
                        ];
                      }
                    }),
                    _: 1
                  }, _parent3, _scopeId2));
                } else {
                  return [
                    createVNode(_component_UTooltip, {
                      text: "Notifications",
                      shortcuts: ["N"]
                    }, {
                      default: withCtx(() => [
                        createVNode(_component_UButton, {
                          color: "neutral",
                          variant: "ghost",
                          square: "",
                          onClick: ($event) => isNotificationsSlideoverOpen.value = true
                        }, {
                          default: withCtx(() => [
                            createVNode(_component_UIcon, {
                              name: "i-lucide-bell",
                              class: "size-5"
                            })
                          ]),
                          _: 1
                        }, 8, ["onClick"])
                      ]),
                      _: 1
                    })
                  ];
                }
              }),
              _: 1
            }, _parent2, _scopeId));
            _push2(ssrRenderComponent(_component_UDashboardToolbar, null, {
              left: withCtx((_2, _push3, _parent3, _scopeId2) => {
                if (_push3) {
                  _push3(ssrRenderComponent(_component_UDashboardBreadcrumb, { items: unref(breadcrumbs) }, null, _parent3, _scopeId2));
                } else {
                  return [
                    createVNode(_component_UDashboardBreadcrumb, { items: unref(breadcrumbs) }, null, 8, ["items"])
                  ];
                }
              }),
              right: withCtx((_2, _push3, _parent3, _scopeId2) => {
                if (_push3) {
                  _push3(`<div class="flex gap-2"${_scopeId2}>`);
                  _push3(ssrRenderComponent(_component_UButton, {
                    icon: statusConfig[unref(cashflowStatus)].icon,
                    color: statusConfig[unref(cashflowStatus)].color,
                    variant: "subtle",
                    label: unref(cashflowStatus).charAt(0).toUpperCase() + unref(cashflowStatus).slice(1),
                    size: "sm"
                  }, null, _parent3, _scopeId2));
                  _push3(ssrRenderComponent(_component_UButton, {
                    label: "Refresh",
                    color: "neutral",
                    icon: "i-lucide-refresh-cw",
                    loading: unref(loading),
                    onClick: refreshAll
                  }, null, _parent3, _scopeId2));
                  _push3(`</div>`);
                } else {
                  return [
                    createVNode("div", { class: "flex gap-2" }, [
                      createVNode(_component_UButton, {
                        icon: statusConfig[unref(cashflowStatus)].icon,
                        color: statusConfig[unref(cashflowStatus)].color,
                        variant: "subtle",
                        label: unref(cashflowStatus).charAt(0).toUpperCase() + unref(cashflowStatus).slice(1),
                        size: "sm"
                      }, null, 8, ["icon", "color", "label"]),
                      createVNode(_component_UButton, {
                        label: "Refresh",
                        color: "neutral",
                        icon: "i-lucide-refresh-cw",
                        loading: unref(loading),
                        onClick: refreshAll
                      }, null, 8, ["loading"])
                    ])
                  ];
                }
              }),
              _: 1
            }, _parent2, _scopeId));
          } else {
            return [
              createVNode(_component_UDashboardNavbar, {
                title: "Cash Flow",
                description: "Real-time cash position, forecast, and insights"
              }, {
                leading: withCtx(() => [
                  createVNode(_component_UDashboardSidebarCollapse)
                ]),
                right: withCtx(() => [
                  createVNode(_component_UTooltip, {
                    text: "Notifications",
                    shortcuts: ["N"]
                  }, {
                    default: withCtx(() => [
                      createVNode(_component_UButton, {
                        color: "neutral",
                        variant: "ghost",
                        square: "",
                        onClick: ($event) => isNotificationsSlideoverOpen.value = true
                      }, {
                        default: withCtx(() => [
                          createVNode(_component_UIcon, {
                            name: "i-lucide-bell",
                            class: "size-5"
                          })
                        ]),
                        _: 1
                      }, 8, ["onClick"])
                    ]),
                    _: 1
                  })
                ]),
                _: 1
              }),
              createVNode(_component_UDashboardToolbar, null, {
                left: withCtx(() => [
                  createVNode(_component_UDashboardBreadcrumb, { items: unref(breadcrumbs) }, null, 8, ["items"])
                ]),
                right: withCtx(() => [
                  createVNode("div", { class: "flex gap-2" }, [
                    createVNode(_component_UButton, {
                      icon: statusConfig[unref(cashflowStatus)].icon,
                      color: statusConfig[unref(cashflowStatus)].color,
                      variant: "subtle",
                      label: unref(cashflowStatus).charAt(0).toUpperCase() + unref(cashflowStatus).slice(1),
                      size: "sm"
                    }, null, 8, ["icon", "color", "label"]),
                    createVNode(_component_UButton, {
                      label: "Refresh",
                      color: "neutral",
                      icon: "i-lucide-refresh-cw",
                      loading: unref(loading),
                      onClick: refreshAll
                    }, null, 8, ["loading"])
                  ])
                ]),
                _: 1
              })
            ];
          }
        }),
        body: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            if (unref(loading)) {
              _push2(`<div class="space-y-6"${_scopeId}><div class="grid grid-cols-1 lg:grid-cols-4 gap-4"${_scopeId}><!--[-->`);
              ssrRenderList(4, (i) => {
                _push2(ssrRenderComponent(_component_USkeleton, {
                  class: "h-32",
                  key: i
                }, null, _parent2, _scopeId));
              });
              _push2(`<!--]--></div>`);
              _push2(ssrRenderComponent(_component_USkeleton, { class: "h-96" }, null, _parent2, _scopeId));
              _push2(`</div>`);
            } else if (unref(error)) {
              _push2(ssrRenderComponent(_component_UAlert, {
                icon: "i-lucide-alert-circle",
                color: "red",
                variant: "subtle",
                title: "Failed to load cash flow data",
                description: unref(error).statusMessage || "Please check your connection and try again.",
                class: "mb-6"
              }, null, _parent2, _scopeId));
            } else {
              _push2(`<div class="space-y-6"${_scopeId}><div class="grid grid-cols-1 lg:grid-cols-4 gap-4"${_scopeId}>`);
              _push2(ssrRenderComponent(_component_UCard, null, {
                default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                  if (_push3) {
                    _push3(`<div class="flex items-center justify-between"${_scopeId2}><div${_scopeId2}><p class="text-sm text-muted"${_scopeId2}>Current Cash</p><p class="text-2xl font-bold"${_scopeId2}>${ssrInterpolate(formatCurrency(unref(metrics)?.currentCash))}</p></div>`);
                    _push3(ssrRenderComponent(_component_UIcon, {
                      name: "i-lucide-wallet",
                      class: "h-8 w-8 text-blue-500"
                    }, null, _parent3, _scopeId2));
                    _push3(`</div><div class="mt-2 text-xs text-muted"${_scopeId2}> As of ${ssrInterpolate((/* @__PURE__ */ new Date()).toLocaleDateString())}</div>`);
                  } else {
                    return [
                      createVNode("div", { class: "flex items-center justify-between" }, [
                        createVNode("div", null, [
                          createVNode("p", { class: "text-sm text-muted" }, "Current Cash"),
                          createVNode("p", { class: "text-2xl font-bold" }, toDisplayString(formatCurrency(unref(metrics)?.currentCash)), 1)
                        ]),
                        createVNode(_component_UIcon, {
                          name: "i-lucide-wallet",
                          class: "h-8 w-8 text-blue-500"
                        })
                      ]),
                      createVNode("div", { class: "mt-2 text-xs text-muted" }, " As of " + toDisplayString((/* @__PURE__ */ new Date()).toLocaleDateString()), 1)
                    ];
                  }
                }),
                _: 1
              }, _parent2, _scopeId));
              _push2(ssrRenderComponent(_component_UCard, null, {
                default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                  if (_push3) {
                    _push3(`<div class="flex items-center justify-between"${_scopeId2}><div${_scopeId2}><p class="text-sm text-muted"${_scopeId2}>90-Day Projection</p><p class="${ssrRenderClass([{
                      "text-red-600": (unref(metrics)?.changePercent || 0) < -10,
                      "text-amber-600": (unref(metrics)?.changePercent || 0) < 0,
                      "text-emerald-600": (unref(metrics)?.changePercent || 0) > 0
                    }, "text-2xl font-bold"])}"${_scopeId2}>${ssrInterpolate(formatCurrency(unref(metrics)?.projectedEndBalance))}</p></div>`);
                    _push3(ssrRenderComponent(_component_UIcon, {
                      name: (unref(metrics)?.changePercent || 0) >= 0 ? "i-lucide-trending-up" : "i-lucide-trending-down",
                      class: [(unref(metrics)?.changePercent || 0) >= 0 ? "text-emerald-500" : "text-red-500", "h-8 w-8"]
                    }, null, _parent3, _scopeId2));
                    _push3(`</div><div class="${ssrRenderClass([{
                      "text-red-600": (unref(metrics)?.changePercent || 0) < 0,
                      "text-emerald-600": (unref(metrics)?.changePercent || 0) > 0,
                      "text-muted": (unref(metrics)?.changePercent || 0) === 0
                    }, "mt-2 text-xs"])}"${_scopeId2}>${ssrInterpolate((unref(metrics)?.changePercent || 0) >= 0 ? "+" : "")}${ssrInterpolate(formatPercent((unref(metrics)?.changePercent || 0) / 100))} change </div>`);
                  } else {
                    return [
                      createVNode("div", { class: "flex items-center justify-between" }, [
                        createVNode("div", null, [
                          createVNode("p", { class: "text-sm text-muted" }, "90-Day Projection"),
                          createVNode("p", {
                            class: ["text-2xl font-bold", {
                              "text-red-600": (unref(metrics)?.changePercent || 0) < -10,
                              "text-amber-600": (unref(metrics)?.changePercent || 0) < 0,
                              "text-emerald-600": (unref(metrics)?.changePercent || 0) > 0
                            }]
                          }, toDisplayString(formatCurrency(unref(metrics)?.projectedEndBalance)), 3)
                        ]),
                        createVNode(_component_UIcon, {
                          name: (unref(metrics)?.changePercent || 0) >= 0 ? "i-lucide-trending-up" : "i-lucide-trending-down",
                          class: [(unref(metrics)?.changePercent || 0) >= 0 ? "text-emerald-500" : "text-red-500", "h-8 w-8"]
                        }, null, 8, ["name", "class"])
                      ]),
                      createVNode("div", {
                        class: ["mt-2 text-xs", {
                          "text-red-600": (unref(metrics)?.changePercent || 0) < 0,
                          "text-emerald-600": (unref(metrics)?.changePercent || 0) > 0,
                          "text-muted": (unref(metrics)?.changePercent || 0) === 0
                        }]
                      }, toDisplayString((unref(metrics)?.changePercent || 0) >= 0 ? "+" : "") + toDisplayString(formatPercent((unref(metrics)?.changePercent || 0) / 100)) + " change ", 3)
                    ];
                  }
                }),
                _: 1
              }, _parent2, _scopeId));
              _push2(ssrRenderComponent(_component_UCard, null, {
                default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                  if (_push3) {
                    _push3(`<div class="flex items-center justify-between"${_scopeId2}><div${_scopeId2}><p class="text-sm text-muted"${_scopeId2}>Cash Runway</p><p class="${ssrRenderClass([{
                      "text-red-600": (unref(metrics)?.runway || 0) < 30,
                      "text-amber-600": (unref(metrics)?.runway || 0) < 60,
                      "text-emerald-600": (unref(metrics)?.runway || 0) >= 60
                    }, "text-2xl font-bold"])}"${_scopeId2}>${ssrInterpolate(formatDays(unref(metrics)?.runway))}</p></div>`);
                    _push3(ssrRenderComponent(_component_UIcon, {
                      name: "i-lucide-timer",
                      class: "h-8 w-8 text-purple-500"
                    }, null, _parent3, _scopeId2));
                    _push3(`</div><div class="mt-2 text-xs text-muted"${_scopeId2}> At current burn rate: ${ssrInterpolate(formatCurrency(unref(metrics)?.burnRate))}/day </div>`);
                  } else {
                    return [
                      createVNode("div", { class: "flex items-center justify-between" }, [
                        createVNode("div", null, [
                          createVNode("p", { class: "text-sm text-muted" }, "Cash Runway"),
                          createVNode("p", {
                            class: ["text-2xl font-bold", {
                              "text-red-600": (unref(metrics)?.runway || 0) < 30,
                              "text-amber-600": (unref(metrics)?.runway || 0) < 60,
                              "text-emerald-600": (unref(metrics)?.runway || 0) >= 60
                            }]
                          }, toDisplayString(formatDays(unref(metrics)?.runway)), 3)
                        ]),
                        createVNode(_component_UIcon, {
                          name: "i-lucide-timer",
                          class: "h-8 w-8 text-purple-500"
                        })
                      ]),
                      createVNode("div", { class: "mt-2 text-xs text-muted" }, " At current burn rate: " + toDisplayString(formatCurrency(unref(metrics)?.burnRate)) + "/day ", 1)
                    ];
                  }
                }),
                _: 1
              }, _parent2, _scopeId));
              _push2(ssrRenderComponent(_component_UCard, null, {
                default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                  if (_push3) {
                    _push3(`<div class="flex items-center justify-between"${_scopeId2}><div${_scopeId2}><p class="text-sm text-muted"${_scopeId2}>Outstanding Receivables</p><p class="text-2xl font-bold text-emerald-600"${_scopeId2}>${ssrInterpolate(formatCurrency(unref(outstandingSummary)?.totalReceivables))}</p></div>`);
                    _push3(ssrRenderComponent(_component_UIcon, {
                      name: "i-lucide-receipt",
                      class: "h-8 w-8 text-emerald-500"
                    }, null, _parent3, _scopeId2));
                    _push3(`</div><div class="mt-2 text-xs text-muted"${_scopeId2}>${ssrInterpolate(unref(outstandingSummary)?.outstandingCount || 0)} outstanding, ${ssrInterpolate(unref(outstandingSummary)?.overdueCount || 0)} overdue </div>`);
                  } else {
                    return [
                      createVNode("div", { class: "flex items-center justify-between" }, [
                        createVNode("div", null, [
                          createVNode("p", { class: "text-sm text-muted" }, "Outstanding Receivables"),
                          createVNode("p", { class: "text-2xl font-bold text-emerald-600" }, toDisplayString(formatCurrency(unref(outstandingSummary)?.totalReceivables)), 1)
                        ]),
                        createVNode(_component_UIcon, {
                          name: "i-lucide-receipt",
                          class: "h-8 w-8 text-emerald-500"
                        })
                      ]),
                      createVNode("div", { class: "mt-2 text-xs text-muted" }, toDisplayString(unref(outstandingSummary)?.outstandingCount || 0) + " outstanding, " + toDisplayString(unref(outstandingSummary)?.overdueCount || 0) + " overdue ", 1)
                    ];
                  }
                }),
                _: 1
              }, _parent2, _scopeId));
              _push2(`</div>`);
              if (unref(workingCapitalMetrics) || unref(receivableInsights) || unref(payableInsights)) {
                _push2(`<div class="grid grid-cols-1 xl:grid-cols-3 gap-4"${_scopeId}>`);
                if (unref(workingCapitalMetrics)) {
                  _push2(ssrRenderComponent(_component_UCard, null, {
                    header: withCtx((_2, _push3, _parent3, _scopeId2) => {
                      if (_push3) {
                        _push3(`<div class="flex items-center justify-between"${_scopeId2}><div${_scopeId2}><h3 class="text-base font-semibold"${_scopeId2}>Working Capital</h3><p class="text-xs text-muted"${_scopeId2}>Balance sheet snapshot</p></div>`);
                        _push3(ssrRenderComponent(_component_UIcon, {
                          name: "i-lucide-pie-chart",
                          class: "h-5 w-5 text-blue-500"
                        }, null, _parent3, _scopeId2));
                        _push3(`</div>`);
                      } else {
                        return [
                          createVNode("div", { class: "flex items-center justify-between" }, [
                            createVNode("div", null, [
                              createVNode("h3", { class: "text-base font-semibold" }, "Working Capital"),
                              createVNode("p", { class: "text-xs text-muted" }, "Balance sheet snapshot")
                            ]),
                            createVNode(_component_UIcon, {
                              name: "i-lucide-pie-chart",
                              class: "h-5 w-5 text-blue-500"
                            })
                          ])
                        ];
                      }
                    }),
                    default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                      if (_push3) {
                        _push3(`<div class="space-y-3 text-sm"${_scopeId2}><div class="flex items-center justify-between"${_scopeId2}><span class="text-muted"${_scopeId2}>Current Assets</span><span class="font-medium"${_scopeId2}>${ssrInterpolate(formatCurrency(unref(workingCapitalMetrics).currentAssets))}</span></div><div class="flex items-center justify-between"${_scopeId2}><span class="text-muted"${_scopeId2}>Current Liabilities</span><span class="font-medium"${_scopeId2}>${ssrInterpolate(formatCurrency(unref(workingCapitalMetrics).currentLiabilities))}</span></div><div class="flex items-center justify-between pt-2 border-t border-default"${_scopeId2}><span class="text-muted"${_scopeId2}>Working Capital</span><span class="${ssrRenderClass(unref(workingCapitalMetrics).workingCapital >= 0 ? "text-emerald-600 font-semibold" : "text-red-600 font-semibold")}"${_scopeId2}>${ssrInterpolate(formatCurrency(unref(workingCapitalMetrics).workingCapital))}</span></div><div class="flex items-center justify-between text-xs"${_scopeId2}><span class="text-muted"${_scopeId2}>Quick Ratio</span><span class="font-medium"${_scopeId2}>${ssrInterpolate(formatRatio(unref(workingCapitalMetrics).quickRatio))}</span></div><div class="flex items-center justify-between text-xs"${_scopeId2}><span class="text-muted"${_scopeId2}>Cash &amp; Equivalents</span><span class="font-medium"${_scopeId2}>${ssrInterpolate(formatCurrency(unref(workingCapitalMetrics).cashBalance))}</span></div></div>`);
                      } else {
                        return [
                          createVNode("div", { class: "space-y-3 text-sm" }, [
                            createVNode("div", { class: "flex items-center justify-between" }, [
                              createVNode("span", { class: "text-muted" }, "Current Assets"),
                              createVNode("span", { class: "font-medium" }, toDisplayString(formatCurrency(unref(workingCapitalMetrics).currentAssets)), 1)
                            ]),
                            createVNode("div", { class: "flex items-center justify-between" }, [
                              createVNode("span", { class: "text-muted" }, "Current Liabilities"),
                              createVNode("span", { class: "font-medium" }, toDisplayString(formatCurrency(unref(workingCapitalMetrics).currentLiabilities)), 1)
                            ]),
                            createVNode("div", { class: "flex items-center justify-between pt-2 border-t border-default" }, [
                              createVNode("span", { class: "text-muted" }, "Working Capital"),
                              createVNode("span", {
                                class: unref(workingCapitalMetrics).workingCapital >= 0 ? "text-emerald-600 font-semibold" : "text-red-600 font-semibold"
                              }, toDisplayString(formatCurrency(unref(workingCapitalMetrics).workingCapital)), 3)
                            ]),
                            createVNode("div", { class: "flex items-center justify-between text-xs" }, [
                              createVNode("span", { class: "text-muted" }, "Quick Ratio"),
                              createVNode("span", { class: "font-medium" }, toDisplayString(formatRatio(unref(workingCapitalMetrics).quickRatio)), 1)
                            ]),
                            createVNode("div", { class: "flex items-center justify-between text-xs" }, [
                              createVNode("span", { class: "text-muted" }, "Cash & Equivalents"),
                              createVNode("span", { class: "font-medium" }, toDisplayString(formatCurrency(unref(workingCapitalMetrics).cashBalance)), 1)
                            ])
                          ])
                        ];
                      }
                    }),
                    _: 1
                  }, _parent2, _scopeId));
                } else {
                  _push2(`<!---->`);
                }
                if (unref(receivableInsights)) {
                  _push2(ssrRenderComponent(_component_UCard, null, {
                    header: withCtx((_2, _push3, _parent3, _scopeId2) => {
                      if (_push3) {
                        _push3(`<div class="flex items-center justify-between"${_scopeId2}><div${_scopeId2}><h3 class="text-base font-semibold"${_scopeId2}>Revenue Pipeline</h3><p class="text-xs text-muted"${_scopeId2}>Pending client billings</p></div>`);
                        _push3(ssrRenderComponent(_component_UIcon, {
                          name: "i-lucide-trending-up",
                          class: "h-5 w-5 text-emerald-500"
                        }, null, _parent3, _scopeId2));
                        _push3(`</div>`);
                      } else {
                        return [
                          createVNode("div", { class: "flex items-center justify-between" }, [
                            createVNode("div", null, [
                              createVNode("h3", { class: "text-base font-semibold" }, "Revenue Pipeline"),
                              createVNode("p", { class: "text-xs text-muted" }, "Pending client billings")
                            ]),
                            createVNode(_component_UIcon, {
                              name: "i-lucide-trending-up",
                              class: "h-5 w-5 text-emerald-500"
                            })
                          ])
                        ];
                      }
                    }),
                    default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                      if (_push3) {
                        _push3(`<div class="space-y-3 text-sm"${_scopeId2}><div${_scopeId2}><div class="flex items-center justify-between"${_scopeId2}><span class="text-muted"${_scopeId2}>Draft Invoices</span><span class="font-medium"${_scopeId2}>${ssrInterpolate(formatCurrency(unref(receivableInsights).draftInvoices?.total))}</span></div><p class="text-xs text-muted"${_scopeId2}>${ssrInterpolate(unref(receivableInsights).draftInvoices?.count || 0)} in preparation</p></div><div${_scopeId2}><div class="flex items-center justify-between"${_scopeId2}><span class="text-muted"${_scopeId2}>Submitted Invoices</span><span class="font-medium"${_scopeId2}>${ssrInterpolate(formatCurrency(unref(receivableInsights).submittedInvoices?.total))}</span></div><p class="text-xs text-muted"${_scopeId2}>${ssrInterpolate(unref(receivableInsights).submittedInvoices?.count || 0)} awaiting approval</p></div><div${_scopeId2}><div class="flex items-center justify-between"${_scopeId2}><span class="text-muted"${_scopeId2}>Draft Quotes</span><span class="font-medium"${_scopeId2}>${ssrInterpolate(formatCurrency(unref(receivableInsights).quotes?.draft?.total))}</span></div><p class="text-xs text-muted"${_scopeId2}>${ssrInterpolate(unref(receivableInsights).quotes?.draft?.count || 0)} in scoping</p></div><div${_scopeId2}><div class="flex items-center justify-between"${_scopeId2}><span class="text-muted"${_scopeId2}>Sent Quotes</span><span class="font-medium"${_scopeId2}>${ssrInterpolate(formatCurrency(unref(receivableInsights).quotes?.sent?.total))}</span></div><p class="text-xs text-muted"${_scopeId2}>${ssrInterpolate(unref(receivableInsights).quotes?.sent?.count || 0)} with clients</p></div><div${_scopeId2}><div class="flex items-center justify-between"${_scopeId2}><span class="text-muted"${_scopeId2}>Accepted Quotes</span><span class="font-medium"${_scopeId2}>${ssrInterpolate(formatCurrency(unref(receivableInsights).quotes?.accepted?.total))}</span></div><p class="text-xs text-muted"${_scopeId2}>${ssrInterpolate(unref(receivableInsights).quotes?.accepted?.count || 0)} ready to invoice</p></div><div class="pt-2 border-t border-default text-xs flex items-center justify-between"${_scopeId2}><span class="text-muted"${_scopeId2}>Total Revenue Pipeline</span><span class="font-semibold text-emerald-600"${_scopeId2}>${ssrInterpolate(formatCurrency(unref(receivableInsights).totalPipeline))}</span></div></div>`);
                      } else {
                        return [
                          createVNode("div", { class: "space-y-3 text-sm" }, [
                            createVNode("div", null, [
                              createVNode("div", { class: "flex items-center justify-between" }, [
                                createVNode("span", { class: "text-muted" }, "Draft Invoices"),
                                createVNode("span", { class: "font-medium" }, toDisplayString(formatCurrency(unref(receivableInsights).draftInvoices?.total)), 1)
                              ]),
                              createVNode("p", { class: "text-xs text-muted" }, toDisplayString(unref(receivableInsights).draftInvoices?.count || 0) + " in preparation", 1)
                            ]),
                            createVNode("div", null, [
                              createVNode("div", { class: "flex items-center justify-between" }, [
                                createVNode("span", { class: "text-muted" }, "Submitted Invoices"),
                                createVNode("span", { class: "font-medium" }, toDisplayString(formatCurrency(unref(receivableInsights).submittedInvoices?.total)), 1)
                              ]),
                              createVNode("p", { class: "text-xs text-muted" }, toDisplayString(unref(receivableInsights).submittedInvoices?.count || 0) + " awaiting approval", 1)
                            ]),
                            createVNode("div", null, [
                              createVNode("div", { class: "flex items-center justify-between" }, [
                                createVNode("span", { class: "text-muted" }, "Draft Quotes"),
                                createVNode("span", { class: "font-medium" }, toDisplayString(formatCurrency(unref(receivableInsights).quotes?.draft?.total)), 1)
                              ]),
                              createVNode("p", { class: "text-xs text-muted" }, toDisplayString(unref(receivableInsights).quotes?.draft?.count || 0) + " in scoping", 1)
                            ]),
                            createVNode("div", null, [
                              createVNode("div", { class: "flex items-center justify-between" }, [
                                createVNode("span", { class: "text-muted" }, "Sent Quotes"),
                                createVNode("span", { class: "font-medium" }, toDisplayString(formatCurrency(unref(receivableInsights).quotes?.sent?.total)), 1)
                              ]),
                              createVNode("p", { class: "text-xs text-muted" }, toDisplayString(unref(receivableInsights).quotes?.sent?.count || 0) + " with clients", 1)
                            ]),
                            createVNode("div", null, [
                              createVNode("div", { class: "flex items-center justify-between" }, [
                                createVNode("span", { class: "text-muted" }, "Accepted Quotes"),
                                createVNode("span", { class: "font-medium" }, toDisplayString(formatCurrency(unref(receivableInsights).quotes?.accepted?.total)), 1)
                              ]),
                              createVNode("p", { class: "text-xs text-muted" }, toDisplayString(unref(receivableInsights).quotes?.accepted?.count || 0) + " ready to invoice", 1)
                            ]),
                            createVNode("div", { class: "pt-2 border-t border-default text-xs flex items-center justify-between" }, [
                              createVNode("span", { class: "text-muted" }, "Total Revenue Pipeline"),
                              createVNode("span", { class: "font-semibold text-emerald-600" }, toDisplayString(formatCurrency(unref(receivableInsights).totalPipeline)), 1)
                            ])
                          ])
                        ];
                      }
                    }),
                    _: 1
                  }, _parent2, _scopeId));
                } else {
                  _push2(`<!---->`);
                }
                if (unref(payableInsights)) {
                  _push2(ssrRenderComponent(_component_UCard, null, {
                    header: withCtx((_2, _push3, _parent3, _scopeId2) => {
                      if (_push3) {
                        _push3(`<div class="flex items-center justify-between"${_scopeId2}><div${_scopeId2}><h3 class="text-base font-semibold"${_scopeId2}>Media &amp; Vendor Commitments</h3><p class="text-xs text-muted"${_scopeId2}>Upcoming cash requirements</p></div>`);
                        _push3(ssrRenderComponent(_component_UIcon, {
                          name: "i-lucide-trending-down",
                          class: "h-5 w-5 text-red-500"
                        }, null, _parent3, _scopeId2));
                        _push3(`</div>`);
                      } else {
                        return [
                          createVNode("div", { class: "flex items-center justify-between" }, [
                            createVNode("div", null, [
                              createVNode("h3", { class: "text-base font-semibold" }, "Media & Vendor Commitments"),
                              createVNode("p", { class: "text-xs text-muted" }, "Upcoming cash requirements")
                            ]),
                            createVNode(_component_UIcon, {
                              name: "i-lucide-trending-down",
                              class: "h-5 w-5 text-red-500"
                            })
                          ])
                        ];
                      }
                    }),
                    default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                      if (_push3) {
                        _push3(`<div class="space-y-3 text-sm"${_scopeId2}><div${_scopeId2}><div class="flex items-center justify-between"${_scopeId2}><span class="text-muted"${_scopeId2}>Draft Bills</span><span class="font-medium"${_scopeId2}>${ssrInterpolate(formatCurrency(unref(payableInsights).draftBills?.total))}</span></div><p class="text-xs text-muted"${_scopeId2}>${ssrInterpolate(unref(payableInsights).draftBills?.count || 0)} in review</p></div><div${_scopeId2}><div class="flex items-center justify-between"${_scopeId2}><span class="text-muted"${_scopeId2}>Submitted Bills</span><span class="font-medium"${_scopeId2}>${ssrInterpolate(formatCurrency(unref(payableInsights).submittedBills?.total))}</span></div><p class="text-xs text-muted"${_scopeId2}>${ssrInterpolate(unref(payableInsights).submittedBills?.count || 0)} awaiting approval</p></div><div${_scopeId2}><div class="flex items-center justify-between"${_scopeId2}><span class="text-muted"${_scopeId2}>Purchase Orders</span><span class="font-medium"${_scopeId2}>${ssrInterpolate(formatCurrency(unref(payableInsights).purchaseOrders?.totalPipeline))}</span></div><p class="text-xs text-muted"${_scopeId2}>${ssrInterpolate((unref(payableInsights).purchaseOrders?.draft?.count || 0) + (unref(payableInsights).purchaseOrders?.submitted?.count || 0))} open commitments</p></div><div class="pt-2 border-t border-default text-xs flex items-center justify-between"${_scopeId2}><span class="text-muted"${_scopeId2}>Total Cash Obligations</span><span class="font-semibold text-red-600"${_scopeId2}>${ssrInterpolate(formatCurrency(unref(payableInsights).totalPipeline))}</span></div></div>`);
                      } else {
                        return [
                          createVNode("div", { class: "space-y-3 text-sm" }, [
                            createVNode("div", null, [
                              createVNode("div", { class: "flex items-center justify-between" }, [
                                createVNode("span", { class: "text-muted" }, "Draft Bills"),
                                createVNode("span", { class: "font-medium" }, toDisplayString(formatCurrency(unref(payableInsights).draftBills?.total)), 1)
                              ]),
                              createVNode("p", { class: "text-xs text-muted" }, toDisplayString(unref(payableInsights).draftBills?.count || 0) + " in review", 1)
                            ]),
                            createVNode("div", null, [
                              createVNode("div", { class: "flex items-center justify-between" }, [
                                createVNode("span", { class: "text-muted" }, "Submitted Bills"),
                                createVNode("span", { class: "font-medium" }, toDisplayString(formatCurrency(unref(payableInsights).submittedBills?.total)), 1)
                              ]),
                              createVNode("p", { class: "text-xs text-muted" }, toDisplayString(unref(payableInsights).submittedBills?.count || 0) + " awaiting approval", 1)
                            ]),
                            createVNode("div", null, [
                              createVNode("div", { class: "flex items-center justify-between" }, [
                                createVNode("span", { class: "text-muted" }, "Purchase Orders"),
                                createVNode("span", { class: "font-medium" }, toDisplayString(formatCurrency(unref(payableInsights).purchaseOrders?.totalPipeline)), 1)
                              ]),
                              createVNode("p", { class: "text-xs text-muted" }, toDisplayString((unref(payableInsights).purchaseOrders?.draft?.count || 0) + (unref(payableInsights).purchaseOrders?.submitted?.count || 0)) + " open commitments", 1)
                            ]),
                            createVNode("div", { class: "pt-2 border-t border-default text-xs flex items-center justify-between" }, [
                              createVNode("span", { class: "text-muted" }, "Total Cash Obligations"),
                              createVNode("span", { class: "font-semibold text-red-600" }, toDisplayString(formatCurrency(unref(payableInsights).totalPipeline)), 1)
                            ])
                          ])
                        ];
                      }
                    }),
                    _: 1
                  }, _parent2, _scopeId));
                } else {
                  _push2(`<!---->`);
                }
                _push2(`</div>`);
              } else {
                _push2(`<!---->`);
              }
              _push2(ssrRenderComponent(_component_UCard, { class: "col-span-full" }, {
                header: withCtx((_2, _push3, _parent3, _scopeId2) => {
                  if (_push3) {
                    _push3(`<div class="flex items-center justify-between"${_scopeId2}><div${_scopeId2}><h3 class="text-lg font-semibold"${_scopeId2}>90-Day Cash Flow Forecast</h3><p class="text-sm text-muted"${_scopeId2}>Projected daily cash position with inflows and outflows</p></div><div class="flex gap-2"${_scopeId2}>`);
                    _push3(ssrRenderComponent(_component_UButton, {
                      icon: "i-lucide-download",
                      size: "sm",
                      color: "neutral",
                      variant: "ghost",
                      label: "Export",
                      onClick: ($event) => showExportModal.value = true
                    }, null, _parent3, _scopeId2));
                    _push3(ssrRenderComponent(_component_UButton, {
                      icon: "i-lucide-settings",
                      size: "sm",
                      color: "neutral",
                      variant: "ghost",
                      label: "Configure"
                    }, null, _parent3, _scopeId2));
                    _push3(`</div></div>`);
                  } else {
                    return [
                      createVNode("div", { class: "flex items-center justify-between" }, [
                        createVNode("div", null, [
                          createVNode("h3", { class: "text-lg font-semibold" }, "90-Day Cash Flow Forecast"),
                          createVNode("p", { class: "text-sm text-muted" }, "Projected daily cash position with inflows and outflows")
                        ]),
                        createVNode("div", { class: "flex gap-2" }, [
                          createVNode(_component_UButton, {
                            icon: "i-lucide-download",
                            size: "sm",
                            color: "neutral",
                            variant: "ghost",
                            label: "Export",
                            onClick: ($event) => showExportModal.value = true
                          }, null, 8, ["onClick"]),
                          createVNode(_component_UButton, {
                            icon: "i-lucide-settings",
                            size: "sm",
                            color: "neutral",
                            variant: "ghost",
                            label: "Configure"
                          })
                        ])
                      ])
                    ];
                  }
                }),
                default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                  if (_push3) {
                    _push3(ssrRenderComponent(CashFlowChart, {
                      data: unref(forecastChartData)?.data,
                      loading: unref(forecastChartData)?.loading || false
                    }, null, _parent3, _scopeId2));
                  } else {
                    return [
                      createVNode(CashFlowChart, {
                        data: unref(forecastChartData)?.data,
                        loading: unref(forecastChartData)?.loading || false
                      }, null, 8, ["data", "loading"])
                    ];
                  }
                }),
                _: 1
              }, _parent2, _scopeId));
              _push2(`<div class="space-y-6"${_scopeId}>`);
              _push2(ssrRenderComponent(WaterfallChart, {
                data: unref(waterfallData),
                loading: unref(waterfallPending)
              }, null, _parent2, _scopeId));
              _push2(ssrRenderComponent(ScenarioAnalysis, {
                data: unref(scenarioData),
                loading: unref(scenarioPending)
              }, null, _parent2, _scopeId));
              _push2(`</div><div class="space-y-6"${_scopeId}>`);
              _push2(ssrRenderComponent(AIInsights, {
                "cashflow-data": unref(cashflowData),
                "invoice-data": unref(invoiceData),
                "scenario-data": unref(scenarioData),
                loading: unref(loading)
              }, null, _parent2, _scopeId));
              _push2(ssrRenderComponent(_component_UCard, { class: "border-none shadow-none ring-1 ring-black/5 dark:ring-white/5 bg-gradient-to-r from-emerald-50/90 via-white to-white dark:from-emerald-950/30 dark:via-transparent" }, {
                header: withCtx((_2, _push3, _parent3, _scopeId2) => {
                  if (_push3) {
                    _push3(`<h3 class="text-lg font-semibold flex items-center gap-2"${_scopeId2}>`);
                    _push3(ssrRenderComponent(_component_UIcon, {
                      name: "i-lucide-file-text",
                      class: "h-5 w-5"
                    }, null, _parent3, _scopeId2));
                    _push3(` Receivables Summary </h3>`);
                  } else {
                    return [
                      createVNode("h3", { class: "text-lg font-semibold flex items-center gap-2" }, [
                        createVNode(_component_UIcon, {
                          name: "i-lucide-file-text",
                          class: "h-5 w-5"
                        }),
                        createTextVNode(" Receivables Summary ")
                      ])
                    ];
                  }
                }),
                default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                  if (_push3) {
                    _push3(`<div class="space-y-4"${_scopeId2}><div class="flex items-center justify-between p-3 bg-emerald-50 dark:bg-emerald-950/20 rounded-lg"${_scopeId2}><div${_scopeId2}><p class="font-medium text-emerald-800 dark:text-emerald-200"${_scopeId2}>Outstanding</p><p class="text-sm text-emerald-600 dark:text-emerald-400"${_scopeId2}>${ssrInterpolate(unref(outstandingSummary)?.outstandingCount || 0)} invoice${ssrInterpolate((unref(outstandingSummary)?.outstandingCount || 0) !== 1 ? "s" : "")}</p></div><div class="text-right"${_scopeId2}><p class="font-bold text-emerald-800 dark:text-emerald-200"${_scopeId2}>${ssrInterpolate(formatCurrency(unref(outstandingSummary)?.outstandingTotal))}</p></div></div>`);
                    if (unref(outstandingSummary)?.overdueCount && unref(outstandingSummary).overdueCount > 0) {
                      _push3(`<div class="flex items-center justify-between p-3 bg-red-50 dark:bg-red-950/20 rounded-lg"${_scopeId2}><div${_scopeId2}><p class="font-medium text-red-800 dark:text-red-200"${_scopeId2}>Overdue</p><p class="text-sm text-red-600 dark:text-red-400"${_scopeId2}>${ssrInterpolate(unref(outstandingSummary).overdueCount)} invoice${ssrInterpolate(unref(outstandingSummary).overdueCount !== 1 ? "s" : "")}</p></div><div class="text-right"${_scopeId2}><p class="font-bold text-red-800 dark:text-red-200"${_scopeId2}>${ssrInterpolate(formatCurrency(unref(outstandingSummary).overdueTotal))}</p></div></div>`);
                    } else {
                      _push3(`<!---->`);
                    }
                    _push3(`<div class="pt-2 border-t border-gray-200 dark:border-gray-800"${_scopeId2}><div class="flex gap-2"${_scopeId2}>`);
                    _push3(ssrRenderComponent(_component_UButton, {
                      label: "View Invoices",
                      color: "neutral",
                      variant: "ghost",
                      size: "sm",
                      icon: "i-lucide-external-link",
                      to: "/invoices"
                    }, null, _parent3, _scopeId2));
                    _push3(ssrRenderComponent(_component_UButton, {
                      label: "Send Reminders",
                      color: "primary",
                      variant: "ghost",
                      size: "sm",
                      icon: "i-lucide-mail"
                    }, null, _parent3, _scopeId2));
                    _push3(`</div></div></div>`);
                  } else {
                    return [
                      createVNode("div", { class: "space-y-4" }, [
                        createVNode("div", { class: "flex items-center justify-between p-3 bg-emerald-50 dark:bg-emerald-950/20 rounded-lg" }, [
                          createVNode("div", null, [
                            createVNode("p", { class: "font-medium text-emerald-800 dark:text-emerald-200" }, "Outstanding"),
                            createVNode("p", { class: "text-sm text-emerald-600 dark:text-emerald-400" }, toDisplayString(unref(outstandingSummary)?.outstandingCount || 0) + " invoice" + toDisplayString((unref(outstandingSummary)?.outstandingCount || 0) !== 1 ? "s" : ""), 1)
                          ]),
                          createVNode("div", { class: "text-right" }, [
                            createVNode("p", { class: "font-bold text-emerald-800 dark:text-emerald-200" }, toDisplayString(formatCurrency(unref(outstandingSummary)?.outstandingTotal)), 1)
                          ])
                        ]),
                        unref(outstandingSummary)?.overdueCount && unref(outstandingSummary).overdueCount > 0 ? (openBlock(), createBlock("div", {
                          key: 0,
                          class: "flex items-center justify-between p-3 bg-red-50 dark:bg-red-950/20 rounded-lg"
                        }, [
                          createVNode("div", null, [
                            createVNode("p", { class: "font-medium text-red-800 dark:text-red-200" }, "Overdue"),
                            createVNode("p", { class: "text-sm text-red-600 dark:text-red-400" }, toDisplayString(unref(outstandingSummary).overdueCount) + " invoice" + toDisplayString(unref(outstandingSummary).overdueCount !== 1 ? "s" : ""), 1)
                          ]),
                          createVNode("div", { class: "text-right" }, [
                            createVNode("p", { class: "font-bold text-red-800 dark:text-red-200" }, toDisplayString(formatCurrency(unref(outstandingSummary).overdueTotal)), 1)
                          ])
                        ])) : createCommentVNode("", true),
                        createVNode("div", { class: "pt-2 border-t border-gray-200 dark:border-gray-800" }, [
                          createVNode("div", { class: "flex gap-2" }, [
                            createVNode(_component_UButton, {
                              label: "View Invoices",
                              color: "neutral",
                              variant: "ghost",
                              size: "sm",
                              icon: "i-lucide-external-link",
                              to: "/invoices"
                            }),
                            createVNode(_component_UButton, {
                              label: "Send Reminders",
                              color: "primary",
                              variant: "ghost",
                              size: "sm",
                              icon: "i-lucide-mail"
                            })
                          ])
                        ])
                      ])
                    ];
                  }
                }),
                _: 1
              }, _parent2, _scopeId));
              if (unref(topOutstandingClients).length) {
                _push2(ssrRenderComponent(_component_UCard, { class: "border-none shadow-none ring-1 ring-black/5 dark:ring-white/5 dark:via-transparent" }, {
                  header: withCtx((_2, _push3, _parent3, _scopeId2) => {
                    if (_push3) {
                      _push3(`<h3 class="text-lg font-semibold flex items-center gap-2"${_scopeId2}>`);
                      _push3(ssrRenderComponent(_component_UIcon, {
                        name: "i-lucide-users",
                        class: "h-5 w-5"
                      }, null, _parent3, _scopeId2));
                      _push3(` Top Outstanding Clients </h3>`);
                    } else {
                      return [
                        createVNode("h3", { class: "text-lg font-semibold flex items-center gap-2" }, [
                          createVNode(_component_UIcon, {
                            name: "i-lucide-users",
                            class: "h-5 w-5"
                          }),
                          createTextVNode(" Top Outstanding Clients ")
                        ])
                      ];
                    }
                  }),
                  default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                    if (_push3) {
                      _push3(`<div class="space-y-4"${_scopeId2}><!--[-->`);
                      ssrRenderList(unref(topOutstandingClients), (client) => {
                        _push3(`<div class="space-y-3 p-4 bg-white/70 dark:bg-white/5 rounded-lg border border-black/5 dark:border-white/5"${_scopeId2}><div class="flex flex-wrap items-start justify-between gap-2"${_scopeId2}><div${_scopeId2}><p class="font-semibold text-base"${_scopeId2}>${ssrInterpolate(client.name)}</p><p class="text-xs text-muted"${_scopeId2}>Outstanding ${ssrInterpolate(formatCurrency(client.outstanding))}</p>`);
                        if (client.overdue) {
                          _push3(`<p class="text-xs text-red-500"${_scopeId2}> Overdue ${ssrInterpolate(formatCurrency(client.overdue))} (${ssrInterpolate(Math.round((client.overdueRatio || 0) * 100))}%) </p>`);
                        } else {
                          _push3(`<!---->`);
                        }
                        _push3(`</div><div class="flex flex-col items-end gap-1 text-xs"${_scopeId2}>`);
                        if (client.creditLimit) {
                          _push3(`<span class="text-muted"${_scopeId2}>Credit Limit: ${ssrInterpolate(formatCurrency(client.creditLimit))}</span>`);
                        } else {
                          _push3(`<!---->`);
                        }
                        _push3(`<span class="${ssrRenderClass([client.overdue ? "bg-red-50 text-red-600 dark:bg-red-950/20" : "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20", "inline-flex items-center gap-1 px-2 py-1 rounded-full"])}"${_scopeId2}>`);
                        _push3(ssrRenderComponent(_component_UIcon, {
                          name: client.overdue ? "i-lucide-alert-triangle" : "i-lucide-badge-check",
                          class: "h-4 w-4"
                        }, null, _parent3, _scopeId2));
                        _push3(` ${ssrInterpolate(client.overdue ? "Follow up" : "On track")}</span></div></div><div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-muted"${_scopeId2}><div${_scopeId2}><span class="block uppercase tracking-wide"${_scopeId2}>Invoices</span><span class="text-sm font-medium text-neutral-900 dark:text-neutral-100"${_scopeId2}>${ssrInterpolate(client.invoiceCount)}</span></div><div${_scopeId2}><span class="block uppercase tracking-wide"${_scopeId2}>Overdue</span><span class="text-sm font-medium text-neutral-900 dark:text-neutral-100"${_scopeId2}>${ssrInterpolate(client.overdueCount)}</span></div><div${_scopeId2}><span class="block uppercase tracking-wide"${_scopeId2}>Latest Invoice</span><span class="text-sm font-medium text-neutral-900 dark:text-neutral-100"${_scopeId2}>${ssrInterpolate(formatDate(client.latestInvoiceDate))}</span></div><div${_scopeId2}><span class="block uppercase tracking-wide"${_scopeId2}>Next Due</span><span class="text-sm font-medium text-neutral-900 dark:text-neutral-100"${_scopeId2}>${ssrInterpolate(formatDate(client.earliestDueDate))}</span></div></div>`);
                        if (client.sampleInvoices?.length) {
                          _push3(`<div class="space-y-2"${_scopeId2}><p class="text-xs font-medium text-muted uppercase tracking-wide"${_scopeId2}>Upcoming Invoices</p><div class="space-y-1"${_scopeId2}><!--[-->`);
                          ssrRenderList(client.sampleInvoices, (invoice) => {
                            _push3(`<div class="flex items-center justify-between text-xs bg-black/5 dark:bg-white/10 rounded px-2 py-1"${_scopeId2}><div class="flex items-center gap-2"${_scopeId2}><span class="font-semibold text-neutral-900 dark:text-neutral-100"${_scopeId2}>${ssrInterpolate(invoice.number || invoice.reference || invoice.id?.slice(0, 6))}</span><span class="text-muted"${_scopeId2}>Due ${ssrInterpolate(formatDate(invoice.dueDate))}</span></div><div class="flex items-center gap-2"${_scopeId2}><span class="${ssrRenderClass(invoice.isOverdue ? "text-red-500 font-medium" : "text-neutral-900 dark:text-neutral-100")}"${_scopeId2}>${ssrInterpolate(formatCurrency(invoice.amountDue))}</span></div></div>`);
                          });
                          _push3(`<!--]--></div></div>`);
                        } else {
                          _push3(`<!---->`);
                        }
                        _push3(`</div>`);
                      });
                      _push3(`<!--]--></div>`);
                    } else {
                      return [
                        createVNode("div", { class: "space-y-4" }, [
                          (openBlock(true), createBlock(Fragment, null, renderList(unref(topOutstandingClients), (client) => {
                            return openBlock(), createBlock("div", {
                              key: client.id,
                              class: "space-y-3 p-4 bg-white/70 dark:bg-white/5 rounded-lg border border-black/5 dark:border-white/5"
                            }, [
                              createVNode("div", { class: "flex flex-wrap items-start justify-between gap-2" }, [
                                createVNode("div", null, [
                                  createVNode("p", { class: "font-semibold text-base" }, toDisplayString(client.name), 1),
                                  createVNode("p", { class: "text-xs text-muted" }, "Outstanding " + toDisplayString(formatCurrency(client.outstanding)), 1),
                                  client.overdue ? (openBlock(), createBlock("p", {
                                    key: 0,
                                    class: "text-xs text-red-500"
                                  }, " Overdue " + toDisplayString(formatCurrency(client.overdue)) + " (" + toDisplayString(Math.round((client.overdueRatio || 0) * 100)) + "%) ", 1)) : createCommentVNode("", true)
                                ]),
                                createVNode("div", { class: "flex flex-col items-end gap-1 text-xs" }, [
                                  client.creditLimit ? (openBlock(), createBlock("span", {
                                    key: 0,
                                    class: "text-muted"
                                  }, "Credit Limit: " + toDisplayString(formatCurrency(client.creditLimit)), 1)) : createCommentVNode("", true),
                                  createVNode("span", {
                                    class: ["inline-flex items-center gap-1 px-2 py-1 rounded-full", client.overdue ? "bg-red-50 text-red-600 dark:bg-red-950/20" : "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20"]
                                  }, [
                                    createVNode(_component_UIcon, {
                                      name: client.overdue ? "i-lucide-alert-triangle" : "i-lucide-badge-check",
                                      class: "h-4 w-4"
                                    }, null, 8, ["name"]),
                                    createTextVNode(" " + toDisplayString(client.overdue ? "Follow up" : "On track"), 1)
                                  ], 2)
                                ])
                              ]),
                              createVNode("div", { class: "grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-muted" }, [
                                createVNode("div", null, [
                                  createVNode("span", { class: "block uppercase tracking-wide" }, "Invoices"),
                                  createVNode("span", { class: "text-sm font-medium text-neutral-900 dark:text-neutral-100" }, toDisplayString(client.invoiceCount), 1)
                                ]),
                                createVNode("div", null, [
                                  createVNode("span", { class: "block uppercase tracking-wide" }, "Overdue"),
                                  createVNode("span", { class: "text-sm font-medium text-neutral-900 dark:text-neutral-100" }, toDisplayString(client.overdueCount), 1)
                                ]),
                                createVNode("div", null, [
                                  createVNode("span", { class: "block uppercase tracking-wide" }, "Latest Invoice"),
                                  createVNode("span", { class: "text-sm font-medium text-neutral-900 dark:text-neutral-100" }, toDisplayString(formatDate(client.latestInvoiceDate)), 1)
                                ]),
                                createVNode("div", null, [
                                  createVNode("span", { class: "block uppercase tracking-wide" }, "Next Due"),
                                  createVNode("span", { class: "text-sm font-medium text-neutral-900 dark:text-neutral-100" }, toDisplayString(formatDate(client.earliestDueDate)), 1)
                                ])
                              ]),
                              client.sampleInvoices?.length ? (openBlock(), createBlock("div", {
                                key: 0,
                                class: "space-y-2"
                              }, [
                                createVNode("p", { class: "text-xs font-medium text-muted uppercase tracking-wide" }, "Upcoming Invoices"),
                                createVNode("div", { class: "space-y-1" }, [
                                  (openBlock(true), createBlock(Fragment, null, renderList(client.sampleInvoices, (invoice) => {
                                    return openBlock(), createBlock("div", {
                                      key: invoice.id,
                                      class: "flex items-center justify-between text-xs bg-black/5 dark:bg-white/10 rounded px-2 py-1"
                                    }, [
                                      createVNode("div", { class: "flex items-center gap-2" }, [
                                        createVNode("span", { class: "font-semibold text-neutral-900 dark:text-neutral-100" }, toDisplayString(invoice.number || invoice.reference || invoice.id?.slice(0, 6)), 1),
                                        createVNode("span", { class: "text-muted" }, "Due " + toDisplayString(formatDate(invoice.dueDate)), 1)
                                      ]),
                                      createVNode("div", { class: "flex items-center gap-2" }, [
                                        createVNode("span", {
                                          class: invoice.isOverdue ? "text-red-500 font-medium" : "text-neutral-900 dark:text-neutral-100"
                                        }, toDisplayString(formatCurrency(invoice.amountDue)), 3)
                                      ])
                                    ]);
                                  }), 128))
                                ])
                              ])) : createCommentVNode("", true)
                            ]);
                          }), 128))
                        ])
                      ];
                    }
                  }),
                  _: 1
                }, _parent2, _scopeId));
              } else {
                _push2(`<!---->`);
              }
              _push2(`</div>`);
              _push2(ssrRenderComponent(_component_UCard, null, {
                header: withCtx((_2, _push3, _parent3, _scopeId2) => {
                  if (_push3) {
                    _push3(`<h3 class="text-lg font-semibold flex items-center gap-2"${_scopeId2}>`);
                    _push3(ssrRenderComponent(_component_UIcon, {
                      name: "i-lucide-bar-chart-3",
                      class: "h-5 w-5"
                    }, null, _parent3, _scopeId2));
                    _push3(` Cash Flow Analysis </h3>`);
                  } else {
                    return [
                      createVNode("h3", { class: "text-lg font-semibold flex items-center gap-2" }, [
                        createVNode(_component_UIcon, {
                          name: "i-lucide-bar-chart-3",
                          class: "h-5 w-5"
                        }),
                        createTextVNode(" Cash Flow Analysis ")
                      ])
                    ];
                  }
                }),
                default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                  if (_push3) {
                    _push3(`<div class="grid grid-cols-1 md:grid-cols-3 gap-6"${_scopeId2}><div class="space-y-3"${_scopeId2}><h4 class="font-medium text-sm"${_scopeId2}>Projected Range</h4><div class="space-y-2"${_scopeId2}><div class="flex justify-between text-sm"${_scopeId2}><span class="text-muted"${_scopeId2}>Maximum:</span><span class="font-medium text-emerald-600"${_scopeId2}>${ssrInterpolate(formatCurrency(unref(metrics)?.maxProjectedBalance))}</span></div><div class="flex justify-between text-sm"${_scopeId2}><span class="text-muted"${_scopeId2}>Current:</span><span class="font-medium"${_scopeId2}>${ssrInterpolate(formatCurrency(unref(metrics)?.currentCash))}</span></div><div class="flex justify-between text-sm"${_scopeId2}><span class="text-muted"${_scopeId2}>Minimum:</span><span class="${ssrRenderClass([{
                      "text-red-600": (unref(metrics)?.minProjectedBalance || 0) < 0,
                      "text-amber-600": (unref(metrics)?.minProjectedBalance || 0) < 1e4 && (unref(metrics)?.minProjectedBalance || 0) >= 0
                    }, "font-medium"])}"${_scopeId2}>${ssrInterpolate(formatCurrency(unref(metrics)?.minProjectedBalance))}</span></div></div></div><div class="space-y-3"${_scopeId2}><h4 class="font-medium text-sm"${_scopeId2}>Burn Rate</h4><div class="space-y-2"${_scopeId2}><div class="flex justify-between text-sm"${_scopeId2}><span class="text-muted"${_scopeId2}>Daily:</span><span class="font-medium"${_scopeId2}>${ssrInterpolate(formatCurrency(unref(metrics)?.burnRate))}</span></div><div class="flex justify-between text-sm"${_scopeId2}><span class="text-muted"${_scopeId2}>Weekly:</span><span class="font-medium"${_scopeId2}>${ssrInterpolate(formatCurrency((unref(metrics)?.burnRate || 0) * 7))}</span></div><div class="flex justify-between text-sm"${_scopeId2}><span class="text-muted"${_scopeId2}>Monthly:</span><span class="font-medium"${_scopeId2}>${ssrInterpolate(formatCurrency((unref(metrics)?.burnRate || 0) * 30))}</span></div></div></div><div class="space-y-3"${_scopeId2}><h4 class="font-medium text-sm"${_scopeId2}>Forecast Period</h4><div class="space-y-2"${_scopeId2}><div class="flex justify-between text-sm"${_scopeId2}><span class="text-muted"${_scopeId2}>Period:</span><span class="font-medium"${_scopeId2}>${ssrInterpolate(unref(cashflowData)?.forecastPeriod || 90)} days</span></div><div class="flex justify-between text-sm"${_scopeId2}><span class="text-muted"${_scopeId2}>Data Points:</span><span class="font-medium"${_scopeId2}>${ssrInterpolate(unref(cashflowData)?.forecast?.length || 0)}</span></div><div class="flex justify-between text-sm"${_scopeId2}><span class="text-muted"${_scopeId2}>Last Updated:</span><span class="font-medium"${_scopeId2}>${ssrInterpolate((/* @__PURE__ */ new Date()).toLocaleDateString())}</span></div></div></div></div>`);
                  } else {
                    return [
                      createVNode("div", { class: "grid grid-cols-1 md:grid-cols-3 gap-6" }, [
                        createVNode("div", { class: "space-y-3" }, [
                          createVNode("h4", { class: "font-medium text-sm" }, "Projected Range"),
                          createVNode("div", { class: "space-y-2" }, [
                            createVNode("div", { class: "flex justify-between text-sm" }, [
                              createVNode("span", { class: "text-muted" }, "Maximum:"),
                              createVNode("span", { class: "font-medium text-emerald-600" }, toDisplayString(formatCurrency(unref(metrics)?.maxProjectedBalance)), 1)
                            ]),
                            createVNode("div", { class: "flex justify-between text-sm" }, [
                              createVNode("span", { class: "text-muted" }, "Current:"),
                              createVNode("span", { class: "font-medium" }, toDisplayString(formatCurrency(unref(metrics)?.currentCash)), 1)
                            ]),
                            createVNode("div", { class: "flex justify-between text-sm" }, [
                              createVNode("span", { class: "text-muted" }, "Minimum:"),
                              createVNode("span", {
                                class: ["font-medium", {
                                  "text-red-600": (unref(metrics)?.minProjectedBalance || 0) < 0,
                                  "text-amber-600": (unref(metrics)?.minProjectedBalance || 0) < 1e4 && (unref(metrics)?.minProjectedBalance || 0) >= 0
                                }]
                              }, toDisplayString(formatCurrency(unref(metrics)?.minProjectedBalance)), 3)
                            ])
                          ])
                        ]),
                        createVNode("div", { class: "space-y-3" }, [
                          createVNode("h4", { class: "font-medium text-sm" }, "Burn Rate"),
                          createVNode("div", { class: "space-y-2" }, [
                            createVNode("div", { class: "flex justify-between text-sm" }, [
                              createVNode("span", { class: "text-muted" }, "Daily:"),
                              createVNode("span", { class: "font-medium" }, toDisplayString(formatCurrency(unref(metrics)?.burnRate)), 1)
                            ]),
                            createVNode("div", { class: "flex justify-between text-sm" }, [
                              createVNode("span", { class: "text-muted" }, "Weekly:"),
                              createVNode("span", { class: "font-medium" }, toDisplayString(formatCurrency((unref(metrics)?.burnRate || 0) * 7)), 1)
                            ]),
                            createVNode("div", { class: "flex justify-between text-sm" }, [
                              createVNode("span", { class: "text-muted" }, "Monthly:"),
                              createVNode("span", { class: "font-medium" }, toDisplayString(formatCurrency((unref(metrics)?.burnRate || 0) * 30)), 1)
                            ])
                          ])
                        ]),
                        createVNode("div", { class: "space-y-3" }, [
                          createVNode("h4", { class: "font-medium text-sm" }, "Forecast Period"),
                          createVNode("div", { class: "space-y-2" }, [
                            createVNode("div", { class: "flex justify-between text-sm" }, [
                              createVNode("span", { class: "text-muted" }, "Period:"),
                              createVNode("span", { class: "font-medium" }, toDisplayString(unref(cashflowData)?.forecastPeriod || 90) + " days", 1)
                            ]),
                            createVNode("div", { class: "flex justify-between text-sm" }, [
                              createVNode("span", { class: "text-muted" }, "Data Points:"),
                              createVNode("span", { class: "font-medium" }, toDisplayString(unref(cashflowData)?.forecast?.length || 0), 1)
                            ]),
                            createVNode("div", { class: "flex justify-between text-sm" }, [
                              createVNode("span", { class: "text-muted" }, "Last Updated:"),
                              createVNode("span", { class: "font-medium" }, toDisplayString((/* @__PURE__ */ new Date()).toLocaleDateString()), 1)
                            ])
                          ])
                        ])
                      ])
                    ];
                  }
                }),
                _: 1
              }, _parent2, _scopeId));
              _push2(`</div>`);
            }
            _push2(ssrRenderComponent(ExportModal, {
              open: unref(showExportModal),
              "onUpdate:open": ($event) => isRef(showExportModal) ? showExportModal.value = $event : null
            }, null, _parent2, _scopeId));
          } else {
            return [
              unref(loading) ? (openBlock(), createBlock("div", {
                key: 0,
                class: "space-y-6"
              }, [
                createVNode("div", { class: "grid grid-cols-1 lg:grid-cols-4 gap-4" }, [
                  (openBlock(), createBlock(Fragment, null, renderList(4, (i) => {
                    return createVNode(_component_USkeleton, {
                      class: "h-32",
                      key: i
                    });
                  }), 64))
                ]),
                createVNode(_component_USkeleton, { class: "h-96" })
              ])) : unref(error) ? (openBlock(), createBlock(_component_UAlert, {
                key: 1,
                icon: "i-lucide-alert-circle",
                color: "red",
                variant: "subtle",
                title: "Failed to load cash flow data",
                description: unref(error).statusMessage || "Please check your connection and try again.",
                class: "mb-6"
              }, null, 8, ["description"])) : (openBlock(), createBlock("div", {
                key: 2,
                class: "space-y-6"
              }, [
                createVNode("div", { class: "grid grid-cols-1 lg:grid-cols-4 gap-4" }, [
                  createVNode(_component_UCard, null, {
                    default: withCtx(() => [
                      createVNode("div", { class: "flex items-center justify-between" }, [
                        createVNode("div", null, [
                          createVNode("p", { class: "text-sm text-muted" }, "Current Cash"),
                          createVNode("p", { class: "text-2xl font-bold" }, toDisplayString(formatCurrency(unref(metrics)?.currentCash)), 1)
                        ]),
                        createVNode(_component_UIcon, {
                          name: "i-lucide-wallet",
                          class: "h-8 w-8 text-blue-500"
                        })
                      ]),
                      createVNode("div", { class: "mt-2 text-xs text-muted" }, " As of " + toDisplayString((/* @__PURE__ */ new Date()).toLocaleDateString()), 1)
                    ]),
                    _: 1
                  }),
                  createVNode(_component_UCard, null, {
                    default: withCtx(() => [
                      createVNode("div", { class: "flex items-center justify-between" }, [
                        createVNode("div", null, [
                          createVNode("p", { class: "text-sm text-muted" }, "90-Day Projection"),
                          createVNode("p", {
                            class: ["text-2xl font-bold", {
                              "text-red-600": (unref(metrics)?.changePercent || 0) < -10,
                              "text-amber-600": (unref(metrics)?.changePercent || 0) < 0,
                              "text-emerald-600": (unref(metrics)?.changePercent || 0) > 0
                            }]
                          }, toDisplayString(formatCurrency(unref(metrics)?.projectedEndBalance)), 3)
                        ]),
                        createVNode(_component_UIcon, {
                          name: (unref(metrics)?.changePercent || 0) >= 0 ? "i-lucide-trending-up" : "i-lucide-trending-down",
                          class: [(unref(metrics)?.changePercent || 0) >= 0 ? "text-emerald-500" : "text-red-500", "h-8 w-8"]
                        }, null, 8, ["name", "class"])
                      ]),
                      createVNode("div", {
                        class: ["mt-2 text-xs", {
                          "text-red-600": (unref(metrics)?.changePercent || 0) < 0,
                          "text-emerald-600": (unref(metrics)?.changePercent || 0) > 0,
                          "text-muted": (unref(metrics)?.changePercent || 0) === 0
                        }]
                      }, toDisplayString((unref(metrics)?.changePercent || 0) >= 0 ? "+" : "") + toDisplayString(formatPercent((unref(metrics)?.changePercent || 0) / 100)) + " change ", 3)
                    ]),
                    _: 1
                  }),
                  createVNode(_component_UCard, null, {
                    default: withCtx(() => [
                      createVNode("div", { class: "flex items-center justify-between" }, [
                        createVNode("div", null, [
                          createVNode("p", { class: "text-sm text-muted" }, "Cash Runway"),
                          createVNode("p", {
                            class: ["text-2xl font-bold", {
                              "text-red-600": (unref(metrics)?.runway || 0) < 30,
                              "text-amber-600": (unref(metrics)?.runway || 0) < 60,
                              "text-emerald-600": (unref(metrics)?.runway || 0) >= 60
                            }]
                          }, toDisplayString(formatDays(unref(metrics)?.runway)), 3)
                        ]),
                        createVNode(_component_UIcon, {
                          name: "i-lucide-timer",
                          class: "h-8 w-8 text-purple-500"
                        })
                      ]),
                      createVNode("div", { class: "mt-2 text-xs text-muted" }, " At current burn rate: " + toDisplayString(formatCurrency(unref(metrics)?.burnRate)) + "/day ", 1)
                    ]),
                    _: 1
                  }),
                  createVNode(_component_UCard, null, {
                    default: withCtx(() => [
                      createVNode("div", { class: "flex items-center justify-between" }, [
                        createVNode("div", null, [
                          createVNode("p", { class: "text-sm text-muted" }, "Outstanding Receivables"),
                          createVNode("p", { class: "text-2xl font-bold text-emerald-600" }, toDisplayString(formatCurrency(unref(outstandingSummary)?.totalReceivables)), 1)
                        ]),
                        createVNode(_component_UIcon, {
                          name: "i-lucide-receipt",
                          class: "h-8 w-8 text-emerald-500"
                        })
                      ]),
                      createVNode("div", { class: "mt-2 text-xs text-muted" }, toDisplayString(unref(outstandingSummary)?.outstandingCount || 0) + " outstanding, " + toDisplayString(unref(outstandingSummary)?.overdueCount || 0) + " overdue ", 1)
                    ]),
                    _: 1
                  })
                ]),
                unref(workingCapitalMetrics) || unref(receivableInsights) || unref(payableInsights) ? (openBlock(), createBlock("div", {
                  key: 0,
                  class: "grid grid-cols-1 xl:grid-cols-3 gap-4"
                }, [
                  unref(workingCapitalMetrics) ? (openBlock(), createBlock(_component_UCard, { key: 0 }, {
                    header: withCtx(() => [
                      createVNode("div", { class: "flex items-center justify-between" }, [
                        createVNode("div", null, [
                          createVNode("h3", { class: "text-base font-semibold" }, "Working Capital"),
                          createVNode("p", { class: "text-xs text-muted" }, "Balance sheet snapshot")
                        ]),
                        createVNode(_component_UIcon, {
                          name: "i-lucide-pie-chart",
                          class: "h-5 w-5 text-blue-500"
                        })
                      ])
                    ]),
                    default: withCtx(() => [
                      createVNode("div", { class: "space-y-3 text-sm" }, [
                        createVNode("div", { class: "flex items-center justify-between" }, [
                          createVNode("span", { class: "text-muted" }, "Current Assets"),
                          createVNode("span", { class: "font-medium" }, toDisplayString(formatCurrency(unref(workingCapitalMetrics).currentAssets)), 1)
                        ]),
                        createVNode("div", { class: "flex items-center justify-between" }, [
                          createVNode("span", { class: "text-muted" }, "Current Liabilities"),
                          createVNode("span", { class: "font-medium" }, toDisplayString(formatCurrency(unref(workingCapitalMetrics).currentLiabilities)), 1)
                        ]),
                        createVNode("div", { class: "flex items-center justify-between pt-2 border-t border-default" }, [
                          createVNode("span", { class: "text-muted" }, "Working Capital"),
                          createVNode("span", {
                            class: unref(workingCapitalMetrics).workingCapital >= 0 ? "text-emerald-600 font-semibold" : "text-red-600 font-semibold"
                          }, toDisplayString(formatCurrency(unref(workingCapitalMetrics).workingCapital)), 3)
                        ]),
                        createVNode("div", { class: "flex items-center justify-between text-xs" }, [
                          createVNode("span", { class: "text-muted" }, "Quick Ratio"),
                          createVNode("span", { class: "font-medium" }, toDisplayString(formatRatio(unref(workingCapitalMetrics).quickRatio)), 1)
                        ]),
                        createVNode("div", { class: "flex items-center justify-between text-xs" }, [
                          createVNode("span", { class: "text-muted" }, "Cash & Equivalents"),
                          createVNode("span", { class: "font-medium" }, toDisplayString(formatCurrency(unref(workingCapitalMetrics).cashBalance)), 1)
                        ])
                      ])
                    ]),
                    _: 1
                  })) : createCommentVNode("", true),
                  unref(receivableInsights) ? (openBlock(), createBlock(_component_UCard, { key: 1 }, {
                    header: withCtx(() => [
                      createVNode("div", { class: "flex items-center justify-between" }, [
                        createVNode("div", null, [
                          createVNode("h3", { class: "text-base font-semibold" }, "Revenue Pipeline"),
                          createVNode("p", { class: "text-xs text-muted" }, "Pending client billings")
                        ]),
                        createVNode(_component_UIcon, {
                          name: "i-lucide-trending-up",
                          class: "h-5 w-5 text-emerald-500"
                        })
                      ])
                    ]),
                    default: withCtx(() => [
                      createVNode("div", { class: "space-y-3 text-sm" }, [
                        createVNode("div", null, [
                          createVNode("div", { class: "flex items-center justify-between" }, [
                            createVNode("span", { class: "text-muted" }, "Draft Invoices"),
                            createVNode("span", { class: "font-medium" }, toDisplayString(formatCurrency(unref(receivableInsights).draftInvoices?.total)), 1)
                          ]),
                          createVNode("p", { class: "text-xs text-muted" }, toDisplayString(unref(receivableInsights).draftInvoices?.count || 0) + " in preparation", 1)
                        ]),
                        createVNode("div", null, [
                          createVNode("div", { class: "flex items-center justify-between" }, [
                            createVNode("span", { class: "text-muted" }, "Submitted Invoices"),
                            createVNode("span", { class: "font-medium" }, toDisplayString(formatCurrency(unref(receivableInsights).submittedInvoices?.total)), 1)
                          ]),
                          createVNode("p", { class: "text-xs text-muted" }, toDisplayString(unref(receivableInsights).submittedInvoices?.count || 0) + " awaiting approval", 1)
                        ]),
                        createVNode("div", null, [
                          createVNode("div", { class: "flex items-center justify-between" }, [
                            createVNode("span", { class: "text-muted" }, "Draft Quotes"),
                            createVNode("span", { class: "font-medium" }, toDisplayString(formatCurrency(unref(receivableInsights).quotes?.draft?.total)), 1)
                          ]),
                          createVNode("p", { class: "text-xs text-muted" }, toDisplayString(unref(receivableInsights).quotes?.draft?.count || 0) + " in scoping", 1)
                        ]),
                        createVNode("div", null, [
                          createVNode("div", { class: "flex items-center justify-between" }, [
                            createVNode("span", { class: "text-muted" }, "Sent Quotes"),
                            createVNode("span", { class: "font-medium" }, toDisplayString(formatCurrency(unref(receivableInsights).quotes?.sent?.total)), 1)
                          ]),
                          createVNode("p", { class: "text-xs text-muted" }, toDisplayString(unref(receivableInsights).quotes?.sent?.count || 0) + " with clients", 1)
                        ]),
                        createVNode("div", null, [
                          createVNode("div", { class: "flex items-center justify-between" }, [
                            createVNode("span", { class: "text-muted" }, "Accepted Quotes"),
                            createVNode("span", { class: "font-medium" }, toDisplayString(formatCurrency(unref(receivableInsights).quotes?.accepted?.total)), 1)
                          ]),
                          createVNode("p", { class: "text-xs text-muted" }, toDisplayString(unref(receivableInsights).quotes?.accepted?.count || 0) + " ready to invoice", 1)
                        ]),
                        createVNode("div", { class: "pt-2 border-t border-default text-xs flex items-center justify-between" }, [
                          createVNode("span", { class: "text-muted" }, "Total Revenue Pipeline"),
                          createVNode("span", { class: "font-semibold text-emerald-600" }, toDisplayString(formatCurrency(unref(receivableInsights).totalPipeline)), 1)
                        ])
                      ])
                    ]),
                    _: 1
                  })) : createCommentVNode("", true),
                  unref(payableInsights) ? (openBlock(), createBlock(_component_UCard, { key: 2 }, {
                    header: withCtx(() => [
                      createVNode("div", { class: "flex items-center justify-between" }, [
                        createVNode("div", null, [
                          createVNode("h3", { class: "text-base font-semibold" }, "Media & Vendor Commitments"),
                          createVNode("p", { class: "text-xs text-muted" }, "Upcoming cash requirements")
                        ]),
                        createVNode(_component_UIcon, {
                          name: "i-lucide-trending-down",
                          class: "h-5 w-5 text-red-500"
                        })
                      ])
                    ]),
                    default: withCtx(() => [
                      createVNode("div", { class: "space-y-3 text-sm" }, [
                        createVNode("div", null, [
                          createVNode("div", { class: "flex items-center justify-between" }, [
                            createVNode("span", { class: "text-muted" }, "Draft Bills"),
                            createVNode("span", { class: "font-medium" }, toDisplayString(formatCurrency(unref(payableInsights).draftBills?.total)), 1)
                          ]),
                          createVNode("p", { class: "text-xs text-muted" }, toDisplayString(unref(payableInsights).draftBills?.count || 0) + " in review", 1)
                        ]),
                        createVNode("div", null, [
                          createVNode("div", { class: "flex items-center justify-between" }, [
                            createVNode("span", { class: "text-muted" }, "Submitted Bills"),
                            createVNode("span", { class: "font-medium" }, toDisplayString(formatCurrency(unref(payableInsights).submittedBills?.total)), 1)
                          ]),
                          createVNode("p", { class: "text-xs text-muted" }, toDisplayString(unref(payableInsights).submittedBills?.count || 0) + " awaiting approval", 1)
                        ]),
                        createVNode("div", null, [
                          createVNode("div", { class: "flex items-center justify-between" }, [
                            createVNode("span", { class: "text-muted" }, "Purchase Orders"),
                            createVNode("span", { class: "font-medium" }, toDisplayString(formatCurrency(unref(payableInsights).purchaseOrders?.totalPipeline)), 1)
                          ]),
                          createVNode("p", { class: "text-xs text-muted" }, toDisplayString((unref(payableInsights).purchaseOrders?.draft?.count || 0) + (unref(payableInsights).purchaseOrders?.submitted?.count || 0)) + " open commitments", 1)
                        ]),
                        createVNode("div", { class: "pt-2 border-t border-default text-xs flex items-center justify-between" }, [
                          createVNode("span", { class: "text-muted" }, "Total Cash Obligations"),
                          createVNode("span", { class: "font-semibold text-red-600" }, toDisplayString(formatCurrency(unref(payableInsights).totalPipeline)), 1)
                        ])
                      ])
                    ]),
                    _: 1
                  })) : createCommentVNode("", true)
                ])) : createCommentVNode("", true),
                createVNode(_component_UCard, { class: "col-span-full" }, {
                  header: withCtx(() => [
                    createVNode("div", { class: "flex items-center justify-between" }, [
                      createVNode("div", null, [
                        createVNode("h3", { class: "text-lg font-semibold" }, "90-Day Cash Flow Forecast"),
                        createVNode("p", { class: "text-sm text-muted" }, "Projected daily cash position with inflows and outflows")
                      ]),
                      createVNode("div", { class: "flex gap-2" }, [
                        createVNode(_component_UButton, {
                          icon: "i-lucide-download",
                          size: "sm",
                          color: "neutral",
                          variant: "ghost",
                          label: "Export",
                          onClick: ($event) => showExportModal.value = true
                        }, null, 8, ["onClick"]),
                        createVNode(_component_UButton, {
                          icon: "i-lucide-settings",
                          size: "sm",
                          color: "neutral",
                          variant: "ghost",
                          label: "Configure"
                        })
                      ])
                    ])
                  ]),
                  default: withCtx(() => [
                    createVNode(CashFlowChart, {
                      data: unref(forecastChartData)?.data,
                      loading: unref(forecastChartData)?.loading || false
                    }, null, 8, ["data", "loading"])
                  ]),
                  _: 1
                }),
                createVNode("div", { class: "space-y-6" }, [
                  createVNode(WaterfallChart, {
                    data: unref(waterfallData),
                    loading: unref(waterfallPending)
                  }, null, 8, ["data", "loading"]),
                  createVNode(ScenarioAnalysis, {
                    data: unref(scenarioData),
                    loading: unref(scenarioPending)
                  }, null, 8, ["data", "loading"])
                ]),
                createVNode("div", { class: "space-y-6" }, [
                  createVNode(AIInsights, {
                    "cashflow-data": unref(cashflowData),
                    "invoice-data": unref(invoiceData),
                    "scenario-data": unref(scenarioData),
                    loading: unref(loading)
                  }, null, 8, ["cashflow-data", "invoice-data", "scenario-data", "loading"]),
                  createVNode(_component_UCard, { class: "border-none shadow-none ring-1 ring-black/5 dark:ring-white/5 bg-gradient-to-r from-emerald-50/90 via-white to-white dark:from-emerald-950/30 dark:via-transparent" }, {
                    header: withCtx(() => [
                      createVNode("h3", { class: "text-lg font-semibold flex items-center gap-2" }, [
                        createVNode(_component_UIcon, {
                          name: "i-lucide-file-text",
                          class: "h-5 w-5"
                        }),
                        createTextVNode(" Receivables Summary ")
                      ])
                    ]),
                    default: withCtx(() => [
                      createVNode("div", { class: "space-y-4" }, [
                        createVNode("div", { class: "flex items-center justify-between p-3 bg-emerald-50 dark:bg-emerald-950/20 rounded-lg" }, [
                          createVNode("div", null, [
                            createVNode("p", { class: "font-medium text-emerald-800 dark:text-emerald-200" }, "Outstanding"),
                            createVNode("p", { class: "text-sm text-emerald-600 dark:text-emerald-400" }, toDisplayString(unref(outstandingSummary)?.outstandingCount || 0) + " invoice" + toDisplayString((unref(outstandingSummary)?.outstandingCount || 0) !== 1 ? "s" : ""), 1)
                          ]),
                          createVNode("div", { class: "text-right" }, [
                            createVNode("p", { class: "font-bold text-emerald-800 dark:text-emerald-200" }, toDisplayString(formatCurrency(unref(outstandingSummary)?.outstandingTotal)), 1)
                          ])
                        ]),
                        unref(outstandingSummary)?.overdueCount && unref(outstandingSummary).overdueCount > 0 ? (openBlock(), createBlock("div", {
                          key: 0,
                          class: "flex items-center justify-between p-3 bg-red-50 dark:bg-red-950/20 rounded-lg"
                        }, [
                          createVNode("div", null, [
                            createVNode("p", { class: "font-medium text-red-800 dark:text-red-200" }, "Overdue"),
                            createVNode("p", { class: "text-sm text-red-600 dark:text-red-400" }, toDisplayString(unref(outstandingSummary).overdueCount) + " invoice" + toDisplayString(unref(outstandingSummary).overdueCount !== 1 ? "s" : ""), 1)
                          ]),
                          createVNode("div", { class: "text-right" }, [
                            createVNode("p", { class: "font-bold text-red-800 dark:text-red-200" }, toDisplayString(formatCurrency(unref(outstandingSummary).overdueTotal)), 1)
                          ])
                        ])) : createCommentVNode("", true),
                        createVNode("div", { class: "pt-2 border-t border-gray-200 dark:border-gray-800" }, [
                          createVNode("div", { class: "flex gap-2" }, [
                            createVNode(_component_UButton, {
                              label: "View Invoices",
                              color: "neutral",
                              variant: "ghost",
                              size: "sm",
                              icon: "i-lucide-external-link",
                              to: "/invoices"
                            }),
                            createVNode(_component_UButton, {
                              label: "Send Reminders",
                              color: "primary",
                              variant: "ghost",
                              size: "sm",
                              icon: "i-lucide-mail"
                            })
                          ])
                        ])
                      ])
                    ]),
                    _: 1
                  }),
                  unref(topOutstandingClients).length ? (openBlock(), createBlock(_component_UCard, {
                    key: 0,
                    class: "border-none shadow-none ring-1 ring-black/5 dark:ring-white/5 dark:via-transparent"
                  }, {
                    header: withCtx(() => [
                      createVNode("h3", { class: "text-lg font-semibold flex items-center gap-2" }, [
                        createVNode(_component_UIcon, {
                          name: "i-lucide-users",
                          class: "h-5 w-5"
                        }),
                        createTextVNode(" Top Outstanding Clients ")
                      ])
                    ]),
                    default: withCtx(() => [
                      createVNode("div", { class: "space-y-4" }, [
                        (openBlock(true), createBlock(Fragment, null, renderList(unref(topOutstandingClients), (client) => {
                          return openBlock(), createBlock("div", {
                            key: client.id,
                            class: "space-y-3 p-4 bg-white/70 dark:bg-white/5 rounded-lg border border-black/5 dark:border-white/5"
                          }, [
                            createVNode("div", { class: "flex flex-wrap items-start justify-between gap-2" }, [
                              createVNode("div", null, [
                                createVNode("p", { class: "font-semibold text-base" }, toDisplayString(client.name), 1),
                                createVNode("p", { class: "text-xs text-muted" }, "Outstanding " + toDisplayString(formatCurrency(client.outstanding)), 1),
                                client.overdue ? (openBlock(), createBlock("p", {
                                  key: 0,
                                  class: "text-xs text-red-500"
                                }, " Overdue " + toDisplayString(formatCurrency(client.overdue)) + " (" + toDisplayString(Math.round((client.overdueRatio || 0) * 100)) + "%) ", 1)) : createCommentVNode("", true)
                              ]),
                              createVNode("div", { class: "flex flex-col items-end gap-1 text-xs" }, [
                                client.creditLimit ? (openBlock(), createBlock("span", {
                                  key: 0,
                                  class: "text-muted"
                                }, "Credit Limit: " + toDisplayString(formatCurrency(client.creditLimit)), 1)) : createCommentVNode("", true),
                                createVNode("span", {
                                  class: ["inline-flex items-center gap-1 px-2 py-1 rounded-full", client.overdue ? "bg-red-50 text-red-600 dark:bg-red-950/20" : "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20"]
                                }, [
                                  createVNode(_component_UIcon, {
                                    name: client.overdue ? "i-lucide-alert-triangle" : "i-lucide-badge-check",
                                    class: "h-4 w-4"
                                  }, null, 8, ["name"]),
                                  createTextVNode(" " + toDisplayString(client.overdue ? "Follow up" : "On track"), 1)
                                ], 2)
                              ])
                            ]),
                            createVNode("div", { class: "grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-muted" }, [
                              createVNode("div", null, [
                                createVNode("span", { class: "block uppercase tracking-wide" }, "Invoices"),
                                createVNode("span", { class: "text-sm font-medium text-neutral-900 dark:text-neutral-100" }, toDisplayString(client.invoiceCount), 1)
                              ]),
                              createVNode("div", null, [
                                createVNode("span", { class: "block uppercase tracking-wide" }, "Overdue"),
                                createVNode("span", { class: "text-sm font-medium text-neutral-900 dark:text-neutral-100" }, toDisplayString(client.overdueCount), 1)
                              ]),
                              createVNode("div", null, [
                                createVNode("span", { class: "block uppercase tracking-wide" }, "Latest Invoice"),
                                createVNode("span", { class: "text-sm font-medium text-neutral-900 dark:text-neutral-100" }, toDisplayString(formatDate(client.latestInvoiceDate)), 1)
                              ]),
                              createVNode("div", null, [
                                createVNode("span", { class: "block uppercase tracking-wide" }, "Next Due"),
                                createVNode("span", { class: "text-sm font-medium text-neutral-900 dark:text-neutral-100" }, toDisplayString(formatDate(client.earliestDueDate)), 1)
                              ])
                            ]),
                            client.sampleInvoices?.length ? (openBlock(), createBlock("div", {
                              key: 0,
                              class: "space-y-2"
                            }, [
                              createVNode("p", { class: "text-xs font-medium text-muted uppercase tracking-wide" }, "Upcoming Invoices"),
                              createVNode("div", { class: "space-y-1" }, [
                                (openBlock(true), createBlock(Fragment, null, renderList(client.sampleInvoices, (invoice) => {
                                  return openBlock(), createBlock("div", {
                                    key: invoice.id,
                                    class: "flex items-center justify-between text-xs bg-black/5 dark:bg-white/10 rounded px-2 py-1"
                                  }, [
                                    createVNode("div", { class: "flex items-center gap-2" }, [
                                      createVNode("span", { class: "font-semibold text-neutral-900 dark:text-neutral-100" }, toDisplayString(invoice.number || invoice.reference || invoice.id?.slice(0, 6)), 1),
                                      createVNode("span", { class: "text-muted" }, "Due " + toDisplayString(formatDate(invoice.dueDate)), 1)
                                    ]),
                                    createVNode("div", { class: "flex items-center gap-2" }, [
                                      createVNode("span", {
                                        class: invoice.isOverdue ? "text-red-500 font-medium" : "text-neutral-900 dark:text-neutral-100"
                                      }, toDisplayString(formatCurrency(invoice.amountDue)), 3)
                                    ])
                                  ]);
                                }), 128))
                              ])
                            ])) : createCommentVNode("", true)
                          ]);
                        }), 128))
                      ])
                    ]),
                    _: 1
                  })) : createCommentVNode("", true)
                ]),
                createVNode(_component_UCard, null, {
                  header: withCtx(() => [
                    createVNode("h3", { class: "text-lg font-semibold flex items-center gap-2" }, [
                      createVNode(_component_UIcon, {
                        name: "i-lucide-bar-chart-3",
                        class: "h-5 w-5"
                      }),
                      createTextVNode(" Cash Flow Analysis ")
                    ])
                  ]),
                  default: withCtx(() => [
                    createVNode("div", { class: "grid grid-cols-1 md:grid-cols-3 gap-6" }, [
                      createVNode("div", { class: "space-y-3" }, [
                        createVNode("h4", { class: "font-medium text-sm" }, "Projected Range"),
                        createVNode("div", { class: "space-y-2" }, [
                          createVNode("div", { class: "flex justify-between text-sm" }, [
                            createVNode("span", { class: "text-muted" }, "Maximum:"),
                            createVNode("span", { class: "font-medium text-emerald-600" }, toDisplayString(formatCurrency(unref(metrics)?.maxProjectedBalance)), 1)
                          ]),
                          createVNode("div", { class: "flex justify-between text-sm" }, [
                            createVNode("span", { class: "text-muted" }, "Current:"),
                            createVNode("span", { class: "font-medium" }, toDisplayString(formatCurrency(unref(metrics)?.currentCash)), 1)
                          ]),
                          createVNode("div", { class: "flex justify-between text-sm" }, [
                            createVNode("span", { class: "text-muted" }, "Minimum:"),
                            createVNode("span", {
                              class: ["font-medium", {
                                "text-red-600": (unref(metrics)?.minProjectedBalance || 0) < 0,
                                "text-amber-600": (unref(metrics)?.minProjectedBalance || 0) < 1e4 && (unref(metrics)?.minProjectedBalance || 0) >= 0
                              }]
                            }, toDisplayString(formatCurrency(unref(metrics)?.minProjectedBalance)), 3)
                          ])
                        ])
                      ]),
                      createVNode("div", { class: "space-y-3" }, [
                        createVNode("h4", { class: "font-medium text-sm" }, "Burn Rate"),
                        createVNode("div", { class: "space-y-2" }, [
                          createVNode("div", { class: "flex justify-between text-sm" }, [
                            createVNode("span", { class: "text-muted" }, "Daily:"),
                            createVNode("span", { class: "font-medium" }, toDisplayString(formatCurrency(unref(metrics)?.burnRate)), 1)
                          ]),
                          createVNode("div", { class: "flex justify-between text-sm" }, [
                            createVNode("span", { class: "text-muted" }, "Weekly:"),
                            createVNode("span", { class: "font-medium" }, toDisplayString(formatCurrency((unref(metrics)?.burnRate || 0) * 7)), 1)
                          ]),
                          createVNode("div", { class: "flex justify-between text-sm" }, [
                            createVNode("span", { class: "text-muted" }, "Monthly:"),
                            createVNode("span", { class: "font-medium" }, toDisplayString(formatCurrency((unref(metrics)?.burnRate || 0) * 30)), 1)
                          ])
                        ])
                      ]),
                      createVNode("div", { class: "space-y-3" }, [
                        createVNode("h4", { class: "font-medium text-sm" }, "Forecast Period"),
                        createVNode("div", { class: "space-y-2" }, [
                          createVNode("div", { class: "flex justify-between text-sm" }, [
                            createVNode("span", { class: "text-muted" }, "Period:"),
                            createVNode("span", { class: "font-medium" }, toDisplayString(unref(cashflowData)?.forecastPeriod || 90) + " days", 1)
                          ]),
                          createVNode("div", { class: "flex justify-between text-sm" }, [
                            createVNode("span", { class: "text-muted" }, "Data Points:"),
                            createVNode("span", { class: "font-medium" }, toDisplayString(unref(cashflowData)?.forecast?.length || 0), 1)
                          ]),
                          createVNode("div", { class: "flex justify-between text-sm" }, [
                            createVNode("span", { class: "text-muted" }, "Last Updated:"),
                            createVNode("span", { class: "font-medium" }, toDisplayString((/* @__PURE__ */ new Date()).toLocaleDateString()), 1)
                          ])
                        ])
                      ])
                    ])
                  ]),
                  _: 1
                })
              ])),
              createVNode(ExportModal, {
                open: unref(showExportModal),
                "onUpdate:open": ($event) => isRef(showExportModal) ? showExportModal.value = $event : null
              }, null, 8, ["open", "onUpdate:open"])
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
//# sourceMappingURL=index-BCNCfXFY.mjs.map
