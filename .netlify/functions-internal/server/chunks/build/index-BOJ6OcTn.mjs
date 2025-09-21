import { _ as _sfc_main$1, a as _sfc_main$2 } from './PageHeader-C7h9LUrz.mjs';
import { d as useFetch, a as _sfc_main$9 } from './server.mjs';
import { _ as _sfc_main$3 } from './PageGrid-DdlW-upS.mjs';
import { _ as _sfc_main$4 } from './PageCard-o0es5OuJ.mjs';
import { _ as _sfc_main$5 } from './Table-ahnJ44ag.mjs';
import { defineComponent, withAsyncContext, withCtx, unref, createVNode, toDisplayString, createBlock, openBlock, useSSRContext } from 'vue';
import { ssrRenderComponent, ssrInterpolate } from 'vue/server-renderer';
import 'reka-ui';
import '../nitro/nitro.mjs';
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
import './index-Cc9owYnb.mjs';
import '@tanstack/vue-table';

const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "index",
  __ssrInlineRender: true,
  async setup(__props) {
    let __temp, __restore;
    const { data, pending, error, refresh } = ([__temp, __restore] = withAsyncContext(() => useFetch("/api/xero/expenses", "$4ZSACgDqeX")), __temp = await __temp, __restore(), __temp);
    function formatCurrency(value) {
      if (typeof value !== "number" || Number.isNaN(value)) return "-";
      return value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
    }
    return (_ctx, _push, _parent, _attrs) => {
      const _component_UPage = _sfc_main$1;
      const _component_UPageHeader = _sfc_main$2;
      const _component_UButton = _sfc_main$9;
      const _component_UPageGrid = _sfc_main$3;
      const _component_UPageCard = _sfc_main$4;
      const _component_UTable = _sfc_main$5;
      _push(ssrRenderComponent(_component_UPage, _attrs, {
        default: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            _push2(ssrRenderComponent(_component_UPageHeader, {
              title: "Expense Analytics",
              description: unref(data) ? `Last 90 days (${unref(data)?.range.from} → ${unref(data)?.range.to})` : "Last 90 days"
            }, {
              right: withCtx((_2, _push3, _parent3, _scopeId2) => {
                if (_push3) {
                  _push3(ssrRenderComponent(_component_UButton, {
                    label: "Refresh",
                    color: "neutral",
                    onClick: unref(refresh)
                  }, null, _parent3, _scopeId2));
                } else {
                  return [
                    createVNode(_component_UButton, {
                      label: "Refresh",
                      color: "neutral",
                      onClick: unref(refresh)
                    }, null, 8, ["onClick"])
                  ];
                }
              }),
              _: 1
            }, _parent2, _scopeId));
            if (unref(pending)) {
              _push2(`<div${_scopeId}>Loading expenses…</div>`);
            } else if (unref(error)) {
              _push2(`<div${_scopeId}>Failed to load expenses.</div>`);
            } else {
              _push2(ssrRenderComponent(_component_UPageGrid, { class: "gap-4 sm:gap-6" }, {
                default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                  if (_push3) {
                    _push3(ssrRenderComponent(_component_UPageCard, {
                      title: "Top Categories",
                      variant: "subtle"
                    }, {
                      default: withCtx((_3, _push4, _parent4, _scopeId3) => {
                        if (_push4) {
                          _push4(ssrRenderComponent(_component_UTable, {
                            rows: unref(data)?.categories || [],
                            columns: [
                              { key: "name", label: "Category" },
                              { key: "amount", label: "Amount", class: "text-right" }
                            ]
                          }, {
                            "amount-data": withCtx(({ row }, _push5, _parent5, _scopeId4) => {
                              if (_push5) {
                                _push5(`<span class="text-right block"${_scopeId4}>${ssrInterpolate(formatCurrency(row.amount))}</span>`);
                              } else {
                                return [
                                  createVNode("span", { class: "text-right block" }, toDisplayString(formatCurrency(row.amount)), 1)
                                ];
                              }
                            }),
                            _: 1
                          }, _parent4, _scopeId3));
                        } else {
                          return [
                            createVNode(_component_UTable, {
                              rows: unref(data)?.categories || [],
                              columns: [
                                { key: "name", label: "Category" },
                                { key: "amount", label: "Amount", class: "text-right" }
                              ]
                            }, {
                              "amount-data": withCtx(({ row }) => [
                                createVNode("span", { class: "text-right block" }, toDisplayString(formatCurrency(row.amount)), 1)
                              ]),
                              _: 1
                            }, 8, ["rows"])
                          ];
                        }
                      }),
                      _: 1
                    }, _parent3, _scopeId2));
                    _push3(ssrRenderComponent(_component_UPageCard, {
                      title: "Top Vendors",
                      variant: "subtle"
                    }, {
                      default: withCtx((_3, _push4, _parent4, _scopeId3) => {
                        if (_push4) {
                          _push4(ssrRenderComponent(_component_UTable, {
                            rows: unref(data)?.vendors || [],
                            columns: [
                              { key: "name", label: "Vendor" },
                              { key: "amount", label: "Amount", class: "text-right" }
                            ]
                          }, {
                            "amount-data": withCtx(({ row }, _push5, _parent5, _scopeId4) => {
                              if (_push5) {
                                _push5(`<span class="text-right block"${_scopeId4}>${ssrInterpolate(formatCurrency(row.amount))}</span>`);
                              } else {
                                return [
                                  createVNode("span", { class: "text-right block" }, toDisplayString(formatCurrency(row.amount)), 1)
                                ];
                              }
                            }),
                            _: 1
                          }, _parent4, _scopeId3));
                        } else {
                          return [
                            createVNode(_component_UTable, {
                              rows: unref(data)?.vendors || [],
                              columns: [
                                { key: "name", label: "Vendor" },
                                { key: "amount", label: "Amount", class: "text-right" }
                              ]
                            }, {
                              "amount-data": withCtx(({ row }) => [
                                createVNode("span", { class: "text-right block" }, toDisplayString(formatCurrency(row.amount)), 1)
                              ]),
                              _: 1
                            }, 8, ["rows"])
                          ];
                        }
                      }),
                      _: 1
                    }, _parent3, _scopeId2));
                  } else {
                    return [
                      createVNode(_component_UPageCard, {
                        title: "Top Categories",
                        variant: "subtle"
                      }, {
                        default: withCtx(() => [
                          createVNode(_component_UTable, {
                            rows: unref(data)?.categories || [],
                            columns: [
                              { key: "name", label: "Category" },
                              { key: "amount", label: "Amount", class: "text-right" }
                            ]
                          }, {
                            "amount-data": withCtx(({ row }) => [
                              createVNode("span", { class: "text-right block" }, toDisplayString(formatCurrency(row.amount)), 1)
                            ]),
                            _: 1
                          }, 8, ["rows"])
                        ]),
                        _: 1
                      }),
                      createVNode(_component_UPageCard, {
                        title: "Top Vendors",
                        variant: "subtle"
                      }, {
                        default: withCtx(() => [
                          createVNode(_component_UTable, {
                            rows: unref(data)?.vendors || [],
                            columns: [
                              { key: "name", label: "Vendor" },
                              { key: "amount", label: "Amount", class: "text-right" }
                            ]
                          }, {
                            "amount-data": withCtx(({ row }) => [
                              createVNode("span", { class: "text-right block" }, toDisplayString(formatCurrency(row.amount)), 1)
                            ]),
                            _: 1
                          }, 8, ["rows"])
                        ]),
                        _: 1
                      })
                    ];
                  }
                }),
                _: 1
              }, _parent2, _scopeId));
            }
          } else {
            return [
              createVNode(_component_UPageHeader, {
                title: "Expense Analytics",
                description: unref(data) ? `Last 90 days (${unref(data)?.range.from} → ${unref(data)?.range.to})` : "Last 90 days"
              }, {
                right: withCtx(() => [
                  createVNode(_component_UButton, {
                    label: "Refresh",
                    color: "neutral",
                    onClick: unref(refresh)
                  }, null, 8, ["onClick"])
                ]),
                _: 1
              }, 8, ["description"]),
              unref(pending) ? (openBlock(), createBlock("div", { key: 0 }, "Loading expenses…")) : unref(error) ? (openBlock(), createBlock("div", { key: 1 }, "Failed to load expenses.")) : (openBlock(), createBlock(_component_UPageGrid, {
                key: 2,
                class: "gap-4 sm:gap-6"
              }, {
                default: withCtx(() => [
                  createVNode(_component_UPageCard, {
                    title: "Top Categories",
                    variant: "subtle"
                  }, {
                    default: withCtx(() => [
                      createVNode(_component_UTable, {
                        rows: unref(data)?.categories || [],
                        columns: [
                          { key: "name", label: "Category" },
                          { key: "amount", label: "Amount", class: "text-right" }
                        ]
                      }, {
                        "amount-data": withCtx(({ row }) => [
                          createVNode("span", { class: "text-right block" }, toDisplayString(formatCurrency(row.amount)), 1)
                        ]),
                        _: 1
                      }, 8, ["rows"])
                    ]),
                    _: 1
                  }),
                  createVNode(_component_UPageCard, {
                    title: "Top Vendors",
                    variant: "subtle"
                  }, {
                    default: withCtx(() => [
                      createVNode(_component_UTable, {
                        rows: unref(data)?.vendors || [],
                        columns: [
                          { key: "name", label: "Vendor" },
                          { key: "amount", label: "Amount", class: "text-right" }
                        ]
                      }, {
                        "amount-data": withCtx(({ row }) => [
                          createVNode("span", { class: "text-right block" }, toDisplayString(formatCurrency(row.amount)), 1)
                        ]),
                        _: 1
                      }, 8, ["rows"])
                    ]),
                    _: 1
                  })
                ]),
                _: 1
              }))
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
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("pages/expenses/index.vue");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};

export { _sfc_main as default };
//# sourceMappingURL=index-BOJ6OcTn.mjs.map
