import { _ as _sfc_main$1, a as _sfc_main$8 } from './DashboardNavbar-Dma8e2D0.mjs';
import { e as useFetch, _ as _sfc_main$e, d as _sfc_main$9 } from './server.mjs';
import { _ as _sfc_main$a } from './DashboardToolbar-C9qyFRVV.mjs';
import { _ as _sfc_main$b } from './Input-Bc3-FTjC.mjs';
import { _ as _sfc_main$c } from './SelectMenu-BG51Bku2.mjs';
import { _ as _sfc_main$2 } from './Skeleton-p2Vkb_Gp.mjs';
import { _ as _sfc_main$3 } from './Alert-CLlAchtu.mjs';
import { _ as _sfc_main$4 } from './Card-jqGRZ5Ik.mjs';
import { _ as _sfc_main$5 } from './Badge-BfrefdmG.mjs';
import { _ as _sfc_main$6 } from './Table-DItj4AHg.mjs';
import { _ as _sfc_main$7 } from './Pagination-UGRk5evm.mjs';
import { defineComponent, withAsyncContext, ref, computed, watch, mergeProps, withCtx, unref, createVNode, toDisplayString, createTextVNode, createBlock, createCommentVNode, openBlock, Fragment, renderList, isRef, useSSRContext } from 'vue';
import { ssrRenderComponent, ssrInterpolate, ssrRenderList, ssrRenderClass } from 'vue/server-renderer';
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

const pageSize = 20;
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "index",
  __ssrInlineRender: true,
  async setup(__props) {
    let __temp, __restore;
    const { data, pending, error, refresh } = ([__temp, __restore] = withAsyncContext(() => useFetch("/api/xero/invoices", "$nvmssuSe9Y")), __temp = await __temp, __restore(), __temp);
    const search = ref("");
    const selectedView = ref("all");
    const outstandingAging = ref("all");
    function formatCurrency(value, currency) {
      if (typeof value !== "number" || Number.isNaN(value)) return "-";
      return value.toLocaleString("en-US", { style: "currency", currency: currency || "USD", maximumFractionDigits: 0 });
    }
    function formatDate(value) {
      if (!value) return "-";
      const dt = new Date(value);
      if (Number.isNaN(dt.getTime())) return "-";
      return dt.toLocaleDateString(void 0, { month: "short", day: "numeric", year: "numeric" });
    }
    const summary = computed(() => data.value?.summary ?? null);
    const agingDetails = computed(() => summary.value?.agingDetails ?? null);
    const pageAll = ref(1);
    const pageOutstanding = ref(1);
    const pageOverdue = ref(1);
    const pagePaid = ref(1);
    const filteredOutstanding = computed(() => {
      const list = data.value?.outstanding ?? [];
      if (!search.value && outstandingAging.value === "all") return list;
      return list.filter((inv) => {
        const matchesSearch = search.value ? inv.number?.toLowerCase().includes(search.value.toLowerCase()) || inv.contact?.toLowerCase().includes(search.value.toLowerCase()) : true;
        if (!matchesSearch) return false;
        if (outstandingAging.value === "due_7") {
          return typeof inv.daysUntilDue === "number" && inv.daysUntilDue <= 7;
        }
        if (outstandingAging.value === "due_30") {
          return typeof inv.daysUntilDue === "number" && inv.daysUntilDue <= 30;
        }
        return true;
      });
    });
    const filteredOverdue = computed(() => {
      const list = data.value?.overdue ?? [];
      if (!search.value) return list;
      return list.filter((inv) => inv.number?.toLowerCase().includes(search.value.toLowerCase()) || inv.contact?.toLowerCase().includes(search.value.toLowerCase()));
    });
    const filteredPaid = computed(() => {
      const list = data.value?.paid ?? [];
      if (!search.value) return list;
      return list.filter((inv) => inv.number?.toLowerCase().includes(search.value.toLowerCase()) || inv.contact?.toLowerCase().includes(search.value.toLowerCase()));
    });
    const filteredAll = computed(() => {
      const combined = data.value?.all ?? [
        ...data.value?.outstanding ?? [],
        ...data.value?.overdue ?? [],
        ...data.value?.paid ?? []
      ];
      const list = Array.isArray(combined) ? [...combined] : [];
      if (!search.value) return list;
      return list.filter((inv) => inv.number?.toLowerCase().includes(search.value.toLowerCase()) || inv.contact?.toLowerCase().includes(search.value.toLowerCase()));
    });
    function paginate(rows, page) {
      const start = (page - 1) * pageSize;
      return rows.slice(start, start + pageSize);
    }
    const totalPagesAll = computed(() => Math.max(1, Math.ceil(filteredAll.value.length / pageSize)));
    const totalPagesOutstanding = computed(() => Math.max(1, Math.ceil(filteredOutstanding.value.length / pageSize)));
    const totalPagesOverdue = computed(() => Math.max(1, Math.ceil(filteredOverdue.value.length / pageSize)));
    const totalPagesPaid = computed(() => Math.max(1, Math.ceil(filteredPaid.value.length / pageSize)));
    const paginatedAll = computed(() => paginate(filteredAll.value, pageAll.value));
    const paginatedOutstanding = computed(() => paginate(filteredOutstanding.value, pageOutstanding.value));
    const paginatedOverdue = computed(() => paginate(filteredOverdue.value, pageOverdue.value));
    const paginatedPaid = computed(() => paginate(filteredPaid.value, pagePaid.value));
    watch(filteredAll, () => {
      if (pageAll.value > totalPagesAll.value) pageAll.value = 1;
    });
    watch(filteredOutstanding, () => {
      if (pageOutstanding.value > totalPagesOutstanding.value) pageOutstanding.value = 1;
    });
    watch(filteredOverdue, () => {
      if (pageOverdue.value > totalPagesOverdue.value) pageOverdue.value = 1;
    });
    watch(filteredPaid, () => {
      if (pagePaid.value > totalPagesPaid.value) pagePaid.value = 1;
    });
    watch(selectedView, (view) => {
      if (view === "all") pageAll.value = 1;
      if (view === "outstanding") pageOutstanding.value = 1;
      if (view === "overdue") pageOverdue.value = 1;
      if (view === "paid") pagePaid.value = 1;
    });
    const topCustomers = computed(() => summary.value?.topCustomers ?? []);
    const columnsOutstanding = [
      { id: "number", key: "number", label: "Invoice #" },
      { id: "contact", key: "contact", label: "Customer" },
      { id: "issued", key: "date", label: "Issued" },
      { id: "dueDate", key: "dueDate", label: "Due" },
      { id: "daysUntilDue", key: "daysUntilDue", label: "Days" },
      { id: "amountDue", key: "amountDue", label: "Amount Due", class: "text-right" }
    ];
    const columnsOverdue = [
      { id: "number", key: "number", label: "Invoice #" },
      { id: "contact", key: "contact", label: "Customer" },
      { id: "issued", key: "date", label: "Issued" },
      { id: "dueDate", key: "dueDate", label: "Due" },
      { id: "daysOverdue", key: "daysOverdue", label: "Days Overdue" },
      { id: "amountDue", key: "amountDue", label: "Amount Due", class: "text-right" }
    ];
    const columnsPaid = [
      { id: "number", key: "number", label: "Invoice #" },
      { id: "contact", key: "contact", label: "Customer" },
      { id: "issued", key: "date", label: "Issued" },
      { id: "paidOn", key: "fullyPaidOnDate", label: "Paid On" },
      { id: "daysToPay", key: "daysToPay", label: "Days to Pay" },
      { id: "total", key: "total", label: "Total", class: "text-right" }
    ];
    const columnsAll = [
      { id: "number", key: "number", label: "Invoice #" },
      { id: "contact", key: "contact", label: "Customer" },
      { id: "status", key: "status", label: "Status" },
      { id: "issued", key: "date", label: "Issued" },
      { id: "dueDate", key: "dueDate", label: "Due" },
      { id: "amount", key: "amountDue", label: "Balance", class: "text-right" }
    ];
    return (_ctx, _push, _parent, _attrs) => {
      const _component_UDashboardPanel = _sfc_main$1;
      const _component_UDashboardNavbar = _sfc_main$8;
      const _component_UButton = _sfc_main$9;
      const _component_UDashboardToolbar = _sfc_main$a;
      const _component_UInput = _sfc_main$b;
      const _component_USelectMenu = _sfc_main$c;
      const _component_USkeleton = _sfc_main$2;
      const _component_UAlert = _sfc_main$3;
      const _component_UCard = _sfc_main$4;
      const _component_UIcon = _sfc_main$e;
      const _component_UBadge = _sfc_main$5;
      const _component_UTable = _sfc_main$6;
      const _component_UPagination = _sfc_main$7;
      _push(ssrRenderComponent(_component_UDashboardPanel, mergeProps({ id: "invoices" }, _attrs), {
        header: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            _push2(ssrRenderComponent(_component_UDashboardNavbar, {
              title: "Invoices",
              description: "Track outstanding balances, overdue risk, and recent payments"
            }, {
              right: withCtx((_2, _push3, _parent3, _scopeId2) => {
                if (_push3) {
                  _push3(ssrRenderComponent(_component_UButton, {
                    label: "Refresh",
                    color: "neutral",
                    icon: "i-lucide-refresh-cw",
                    onClick: unref(refresh),
                    loading: unref(pending)
                  }, null, _parent3, _scopeId2));
                } else {
                  return [
                    createVNode(_component_UButton, {
                      label: "Refresh",
                      color: "neutral",
                      icon: "i-lucide-refresh-cw",
                      onClick: unref(refresh),
                      loading: unref(pending)
                    }, null, 8, ["onClick", "loading"])
                  ];
                }
              }),
              _: 1
            }, _parent2, _scopeId));
            _push2(ssrRenderComponent(_component_UDashboardToolbar, null, {
              left: withCtx((_2, _push3, _parent3, _scopeId2) => {
                if (_push3) {
                  _push3(ssrRenderComponent(_component_UInput, {
                    modelValue: unref(search),
                    "onUpdate:modelValue": ($event) => isRef(search) ? search.value = $event : null,
                    placeholder: "Search invoices or customers",
                    icon: "i-lucide-search",
                    clearable: ""
                  }, null, _parent3, _scopeId2));
                  if (unref(selectedView) === "outstanding") {
                    _push3(ssrRenderComponent(_component_USelectMenu, {
                      modelValue: unref(outstandingAging),
                      "onUpdate:modelValue": ($event) => isRef(outstandingAging) ? outstandingAging.value = $event : null,
                      options: [
                        { label: "All Upcoming", value: "all" },
                        { label: "Due in 7 days", value: "due_7" },
                        { label: "Due in 30 days", value: "due_30" }
                      ],
                      class: "w-40"
                    }, null, _parent3, _scopeId2));
                  } else {
                    _push3(`<!---->`);
                  }
                } else {
                  return [
                    createVNode(_component_UInput, {
                      modelValue: unref(search),
                      "onUpdate:modelValue": ($event) => isRef(search) ? search.value = $event : null,
                      placeholder: "Search invoices or customers",
                      icon: "i-lucide-search",
                      clearable: ""
                    }, null, 8, ["modelValue", "onUpdate:modelValue"]),
                    unref(selectedView) === "outstanding" ? (openBlock(), createBlock(_component_USelectMenu, {
                      key: 0,
                      modelValue: unref(outstandingAging),
                      "onUpdate:modelValue": ($event) => isRef(outstandingAging) ? outstandingAging.value = $event : null,
                      options: [
                        { label: "All Upcoming", value: "all" },
                        { label: "Due in 7 days", value: "due_7" },
                        { label: "Due in 30 days", value: "due_30" }
                      ],
                      class: "w-40"
                    }, null, 8, ["modelValue", "onUpdate:modelValue"])) : createCommentVNode("", true)
                  ];
                }
              }),
              right: withCtx((_2, _push3, _parent3, _scopeId2) => {
                if (_push3) {
                  _push3(`<div class="inline-flex items-center gap-2"${_scopeId2}>`);
                  _push3(ssrRenderComponent(_component_UButton, {
                    variant: unref(selectedView) === "all" ? "solid" : "ghost",
                    icon: "i-lucide-layers",
                    onClick: ($event) => selectedView.value = "all"
                  }, {
                    default: withCtx((_3, _push4, _parent4, _scopeId3) => {
                      if (_push4) {
                        _push4(`All`);
                      } else {
                        return [
                          createTextVNode("All")
                        ];
                      }
                    }),
                    _: 1
                  }, _parent3, _scopeId2));
                  _push3(ssrRenderComponent(_component_UButton, {
                    variant: unref(selectedView) === "outstanding" ? "solid" : "ghost",
                    icon: "i-lucide-calendar-clock",
                    onClick: ($event) => selectedView.value = "outstanding"
                  }, {
                    default: withCtx((_3, _push4, _parent4, _scopeId3) => {
                      if (_push4) {
                        _push4(`Outstanding`);
                      } else {
                        return [
                          createTextVNode("Outstanding")
                        ];
                      }
                    }),
                    _: 1
                  }, _parent3, _scopeId2));
                  _push3(ssrRenderComponent(_component_UButton, {
                    variant: unref(selectedView) === "overdue" ? "solid" : "ghost",
                    icon: "i-lucide-alarm-minus",
                    color: "red",
                    onClick: ($event) => selectedView.value = "overdue"
                  }, {
                    default: withCtx((_3, _push4, _parent4, _scopeId3) => {
                      if (_push4) {
                        _push4(`Overdue`);
                      } else {
                        return [
                          createTextVNode("Overdue")
                        ];
                      }
                    }),
                    _: 1
                  }, _parent3, _scopeId2));
                  _push3(ssrRenderComponent(_component_UButton, {
                    variant: unref(selectedView) === "paid" ? "solid" : "ghost",
                    icon: "i-lucide-badge-check",
                    color: "emerald",
                    onClick: ($event) => selectedView.value = "paid"
                  }, {
                    default: withCtx((_3, _push4, _parent4, _scopeId3) => {
                      if (_push4) {
                        _push4(`Paid`);
                      } else {
                        return [
                          createTextVNode("Paid")
                        ];
                      }
                    }),
                    _: 1
                  }, _parent3, _scopeId2));
                  _push3(`</div>`);
                } else {
                  return [
                    createVNode("div", { class: "inline-flex items-center gap-2" }, [
                      createVNode(_component_UButton, {
                        variant: unref(selectedView) === "all" ? "solid" : "ghost",
                        icon: "i-lucide-layers",
                        onClick: ($event) => selectedView.value = "all"
                      }, {
                        default: withCtx(() => [
                          createTextVNode("All")
                        ]),
                        _: 1
                      }, 8, ["variant", "onClick"]),
                      createVNode(_component_UButton, {
                        variant: unref(selectedView) === "outstanding" ? "solid" : "ghost",
                        icon: "i-lucide-calendar-clock",
                        onClick: ($event) => selectedView.value = "outstanding"
                      }, {
                        default: withCtx(() => [
                          createTextVNode("Outstanding")
                        ]),
                        _: 1
                      }, 8, ["variant", "onClick"]),
                      createVNode(_component_UButton, {
                        variant: unref(selectedView) === "overdue" ? "solid" : "ghost",
                        icon: "i-lucide-alarm-minus",
                        color: "red",
                        onClick: ($event) => selectedView.value = "overdue"
                      }, {
                        default: withCtx(() => [
                          createTextVNode("Overdue")
                        ]),
                        _: 1
                      }, 8, ["variant", "onClick"]),
                      createVNode(_component_UButton, {
                        variant: unref(selectedView) === "paid" ? "solid" : "ghost",
                        icon: "i-lucide-badge-check",
                        color: "emerald",
                        onClick: ($event) => selectedView.value = "paid"
                      }, {
                        default: withCtx(() => [
                          createTextVNode("Paid")
                        ]),
                        _: 1
                      }, 8, ["variant", "onClick"])
                    ])
                  ];
                }
              }),
              _: 1
            }, _parent2, _scopeId));
          } else {
            return [
              createVNode(_component_UDashboardNavbar, {
                title: "Invoices",
                description: "Track outstanding balances, overdue risk, and recent payments"
              }, {
                right: withCtx(() => [
                  createVNode(_component_UButton, {
                    label: "Refresh",
                    color: "neutral",
                    icon: "i-lucide-refresh-cw",
                    onClick: unref(refresh),
                    loading: unref(pending)
                  }, null, 8, ["onClick", "loading"])
                ]),
                _: 1
              }),
              createVNode(_component_UDashboardToolbar, null, {
                left: withCtx(() => [
                  createVNode(_component_UInput, {
                    modelValue: unref(search),
                    "onUpdate:modelValue": ($event) => isRef(search) ? search.value = $event : null,
                    placeholder: "Search invoices or customers",
                    icon: "i-lucide-search",
                    clearable: ""
                  }, null, 8, ["modelValue", "onUpdate:modelValue"]),
                  unref(selectedView) === "outstanding" ? (openBlock(), createBlock(_component_USelectMenu, {
                    key: 0,
                    modelValue: unref(outstandingAging),
                    "onUpdate:modelValue": ($event) => isRef(outstandingAging) ? outstandingAging.value = $event : null,
                    options: [
                      { label: "All Upcoming", value: "all" },
                      { label: "Due in 7 days", value: "due_7" },
                      { label: "Due in 30 days", value: "due_30" }
                    ],
                    class: "w-40"
                  }, null, 8, ["modelValue", "onUpdate:modelValue"])) : createCommentVNode("", true)
                ]),
                right: withCtx(() => [
                  createVNode("div", { class: "inline-flex items-center gap-2" }, [
                    createVNode(_component_UButton, {
                      variant: unref(selectedView) === "all" ? "solid" : "ghost",
                      icon: "i-lucide-layers",
                      onClick: ($event) => selectedView.value = "all"
                    }, {
                      default: withCtx(() => [
                        createTextVNode("All")
                      ]),
                      _: 1
                    }, 8, ["variant", "onClick"]),
                    createVNode(_component_UButton, {
                      variant: unref(selectedView) === "outstanding" ? "solid" : "ghost",
                      icon: "i-lucide-calendar-clock",
                      onClick: ($event) => selectedView.value = "outstanding"
                    }, {
                      default: withCtx(() => [
                        createTextVNode("Outstanding")
                      ]),
                      _: 1
                    }, 8, ["variant", "onClick"]),
                    createVNode(_component_UButton, {
                      variant: unref(selectedView) === "overdue" ? "solid" : "ghost",
                      icon: "i-lucide-alarm-minus",
                      color: "red",
                      onClick: ($event) => selectedView.value = "overdue"
                    }, {
                      default: withCtx(() => [
                        createTextVNode("Overdue")
                      ]),
                      _: 1
                    }, 8, ["variant", "onClick"]),
                    createVNode(_component_UButton, {
                      variant: unref(selectedView) === "paid" ? "solid" : "ghost",
                      icon: "i-lucide-badge-check",
                      color: "emerald",
                      onClick: ($event) => selectedView.value = "paid"
                    }, {
                      default: withCtx(() => [
                        createTextVNode("Paid")
                      ]),
                      _: 1
                    }, 8, ["variant", "onClick"])
                  ])
                ]),
                _: 1
              })
            ];
          }
        }),
        body: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            if (unref(pending)) {
              _push2(`<div class="space-y-4"${_scopeId}>`);
              _push2(ssrRenderComponent(_component_USkeleton, { class: "h-32" }, null, _parent2, _scopeId));
              _push2(ssrRenderComponent(_component_USkeleton, { class: "h-80" }, null, _parent2, _scopeId));
              _push2(`</div>`);
            } else if (unref(error)) {
              _push2(ssrRenderComponent(_component_UAlert, {
                icon: "i-lucide-alert-octagon",
                color: "red",
                variant: "subtle",
                title: "Unable to load invoices",
                description: unref(error).statusMessage || "Please try refreshing."
              }, null, _parent2, _scopeId));
            } else {
              _push2(`<div class="space-y-6"${_scopeId}><div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4"${_scopeId}>`);
              _push2(ssrRenderComponent(_component_UCard, null, {
                default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                  if (_push3) {
                    _push3(`<div class="flex items-center justify-between"${_scopeId2}><div${_scopeId2}><p class="text-sm text-muted"${_scopeId2}>Outstanding Balance</p><p class="text-2xl font-bold"${_scopeId2}>${ssrInterpolate(formatCurrency(unref(summary)?.outstandingTotal))}</p></div>`);
                    _push3(ssrRenderComponent(_component_UIcon, {
                      name: "i-lucide-file-text",
                      class: "h-7 w-7 text-emerald-500"
                    }, null, _parent3, _scopeId2));
                    _push3(`</div><p class="text-xs text-muted mt-2"${_scopeId2}>${ssrInterpolate(unref(summary)?.outstandingCount || 0)} invoices with open balances</p>`);
                  } else {
                    return [
                      createVNode("div", { class: "flex items-center justify-between" }, [
                        createVNode("div", null, [
                          createVNode("p", { class: "text-sm text-muted" }, "Outstanding Balance"),
                          createVNode("p", { class: "text-2xl font-bold" }, toDisplayString(formatCurrency(unref(summary)?.outstandingTotal)), 1)
                        ]),
                        createVNode(_component_UIcon, {
                          name: "i-lucide-file-text",
                          class: "h-7 w-7 text-emerald-500"
                        })
                      ]),
                      createVNode("p", { class: "text-xs text-muted mt-2" }, toDisplayString(unref(summary)?.outstandingCount || 0) + " invoices with open balances", 1)
                    ];
                  }
                }),
                _: 1
              }, _parent2, _scopeId));
              _push2(ssrRenderComponent(_component_UCard, null, {
                default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                  if (_push3) {
                    _push3(`<div class="flex items-center justify-between"${_scopeId2}><div${_scopeId2}><p class="text-sm text-muted"${_scopeId2}>Overdue Balance</p><p class="text-2xl font-bold text-red-600"${_scopeId2}>${ssrInterpolate(formatCurrency(unref(summary)?.overdueTotal))}</p></div>`);
                    _push3(ssrRenderComponent(_component_UIcon, {
                      name: "i-lucide-alert-triangle",
                      class: "h-7 w-7 text-red-500"
                    }, null, _parent3, _scopeId2));
                    _push3(`</div><p class="text-xs text-muted mt-2"${_scopeId2}>${ssrInterpolate(unref(summary)?.overdueCount || 0)} invoices past due</p>`);
                  } else {
                    return [
                      createVNode("div", { class: "flex items-center justify-between" }, [
                        createVNode("div", null, [
                          createVNode("p", { class: "text-sm text-muted" }, "Overdue Balance"),
                          createVNode("p", { class: "text-2xl font-bold text-red-600" }, toDisplayString(formatCurrency(unref(summary)?.overdueTotal)), 1)
                        ]),
                        createVNode(_component_UIcon, {
                          name: "i-lucide-alert-triangle",
                          class: "h-7 w-7 text-red-500"
                        })
                      ]),
                      createVNode("p", { class: "text-xs text-muted mt-2" }, toDisplayString(unref(summary)?.overdueCount || 0) + " invoices past due", 1)
                    ];
                  }
                }),
                _: 1
              }, _parent2, _scopeId));
              _push2(ssrRenderComponent(_component_UCard, null, {
                default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                  if (_push3) {
                    _push3(`<div class="flex items-center justify-between"${_scopeId2}><div${_scopeId2}><p class="text-sm text-muted"${_scopeId2}>Due in 7 days</p><p class="text-2xl font-bold text-amber-600"${_scopeId2}>${ssrInterpolate(formatCurrency(unref(summary)?.dueSoonTotal))}</p></div>`);
                    _push3(ssrRenderComponent(_component_UIcon, {
                      name: "i-lucide-hourglass",
                      class: "h-7 w-7 text-amber-500"
                    }, null, _parent3, _scopeId2));
                    _push3(`</div><p class="text-xs text-muted mt-2"${_scopeId2}>Upcoming cash expected this week</p>`);
                  } else {
                    return [
                      createVNode("div", { class: "flex items-center justify-between" }, [
                        createVNode("div", null, [
                          createVNode("p", { class: "text-sm text-muted" }, "Due in 7 days"),
                          createVNode("p", { class: "text-2xl font-bold text-amber-600" }, toDisplayString(formatCurrency(unref(summary)?.dueSoonTotal)), 1)
                        ]),
                        createVNode(_component_UIcon, {
                          name: "i-lucide-hourglass",
                          class: "h-7 w-7 text-amber-500"
                        })
                      ]),
                      createVNode("p", { class: "text-xs text-muted mt-2" }, "Upcoming cash expected this week")
                    ];
                  }
                }),
                _: 1
              }, _parent2, _scopeId));
              _push2(ssrRenderComponent(_component_UCard, null, {
                default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                  if (_push3) {
                    _push3(`<div class="flex items-center justify-between"${_scopeId2}><div${_scopeId2}><p class="text-sm text-muted"${_scopeId2}>Paid Last 30 Days</p><p class="text-2xl font-bold text-emerald-600"${_scopeId2}>${ssrInterpolate(formatCurrency(unref(summary)?.paidLast30Total))}</p></div>`);
                    _push3(ssrRenderComponent(_component_UIcon, {
                      name: "i-lucide-badge-check",
                      class: "h-7 w-7 text-emerald-500"
                    }, null, _parent3, _scopeId2));
                    _push3(`</div><p class="text-xs text-muted mt-2"${_scopeId2}>${ssrInterpolate(unref(summary)?.paidLast30Count || 0)} invoices closed recently</p>`);
                  } else {
                    return [
                      createVNode("div", { class: "flex items-center justify-between" }, [
                        createVNode("div", null, [
                          createVNode("p", { class: "text-sm text-muted" }, "Paid Last 30 Days"),
                          createVNode("p", { class: "text-2xl font-bold text-emerald-600" }, toDisplayString(formatCurrency(unref(summary)?.paidLast30Total)), 1)
                        ]),
                        createVNode(_component_UIcon, {
                          name: "i-lucide-badge-check",
                          class: "h-7 w-7 text-emerald-500"
                        })
                      ]),
                      createVNode("p", { class: "text-xs text-muted mt-2" }, toDisplayString(unref(summary)?.paidLast30Count || 0) + " invoices closed recently", 1)
                    ];
                  }
                }),
                _: 1
              }, _parent2, _scopeId));
              _push2(`</div><div class="grid grid-cols-1 lg:grid-cols-3 gap-4"${_scopeId}>`);
              _push2(ssrRenderComponent(_component_UCard, { class: "lg:col-span-2" }, {
                header: withCtx((_2, _push3, _parent3, _scopeId2) => {
                  if (_push3) {
                    _push3(`<h3 class="text-base font-semibold"${_scopeId2}>Invoice Aging Overview</h3>`);
                  } else {
                    return [
                      createVNode("h3", { class: "text-base font-semibold" }, "Invoice Aging Overview")
                    ];
                  }
                }),
                default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                  if (_push3) {
                    _push3(`<div class="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm"${_scopeId2}><div class="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/20"${_scopeId2}><p class="text-muted text-xs uppercase tracking-wide"${_scopeId2}>Current</p><p class="text-lg font-semibold"${_scopeId2}>${ssrInterpolate(unref(summary)?.agingBuckets?.current ?? 0)}</p><p class="text-xs text-muted"${_scopeId2}>Not yet due</p></div><div class="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20"${_scopeId2}><p class="text-muted text-xs uppercase tracking-wide"${_scopeId2}>Due &lt;= 7 days</p><p class="text-lg font-semibold"${_scopeId2}>${ssrInterpolate(unref(summary)?.agingBuckets?.dueSoon ?? 0)}</p><p class="text-xs text-muted"${_scopeId2}>Requires follow-up</p></div><div class="p-3 rounded-lg bg-red-50 dark:bg-red-950/20"${_scopeId2}><p class="text-muted text-xs uppercase tracking-wide"${_scopeId2}>Overdue ≤ 7 days</p><p class="text-lg font-semibold"${_scopeId2}>${ssrInterpolate(unref(summary)?.agingBuckets?.overdue7 ?? unref(summary)?.agingBuckets?.bucket1 ?? 0)}</p><p class="text-xs text-muted"${_scopeId2}>Recently late</p></div><div class="p-3 rounded-lg bg-red-50/90 dark:bg-red-950/40"${_scopeId2}><p class="text-muted text-xs uppercase tracking-wide"${_scopeId2}>Overdue 8-14 days</p><p class="text-lg font-semibold"${_scopeId2}>${ssrInterpolate(unref(summary)?.agingBuckets?.overdue14 ?? unref(summary)?.agingBuckets?.bucket2 ?? 0)}</p><p class="text-xs text-muted"${_scopeId2}>Watch closely</p></div><div class="p-3 rounded-lg bg-red-100 dark:bg-red-950/60"${_scopeId2}><p class="text-muted text-xs uppercase tracking-wide"${_scopeId2}>Overdue 15-30 days</p><p class="text-lg font-semibold"${_scopeId2}>${ssrInterpolate(unref(summary)?.agingBuckets?.overdue30 ?? unref(summary)?.agingBuckets?.bucket3 ?? 0)}</p><p class="text-xs text-muted"${_scopeId2}>Escalate if needed</p></div><div class="p-3 rounded-lg bg-red-200 dark:bg-red-900/80"${_scopeId2}><p class="text-muted text-xs uppercase tracking-wide"${_scopeId2}>Overdue 30+ days</p><p class="text-lg font-semibold"${_scopeId2}>${ssrInterpolate(unref(summary)?.agingBuckets?.overdue60 ?? unref(summary)?.agingBuckets?.bucket4 ?? 0)}</p><p class="text-xs text-muted"${_scopeId2}>High risk</p></div></div>`);
                    if (unref(agingDetails)) {
                      _push3(`<div class="mt-6 space-y-6 text-sm"${_scopeId2}><!--[-->`);
                      ssrRenderList([
                        { key: "current", title: "Due in 30+ days", color: "text-muted", helper: "Planned future billing" },
                        { key: "dueSoon", title: "Due within 7 days", color: "text-amber-600", helper: "Reach out before due date" },
                        { key: "due30", title: "Due in 8-30 days", color: "text-muted", helper: "Plan follow-up next" },
                        { key: "overdue7", title: "Overdue 1-7 days", color: "text-red-500", helper: "Send gentle reminder" },
                        { key: "overdue14", title: "Overdue 8-14 days", color: "text-red-500", helper: "Escalate with account owner" },
                        { key: "overdue30", title: "Overdue 15-30 days", color: "text-red-600", helper: "Consider payment plan" },
                        { key: "overdue60", title: "Overdue 30+ days", color: "text-red-700", helper: "High risk – collections?" }
                      ], (section) => {
                        _push3(`<!--[-->`);
                        if (unref(agingDetails)?.[section.key]?.length) {
                          _push3(`<div${_scopeId2}><div class="flex items-center justify-between"${_scopeId2}><div${_scopeId2}><p class="${ssrRenderClass([section.color, "font-semibold"])}"${_scopeId2}>${ssrInterpolate(section.title)}</p><p class="text-xs text-muted"${_scopeId2}>${ssrInterpolate(section.helper)}</p></div>`);
                          _push3(ssrRenderComponent(_component_UBadge, {
                            color: "neutral",
                            variant: "subtle"
                          }, {
                            default: withCtx((_3, _push4, _parent4, _scopeId3) => {
                              if (_push4) {
                                _push4(`${ssrInterpolate(unref(agingDetails)?.[section.key]?.length)}`);
                              } else {
                                return [
                                  createTextVNode(toDisplayString(unref(agingDetails)?.[section.key]?.length), 1)
                                ];
                              }
                            }),
                            _: 2
                          }, _parent3, _scopeId2));
                          _push3(`</div><div class="mt-3 space-y-2"${_scopeId2}><!--[-->`);
                          ssrRenderList(unref(agingDetails)?.[section.key] || [], (inv) => {
                            _push3(`<div class="flex items-start justify-between rounded border border-default bg-white/70 dark:bg-white/5 px-3 py-2"${_scopeId2}><div${_scopeId2}><p class="font-medium"${_scopeId2}>${ssrInterpolate(inv.number)}</p><p class="text-xs text-muted"${_scopeId2}>${ssrInterpolate(inv.contact)} · Due ${ssrInterpolate(formatDate(inv.dueDate))}</p></div><div class="text-right"${_scopeId2}><p class="${ssrRenderClass([section.key.includes("overdue") ? "text-red-600" : "text-emerald-600", "font-semibold"])}"${_scopeId2}>${ssrInterpolate(formatCurrency(inv.amountDue, inv.currency))}</p><p class="text-xs text-muted"${_scopeId2}>${ssrInterpolate(section.key.includes("overdue") ? `${inv.daysOverdue ?? 0} days overdue` : `${inv.daysUntilDue ?? 0} days`)}</p></div></div>`);
                          });
                          _push3(`<!--]--></div></div>`);
                        } else {
                          _push3(`<!---->`);
                        }
                        _push3(`<!--]-->`);
                      });
                      _push3(`<!--]--></div>`);
                    } else {
                      _push3(`<!---->`);
                    }
                  } else {
                    return [
                      createVNode("div", { class: "grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm" }, [
                        createVNode("div", { class: "p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/20" }, [
                          createVNode("p", { class: "text-muted text-xs uppercase tracking-wide" }, "Current"),
                          createVNode("p", { class: "text-lg font-semibold" }, toDisplayString(unref(summary)?.agingBuckets?.current ?? 0), 1),
                          createVNode("p", { class: "text-xs text-muted" }, "Not yet due")
                        ]),
                        createVNode("div", { class: "p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20" }, [
                          createVNode("p", { class: "text-muted text-xs uppercase tracking-wide" }, "Due <= 7 days"),
                          createVNode("p", { class: "text-lg font-semibold" }, toDisplayString(unref(summary)?.agingBuckets?.dueSoon ?? 0), 1),
                          createVNode("p", { class: "text-xs text-muted" }, "Requires follow-up")
                        ]),
                        createVNode("div", { class: "p-3 rounded-lg bg-red-50 dark:bg-red-950/20" }, [
                          createVNode("p", { class: "text-muted text-xs uppercase tracking-wide" }, "Overdue ≤ 7 days"),
                          createVNode("p", { class: "text-lg font-semibold" }, toDisplayString(unref(summary)?.agingBuckets?.overdue7 ?? unref(summary)?.agingBuckets?.bucket1 ?? 0), 1),
                          createVNode("p", { class: "text-xs text-muted" }, "Recently late")
                        ]),
                        createVNode("div", { class: "p-3 rounded-lg bg-red-50/90 dark:bg-red-950/40" }, [
                          createVNode("p", { class: "text-muted text-xs uppercase tracking-wide" }, "Overdue 8-14 days"),
                          createVNode("p", { class: "text-lg font-semibold" }, toDisplayString(unref(summary)?.agingBuckets?.overdue14 ?? unref(summary)?.agingBuckets?.bucket2 ?? 0), 1),
                          createVNode("p", { class: "text-xs text-muted" }, "Watch closely")
                        ]),
                        createVNode("div", { class: "p-3 rounded-lg bg-red-100 dark:bg-red-950/60" }, [
                          createVNode("p", { class: "text-muted text-xs uppercase tracking-wide" }, "Overdue 15-30 days"),
                          createVNode("p", { class: "text-lg font-semibold" }, toDisplayString(unref(summary)?.agingBuckets?.overdue30 ?? unref(summary)?.agingBuckets?.bucket3 ?? 0), 1),
                          createVNode("p", { class: "text-xs text-muted" }, "Escalate if needed")
                        ]),
                        createVNode("div", { class: "p-3 rounded-lg bg-red-200 dark:bg-red-900/80" }, [
                          createVNode("p", { class: "text-muted text-xs uppercase tracking-wide" }, "Overdue 30+ days"),
                          createVNode("p", { class: "text-lg font-semibold" }, toDisplayString(unref(summary)?.agingBuckets?.overdue60 ?? unref(summary)?.agingBuckets?.bucket4 ?? 0), 1),
                          createVNode("p", { class: "text-xs text-muted" }, "High risk")
                        ])
                      ]),
                      unref(agingDetails) ? (openBlock(), createBlock("div", {
                        key: 0,
                        class: "mt-6 space-y-6 text-sm"
                      }, [
                        (openBlock(), createBlock(Fragment, null, renderList([
                          { key: "current", title: "Due in 30+ days", color: "text-muted", helper: "Planned future billing" },
                          { key: "dueSoon", title: "Due within 7 days", color: "text-amber-600", helper: "Reach out before due date" },
                          { key: "due30", title: "Due in 8-30 days", color: "text-muted", helper: "Plan follow-up next" },
                          { key: "overdue7", title: "Overdue 1-7 days", color: "text-red-500", helper: "Send gentle reminder" },
                          { key: "overdue14", title: "Overdue 8-14 days", color: "text-red-500", helper: "Escalate with account owner" },
                          { key: "overdue30", title: "Overdue 15-30 days", color: "text-red-600", helper: "Consider payment plan" },
                          { key: "overdue60", title: "Overdue 30+ days", color: "text-red-700", helper: "High risk – collections?" }
                        ], (section) => {
                          return openBlock(), createBlock(Fragment, null, [
                            unref(agingDetails)?.[section.key]?.length ? (openBlock(), createBlock("div", {
                              key: section.key
                            }, [
                              createVNode("div", { class: "flex items-center justify-between" }, [
                                createVNode("div", null, [
                                  createVNode("p", {
                                    class: ["font-semibold", section.color]
                                  }, toDisplayString(section.title), 3),
                                  createVNode("p", { class: "text-xs text-muted" }, toDisplayString(section.helper), 1)
                                ]),
                                createVNode(_component_UBadge, {
                                  color: "neutral",
                                  variant: "subtle"
                                }, {
                                  default: withCtx(() => [
                                    createTextVNode(toDisplayString(unref(agingDetails)?.[section.key]?.length), 1)
                                  ]),
                                  _: 2
                                }, 1024)
                              ]),
                              createVNode("div", { class: "mt-3 space-y-2" }, [
                                (openBlock(true), createBlock(Fragment, null, renderList(unref(agingDetails)?.[section.key] || [], (inv) => {
                                  return openBlock(), createBlock("div", {
                                    key: inv.id,
                                    class: "flex items-start justify-between rounded border border-default bg-white/70 dark:bg-white/5 px-3 py-2"
                                  }, [
                                    createVNode("div", null, [
                                      createVNode("p", { class: "font-medium" }, toDisplayString(inv.number), 1),
                                      createVNode("p", { class: "text-xs text-muted" }, toDisplayString(inv.contact) + " · Due " + toDisplayString(formatDate(inv.dueDate)), 1)
                                    ]),
                                    createVNode("div", { class: "text-right" }, [
                                      createVNode("p", {
                                        class: ["font-semibold", section.key.includes("overdue") ? "text-red-600" : "text-emerald-600"]
                                      }, toDisplayString(formatCurrency(inv.amountDue, inv.currency)), 3),
                                      createVNode("p", { class: "text-xs text-muted" }, toDisplayString(section.key.includes("overdue") ? `${inv.daysOverdue ?? 0} days overdue` : `${inv.daysUntilDue ?? 0} days`), 1)
                                    ])
                                  ]);
                                }), 128))
                              ])
                            ])) : createCommentVNode("", true)
                          ], 64);
                        }), 64))
                      ])) : createCommentVNode("", true)
                    ];
                  }
                }),
                _: 1
              }, _parent2, _scopeId));
              _push2(ssrRenderComponent(_component_UCard, null, {
                header: withCtx((_2, _push3, _parent3, _scopeId2) => {
                  if (_push3) {
                    _push3(`<div class="flex items-center justify-between"${_scopeId2}><h3 class="text-base font-semibold"${_scopeId2}>Top Outstanding Clients</h3>`);
                    if (unref(summary)?.topCustomers?.length) {
                      _push3(ssrRenderComponent(_component_UBadge, {
                        color: "neutral",
                        variant: "subtle"
                      }, {
                        default: withCtx((_3, _push4, _parent4, _scopeId3) => {
                          if (_push4) {
                            _push4(`${ssrInterpolate(unref(summary)?.topCustomers?.length)} listed`);
                          } else {
                            return [
                              createTextVNode(toDisplayString(unref(summary)?.topCustomers?.length) + " listed", 1)
                            ];
                          }
                        }),
                        _: 1
                      }, _parent3, _scopeId2));
                    } else {
                      _push3(`<!---->`);
                    }
                    _push3(`</div>`);
                  } else {
                    return [
                      createVNode("div", { class: "flex items-center justify-between" }, [
                        createVNode("h3", { class: "text-base font-semibold" }, "Top Outstanding Clients"),
                        unref(summary)?.topCustomers?.length ? (openBlock(), createBlock(_component_UBadge, {
                          key: 0,
                          color: "neutral",
                          variant: "subtle"
                        }, {
                          default: withCtx(() => [
                            createTextVNode(toDisplayString(unref(summary)?.topCustomers?.length) + " listed", 1)
                          ]),
                          _: 1
                        })) : createCommentVNode("", true)
                      ])
                    ];
                  }
                }),
                default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                  if (_push3) {
                    _push3(`<div class="space-y-3"${_scopeId2}><!--[-->`);
                    ssrRenderList(unref(topCustomers), (client) => {
                      _push3(`<div class="p-3 rounded-lg border border-default bg-white/70 dark:bg-white/5"${_scopeId2}><div class="flex items-center justify-between"${_scopeId2}><p class="font-medium"${_scopeId2}>${ssrInterpolate(client.name)}</p><span class="text-xs text-muted"${_scopeId2}>${ssrInterpolate(client.count)} invoices</span></div><div class="flex items-center justify-between text-sm mt-1"${_scopeId2}><span class="text-muted"${_scopeId2}>Outstanding</span><span class="font-semibold"${_scopeId2}>${ssrInterpolate(formatCurrency(client.outstanding))}</span></div>`);
                      if (client.overdue) {
                        _push3(`<div class="flex items-center justify-between text-xs text-red-500"${_scopeId2}><span${_scopeId2}>Overdue</span><span class="font-medium"${_scopeId2}>${ssrInterpolate(formatCurrency(client.overdue))}</span></div>`);
                      } else {
                        _push3(`<!---->`);
                      }
                      _push3(`<div class="mt-2 flex gap-2"${_scopeId2}>`);
                      _push3(ssrRenderComponent(_component_UButton, {
                        size: "xs",
                        variant: "ghost",
                        icon: "i-lucide-mail",
                        color: "neutral"
                      }, {
                        default: withCtx((_3, _push4, _parent4, _scopeId3) => {
                          if (_push4) {
                            _push4(`Send reminder`);
                          } else {
                            return [
                              createTextVNode("Send reminder")
                            ];
                          }
                        }),
                        _: 2
                      }, _parent3, _scopeId2));
                      _push3(ssrRenderComponent(_component_UButton, {
                        size: "xs",
                        variant: "ghost",
                        icon: "i-lucide-clipboard-list",
                        color: "neutral"
                      }, {
                        default: withCtx((_3, _push4, _parent4, _scopeId3) => {
                          if (_push4) {
                            _push4(`View account`);
                          } else {
                            return [
                              createTextVNode("View account")
                            ];
                          }
                        }),
                        _: 2
                      }, _parent3, _scopeId2));
                      _push3(`</div></div>`);
                    });
                    _push3(`<!--]-->`);
                    if (!unref(topCustomers).length) {
                      _push3(`<p class="text-sm text-muted text-center"${_scopeId2}>No outstanding clients—nice work!</p>`);
                    } else {
                      _push3(`<!---->`);
                    }
                    _push3(`</div>`);
                  } else {
                    return [
                      createVNode("div", { class: "space-y-3" }, [
                        (openBlock(true), createBlock(Fragment, null, renderList(unref(topCustomers), (client) => {
                          return openBlock(), createBlock("div", {
                            key: client.name,
                            class: "p-3 rounded-lg border border-default bg-white/70 dark:bg-white/5"
                          }, [
                            createVNode("div", { class: "flex items-center justify-between" }, [
                              createVNode("p", { class: "font-medium" }, toDisplayString(client.name), 1),
                              createVNode("span", { class: "text-xs text-muted" }, toDisplayString(client.count) + " invoices", 1)
                            ]),
                            createVNode("div", { class: "flex items-center justify-between text-sm mt-1" }, [
                              createVNode("span", { class: "text-muted" }, "Outstanding"),
                              createVNode("span", { class: "font-semibold" }, toDisplayString(formatCurrency(client.outstanding)), 1)
                            ]),
                            client.overdue ? (openBlock(), createBlock("div", {
                              key: 0,
                              class: "flex items-center justify-between text-xs text-red-500"
                            }, [
                              createVNode("span", null, "Overdue"),
                              createVNode("span", { class: "font-medium" }, toDisplayString(formatCurrency(client.overdue)), 1)
                            ])) : createCommentVNode("", true),
                            createVNode("div", { class: "mt-2 flex gap-2" }, [
                              createVNode(_component_UButton, {
                                size: "xs",
                                variant: "ghost",
                                icon: "i-lucide-mail",
                                color: "neutral"
                              }, {
                                default: withCtx(() => [
                                  createTextVNode("Send reminder")
                                ]),
                                _: 1
                              }),
                              createVNode(_component_UButton, {
                                size: "xs",
                                variant: "ghost",
                                icon: "i-lucide-clipboard-list",
                                color: "neutral"
                              }, {
                                default: withCtx(() => [
                                  createTextVNode("View account")
                                ]),
                                _: 1
                              })
                            ])
                          ]);
                        }), 128)),
                        !unref(topCustomers).length ? (openBlock(), createBlock("p", {
                          key: 0,
                          class: "text-sm text-muted text-center"
                        }, "No outstanding clients—nice work!")) : createCommentVNode("", true)
                      ])
                    ];
                  }
                }),
                _: 1
              }, _parent2, _scopeId));
              _push2(`</div><div class="grid grid-cols-1 lg:grid-cols-2 gap-4"${_scopeId}>`);
              if (unref(data).value?.paidRecent?.length) {
                _push2(ssrRenderComponent(_component_UCard, null, {
                  header: withCtx((_2, _push3, _parent3, _scopeId2) => {
                    if (_push3) {
                      _push3(`<div class="flex items-center justify-between"${_scopeId2}><h3 class="text-base font-semibold"${_scopeId2}>Recent Payments</h3>`);
                      _push3(ssrRenderComponent(_component_UBadge, {
                        color: "neutral",
                        variant: "subtle"
                      }, {
                        default: withCtx((_3, _push4, _parent4, _scopeId3) => {
                          if (_push4) {
                            _push4(`Last 30 days`);
                          } else {
                            return [
                              createTextVNode("Last 30 days")
                            ];
                          }
                        }),
                        _: 1
                      }, _parent3, _scopeId2));
                      _push3(`</div>`);
                    } else {
                      return [
                        createVNode("div", { class: "flex items-center justify-between" }, [
                          createVNode("h3", { class: "text-base font-semibold" }, "Recent Payments"),
                          createVNode(_component_UBadge, {
                            color: "neutral",
                            variant: "subtle"
                          }, {
                            default: withCtx(() => [
                              createTextVNode("Last 30 days")
                            ]),
                            _: 1
                          })
                        ])
                      ];
                    }
                  }),
                  default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                    if (_push3) {
                      _push3(`<div class="space-y-3"${_scopeId2}><!--[-->`);
                      ssrRenderList(unref(data).value?.paidRecent, (invoice) => {
                        _push3(`<div class="flex items-center justify-between text-sm p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/20"${_scopeId2}><div${_scopeId2}><p class="font-medium"${_scopeId2}>${ssrInterpolate(invoice.number)}</p><p class="text-xs text-muted"${_scopeId2}>${ssrInterpolate(invoice.contact)} · Paid ${ssrInterpolate(formatDate(invoice.fullyPaidOnDate))}</p></div><div class="text-right"${_scopeId2}><p class="font-semibold text-emerald-600"${_scopeId2}>${ssrInterpolate(formatCurrency(invoice.total, invoice.currency))}</p><p class="text-xs text-muted"${_scopeId2}>${ssrInterpolate(invoice.daysToPay ?? "-")} days to pay</p></div></div>`);
                      });
                      _push3(`<!--]--></div>`);
                    } else {
                      return [
                        createVNode("div", { class: "space-y-3" }, [
                          (openBlock(true), createBlock(Fragment, null, renderList(unref(data).value?.paidRecent, (invoice) => {
                            return openBlock(), createBlock("div", {
                              key: invoice.id,
                              class: "flex items-center justify-between text-sm p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/20"
                            }, [
                              createVNode("div", null, [
                                createVNode("p", { class: "font-medium" }, toDisplayString(invoice.number), 1),
                                createVNode("p", { class: "text-xs text-muted" }, toDisplayString(invoice.contact) + " · Paid " + toDisplayString(formatDate(invoice.fullyPaidOnDate)), 1)
                              ]),
                              createVNode("div", { class: "text-right" }, [
                                createVNode("p", { class: "font-semibold text-emerald-600" }, toDisplayString(formatCurrency(invoice.total, invoice.currency)), 1),
                                createVNode("p", { class: "text-xs text-muted" }, toDisplayString(invoice.daysToPay ?? "-") + " days to pay", 1)
                              ])
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
              _push2(ssrRenderComponent(_component_UCard, null, {
                header: withCtx((_2, _push3, _parent3, _scopeId2) => {
                  if (_push3) {
                    _push3(`<h3 class="text-base font-semibold"${_scopeId2}>Quick Actions</h3>`);
                  } else {
                    return [
                      createVNode("h3", { class: "text-base font-semibold" }, "Quick Actions")
                    ];
                  }
                }),
                default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                  if (_push3) {
                    _push3(`<div class="grid grid-cols-1 gap-3"${_scopeId2}>`);
                    _push3(ssrRenderComponent(_component_UButton, {
                      color: "neutral",
                      icon: "i-lucide-send",
                      variant: "outline"
                    }, {
                      default: withCtx((_3, _push4, _parent4, _scopeId3) => {
                        if (_push4) {
                          _push4(`Send reminder emails`);
                        } else {
                          return [
                            createTextVNode("Send reminder emails")
                          ];
                        }
                      }),
                      _: 1
                    }, _parent3, _scopeId2));
                    _push3(ssrRenderComponent(_component_UButton, {
                      color: "neutral",
                      icon: "i-lucide-download",
                      variant: "outline"
                    }, {
                      default: withCtx((_3, _push4, _parent4, _scopeId3) => {
                        if (_push4) {
                          _push4(`Export aging report`);
                        } else {
                          return [
                            createTextVNode("Export aging report")
                          ];
                        }
                      }),
                      _: 1
                    }, _parent3, _scopeId2));
                    _push3(ssrRenderComponent(_component_UButton, {
                      color: "neutral",
                      icon: "i-lucide-settings-2",
                      variant: "outline"
                    }, {
                      default: withCtx((_3, _push4, _parent4, _scopeId3) => {
                        if (_push4) {
                          _push4(`Configure automation`);
                        } else {
                          return [
                            createTextVNode("Configure automation")
                          ];
                        }
                      }),
                      _: 1
                    }, _parent3, _scopeId2));
                    _push3(`</div>`);
                  } else {
                    return [
                      createVNode("div", { class: "grid grid-cols-1 gap-3" }, [
                        createVNode(_component_UButton, {
                          color: "neutral",
                          icon: "i-lucide-send",
                          variant: "outline"
                        }, {
                          default: withCtx(() => [
                            createTextVNode("Send reminder emails")
                          ]),
                          _: 1
                        }),
                        createVNode(_component_UButton, {
                          color: "neutral",
                          icon: "i-lucide-download",
                          variant: "outline"
                        }, {
                          default: withCtx(() => [
                            createTextVNode("Export aging report")
                          ]),
                          _: 1
                        }),
                        createVNode(_component_UButton, {
                          color: "neutral",
                          icon: "i-lucide-settings-2",
                          variant: "outline"
                        }, {
                          default: withCtx(() => [
                            createTextVNode("Configure automation")
                          ]),
                          _: 1
                        })
                      ])
                    ];
                  }
                }),
                _: 1
              }, _parent2, _scopeId));
              _push2(`</div>`);
              _push2(ssrRenderComponent(_component_UCard, null, {
                header: withCtx((_2, _push3, _parent3, _scopeId2) => {
                  if (_push3) {
                    _push3(`<div class="flex items-center justify-between"${_scopeId2}><h3 class="text-base font-semibold"${_scopeId2}>${ssrInterpolate(unref(selectedView) === "all" ? "All Invoices" : unref(selectedView) === "outstanding" ? "Outstanding Invoices" : unref(selectedView) === "overdue" ? "Overdue Invoices" : "Paid Invoices")}</h3>`);
                    if (unref(selectedView) === "paid" && unref(summary)?.avgDaysToPay) {
                      _push3(ssrRenderComponent(_component_UBadge, {
                        color: "neutral",
                        variant: "subtle"
                      }, {
                        default: withCtx((_3, _push4, _parent4, _scopeId3) => {
                          if (_push4) {
                            _push4(` Avg days to pay: ${ssrInterpolate(unref(summary)?.avgDaysToPay)}`);
                          } else {
                            return [
                              createTextVNode(" Avg days to pay: " + toDisplayString(unref(summary)?.avgDaysToPay), 1)
                            ];
                          }
                        }),
                        _: 1
                      }, _parent3, _scopeId2));
                    } else {
                      _push3(`<!---->`);
                    }
                    _push3(`</div>`);
                  } else {
                    return [
                      createVNode("div", { class: "flex items-center justify-between" }, [
                        createVNode("h3", { class: "text-base font-semibold" }, toDisplayString(unref(selectedView) === "all" ? "All Invoices" : unref(selectedView) === "outstanding" ? "Outstanding Invoices" : unref(selectedView) === "overdue" ? "Overdue Invoices" : "Paid Invoices"), 1),
                        unref(selectedView) === "paid" && unref(summary)?.avgDaysToPay ? (openBlock(), createBlock(_component_UBadge, {
                          key: 0,
                          color: "neutral",
                          variant: "subtle"
                        }, {
                          default: withCtx(() => [
                            createTextVNode(" Avg days to pay: " + toDisplayString(unref(summary)?.avgDaysToPay), 1)
                          ]),
                          _: 1
                        })) : createCommentVNode("", true)
                      ])
                    ];
                  }
                }),
                default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                  if (_push3) {
                    if (unref(selectedView) === "all") {
                      _push3(ssrRenderComponent(_component_UTable, {
                        rows: unref(paginatedAll),
                        columns: columnsAll
                      }, {
                        "status-data": withCtx(({ row }, _push4, _parent4, _scopeId3) => {
                          if (_push4) {
                            _push4(ssrRenderComponent(_component_UBadge, {
                              color: row.status === "PAID" ? "emerald" : row.status === "OVERDUE" ? "red" : "amber",
                              variant: "subtle"
                            }, {
                              default: withCtx((_3, _push5, _parent5, _scopeId4) => {
                                if (_push5) {
                                  _push5(`${ssrInterpolate(row.status === "PAID" ? "Paid" : row.status === "OVERDUE" ? "Overdue" : "Outstanding")}`);
                                } else {
                                  return [
                                    createTextVNode(toDisplayString(row.status === "PAID" ? "Paid" : row.status === "OVERDUE" ? "Overdue" : "Outstanding"), 1)
                                  ];
                                }
                              }),
                              _: 2
                            }, _parent4, _scopeId3));
                          } else {
                            return [
                              createVNode(_component_UBadge, {
                                color: row.status === "PAID" ? "emerald" : row.status === "OVERDUE" ? "red" : "amber",
                                variant: "subtle"
                              }, {
                                default: withCtx(() => [
                                  createTextVNode(toDisplayString(row.status === "PAID" ? "Paid" : row.status === "OVERDUE" ? "Overdue" : "Outstanding"), 1)
                                ]),
                                _: 2
                              }, 1032, ["color"])
                            ];
                          }
                        }),
                        "date-data": withCtx(({ row }, _push4, _parent4, _scopeId3) => {
                          if (_push4) {
                            _push4(`${ssrInterpolate(formatDate(row.date))}`);
                          } else {
                            return [
                              createTextVNode(toDisplayString(formatDate(row.date)), 1)
                            ];
                          }
                        }),
                        "dueDate-data": withCtx(({ row }, _push4, _parent4, _scopeId3) => {
                          if (_push4) {
                            _push4(`${ssrInterpolate(formatDate(row.dueDate))}`);
                          } else {
                            return [
                              createTextVNode(toDisplayString(formatDate(row.dueDate)), 1)
                            ];
                          }
                        }),
                        "amount-data": withCtx(({ row }, _push4, _parent4, _scopeId3) => {
                          if (_push4) {
                            _push4(`<span class="${ssrRenderClass([row.status === "OVERDUE" ? "text-red-600" : "", "text-right block font-medium"])}"${_scopeId3}>${ssrInterpolate(row.status === "PAID" ? formatCurrency(row.total, row.currency) : formatCurrency(row.amountDue, row.currency))}</span>`);
                          } else {
                            return [
                              createVNode("span", {
                                class: ["text-right block font-medium", row.status === "OVERDUE" ? "text-red-600" : ""]
                              }, toDisplayString(row.status === "PAID" ? formatCurrency(row.total, row.currency) : formatCurrency(row.amountDue, row.currency)), 3)
                            ];
                          }
                        }),
                        _: 1
                      }, _parent3, _scopeId2));
                    } else if (unref(selectedView) === "outstanding") {
                      _push3(ssrRenderComponent(_component_UTable, {
                        rows: unref(paginatedOutstanding),
                        columns: columnsOutstanding
                      }, {
                        "date-data": withCtx(({ row }, _push4, _parent4, _scopeId3) => {
                          if (_push4) {
                            _push4(`${ssrInterpolate(formatDate(row.date))}`);
                          } else {
                            return [
                              createTextVNode(toDisplayString(formatDate(row.date)), 1)
                            ];
                          }
                        }),
                        "dueDate-data": withCtx(({ row }, _push4, _parent4, _scopeId3) => {
                          if (_push4) {
                            _push4(`${ssrInterpolate(formatDate(row.dueDate))}`);
                          } else {
                            return [
                              createTextVNode(toDisplayString(formatDate(row.dueDate)), 1)
                            ];
                          }
                        }),
                        "daysUntilDue-data": withCtx(({ row }, _push4, _parent4, _scopeId3) => {
                          if (_push4) {
                            _push4(`<span class="${ssrRenderClass(row.daysUntilDue <= 3 ? "text-amber-600 font-medium" : "")}"${_scopeId3}>${ssrInterpolate(row.daysUntilDue != null ? row.daysUntilDue : "-")}</span>`);
                          } else {
                            return [
                              createVNode("span", {
                                class: row.daysUntilDue <= 3 ? "text-amber-600 font-medium" : ""
                              }, toDisplayString(row.daysUntilDue != null ? row.daysUntilDue : "-"), 3)
                            ];
                          }
                        }),
                        "amountDue-data": withCtx(({ row }, _push4, _parent4, _scopeId3) => {
                          if (_push4) {
                            _push4(`<span class="text-right block font-medium"${_scopeId3}>${ssrInterpolate(formatCurrency(row.amountDue, row.currency))}</span>`);
                          } else {
                            return [
                              createVNode("span", { class: "text-right block font-medium" }, toDisplayString(formatCurrency(row.amountDue, row.currency)), 1)
                            ];
                          }
                        }),
                        _: 1
                      }, _parent3, _scopeId2));
                    } else if (unref(selectedView) === "overdue") {
                      _push3(ssrRenderComponent(_component_UTable, {
                        rows: unref(paginatedOverdue),
                        columns: columnsOverdue
                      }, {
                        "date-data": withCtx(({ row }, _push4, _parent4, _scopeId3) => {
                          if (_push4) {
                            _push4(`${ssrInterpolate(formatDate(row.date))}`);
                          } else {
                            return [
                              createTextVNode(toDisplayString(formatDate(row.date)), 1)
                            ];
                          }
                        }),
                        "dueDate-data": withCtx(({ row }, _push4, _parent4, _scopeId3) => {
                          if (_push4) {
                            _push4(`${ssrInterpolate(formatDate(row.dueDate))}`);
                          } else {
                            return [
                              createTextVNode(toDisplayString(formatDate(row.dueDate)), 1)
                            ];
                          }
                        }),
                        "daysOverdue-data": withCtx(({ row }, _push4, _parent4, _scopeId3) => {
                          if (_push4) {
                            _push4(`<span class="text-red-600 font-medium"${_scopeId3}>${ssrInterpolate(row.daysOverdue ?? "-")}</span>`);
                          } else {
                            return [
                              createVNode("span", { class: "text-red-600 font-medium" }, toDisplayString(row.daysOverdue ?? "-"), 1)
                            ];
                          }
                        }),
                        "amountDue-data": withCtx(({ row }, _push4, _parent4, _scopeId3) => {
                          if (_push4) {
                            _push4(`<span class="text-right block font-medium text-red-600"${_scopeId3}>${ssrInterpolate(formatCurrency(row.amountDue, row.currency))}</span>`);
                          } else {
                            return [
                              createVNode("span", { class: "text-right block font-medium text-red-600" }, toDisplayString(formatCurrency(row.amountDue, row.currency)), 1)
                            ];
                          }
                        }),
                        _: 1
                      }, _parent3, _scopeId2));
                    } else {
                      _push3(ssrRenderComponent(_component_UTable, {
                        rows: unref(paginatedPaid),
                        columns: columnsPaid
                      }, {
                        "date-data": withCtx(({ row }, _push4, _parent4, _scopeId3) => {
                          if (_push4) {
                            _push4(`${ssrInterpolate(formatDate(row.date))}`);
                          } else {
                            return [
                              createTextVNode(toDisplayString(formatDate(row.date)), 1)
                            ];
                          }
                        }),
                        "fullyPaidOnDate-data": withCtx(({ row }, _push4, _parent4, _scopeId3) => {
                          if (_push4) {
                            _push4(`${ssrInterpolate(formatDate(row.fullyPaidOnDate))}`);
                          } else {
                            return [
                              createTextVNode(toDisplayString(formatDate(row.fullyPaidOnDate)), 1)
                            ];
                          }
                        }),
                        "daysToPay-data": withCtx(({ row }, _push4, _parent4, _scopeId3) => {
                          if (_push4) {
                            _push4(`${ssrInterpolate(row.daysToPay ?? "-")}`);
                          } else {
                            return [
                              createTextVNode(toDisplayString(row.daysToPay ?? "-"), 1)
                            ];
                          }
                        }),
                        "total-data": withCtx(({ row }, _push4, _parent4, _scopeId3) => {
                          if (_push4) {
                            _push4(`<span class="text-right block font-medium"${_scopeId3}>${ssrInterpolate(formatCurrency(row.total, row.currency))}</span>`);
                          } else {
                            return [
                              createVNode("span", { class: "text-right block font-medium" }, toDisplayString(formatCurrency(row.total, row.currency)), 1)
                            ];
                          }
                        }),
                        _: 1
                      }, _parent3, _scopeId2));
                    }
                    _push3(`<div class="mt-4 flex justify-end"${_scopeId2}>`);
                    if (unref(selectedView) === "all" && unref(filteredAll).length > pageSize) {
                      _push3(ssrRenderComponent(_component_UPagination, {
                        page: unref(pageAll),
                        "onUpdate:page": ($event) => isRef(pageAll) ? pageAll.value = $event : null,
                        "page-count": unref(totalPagesAll),
                        size: "sm"
                      }, null, _parent3, _scopeId2));
                    } else if (unref(selectedView) === "outstanding" && unref(filteredOutstanding).length > pageSize) {
                      _push3(ssrRenderComponent(_component_UPagination, {
                        page: unref(pageOutstanding),
                        "onUpdate:page": ($event) => isRef(pageOutstanding) ? pageOutstanding.value = $event : null,
                        "page-count": unref(totalPagesOutstanding),
                        size: "sm"
                      }, null, _parent3, _scopeId2));
                    } else if (unref(selectedView) === "overdue" && unref(filteredOverdue).length > pageSize) {
                      _push3(ssrRenderComponent(_component_UPagination, {
                        page: unref(pageOverdue),
                        "onUpdate:page": ($event) => isRef(pageOverdue) ? pageOverdue.value = $event : null,
                        "page-count": unref(totalPagesOverdue),
                        size: "sm"
                      }, null, _parent3, _scopeId2));
                    } else if (unref(selectedView) === "paid" && unref(filteredPaid).length > pageSize) {
                      _push3(ssrRenderComponent(_component_UPagination, {
                        page: unref(pagePaid),
                        "onUpdate:page": ($event) => isRef(pagePaid) ? pagePaid.value = $event : null,
                        "page-count": unref(totalPagesPaid),
                        size: "sm"
                      }, null, _parent3, _scopeId2));
                    } else {
                      _push3(`<!---->`);
                    }
                    _push3(`</div>`);
                  } else {
                    return [
                      unref(selectedView) === "all" ? (openBlock(), createBlock(_component_UTable, {
                        key: 0,
                        rows: unref(paginatedAll),
                        columns: columnsAll
                      }, {
                        "status-data": withCtx(({ row }) => [
                          createVNode(_component_UBadge, {
                            color: row.status === "PAID" ? "emerald" : row.status === "OVERDUE" ? "red" : "amber",
                            variant: "subtle"
                          }, {
                            default: withCtx(() => [
                              createTextVNode(toDisplayString(row.status === "PAID" ? "Paid" : row.status === "OVERDUE" ? "Overdue" : "Outstanding"), 1)
                            ]),
                            _: 2
                          }, 1032, ["color"])
                        ]),
                        "date-data": withCtx(({ row }) => [
                          createTextVNode(toDisplayString(formatDate(row.date)), 1)
                        ]),
                        "dueDate-data": withCtx(({ row }) => [
                          createTextVNode(toDisplayString(formatDate(row.dueDate)), 1)
                        ]),
                        "amount-data": withCtx(({ row }) => [
                          createVNode("span", {
                            class: ["text-right block font-medium", row.status === "OVERDUE" ? "text-red-600" : ""]
                          }, toDisplayString(row.status === "PAID" ? formatCurrency(row.total, row.currency) : formatCurrency(row.amountDue, row.currency)), 3)
                        ]),
                        _: 1
                      }, 8, ["rows"])) : unref(selectedView) === "outstanding" ? (openBlock(), createBlock(_component_UTable, {
                        key: 1,
                        rows: unref(paginatedOutstanding),
                        columns: columnsOutstanding
                      }, {
                        "date-data": withCtx(({ row }) => [
                          createTextVNode(toDisplayString(formatDate(row.date)), 1)
                        ]),
                        "dueDate-data": withCtx(({ row }) => [
                          createTextVNode(toDisplayString(formatDate(row.dueDate)), 1)
                        ]),
                        "daysUntilDue-data": withCtx(({ row }) => [
                          createVNode("span", {
                            class: row.daysUntilDue <= 3 ? "text-amber-600 font-medium" : ""
                          }, toDisplayString(row.daysUntilDue != null ? row.daysUntilDue : "-"), 3)
                        ]),
                        "amountDue-data": withCtx(({ row }) => [
                          createVNode("span", { class: "text-right block font-medium" }, toDisplayString(formatCurrency(row.amountDue, row.currency)), 1)
                        ]),
                        _: 1
                      }, 8, ["rows"])) : unref(selectedView) === "overdue" ? (openBlock(), createBlock(_component_UTable, {
                        key: 2,
                        rows: unref(paginatedOverdue),
                        columns: columnsOverdue
                      }, {
                        "date-data": withCtx(({ row }) => [
                          createTextVNode(toDisplayString(formatDate(row.date)), 1)
                        ]),
                        "dueDate-data": withCtx(({ row }) => [
                          createTextVNode(toDisplayString(formatDate(row.dueDate)), 1)
                        ]),
                        "daysOverdue-data": withCtx(({ row }) => [
                          createVNode("span", { class: "text-red-600 font-medium" }, toDisplayString(row.daysOverdue ?? "-"), 1)
                        ]),
                        "amountDue-data": withCtx(({ row }) => [
                          createVNode("span", { class: "text-right block font-medium text-red-600" }, toDisplayString(formatCurrency(row.amountDue, row.currency)), 1)
                        ]),
                        _: 1
                      }, 8, ["rows"])) : (openBlock(), createBlock(_component_UTable, {
                        key: 3,
                        rows: unref(paginatedPaid),
                        columns: columnsPaid
                      }, {
                        "date-data": withCtx(({ row }) => [
                          createTextVNode(toDisplayString(formatDate(row.date)), 1)
                        ]),
                        "fullyPaidOnDate-data": withCtx(({ row }) => [
                          createTextVNode(toDisplayString(formatDate(row.fullyPaidOnDate)), 1)
                        ]),
                        "daysToPay-data": withCtx(({ row }) => [
                          createTextVNode(toDisplayString(row.daysToPay ?? "-"), 1)
                        ]),
                        "total-data": withCtx(({ row }) => [
                          createVNode("span", { class: "text-right block font-medium" }, toDisplayString(formatCurrency(row.total, row.currency)), 1)
                        ]),
                        _: 1
                      }, 8, ["rows"])),
                      createVNode("div", { class: "mt-4 flex justify-end" }, [
                        unref(selectedView) === "all" && unref(filteredAll).length > pageSize ? (openBlock(), createBlock(_component_UPagination, {
                          key: 0,
                          page: unref(pageAll),
                          "onUpdate:page": ($event) => isRef(pageAll) ? pageAll.value = $event : null,
                          "page-count": unref(totalPagesAll),
                          size: "sm"
                        }, null, 8, ["page", "onUpdate:page", "page-count"])) : unref(selectedView) === "outstanding" && unref(filteredOutstanding).length > pageSize ? (openBlock(), createBlock(_component_UPagination, {
                          key: 1,
                          page: unref(pageOutstanding),
                          "onUpdate:page": ($event) => isRef(pageOutstanding) ? pageOutstanding.value = $event : null,
                          "page-count": unref(totalPagesOutstanding),
                          size: "sm"
                        }, null, 8, ["page", "onUpdate:page", "page-count"])) : unref(selectedView) === "overdue" && unref(filteredOverdue).length > pageSize ? (openBlock(), createBlock(_component_UPagination, {
                          key: 2,
                          page: unref(pageOverdue),
                          "onUpdate:page": ($event) => isRef(pageOverdue) ? pageOverdue.value = $event : null,
                          "page-count": unref(totalPagesOverdue),
                          size: "sm"
                        }, null, 8, ["page", "onUpdate:page", "page-count"])) : unref(selectedView) === "paid" && unref(filteredPaid).length > pageSize ? (openBlock(), createBlock(_component_UPagination, {
                          key: 3,
                          page: unref(pagePaid),
                          "onUpdate:page": ($event) => isRef(pagePaid) ? pagePaid.value = $event : null,
                          "page-count": unref(totalPagesPaid),
                          size: "sm"
                        }, null, 8, ["page", "onUpdate:page", "page-count"])) : createCommentVNode("", true)
                      ])
                    ];
                  }
                }),
                _: 1
              }, _parent2, _scopeId));
              _push2(`</div>`);
            }
          } else {
            return [
              unref(pending) ? (openBlock(), createBlock("div", {
                key: 0,
                class: "space-y-4"
              }, [
                createVNode(_component_USkeleton, { class: "h-32" }),
                createVNode(_component_USkeleton, { class: "h-80" })
              ])) : unref(error) ? (openBlock(), createBlock(_component_UAlert, {
                key: 1,
                icon: "i-lucide-alert-octagon",
                color: "red",
                variant: "subtle",
                title: "Unable to load invoices",
                description: unref(error).statusMessage || "Please try refreshing."
              }, null, 8, ["description"])) : (openBlock(), createBlock("div", {
                key: 2,
                class: "space-y-6"
              }, [
                createVNode("div", { class: "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4" }, [
                  createVNode(_component_UCard, null, {
                    default: withCtx(() => [
                      createVNode("div", { class: "flex items-center justify-between" }, [
                        createVNode("div", null, [
                          createVNode("p", { class: "text-sm text-muted" }, "Outstanding Balance"),
                          createVNode("p", { class: "text-2xl font-bold" }, toDisplayString(formatCurrency(unref(summary)?.outstandingTotal)), 1)
                        ]),
                        createVNode(_component_UIcon, {
                          name: "i-lucide-file-text",
                          class: "h-7 w-7 text-emerald-500"
                        })
                      ]),
                      createVNode("p", { class: "text-xs text-muted mt-2" }, toDisplayString(unref(summary)?.outstandingCount || 0) + " invoices with open balances", 1)
                    ]),
                    _: 1
                  }),
                  createVNode(_component_UCard, null, {
                    default: withCtx(() => [
                      createVNode("div", { class: "flex items-center justify-between" }, [
                        createVNode("div", null, [
                          createVNode("p", { class: "text-sm text-muted" }, "Overdue Balance"),
                          createVNode("p", { class: "text-2xl font-bold text-red-600" }, toDisplayString(formatCurrency(unref(summary)?.overdueTotal)), 1)
                        ]),
                        createVNode(_component_UIcon, {
                          name: "i-lucide-alert-triangle",
                          class: "h-7 w-7 text-red-500"
                        })
                      ]),
                      createVNode("p", { class: "text-xs text-muted mt-2" }, toDisplayString(unref(summary)?.overdueCount || 0) + " invoices past due", 1)
                    ]),
                    _: 1
                  }),
                  createVNode(_component_UCard, null, {
                    default: withCtx(() => [
                      createVNode("div", { class: "flex items-center justify-between" }, [
                        createVNode("div", null, [
                          createVNode("p", { class: "text-sm text-muted" }, "Due in 7 days"),
                          createVNode("p", { class: "text-2xl font-bold text-amber-600" }, toDisplayString(formatCurrency(unref(summary)?.dueSoonTotal)), 1)
                        ]),
                        createVNode(_component_UIcon, {
                          name: "i-lucide-hourglass",
                          class: "h-7 w-7 text-amber-500"
                        })
                      ]),
                      createVNode("p", { class: "text-xs text-muted mt-2" }, "Upcoming cash expected this week")
                    ]),
                    _: 1
                  }),
                  createVNode(_component_UCard, null, {
                    default: withCtx(() => [
                      createVNode("div", { class: "flex items-center justify-between" }, [
                        createVNode("div", null, [
                          createVNode("p", { class: "text-sm text-muted" }, "Paid Last 30 Days"),
                          createVNode("p", { class: "text-2xl font-bold text-emerald-600" }, toDisplayString(formatCurrency(unref(summary)?.paidLast30Total)), 1)
                        ]),
                        createVNode(_component_UIcon, {
                          name: "i-lucide-badge-check",
                          class: "h-7 w-7 text-emerald-500"
                        })
                      ]),
                      createVNode("p", { class: "text-xs text-muted mt-2" }, toDisplayString(unref(summary)?.paidLast30Count || 0) + " invoices closed recently", 1)
                    ]),
                    _: 1
                  })
                ]),
                createVNode("div", { class: "grid grid-cols-1 lg:grid-cols-3 gap-4" }, [
                  createVNode(_component_UCard, { class: "lg:col-span-2" }, {
                    header: withCtx(() => [
                      createVNode("h3", { class: "text-base font-semibold" }, "Invoice Aging Overview")
                    ]),
                    default: withCtx(() => [
                      createVNode("div", { class: "grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm" }, [
                        createVNode("div", { class: "p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/20" }, [
                          createVNode("p", { class: "text-muted text-xs uppercase tracking-wide" }, "Current"),
                          createVNode("p", { class: "text-lg font-semibold" }, toDisplayString(unref(summary)?.agingBuckets?.current ?? 0), 1),
                          createVNode("p", { class: "text-xs text-muted" }, "Not yet due")
                        ]),
                        createVNode("div", { class: "p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20" }, [
                          createVNode("p", { class: "text-muted text-xs uppercase tracking-wide" }, "Due <= 7 days"),
                          createVNode("p", { class: "text-lg font-semibold" }, toDisplayString(unref(summary)?.agingBuckets?.dueSoon ?? 0), 1),
                          createVNode("p", { class: "text-xs text-muted" }, "Requires follow-up")
                        ]),
                        createVNode("div", { class: "p-3 rounded-lg bg-red-50 dark:bg-red-950/20" }, [
                          createVNode("p", { class: "text-muted text-xs uppercase tracking-wide" }, "Overdue ≤ 7 days"),
                          createVNode("p", { class: "text-lg font-semibold" }, toDisplayString(unref(summary)?.agingBuckets?.overdue7 ?? unref(summary)?.agingBuckets?.bucket1 ?? 0), 1),
                          createVNode("p", { class: "text-xs text-muted" }, "Recently late")
                        ]),
                        createVNode("div", { class: "p-3 rounded-lg bg-red-50/90 dark:bg-red-950/40" }, [
                          createVNode("p", { class: "text-muted text-xs uppercase tracking-wide" }, "Overdue 8-14 days"),
                          createVNode("p", { class: "text-lg font-semibold" }, toDisplayString(unref(summary)?.agingBuckets?.overdue14 ?? unref(summary)?.agingBuckets?.bucket2 ?? 0), 1),
                          createVNode("p", { class: "text-xs text-muted" }, "Watch closely")
                        ]),
                        createVNode("div", { class: "p-3 rounded-lg bg-red-100 dark:bg-red-950/60" }, [
                          createVNode("p", { class: "text-muted text-xs uppercase tracking-wide" }, "Overdue 15-30 days"),
                          createVNode("p", { class: "text-lg font-semibold" }, toDisplayString(unref(summary)?.agingBuckets?.overdue30 ?? unref(summary)?.agingBuckets?.bucket3 ?? 0), 1),
                          createVNode("p", { class: "text-xs text-muted" }, "Escalate if needed")
                        ]),
                        createVNode("div", { class: "p-3 rounded-lg bg-red-200 dark:bg-red-900/80" }, [
                          createVNode("p", { class: "text-muted text-xs uppercase tracking-wide" }, "Overdue 30+ days"),
                          createVNode("p", { class: "text-lg font-semibold" }, toDisplayString(unref(summary)?.agingBuckets?.overdue60 ?? unref(summary)?.agingBuckets?.bucket4 ?? 0), 1),
                          createVNode("p", { class: "text-xs text-muted" }, "High risk")
                        ])
                      ]),
                      unref(agingDetails) ? (openBlock(), createBlock("div", {
                        key: 0,
                        class: "mt-6 space-y-6 text-sm"
                      }, [
                        (openBlock(), createBlock(Fragment, null, renderList([
                          { key: "current", title: "Due in 30+ days", color: "text-muted", helper: "Planned future billing" },
                          { key: "dueSoon", title: "Due within 7 days", color: "text-amber-600", helper: "Reach out before due date" },
                          { key: "due30", title: "Due in 8-30 days", color: "text-muted", helper: "Plan follow-up next" },
                          { key: "overdue7", title: "Overdue 1-7 days", color: "text-red-500", helper: "Send gentle reminder" },
                          { key: "overdue14", title: "Overdue 8-14 days", color: "text-red-500", helper: "Escalate with account owner" },
                          { key: "overdue30", title: "Overdue 15-30 days", color: "text-red-600", helper: "Consider payment plan" },
                          { key: "overdue60", title: "Overdue 30+ days", color: "text-red-700", helper: "High risk – collections?" }
                        ], (section) => {
                          return openBlock(), createBlock(Fragment, null, [
                            unref(agingDetails)?.[section.key]?.length ? (openBlock(), createBlock("div", {
                              key: section.key
                            }, [
                              createVNode("div", { class: "flex items-center justify-between" }, [
                                createVNode("div", null, [
                                  createVNode("p", {
                                    class: ["font-semibold", section.color]
                                  }, toDisplayString(section.title), 3),
                                  createVNode("p", { class: "text-xs text-muted" }, toDisplayString(section.helper), 1)
                                ]),
                                createVNode(_component_UBadge, {
                                  color: "neutral",
                                  variant: "subtle"
                                }, {
                                  default: withCtx(() => [
                                    createTextVNode(toDisplayString(unref(agingDetails)?.[section.key]?.length), 1)
                                  ]),
                                  _: 2
                                }, 1024)
                              ]),
                              createVNode("div", { class: "mt-3 space-y-2" }, [
                                (openBlock(true), createBlock(Fragment, null, renderList(unref(agingDetails)?.[section.key] || [], (inv) => {
                                  return openBlock(), createBlock("div", {
                                    key: inv.id,
                                    class: "flex items-start justify-between rounded border border-default bg-white/70 dark:bg-white/5 px-3 py-2"
                                  }, [
                                    createVNode("div", null, [
                                      createVNode("p", { class: "font-medium" }, toDisplayString(inv.number), 1),
                                      createVNode("p", { class: "text-xs text-muted" }, toDisplayString(inv.contact) + " · Due " + toDisplayString(formatDate(inv.dueDate)), 1)
                                    ]),
                                    createVNode("div", { class: "text-right" }, [
                                      createVNode("p", {
                                        class: ["font-semibold", section.key.includes("overdue") ? "text-red-600" : "text-emerald-600"]
                                      }, toDisplayString(formatCurrency(inv.amountDue, inv.currency)), 3),
                                      createVNode("p", { class: "text-xs text-muted" }, toDisplayString(section.key.includes("overdue") ? `${inv.daysOverdue ?? 0} days overdue` : `${inv.daysUntilDue ?? 0} days`), 1)
                                    ])
                                  ]);
                                }), 128))
                              ])
                            ])) : createCommentVNode("", true)
                          ], 64);
                        }), 64))
                      ])) : createCommentVNode("", true)
                    ]),
                    _: 1
                  }),
                  createVNode(_component_UCard, null, {
                    header: withCtx(() => [
                      createVNode("div", { class: "flex items-center justify-between" }, [
                        createVNode("h3", { class: "text-base font-semibold" }, "Top Outstanding Clients"),
                        unref(summary)?.topCustomers?.length ? (openBlock(), createBlock(_component_UBadge, {
                          key: 0,
                          color: "neutral",
                          variant: "subtle"
                        }, {
                          default: withCtx(() => [
                            createTextVNode(toDisplayString(unref(summary)?.topCustomers?.length) + " listed", 1)
                          ]),
                          _: 1
                        })) : createCommentVNode("", true)
                      ])
                    ]),
                    default: withCtx(() => [
                      createVNode("div", { class: "space-y-3" }, [
                        (openBlock(true), createBlock(Fragment, null, renderList(unref(topCustomers), (client) => {
                          return openBlock(), createBlock("div", {
                            key: client.name,
                            class: "p-3 rounded-lg border border-default bg-white/70 dark:bg-white/5"
                          }, [
                            createVNode("div", { class: "flex items-center justify-between" }, [
                              createVNode("p", { class: "font-medium" }, toDisplayString(client.name), 1),
                              createVNode("span", { class: "text-xs text-muted" }, toDisplayString(client.count) + " invoices", 1)
                            ]),
                            createVNode("div", { class: "flex items-center justify-between text-sm mt-1" }, [
                              createVNode("span", { class: "text-muted" }, "Outstanding"),
                              createVNode("span", { class: "font-semibold" }, toDisplayString(formatCurrency(client.outstanding)), 1)
                            ]),
                            client.overdue ? (openBlock(), createBlock("div", {
                              key: 0,
                              class: "flex items-center justify-between text-xs text-red-500"
                            }, [
                              createVNode("span", null, "Overdue"),
                              createVNode("span", { class: "font-medium" }, toDisplayString(formatCurrency(client.overdue)), 1)
                            ])) : createCommentVNode("", true),
                            createVNode("div", { class: "mt-2 flex gap-2" }, [
                              createVNode(_component_UButton, {
                                size: "xs",
                                variant: "ghost",
                                icon: "i-lucide-mail",
                                color: "neutral"
                              }, {
                                default: withCtx(() => [
                                  createTextVNode("Send reminder")
                                ]),
                                _: 1
                              }),
                              createVNode(_component_UButton, {
                                size: "xs",
                                variant: "ghost",
                                icon: "i-lucide-clipboard-list",
                                color: "neutral"
                              }, {
                                default: withCtx(() => [
                                  createTextVNode("View account")
                                ]),
                                _: 1
                              })
                            ])
                          ]);
                        }), 128)),
                        !unref(topCustomers).length ? (openBlock(), createBlock("p", {
                          key: 0,
                          class: "text-sm text-muted text-center"
                        }, "No outstanding clients—nice work!")) : createCommentVNode("", true)
                      ])
                    ]),
                    _: 1
                  })
                ]),
                createVNode("div", { class: "grid grid-cols-1 lg:grid-cols-2 gap-4" }, [
                  unref(data).value?.paidRecent?.length ? (openBlock(), createBlock(_component_UCard, { key: 0 }, {
                    header: withCtx(() => [
                      createVNode("div", { class: "flex items-center justify-between" }, [
                        createVNode("h3", { class: "text-base font-semibold" }, "Recent Payments"),
                        createVNode(_component_UBadge, {
                          color: "neutral",
                          variant: "subtle"
                        }, {
                          default: withCtx(() => [
                            createTextVNode("Last 30 days")
                          ]),
                          _: 1
                        })
                      ])
                    ]),
                    default: withCtx(() => [
                      createVNode("div", { class: "space-y-3" }, [
                        (openBlock(true), createBlock(Fragment, null, renderList(unref(data).value?.paidRecent, (invoice) => {
                          return openBlock(), createBlock("div", {
                            key: invoice.id,
                            class: "flex items-center justify-between text-sm p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/20"
                          }, [
                            createVNode("div", null, [
                              createVNode("p", { class: "font-medium" }, toDisplayString(invoice.number), 1),
                              createVNode("p", { class: "text-xs text-muted" }, toDisplayString(invoice.contact) + " · Paid " + toDisplayString(formatDate(invoice.fullyPaidOnDate)), 1)
                            ]),
                            createVNode("div", { class: "text-right" }, [
                              createVNode("p", { class: "font-semibold text-emerald-600" }, toDisplayString(formatCurrency(invoice.total, invoice.currency)), 1),
                              createVNode("p", { class: "text-xs text-muted" }, toDisplayString(invoice.daysToPay ?? "-") + " days to pay", 1)
                            ])
                          ]);
                        }), 128))
                      ])
                    ]),
                    _: 1
                  })) : createCommentVNode("", true),
                  createVNode(_component_UCard, null, {
                    header: withCtx(() => [
                      createVNode("h3", { class: "text-base font-semibold" }, "Quick Actions")
                    ]),
                    default: withCtx(() => [
                      createVNode("div", { class: "grid grid-cols-1 gap-3" }, [
                        createVNode(_component_UButton, {
                          color: "neutral",
                          icon: "i-lucide-send",
                          variant: "outline"
                        }, {
                          default: withCtx(() => [
                            createTextVNode("Send reminder emails")
                          ]),
                          _: 1
                        }),
                        createVNode(_component_UButton, {
                          color: "neutral",
                          icon: "i-lucide-download",
                          variant: "outline"
                        }, {
                          default: withCtx(() => [
                            createTextVNode("Export aging report")
                          ]),
                          _: 1
                        }),
                        createVNode(_component_UButton, {
                          color: "neutral",
                          icon: "i-lucide-settings-2",
                          variant: "outline"
                        }, {
                          default: withCtx(() => [
                            createTextVNode("Configure automation")
                          ]),
                          _: 1
                        })
                      ])
                    ]),
                    _: 1
                  })
                ]),
                createVNode(_component_UCard, null, {
                  header: withCtx(() => [
                    createVNode("div", { class: "flex items-center justify-between" }, [
                      createVNode("h3", { class: "text-base font-semibold" }, toDisplayString(unref(selectedView) === "all" ? "All Invoices" : unref(selectedView) === "outstanding" ? "Outstanding Invoices" : unref(selectedView) === "overdue" ? "Overdue Invoices" : "Paid Invoices"), 1),
                      unref(selectedView) === "paid" && unref(summary)?.avgDaysToPay ? (openBlock(), createBlock(_component_UBadge, {
                        key: 0,
                        color: "neutral",
                        variant: "subtle"
                      }, {
                        default: withCtx(() => [
                          createTextVNode(" Avg days to pay: " + toDisplayString(unref(summary)?.avgDaysToPay), 1)
                        ]),
                        _: 1
                      })) : createCommentVNode("", true)
                    ])
                  ]),
                  default: withCtx(() => [
                    unref(selectedView) === "all" ? (openBlock(), createBlock(_component_UTable, {
                      key: 0,
                      rows: unref(paginatedAll),
                      columns: columnsAll
                    }, {
                      "status-data": withCtx(({ row }) => [
                        createVNode(_component_UBadge, {
                          color: row.status === "PAID" ? "emerald" : row.status === "OVERDUE" ? "red" : "amber",
                          variant: "subtle"
                        }, {
                          default: withCtx(() => [
                            createTextVNode(toDisplayString(row.status === "PAID" ? "Paid" : row.status === "OVERDUE" ? "Overdue" : "Outstanding"), 1)
                          ]),
                          _: 2
                        }, 1032, ["color"])
                      ]),
                      "date-data": withCtx(({ row }) => [
                        createTextVNode(toDisplayString(formatDate(row.date)), 1)
                      ]),
                      "dueDate-data": withCtx(({ row }) => [
                        createTextVNode(toDisplayString(formatDate(row.dueDate)), 1)
                      ]),
                      "amount-data": withCtx(({ row }) => [
                        createVNode("span", {
                          class: ["text-right block font-medium", row.status === "OVERDUE" ? "text-red-600" : ""]
                        }, toDisplayString(row.status === "PAID" ? formatCurrency(row.total, row.currency) : formatCurrency(row.amountDue, row.currency)), 3)
                      ]),
                      _: 1
                    }, 8, ["rows"])) : unref(selectedView) === "outstanding" ? (openBlock(), createBlock(_component_UTable, {
                      key: 1,
                      rows: unref(paginatedOutstanding),
                      columns: columnsOutstanding
                    }, {
                      "date-data": withCtx(({ row }) => [
                        createTextVNode(toDisplayString(formatDate(row.date)), 1)
                      ]),
                      "dueDate-data": withCtx(({ row }) => [
                        createTextVNode(toDisplayString(formatDate(row.dueDate)), 1)
                      ]),
                      "daysUntilDue-data": withCtx(({ row }) => [
                        createVNode("span", {
                          class: row.daysUntilDue <= 3 ? "text-amber-600 font-medium" : ""
                        }, toDisplayString(row.daysUntilDue != null ? row.daysUntilDue : "-"), 3)
                      ]),
                      "amountDue-data": withCtx(({ row }) => [
                        createVNode("span", { class: "text-right block font-medium" }, toDisplayString(formatCurrency(row.amountDue, row.currency)), 1)
                      ]),
                      _: 1
                    }, 8, ["rows"])) : unref(selectedView) === "overdue" ? (openBlock(), createBlock(_component_UTable, {
                      key: 2,
                      rows: unref(paginatedOverdue),
                      columns: columnsOverdue
                    }, {
                      "date-data": withCtx(({ row }) => [
                        createTextVNode(toDisplayString(formatDate(row.date)), 1)
                      ]),
                      "dueDate-data": withCtx(({ row }) => [
                        createTextVNode(toDisplayString(formatDate(row.dueDate)), 1)
                      ]),
                      "daysOverdue-data": withCtx(({ row }) => [
                        createVNode("span", { class: "text-red-600 font-medium" }, toDisplayString(row.daysOverdue ?? "-"), 1)
                      ]),
                      "amountDue-data": withCtx(({ row }) => [
                        createVNode("span", { class: "text-right block font-medium text-red-600" }, toDisplayString(formatCurrency(row.amountDue, row.currency)), 1)
                      ]),
                      _: 1
                    }, 8, ["rows"])) : (openBlock(), createBlock(_component_UTable, {
                      key: 3,
                      rows: unref(paginatedPaid),
                      columns: columnsPaid
                    }, {
                      "date-data": withCtx(({ row }) => [
                        createTextVNode(toDisplayString(formatDate(row.date)), 1)
                      ]),
                      "fullyPaidOnDate-data": withCtx(({ row }) => [
                        createTextVNode(toDisplayString(formatDate(row.fullyPaidOnDate)), 1)
                      ]),
                      "daysToPay-data": withCtx(({ row }) => [
                        createTextVNode(toDisplayString(row.daysToPay ?? "-"), 1)
                      ]),
                      "total-data": withCtx(({ row }) => [
                        createVNode("span", { class: "text-right block font-medium" }, toDisplayString(formatCurrency(row.total, row.currency)), 1)
                      ]),
                      _: 1
                    }, 8, ["rows"])),
                    createVNode("div", { class: "mt-4 flex justify-end" }, [
                      unref(selectedView) === "all" && unref(filteredAll).length > pageSize ? (openBlock(), createBlock(_component_UPagination, {
                        key: 0,
                        page: unref(pageAll),
                        "onUpdate:page": ($event) => isRef(pageAll) ? pageAll.value = $event : null,
                        "page-count": unref(totalPagesAll),
                        size: "sm"
                      }, null, 8, ["page", "onUpdate:page", "page-count"])) : unref(selectedView) === "outstanding" && unref(filteredOutstanding).length > pageSize ? (openBlock(), createBlock(_component_UPagination, {
                        key: 1,
                        page: unref(pageOutstanding),
                        "onUpdate:page": ($event) => isRef(pageOutstanding) ? pageOutstanding.value = $event : null,
                        "page-count": unref(totalPagesOutstanding),
                        size: "sm"
                      }, null, 8, ["page", "onUpdate:page", "page-count"])) : unref(selectedView) === "overdue" && unref(filteredOverdue).length > pageSize ? (openBlock(), createBlock(_component_UPagination, {
                        key: 2,
                        page: unref(pageOverdue),
                        "onUpdate:page": ($event) => isRef(pageOverdue) ? pageOverdue.value = $event : null,
                        "page-count": unref(totalPagesOverdue),
                        size: "sm"
                      }, null, 8, ["page", "onUpdate:page", "page-count"])) : unref(selectedView) === "paid" && unref(filteredPaid).length > pageSize ? (openBlock(), createBlock(_component_UPagination, {
                        key: 3,
                        page: unref(pagePaid),
                        "onUpdate:page": ($event) => isRef(pagePaid) ? pagePaid.value = $event : null,
                        "page-count": unref(totalPagesPaid),
                        size: "sm"
                      }, null, 8, ["page", "onUpdate:page", "page-count"])) : createCommentVNode("", true)
                    ])
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
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("pages/invoices/index.vue");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};

export { _sfc_main as default };
//# sourceMappingURL=index-Bo1uPpnA.mjs.map
