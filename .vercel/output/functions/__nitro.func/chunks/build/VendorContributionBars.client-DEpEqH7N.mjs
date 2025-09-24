import { _ as _sfc_main$1 } from './Card-jqGRZ5Ik.mjs';
import { _ as _sfc_main$e } from './server.mjs';
import { defineComponent, computed, mergeProps, withCtx, unref, createBlock, openBlock, createVNode, Fragment, renderList, toDisplayString, useSSRContext } from 'vue';
import { ssrRenderComponent, ssrRenderList, ssrRenderAttr, ssrRenderStyle, ssrInterpolate } from 'vue/server-renderer';
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
  __name: "VendorContributionBars.client",
  __ssrInlineRender: true,
  props: {
    vendors: {}
  },
  setup(__props) {
    const props = __props;
    const colorPalette = [
      { from: "#3b82f6", to: "#1d4ed8", bg: "#3b82f6" },
      // blue
      { from: "#10b981", to: "#047857", bg: "#10b981" },
      // green
      { from: "#8b5cf6", to: "#5b21b6", bg: "#8b5cf6" },
      // purple
      { from: "#f97316", to: "#c2410c", bg: "#f97316" },
      // orange
      { from: "#ef4444", to: "#b91c1c", bg: "#ef4444" },
      // red
      { from: "#6366f1", to: "#3730a3", bg: "#6366f1" },
      // indigo
      { from: "#06b6d4", to: "#0891b2", bg: "#06b6d4" },
      // cyan
      { from: "#84cc16", to: "#4d7c0f", bg: "#84cc16" }
      // lime
    ];
    const items = computed(() => {
      if (!props.vendors || !Array.isArray(props.vendors)) return [];
      const sorted = [...props.vendors].filter((vendor) => vendor && typeof vendor.amount === "number" && vendor.amount > 0).sort((a, b) => b.amount - a.amount);
      return sorted.slice(0, 8).map((vendor, index) => ({
        ...vendor,
        colors: colorPalette[index % colorPalette.length]
      }));
    });
    const maxAmount = computed(() => items.value.reduce((max, item) => Math.max(max, item.amount || 0), 0));
    const formatCurrency = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0
    }).format;
    return (_ctx, _push, _parent, _attrs) => {
      const _component_UCard = _sfc_main$1;
      const _component_UIcon = _sfc_main$e;
      _push(ssrRenderComponent(_component_UCard, mergeProps({
        ui: { body: "!p-0" },
        class: "h-full flex flex-col"
      }, _attrs), {
        header: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            _push2(`<div${_scopeId}><p class="text-xs text-muted uppercase mb-1.5"${_scopeId}> Vendor Concentration </p><p class="text-muted text-xs"${_scopeId}> Share of spend by top vendors </p></div>`);
          } else {
            return [
              createVNode("div", null, [
                createVNode("p", { class: "text-xs text-muted uppercase mb-1.5" }, " Vendor Concentration "),
                createVNode("p", { class: "text-muted text-xs" }, " Share of spend by top vendors ")
              ])
            ];
          }
        }),
        default: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            if (!unref(items)?.length) {
              _push2(`<div class="p-6 text-sm text-muted flex items-center justify-center min-h-[300px]"${_scopeId}><div class="text-center"${_scopeId}>`);
              _push2(ssrRenderComponent(_component_UIcon, {
                name: "i-lucide-building-2",
                class: "h-12 w-12 text-muted/50 mx-auto mb-4"
              }, null, _parent2, _scopeId));
              _push2(`<p${_scopeId}>Vendor spend will appear here once we detect expenses in this range.</p></div></div>`);
            } else {
              _push2(`<div class="p-6 pt-0 flex-1"${_scopeId}><div class="mb-6"${_scopeId}><div class="relative h-64 flex items-end justify-center gap-3 px-4"${_scopeId}><!--[-->`);
              ssrRenderList(unref(items).slice(0, 6), (vendor, index) => {
                _push2(`<div class="relative flex flex-col items-center group cursor-pointer"${ssrRenderAttr("title", `${vendor?.name || "Unknown"}: ${unref(formatCurrency)(vendor?.amount || 0)}`)}${_scopeId}><div class="w-8 rounded-t-lg transition-all duration-500 hover:scale-105 hover:shadow-lg" style="${ssrRenderStyle({
                  background: `linear-gradient(to top, ${vendor?.colors?.from || "#3b82f6"}, ${vendor?.colors?.to || "#1d4ed8"})`,
                  height: `${unref(maxAmount) === 0 ? 0 : (vendor?.amount || 0) / unref(maxAmount) * 200}px`,
                  minHeight: "12px"
                })}"${_scopeId}></div><div class="absolute -top-8 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10"${_scopeId}>${ssrInterpolate(unref(formatCurrency)(vendor?.amount || 0))}</div><div class="mt-2 text-xs text-center max-w-16 truncate"${ssrRenderAttr("title", vendor?.name || "Unknown")}${_scopeId}>${ssrInterpolate((vendor?.name || "Unknown").split(" ")[0])}</div></div>`);
              });
              _push2(`<!--]--></div></div><div class="border-t border-gray-100 dark:border-gray-800 pt-4"${_scopeId}><h4 class="text-sm font-semibold mb-3 text-muted"${_scopeId}>Top Vendors</h4><div class="space-y-2 max-h-32 overflow-y-auto scrollbar-thin"${_scopeId}><!--[-->`);
              ssrRenderList(unref(items), (vendor, index) => {
                _push2(`<div class="flex items-center justify-between text-sm hover:bg-gray-50 dark:hover:bg-gray-800/50 px-2 py-1 rounded transition-colors"${_scopeId}><div class="flex items-center gap-2 min-w-0 flex-1"${_scopeId}><div class="w-3 h-3 rounded-full flex-shrink-0" style="${ssrRenderStyle({ backgroundColor: vendor?.colors?.bg || "#3b82f6" })}"${_scopeId}></div><span class="truncate"${ssrRenderAttr("title", vendor?.name || "Unknown")}${_scopeId}>${ssrInterpolate(vendor?.name || "Unknown")}</span></div><span class="font-medium text-green-600 ml-3"${_scopeId}>${ssrInterpolate(unref(formatCurrency)(vendor?.amount || 0))}</span></div>`);
              });
              _push2(`<!--]--></div></div></div>`);
            }
          } else {
            return [
              !unref(items)?.length ? (openBlock(), createBlock("div", {
                key: 0,
                class: "p-6 text-sm text-muted flex items-center justify-center min-h-[300px]"
              }, [
                createVNode("div", { class: "text-center" }, [
                  createVNode(_component_UIcon, {
                    name: "i-lucide-building-2",
                    class: "h-12 w-12 text-muted/50 mx-auto mb-4"
                  }),
                  createVNode("p", null, "Vendor spend will appear here once we detect expenses in this range.")
                ])
              ])) : (openBlock(), createBlock("div", {
                key: 1,
                class: "p-6 pt-0 flex-1"
              }, [
                createVNode("div", { class: "mb-6" }, [
                  createVNode("div", { class: "relative h-64 flex items-end justify-center gap-3 px-4" }, [
                    (openBlock(true), createBlock(Fragment, null, renderList(unref(items).slice(0, 6), (vendor, index) => {
                      return openBlock(), createBlock("div", {
                        key: vendor.name,
                        class: "relative flex flex-col items-center group cursor-pointer",
                        title: `${vendor?.name || "Unknown"}: ${unref(formatCurrency)(vendor?.amount || 0)}`
                      }, [
                        createVNode("div", {
                          class: "w-8 rounded-t-lg transition-all duration-500 hover:scale-105 hover:shadow-lg",
                          style: {
                            background: `linear-gradient(to top, ${vendor?.colors?.from || "#3b82f6"}, ${vendor?.colors?.to || "#1d4ed8"})`,
                            height: `${unref(maxAmount) === 0 ? 0 : (vendor?.amount || 0) / unref(maxAmount) * 200}px`,
                            minHeight: "12px"
                          }
                        }, null, 4),
                        createVNode("div", { class: "absolute -top-8 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10" }, toDisplayString(unref(formatCurrency)(vendor?.amount || 0)), 1),
                        createVNode("div", {
                          class: "mt-2 text-xs text-center max-w-16 truncate",
                          title: vendor?.name || "Unknown"
                        }, toDisplayString((vendor?.name || "Unknown").split(" ")[0]), 9, ["title"])
                      ], 8, ["title"]);
                    }), 128))
                  ])
                ]),
                createVNode("div", { class: "border-t border-gray-100 dark:border-gray-800 pt-4" }, [
                  createVNode("h4", { class: "text-sm font-semibold mb-3 text-muted" }, "Top Vendors"),
                  createVNode("div", { class: "space-y-2 max-h-32 overflow-y-auto scrollbar-thin" }, [
                    (openBlock(true), createBlock(Fragment, null, renderList(unref(items), (vendor, index) => {
                      return openBlock(), createBlock("div", {
                        key: vendor.name,
                        class: "flex items-center justify-between text-sm hover:bg-gray-50 dark:hover:bg-gray-800/50 px-2 py-1 rounded transition-colors"
                      }, [
                        createVNode("div", { class: "flex items-center gap-2 min-w-0 flex-1" }, [
                          createVNode("div", {
                            class: "w-3 h-3 rounded-full flex-shrink-0",
                            style: { backgroundColor: vendor?.colors?.bg || "#3b82f6" }
                          }, null, 4),
                          createVNode("span", {
                            class: "truncate",
                            title: vendor?.name || "Unknown"
                          }, toDisplayString(vendor?.name || "Unknown"), 9, ["title"])
                        ]),
                        createVNode("span", { class: "font-medium text-green-600 ml-3" }, toDisplayString(unref(formatCurrency)(vendor?.amount || 0)), 1)
                      ]);
                    }), 128))
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
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("components/expenses/VendorContributionBars.client.vue");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const VendorContributionBars_client = Object.assign(_sfc_main, { __name: "ExpensesVendorContributionBars" });

export { VendorContributionBars_client as default };
//# sourceMappingURL=VendorContributionBars.client-DEpEqH7N.mjs.map
