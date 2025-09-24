import { _ as _sfc_main$1 } from './Card-jqGRZ5Ik.mjs';
import { _ as _sfc_main$e, d as _sfc_main$9 } from './server.mjs';
import { _ as _sfc_main$2 } from './Skeleton-p2Vkb_Gp.mjs';
import { _ as _sfc_main$3 } from './Alert-CLlAchtu.mjs';
import { defineComponent, computed, withCtx, unref, createTextVNode, toDisplayString, createBlock, openBlock, createVNode, Fragment, renderList, createCommentVNode, useSSRContext } from 'vue';
import { ssrRenderComponent, ssrRenderList, ssrInterpolate, ssrRenderStyle, ssrRenderClass } from 'vue/server-renderer';
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
  __name: "InvoicePipeline",
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
    const getRiskColor = (riskLevel) => {
      switch (riskLevel) {
        case "high":
          return "text-red-500";
        case "medium":
          return "text-amber-500";
        case "low":
          return "text-emerald-500";
        default:
          return "text-neutral-500";
      }
    };
    const getRiskIcon = (riskLevel) => {
      switch (riskLevel) {
        case "high":
          return "i-lucide-alert-triangle";
        case "medium":
          return "i-lucide-alert-circle";
        case "low":
          return "i-lucide-shield-check";
        default:
          return "i-lucide-help-circle";
      }
    };
    const stageOrder = ["draft", "submitted", "authorised", "overdue", "paid"];
    const pipelineStages = computed(() => {
      if (!props.data?.stages) return [];
      return stageOrder.map((key) => ({
        key,
        ...props.data.stages[key]
      }));
    });
    const stageWidths = computed(() => {
      const total = props.data?.summary.totalValue || 1;
      return pipelineStages.value.map((stage) => ({
        ...stage,
        widthPercent: Math.max(stage.value / total * 100, 2)
        // Minimum 2% for visibility
      }));
    });
    return (_ctx, _push, _parent, _attrs) => {
      const _component_UCard = _sfc_main$1;
      const _component_UIcon = _sfc_main$e;
      const _component_UButton = _sfc_main$9;
      const _component_USkeleton = _sfc_main$2;
      const _component_UAlert = _sfc_main$3;
      _push(ssrRenderComponent(_component_UCard, _attrs, {
        header: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            _push2(`<div class="flex items-center justify-between" data-v-5e8359cd${_scopeId}><div data-v-5e8359cd${_scopeId}><h3 class="text-lg font-semibold" data-v-5e8359cd${_scopeId}>Invoice Pipeline</h3><p class="text-sm text-muted" data-v-5e8359cd${_scopeId}>Revenue collection status</p></div><div class="flex items-center gap-3" data-v-5e8359cd${_scopeId}>`);
            if (!_ctx.loading && _ctx.data) {
              _push2(`<div class="text-right" data-v-5e8359cd${_scopeId}><div class="flex items-center gap-2" data-v-5e8359cd${_scopeId}>`);
              _push2(ssrRenderComponent(_component_UIcon, {
                name: getRiskIcon(_ctx.data.summary.riskLevel),
                class: [getRiskColor(_ctx.data.summary.riskLevel), "h-4 w-4"]
              }, null, _parent2, _scopeId));
              _push2(`<span class="${ssrRenderClass([getRiskColor(_ctx.data.summary.riskLevel), "text-sm font-medium"])}" data-v-5e8359cd${_scopeId}>${ssrInterpolate(_ctx.data.summary.riskLevel.toUpperCase())} RISK </span></div><div class="text-xs text-muted" data-v-5e8359cd${_scopeId}>${ssrInterpolate(_ctx.data.summary.averageCollectionTime)}d avg collection </div></div>`);
            } else {
              _push2(`<!---->`);
            }
            _push2(ssrRenderComponent(_component_UButton, {
              icon: "i-lucide-external-link",
              color: "neutral",
              variant: "ghost",
              size: "sm",
              to: "/invoices"
            }, null, _parent2, _scopeId));
            _push2(`</div></div>`);
          } else {
            return [
              createVNode("div", { class: "flex items-center justify-between" }, [
                createVNode("div", null, [
                  createVNode("h3", { class: "text-lg font-semibold" }, "Invoice Pipeline"),
                  createVNode("p", { class: "text-sm text-muted" }, "Revenue collection status")
                ]),
                createVNode("div", { class: "flex items-center gap-3" }, [
                  !_ctx.loading && _ctx.data ? (openBlock(), createBlock("div", {
                    key: 0,
                    class: "text-right"
                  }, [
                    createVNode("div", { class: "flex items-center gap-2" }, [
                      createVNode(_component_UIcon, {
                        name: getRiskIcon(_ctx.data.summary.riskLevel),
                        class: [getRiskColor(_ctx.data.summary.riskLevel), "h-4 w-4"]
                      }, null, 8, ["name", "class"]),
                      createVNode("span", {
                        class: ["text-sm font-medium", getRiskColor(_ctx.data.summary.riskLevel)]
                      }, toDisplayString(_ctx.data.summary.riskLevel.toUpperCase()) + " RISK ", 3)
                    ]),
                    createVNode("div", { class: "text-xs text-muted" }, toDisplayString(_ctx.data.summary.averageCollectionTime) + "d avg collection ", 1)
                  ])) : createCommentVNode("", true),
                  createVNode(_component_UButton, {
                    icon: "i-lucide-external-link",
                    color: "neutral",
                    variant: "ghost",
                    size: "sm",
                    to: "/invoices"
                  })
                ])
              ])
            ];
          }
        }),
        default: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            if (_ctx.loading) {
              _push2(`<div class="space-y-4" data-v-5e8359cd${_scopeId}><div class="grid grid-cols-3 gap-4" data-v-5e8359cd${_scopeId}><!--[-->`);
              ssrRenderList(3, (i) => {
                _push2(ssrRenderComponent(_component_USkeleton, {
                  class: "h-16",
                  key: i
                }, null, _parent2, _scopeId));
              });
              _push2(`<!--]--></div>`);
              _push2(ssrRenderComponent(_component_USkeleton, { class: "h-8 w-full" }, null, _parent2, _scopeId));
              _push2(ssrRenderComponent(_component_USkeleton, { class: "h-24 w-full" }, null, _parent2, _scopeId));
              _push2(`</div>`);
            } else if (_ctx.data) {
              _push2(`<div class="space-y-6" data-v-5e8359cd${_scopeId}><div class="grid grid-cols-1 sm:grid-cols-3 gap-4" data-v-5e8359cd${_scopeId}><div class="text-center p-4 bg-muted/30 rounded-lg" data-v-5e8359cd${_scopeId}><div class="text-2xl font-bold text-highlighted" data-v-5e8359cd${_scopeId}>${ssrInterpolate(formatCurrency(_ctx.data.summary.totalValue))}</div><div class="text-xs text-muted" data-v-5e8359cd${_scopeId}>Total Pipeline</div></div><div class="text-center p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg" data-v-5e8359cd${_scopeId}><div class="text-2xl font-bold text-emerald-600 dark:text-emerald-400" data-v-5e8359cd${_scopeId}>${ssrInterpolate(_ctx.data.summary.paidRate.toFixed(1))}% </div><div class="text-xs text-muted" data-v-5e8359cd${_scopeId}>Collection Rate</div></div><div class="text-center p-4 bg-red-50 dark:bg-red-900/20 rounded-lg" data-v-5e8359cd${_scopeId}><div class="text-2xl font-bold text-red-600 dark:text-red-400" data-v-5e8359cd${_scopeId}>${ssrInterpolate(_ctx.data.summary.overdueRate.toFixed(1))}% </div><div class="text-xs text-muted" data-v-5e8359cd${_scopeId}>Overdue Rate</div></div></div><div class="space-y-3" data-v-5e8359cd${_scopeId}><h4 class="text-sm font-medium text-highlighted" data-v-5e8359cd${_scopeId}>Pipeline Flow</h4><div class="relative h-12 bg-border/30 rounded-lg overflow-hidden" data-v-5e8359cd${_scopeId}><div class="flex h-full" data-v-5e8359cd${_scopeId}><!--[-->`);
              ssrRenderList(unref(stageWidths), (stage) => {
                _push2(`<div class="flex items-center justify-center text-white text-xs font-medium transition-all duration-300 hover:opacity-80" style="${ssrRenderStyle({
                  width: `${stage.widthPercent}%`,
                  backgroundColor: stage.color
                })}" data-v-5e8359cd${_scopeId}>`);
                if (stage.widthPercent > 10) {
                  _push2(`<span class="truncate px-2" data-v-5e8359cd${_scopeId}>${ssrInterpolate(stage.name)}</span>`);
                } else {
                  _push2(`<!---->`);
                }
                _push2(`</div>`);
              });
              _push2(`<!--]--></div></div><div class="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm" data-v-5e8359cd${_scopeId}><!--[-->`);
              ssrRenderList(unref(pipelineStages), (stage) => {
                _push2(`<div class="p-3 border border-border rounded-lg hover:bg-muted/30 transition-colors" data-v-5e8359cd${_scopeId}><div class="flex items-center gap-2 mb-2" data-v-5e8359cd${_scopeId}><div class="w-3 h-3 rounded-full" style="${ssrRenderStyle({ backgroundColor: stage.color })}" data-v-5e8359cd${_scopeId}></div><span class="font-medium text-highlighted" data-v-5e8359cd${_scopeId}>${ssrInterpolate(stage.name)}</span></div><div class="space-y-1" data-v-5e8359cd${_scopeId}><div class="flex justify-between" data-v-5e8359cd${_scopeId}><span class="text-muted" data-v-5e8359cd${_scopeId}>Count:</span><span class="font-medium" data-v-5e8359cd${_scopeId}>${ssrInterpolate(stage.count)}</span></div><div class="flex justify-between" data-v-5e8359cd${_scopeId}><span class="text-muted" data-v-5e8359cd${_scopeId}>Value:</span><span class="font-medium" data-v-5e8359cd${_scopeId}>${ssrInterpolate(formatCurrency(stage.value))}</span></div><div class="flex justify-between" data-v-5e8359cd${_scopeId}><span class="text-muted" data-v-5e8359cd${_scopeId}>Avg Days:</span><span class="font-medium" data-v-5e8359cd${_scopeId}>${ssrInterpolate(stage.averageDaysInStage)}</span></div></div></div>`);
              });
              _push2(`<!--]--></div></div>`);
              if (_ctx.data.bottlenecks.length > 0) {
                _push2(`<div class="space-y-3" data-v-5e8359cd${_scopeId}><h4 class="text-sm font-medium text-highlighted" data-v-5e8359cd${_scopeId}>Pipeline Bottlenecks</h4><div class="space-y-2" data-v-5e8359cd${_scopeId}><!--[-->`);
                ssrRenderList(_ctx.data.bottlenecks, (bottleneck) => {
                  _push2(ssrRenderComponent(_component_UAlert, {
                    key: bottleneck.stage,
                    icon: "i-lucide-alert-triangle",
                    color: "amber",
                    variant: "subtle",
                    title: bottleneck.stage.charAt(0).toUpperCase() + bottleneck.stage.slice(1),
                    description: bottleneck.issue,
                    class: "text-sm"
                  }, null, _parent2, _scopeId));
                });
                _push2(`<!--]--></div></div>`);
              } else {
                _push2(`<!---->`);
              }
              if (_ctx.data.recommendations.length > 0) {
                _push2(`<div class="space-y-3" data-v-5e8359cd${_scopeId}><h4 class="text-sm font-medium text-highlighted" data-v-5e8359cd${_scopeId}>Recommendations</h4><div class="space-y-2" data-v-5e8359cd${_scopeId}><!--[-->`);
                ssrRenderList(_ctx.data.recommendations, (recommendation) => {
                  _push2(`<div class="flex items-start gap-2 text-sm text-muted" data-v-5e8359cd${_scopeId}>`);
                  _push2(ssrRenderComponent(_component_UIcon, {
                    name: "i-lucide-lightbulb",
                    class: "h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0"
                  }, null, _parent2, _scopeId));
                  _push2(` ${ssrInterpolate(recommendation)}</div>`);
                });
                _push2(`<!--]--></div></div>`);
              } else {
                _push2(`<!---->`);
              }
              _push2(`<div class="flex gap-2 pt-4 border-t border-border" data-v-5e8359cd${_scopeId}>`);
              _push2(ssrRenderComponent(_component_UButton, {
                size: "sm",
                color: "neutral",
                variant: "subtle",
                to: "/invoices?status=draft"
              }, {
                default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                  if (_push3) {
                    _push3(` Review Drafts (${ssrInterpolate(_ctx.data.stages.draft.count)}) `);
                  } else {
                    return [
                      createTextVNode(" Review Drafts (" + toDisplayString(_ctx.data.stages.draft.count) + ") ", 1)
                    ];
                  }
                }),
                _: 1
              }, _parent2, _scopeId));
              _push2(ssrRenderComponent(_component_UButton, {
                size: "sm",
                color: "neutral",
                variant: "subtle",
                to: "/invoices?status=overdue"
              }, {
                default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                  if (_push3) {
                    _push3(` Collect Overdue (${ssrInterpolate(_ctx.data.stages.overdue.count)}) `);
                  } else {
                    return [
                      createTextVNode(" Collect Overdue (" + toDisplayString(_ctx.data.stages.overdue.count) + ") ", 1)
                    ];
                  }
                }),
                _: 1
              }, _parent2, _scopeId));
              _push2(`</div></div>`);
            } else {
              _push2(`<div class="flex items-center justify-center py-12" data-v-5e8359cd${_scopeId}><div class="text-center" data-v-5e8359cd${_scopeId}>`);
              _push2(ssrRenderComponent(_component_UIcon, {
                name: "i-lucide-file-text",
                class: "h-12 w-12 text-muted/50 mx-auto mb-4"
              }, null, _parent2, _scopeId));
              _push2(`<p class="text-muted" data-v-5e8359cd${_scopeId}>No invoice data available</p><p class="text-sm text-muted/70" data-v-5e8359cd${_scopeId}>Connect to Xero to see your invoice pipeline</p></div></div>`);
            }
          } else {
            return [
              _ctx.loading ? (openBlock(), createBlock("div", {
                key: 0,
                class: "space-y-4"
              }, [
                createVNode("div", { class: "grid grid-cols-3 gap-4" }, [
                  (openBlock(), createBlock(Fragment, null, renderList(3, (i) => {
                    return createVNode(_component_USkeleton, {
                      class: "h-16",
                      key: i
                    });
                  }), 64))
                ]),
                createVNode(_component_USkeleton, { class: "h-8 w-full" }),
                createVNode(_component_USkeleton, { class: "h-24 w-full" })
              ])) : _ctx.data ? (openBlock(), createBlock("div", {
                key: 1,
                class: "space-y-6"
              }, [
                createVNode("div", { class: "grid grid-cols-1 sm:grid-cols-3 gap-4" }, [
                  createVNode("div", { class: "text-center p-4 bg-muted/30 rounded-lg" }, [
                    createVNode("div", { class: "text-2xl font-bold text-highlighted" }, toDisplayString(formatCurrency(_ctx.data.summary.totalValue)), 1),
                    createVNode("div", { class: "text-xs text-muted" }, "Total Pipeline")
                  ]),
                  createVNode("div", { class: "text-center p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg" }, [
                    createVNode("div", { class: "text-2xl font-bold text-emerald-600 dark:text-emerald-400" }, toDisplayString(_ctx.data.summary.paidRate.toFixed(1)) + "% ", 1),
                    createVNode("div", { class: "text-xs text-muted" }, "Collection Rate")
                  ]),
                  createVNode("div", { class: "text-center p-4 bg-red-50 dark:bg-red-900/20 rounded-lg" }, [
                    createVNode("div", { class: "text-2xl font-bold text-red-600 dark:text-red-400" }, toDisplayString(_ctx.data.summary.overdueRate.toFixed(1)) + "% ", 1),
                    createVNode("div", { class: "text-xs text-muted" }, "Overdue Rate")
                  ])
                ]),
                createVNode("div", { class: "space-y-3" }, [
                  createVNode("h4", { class: "text-sm font-medium text-highlighted" }, "Pipeline Flow"),
                  createVNode("div", { class: "relative h-12 bg-border/30 rounded-lg overflow-hidden" }, [
                    createVNode("div", { class: "flex h-full" }, [
                      (openBlock(true), createBlock(Fragment, null, renderList(unref(stageWidths), (stage) => {
                        return openBlock(), createBlock("div", {
                          key: stage.key,
                          class: "flex items-center justify-center text-white text-xs font-medium transition-all duration-300 hover:opacity-80",
                          style: {
                            width: `${stage.widthPercent}%`,
                            backgroundColor: stage.color
                          }
                        }, [
                          stage.widthPercent > 10 ? (openBlock(), createBlock("span", {
                            key: 0,
                            class: "truncate px-2"
                          }, toDisplayString(stage.name), 1)) : createCommentVNode("", true)
                        ], 4);
                      }), 128))
                    ])
                  ]),
                  createVNode("div", { class: "grid grid-cols-2 md:grid-cols-5 gap-3 text-sm" }, [
                    (openBlock(true), createBlock(Fragment, null, renderList(unref(pipelineStages), (stage) => {
                      return openBlock(), createBlock("div", {
                        key: stage.key,
                        class: "p-3 border border-border rounded-lg hover:bg-muted/30 transition-colors"
                      }, [
                        createVNode("div", { class: "flex items-center gap-2 mb-2" }, [
                          createVNode("div", {
                            class: "w-3 h-3 rounded-full",
                            style: { backgroundColor: stage.color }
                          }, null, 4),
                          createVNode("span", { class: "font-medium text-highlighted" }, toDisplayString(stage.name), 1)
                        ]),
                        createVNode("div", { class: "space-y-1" }, [
                          createVNode("div", { class: "flex justify-between" }, [
                            createVNode("span", { class: "text-muted" }, "Count:"),
                            createVNode("span", { class: "font-medium" }, toDisplayString(stage.count), 1)
                          ]),
                          createVNode("div", { class: "flex justify-between" }, [
                            createVNode("span", { class: "text-muted" }, "Value:"),
                            createVNode("span", { class: "font-medium" }, toDisplayString(formatCurrency(stage.value)), 1)
                          ]),
                          createVNode("div", { class: "flex justify-between" }, [
                            createVNode("span", { class: "text-muted" }, "Avg Days:"),
                            createVNode("span", { class: "font-medium" }, toDisplayString(stage.averageDaysInStage), 1)
                          ])
                        ])
                      ]);
                    }), 128))
                  ])
                ]),
                _ctx.data.bottlenecks.length > 0 ? (openBlock(), createBlock("div", {
                  key: 0,
                  class: "space-y-3"
                }, [
                  createVNode("h4", { class: "text-sm font-medium text-highlighted" }, "Pipeline Bottlenecks"),
                  createVNode("div", { class: "space-y-2" }, [
                    (openBlock(true), createBlock(Fragment, null, renderList(_ctx.data.bottlenecks, (bottleneck) => {
                      return openBlock(), createBlock(_component_UAlert, {
                        key: bottleneck.stage,
                        icon: "i-lucide-alert-triangle",
                        color: "amber",
                        variant: "subtle",
                        title: bottleneck.stage.charAt(0).toUpperCase() + bottleneck.stage.slice(1),
                        description: bottleneck.issue,
                        class: "text-sm"
                      }, null, 8, ["title", "description"]);
                    }), 128))
                  ])
                ])) : createCommentVNode("", true),
                _ctx.data.recommendations.length > 0 ? (openBlock(), createBlock("div", {
                  key: 1,
                  class: "space-y-3"
                }, [
                  createVNode("h4", { class: "text-sm font-medium text-highlighted" }, "Recommendations"),
                  createVNode("div", { class: "space-y-2" }, [
                    (openBlock(true), createBlock(Fragment, null, renderList(_ctx.data.recommendations, (recommendation) => {
                      return openBlock(), createBlock("div", {
                        key: recommendation,
                        class: "flex items-start gap-2 text-sm text-muted"
                      }, [
                        createVNode(_component_UIcon, {
                          name: "i-lucide-lightbulb",
                          class: "h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0"
                        }),
                        createTextVNode(" " + toDisplayString(recommendation), 1)
                      ]);
                    }), 128))
                  ])
                ])) : createCommentVNode("", true),
                createVNode("div", { class: "flex gap-2 pt-4 border-t border-border" }, [
                  createVNode(_component_UButton, {
                    size: "sm",
                    color: "neutral",
                    variant: "subtle",
                    to: "/invoices?status=draft"
                  }, {
                    default: withCtx(() => [
                      createTextVNode(" Review Drafts (" + toDisplayString(_ctx.data.stages.draft.count) + ") ", 1)
                    ]),
                    _: 1
                  }),
                  createVNode(_component_UButton, {
                    size: "sm",
                    color: "neutral",
                    variant: "subtle",
                    to: "/invoices?status=overdue"
                  }, {
                    default: withCtx(() => [
                      createTextVNode(" Collect Overdue (" + toDisplayString(_ctx.data.stages.overdue.count) + ") ", 1)
                    ]),
                    _: 1
                  })
                ])
              ])) : (openBlock(), createBlock("div", {
                key: 2,
                class: "flex items-center justify-center py-12"
              }, [
                createVNode("div", { class: "text-center" }, [
                  createVNode(_component_UIcon, {
                    name: "i-lucide-file-text",
                    class: "h-12 w-12 text-muted/50 mx-auto mb-4"
                  }),
                  createVNode("p", { class: "text-muted" }, "No invoice data available"),
                  createVNode("p", { class: "text-sm text-muted/70" }, "Connect to Xero to see your invoice pipeline")
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
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("components/dashboard/InvoicePipeline.vue");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const InvoicePipeline = /* @__PURE__ */ Object.assign(_export_sfc(_sfc_main, [["__scopeId", "data-v-5e8359cd"]]), { __name: "DashboardInvoicePipeline" });

export { InvoicePipeline as default };
//# sourceMappingURL=InvoicePipeline-0SlbJBkA.mjs.map
