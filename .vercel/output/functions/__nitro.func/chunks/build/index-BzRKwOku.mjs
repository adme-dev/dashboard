import { _ as _sfc_main$1$1, a as _sfc_main$7 } from './DashboardNavbar-Dma8e2D0.mjs';
import { _ as _sfc_main$8 } from './DashboardSidebarCollapse-Bb0ddWxH.mjs';
import { _ as _sfc_main$5 } from './Badge-BfrefdmG.mjs';
import { _ as _sfc_main$a } from './DashboardToolbar-C9qyFRVV.mjs';
import { _ as _sfc_main$b } from './Breadcrumb-1kD8Xb-9.mjs';
import { e as useFetch, d as _sfc_main$9, _ as _sfc_main$e } from './server.mjs';
import { _ as _sfc_main$2 } from './Skeleton-p2Vkb_Gp.mjs';
import { _ as _sfc_main$3 } from './Alert-CLlAchtu.mjs';
import { _ as _sfc_main$4 } from './Card-jqGRZ5Ik.mjs';
import { _ as _sfc_main$6 } from './Table-DItj4AHg.mjs';
import { defineComponent, withAsyncContext, computed, mergeProps, withCtx, unref, createTextVNode, createVNode, toDisplayString, createBlock, openBlock, Fragment, renderList, createCommentVNode, useTemplateRef, useSSRContext } from 'vue';
import { ssrRenderComponent, ssrRenderList, ssrInterpolate, ssrRenderClass } from 'vue/server-renderer';
import { VisXYContainer, VisArea, VisLine, VisAxis, VisCrosshair, VisTooltip } from '@unovis/vue';
import { i as useElementSize } from './index-Btsu36yb.mjs';
import { _ as _export_sfc } from './_plugin-vue_export-helper-1tPrXgE0.mjs';
import './DashboardSidebarToggle-NWn7wtB9.mjs';
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
import '@tanstack/vue-table';

const _sfc_main$1 = /* @__PURE__ */ defineComponent({
  __name: "ProfitTrendChart.client",
  __ssrInlineRender: true,
  props: {
    periods: {}
  },
  setup(__props) {
    const cardRef = useTemplateRef("cardRef");
    const props = __props;
    const { width } = useElementSize(cardRef);
    const data = computed(() => props.periods.map((period, index) => ({
      ...period,
      index
    })));
    const x = (d) => d.index;
    const revenueY = (d) => d.revenue;
    const expensesY = (d) => d.expenses;
    const netProfitY = (d) => d.netProfit;
    const formatCurrency = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0
    }).format;
    const crosshairTemplate = (d) => `
  <div class="flex flex-col gap-1">
    <strong>${d.label}</strong>
    <span>Revenue: ${formatCurrency(d.revenue)}</span>
    <span>Expenses: ${formatCurrency(d.expenses)}</span>
    <span>Net Profit: ${formatCurrency(d.netProfit)}</span>
    <span>Margin: ${(d.profitMargin * 100).toFixed(1)}%</span>
  </div>
`;
    const xTick = (index) => data.value[index]?.label ?? "";
    return (_ctx, _push, _parent, _attrs) => {
      const _component_UCard = _sfc_main$4;
      _push(ssrRenderComponent(_component_UCard, mergeProps({
        ref_key: "cardRef",
        ref: cardRef,
        ui: { body: "!p-0", root: "overflow-visible" }
      }, _attrs), {
        header: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            _push2(`<div data-v-de7c931b${_scopeId}><p class="text-xs text-muted uppercase mb-1.5" data-v-de7c931b${_scopeId}> Profit Trend </p><p class="text-3xl text-highlighted font-semibold" data-v-de7c931b${_scopeId}>${ssrInterpolate(unref(formatCurrency)(unref(data)[unref(data).length - 1]?.netProfit || 0))}</p><p class="text-muted text-xs" data-v-de7c931b${_scopeId}> Net profit change across reporting periods </p></div>`);
          } else {
            return [
              createVNode("div", null, [
                createVNode("p", { class: "text-xs text-muted uppercase mb-1.5" }, " Profit Trend "),
                createVNode("p", { class: "text-3xl text-highlighted font-semibold" }, toDisplayString(unref(formatCurrency)(unref(data)[unref(data).length - 1]?.netProfit || 0)), 1),
                createVNode("p", { class: "text-muted text-xs" }, " Net profit change across reporting periods ")
              ])
            ];
          }
        }),
        footer: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            _push2(`<div class="flex flex-wrap gap-4 text-xs text-muted" data-v-de7c931b${_scopeId}><div class="flex items-center gap-2" data-v-de7c931b${_scopeId}><span class="legend-dot legend-dot--primary" data-v-de7c931b${_scopeId}></span> Revenue </div><div class="flex items-center gap-2" data-v-de7c931b${_scopeId}><span class="legend-dot legend-dot--warning" data-v-de7c931b${_scopeId}></span> Expenses </div><div class="flex items-center gap-2" data-v-de7c931b${_scopeId}><span class="legend-dot legend-dot--positive" data-v-de7c931b${_scopeId}></span> Net profit area </div></div>`);
          } else {
            return [
              createVNode("div", { class: "flex flex-wrap gap-4 text-xs text-muted" }, [
                createVNode("div", { class: "flex items-center gap-2" }, [
                  createVNode("span", { class: "legend-dot legend-dot--primary" }),
                  createTextVNode(" Revenue ")
                ]),
                createVNode("div", { class: "flex items-center gap-2" }, [
                  createVNode("span", { class: "legend-dot legend-dot--warning" }),
                  createTextVNode(" Expenses ")
                ]),
                createVNode("div", { class: "flex items-center gap-2" }, [
                  createVNode("span", { class: "legend-dot legend-dot--positive" }),
                  createTextVNode(" Net profit area ")
                ])
              ])
            ];
          }
        }),
        default: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            _push2(`<div class="h-96" data-v-de7c931b${_scopeId}>`);
            _push2(ssrRenderComponent(unref(VisXYContainer), {
              data: unref(data),
              padding: { top: 40, right: 16, bottom: 40, left: 48 },
              width: unref(width),
              class: "h-full"
            }, {
              default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                if (_push3) {
                  _push3(ssrRenderComponent(unref(VisArea), {
                    x,
                    y: netProfitY,
                    color: "var(--ui-positive)",
                    opacity: 0.15
                  }, null, _parent3, _scopeId2));
                  _push3(ssrRenderComponent(unref(VisLine), {
                    x,
                    y: revenueY,
                    color: "var(--ui-primary)"
                  }, null, _parent3, _scopeId2));
                  _push3(ssrRenderComponent(unref(VisLine), {
                    x,
                    y: expensesY,
                    color: "var(--ui-warning)"
                  }, null, _parent3, _scopeId2));
                  _push3(ssrRenderComponent(unref(VisAxis), {
                    type: "x",
                    x,
                    "tick-format": xTick,
                    padding: { start: 12, end: 12 }
                  }, null, _parent3, _scopeId2));
                  _push3(ssrRenderComponent(unref(VisAxis), { type: "y" }, null, _parent3, _scopeId2));
                  _push3(ssrRenderComponent(unref(VisCrosshair), {
                    color: "var(--ui-primary)",
                    template: crosshairTemplate
                  }, null, _parent3, _scopeId2));
                  _push3(ssrRenderComponent(unref(VisTooltip), null, null, _parent3, _scopeId2));
                } else {
                  return [
                    createVNode(unref(VisArea), {
                      x,
                      y: netProfitY,
                      color: "var(--ui-positive)",
                      opacity: 0.15
                    }),
                    createVNode(unref(VisLine), {
                      x,
                      y: revenueY,
                      color: "var(--ui-primary)"
                    }),
                    createVNode(unref(VisLine), {
                      x,
                      y: expensesY,
                      color: "var(--ui-warning)"
                    }),
                    createVNode(unref(VisAxis), {
                      type: "x",
                      x,
                      "tick-format": xTick,
                      padding: { start: 12, end: 12 }
                    }),
                    createVNode(unref(VisAxis), { type: "y" }),
                    createVNode(unref(VisCrosshair), {
                      color: "var(--ui-primary)",
                      template: crosshairTemplate
                    }),
                    createVNode(unref(VisTooltip))
                  ];
                }
              }),
              _: 1
            }, _parent2, _scopeId));
            _push2(`</div>`);
          } else {
            return [
              createVNode("div", { class: "h-96" }, [
                createVNode(unref(VisXYContainer), {
                  data: unref(data),
                  padding: { top: 40, right: 16, bottom: 40, left: 48 },
                  width: unref(width),
                  class: "h-full"
                }, {
                  default: withCtx(() => [
                    createVNode(unref(VisArea), {
                      x,
                      y: netProfitY,
                      color: "var(--ui-positive)",
                      opacity: 0.15
                    }),
                    createVNode(unref(VisLine), {
                      x,
                      y: revenueY,
                      color: "var(--ui-primary)"
                    }),
                    createVNode(unref(VisLine), {
                      x,
                      y: expensesY,
                      color: "var(--ui-warning)"
                    }),
                    createVNode(unref(VisAxis), {
                      type: "x",
                      x,
                      "tick-format": xTick,
                      padding: { start: 12, end: 12 }
                    }),
                    createVNode(unref(VisAxis), { type: "y" }),
                    createVNode(unref(VisCrosshair), {
                      color: "var(--ui-primary)",
                      template: crosshairTemplate
                    }),
                    createVNode(unref(VisTooltip))
                  ]),
                  _: 1
                }, 8, ["data", "width"])
              ])
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
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("components/reports/ProfitTrendChart.client.vue");
  return _sfc_setup$1 ? _sfc_setup$1(props, ctx) : void 0;
};
const ProfitTrendChart = /* @__PURE__ */ Object.assign(_export_sfc(_sfc_main$1, [["__scopeId", "data-v-de7c931b"]]), { __name: "ReportsProfitTrendChart" });
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "index",
  __ssrInlineRender: true,
  async setup(__props) {
    let __temp, __restore;
    const { data, pending, error, refresh } = ([__temp, __restore] = withAsyncContext(() => useFetch("/api/xero/reports/pnl-detailed", "$Loev-hS9yh")), __temp = await __temp, __restore(), __temp);
    const report = computed(() => data.value ?? null);
    const loading = computed(() => pending.value);
    const hasError = computed(() => Boolean(error.value));
    function formatCurrency(value) {
      if (typeof value !== "number" || Number.isNaN(value)) return "-";
      return value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
    }
    function formatPercent(value) {
      if (typeof value !== "number" || Number.isNaN(value)) return "-";
      return `${(value * 100).toFixed(1)}%`;
    }
    function formatDelta(current, previous) {
      if (previous === 0) {
        if (current === 0) return { label: "No change", sign: "neutral" };
        return { label: `${current > 0 ? "+" : "-"}${formatCurrency(Math.abs(current))} vs prior`, sign: current > 0 ? "positive" : "negative" };
      }
      const delta = current - previous;
      const ratio = delta / Math.abs(previous);
      const label = `${delta >= 0 ? "+" : ""}${(ratio * 100).toFixed(1)}% MoM`;
      const sign = delta > 0 ? "positive" : delta < 0 ? "negative" : "neutral";
      return { label, sign };
    }
    const monthLabel = computed(() => report.value?.meta.monthLabel ?? "Latest month");
    const ytdLabel = computed(() => report.value?.meta.ytdLabel ?? "Year to date");
    const summaryRows = computed(() => {
      if (!report.value) return [];
      const { summary } = report.value;
      return [{
        label: "Revenue",
        metric: summary.revenue
      }, {
        label: "Cost of Sales",
        metric: summary.costOfSales
      }, {
        label: "Gross Profit",
        metric: summary.grossProfit
      }, {
        label: "Operating Expenses",
        metric: summary.operatingExpenses
      }, {
        label: "Net Profit",
        metric: summary.netProfit
      }].map((item) => ({
        ...item,
        delta: formatDelta(item.metric.month, item.metric.previousMonth)
      }));
    });
    const ratioMetrics = computed(() => {
      if (!report.value) return [];
      const { summary } = report.value;
      return [{
        label: "Gross Margin",
        month: summary.grossProfit.month && summary.revenue.month ? summary.grossProfit.month / summary.revenue.month : 0,
        ytd: summary.grossProfit.ytd && summary.revenue.ytd ? summary.grossProfit.ytd / summary.revenue.ytd : 0
      }, {
        label: "Operating Expense Ratio",
        month: summary.operatingExpenses.month && summary.revenue.month ? summary.operatingExpenses.month / summary.revenue.month : 0,
        ytd: summary.operatingExpenses.ytd && summary.revenue.ytd ? summary.operatingExpenses.ytd / summary.revenue.ytd : 0
      }, {
        label: "Net Margin",
        month: summary.netMargin.month,
        ytd: summary.netMargin.ytd
      }];
    });
    const trendData = computed(() => {
      if (!report.value) return [];
      return report.value.trend.labels.map((label, index) => {
        const revenue = report.value?.trend.revenue[index] ?? 0;
        const expenses = report.value?.trend.expenses[index] ?? 0;
        const netProfit = report.value?.trend.netProfit[index] ?? 0;
        const profitMargin = revenue !== 0 ? netProfit / revenue : 0;
        return {
          label,
          revenue,
          expenses,
          netProfit,
          profitMargin
        };
      });
    });
    const revenueBreakdown = computed(() => report.value?.breakdown.revenue ?? []);
    const directCostBreakdown = computed(() => report.value?.breakdown.directCosts ?? []);
    const expenseBreakdown = computed(() => report.value?.breakdown.expenses ?? []);
    const insights = computed(() => report.value?.insights ?? []);
    const recentPeriods = computed(() => report.value?.periods?.slice(-3) ?? []);
    const trailingSummary = computed(() => report.value?.trailing ?? {
      periods: 0,
      revenue: 0,
      directCosts: 0,
      operatingExpenses: 0,
      netProfit: 0
    });
    const lastTwoTotals = computed(() => {
      const periods = report.value?.periods?.slice(-2) ?? [];
      if (periods.length === 0) {
        return {
          periods: 0,
          revenue: 0,
          directCosts: 0,
          operatingExpenses: 0,
          netProfit: 0
        };
      }
      return periods.reduce((acc, period) => {
        acc.revenue += period.revenue;
        acc.directCosts += period.directCosts;
        acc.operatingExpenses += period.operatingExpenses;
        acc.netProfit += period.netProfit;
        acc.periods = periods.length;
        return acc;
      }, {
        periods: periods.length,
        revenue: 0,
        directCosts: 0,
        operatingExpenses: 0,
        netProfit: 0
      });
    });
    function signedCurrency(value) {
      if (value === 0) return formatCurrency(0);
      const formatted = formatCurrency(Math.abs(value));
      return value > 0 ? `+${formatted}` : `-${formatted}`;
    }
    const periodColumns = computed(() => [
      { key: "label", label: "Period", id: "period-label" },
      { key: "revenue", label: "Revenue", id: "period-revenue", class: "text-right" },
      { key: "directCosts", label: "Direct Costs", id: "period-direct-costs", class: "text-right" },
      { key: "operatingExpenses", label: "Operating Expenses", id: "period-op-ex", class: "text-right" },
      { key: "netProfit", label: "Net Profit", id: "period-net", class: "text-right" }
    ]);
    const periodRows = computed(() => recentPeriods.value.map((period) => ({
      label: period.label,
      revenue: formatCurrency(period.revenue),
      directCosts: formatCurrency(period.directCosts),
      operatingExpenses: formatCurrency(period.operatingExpenses),
      netProfit: signedCurrency(period.netProfit)
    })));
    const revenueColumns = computed(() => [
      { key: "name", label: "Category", id: "revenue-category" },
      { key: "month", label: monthLabel.value, id: "revenue-month", class: "text-right" },
      { key: "share", label: "Mix", id: "revenue-share", class: "text-right" },
      { key: "ytd", label: ytdLabel.value, id: "revenue-ytd", class: "text-right" }
    ]);
    const expenseColumns = computed(() => [
      { key: "name", label: "Category", id: "expense-category" },
      { key: "month", label: monthLabel.value, id: "expense-month", class: "text-right" },
      { key: "share", label: "Mix", id: "expense-share", class: "text-right" },
      { key: "ytd", label: ytdLabel.value, id: "expense-ytd", class: "text-right" }
    ]);
    const directCostColumns = computed(() => [
      { key: "name", label: "Category", id: "direct-cost-category" },
      { key: "month", label: monthLabel.value, id: "direct-cost-month", class: "text-right" },
      { key: "share", label: "Mix", id: "direct-cost-share", class: "text-right" },
      { key: "ytd", label: ytdLabel.value, id: "direct-cost-ytd", class: "text-right" }
    ]);
    const basisLabel = computed(() => report.value?.meta.basis ?? "Accrual");
    const generatedAt = computed(() => {
      const raw = report.value?.meta.generatedAt;
      if (!raw) return "-";
      const date = new Date(raw);
      if (Number.isNaN(date.getTime())) return raw;
      return new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "short"
      }).format(date);
    });
    const breadcrumbs = computed(() => [
      { label: "Reports", to: "/reports" },
      { label: "Profit & Loss", to: "/profit-loss" }
    ]);
    const refreshAll = async () => {
      await refresh();
    };
    return (_ctx, _push, _parent, _attrs) => {
      const _component_UDashboardPanel = _sfc_main$1$1;
      const _component_UDashboardNavbar = _sfc_main$7;
      const _component_UDashboardSidebarCollapse = _sfc_main$8;
      const _component_UBadge = _sfc_main$5;
      const _component_UDashboardToolbar = _sfc_main$a;
      const _component_UBreadcrumb = _sfc_main$b;
      const _component_UButton = _sfc_main$9;
      const _component_USkeleton = _sfc_main$2;
      const _component_UAlert = _sfc_main$3;
      const _component_UCard = _sfc_main$4;
      const _component_UTable = _sfc_main$6;
      const _component_UIcon = _sfc_main$e;
      _push(ssrRenderComponent(_component_UDashboardPanel, mergeProps({ id: "profit-loss" }, _attrs), {
        header: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            _push2(ssrRenderComponent(_component_UDashboardNavbar, {
              title: "Profit & Loss",
              description: "Accrual-based performance with last month and YTD detail"
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
                  _push3(ssrRenderComponent(_component_UBadge, {
                    variant: "subtle",
                    color: "neutral"
                  }, {
                    default: withCtx((_3, _push4, _parent4, _scopeId3) => {
                      if (_push4) {
                        _push4(`${ssrInterpolate(unref(basisLabel))} basis `);
                      } else {
                        return [
                          createTextVNode(toDisplayString(unref(basisLabel)) + " basis ", 1)
                        ];
                      }
                    }),
                    _: 1
                  }, _parent3, _scopeId2));
                } else {
                  return [
                    createVNode(_component_UBadge, {
                      variant: "subtle",
                      color: "neutral"
                    }, {
                      default: withCtx(() => [
                        createTextVNode(toDisplayString(unref(basisLabel)) + " basis ", 1)
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
                  _push3(ssrRenderComponent(_component_UBreadcrumb, { links: unref(breadcrumbs) }, null, _parent3, _scopeId2));
                } else {
                  return [
                    createVNode(_component_UBreadcrumb, { links: unref(breadcrumbs) }, null, 8, ["links"])
                  ];
                }
              }),
              right: withCtx((_2, _push3, _parent3, _scopeId2) => {
                if (_push3) {
                  _push3(ssrRenderComponent(_component_UButton, {
                    label: "Refresh",
                    color: "neutral",
                    icon: "i-lucide-refresh-cw",
                    loading: unref(loading),
                    onClick: refreshAll
                  }, null, _parent3, _scopeId2));
                } else {
                  return [
                    createVNode(_component_UButton, {
                      label: "Refresh",
                      color: "neutral",
                      icon: "i-lucide-refresh-cw",
                      loading: unref(loading),
                      onClick: refreshAll
                    }, null, 8, ["loading"])
                  ];
                }
              }),
              _: 1
            }, _parent2, _scopeId));
          } else {
            return [
              createVNode(_component_UDashboardNavbar, {
                title: "Profit & Loss",
                description: "Accrual-based performance with last month and YTD detail"
              }, {
                leading: withCtx(() => [
                  createVNode(_component_UDashboardSidebarCollapse)
                ]),
                right: withCtx(() => [
                  createVNode(_component_UBadge, {
                    variant: "subtle",
                    color: "neutral"
                  }, {
                    default: withCtx(() => [
                      createTextVNode(toDisplayString(unref(basisLabel)) + " basis ", 1)
                    ]),
                    _: 1
                  })
                ]),
                _: 1
              }),
              createVNode(_component_UDashboardToolbar, null, {
                left: withCtx(() => [
                  createVNode(_component_UBreadcrumb, { links: unref(breadcrumbs) }, null, 8, ["links"])
                ]),
                right: withCtx(() => [
                  createVNode(_component_UButton, {
                    label: "Refresh",
                    color: "neutral",
                    icon: "i-lucide-refresh-cw",
                    loading: unref(loading),
                    onClick: refreshAll
                  }, null, 8, ["loading"])
                ]),
                _: 1
              })
            ];
          }
        }),
        body: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            if (unref(loading)) {
              _push2(`<div class="space-y-6"${_scopeId}><div class="grid grid-cols-1 lg:grid-cols-5 gap-4"${_scopeId}><!--[-->`);
              ssrRenderList(5, (n) => {
                _push2(ssrRenderComponent(_component_USkeleton, {
                  key: `summary-${n}`,
                  class: "h-28"
                }, null, _parent2, _scopeId));
              });
              _push2(`<!--]--></div>`);
              _push2(ssrRenderComponent(_component_USkeleton, { class: "h-80" }, null, _parent2, _scopeId));
              _push2(`</div>`);
            } else if (unref(hasError)) {
              _push2(`<div class="space-y-4"${_scopeId}>`);
              _push2(ssrRenderComponent(_component_UAlert, {
                title: "Unable to load Profit & Loss data",
                description: "There was an issue retrieving the detailed report from Xero. Please try again.",
                color: "negative",
                variant: "soft",
                icon: "i-lucide-alert-triangle"
              }, null, _parent2, _scopeId));
              _push2(ssrRenderComponent(_component_UButton, {
                icon: "i-lucide-refresh-cw",
                onClick: refreshAll
              }, {
                default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                  if (_push3) {
                    _push3(` Retry `);
                  } else {
                    return [
                      createTextVNode(" Retry ")
                    ];
                  }
                }),
                _: 1
              }, _parent2, _scopeId));
              _push2(`</div>`);
            } else {
              _push2(`<div class="space-y-6"${_scopeId}><div class="grid grid-cols-1 xl:grid-cols-3 gap-4"${_scopeId}>`);
              _push2(ssrRenderComponent(_component_UCard, {
                class: "xl:col-span-2",
                ui: { body: "!p-6 space-y-6" }
              }, {
                default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                  if (_push3) {
                    _push3(`<header class="flex items-start justify-between gap-4"${_scopeId2}><div${_scopeId2}><p class="text-xs uppercase text-muted mb-1"${_scopeId2}>Summary</p><h2 class="text-2xl font-semibold"${_scopeId2}>${ssrInterpolate(unref(monthLabel))}</h2><p class="text-sm text-muted"${_scopeId2}>Comparing prior month and ${ssrInterpolate(unref(ytdLabel))}</p></div><div class="text-right text-xs text-muted"${_scopeId2}><p${_scopeId2}>Generated ${ssrInterpolate(unref(generatedAt))}</p></div></header><div class="grid grid-cols-1 md:grid-cols-5 gap-4"${_scopeId2}><!--[-->`);
                    ssrRenderList(unref(summaryRows), (item) => {
                      _push3(`<div class="space-y-3"${_scopeId2}><p class="text-xs text-muted uppercase"${_scopeId2}>${ssrInterpolate(item.label)}</p><div${_scopeId2}><p class="text-xl font-semibold"${_scopeId2}>${ssrInterpolate(formatCurrency(item.metric.month))}</p><p class="text-xs text-muted"${_scopeId2}>${ssrInterpolate(unref(monthLabel))}</p></div><div class="text-sm"${_scopeId2}><span class="${ssrRenderClass([
                        "inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs",
                        item.delta.sign === "positive" && "bg-positive/10 text-positive",
                        item.delta.sign === "negative" && "bg-negative/10 text-negative",
                        item.delta.sign === "neutral" && "bg-muted/30 text-muted"
                      ])}"${_scopeId2}>${ssrInterpolate(item.delta.label)}</span></div><div${_scopeId2}><p class="text-sm font-medium"${_scopeId2}>${ssrInterpolate(formatCurrency(item.metric.ytd))}</p><p class="text-xs text-muted"${_scopeId2}>${ssrInterpolate(unref(ytdLabel))}</p></div></div>`);
                    });
                    _push3(`<!--]--></div>`);
                  } else {
                    return [
                      createVNode("header", { class: "flex items-start justify-between gap-4" }, [
                        createVNode("div", null, [
                          createVNode("p", { class: "text-xs uppercase text-muted mb-1" }, "Summary"),
                          createVNode("h2", { class: "text-2xl font-semibold" }, toDisplayString(unref(monthLabel)), 1),
                          createVNode("p", { class: "text-sm text-muted" }, "Comparing prior month and " + toDisplayString(unref(ytdLabel)), 1)
                        ]),
                        createVNode("div", { class: "text-right text-xs text-muted" }, [
                          createVNode("p", null, "Generated " + toDisplayString(unref(generatedAt)), 1)
                        ])
                      ]),
                      createVNode("div", { class: "grid grid-cols-1 md:grid-cols-5 gap-4" }, [
                        (openBlock(true), createBlock(Fragment, null, renderList(unref(summaryRows), (item) => {
                          return openBlock(), createBlock("div", {
                            key: item.label,
                            class: "space-y-3"
                          }, [
                            createVNode("p", { class: "text-xs text-muted uppercase" }, toDisplayString(item.label), 1),
                            createVNode("div", null, [
                              createVNode("p", { class: "text-xl font-semibold" }, toDisplayString(formatCurrency(item.metric.month)), 1),
                              createVNode("p", { class: "text-xs text-muted" }, toDisplayString(unref(monthLabel)), 1)
                            ]),
                            createVNode("div", { class: "text-sm" }, [
                              createVNode("span", {
                                class: [
                                  "inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs",
                                  item.delta.sign === "positive" && "bg-positive/10 text-positive",
                                  item.delta.sign === "negative" && "bg-negative/10 text-negative",
                                  item.delta.sign === "neutral" && "bg-muted/30 text-muted"
                                ]
                              }, toDisplayString(item.delta.label), 3)
                            ]),
                            createVNode("div", null, [
                              createVNode("p", { class: "text-sm font-medium" }, toDisplayString(formatCurrency(item.metric.ytd)), 1),
                              createVNode("p", { class: "text-xs text-muted" }, toDisplayString(unref(ytdLabel)), 1)
                            ])
                          ]);
                        }), 128))
                      ])
                    ];
                  }
                }),
                _: 1
              }, _parent2, _scopeId));
              _push2(ssrRenderComponent(_component_UCard, { ui: { body: "!p-6" } }, {
                default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                  if (_push3) {
                    _push3(`<p class="text-xs text-muted uppercase mb-2"${_scopeId2}>Margins</p><div class="space-y-4"${_scopeId2}><!--[-->`);
                    ssrRenderList(unref(ratioMetrics), (metric) => {
                      _push3(`<div${_scopeId2}><div class="flex items-center justify-between text-xs text-muted mb-1"${_scopeId2}><span${_scopeId2}>${ssrInterpolate(metric.label)}</span><span${_scopeId2}>${ssrInterpolate(unref(ytdLabel))}</span></div><div class="flex items-baseline justify-between"${_scopeId2}><p class="text-lg font-semibold"${_scopeId2}>${ssrInterpolate(formatPercent(metric.month))}</p><p class="text-sm font-medium"${_scopeId2}>${ssrInterpolate(formatPercent(metric.ytd))}</p></div><p class="text-xs text-muted"${_scopeId2}>${ssrInterpolate(unref(monthLabel))}</p></div>`);
                    });
                    _push3(`<!--]--></div>`);
                  } else {
                    return [
                      createVNode("p", { class: "text-xs text-muted uppercase mb-2" }, "Margins"),
                      createVNode("div", { class: "space-y-4" }, [
                        (openBlock(true), createBlock(Fragment, null, renderList(unref(ratioMetrics), (metric) => {
                          return openBlock(), createBlock("div", {
                            key: metric.label
                          }, [
                            createVNode("div", { class: "flex items-center justify-between text-xs text-muted mb-1" }, [
                              createVNode("span", null, toDisplayString(metric.label), 1),
                              createVNode("span", null, toDisplayString(unref(ytdLabel)), 1)
                            ]),
                            createVNode("div", { class: "flex items-baseline justify-between" }, [
                              createVNode("p", { class: "text-lg font-semibold" }, toDisplayString(formatPercent(metric.month)), 1),
                              createVNode("p", { class: "text-sm font-medium" }, toDisplayString(formatPercent(metric.ytd)), 1)
                            ]),
                            createVNode("p", { class: "text-xs text-muted" }, toDisplayString(unref(monthLabel)), 1)
                          ]);
                        }), 128))
                      ])
                    ];
                  }
                }),
                _: 1
              }, _parent2, _scopeId));
              _push2(`</div>`);
              if (unref(trailingSummary).periods >= 2) {
                _push2(ssrRenderComponent(_component_UCard, { ui: { body: "!p-6 space-y-6" } }, {
                  default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                    if (_push3) {
                      _push3(`<header class="flex items-center justify-between"${_scopeId2}><div${_scopeId2}><p class="text-xs uppercase text-muted"${_scopeId2}>Trailing performance clarity</p><h3 class="text-lg font-semibold"${_scopeId2}>Last ${ssrInterpolate(unref(trailingSummary).periods)} months</h3></div>`);
                      _push3(ssrRenderComponent(_component_UBadge, {
                        color: unref(trailingSummary).netProfit >= 0 ? "positive" : "negative",
                        variant: "subtle"
                      }, {
                        default: withCtx((_3, _push4, _parent4, _scopeId3) => {
                          if (_push4) {
                            _push4(`${ssrInterpolate(signedCurrency(unref(trailingSummary).netProfit))} net `);
                          } else {
                            return [
                              createTextVNode(toDisplayString(signedCurrency(unref(trailingSummary).netProfit)) + " net ", 1)
                            ];
                          }
                        }),
                        _: 1
                      }, _parent3, _scopeId2));
                      _push3(`</header><div class="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm"${_scopeId2}><div class="space-y-2"${_scopeId2}><p class="text-xs uppercase text-muted"${_scopeId2}>Trailing window (${ssrInterpolate(unref(trailingSummary).periods)} months)</p><ul class="space-y-1"${_scopeId2}><li class="flex justify-between"${_scopeId2}><span${_scopeId2}>Revenue</span><span${_scopeId2}>${ssrInterpolate(formatCurrency(unref(trailingSummary).revenue))}</span></li><li class="flex justify-between"${_scopeId2}><span${_scopeId2}>Direct costs</span><span${_scopeId2}>${ssrInterpolate(formatCurrency(unref(trailingSummary).directCosts))}</span></li><li class="flex justify-between"${_scopeId2}><span${_scopeId2}>Gross profit</span><span${_scopeId2}>${ssrInterpolate(formatCurrency(unref(trailingSummary).revenue - unref(trailingSummary).directCosts))}</span></li><li class="flex justify-between"${_scopeId2}><span${_scopeId2}>Operating expenses</span><span${_scopeId2}>${ssrInterpolate(formatCurrency(unref(trailingSummary).operatingExpenses))}</span></li><li class="flex justify-between font-medium"${_scopeId2}><span${_scopeId2}>Net profit</span><span${_scopeId2}>${ssrInterpolate(signedCurrency(unref(trailingSummary).netProfit))}</span></li></ul>`);
                      if (unref(trailingSummary).periods > unref(lastTwoTotals).periods) {
                        _push3(`<p class="text-xs text-muted"${_scopeId2}> Extra ${ssrInterpolate(unref(trailingSummary).periods - unref(lastTwoTotals).periods)} month(s) add ${ssrInterpolate(signedCurrency(unref(trailingSummary).netProfit - unref(lastTwoTotals).netProfit))} to the cumulative result, explaining the reported $173k loss versus the $60k two-month view. </p>`);
                      } else {
                        _push3(`<!---->`);
                      }
                      _push3(`</div>`);
                      if (unref(lastTwoTotals).periods === 2) {
                        _push3(`<div class="space-y-2"${_scopeId2}><p class="text-xs uppercase text-muted"${_scopeId2}>Last two closed months</p><ul class="space-y-1"${_scopeId2}><li class="flex justify-between"${_scopeId2}><span${_scopeId2}>Revenue</span><span${_scopeId2}>${ssrInterpolate(formatCurrency(unref(lastTwoTotals).revenue))}</span></li><li class="flex justify-between"${_scopeId2}><span${_scopeId2}>Direct costs</span><span${_scopeId2}>${ssrInterpolate(formatCurrency(unref(lastTwoTotals).directCosts))}</span></li><li class="flex justify-between"${_scopeId2}><span${_scopeId2}>Gross profit</span><span${_scopeId2}>${ssrInterpolate(formatCurrency(unref(lastTwoTotals).revenue - unref(lastTwoTotals).directCosts))}</span></li><li class="flex justify-between"${_scopeId2}><span${_scopeId2}>Operating expenses</span><span${_scopeId2}>${ssrInterpolate(formatCurrency(unref(lastTwoTotals).operatingExpenses))}</span></li><li class="flex justify-between font-medium"${_scopeId2}><span${_scopeId2}>Net profit</span><span${_scopeId2}>${ssrInterpolate(signedCurrency(unref(lastTwoTotals).netProfit))}</span></li></ul><p class="text-xs text-muted"${_scopeId2}> Figures above align with management&#39;s July &amp; August view. Direct costs include PPC/media charges, which explains the lower trading income compared to invoice totals. </p></div>`);
                      } else {
                        _push3(`<!---->`);
                      }
                      _push3(`</div>`);
                    } else {
                      return [
                        createVNode("header", { class: "flex items-center justify-between" }, [
                          createVNode("div", null, [
                            createVNode("p", { class: "text-xs uppercase text-muted" }, "Trailing performance clarity"),
                            createVNode("h3", { class: "text-lg font-semibold" }, "Last " + toDisplayString(unref(trailingSummary).periods) + " months", 1)
                          ]),
                          createVNode(_component_UBadge, {
                            color: unref(trailingSummary).netProfit >= 0 ? "positive" : "negative",
                            variant: "subtle"
                          }, {
                            default: withCtx(() => [
                              createTextVNode(toDisplayString(signedCurrency(unref(trailingSummary).netProfit)) + " net ", 1)
                            ]),
                            _: 1
                          }, 8, ["color"])
                        ]),
                        createVNode("div", { class: "grid grid-cols-1 md:grid-cols-2 gap-6 text-sm" }, [
                          createVNode("div", { class: "space-y-2" }, [
                            createVNode("p", { class: "text-xs uppercase text-muted" }, "Trailing window (" + toDisplayString(unref(trailingSummary).periods) + " months)", 1),
                            createVNode("ul", { class: "space-y-1" }, [
                              createVNode("li", { class: "flex justify-between" }, [
                                createVNode("span", null, "Revenue"),
                                createVNode("span", null, toDisplayString(formatCurrency(unref(trailingSummary).revenue)), 1)
                              ]),
                              createVNode("li", { class: "flex justify-between" }, [
                                createVNode("span", null, "Direct costs"),
                                createVNode("span", null, toDisplayString(formatCurrency(unref(trailingSummary).directCosts)), 1)
                              ]),
                              createVNode("li", { class: "flex justify-between" }, [
                                createVNode("span", null, "Gross profit"),
                                createVNode("span", null, toDisplayString(formatCurrency(unref(trailingSummary).revenue - unref(trailingSummary).directCosts)), 1)
                              ]),
                              createVNode("li", { class: "flex justify-between" }, [
                                createVNode("span", null, "Operating expenses"),
                                createVNode("span", null, toDisplayString(formatCurrency(unref(trailingSummary).operatingExpenses)), 1)
                              ]),
                              createVNode("li", { class: "flex justify-between font-medium" }, [
                                createVNode("span", null, "Net profit"),
                                createVNode("span", null, toDisplayString(signedCurrency(unref(trailingSummary).netProfit)), 1)
                              ])
                            ]),
                            unref(trailingSummary).periods > unref(lastTwoTotals).periods ? (openBlock(), createBlock("p", {
                              key: 0,
                              class: "text-xs text-muted"
                            }, " Extra " + toDisplayString(unref(trailingSummary).periods - unref(lastTwoTotals).periods) + " month(s) add " + toDisplayString(signedCurrency(unref(trailingSummary).netProfit - unref(lastTwoTotals).netProfit)) + " to the cumulative result, explaining the reported $173k loss versus the $60k two-month view. ", 1)) : createCommentVNode("", true)
                          ]),
                          unref(lastTwoTotals).periods === 2 ? (openBlock(), createBlock("div", {
                            key: 0,
                            class: "space-y-2"
                          }, [
                            createVNode("p", { class: "text-xs uppercase text-muted" }, "Last two closed months"),
                            createVNode("ul", { class: "space-y-1" }, [
                              createVNode("li", { class: "flex justify-between" }, [
                                createVNode("span", null, "Revenue"),
                                createVNode("span", null, toDisplayString(formatCurrency(unref(lastTwoTotals).revenue)), 1)
                              ]),
                              createVNode("li", { class: "flex justify-between" }, [
                                createVNode("span", null, "Direct costs"),
                                createVNode("span", null, toDisplayString(formatCurrency(unref(lastTwoTotals).directCosts)), 1)
                              ]),
                              createVNode("li", { class: "flex justify-between" }, [
                                createVNode("span", null, "Gross profit"),
                                createVNode("span", null, toDisplayString(formatCurrency(unref(lastTwoTotals).revenue - unref(lastTwoTotals).directCosts)), 1)
                              ]),
                              createVNode("li", { class: "flex justify-between" }, [
                                createVNode("span", null, "Operating expenses"),
                                createVNode("span", null, toDisplayString(formatCurrency(unref(lastTwoTotals).operatingExpenses)), 1)
                              ]),
                              createVNode("li", { class: "flex justify-between font-medium" }, [
                                createVNode("span", null, "Net profit"),
                                createVNode("span", null, toDisplayString(signedCurrency(unref(lastTwoTotals).netProfit)), 1)
                              ])
                            ]),
                            createVNode("p", { class: "text-xs text-muted" }, " Figures above align with management's July & August view. Direct costs include PPC/media charges, which explains the lower trading income compared to invoice totals. ")
                          ])) : createCommentVNode("", true)
                        ])
                      ];
                    }
                  }),
                  _: 1
                }, _parent2, _scopeId));
              } else {
                _push2(`<!---->`);
              }
              _push2(`<div class="grid grid-cols-1 xl:grid-cols-3 gap-4"${_scopeId}>`);
              if (unref(trendData).length > 1) {
                _push2(ssrRenderComponent(ProfitTrendChart, {
                  periods: unref(trendData),
                  class: "xl:col-span-2"
                }, null, _parent2, _scopeId));
              } else {
                _push2(ssrRenderComponent(_component_UCard, {
                  variant: "subtle",
                  class: "xl:col-span-2"
                }, {
                  default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                    if (_push3) {
                      _push3(`<div class="p-6 text-sm text-muted"${_scopeId2}> Additional historical periods are required to render the trend chart. </div>`);
                    } else {
                      return [
                        createVNode("div", { class: "p-6 text-sm text-muted" }, " Additional historical periods are required to render the trend chart. ")
                      ];
                    }
                  }),
                  _: 1
                }, _parent2, _scopeId));
              }
              _push2(`<div class="space-y-4"${_scopeId}>`);
              _push2(ssrRenderComponent(_component_UCard, { ui: { body: "!p-6" } }, {
                default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                  if (_push3) {
                    _push3(`<div class="flex items-center justify-between mb-4"${_scopeId2}><div${_scopeId2}><p class="text-xs uppercase text-muted mb-1"${_scopeId2}>Current Basis</p><p class="font-semibold"${_scopeId2}>${ssrInterpolate(unref(basisLabel))} accounting</p></div>`);
                    _push3(ssrRenderComponent(_component_UBadge, {
                      color: "primary",
                      variant: "subtle"
                    }, {
                      default: withCtx((_3, _push4, _parent4, _scopeId3) => {
                        if (_push4) {
                          _push4(`${ssrInterpolate(unref(ytdLabel))}`);
                        } else {
                          return [
                            createTextVNode(toDisplayString(unref(ytdLabel)), 1)
                          ];
                        }
                      }),
                      _: 1
                    }, _parent3, _scopeId2));
                    _push3(`</div><ul class="space-y-3 text-sm text-muted"${_scopeId2}><li${_scopeId2}> Month range: ${ssrInterpolate(unref(report)?.meta.monthStart)} → ${ssrInterpolate(unref(report)?.meta.monthEnd)}</li><li${_scopeId2}> Periods analysed: ${ssrInterpolate(unref(report)?.meta.periodLabels.length)}</li><li${_scopeId2}> Net margin: ${ssrInterpolate(formatPercent(unref(report)?.summary.netMargin.month || 0))} (month) </li><li${_scopeId2}> Net margin YTD: ${ssrInterpolate(formatPercent(unref(report)?.summary.netMargin.ytd || 0))}</li></ul>`);
                  } else {
                    return [
                      createVNode("div", { class: "flex items-center justify-between mb-4" }, [
                        createVNode("div", null, [
                          createVNode("p", { class: "text-xs uppercase text-muted mb-1" }, "Current Basis"),
                          createVNode("p", { class: "font-semibold" }, toDisplayString(unref(basisLabel)) + " accounting", 1)
                        ]),
                        createVNode(_component_UBadge, {
                          color: "primary",
                          variant: "subtle"
                        }, {
                          default: withCtx(() => [
                            createTextVNode(toDisplayString(unref(ytdLabel)), 1)
                          ]),
                          _: 1
                        })
                      ]),
                      createVNode("ul", { class: "space-y-3 text-sm text-muted" }, [
                        createVNode("li", null, " Month range: " + toDisplayString(unref(report)?.meta.monthStart) + " → " + toDisplayString(unref(report)?.meta.monthEnd), 1),
                        createVNode("li", null, " Periods analysed: " + toDisplayString(unref(report)?.meta.periodLabels.length), 1),
                        createVNode("li", null, " Net margin: " + toDisplayString(formatPercent(unref(report)?.summary.netMargin.month || 0)) + " (month) ", 1),
                        createVNode("li", null, " Net margin YTD: " + toDisplayString(formatPercent(unref(report)?.summary.netMargin.ytd || 0)), 1)
                      ])
                    ];
                  }
                }),
                _: 1
              }, _parent2, _scopeId));
              _push2(ssrRenderComponent(_component_UCard, {
                title: "Recent Period Performance",
                variant: "subtle"
              }, {
                default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                  if (_push3) {
                    if (unref(periodRows).length) {
                      _push3(`<!--[-->`);
                      _push3(ssrRenderComponent(_component_UTable, {
                        columns: unref(periodColumns),
                        rows: unref(periodRows)
                      }, null, _parent3, _scopeId2));
                      _push3(`<p class="text-xs text-muted mt-3"${_scopeId2}> Use this to reconcile management reporting. Net profit is shown with signs to highlight months driving cumulative losses. </p><!--]-->`);
                    } else {
                      _push3(`<p class="text-sm text-muted"${_scopeId2}>Historical period detail was not provided in the P&amp;L response.</p>`);
                    }
                  } else {
                    return [
                      unref(periodRows).length ? (openBlock(), createBlock(Fragment, { key: 0 }, [
                        createVNode(_component_UTable, {
                          columns: unref(periodColumns),
                          rows: unref(periodRows)
                        }, null, 8, ["columns", "rows"]),
                        createVNode("p", { class: "text-xs text-muted mt-3" }, " Use this to reconcile management reporting. Net profit is shown with signs to highlight months driving cumulative losses. ")
                      ], 64)) : (openBlock(), createBlock("p", {
                        key: 1,
                        class: "text-sm text-muted"
                      }, "Historical period detail was not provided in the P&L response."))
                    ];
                  }
                }),
                _: 1
              }, _parent2, _scopeId));
              _push2(`</div></div><div class="grid grid-cols-1 xl:grid-cols-3 gap-4"${_scopeId}>`);
              _push2(ssrRenderComponent(_component_UCard, {
                title: "Direct Costs Breakdown",
                variant: "subtle"
              }, {
                default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                  if (_push3) {
                    if (unref(directCostBreakdown).length) {
                      _push3(`<!--[-->`);
                      _push3(ssrRenderComponent(_component_UTable, {
                        columns: unref(directCostColumns),
                        rows: unref(directCostBreakdown).map((item) => ({
                          name: item.name,
                          month: formatCurrency(item.month),
                          share: formatPercent(item.monthShare),
                          ytd: formatCurrency(item.ytd)
                        }))
                      }, null, _parent3, _scopeId2));
                      _push3(`<p class="text-xs text-muted mt-3"${_scopeId2}> Direct costs capture PPC and other pass-through media spend booked against trading income. Large swings here explain why invoiced income differs from the accounting revenue figure. </p><!--]-->`);
                    } else {
                      _push3(`<p class="text-sm text-muted"${_scopeId2}>No direct cost detail was returned for the selected month.</p>`);
                    }
                  } else {
                    return [
                      unref(directCostBreakdown).length ? (openBlock(), createBlock(Fragment, { key: 0 }, [
                        createVNode(_component_UTable, {
                          columns: unref(directCostColumns),
                          rows: unref(directCostBreakdown).map((item) => ({
                            name: item.name,
                            month: formatCurrency(item.month),
                            share: formatPercent(item.monthShare),
                            ytd: formatCurrency(item.ytd)
                          }))
                        }, null, 8, ["columns", "rows"]),
                        createVNode("p", { class: "text-xs text-muted mt-3" }, " Direct costs capture PPC and other pass-through media spend booked against trading income. Large swings here explain why invoiced income differs from the accounting revenue figure. ")
                      ], 64)) : (openBlock(), createBlock("p", {
                        key: 1,
                        class: "text-sm text-muted"
                      }, "No direct cost detail was returned for the selected month."))
                    ];
                  }
                }),
                _: 1
              }, _parent2, _scopeId));
              _push2(ssrRenderComponent(_component_UCard, {
                title: "Revenue Breakdown",
                variant: "subtle"
              }, {
                default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                  if (_push3) {
                    if (unref(revenueBreakdown).length) {
                      _push3(ssrRenderComponent(_component_UTable, {
                        columns: unref(revenueColumns),
                        rows: unref(revenueBreakdown).map((item) => ({
                          name: item.name,
                          month: formatCurrency(item.month),
                          share: formatPercent(item.monthShare),
                          ytd: formatCurrency(item.ytd)
                        }))
                      }, null, _parent3, _scopeId2));
                    } else {
                      _push3(`<p class="text-sm text-muted"${_scopeId2}>No revenue categories returned for the selected month.</p>`);
                    }
                  } else {
                    return [
                      unref(revenueBreakdown).length ? (openBlock(), createBlock(_component_UTable, {
                        key: 0,
                        columns: unref(revenueColumns),
                        rows: unref(revenueBreakdown).map((item) => ({
                          name: item.name,
                          month: formatCurrency(item.month),
                          share: formatPercent(item.monthShare),
                          ytd: formatCurrency(item.ytd)
                        }))
                      }, null, 8, ["columns", "rows"])) : (openBlock(), createBlock("p", {
                        key: 1,
                        class: "text-sm text-muted"
                      }, "No revenue categories returned for the selected month."))
                    ];
                  }
                }),
                _: 1
              }, _parent2, _scopeId));
              _push2(ssrRenderComponent(_component_UCard, {
                title: "Operating Expenses Breakdown",
                variant: "subtle"
              }, {
                default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                  if (_push3) {
                    if (unref(expenseBreakdown).length) {
                      _push3(ssrRenderComponent(_component_UTable, {
                        columns: unref(expenseColumns),
                        rows: unref(expenseBreakdown).map((item) => ({
                          name: item.name,
                          month: formatCurrency(item.month),
                          share: formatPercent(item.monthShare),
                          ytd: formatCurrency(item.ytd)
                        }))
                      }, null, _parent3, _scopeId2));
                    } else {
                      _push3(`<p class="text-sm text-muted"${_scopeId2}>No operating expense categories returned for the selected month.</p>`);
                    }
                  } else {
                    return [
                      unref(expenseBreakdown).length ? (openBlock(), createBlock(_component_UTable, {
                        key: 0,
                        columns: unref(expenseColumns),
                        rows: unref(expenseBreakdown).map((item) => ({
                          name: item.name,
                          month: formatCurrency(item.month),
                          share: formatPercent(item.monthShare),
                          ytd: formatCurrency(item.ytd)
                        }))
                      }, null, 8, ["columns", "rows"])) : (openBlock(), createBlock("p", {
                        key: 1,
                        class: "text-sm text-muted"
                      }, "No operating expense categories returned for the selected month."))
                    ];
                  }
                }),
                _: 1
              }, _parent2, _scopeId));
              _push2(`</div>`);
              _push2(ssrRenderComponent(_component_UCard, {
                title: "Automated Insights",
                variant: "subtle"
              }, {
                default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                  if (_push3) {
                    if (unref(insights).length) {
                      _push3(`<ul class="space-y-3"${_scopeId2}><!--[-->`);
                      ssrRenderList(unref(insights), (insight, index) => {
                        _push3(`<li class="flex gap-3 items-start"${_scopeId2}>`);
                        _push3(ssrRenderComponent(_component_UIcon, {
                          name: "i-lucide-sparkles",
                          class: "h-5 w-5 text-primary mt-0.5"
                        }, null, _parent3, _scopeId2));
                        _push3(`<span class="text-sm leading-relaxed"${_scopeId2}>${ssrInterpolate(insight)}</span></li>`);
                      });
                      _push3(`<!--]--></ul>`);
                    } else {
                      _push3(`<p class="text-sm text-muted"${_scopeId2}>Insights will appear once we detect notable changes in your monthly results.</p>`);
                    }
                  } else {
                    return [
                      unref(insights).length ? (openBlock(), createBlock("ul", {
                        key: 0,
                        class: "space-y-3"
                      }, [
                        (openBlock(true), createBlock(Fragment, null, renderList(unref(insights), (insight, index) => {
                          return openBlock(), createBlock("li", {
                            key: index,
                            class: "flex gap-3 items-start"
                          }, [
                            createVNode(_component_UIcon, {
                              name: "i-lucide-sparkles",
                              class: "h-5 w-5 text-primary mt-0.5"
                            }),
                            createVNode("span", { class: "text-sm leading-relaxed" }, toDisplayString(insight), 1)
                          ]);
                        }), 128))
                      ])) : (openBlock(), createBlock("p", {
                        key: 1,
                        class: "text-sm text-muted"
                      }, "Insights will appear once we detect notable changes in your monthly results."))
                    ];
                  }
                }),
                _: 1
              }, _parent2, _scopeId));
              _push2(`</div>`);
            }
          } else {
            return [
              unref(loading) ? (openBlock(), createBlock("div", {
                key: 0,
                class: "space-y-6"
              }, [
                createVNode("div", { class: "grid grid-cols-1 lg:grid-cols-5 gap-4" }, [
                  (openBlock(), createBlock(Fragment, null, renderList(5, (n) => {
                    return createVNode(_component_USkeleton, {
                      key: `summary-${n}`,
                      class: "h-28"
                    });
                  }), 64))
                ]),
                createVNode(_component_USkeleton, { class: "h-80" })
              ])) : unref(hasError) ? (openBlock(), createBlock("div", {
                key: 1,
                class: "space-y-4"
              }, [
                createVNode(_component_UAlert, {
                  title: "Unable to load Profit & Loss data",
                  description: "There was an issue retrieving the detailed report from Xero. Please try again.",
                  color: "negative",
                  variant: "soft",
                  icon: "i-lucide-alert-triangle"
                }),
                createVNode(_component_UButton, {
                  icon: "i-lucide-refresh-cw",
                  onClick: refreshAll
                }, {
                  default: withCtx(() => [
                    createTextVNode(" Retry ")
                  ]),
                  _: 1
                })
              ])) : (openBlock(), createBlock("div", {
                key: 2,
                class: "space-y-6"
              }, [
                createVNode("div", { class: "grid grid-cols-1 xl:grid-cols-3 gap-4" }, [
                  createVNode(_component_UCard, {
                    class: "xl:col-span-2",
                    ui: { body: "!p-6 space-y-6" }
                  }, {
                    default: withCtx(() => [
                      createVNode("header", { class: "flex items-start justify-between gap-4" }, [
                        createVNode("div", null, [
                          createVNode("p", { class: "text-xs uppercase text-muted mb-1" }, "Summary"),
                          createVNode("h2", { class: "text-2xl font-semibold" }, toDisplayString(unref(monthLabel)), 1),
                          createVNode("p", { class: "text-sm text-muted" }, "Comparing prior month and " + toDisplayString(unref(ytdLabel)), 1)
                        ]),
                        createVNode("div", { class: "text-right text-xs text-muted" }, [
                          createVNode("p", null, "Generated " + toDisplayString(unref(generatedAt)), 1)
                        ])
                      ]),
                      createVNode("div", { class: "grid grid-cols-1 md:grid-cols-5 gap-4" }, [
                        (openBlock(true), createBlock(Fragment, null, renderList(unref(summaryRows), (item) => {
                          return openBlock(), createBlock("div", {
                            key: item.label,
                            class: "space-y-3"
                          }, [
                            createVNode("p", { class: "text-xs text-muted uppercase" }, toDisplayString(item.label), 1),
                            createVNode("div", null, [
                              createVNode("p", { class: "text-xl font-semibold" }, toDisplayString(formatCurrency(item.metric.month)), 1),
                              createVNode("p", { class: "text-xs text-muted" }, toDisplayString(unref(monthLabel)), 1)
                            ]),
                            createVNode("div", { class: "text-sm" }, [
                              createVNode("span", {
                                class: [
                                  "inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs",
                                  item.delta.sign === "positive" && "bg-positive/10 text-positive",
                                  item.delta.sign === "negative" && "bg-negative/10 text-negative",
                                  item.delta.sign === "neutral" && "bg-muted/30 text-muted"
                                ]
                              }, toDisplayString(item.delta.label), 3)
                            ]),
                            createVNode("div", null, [
                              createVNode("p", { class: "text-sm font-medium" }, toDisplayString(formatCurrency(item.metric.ytd)), 1),
                              createVNode("p", { class: "text-xs text-muted" }, toDisplayString(unref(ytdLabel)), 1)
                            ])
                          ]);
                        }), 128))
                      ])
                    ]),
                    _: 1
                  }),
                  createVNode(_component_UCard, { ui: { body: "!p-6" } }, {
                    default: withCtx(() => [
                      createVNode("p", { class: "text-xs text-muted uppercase mb-2" }, "Margins"),
                      createVNode("div", { class: "space-y-4" }, [
                        (openBlock(true), createBlock(Fragment, null, renderList(unref(ratioMetrics), (metric) => {
                          return openBlock(), createBlock("div", {
                            key: metric.label
                          }, [
                            createVNode("div", { class: "flex items-center justify-between text-xs text-muted mb-1" }, [
                              createVNode("span", null, toDisplayString(metric.label), 1),
                              createVNode("span", null, toDisplayString(unref(ytdLabel)), 1)
                            ]),
                            createVNode("div", { class: "flex items-baseline justify-between" }, [
                              createVNode("p", { class: "text-lg font-semibold" }, toDisplayString(formatPercent(metric.month)), 1),
                              createVNode("p", { class: "text-sm font-medium" }, toDisplayString(formatPercent(metric.ytd)), 1)
                            ]),
                            createVNode("p", { class: "text-xs text-muted" }, toDisplayString(unref(monthLabel)), 1)
                          ]);
                        }), 128))
                      ])
                    ]),
                    _: 1
                  })
                ]),
                unref(trailingSummary).periods >= 2 ? (openBlock(), createBlock(_component_UCard, {
                  key: 0,
                  ui: { body: "!p-6 space-y-6" }
                }, {
                  default: withCtx(() => [
                    createVNode("header", { class: "flex items-center justify-between" }, [
                      createVNode("div", null, [
                        createVNode("p", { class: "text-xs uppercase text-muted" }, "Trailing performance clarity"),
                        createVNode("h3", { class: "text-lg font-semibold" }, "Last " + toDisplayString(unref(trailingSummary).periods) + " months", 1)
                      ]),
                      createVNode(_component_UBadge, {
                        color: unref(trailingSummary).netProfit >= 0 ? "positive" : "negative",
                        variant: "subtle"
                      }, {
                        default: withCtx(() => [
                          createTextVNode(toDisplayString(signedCurrency(unref(trailingSummary).netProfit)) + " net ", 1)
                        ]),
                        _: 1
                      }, 8, ["color"])
                    ]),
                    createVNode("div", { class: "grid grid-cols-1 md:grid-cols-2 gap-6 text-sm" }, [
                      createVNode("div", { class: "space-y-2" }, [
                        createVNode("p", { class: "text-xs uppercase text-muted" }, "Trailing window (" + toDisplayString(unref(trailingSummary).periods) + " months)", 1),
                        createVNode("ul", { class: "space-y-1" }, [
                          createVNode("li", { class: "flex justify-between" }, [
                            createVNode("span", null, "Revenue"),
                            createVNode("span", null, toDisplayString(formatCurrency(unref(trailingSummary).revenue)), 1)
                          ]),
                          createVNode("li", { class: "flex justify-between" }, [
                            createVNode("span", null, "Direct costs"),
                            createVNode("span", null, toDisplayString(formatCurrency(unref(trailingSummary).directCosts)), 1)
                          ]),
                          createVNode("li", { class: "flex justify-between" }, [
                            createVNode("span", null, "Gross profit"),
                            createVNode("span", null, toDisplayString(formatCurrency(unref(trailingSummary).revenue - unref(trailingSummary).directCosts)), 1)
                          ]),
                          createVNode("li", { class: "flex justify-between" }, [
                            createVNode("span", null, "Operating expenses"),
                            createVNode("span", null, toDisplayString(formatCurrency(unref(trailingSummary).operatingExpenses)), 1)
                          ]),
                          createVNode("li", { class: "flex justify-between font-medium" }, [
                            createVNode("span", null, "Net profit"),
                            createVNode("span", null, toDisplayString(signedCurrency(unref(trailingSummary).netProfit)), 1)
                          ])
                        ]),
                        unref(trailingSummary).periods > unref(lastTwoTotals).periods ? (openBlock(), createBlock("p", {
                          key: 0,
                          class: "text-xs text-muted"
                        }, " Extra " + toDisplayString(unref(trailingSummary).periods - unref(lastTwoTotals).periods) + " month(s) add " + toDisplayString(signedCurrency(unref(trailingSummary).netProfit - unref(lastTwoTotals).netProfit)) + " to the cumulative result, explaining the reported $173k loss versus the $60k two-month view. ", 1)) : createCommentVNode("", true)
                      ]),
                      unref(lastTwoTotals).periods === 2 ? (openBlock(), createBlock("div", {
                        key: 0,
                        class: "space-y-2"
                      }, [
                        createVNode("p", { class: "text-xs uppercase text-muted" }, "Last two closed months"),
                        createVNode("ul", { class: "space-y-1" }, [
                          createVNode("li", { class: "flex justify-between" }, [
                            createVNode("span", null, "Revenue"),
                            createVNode("span", null, toDisplayString(formatCurrency(unref(lastTwoTotals).revenue)), 1)
                          ]),
                          createVNode("li", { class: "flex justify-between" }, [
                            createVNode("span", null, "Direct costs"),
                            createVNode("span", null, toDisplayString(formatCurrency(unref(lastTwoTotals).directCosts)), 1)
                          ]),
                          createVNode("li", { class: "flex justify-between" }, [
                            createVNode("span", null, "Gross profit"),
                            createVNode("span", null, toDisplayString(formatCurrency(unref(lastTwoTotals).revenue - unref(lastTwoTotals).directCosts)), 1)
                          ]),
                          createVNode("li", { class: "flex justify-between" }, [
                            createVNode("span", null, "Operating expenses"),
                            createVNode("span", null, toDisplayString(formatCurrency(unref(lastTwoTotals).operatingExpenses)), 1)
                          ]),
                          createVNode("li", { class: "flex justify-between font-medium" }, [
                            createVNode("span", null, "Net profit"),
                            createVNode("span", null, toDisplayString(signedCurrency(unref(lastTwoTotals).netProfit)), 1)
                          ])
                        ]),
                        createVNode("p", { class: "text-xs text-muted" }, " Figures above align with management's July & August view. Direct costs include PPC/media charges, which explains the lower trading income compared to invoice totals. ")
                      ])) : createCommentVNode("", true)
                    ])
                  ]),
                  _: 1
                })) : createCommentVNode("", true),
                createVNode("div", { class: "grid grid-cols-1 xl:grid-cols-3 gap-4" }, [
                  unref(trendData).length > 1 ? (openBlock(), createBlock(ProfitTrendChart, {
                    key: 0,
                    periods: unref(trendData),
                    class: "xl:col-span-2"
                  }, null, 8, ["periods"])) : (openBlock(), createBlock(_component_UCard, {
                    key: 1,
                    variant: "subtle",
                    class: "xl:col-span-2"
                  }, {
                    default: withCtx(() => [
                      createVNode("div", { class: "p-6 text-sm text-muted" }, " Additional historical periods are required to render the trend chart. ")
                    ]),
                    _: 1
                  })),
                  createVNode("div", { class: "space-y-4" }, [
                    createVNode(_component_UCard, { ui: { body: "!p-6" } }, {
                      default: withCtx(() => [
                        createVNode("div", { class: "flex items-center justify-between mb-4" }, [
                          createVNode("div", null, [
                            createVNode("p", { class: "text-xs uppercase text-muted mb-1" }, "Current Basis"),
                            createVNode("p", { class: "font-semibold" }, toDisplayString(unref(basisLabel)) + " accounting", 1)
                          ]),
                          createVNode(_component_UBadge, {
                            color: "primary",
                            variant: "subtle"
                          }, {
                            default: withCtx(() => [
                              createTextVNode(toDisplayString(unref(ytdLabel)), 1)
                            ]),
                            _: 1
                          })
                        ]),
                        createVNode("ul", { class: "space-y-3 text-sm text-muted" }, [
                          createVNode("li", null, " Month range: " + toDisplayString(unref(report)?.meta.monthStart) + " → " + toDisplayString(unref(report)?.meta.monthEnd), 1),
                          createVNode("li", null, " Periods analysed: " + toDisplayString(unref(report)?.meta.periodLabels.length), 1),
                          createVNode("li", null, " Net margin: " + toDisplayString(formatPercent(unref(report)?.summary.netMargin.month || 0)) + " (month) ", 1),
                          createVNode("li", null, " Net margin YTD: " + toDisplayString(formatPercent(unref(report)?.summary.netMargin.ytd || 0)), 1)
                        ])
                      ]),
                      _: 1
                    }),
                    createVNode(_component_UCard, {
                      title: "Recent Period Performance",
                      variant: "subtle"
                    }, {
                      default: withCtx(() => [
                        unref(periodRows).length ? (openBlock(), createBlock(Fragment, { key: 0 }, [
                          createVNode(_component_UTable, {
                            columns: unref(periodColumns),
                            rows: unref(periodRows)
                          }, null, 8, ["columns", "rows"]),
                          createVNode("p", { class: "text-xs text-muted mt-3" }, " Use this to reconcile management reporting. Net profit is shown with signs to highlight months driving cumulative losses. ")
                        ], 64)) : (openBlock(), createBlock("p", {
                          key: 1,
                          class: "text-sm text-muted"
                        }, "Historical period detail was not provided in the P&L response."))
                      ]),
                      _: 1
                    })
                  ])
                ]),
                createVNode("div", { class: "grid grid-cols-1 xl:grid-cols-3 gap-4" }, [
                  createVNode(_component_UCard, {
                    title: "Direct Costs Breakdown",
                    variant: "subtle"
                  }, {
                    default: withCtx(() => [
                      unref(directCostBreakdown).length ? (openBlock(), createBlock(Fragment, { key: 0 }, [
                        createVNode(_component_UTable, {
                          columns: unref(directCostColumns),
                          rows: unref(directCostBreakdown).map((item) => ({
                            name: item.name,
                            month: formatCurrency(item.month),
                            share: formatPercent(item.monthShare),
                            ytd: formatCurrency(item.ytd)
                          }))
                        }, null, 8, ["columns", "rows"]),
                        createVNode("p", { class: "text-xs text-muted mt-3" }, " Direct costs capture PPC and other pass-through media spend booked against trading income. Large swings here explain why invoiced income differs from the accounting revenue figure. ")
                      ], 64)) : (openBlock(), createBlock("p", {
                        key: 1,
                        class: "text-sm text-muted"
                      }, "No direct cost detail was returned for the selected month."))
                    ]),
                    _: 1
                  }),
                  createVNode(_component_UCard, {
                    title: "Revenue Breakdown",
                    variant: "subtle"
                  }, {
                    default: withCtx(() => [
                      unref(revenueBreakdown).length ? (openBlock(), createBlock(_component_UTable, {
                        key: 0,
                        columns: unref(revenueColumns),
                        rows: unref(revenueBreakdown).map((item) => ({
                          name: item.name,
                          month: formatCurrency(item.month),
                          share: formatPercent(item.monthShare),
                          ytd: formatCurrency(item.ytd)
                        }))
                      }, null, 8, ["columns", "rows"])) : (openBlock(), createBlock("p", {
                        key: 1,
                        class: "text-sm text-muted"
                      }, "No revenue categories returned for the selected month."))
                    ]),
                    _: 1
                  }),
                  createVNode(_component_UCard, {
                    title: "Operating Expenses Breakdown",
                    variant: "subtle"
                  }, {
                    default: withCtx(() => [
                      unref(expenseBreakdown).length ? (openBlock(), createBlock(_component_UTable, {
                        key: 0,
                        columns: unref(expenseColumns),
                        rows: unref(expenseBreakdown).map((item) => ({
                          name: item.name,
                          month: formatCurrency(item.month),
                          share: formatPercent(item.monthShare),
                          ytd: formatCurrency(item.ytd)
                        }))
                      }, null, 8, ["columns", "rows"])) : (openBlock(), createBlock("p", {
                        key: 1,
                        class: "text-sm text-muted"
                      }, "No operating expense categories returned for the selected month."))
                    ]),
                    _: 1
                  })
                ]),
                createVNode(_component_UCard, {
                  title: "Automated Insights",
                  variant: "subtle"
                }, {
                  default: withCtx(() => [
                    unref(insights).length ? (openBlock(), createBlock("ul", {
                      key: 0,
                      class: "space-y-3"
                    }, [
                      (openBlock(true), createBlock(Fragment, null, renderList(unref(insights), (insight, index) => {
                        return openBlock(), createBlock("li", {
                          key: index,
                          class: "flex gap-3 items-start"
                        }, [
                          createVNode(_component_UIcon, {
                            name: "i-lucide-sparkles",
                            class: "h-5 w-5 text-primary mt-0.5"
                          }),
                          createVNode("span", { class: "text-sm leading-relaxed" }, toDisplayString(insight), 1)
                        ]);
                      }), 128))
                    ])) : (openBlock(), createBlock("p", {
                      key: 1,
                      class: "text-sm text-muted"
                    }, "Insights will appear once we detect notable changes in your monthly results."))
                  ]),
                  _: 1
                })
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
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("pages/profit-loss/index.vue");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};

export { _sfc_main as default };
//# sourceMappingURL=index-BzRKwOku.mjs.map
