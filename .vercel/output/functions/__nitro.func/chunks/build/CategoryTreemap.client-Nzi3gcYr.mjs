import { _ as _sfc_main$1 } from './Card-jqGRZ5Ik.mjs';
import { _ as _sfc_main$e } from './server.mjs';
import { defineComponent, computed, mergeProps, withCtx, unref, createBlock, openBlock, createVNode, Fragment, renderList, toDisplayString, useSSRContext } from 'vue';
import { ssrRenderComponent, ssrRenderList, ssrRenderStyle, ssrRenderAttr, ssrInterpolate } from 'vue/server-renderer';
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
  __name: "CategoryTreemap.client",
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
      "#ef4444",
      "#06b6d4",
      "#8b5cf6",
      "#f59e0b",
      "#10b981"
    ];
    const total = computed(() => {
      if (!props.categories || !Array.isArray(props.categories)) {
        return 0;
      }
      return props.categories.filter((category) => category && typeof category.amount === "number" && category.amount > 0).reduce((sum, item) => sum + (item.amount || 0), 0);
    });
    const data = computed(() => {
      if (!props.categories || !Array.isArray(props.categories)) {
        return [];
      }
      const filteredCategories = props.categories.filter((category) => category && typeof category.amount === "number" && category.amount > 0).sort((a, b) => b.amount - a.amount);
      return filteredCategories.map((category, index) => ({
        ...category,
        index,
        color: palette[index % palette.length],
        percentage: total.value > 0 ? category.amount / total.value * 100 : 0
      }));
    });
    const formatCurrency = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0
    }).format;
    const processedData = computed(() => {
      if (!data.value?.length || !total.value || total.value === 0) return [];
      return data.value.map((item, index) => {
        if (!item || typeof item.amount !== "number") return null;
        const percentage = item.amount / total.value * 100;
        let size = Math.max(percentage * 4, 20);
        if (index === 0) size = Math.max(size, 120);
        else if (index < 3) size = Math.max(size, 80);
        else if (index < 6) size = Math.max(size, 60);
        else size = Math.max(size, 40);
        return {
          ...item,
          percentage: percentage || 0,
          size,
          // Calculate grid position
          gridRow: Math.floor(index / 4) + 1,
          gridCol: index % 4 + 1
        };
      }).filter(Boolean);
    });
    return (_ctx, _push, _parent, _attrs) => {
      const _component_UCard = _sfc_main$1;
      const _component_UIcon = _sfc_main$e;
      _push(ssrRenderComponent(_component_UCard, mergeProps({
        ui: { body: "!p-0" },
        class: "h-[1020px] flex flex-col"
      }, _attrs), {
        header: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            _push2(`<div${_scopeId}><p class="text-xs text-muted uppercase mb-1.5"${_scopeId}> Category Breakdown </p><p class="text-3xl text-highlighted font-semibold"${_scopeId}>${ssrInterpolate(unref(formatCurrency)(unref(total) || 0))}</p><p class="text-muted text-xs"${_scopeId}>${ssrInterpolate(unref(data)?.length || 0)} categories • Expense distribution </p></div>`);
          } else {
            return [
              createVNode("div", null, [
                createVNode("p", { class: "text-xs text-muted uppercase mb-1.5" }, " Category Breakdown "),
                createVNode("p", { class: "text-3xl text-highlighted font-semibold" }, toDisplayString(unref(formatCurrency)(unref(total) || 0)), 1),
                createVNode("p", { class: "text-muted text-xs" }, toDisplayString(unref(data)?.length || 0) + " categories • Expense distribution ", 1)
              ])
            ];
          }
        }),
        default: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            if (!unref(data)?.length) {
              _push2(`<div class="p-6 text-sm text-muted flex items-center justify-center min-h-[300px]"${_scopeId}><div class="text-center"${_scopeId}>`);
              _push2(ssrRenderComponent(_component_UIcon, {
                name: "i-lucide-layers",
                class: "h-12 w-12 text-muted/50 mx-auto mb-4"
              }, null, _parent2, _scopeId));
              _push2(`<p${_scopeId}>Category breakdown will appear when we detect expenses in this range.</p></div></div>`);
            } else {
              _push2(`<div class="flex-1 flex flex-col min-h-0"${_scopeId}><div class="p-4 pb-0 flex-shrink-0"${_scopeId}><div class="grid grid-cols-3 gap-3 mb-4"${_scopeId}><!--[-->`);
              ssrRenderList((unref(processedData) || []).slice(0, 3), (item, index) => {
                _push2(`<div class="relative rounded-lg p-3 cursor-pointer group transition-all duration-300 hover:scale-105 hover:shadow-lg" style="${ssrRenderStyle([{ backgroundColor: (item?.color || "#gray") + "15", borderColor: (item?.color || "#gray") + "40" }, { "border-width": "1px" }])}"${ssrRenderAttr("title", `${item?.name || "Unknown"}: ${unref(formatCurrency)(item?.amount || 0)} (${(item?.percentage || 0).toFixed(1)}%)`)}${_scopeId}><div class="flex items-center justify-between mb-2"${_scopeId}><div class="w-3 h-3 rounded-full flex-shrink-0" style="${ssrRenderStyle({ backgroundColor: item?.color || "#gray" })}"${_scopeId}></div><div class="text-xs font-bold opacity-70"${_scopeId}>${ssrInterpolate((item?.percentage || 0).toFixed(1))}% </div></div><div class="text-xs font-medium text-gray-700 dark:text-gray-300 truncate mb-1"${ssrRenderAttr("title", item?.name || "Unknown")}${_scopeId}>${ssrInterpolate((item?.name || "Unknown").length > 15 ? (item?.name || "Unknown").substring(0, 15) + "..." : item?.name || "Unknown")}</div><div class="text-sm font-bold" style="${ssrRenderStyle({ color: item?.color || "#gray" })}"${_scopeId}>${ssrInterpolate(unref(formatCurrency)(item?.amount || 0))}</div></div>`);
              });
              _push2(`<!--]--></div></div><div class="flex-1 px-4 pb-4 min-h-0"${_scopeId}><div class="border-t border-gray-100 dark:border-gray-800 pt-3"${_scopeId}><h4 class="text-sm font-semibold mb-3 text-muted flex items-center justify-between"${_scopeId}><span${_scopeId}>All Categories</span><span class="text-xs opacity-60"${_scopeId}>${ssrInterpolate(unref(data)?.length || 0)} items</span></h4><div class="overflow-y-auto max-h-166 space-y-2 pr-2 scrollbar-thin"${_scopeId}><!--[-->`);
              ssrRenderList(unref(data) || [], (item, index) => {
                _push2(`<div class="flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded-lg transition-colors group cursor-pointer"${ssrRenderAttr("title", `${item?.name || "Unknown"}: ${unref(formatCurrency)(item?.amount || 0)} (${(item?.percentage || 0).toFixed(1)}%)`)}${_scopeId}><div class="flex items-center gap-3 min-w-0 flex-1"${_scopeId}><div class="flex items-center gap-2"${_scopeId}><div class="w-3 h-3 rounded-full flex-shrink-0" style="${ssrRenderStyle({ backgroundColor: item?.color || "#gray" })}"${_scopeId}></div><span class="text-xs font-medium text-gray-500 dark:text-gray-400 min-w-[2rem]"${_scopeId}> #${ssrInterpolate(index + 1)}</span></div><div class="min-w-0 flex-1"${_scopeId}><div class="text-sm font-medium truncate"${ssrRenderAttr("title", item?.name || "Unknown")}${_scopeId}>${ssrInterpolate(item?.name || "Unknown Category")}</div><div class="text-xs text-gray-500 dark:text-gray-400"${_scopeId}>${ssrInterpolate((item?.percentage || 0).toFixed(1))}% of total expenses </div></div></div><div class="text-right ml-3"${_scopeId}><div class="text-sm font-semibold" style="${ssrRenderStyle({ color: item?.color || "#gray" })}"${_scopeId}>${ssrInterpolate(unref(formatCurrency)(item?.amount || 0))}</div><div class="w-16 bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 mt-1"${_scopeId}><div class="h-1.5 rounded-full transition-all duration-500" style="${ssrRenderStyle({
                  backgroundColor: item?.color || "#gray",
                  width: `${Math.max(item?.percentage || 0, 2)}%`
                })}"${_scopeId}></div></div></div></div>`);
              });
              _push2(`<!--]--></div></div></div><div class="px-4 pb-4 flex-shrink-0 mt-auto"${_scopeId}><div class="border-t border-gray-100 dark:border-gray-800 pt-3"${_scopeId}><div class="grid grid-cols-3 gap-4 text-center"${_scopeId}><div${_scopeId}><div class="text-lg font-bold text-blue-600"${_scopeId}>${ssrInterpolate(unref(data)?.length || 0)}</div><div class="text-xs text-muted"${_scopeId}>Categories</div></div><div${_scopeId}><div class="text-lg font-bold text-green-600"${_scopeId}>${ssrInterpolate(unref(data)?.[0] && unref(total) ? (unref(data)[0].amount / unref(total) * 100).toFixed(1) : 0)}% </div><div class="text-xs text-muted"${_scopeId}>Top Category</div></div><div${_scopeId}><div class="text-lg font-bold text-purple-600"${_scopeId}>${ssrInterpolate(unref(data)?.length && unref(total) && unref(data).slice(0, 3).reduce((sum, item) => sum + (item?.amount || 0), 0) > 0 ? (unref(data).slice(0, 3).reduce((sum, item) => sum + (item?.amount || 0), 0) / unref(total) * 100).toFixed(1) : 0)}% </div><div class="text-xs text-muted"${_scopeId}>Top 3 Share</div></div></div></div></div></div>`);
            }
          } else {
            return [
              !unref(data)?.length ? (openBlock(), createBlock("div", {
                key: 0,
                class: "p-6 text-sm text-muted flex items-center justify-center min-h-[300px]"
              }, [
                createVNode("div", { class: "text-center" }, [
                  createVNode(_component_UIcon, {
                    name: "i-lucide-layers",
                    class: "h-12 w-12 text-muted/50 mx-auto mb-4"
                  }),
                  createVNode("p", null, "Category breakdown will appear when we detect expenses in this range.")
                ])
              ])) : (openBlock(), createBlock("div", {
                key: 1,
                class: "flex-1 flex flex-col min-h-0"
              }, [
                createVNode("div", { class: "p-4 pb-0 flex-shrink-0" }, [
                  createVNode("div", { class: "grid grid-cols-3 gap-3 mb-4" }, [
                    (openBlock(true), createBlock(Fragment, null, renderList((unref(processedData) || []).slice(0, 3), (item, index) => {
                      return openBlock(), createBlock("div", {
                        key: item?.name || index,
                        class: "relative rounded-lg p-3 cursor-pointer group transition-all duration-300 hover:scale-105 hover:shadow-lg",
                        style: [{ backgroundColor: (item?.color || "#gray") + "15", borderColor: (item?.color || "#gray") + "40" }, { "border-width": "1px" }],
                        title: `${item?.name || "Unknown"}: ${unref(formatCurrency)(item?.amount || 0)} (${(item?.percentage || 0).toFixed(1)}%)`
                      }, [
                        createVNode("div", { class: "flex items-center justify-between mb-2" }, [
                          createVNode("div", {
                            class: "w-3 h-3 rounded-full flex-shrink-0",
                            style: { backgroundColor: item?.color || "#gray" }
                          }, null, 4),
                          createVNode("div", { class: "text-xs font-bold opacity-70" }, toDisplayString((item?.percentage || 0).toFixed(1)) + "% ", 1)
                        ]),
                        createVNode("div", {
                          class: "text-xs font-medium text-gray-700 dark:text-gray-300 truncate mb-1",
                          title: item?.name || "Unknown"
                        }, toDisplayString((item?.name || "Unknown").length > 15 ? (item?.name || "Unknown").substring(0, 15) + "..." : item?.name || "Unknown"), 9, ["title"]),
                        createVNode("div", {
                          class: "text-sm font-bold",
                          style: { color: item?.color || "#gray" }
                        }, toDisplayString(unref(formatCurrency)(item?.amount || 0)), 5)
                      ], 12, ["title"]);
                    }), 128))
                  ])
                ]),
                createVNode("div", { class: "flex-1 px-4 pb-4 min-h-0" }, [
                  createVNode("div", { class: "border-t border-gray-100 dark:border-gray-800 pt-3" }, [
                    createVNode("h4", { class: "text-sm font-semibold mb-3 text-muted flex items-center justify-between" }, [
                      createVNode("span", null, "All Categories"),
                      createVNode("span", { class: "text-xs opacity-60" }, toDisplayString(unref(data)?.length || 0) + " items", 1)
                    ]),
                    createVNode("div", { class: "overflow-y-auto max-h-166 space-y-2 pr-2 scrollbar-thin" }, [
                      (openBlock(true), createBlock(Fragment, null, renderList(unref(data) || [], (item, index) => {
                        return openBlock(), createBlock("div", {
                          key: item?.name || index,
                          class: "flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded-lg transition-colors group cursor-pointer",
                          title: `${item?.name || "Unknown"}: ${unref(formatCurrency)(item?.amount || 0)} (${(item?.percentage || 0).toFixed(1)}%)`
                        }, [
                          createVNode("div", { class: "flex items-center gap-3 min-w-0 flex-1" }, [
                            createVNode("div", { class: "flex items-center gap-2" }, [
                              createVNode("div", {
                                class: "w-3 h-3 rounded-full flex-shrink-0",
                                style: { backgroundColor: item?.color || "#gray" }
                              }, null, 4),
                              createVNode("span", { class: "text-xs font-medium text-gray-500 dark:text-gray-400 min-w-[2rem]" }, " #" + toDisplayString(index + 1), 1)
                            ]),
                            createVNode("div", { class: "min-w-0 flex-1" }, [
                              createVNode("div", {
                                class: "text-sm font-medium truncate",
                                title: item?.name || "Unknown"
                              }, toDisplayString(item?.name || "Unknown Category"), 9, ["title"]),
                              createVNode("div", { class: "text-xs text-gray-500 dark:text-gray-400" }, toDisplayString((item?.percentage || 0).toFixed(1)) + "% of total expenses ", 1)
                            ])
                          ]),
                          createVNode("div", { class: "text-right ml-3" }, [
                            createVNode("div", {
                              class: "text-sm font-semibold",
                              style: { color: item?.color || "#gray" }
                            }, toDisplayString(unref(formatCurrency)(item?.amount || 0)), 5),
                            createVNode("div", { class: "w-16 bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 mt-1" }, [
                              createVNode("div", {
                                class: "h-1.5 rounded-full transition-all duration-500",
                                style: {
                                  backgroundColor: item?.color || "#gray",
                                  width: `${Math.max(item?.percentage || 0, 2)}%`
                                }
                              }, null, 4)
                            ])
                          ])
                        ], 8, ["title"]);
                      }), 128))
                    ])
                  ])
                ]),
                createVNode("div", { class: "px-4 pb-4 flex-shrink-0 mt-auto" }, [
                  createVNode("div", { class: "border-t border-gray-100 dark:border-gray-800 pt-3" }, [
                    createVNode("div", { class: "grid grid-cols-3 gap-4 text-center" }, [
                      createVNode("div", null, [
                        createVNode("div", { class: "text-lg font-bold text-blue-600" }, toDisplayString(unref(data)?.length || 0), 1),
                        createVNode("div", { class: "text-xs text-muted" }, "Categories")
                      ]),
                      createVNode("div", null, [
                        createVNode("div", { class: "text-lg font-bold text-green-600" }, toDisplayString(unref(data)?.[0] && unref(total) ? (unref(data)[0].amount / unref(total) * 100).toFixed(1) : 0) + "% ", 1),
                        createVNode("div", { class: "text-xs text-muted" }, "Top Category")
                      ]),
                      createVNode("div", null, [
                        createVNode("div", { class: "text-lg font-bold text-purple-600" }, toDisplayString(unref(data)?.length && unref(total) && unref(data).slice(0, 3).reduce((sum, item) => sum + (item?.amount || 0), 0) > 0 ? (unref(data).slice(0, 3).reduce((sum, item) => sum + (item?.amount || 0), 0) / unref(total) * 100).toFixed(1) : 0) + "% ", 1),
                        createVNode("div", { class: "text-xs text-muted" }, "Top 3 Share")
                      ])
                    ])
                  ])
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
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("components/expenses/CategoryTreemap.client.vue");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const CategoryTreemap_client = Object.assign(_sfc_main, { __name: "ExpensesCategoryTreemap" });

export { CategoryTreemap_client as default };
//# sourceMappingURL=CategoryTreemap.client-Nzi3gcYr.mjs.map
