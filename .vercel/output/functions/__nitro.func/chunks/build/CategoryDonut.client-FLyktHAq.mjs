import { _ as _sfc_main$1 } from './Card-jqGRZ5Ik.mjs';
import { f as __nuxt_component_2$1, _ as _sfc_main$e } from './server.mjs';
import { _ as _sfc_main$2 } from './Skeleton-p2Vkb_Gp.mjs';
import { defineComponent, computed, ref, mergeProps, withCtx, unref, createVNode, createBlock, openBlock, createCommentVNode, resolveDynamicComponent, Fragment, renderList, toDisplayString, useSSRContext } from 'vue';
import { ssrRenderComponent, ssrRenderList, ssrRenderAttr, ssrInterpolate, ssrRenderStyle } from 'vue/server-renderer';
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
  __name: "CategoryDonut.client",
  __ssrInlineRender: true,
  props: {
    categories: {}
  },
  setup(__props) {
    const props = __props;
    const palette = [
      "#2563eb",
      "#14b8a6",
      "#f97316",
      "#a855f7",
      "#22c55e",
      "#eab308",
      "#6366f1",
      "#ef4444"
    ];
    const data = computed(() => {
      if (!props.categories || !Array.isArray(props.categories)) {
        return [];
      }
      return props.categories.filter((category) => category && typeof category.amount === "number" && category.amount > 0).map((category, index) => ({
        ...category,
        index
      }));
    });
    const total = computed(() => data.value.reduce((sum, item) => sum + (item.amount || 0), 0));
    const colorAccessor = (d) => {
      const index = typeof d?.index === "number" ? d.index : 0;
      return palette[index % palette.length];
    };
    const formatCurrency = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0
    }).format;
    const percentLabel = computed(() => {
      const largest = data.value[0];
      if (!largest || total.value === 0) return "0%";
      return `${(largest.amount / total.value * 100).toFixed(1)}%`;
    });
    const chartData = computed(() => {
      if (!data.value.length || total.value === 0) return [];
      let cumulativePercent = 0;
      const result = data.value.map((item) => {
        const percent = item.amount / total.value * 100;
        const startPercent = cumulativePercent;
        cumulativePercent += percent;
        return {
          ...item,
          percent,
          startPercent,
          endPercent: cumulativePercent,
          color: colorAccessor(item)
        };
      });
      console.log("Chart data generated:", result.length, "segments");
      return result;
    });
    const createArcPath = (startPercent, endPercent, innerRadius = 80, outerRadius = 120) => {
      const startAngle = startPercent / 100 * 2 * Math.PI;
      const endAngle = endPercent / 100 * 2 * Math.PI;
      const centerX = 150;
      const centerY = 150;
      const x1 = centerX + outerRadius * Math.cos(startAngle);
      const y1 = centerY + outerRadius * Math.sin(startAngle);
      const x2 = centerX + outerRadius * Math.cos(endAngle);
      const y2 = centerY + outerRadius * Math.sin(endAngle);
      const x3 = centerX + innerRadius * Math.cos(endAngle);
      const y3 = centerY + innerRadius * Math.sin(endAngle);
      const x4 = centerX + innerRadius * Math.cos(startAngle);
      const y4 = centerY + innerRadius * Math.sin(startAngle);
      const largeArcFlag = endPercent - startPercent > 50 ? 1 : 0;
      return [
        `M ${x1} ${y1}`,
        // Move to start of outer arc
        `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${x2} ${y2}`,
        // Outer arc
        `L ${x3} ${y3}`,
        // Line to start of inner arc
        `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${x4} ${y4}`,
        // Inner arc (reverse direction)
        "Z"
        // Close path
      ].join(" ");
    };
    const useUnovis = ref(false);
    const chartError = ref(false);
    let VisDonut = null;
    let VisTooltip = null;
    const handleChartError = (error) => {
      console.warn("Chart rendering error:", error);
      chartError.value = true;
      useUnovis.value = false;
    };
    const valueAccessor = (d) => {
      return typeof d?.amount === "number" ? d.amount : 0;
    };
    const tooltipTemplate = (d) => {
      if (!d || typeof d.amount !== "number") return "";
      const percent = total.value === 0 ? 0 : d.amount / total.value * 100;
      return `${d.name || "Unknown"}: ${formatCurrency(d.amount)} (${percent.toFixed(1)}%)`;
    };
    return (_ctx, _push, _parent, _attrs) => {
      const _component_UCard = _sfc_main$1;
      const _component_UIcon = _sfc_main$e;
      const _component_ClientOnly = __nuxt_component_2$1;
      const _component_USkeleton = _sfc_main$2;
      _push(ssrRenderComponent(_component_UCard, mergeProps({
        ui: { body: "!p-0", root: "overflow-visible" },
        class: "h-[430px] flex flex-col"
      }, _attrs), {
        header: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            _push2(`<div class="flex items-start justify-between" data-v-ae1795d5${_scopeId}><div class="flex items-center gap-3" data-v-ae1795d5${_scopeId}><div class="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg" data-v-ae1795d5${_scopeId}>`);
            _push2(ssrRenderComponent(_component_UIcon, {
              name: "i-lucide-pie-chart",
              class: "h-5 w-5 text-gray-600 dark:text-gray-400"
            }, null, _parent2, _scopeId));
            _push2(`</div><div data-v-ae1795d5${_scopeId}><h3 class="text-lg font-semibold" data-v-ae1795d5${_scopeId}>Category Distribution</h3><p class="text-sm text-muted" data-v-ae1795d5${_scopeId}>Share of spend by expense category</p></div></div><div class="text-right" data-v-ae1795d5${_scopeId}><p class="text-2xl font-bold text-gray-900 dark:text-gray-100" data-v-ae1795d5${_scopeId}>${ssrInterpolate(unref(formatCurrency)(unref(total) || 0))}</p><p class="text-xs text-muted" data-v-ae1795d5${_scopeId}>${ssrInterpolate(unref(data)?.length || 0)} categories </p></div></div>`);
          } else {
            return [
              createVNode("div", { class: "flex items-start justify-between" }, [
                createVNode("div", { class: "flex items-center gap-3" }, [
                  createVNode("div", { class: "p-2 bg-gray-100 dark:bg-gray-800 rounded-lg" }, [
                    createVNode(_component_UIcon, {
                      name: "i-lucide-pie-chart",
                      class: "h-5 w-5 text-gray-600 dark:text-gray-400"
                    })
                  ]),
                  createVNode("div", null, [
                    createVNode("h3", { class: "text-lg font-semibold" }, "Category Distribution"),
                    createVNode("p", { class: "text-sm text-muted" }, "Share of spend by expense category")
                  ])
                ]),
                createVNode("div", { class: "text-right" }, [
                  createVNode("p", { class: "text-2xl font-bold text-gray-900 dark:text-gray-100" }, toDisplayString(unref(formatCurrency)(unref(total) || 0)), 1),
                  createVNode("p", { class: "text-xs text-muted" }, toDisplayString(unref(data)?.length || 0) + " categories ", 1)
                ])
              ])
            ];
          }
        }),
        default: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            if (unref(data).length) {
              _push2(`<div class="p-6 pt-0 flex flex-col lg:flex-row lg:items-start flex-1 min-h-0" data-v-ae1795d5${_scopeId}><div class="flex-shrink-0 flex justify-center" data-v-ae1795d5${_scopeId}>`);
              if (unref(useUnovis) && !unref(chartError)) {
                _push2(ssrRenderComponent(_component_ClientOnly, null, {
                  fallback: withCtx((_2, _push3, _parent3, _scopeId2) => {
                    if (_push3) {
                      _push3(`<div class="flex items-center justify-center h-[250px] w-[250px]" data-v-ae1795d5${_scopeId2}>`);
                      _push3(ssrRenderComponent(_component_USkeleton, { class: "h-[250px] w-[250px] rounded-full" }, null, _parent3, _scopeId2));
                      _push3(`</div>`);
                    } else {
                      return [
                        createVNode("div", { class: "flex items-center justify-center h-[250px] w-[250px]" }, [
                          createVNode(_component_USkeleton, { class: "h-[250px] w-[250px] rounded-full" })
                        ])
                      ];
                    }
                  })
                }, _parent2, _scopeId));
              } else {
                _push2(`<div class="relative flex items-center justify-center" data-v-ae1795d5${_scopeId}>`);
                if (unref(chartData).length > 0) {
                  _push2(`<div class="relative" data-v-ae1795d5${_scopeId}><svg width="250" height="250" viewBox="0 0 300 300" class="drop-shadow-sm" data-v-ae1795d5${_scopeId}><circle cx="150" cy="150" r="120" fill="none" stroke="rgb(243 244 246)" stroke-width="40" class="dark:stroke-gray-800" data-v-ae1795d5${_scopeId}></circle><g class="transform -rotate-90 origin-center" data-v-ae1795d5${_scopeId}><!--[-->`);
                  ssrRenderList(unref(chartData), (segment) => {
                    _push2(`<path${ssrRenderAttr("d", createArcPath(segment.startPercent, segment.endPercent))}${ssrRenderAttr("fill", segment.color)} class="hover:opacity-90 transition-all duration-200 cursor-pointer hover:drop-shadow-md"${ssrRenderAttr("title", `${segment.name}: ${unref(formatCurrency)(segment.amount)} (${segment.percent.toFixed(1)}%)`)} stroke="white" stroke-width="1" data-v-ae1795d5${_scopeId}></path>`);
                  });
                  _push2(`<!--]--></g></svg><div class="absolute inset-0 flex flex-col items-center justify-center text-center" data-v-ae1795d5${_scopeId}><div class="text-3xl font-bold text-primary mb-1" data-v-ae1795d5${_scopeId}>${ssrInterpolate(unref(percentLabel))}</div><div class="text-sm text-muted font-medium" data-v-ae1795d5${_scopeId}>Top Category</div><div class="text-xs text-muted mt-1 max-w-[120px] truncate"${ssrRenderAttr("title", unref(data)[0]?.name)} data-v-ae1795d5${_scopeId}>${ssrInterpolate(unref(data)[0]?.name || "No data")}</div></div></div>`);
                } else if (unref(data).length > 0) {
                  _push2(`<div class="w-[250px] h-[250px] relative" data-v-ae1795d5${_scopeId}><div class="absolute inset-0 flex items-center justify-center" data-v-ae1795d5${_scopeId}><!--[-->`);
                  ssrRenderList(unref(data).slice(0, 5), (item, index) => {
                    _push2(`<div class="absolute rounded-full border-8 animate-pulse" style="${ssrRenderStyle({
                      width: `${280 - index * 30}px`,
                      height: `${280 - index * 30}px`,
                      borderColor: colorAccessor(item),
                      opacity: 0.8 - index * 0.15
                    })}" data-v-ae1795d5${_scopeId}></div>`);
                  });
                  _push2(`<!--]--></div><div class="absolute inset-0 flex flex-col items-center justify-center text-center bg-white dark:bg-gray-900 rounded-full w-32 h-32 m-auto border-4 border-gray-100 dark:border-gray-800" data-v-ae1795d5${_scopeId}><div class="text-xl font-bold text-primary" data-v-ae1795d5${_scopeId}>${ssrInterpolate(unref(percentLabel))}</div><div class="text-xs text-muted" data-v-ae1795d5${_scopeId}>Top Category</div></div></div>`);
                } else {
                  _push2(`<div class="w-[250px] h-[250px] flex items-center justify-center" data-v-ae1795d5${_scopeId}><div class="text-center" data-v-ae1795d5${_scopeId}><div class="w-24 h-24 mx-auto mb-4 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center" data-v-ae1795d5${_scopeId}>`);
                  _push2(ssrRenderComponent(_component_UIcon, {
                    name: "i-lucide-pie-chart",
                    class: "h-12 w-12 text-gray-400"
                  }, null, _parent2, _scopeId));
                  _push2(`</div><p class="text-sm text-muted" data-v-ae1795d5${_scopeId}>No expense data available</p></div></div>`);
                }
                _push2(`</div>`);
              }
              _push2(`</div><div class="flex-1 lg:pl-8 mt-6 lg:mt-0 min-h-0" data-v-ae1795d5${_scopeId}><ul class="space-y-3 overflow-y-auto max-h-80 p-3 pr-5 scrollbar-thin rounded-lg bg-gray-50/50 dark:bg-gray-800/20" data-v-ae1795d5${_scopeId}><!--[-->`);
              ssrRenderList(unref(data), (item) => {
                _push2(`<li class="flex items-center justify-between gap-3" data-v-ae1795d5${_scopeId}><div class="flex items-center gap-2" data-v-ae1795d5${_scopeId}><span class="legend-swatch" style="${ssrRenderStyle({ background: colorAccessor(item) })}" data-v-ae1795d5${_scopeId}></span><span class="text-sm text-highlighted" data-v-ae1795d5${_scopeId}>${ssrInterpolate(item.name)}</span></div><div class="text-right" data-v-ae1795d5${_scopeId}><div class="text-sm font-medium" data-v-ae1795d5${_scopeId}>${ssrInterpolate(unref(formatCurrency)(item.amount))}</div><div class="text-xs text-muted" data-v-ae1795d5${_scopeId}>${ssrInterpolate(unref(total) === 0 ? "0.0%" : (item.amount / unref(total) * 100).toFixed(1) + "%")}</div></div></li>`);
              });
              _push2(`<!--]--></ul></div></div>`);
            } else {
              _push2(`<div class="p-6 text-sm text-muted flex items-center justify-center min-h-[200px]" data-v-ae1795d5${_scopeId}><div class="text-center" data-v-ae1795d5${_scopeId}>`);
              _push2(ssrRenderComponent(_component_UIcon, {
                name: "i-lucide-pie-chart",
                class: "h-12 w-12 text-muted/50 mx-auto mb-4"
              }, null, _parent2, _scopeId));
              _push2(`<p data-v-ae1795d5${_scopeId}>Expense categories will appear when we detect transactions in this range.</p></div></div>`);
            }
          } else {
            return [
              unref(data).length ? (openBlock(), createBlock("div", {
                key: 0,
                class: "p-6 pt-0 flex flex-col lg:flex-row lg:items-start flex-1 min-h-0"
              }, [
                createVNode("div", { class: "flex-shrink-0 flex justify-center" }, [
                  unref(useUnovis) && !unref(chartError) ? (openBlock(), createBlock(_component_ClientOnly, { key: 0 }, {
                    fallback: withCtx(() => [
                      createVNode("div", { class: "flex items-center justify-center h-[250px] w-[250px]" }, [
                        createVNode(_component_USkeleton, { class: "h-[250px] w-[250px] rounded-full" })
                      ])
                    ]),
                    default: withCtx(() => [
                      createVNode("div", {
                        class: "relative",
                        onError: handleChartError
                      }, [
                        unref(VisDonut) ? (openBlock(), createBlock(resolveDynamicComponent(unref(VisDonut)), {
                          key: 0,
                          data: unref(data),
                          value: valueAccessor,
                          color: colorAccessor,
                          "central-label": unref(percentLabel),
                          "central-sub-label": "Top category share",
                          "central-sub-label-wrap": true,
                          height: 250,
                          width: 250
                        }, null, 8, ["data", "central-label"])) : createCommentVNode("", true),
                        unref(VisTooltip) ? (openBlock(), createBlock(resolveDynamicComponent(unref(VisTooltip)), {
                          key: 1,
                          template: tooltipTemplate
                        })) : createCommentVNode("", true)
                      ], 32)
                    ]),
                    _: 1
                  })) : (openBlock(), createBlock("div", {
                    key: 1,
                    class: "relative flex items-center justify-center"
                  }, [
                    unref(chartData).length > 0 ? (openBlock(), createBlock("div", {
                      key: 0,
                      class: "relative"
                    }, [
                      (openBlock(), createBlock("svg", {
                        width: "250",
                        height: "250",
                        viewBox: "0 0 300 300",
                        class: "drop-shadow-sm"
                      }, [
                        createVNode("circle", {
                          cx: "150",
                          cy: "150",
                          r: "120",
                          fill: "none",
                          stroke: "rgb(243 244 246)",
                          "stroke-width": "40",
                          class: "dark:stroke-gray-800"
                        }),
                        createVNode("g", { class: "transform -rotate-90 origin-center" }, [
                          (openBlock(true), createBlock(Fragment, null, renderList(unref(chartData), (segment) => {
                            return openBlock(), createBlock("path", {
                              key: segment.name,
                              d: createArcPath(segment.startPercent, segment.endPercent),
                              fill: segment.color,
                              class: "hover:opacity-90 transition-all duration-200 cursor-pointer hover:drop-shadow-md",
                              title: `${segment.name}: ${unref(formatCurrency)(segment.amount)} (${segment.percent.toFixed(1)}%)`,
                              stroke: "white",
                              "stroke-width": "1"
                            }, null, 8, ["d", "fill", "title"]);
                          }), 128))
                        ])
                      ])),
                      createVNode("div", { class: "absolute inset-0 flex flex-col items-center justify-center text-center" }, [
                        createVNode("div", { class: "text-3xl font-bold text-primary mb-1" }, toDisplayString(unref(percentLabel)), 1),
                        createVNode("div", { class: "text-sm text-muted font-medium" }, "Top Category"),
                        createVNode("div", {
                          class: "text-xs text-muted mt-1 max-w-[120px] truncate",
                          title: unref(data)[0]?.name
                        }, toDisplayString(unref(data)[0]?.name || "No data"), 9, ["title"])
                      ])
                    ])) : unref(data).length > 0 ? (openBlock(), createBlock("div", {
                      key: 1,
                      class: "w-[250px] h-[250px] relative"
                    }, [
                      createVNode("div", { class: "absolute inset-0 flex items-center justify-center" }, [
                        (openBlock(true), createBlock(Fragment, null, renderList(unref(data).slice(0, 5), (item, index) => {
                          return openBlock(), createBlock("div", {
                            key: item.name,
                            class: "absolute rounded-full border-8 animate-pulse",
                            style: {
                              width: `${280 - index * 30}px`,
                              height: `${280 - index * 30}px`,
                              borderColor: colorAccessor(item),
                              opacity: 0.8 - index * 0.15
                            }
                          }, null, 4);
                        }), 128))
                      ]),
                      createVNode("div", { class: "absolute inset-0 flex flex-col items-center justify-center text-center bg-white dark:bg-gray-900 rounded-full w-32 h-32 m-auto border-4 border-gray-100 dark:border-gray-800" }, [
                        createVNode("div", { class: "text-xl font-bold text-primary" }, toDisplayString(unref(percentLabel)), 1),
                        createVNode("div", { class: "text-xs text-muted" }, "Top Category")
                      ])
                    ])) : (openBlock(), createBlock("div", {
                      key: 2,
                      class: "w-[250px] h-[250px] flex items-center justify-center"
                    }, [
                      createVNode("div", { class: "text-center" }, [
                        createVNode("div", { class: "w-24 h-24 mx-auto mb-4 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center" }, [
                          createVNode(_component_UIcon, {
                            name: "i-lucide-pie-chart",
                            class: "h-12 w-12 text-gray-400"
                          })
                        ]),
                        createVNode("p", { class: "text-sm text-muted" }, "No expense data available")
                      ])
                    ]))
                  ]))
                ]),
                createVNode("div", { class: "flex-1 lg:pl-8 mt-6 lg:mt-0 min-h-0" }, [
                  createVNode("ul", { class: "space-y-3 overflow-y-auto max-h-80 p-3 pr-5 scrollbar-thin rounded-lg bg-gray-50/50 dark:bg-gray-800/20" }, [
                    (openBlock(true), createBlock(Fragment, null, renderList(unref(data), (item) => {
                      return openBlock(), createBlock("li", {
                        key: item.name,
                        class: "flex items-center justify-between gap-3"
                      }, [
                        createVNode("div", { class: "flex items-center gap-2" }, [
                          createVNode("span", {
                            class: "legend-swatch",
                            style: { background: colorAccessor(item) }
                          }, null, 4),
                          createVNode("span", { class: "text-sm text-highlighted" }, toDisplayString(item.name), 1)
                        ]),
                        createVNode("div", { class: "text-right" }, [
                          createVNode("div", { class: "text-sm font-medium" }, toDisplayString(unref(formatCurrency)(item.amount)), 1),
                          createVNode("div", { class: "text-xs text-muted" }, toDisplayString(unref(total) === 0 ? "0.0%" : (item.amount / unref(total) * 100).toFixed(1) + "%"), 1)
                        ])
                      ]);
                    }), 128))
                  ])
                ])
              ])) : (openBlock(), createBlock("div", {
                key: 1,
                class: "p-6 text-sm text-muted flex items-center justify-center min-h-[200px]"
              }, [
                createVNode("div", { class: "text-center" }, [
                  createVNode(_component_UIcon, {
                    name: "i-lucide-pie-chart",
                    class: "h-12 w-12 text-muted/50 mx-auto mb-4"
                  }),
                  createVNode("p", null, "Expense categories will appear when we detect transactions in this range.")
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
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("components/expenses/CategoryDonut.client.vue");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const CategoryDonut_client = /* @__PURE__ */ Object.assign(_export_sfc(_sfc_main, [["__scopeId", "data-v-ae1795d5"]]), { __name: "ExpensesCategoryDonut" });

export { CategoryDonut_client as default };
//# sourceMappingURL=CategoryDonut.client-FLyktHAq.mjs.map
