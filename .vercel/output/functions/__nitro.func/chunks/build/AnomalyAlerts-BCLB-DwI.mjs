import { _ as _sfc_main$1 } from './Card-jqGRZ5Ik.mjs';
import { a7 as _sfc_main$8, _ as _sfc_main$e, d as _sfc_main$9 } from './server.mjs';
import { _ as _sfc_main$2 } from './Skeleton-p2Vkb_Gp.mjs';
import { _ as _sfc_main$3 } from './Badge-BfrefdmG.mjs';
import { defineComponent, computed, mergeProps, withCtx, unref, createTextVNode, toDisplayString, createVNode, createBlock, openBlock, Fragment, renderList, createCommentVNode, useSSRContext } from 'vue';
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

const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "AnomalyAlerts",
  __ssrInlineRender: true,
  props: {
    data: {},
    loading: { type: Boolean }
  },
  setup(__props) {
    const props = __props;
    const formatCurrency = (value) => {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0
      }).format(value);
    };
    const getSeverityColor = (severity) => {
      switch (severity) {
        case "high":
          return "red";
        case "medium":
          return "amber";
        case "low":
          return "blue";
        default:
          return "neutral";
      }
    };
    const getSeverityIcon = (severity) => {
      switch (severity) {
        case "high":
          return "i-lucide-alert-triangle";
        case "medium":
          return "i-lucide-alert-circle";
        case "low":
          return "i-lucide-info";
        default:
          return "i-lucide-help-circle";
      }
    };
    const getTypeIcon = (type) => {
      switch (type) {
        case "daily_spending":
          return "i-lucide-calendar";
        case "category_spending":
          return "i-lucide-tag";
        case "vendor_spending":
          return "i-lucide-building-2";
        case "timing_anomaly":
          return "i-lucide-clock";
        default:
          return "i-lucide-search";
      }
    };
    const getTypeLabel = (type) => {
      switch (type) {
        case "daily_spending":
          return "Daily Spending";
        case "category_spending":
          return "Category Spending";
        case "vendor_spending":
          return "Vendor Spending";
        case "timing_anomaly":
          return "Timing Anomaly";
        default:
          return "Unknown";
      }
    };
    const topAnomalies = computed(() => {
      if (!props.data?.anomalies) return [];
      return props.data.anomalies.slice(0, 5);
    });
    const summaryStats = computed(() => {
      if (!props.data?.summary) return null;
      const { totalTransactions, anomaliesDetected, highSeverityAnomalies, anomalyRate } = props.data.summary;
      return {
        totalTransactions,
        anomaliesDetected,
        highSeverityAnomalies,
        anomalyRate,
        riskLevel: highSeverityAnomalies > 5 ? "high" : highSeverityAnomalies > 2 ? "medium" : "low"
      };
    });
    return (_ctx, _push, _parent, _attrs) => {
      const _component_UCard = _sfc_main$1;
      const _component_UButton = _sfc_main$9;
      const _component_USkeleton = _sfc_main$2;
      const _component_UProgress = _sfc_main$8;
      const _component_UIcon = _sfc_main$e;
      const _component_UBadge = _sfc_main$3;
      _push(ssrRenderComponent(_component_UCard, mergeProps({ class: "h-full" }, _attrs), {
        header: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            _push2(`<div class="flex items-center justify-between" data-v-7ffa87c2${_scopeId}><div data-v-7ffa87c2${_scopeId}><h3 class="text-lg font-semibold" data-v-7ffa87c2${_scopeId}>Anomaly Detection</h3><p class="text-sm text-muted" data-v-7ffa87c2${_scopeId}>AI-powered expense analysis</p></div>`);
            _push2(ssrRenderComponent(_component_UButton, {
              icon: "i-lucide-external-link",
              color: "neutral",
              variant: "ghost",
              size: "sm",
              to: "/anomalies"
            }, null, _parent2, _scopeId));
            _push2(`</div>`);
          } else {
            return [
              createVNode("div", { class: "flex items-center justify-between" }, [
                createVNode("div", null, [
                  createVNode("h3", { class: "text-lg font-semibold" }, "Anomaly Detection"),
                  createVNode("p", { class: "text-sm text-muted" }, "AI-powered expense analysis")
                ]),
                createVNode(_component_UButton, {
                  icon: "i-lucide-external-link",
                  color: "neutral",
                  variant: "ghost",
                  size: "sm",
                  to: "/anomalies"
                })
              ])
            ];
          }
        }),
        default: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            if (_ctx.loading) {
              _push2(`<div class="space-y-4" data-v-7ffa87c2${_scopeId}><div class="flex items-center justify-between" data-v-7ffa87c2${_scopeId}>`);
              _push2(ssrRenderComponent(_component_USkeleton, { class: "h-4 w-24" }, null, _parent2, _scopeId));
              _push2(ssrRenderComponent(_component_USkeleton, { class: "h-6 w-16" }, null, _parent2, _scopeId));
              _push2(`</div><div class="space-y-3" data-v-7ffa87c2${_scopeId}><!--[-->`);
              ssrRenderList(3, (i) => {
                _push2(ssrRenderComponent(_component_USkeleton, {
                  class: "h-16 w-full",
                  key: i
                }, null, _parent2, _scopeId));
              });
              _push2(`<!--]--></div></div>`);
            } else if (unref(summaryStats)) {
              _push2(`<div class="space-y-4" data-v-7ffa87c2${_scopeId}><div class="grid grid-cols-2 gap-4 pb-4 border-b border-border" data-v-7ffa87c2${_scopeId}><div data-v-7ffa87c2${_scopeId}><div class="text-2xl font-bold text-highlighted" data-v-7ffa87c2${_scopeId}>${ssrInterpolate(unref(summaryStats).anomaliesDetected)}</div><div class="text-xs text-muted" data-v-7ffa87c2${_scopeId}>Anomalies Detected</div></div><div data-v-7ffa87c2${_scopeId}><div class="${ssrRenderClass([{
                "text-red-500": unref(summaryStats).riskLevel === "high",
                "text-amber-500": unref(summaryStats).riskLevel === "medium",
                "text-emerald-500": unref(summaryStats).riskLevel === "low"
              }, "text-2xl font-bold"])}" data-v-7ffa87c2${_scopeId}>${ssrInterpolate(unref(summaryStats).highSeverityAnomalies)}</div><div class="text-xs text-muted" data-v-7ffa87c2${_scopeId}>High Severity</div></div></div><div class="flex items-center justify-between text-sm" data-v-7ffa87c2${_scopeId}><span class="text-muted" data-v-7ffa87c2${_scopeId}>Anomaly Rate</span><div class="flex items-center gap-2" data-v-7ffa87c2${_scopeId}><span class="font-medium" data-v-7ffa87c2${_scopeId}>${ssrInterpolate(unref(summaryStats).anomalyRate.toFixed(1))}%</span>`);
              _push2(ssrRenderComponent(_component_UProgress, {
                value: unref(summaryStats).anomalyRate,
                max: 10,
                color: unref(summaryStats).anomalyRate > 5 ? "red" : unref(summaryStats).anomalyRate > 2 ? "amber" : "emerald",
                class: "w-16"
              }, null, _parent2, _scopeId));
              _push2(`</div></div><div class="space-y-3" data-v-7ffa87c2${_scopeId}><h4 class="text-sm font-medium text-highlighted" data-v-7ffa87c2${_scopeId}>Recent Anomalies</h4>`);
              if (unref(topAnomalies).length === 0) {
                _push2(`<div class="text-center py-8" data-v-7ffa87c2${_scopeId}>`);
                _push2(ssrRenderComponent(_component_UIcon, {
                  name: "i-lucide-shield-check",
                  class: "h-12 w-12 text-emerald-500 mx-auto mb-2"
                }, null, _parent2, _scopeId));
                _push2(`<p class="text-sm text-muted" data-v-7ffa87c2${_scopeId}>No anomalies detected</p><p class="text-xs text-muted/70" data-v-7ffa87c2${_scopeId}>Your expenses are within normal patterns</p></div>`);
              } else {
                _push2(`<div class="space-y-2 max-h-64 overflow-y-auto" data-v-7ffa87c2${_scopeId}><!--[-->`);
                ssrRenderList(unref(topAnomalies), (anomaly) => {
                  _push2(`<div class="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors" data-v-7ffa87c2${_scopeId}><div class="${ssrRenderClass([{
                    "bg-red-100 dark:bg-red-900/20": anomaly.severity === "high",
                    "bg-amber-100 dark:bg-amber-900/20": anomaly.severity === "medium",
                    "bg-blue-100 dark:bg-blue-900/20": anomaly.severity === "low"
                  }, "flex-shrink-0 p-1.5 rounded-full"])}" data-v-7ffa87c2${_scopeId}>`);
                  _push2(ssrRenderComponent(_component_UIcon, {
                    name: getSeverityIcon(anomaly.severity),
                    class: [{
                      "text-red-600 dark:text-red-400": anomaly.severity === "high",
                      "text-amber-600 dark:text-amber-400": anomaly.severity === "medium",
                      "text-blue-600 dark:text-blue-400": anomaly.severity === "low"
                    }, "h-3 w-3"]
                  }, null, _parent2, _scopeId));
                  _push2(`</div><div class="flex-1 min-w-0" data-v-7ffa87c2${_scopeId}><div class="flex items-center gap-2 mb-1" data-v-7ffa87c2${_scopeId}>`);
                  _push2(ssrRenderComponent(_component_UIcon, {
                    name: getTypeIcon(anomaly.type),
                    class: "h-3 w-3 text-muted"
                  }, null, _parent2, _scopeId));
                  _push2(`<span class="text-xs font-medium text-highlighted" data-v-7ffa87c2${_scopeId}>${ssrInterpolate(getTypeLabel(anomaly.type))}</span>`);
                  _push2(ssrRenderComponent(_component_UBadge, {
                    color: getSeverityColor(anomaly.severity),
                    variant: "subtle",
                    size: "xs"
                  }, {
                    default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                      if (_push3) {
                        _push3(`${ssrInterpolate(anomaly.severity)}`);
                      } else {
                        return [
                          createTextVNode(toDisplayString(anomaly.severity), 1)
                        ];
                      }
                    }),
                    _: 2
                  }, _parent2, _scopeId));
                  _push2(`</div><p class="text-xs text-muted mb-1" data-v-7ffa87c2${_scopeId}>${ssrInterpolate(anomaly.message)}</p><div class="flex items-center justify-between" data-v-7ffa87c2${_scopeId}><span class="text-xs font-medium text-highlighted" data-v-7ffa87c2${_scopeId}>${ssrInterpolate(formatCurrency(anomaly.amount))}</span>`);
                  if (anomaly.transaction) {
                    _push2(`<div class="text-xs text-muted" data-v-7ffa87c2${_scopeId}>${ssrInterpolate(anomaly.transaction.date)}</div>`);
                  } else {
                    _push2(`<!---->`);
                  }
                  _push2(`</div></div></div>`);
                });
                _push2(`<!--]--></div>`);
              }
              _push2(`</div>`);
              if (_ctx.data?.insights && _ctx.data.insights.length > 0) {
                _push2(`<div class="pt-4 border-t border-border" data-v-7ffa87c2${_scopeId}><h4 class="text-sm font-medium text-highlighted mb-2" data-v-7ffa87c2${_scopeId}>AI Insights</h4><div class="space-y-1" data-v-7ffa87c2${_scopeId}><!--[-->`);
                ssrRenderList(_ctx.data.insights, (insight) => {
                  _push2(`<p class="text-xs text-muted flex items-start gap-2" data-v-7ffa87c2${_scopeId}>`);
                  _push2(ssrRenderComponent(_component_UIcon, {
                    name: "i-lucide-lightbulb",
                    class: "h-3 w-3 text-amber-500 mt-0.5 flex-shrink-0"
                  }, null, _parent2, _scopeId));
                  _push2(` ${ssrInterpolate(insight)}</p>`);
                });
                _push2(`<!--]--></div></div>`);
              } else {
                _push2(`<!---->`);
              }
              if (unref(topAnomalies).length > 0) {
                _push2(`<div class="pt-3 border-t border-border" data-v-7ffa87c2${_scopeId}>`);
                _push2(ssrRenderComponent(_component_UButton, {
                  to: "/anomalies",
                  color: "neutral",
                  variant: "subtle",
                  size: "sm",
                  block: ""
                }, {
                  trailing: withCtx((_2, _push3, _parent3, _scopeId2) => {
                    if (_push3) {
                      _push3(ssrRenderComponent(_component_UIcon, {
                        name: "i-lucide-arrow-right",
                        class: "h-4 w-4"
                      }, null, _parent3, _scopeId2));
                    } else {
                      return [
                        createVNode(_component_UIcon, {
                          name: "i-lucide-arrow-right",
                          class: "h-4 w-4"
                        })
                      ];
                    }
                  }),
                  default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                    if (_push3) {
                      _push3(` View All Anomalies `);
                    } else {
                      return [
                        createTextVNode(" View All Anomalies ")
                      ];
                    }
                  }),
                  _: 1
                }, _parent2, _scopeId));
                _push2(`</div>`);
              } else {
                _push2(`<!---->`);
              }
              _push2(`</div>`);
            } else {
              _push2(`<div class="flex items-center justify-center py-12" data-v-7ffa87c2${_scopeId}><div class="text-center" data-v-7ffa87c2${_scopeId}>`);
              _push2(ssrRenderComponent(_component_UIcon, {
                name: "i-lucide-search",
                class: "h-12 w-12 text-muted/50 mx-auto mb-4"
              }, null, _parent2, _scopeId));
              _push2(`<p class="text-muted" data-v-7ffa87c2${_scopeId}>No anomaly data available</p><p class="text-sm text-muted/70" data-v-7ffa87c2${_scopeId}>Connect to Xero to enable AI-powered anomaly detection</p></div></div>`);
            }
          } else {
            return [
              _ctx.loading ? (openBlock(), createBlock("div", {
                key: 0,
                class: "space-y-4"
              }, [
                createVNode("div", { class: "flex items-center justify-between" }, [
                  createVNode(_component_USkeleton, { class: "h-4 w-24" }),
                  createVNode(_component_USkeleton, { class: "h-6 w-16" })
                ]),
                createVNode("div", { class: "space-y-3" }, [
                  (openBlock(), createBlock(Fragment, null, renderList(3, (i) => {
                    return createVNode(_component_USkeleton, {
                      class: "h-16 w-full",
                      key: i
                    });
                  }), 64))
                ])
              ])) : unref(summaryStats) ? (openBlock(), createBlock("div", {
                key: 1,
                class: "space-y-4"
              }, [
                createVNode("div", { class: "grid grid-cols-2 gap-4 pb-4 border-b border-border" }, [
                  createVNode("div", null, [
                    createVNode("div", { class: "text-2xl font-bold text-highlighted" }, toDisplayString(unref(summaryStats).anomaliesDetected), 1),
                    createVNode("div", { class: "text-xs text-muted" }, "Anomalies Detected")
                  ]),
                  createVNode("div", null, [
                    createVNode("div", {
                      class: ["text-2xl font-bold", {
                        "text-red-500": unref(summaryStats).riskLevel === "high",
                        "text-amber-500": unref(summaryStats).riskLevel === "medium",
                        "text-emerald-500": unref(summaryStats).riskLevel === "low"
                      }]
                    }, toDisplayString(unref(summaryStats).highSeverityAnomalies), 3),
                    createVNode("div", { class: "text-xs text-muted" }, "High Severity")
                  ])
                ]),
                createVNode("div", { class: "flex items-center justify-between text-sm" }, [
                  createVNode("span", { class: "text-muted" }, "Anomaly Rate"),
                  createVNode("div", { class: "flex items-center gap-2" }, [
                    createVNode("span", { class: "font-medium" }, toDisplayString(unref(summaryStats).anomalyRate.toFixed(1)) + "%", 1),
                    createVNode(_component_UProgress, {
                      value: unref(summaryStats).anomalyRate,
                      max: 10,
                      color: unref(summaryStats).anomalyRate > 5 ? "red" : unref(summaryStats).anomalyRate > 2 ? "amber" : "emerald",
                      class: "w-16"
                    }, null, 8, ["value", "color"])
                  ])
                ]),
                createVNode("div", { class: "space-y-3" }, [
                  createVNode("h4", { class: "text-sm font-medium text-highlighted" }, "Recent Anomalies"),
                  unref(topAnomalies).length === 0 ? (openBlock(), createBlock("div", {
                    key: 0,
                    class: "text-center py-8"
                  }, [
                    createVNode(_component_UIcon, {
                      name: "i-lucide-shield-check",
                      class: "h-12 w-12 text-emerald-500 mx-auto mb-2"
                    }),
                    createVNode("p", { class: "text-sm text-muted" }, "No anomalies detected"),
                    createVNode("p", { class: "text-xs text-muted/70" }, "Your expenses are within normal patterns")
                  ])) : (openBlock(), createBlock("div", {
                    key: 1,
                    class: "space-y-2 max-h-64 overflow-y-auto"
                  }, [
                    (openBlock(true), createBlock(Fragment, null, renderList(unref(topAnomalies), (anomaly) => {
                      return openBlock(), createBlock("div", {
                        key: `${anomaly.type}-${anomaly.amount}`,
                        class: "flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors"
                      }, [
                        createVNode("div", {
                          class: ["flex-shrink-0 p-1.5 rounded-full", {
                            "bg-red-100 dark:bg-red-900/20": anomaly.severity === "high",
                            "bg-amber-100 dark:bg-amber-900/20": anomaly.severity === "medium",
                            "bg-blue-100 dark:bg-blue-900/20": anomaly.severity === "low"
                          }]
                        }, [
                          createVNode(_component_UIcon, {
                            name: getSeverityIcon(anomaly.severity),
                            class: [{
                              "text-red-600 dark:text-red-400": anomaly.severity === "high",
                              "text-amber-600 dark:text-amber-400": anomaly.severity === "medium",
                              "text-blue-600 dark:text-blue-400": anomaly.severity === "low"
                            }, "h-3 w-3"]
                          }, null, 8, ["name", "class"])
                        ], 2),
                        createVNode("div", { class: "flex-1 min-w-0" }, [
                          createVNode("div", { class: "flex items-center gap-2 mb-1" }, [
                            createVNode(_component_UIcon, {
                              name: getTypeIcon(anomaly.type),
                              class: "h-3 w-3 text-muted"
                            }, null, 8, ["name"]),
                            createVNode("span", { class: "text-xs font-medium text-highlighted" }, toDisplayString(getTypeLabel(anomaly.type)), 1),
                            createVNode(_component_UBadge, {
                              color: getSeverityColor(anomaly.severity),
                              variant: "subtle",
                              size: "xs"
                            }, {
                              default: withCtx(() => [
                                createTextVNode(toDisplayString(anomaly.severity), 1)
                              ]),
                              _: 2
                            }, 1032, ["color"])
                          ]),
                          createVNode("p", { class: "text-xs text-muted mb-1" }, toDisplayString(anomaly.message), 1),
                          createVNode("div", { class: "flex items-center justify-between" }, [
                            createVNode("span", { class: "text-xs font-medium text-highlighted" }, toDisplayString(formatCurrency(anomaly.amount)), 1),
                            anomaly.transaction ? (openBlock(), createBlock("div", {
                              key: 0,
                              class: "text-xs text-muted"
                            }, toDisplayString(anomaly.transaction.date), 1)) : createCommentVNode("", true)
                          ])
                        ])
                      ]);
                    }), 128))
                  ]))
                ]),
                _ctx.data?.insights && _ctx.data.insights.length > 0 ? (openBlock(), createBlock("div", {
                  key: 0,
                  class: "pt-4 border-t border-border"
                }, [
                  createVNode("h4", { class: "text-sm font-medium text-highlighted mb-2" }, "AI Insights"),
                  createVNode("div", { class: "space-y-1" }, [
                    (openBlock(true), createBlock(Fragment, null, renderList(_ctx.data.insights, (insight) => {
                      return openBlock(), createBlock("p", {
                        key: insight,
                        class: "text-xs text-muted flex items-start gap-2"
                      }, [
                        createVNode(_component_UIcon, {
                          name: "i-lucide-lightbulb",
                          class: "h-3 w-3 text-amber-500 mt-0.5 flex-shrink-0"
                        }),
                        createTextVNode(" " + toDisplayString(insight), 1)
                      ]);
                    }), 128))
                  ])
                ])) : createCommentVNode("", true),
                unref(topAnomalies).length > 0 ? (openBlock(), createBlock("div", {
                  key: 1,
                  class: "pt-3 border-t border-border"
                }, [
                  createVNode(_component_UButton, {
                    to: "/anomalies",
                    color: "neutral",
                    variant: "subtle",
                    size: "sm",
                    block: ""
                  }, {
                    trailing: withCtx(() => [
                      createVNode(_component_UIcon, {
                        name: "i-lucide-arrow-right",
                        class: "h-4 w-4"
                      })
                    ]),
                    default: withCtx(() => [
                      createTextVNode(" View All Anomalies ")
                    ]),
                    _: 1
                  })
                ])) : createCommentVNode("", true)
              ])) : (openBlock(), createBlock("div", {
                key: 2,
                class: "flex items-center justify-center py-12"
              }, [
                createVNode("div", { class: "text-center" }, [
                  createVNode(_component_UIcon, {
                    name: "i-lucide-search",
                    class: "h-12 w-12 text-muted/50 mx-auto mb-4"
                  }),
                  createVNode("p", { class: "text-muted" }, "No anomaly data available"),
                  createVNode("p", { class: "text-sm text-muted/70" }, "Connect to Xero to enable AI-powered anomaly detection")
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
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("components/dashboard/AnomalyAlerts.vue");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const AnomalyAlerts = /* @__PURE__ */ Object.assign(_export_sfc(_sfc_main, [["__scopeId", "data-v-7ffa87c2"]]), { __name: "DashboardAnomalyAlerts" });

export { AnomalyAlerts as default };
//# sourceMappingURL=AnomalyAlerts-BCLB-DwI.mjs.map
