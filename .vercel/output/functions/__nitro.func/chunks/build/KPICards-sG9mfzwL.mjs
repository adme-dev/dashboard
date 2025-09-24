import { _ as _sfc_main$1 } from './Card-jqGRZ5Ik.mjs';
import { _ as _sfc_main$2 } from './Skeleton-p2Vkb_Gp.mjs';
import { _ as _sfc_main$e } from './server.mjs';
import { defineComponent, mergeProps, withCtx, createBlock, openBlock, createVNode, toDisplayString, useSSRContext } from 'vue';
import { ssrRenderAttrs, ssrRenderComponent, ssrInterpolate, ssrRenderClass } from 'vue/server-renderer';
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

const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "KPICards",
  __ssrInlineRender: true,
  props: {
    data: {},
    loading: { type: Boolean },
    connected: { type: Boolean }
  },
  setup(__props) {
    const formatCurrency = (value) => {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0
      }).format(value);
    };
    const formatPercent = (value) => {
      return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
    };
    const getTrendIcon = (trend) => {
      switch (trend) {
        case "up":
          return "i-lucide-trending-up";
        case "down":
          return "i-lucide-trending-down";
        default:
          return "i-lucide-minus";
      }
    };
    const getTrendColor = (trend, isExpense = false) => {
      if (isExpense) {
        switch (trend) {
          case "up":
            return "text-red-500";
          case "down":
            return "text-emerald-500";
          default:
            return "text-neutral-500";
        }
      }
      switch (trend) {
        case "up":
          return "text-emerald-500";
        case "down":
          return "text-red-500";
        default:
          return "text-neutral-500";
      }
    };
    const getCashStatusColor = (status) => {
      switch (status) {
        case "healthy":
          return "text-emerald-500";
        case "warning":
          return "text-amber-500";
        case "critical":
          return "text-red-500";
        default:
          return "text-neutral-500";
      }
    };
    const getHealthScoreColor = (score) => {
      if (score >= 80) return "text-emerald-500";
      if (score >= 60) return "text-amber-500";
      return "text-red-500";
    };
    return (_ctx, _push, _parent, _attrs) => {
      const _component_UCard = _sfc_main$1;
      const _component_USkeleton = _sfc_main$2;
      const _component_UIcon = _sfc_main$e;
      _push(`<div${ssrRenderAttrs(mergeProps({ class: "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-6" }, _attrs))} data-v-e8429f06>`);
      _push(ssrRenderComponent(_component_UCard, { class: "relative overflow-hidden" }, {
        default: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            if (_ctx.loading) {
              _push2(`<div class="space-y-3" data-v-e8429f06${_scopeId}>`);
              _push2(ssrRenderComponent(_component_USkeleton, { class: "h-4 w-20" }, null, _parent2, _scopeId));
              _push2(ssrRenderComponent(_component_USkeleton, { class: "h-8 w-32" }, null, _parent2, _scopeId));
              _push2(ssrRenderComponent(_component_USkeleton, { class: "h-4 w-24" }, null, _parent2, _scopeId));
              _push2(`</div>`);
            } else {
              _push2(`<div class="flex items-start justify-between" data-v-e8429f06${_scopeId}><div class="flex-1" data-v-e8429f06${_scopeId}><p class="text-xs text-muted uppercase mb-2" data-v-e8429f06${_scopeId}> Monthly Revenue </p><p class="text-2xl font-bold text-highlighted" data-v-e8429f06${_scopeId}>${ssrInterpolate(_ctx.data ? formatCurrency(_ctx.data.revenue.current) : "$0")}</p><div class="flex items-center gap-1 mt-1" data-v-e8429f06${_scopeId}>`);
              _push2(ssrRenderComponent(_component_UIcon, {
                name: getTrendIcon(_ctx.data?.revenue.trend || "stable"),
                class: [getTrendColor(_ctx.data?.revenue.trend || "stable"), "h-4 w-4"]
              }, null, _parent2, _scopeId));
              _push2(`<span class="${ssrRenderClass([getTrendColor(_ctx.data?.revenue.trend || "stable"), "text-sm font-medium"])}" data-v-e8429f06${_scopeId}>${ssrInterpolate(_ctx.data ? formatPercent(_ctx.data.revenue.growth) : "0%")}</span><span class="text-xs text-muted ml-1" data-v-e8429f06${_scopeId}>vs last month</span></div></div><div class="p-2 bg-blue-100 dark:bg-blue-900/20 rounded-lg" data-v-e8429f06${_scopeId}>`);
              _push2(ssrRenderComponent(_component_UIcon, {
                name: "i-lucide-dollar-sign",
                class: "h-5 w-5 text-blue-600 dark:text-blue-400"
              }, null, _parent2, _scopeId));
              _push2(`</div></div>`);
            }
          } else {
            return [
              _ctx.loading ? (openBlock(), createBlock("div", {
                key: 0,
                class: "space-y-3"
              }, [
                createVNode(_component_USkeleton, { class: "h-4 w-20" }),
                createVNode(_component_USkeleton, { class: "h-8 w-32" }),
                createVNode(_component_USkeleton, { class: "h-4 w-24" })
              ])) : (openBlock(), createBlock("div", {
                key: 1,
                class: "flex items-start justify-between"
              }, [
                createVNode("div", { class: "flex-1" }, [
                  createVNode("p", { class: "text-xs text-muted uppercase mb-2" }, " Monthly Revenue "),
                  createVNode("p", { class: "text-2xl font-bold text-highlighted" }, toDisplayString(_ctx.data ? formatCurrency(_ctx.data.revenue.current) : "$0"), 1),
                  createVNode("div", { class: "flex items-center gap-1 mt-1" }, [
                    createVNode(_component_UIcon, {
                      name: getTrendIcon(_ctx.data?.revenue.trend || "stable"),
                      class: [getTrendColor(_ctx.data?.revenue.trend || "stable"), "h-4 w-4"]
                    }, null, 8, ["name", "class"]),
                    createVNode("span", {
                      class: [getTrendColor(_ctx.data?.revenue.trend || "stable"), "text-sm font-medium"]
                    }, toDisplayString(_ctx.data ? formatPercent(_ctx.data.revenue.growth) : "0%"), 3),
                    createVNode("span", { class: "text-xs text-muted ml-1" }, "vs last month")
                  ])
                ]),
                createVNode("div", { class: "p-2 bg-blue-100 dark:bg-blue-900/20 rounded-lg" }, [
                  createVNode(_component_UIcon, {
                    name: "i-lucide-dollar-sign",
                    class: "h-5 w-5 text-blue-600 dark:text-blue-400"
                  })
                ])
              ]))
            ];
          }
        }),
        _: 1
      }, _parent));
      _push(ssrRenderComponent(_component_UCard, { class: "relative overflow-hidden" }, {
        default: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            if (_ctx.loading) {
              _push2(`<div class="space-y-3" data-v-e8429f06${_scopeId}>`);
              _push2(ssrRenderComponent(_component_USkeleton, { class: "h-4 w-20" }, null, _parent2, _scopeId));
              _push2(ssrRenderComponent(_component_USkeleton, { class: "h-8 w-32" }, null, _parent2, _scopeId));
              _push2(ssrRenderComponent(_component_USkeleton, { class: "h-4 w-24" }, null, _parent2, _scopeId));
              _push2(`</div>`);
            } else {
              _push2(`<div class="flex items-start justify-between" data-v-e8429f06${_scopeId}><div class="flex-1" data-v-e8429f06${_scopeId}><p class="text-xs text-muted uppercase mb-2" data-v-e8429f06${_scopeId}> Monthly Expenses </p><p class="text-2xl font-bold text-highlighted" data-v-e8429f06${_scopeId}>${ssrInterpolate(_ctx.data ? formatCurrency(_ctx.data.expenses.current) : "$0")}</p><div class="flex items-center gap-1 mt-1" data-v-e8429f06${_scopeId}>`);
              _push2(ssrRenderComponent(_component_UIcon, {
                name: getTrendIcon(_ctx.data?.expenses.trend || "stable"),
                class: [getTrendColor(_ctx.data?.expenses.trend || "stable", true), "h-4 w-4"]
              }, null, _parent2, _scopeId));
              _push2(`<span class="${ssrRenderClass([getTrendColor(_ctx.data?.expenses.trend || "stable", true), "text-sm font-medium"])}" data-v-e8429f06${_scopeId}>${ssrInterpolate(_ctx.data ? formatPercent(_ctx.data.expenses.growth) : "0%")}</span><span class="text-xs text-muted ml-1" data-v-e8429f06${_scopeId}>vs last month</span></div></div><div class="p-2 bg-red-100 dark:bg-red-900/20 rounded-lg" data-v-e8429f06${_scopeId}>`);
              _push2(ssrRenderComponent(_component_UIcon, {
                name: "i-lucide-credit-card",
                class: "h-5 w-5 text-red-600 dark:text-red-400"
              }, null, _parent2, _scopeId));
              _push2(`</div></div>`);
            }
          } else {
            return [
              _ctx.loading ? (openBlock(), createBlock("div", {
                key: 0,
                class: "space-y-3"
              }, [
                createVNode(_component_USkeleton, { class: "h-4 w-20" }),
                createVNode(_component_USkeleton, { class: "h-8 w-32" }),
                createVNode(_component_USkeleton, { class: "h-4 w-24" })
              ])) : (openBlock(), createBlock("div", {
                key: 1,
                class: "flex items-start justify-between"
              }, [
                createVNode("div", { class: "flex-1" }, [
                  createVNode("p", { class: "text-xs text-muted uppercase mb-2" }, " Monthly Expenses "),
                  createVNode("p", { class: "text-2xl font-bold text-highlighted" }, toDisplayString(_ctx.data ? formatCurrency(_ctx.data.expenses.current) : "$0"), 1),
                  createVNode("div", { class: "flex items-center gap-1 mt-1" }, [
                    createVNode(_component_UIcon, {
                      name: getTrendIcon(_ctx.data?.expenses.trend || "stable"),
                      class: [getTrendColor(_ctx.data?.expenses.trend || "stable", true), "h-4 w-4"]
                    }, null, 8, ["name", "class"]),
                    createVNode("span", {
                      class: [getTrendColor(_ctx.data?.expenses.trend || "stable", true), "text-sm font-medium"]
                    }, toDisplayString(_ctx.data ? formatPercent(_ctx.data.expenses.growth) : "0%"), 3),
                    createVNode("span", { class: "text-xs text-muted ml-1" }, "vs last month")
                  ])
                ]),
                createVNode("div", { class: "p-2 bg-red-100 dark:bg-red-900/20 rounded-lg" }, [
                  createVNode(_component_UIcon, {
                    name: "i-lucide-credit-card",
                    class: "h-5 w-5 text-red-600 dark:text-red-400"
                  })
                ])
              ]))
            ];
          }
        }),
        _: 1
      }, _parent));
      _push(ssrRenderComponent(_component_UCard, { class: "relative overflow-hidden" }, {
        default: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            if (_ctx.loading) {
              _push2(`<div class="space-y-3" data-v-e8429f06${_scopeId}>`);
              _push2(ssrRenderComponent(_component_USkeleton, { class: "h-4 w-20" }, null, _parent2, _scopeId));
              _push2(ssrRenderComponent(_component_USkeleton, { class: "h-8 w-32" }, null, _parent2, _scopeId));
              _push2(ssrRenderComponent(_component_USkeleton, { class: "h-4 w-24" }, null, _parent2, _scopeId));
              _push2(`</div>`);
            } else {
              _push2(`<div class="flex items-start justify-between" data-v-e8429f06${_scopeId}><div class="flex-1" data-v-e8429f06${_scopeId}><p class="text-xs text-muted uppercase mb-2" data-v-e8429f06${_scopeId}> Net Profit </p><p class="text-2xl font-bold text-highlighted" data-v-e8429f06${_scopeId}>${ssrInterpolate(_ctx.data ? formatCurrency(_ctx.data.profit.current) : "$0")}</p><div class="flex items-center gap-1 mt-1" data-v-e8429f06${_scopeId}>`);
              _push2(ssrRenderComponent(_component_UIcon, {
                name: getTrendIcon(_ctx.data?.profit.trend || "stable"),
                class: [getTrendColor(_ctx.data?.profit.trend || "stable"), "h-4 w-4"]
              }, null, _parent2, _scopeId));
              _push2(`<span class="${ssrRenderClass([getTrendColor(_ctx.data?.profit.trend || "stable"), "text-sm font-medium"])}" data-v-e8429f06${_scopeId}>${ssrInterpolate(_ctx.data ? formatPercent(_ctx.data.profit.growth) : "0%")}</span><span class="text-xs text-muted ml-1" data-v-e8429f06${_scopeId}> • ${ssrInterpolate(_ctx.data ? _ctx.data.profit.margin.toFixed(1) : "0")}% margin </span></div></div><div class="p-2 bg-emerald-100 dark:bg-emerald-900/20 rounded-lg" data-v-e8429f06${_scopeId}>`);
              _push2(ssrRenderComponent(_component_UIcon, {
                name: "i-lucide-trending-up",
                class: "h-5 w-5 text-emerald-600 dark:text-emerald-400"
              }, null, _parent2, _scopeId));
              _push2(`</div></div>`);
            }
          } else {
            return [
              _ctx.loading ? (openBlock(), createBlock("div", {
                key: 0,
                class: "space-y-3"
              }, [
                createVNode(_component_USkeleton, { class: "h-4 w-20" }),
                createVNode(_component_USkeleton, { class: "h-8 w-32" }),
                createVNode(_component_USkeleton, { class: "h-4 w-24" })
              ])) : (openBlock(), createBlock("div", {
                key: 1,
                class: "flex items-start justify-between"
              }, [
                createVNode("div", { class: "flex-1" }, [
                  createVNode("p", { class: "text-xs text-muted uppercase mb-2" }, " Net Profit "),
                  createVNode("p", { class: "text-2xl font-bold text-highlighted" }, toDisplayString(_ctx.data ? formatCurrency(_ctx.data.profit.current) : "$0"), 1),
                  createVNode("div", { class: "flex items-center gap-1 mt-1" }, [
                    createVNode(_component_UIcon, {
                      name: getTrendIcon(_ctx.data?.profit.trend || "stable"),
                      class: [getTrendColor(_ctx.data?.profit.trend || "stable"), "h-4 w-4"]
                    }, null, 8, ["name", "class"]),
                    createVNode("span", {
                      class: [getTrendColor(_ctx.data?.profit.trend || "stable"), "text-sm font-medium"]
                    }, toDisplayString(_ctx.data ? formatPercent(_ctx.data.profit.growth) : "0%"), 3),
                    createVNode("span", { class: "text-xs text-muted ml-1" }, " • " + toDisplayString(_ctx.data ? _ctx.data.profit.margin.toFixed(1) : "0") + "% margin ", 1)
                  ])
                ]),
                createVNode("div", { class: "p-2 bg-emerald-100 dark:bg-emerald-900/20 rounded-lg" }, [
                  createVNode(_component_UIcon, {
                    name: "i-lucide-trending-up",
                    class: "h-5 w-5 text-emerald-600 dark:text-emerald-400"
                  })
                ])
              ]))
            ];
          }
        }),
        _: 1
      }, _parent));
      _push(ssrRenderComponent(_component_UCard, { class: "relative overflow-hidden" }, {
        default: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            if (_ctx.loading) {
              _push2(`<div class="space-y-3" data-v-e8429f06${_scopeId}>`);
              _push2(ssrRenderComponent(_component_USkeleton, { class: "h-4 w-20" }, null, _parent2, _scopeId));
              _push2(ssrRenderComponent(_component_USkeleton, { class: "h-8 w-32" }, null, _parent2, _scopeId));
              _push2(ssrRenderComponent(_component_USkeleton, { class: "h-4 w-24" }, null, _parent2, _scopeId));
              _push2(`</div>`);
            } else {
              _push2(`<div class="flex items-start justify-between" data-v-e8429f06${_scopeId}><div class="flex-1" data-v-e8429f06${_scopeId}><p class="text-xs text-muted uppercase mb-2" data-v-e8429f06${_scopeId}> Cash Position </p><p class="text-2xl font-bold text-highlighted" data-v-e8429f06${_scopeId}>${ssrInterpolate(_ctx.data ? formatCurrency(_ctx.data.cash.current) : "$0")}</p><div class="flex items-center justify-between mt-1" data-v-e8429f06${_scopeId}><div class="flex items-center gap-1" data-v-e8429f06${_scopeId}><span class="${ssrRenderClass([getCashStatusColor(_ctx.data?.cash.status || "healthy"), "text-sm font-medium"])}" data-v-e8429f06${_scopeId}>${ssrInterpolate(_ctx.data ? Math.round(_ctx.data.cash.runway) : 0)} days runway </span></div><div class="flex items-center gap-1" data-v-e8429f06${_scopeId}><span class="text-xs text-muted" data-v-e8429f06${_scopeId}>Health:</span><span class="${ssrRenderClass([getHealthScoreColor(_ctx.data?.ratios.healthScore || 0), "text-sm font-bold"])}" data-v-e8429f06${_scopeId}>${ssrInterpolate(_ctx.data ? Math.round(_ctx.data.ratios.healthScore) : 0)}% </span></div></div></div><div class="p-2 bg-amber-100 dark:bg-amber-900/20 rounded-lg" data-v-e8429f06${_scopeId}>`);
              _push2(ssrRenderComponent(_component_UIcon, {
                name: "i-lucide-piggy-bank",
                class: "h-5 w-5 text-amber-600 dark:text-amber-400"
              }, null, _parent2, _scopeId));
              _push2(`</div></div>`);
            }
          } else {
            return [
              _ctx.loading ? (openBlock(), createBlock("div", {
                key: 0,
                class: "space-y-3"
              }, [
                createVNode(_component_USkeleton, { class: "h-4 w-20" }),
                createVNode(_component_USkeleton, { class: "h-8 w-32" }),
                createVNode(_component_USkeleton, { class: "h-4 w-24" })
              ])) : (openBlock(), createBlock("div", {
                key: 1,
                class: "flex items-start justify-between"
              }, [
                createVNode("div", { class: "flex-1" }, [
                  createVNode("p", { class: "text-xs text-muted uppercase mb-2" }, " Cash Position "),
                  createVNode("p", { class: "text-2xl font-bold text-highlighted" }, toDisplayString(_ctx.data ? formatCurrency(_ctx.data.cash.current) : "$0"), 1),
                  createVNode("div", { class: "flex items-center justify-between mt-1" }, [
                    createVNode("div", { class: "flex items-center gap-1" }, [
                      createVNode("span", {
                        class: [getCashStatusColor(_ctx.data?.cash.status || "healthy"), "text-sm font-medium"]
                      }, toDisplayString(_ctx.data ? Math.round(_ctx.data.cash.runway) : 0) + " days runway ", 3)
                    ]),
                    createVNode("div", { class: "flex items-center gap-1" }, [
                      createVNode("span", { class: "text-xs text-muted" }, "Health:"),
                      createVNode("span", {
                        class: [getHealthScoreColor(_ctx.data?.ratios.healthScore || 0), "text-sm font-bold"]
                      }, toDisplayString(_ctx.data ? Math.round(_ctx.data.ratios.healthScore) : 0) + "% ", 3)
                    ])
                  ])
                ]),
                createVNode("div", { class: "p-2 bg-amber-100 dark:bg-amber-900/20 rounded-lg" }, [
                  createVNode(_component_UIcon, {
                    name: "i-lucide-piggy-bank",
                    class: "h-5 w-5 text-amber-600 dark:text-amber-400"
                  })
                ])
              ]))
            ];
          }
        }),
        _: 1
      }, _parent));
      _push(`</div>`);
    };
  }
});
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("components/dashboard/KPICards.vue");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const KPICards = /* @__PURE__ */ Object.assign(_export_sfc(_sfc_main, [["__scopeId", "data-v-e8429f06"]]), { __name: "DashboardKPICards" });

export { KPICards as default };
//# sourceMappingURL=KPICards-sG9mfzwL.mjs.map
