import { _ as _sfc_main$1, a as _sfc_main$2 } from './PageHeader-C7h9LUrz.mjs';
import { d as useFetch, a as _sfc_main$9 } from './server.mjs';
import { _ as _sfc_main$3 } from './Tabs-4lGXKqQB.mjs';
import { _ as _sfc_main$4 } from './Table-ahnJ44ag.mjs';
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
import './Badge-BVxjrbdp.mjs';
import '@tanstack/vue-table';

const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "index",
  __ssrInlineRender: true,
  async setup(__props) {
    let __temp, __restore;
    const { data, pending, error, refresh } = ([__temp, __restore] = withAsyncContext(() => useFetch("/api/xero/invoices", "$nvmssuSe9Y")), __temp = await __temp, __restore(), __temp);
    function formatCurrency(value, currency) {
      if (typeof value !== "number" || Number.isNaN(value)) return "-";
      return value.toLocaleString("en-US", { style: "currency", currency: currency || "USD", maximumFractionDigits: 0 });
    }
    return (_ctx, _push, _parent, _attrs) => {
      const _component_UPage = _sfc_main$1;
      const _component_UPageHeader = _sfc_main$2;
      const _component_UButton = _sfc_main$9;
      const _component_UTabs = _sfc_main$3;
      const _component_UTable = _sfc_main$4;
      _push(ssrRenderComponent(_component_UPage, _attrs, {
        default: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            _push2(ssrRenderComponent(_component_UPageHeader, {
              title: "Invoices",
              description: "Track outstanding, overdue, and paid invoices"
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
              _push2(`<div${_scopeId}>Loading invoices…</div>`);
            } else if (unref(error)) {
              _push2(`<div${_scopeId}>Failed to load invoices.</div>`);
            } else {
              _push2(ssrRenderComponent(_component_UTabs, {
                items: ["Outstanding", "Overdue", "Paid"],
                class: "mt-4"
              }, {
                item: withCtx(({ item }, _push3, _parent3, _scopeId2) => {
                  if (_push3) {
                    if (item === "Outstanding") {
                      _push3(`<div${_scopeId2}>`);
                      _push3(ssrRenderComponent(_component_UTable, {
                        rows: unref(data)?.outstanding || [],
                        columns: [
                          { key: "number", label: "Invoice #" },
                          { key: "contact", label: "Customer" },
                          { key: "date", label: "Date" },
                          { key: "dueDate", label: "Due" },
                          { key: "amountDue", label: "Amount Due", class: "text-right" }
                        ]
                      }, {
                        "amountDue-data": withCtx(({ row }, _push4, _parent4, _scopeId3) => {
                          if (_push4) {
                            _push4(`<span class="text-right block"${_scopeId3}>${ssrInterpolate(formatCurrency(row.amountDue, row.currency))}</span>`);
                          } else {
                            return [
                              createVNode("span", { class: "text-right block" }, toDisplayString(formatCurrency(row.amountDue, row.currency)), 1)
                            ];
                          }
                        }),
                        _: 2
                      }, _parent3, _scopeId2));
                      _push3(`</div>`);
                    } else if (item === "Overdue") {
                      _push3(`<div${_scopeId2}>`);
                      _push3(ssrRenderComponent(_component_UTable, {
                        rows: unref(data)?.overdue || [],
                        columns: [
                          { key: "number", label: "Invoice #" },
                          { key: "contact", label: "Customer" },
                          { key: "date", label: "Date" },
                          { key: "dueDate", label: "Due" },
                          { key: "amountDue", label: "Amount Due", class: "text-right" }
                        ]
                      }, {
                        "amountDue-data": withCtx(({ row }, _push4, _parent4, _scopeId3) => {
                          if (_push4) {
                            _push4(`<span class="text-right block"${_scopeId3}>${ssrInterpolate(formatCurrency(row.amountDue, row.currency))}</span>`);
                          } else {
                            return [
                              createVNode("span", { class: "text-right block" }, toDisplayString(formatCurrency(row.amountDue, row.currency)), 1)
                            ];
                          }
                        }),
                        _: 2
                      }, _parent3, _scopeId2));
                      _push3(`</div>`);
                    } else {
                      _push3(`<div${_scopeId2}>`);
                      _push3(ssrRenderComponent(_component_UTable, {
                        rows: unref(data)?.paid || [],
                        columns: [
                          { key: "number", label: "Invoice #" },
                          { key: "contact", label: "Customer" },
                          { key: "date", label: "Date" },
                          { key: "amountPaid", label: "Paid", class: "text-right" },
                          { key: "total", label: "Total", class: "text-right" }
                        ]
                      }, {
                        "amountPaid-data": withCtx(({ row }, _push4, _parent4, _scopeId3) => {
                          if (_push4) {
                            _push4(`<span class="text-right block"${_scopeId3}>${ssrInterpolate(formatCurrency(row.amountPaid, row.currency))}</span>`);
                          } else {
                            return [
                              createVNode("span", { class: "text-right block" }, toDisplayString(formatCurrency(row.amountPaid, row.currency)), 1)
                            ];
                          }
                        }),
                        "total-data": withCtx(({ row }, _push4, _parent4, _scopeId3) => {
                          if (_push4) {
                            _push4(`<span class="text-right block"${_scopeId3}>${ssrInterpolate(formatCurrency(row.total, row.currency))}</span>`);
                          } else {
                            return [
                              createVNode("span", { class: "text-right block" }, toDisplayString(formatCurrency(row.total, row.currency)), 1)
                            ];
                          }
                        }),
                        _: 2
                      }, _parent3, _scopeId2));
                      _push3(`</div>`);
                    }
                  } else {
                    return [
                      item === "Outstanding" ? (openBlock(), createBlock("div", { key: 0 }, [
                        createVNode(_component_UTable, {
                          rows: unref(data)?.outstanding || [],
                          columns: [
                            { key: "number", label: "Invoice #" },
                            { key: "contact", label: "Customer" },
                            { key: "date", label: "Date" },
                            { key: "dueDate", label: "Due" },
                            { key: "amountDue", label: "Amount Due", class: "text-right" }
                          ]
                        }, {
                          "amountDue-data": withCtx(({ row }) => [
                            createVNode("span", { class: "text-right block" }, toDisplayString(formatCurrency(row.amountDue, row.currency)), 1)
                          ]),
                          _: 1
                        }, 8, ["rows"])
                      ])) : item === "Overdue" ? (openBlock(), createBlock("div", { key: 1 }, [
                        createVNode(_component_UTable, {
                          rows: unref(data)?.overdue || [],
                          columns: [
                            { key: "number", label: "Invoice #" },
                            { key: "contact", label: "Customer" },
                            { key: "date", label: "Date" },
                            { key: "dueDate", label: "Due" },
                            { key: "amountDue", label: "Amount Due", class: "text-right" }
                          ]
                        }, {
                          "amountDue-data": withCtx(({ row }) => [
                            createVNode("span", { class: "text-right block" }, toDisplayString(formatCurrency(row.amountDue, row.currency)), 1)
                          ]),
                          _: 1
                        }, 8, ["rows"])
                      ])) : (openBlock(), createBlock("div", { key: 2 }, [
                        createVNode(_component_UTable, {
                          rows: unref(data)?.paid || [],
                          columns: [
                            { key: "number", label: "Invoice #" },
                            { key: "contact", label: "Customer" },
                            { key: "date", label: "Date" },
                            { key: "amountPaid", label: "Paid", class: "text-right" },
                            { key: "total", label: "Total", class: "text-right" }
                          ]
                        }, {
                          "amountPaid-data": withCtx(({ row }) => [
                            createVNode("span", { class: "text-right block" }, toDisplayString(formatCurrency(row.amountPaid, row.currency)), 1)
                          ]),
                          "total-data": withCtx(({ row }) => [
                            createVNode("span", { class: "text-right block" }, toDisplayString(formatCurrency(row.total, row.currency)), 1)
                          ]),
                          _: 1
                        }, 8, ["rows"])
                      ]))
                    ];
                  }
                }),
                _: 1
              }, _parent2, _scopeId));
            }
          } else {
            return [
              createVNode(_component_UPageHeader, {
                title: "Invoices",
                description: "Track outstanding, overdue, and paid invoices"
              }, {
                right: withCtx(() => [
                  createVNode(_component_UButton, {
                    label: "Refresh",
                    color: "neutral",
                    onClick: unref(refresh)
                  }, null, 8, ["onClick"])
                ]),
                _: 1
              }),
              unref(pending) ? (openBlock(), createBlock("div", { key: 0 }, "Loading invoices…")) : unref(error) ? (openBlock(), createBlock("div", { key: 1 }, "Failed to load invoices.")) : (openBlock(), createBlock(_component_UTabs, {
                key: 2,
                items: ["Outstanding", "Overdue", "Paid"],
                class: "mt-4"
              }, {
                item: withCtx(({ item }) => [
                  item === "Outstanding" ? (openBlock(), createBlock("div", { key: 0 }, [
                    createVNode(_component_UTable, {
                      rows: unref(data)?.outstanding || [],
                      columns: [
                        { key: "number", label: "Invoice #" },
                        { key: "contact", label: "Customer" },
                        { key: "date", label: "Date" },
                        { key: "dueDate", label: "Due" },
                        { key: "amountDue", label: "Amount Due", class: "text-right" }
                      ]
                    }, {
                      "amountDue-data": withCtx(({ row }) => [
                        createVNode("span", { class: "text-right block" }, toDisplayString(formatCurrency(row.amountDue, row.currency)), 1)
                      ]),
                      _: 1
                    }, 8, ["rows"])
                  ])) : item === "Overdue" ? (openBlock(), createBlock("div", { key: 1 }, [
                    createVNode(_component_UTable, {
                      rows: unref(data)?.overdue || [],
                      columns: [
                        { key: "number", label: "Invoice #" },
                        { key: "contact", label: "Customer" },
                        { key: "date", label: "Date" },
                        { key: "dueDate", label: "Due" },
                        { key: "amountDue", label: "Amount Due", class: "text-right" }
                      ]
                    }, {
                      "amountDue-data": withCtx(({ row }) => [
                        createVNode("span", { class: "text-right block" }, toDisplayString(formatCurrency(row.amountDue, row.currency)), 1)
                      ]),
                      _: 1
                    }, 8, ["rows"])
                  ])) : (openBlock(), createBlock("div", { key: 2 }, [
                    createVNode(_component_UTable, {
                      rows: unref(data)?.paid || [],
                      columns: [
                        { key: "number", label: "Invoice #" },
                        { key: "contact", label: "Customer" },
                        { key: "date", label: "Date" },
                        { key: "amountPaid", label: "Paid", class: "text-right" },
                        { key: "total", label: "Total", class: "text-right" }
                      ]
                    }, {
                      "amountPaid-data": withCtx(({ row }) => [
                        createVNode("span", { class: "text-right block" }, toDisplayString(formatCurrency(row.amountPaid, row.currency)), 1)
                      ]),
                      "total-data": withCtx(({ row }) => [
                        createVNode("span", { class: "text-right block" }, toDisplayString(formatCurrency(row.total, row.currency)), 1)
                      ]),
                      _: 1
                    }, 8, ["rows"])
                  ]))
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
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("pages/invoices/index.vue");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};

export { _sfc_main as default };
//# sourceMappingURL=index-D0ED9I5G.mjs.map
