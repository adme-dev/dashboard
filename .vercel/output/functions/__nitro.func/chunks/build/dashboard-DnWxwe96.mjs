import { _ as _sfc_main$1, a as _sfc_main$5 } from './DashboardNavbar-Dma8e2D0.mjs';
import { _ as _sfc_main$6 } from './DashboardSidebarCollapse-Bb0ddWxH.mjs';
import { e as useFetch, f as __nuxt_component_2$1, d as _sfc_main$9, _ as _sfc_main$e } from './server.mjs';
import { _ as _sfc_main$7 } from './DashboardToolbar-C9qyFRVV.mjs';
import { _ as _sfc_main$a } from './Breadcrumb-1kD8Xb-9.mjs';
import { _ as _sfc_main$8 } from './Badge-BfrefdmG.mjs';
import { _ as _sfc_main$2 } from './Alert-CLlAchtu.mjs';
import { _ as _sfc_main$3 } from './Skeleton-p2Vkb_Gp.mjs';
import { _ as _sfc_main$4 } from './Card-jqGRZ5Ik.mjs';
import { defineComponent, useSSRContext, defineAsyncComponent, withAsyncContext, computed, mergeProps, withCtx, unref, createVNode, createBlock, openBlock, Fragment, renderList, createCommentVNode, createTextVNode, toDisplayString } from 'vue';
import { ssrRenderComponent, ssrRenderList, ssrInterpolate } from 'vue/server-renderer';
import { _ as _export_sfc } from './_plugin-vue_export-helper-1tPrXgE0.mjs';
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

const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "dashboard",
  __ssrInlineRender: true,
  async setup(__props) {
    let __temp, __restore;
    const AsyncKPICards = defineAsyncComponent(() => import('./KPICards-sG9mfzwL.mjs'));
    const AsyncCashFlowChart = defineAsyncComponent(() => import('./CashFlowChart.client-Bo2o8GSz.mjs'));
    const AsyncInvoicePipeline = defineAsyncComponent(() => import('./InvoicePipeline-0SlbJBkA.mjs'));
    const AsyncAnomalyAlerts = defineAsyncComponent(() => import('./AnomalyAlerts-BCLB-DwI.mjs'));
    const { data: statusData, refresh: refreshStatus } = ([__temp, __restore] = withAsyncContext(() => useFetch("/api/xero/status", "$2YOI5wd6j1")), __temp = await __temp, __restore(), __temp);
    const isConnected = computed(() => statusData.value?.connected || false);
    const { data: kpiData, pending: kpiPending, error: kpiError, refresh: refreshKPI } = ([__temp, __restore] = withAsyncContext(() => useFetch("/api/kpis-advanced", {
      lazy: true
    }, "$5lTcWRZi2h")), __temp = await __temp, __restore(), __temp);
    const { data: cashFlowData, pending: cashFlowPending, refresh: refreshCashFlow } = ([__temp, __restore] = withAsyncContext(() => useFetch("/api/xero/reports/cash-flow-forecast?days=90", {
      lazy: true
    }, "$Ax-xwEIoFk")), __temp = await __temp, __restore(), __temp);
    const { data: pipelineData, pending: pipelinePending, refresh: refreshPipeline } = ([__temp, __restore] = withAsyncContext(() => useFetch("/api/xero/invoice-pipeline?days=90", {
      lazy: true
    }, "$CYrPfn39LU")), __temp = await __temp, __restore(), __temp);
    const { data: anomalyData, pending: anomalyPending, refresh: refreshAnomalies } = ([__temp, __restore] = withAsyncContext(() => useFetch("/api/ai/anomaly-detection?days=30&sensitivity=2", {
      lazy: true
    }, "$jhlyZcLaRU")), __temp = await __temp, __restore(), __temp);
    async function refreshAll() {
      await Promise.all([refreshKPI(), refreshCashFlow(), refreshPipeline(), refreshAnomalies()]);
    }
    const breadcrumbs = computed(() => [
      { label: "Home", to: "/" },
      { label: "Executive Dashboard", to: "/dashboard" }
    ]);
    const pageTitle = computed(() => {
      const baseTitle = "Executive Dashboard";
      return isConnected ? `${baseTitle} • Live` : `${baseTitle} • Demo`;
    });
    const criticalAlerts = computed(() => {
      return kpiData.value?.alerts?.filter((alert) => alert.severity === "critical") || [];
    });
    return (_ctx, _push, _parent, _attrs) => {
      const _component_UDashboardPanel = _sfc_main$1;
      const _component_UDashboardNavbar = _sfc_main$5;
      const _component_UDashboardSidebarCollapse = _sfc_main$6;
      const _component_UButton = _sfc_main$9;
      const _component_UDashboardToolbar = _sfc_main$7;
      const _component_UBreadcrumb = _sfc_main$a;
      const _component_UBadge = _sfc_main$8;
      const _component_UAlert = _sfc_main$2;
      const _component_ClientOnly = __nuxt_component_2$1;
      const _component_USkeleton = _sfc_main$3;
      const _component_UCard = _sfc_main$4;
      const _component_UIcon = _sfc_main$e;
      _push(ssrRenderComponent(_component_UDashboardPanel, mergeProps({ id: "executive-dashboard" }, _attrs), {
        header: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            _push2(ssrRenderComponent(_component_UDashboardNavbar, { title: unref(pageTitle) }, {
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
                  _push3(`<div class="flex items-center gap-3" data-v-0b28a045${_scopeId2}>`);
                  if (unref(isConnected)) {
                    _push3(`<div class="flex items-center gap-2 text-xs text-muted" data-v-0b28a045${_scopeId2}><div class="w-2 h-2 bg-green-500 rounded-full animate-pulse" data-v-0b28a045${_scopeId2}></div> Live Data </div>`);
                  } else {
                    _push3(`<div class="flex items-center gap-2 text-xs text-muted" data-v-0b28a045${_scopeId2}><div class="w-2 h-2 bg-amber-500 rounded-full" data-v-0b28a045${_scopeId2}></div> Demo Mode </div>`);
                  }
                  _push3(ssrRenderComponent(_component_UButton, {
                    icon: "i-lucide-refresh-cw",
                    color: "neutral",
                    variant: "ghost",
                    size: "sm",
                    loading: unref(kpiPending) || unref(cashFlowPending),
                    onClick: refreshAll
                  }, null, _parent3, _scopeId2));
                  _push3(ssrRenderComponent(_component_UButton, {
                    icon: "i-lucide-settings",
                    color: "neutral",
                    variant: "ghost",
                    size: "sm",
                    to: "/settings"
                  }, null, _parent3, _scopeId2));
                  _push3(`</div>`);
                } else {
                  return [
                    createVNode("div", { class: "flex items-center gap-3" }, [
                      unref(isConnected) ? (openBlock(), createBlock("div", {
                        key: 0,
                        class: "flex items-center gap-2 text-xs text-muted"
                      }, [
                        createVNode("div", { class: "w-2 h-2 bg-green-500 rounded-full animate-pulse" }),
                        createTextVNode(" Live Data ")
                      ])) : (openBlock(), createBlock("div", {
                        key: 1,
                        class: "flex items-center gap-2 text-xs text-muted"
                      }, [
                        createVNode("div", { class: "w-2 h-2 bg-amber-500 rounded-full" }),
                        createTextVNode(" Demo Mode ")
                      ])),
                      createVNode(_component_UButton, {
                        icon: "i-lucide-refresh-cw",
                        color: "neutral",
                        variant: "ghost",
                        size: "sm",
                        loading: unref(kpiPending) || unref(cashFlowPending),
                        onClick: refreshAll
                      }, null, 8, ["loading"]),
                      createVNode(_component_UButton, {
                        icon: "i-lucide-settings",
                        color: "neutral",
                        variant: "ghost",
                        size: "sm",
                        to: "/settings"
                      })
                    ])
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
                  _push3(`<div class="flex items-center gap-4" data-v-0b28a045${_scopeId2}>`);
                  if (unref(criticalAlerts).length > 0) {
                    _push3(ssrRenderComponent(_component_UBadge, {
                      label: `${unref(criticalAlerts).length} Critical Alert${unref(criticalAlerts).length > 1 ? "s" : ""}`,
                      color: "red",
                      variant: "subtle"
                    }, null, _parent3, _scopeId2));
                  } else {
                    _push3(`<!---->`);
                  }
                  _push3(`<span class="text-xs text-muted" data-v-0b28a045${_scopeId2}> Updated ${ssrInterpolate((/* @__PURE__ */ new Date()).toLocaleTimeString())}</span></div>`);
                } else {
                  return [
                    createVNode("div", { class: "flex items-center gap-4" }, [
                      unref(criticalAlerts).length > 0 ? (openBlock(), createBlock(_component_UBadge, {
                        key: 0,
                        label: `${unref(criticalAlerts).length} Critical Alert${unref(criticalAlerts).length > 1 ? "s" : ""}`,
                        color: "red",
                        variant: "subtle"
                      }, null, 8, ["label"])) : createCommentVNode("", true),
                      createVNode("span", { class: "text-xs text-muted" }, " Updated " + toDisplayString((/* @__PURE__ */ new Date()).toLocaleTimeString()), 1)
                    ])
                  ];
                }
              }),
              _: 1
            }, _parent2, _scopeId));
          } else {
            return [
              createVNode(_component_UDashboardNavbar, { title: unref(pageTitle) }, {
                leading: withCtx(() => [
                  createVNode(_component_UDashboardSidebarCollapse)
                ]),
                right: withCtx(() => [
                  createVNode("div", { class: "flex items-center gap-3" }, [
                    unref(isConnected) ? (openBlock(), createBlock("div", {
                      key: 0,
                      class: "flex items-center gap-2 text-xs text-muted"
                    }, [
                      createVNode("div", { class: "w-2 h-2 bg-green-500 rounded-full animate-pulse" }),
                      createTextVNode(" Live Data ")
                    ])) : (openBlock(), createBlock("div", {
                      key: 1,
                      class: "flex items-center gap-2 text-xs text-muted"
                    }, [
                      createVNode("div", { class: "w-2 h-2 bg-amber-500 rounded-full" }),
                      createTextVNode(" Demo Mode ")
                    ])),
                    createVNode(_component_UButton, {
                      icon: "i-lucide-refresh-cw",
                      color: "neutral",
                      variant: "ghost",
                      size: "sm",
                      loading: unref(kpiPending) || unref(cashFlowPending),
                      onClick: refreshAll
                    }, null, 8, ["loading"]),
                    createVNode(_component_UButton, {
                      icon: "i-lucide-settings",
                      color: "neutral",
                      variant: "ghost",
                      size: "sm",
                      to: "/settings"
                    })
                  ])
                ]),
                _: 1
              }, 8, ["title"]),
              createVNode(_component_UDashboardToolbar, null, {
                left: withCtx(() => [
                  createVNode(_component_UBreadcrumb, { links: unref(breadcrumbs) }, null, 8, ["links"])
                ]),
                right: withCtx(() => [
                  createVNode("div", { class: "flex items-center gap-4" }, [
                    unref(criticalAlerts).length > 0 ? (openBlock(), createBlock(_component_UBadge, {
                      key: 0,
                      label: `${unref(criticalAlerts).length} Critical Alert${unref(criticalAlerts).length > 1 ? "s" : ""}`,
                      color: "red",
                      variant: "subtle"
                    }, null, 8, ["label"])) : createCommentVNode("", true),
                    createVNode("span", { class: "text-xs text-muted" }, " Updated " + toDisplayString((/* @__PURE__ */ new Date()).toLocaleTimeString()), 1)
                  ])
                ]),
                _: 1
              })
            ];
          }
        }),
        body: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            if (unref(criticalAlerts).length > 0) {
              _push2(`<div class="mb-6" data-v-0b28a045${_scopeId}><!--[-->`);
              ssrRenderList(unref(criticalAlerts), (alert) => {
                _push2(ssrRenderComponent(_component_UAlert, {
                  key: alert.message,
                  icon: "i-lucide-alert-triangle",
                  color: "red",
                  variant: "subtle",
                  title: alert.type.replace("_", " ").replace(/\b\w/g, (l) => l.toUpperCase()),
                  description: alert.message,
                  class: "mb-2"
                }, null, _parent2, _scopeId));
              });
              _push2(`<!--]--></div>`);
            } else {
              _push2(`<!---->`);
            }
            if (unref(kpiError) && unref(isConnected)) {
              _push2(`<div class="mb-6" data-v-0b28a045${_scopeId}>`);
              _push2(ssrRenderComponent(_component_UAlert, {
                icon: "i-lucide-wifi-off",
                color: "red",
                title: "Connection Error",
                description: "Unable to fetch live data from Xero. Please check your connection."
              }, null, _parent2, _scopeId));
              _push2(`</div>`);
            } else {
              _push2(`<!---->`);
            }
            _push2(`<div class="space-y-6" data-v-0b28a045${_scopeId}>`);
            _push2(ssrRenderComponent(_component_ClientOnly, null, {
              fallback: withCtx((_2, _push3, _parent3, _scopeId2) => {
                if (_push3) {
                  _push3(`<div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-6" data-v-0b28a045${_scopeId2}><!--[-->`);
                  ssrRenderList(4, (i) => {
                    _push3(ssrRenderComponent(_component_USkeleton, {
                      class: "h-32",
                      key: i
                    }, null, _parent3, _scopeId2));
                  });
                  _push3(`<!--]--></div>`);
                } else {
                  return [
                    createVNode("div", { class: "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-6" }, [
                      (openBlock(), createBlock(Fragment, null, renderList(4, (i) => {
                        return createVNode(_component_USkeleton, {
                          class: "h-32",
                          key: i
                        });
                      }), 64))
                    ])
                  ];
                }
              })
            }, _parent2, _scopeId));
            _push2(`<div class="grid grid-cols-1 xl:grid-cols-3 gap-6" data-v-0b28a045${_scopeId}><div class="xl:col-span-2" data-v-0b28a045${_scopeId}>`);
            _push2(ssrRenderComponent(_component_ClientOnly, null, {
              fallback: withCtx((_2, _push3, _parent3, _scopeId2) => {
                if (_push3) {
                  _push3(ssrRenderComponent(_component_USkeleton, { class: "h-80" }, null, _parent3, _scopeId2));
                } else {
                  return [
                    createVNode(_component_USkeleton, { class: "h-80" })
                  ];
                }
              })
            }, _parent2, _scopeId));
            _push2(`</div><div data-v-0b28a045${_scopeId}>`);
            _push2(ssrRenderComponent(_component_ClientOnly, null, {
              fallback: withCtx((_2, _push3, _parent3, _scopeId2) => {
                if (_push3) {
                  _push3(ssrRenderComponent(_component_USkeleton, { class: "h-80" }, null, _parent3, _scopeId2));
                } else {
                  return [
                    createVNode(_component_USkeleton, { class: "h-80" })
                  ];
                }
              })
            }, _parent2, _scopeId));
            _push2(`</div></div>`);
            _push2(ssrRenderComponent(_component_ClientOnly, null, {
              fallback: withCtx((_2, _push3, _parent3, _scopeId2) => {
                if (_push3) {
                  _push3(ssrRenderComponent(_component_USkeleton, { class: "h-64" }, null, _parent3, _scopeId2));
                } else {
                  return [
                    createVNode(_component_USkeleton, { class: "h-64" })
                  ];
                }
              })
            }, _parent2, _scopeId));
            _push2(ssrRenderComponent(_component_UCard, null, {
              header: withCtx((_2, _push3, _parent3, _scopeId2) => {
                if (_push3) {
                  _push3(`<div class="flex items-center justify-between" data-v-0b28a045${_scopeId2}><h3 class="text-lg font-semibold" data-v-0b28a045${_scopeId2}>Quick Actions</h3><span class="text-xs bg-muted px-2 py-1 rounded" data-v-0b28a045${_scopeId2}>Cmd+K</span></div>`);
                } else {
                  return [
                    createVNode("div", { class: "flex items-center justify-between" }, [
                      createVNode("h3", { class: "text-lg font-semibold" }, "Quick Actions"),
                      createVNode("span", { class: "text-xs bg-muted px-2 py-1 rounded" }, "Cmd+K")
                    ])
                  ];
                }
              }),
              default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                if (_push3) {
                  _push3(`<div class="grid grid-cols-2 md:grid-cols-4 gap-4" data-v-0b28a045${_scopeId2}>`);
                  _push3(ssrRenderComponent(_component_UButton, {
                    to: "/expenses",
                    color: "neutral",
                    variant: "subtle",
                    class: "flex flex-col items-center p-4 h-auto"
                  }, {
                    default: withCtx((_3, _push4, _parent4, _scopeId3) => {
                      if (_push4) {
                        _push4(ssrRenderComponent(_component_UIcon, {
                          name: "i-lucide-credit-card",
                          class: "h-6 w-6 mb-2"
                        }, null, _parent4, _scopeId3));
                        _push4(`<span class="text-sm" data-v-0b28a045${_scopeId3}>Expense Analytics</span>`);
                      } else {
                        return [
                          createVNode(_component_UIcon, {
                            name: "i-lucide-credit-card",
                            class: "h-6 w-6 mb-2"
                          }),
                          createVNode("span", { class: "text-sm" }, "Expense Analytics")
                        ];
                      }
                    }),
                    _: 1
                  }, _parent3, _scopeId2));
                  _push3(ssrRenderComponent(_component_UButton, {
                    to: "/reports",
                    color: "neutral",
                    variant: "subtle",
                    class: "flex flex-col items-center p-4 h-auto"
                  }, {
                    default: withCtx((_3, _push4, _parent4, _scopeId3) => {
                      if (_push4) {
                        _push4(ssrRenderComponent(_component_UIcon, {
                          name: "i-lucide-bar-chart-3",
                          class: "h-6 w-6 mb-2"
                        }, null, _parent4, _scopeId3));
                        _push4(`<span class="text-sm" data-v-0b28a045${_scopeId3}>Financial Reports</span>`);
                      } else {
                        return [
                          createVNode(_component_UIcon, {
                            name: "i-lucide-bar-chart-3",
                            class: "h-6 w-6 mb-2"
                          }),
                          createVNode("span", { class: "text-sm" }, "Financial Reports")
                        ];
                      }
                    }),
                    _: 1
                  }, _parent3, _scopeId2));
                  _push3(ssrRenderComponent(_component_UButton, {
                    to: "/cashflow",
                    color: "neutral",
                    variant: "subtle",
                    class: "flex flex-col items-center p-4 h-auto"
                  }, {
                    default: withCtx((_3, _push4, _parent4, _scopeId3) => {
                      if (_push4) {
                        _push4(ssrRenderComponent(_component_UIcon, {
                          name: "i-lucide-trending-up",
                          class: "h-6 w-6 mb-2"
                        }, null, _parent4, _scopeId3));
                        _push4(`<span class="text-sm" data-v-0b28a045${_scopeId3}>Cash Flow</span>`);
                      } else {
                        return [
                          createVNode(_component_UIcon, {
                            name: "i-lucide-trending-up",
                            class: "h-6 w-6 mb-2"
                          }),
                          createVNode("span", { class: "text-sm" }, "Cash Flow")
                        ];
                      }
                    }),
                    _: 1
                  }, _parent3, _scopeId2));
                  _push3(ssrRenderComponent(_component_UButton, {
                    to: "/anomalies",
                    color: "neutral",
                    variant: "subtle",
                    class: "flex flex-col items-center p-4 h-auto"
                  }, {
                    default: withCtx((_3, _push4, _parent4, _scopeId3) => {
                      if (_push4) {
                        _push4(ssrRenderComponent(_component_UIcon, {
                          name: "i-lucide-search",
                          class: "h-6 w-6 mb-2"
                        }, null, _parent4, _scopeId3));
                        _push4(`<span class="text-sm" data-v-0b28a045${_scopeId3}>Anomaly Detection</span>`);
                      } else {
                        return [
                          createVNode(_component_UIcon, {
                            name: "i-lucide-search",
                            class: "h-6 w-6 mb-2"
                          }),
                          createVNode("span", { class: "text-sm" }, "Anomaly Detection")
                        ];
                      }
                    }),
                    _: 1
                  }, _parent3, _scopeId2));
                  _push3(`</div>`);
                } else {
                  return [
                    createVNode("div", { class: "grid grid-cols-2 md:grid-cols-4 gap-4" }, [
                      createVNode(_component_UButton, {
                        to: "/expenses",
                        color: "neutral",
                        variant: "subtle",
                        class: "flex flex-col items-center p-4 h-auto"
                      }, {
                        default: withCtx(() => [
                          createVNode(_component_UIcon, {
                            name: "i-lucide-credit-card",
                            class: "h-6 w-6 mb-2"
                          }),
                          createVNode("span", { class: "text-sm" }, "Expense Analytics")
                        ]),
                        _: 1
                      }),
                      createVNode(_component_UButton, {
                        to: "/reports",
                        color: "neutral",
                        variant: "subtle",
                        class: "flex flex-col items-center p-4 h-auto"
                      }, {
                        default: withCtx(() => [
                          createVNode(_component_UIcon, {
                            name: "i-lucide-bar-chart-3",
                            class: "h-6 w-6 mb-2"
                          }),
                          createVNode("span", { class: "text-sm" }, "Financial Reports")
                        ]),
                        _: 1
                      }),
                      createVNode(_component_UButton, {
                        to: "/cashflow",
                        color: "neutral",
                        variant: "subtle",
                        class: "flex flex-col items-center p-4 h-auto"
                      }, {
                        default: withCtx(() => [
                          createVNode(_component_UIcon, {
                            name: "i-lucide-trending-up",
                            class: "h-6 w-6 mb-2"
                          }),
                          createVNode("span", { class: "text-sm" }, "Cash Flow")
                        ]),
                        _: 1
                      }),
                      createVNode(_component_UButton, {
                        to: "/anomalies",
                        color: "neutral",
                        variant: "subtle",
                        class: "flex flex-col items-center p-4 h-auto"
                      }, {
                        default: withCtx(() => [
                          createVNode(_component_UIcon, {
                            name: "i-lucide-search",
                            class: "h-6 w-6 mb-2"
                          }),
                          createVNode("span", { class: "text-sm" }, "Anomaly Detection")
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
          } else {
            return [
              unref(criticalAlerts).length > 0 ? (openBlock(), createBlock("div", {
                key: 0,
                class: "mb-6"
              }, [
                (openBlock(true), createBlock(Fragment, null, renderList(unref(criticalAlerts), (alert) => {
                  return openBlock(), createBlock(_component_UAlert, {
                    key: alert.message,
                    icon: "i-lucide-alert-triangle",
                    color: "red",
                    variant: "subtle",
                    title: alert.type.replace("_", " ").replace(/\b\w/g, (l) => l.toUpperCase()),
                    description: alert.message,
                    class: "mb-2"
                  }, null, 8, ["title", "description"]);
                }), 128))
              ])) : createCommentVNode("", true),
              unref(kpiError) && unref(isConnected) ? (openBlock(), createBlock("div", {
                key: 1,
                class: "mb-6"
              }, [
                createVNode(_component_UAlert, {
                  icon: "i-lucide-wifi-off",
                  color: "red",
                  title: "Connection Error",
                  description: "Unable to fetch live data from Xero. Please check your connection."
                })
              ])) : createCommentVNode("", true),
              createVNode("div", { class: "space-y-6" }, [
                createVNode(_component_ClientOnly, null, {
                  fallback: withCtx(() => [
                    createVNode("div", { class: "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-6" }, [
                      (openBlock(), createBlock(Fragment, null, renderList(4, (i) => {
                        return createVNode(_component_USkeleton, {
                          class: "h-32",
                          key: i
                        });
                      }), 64))
                    ])
                  ]),
                  default: withCtx(() => [
                    createVNode(unref(AsyncKPICards), {
                      data: unref(kpiData),
                      loading: unref(kpiPending),
                      connected: unref(isConnected)
                    }, null, 8, ["data", "loading", "connected"])
                  ]),
                  _: 1
                }),
                createVNode("div", { class: "grid grid-cols-1 xl:grid-cols-3 gap-6" }, [
                  createVNode("div", { class: "xl:col-span-2" }, [
                    createVNode(_component_ClientOnly, null, {
                      fallback: withCtx(() => [
                        createVNode(_component_USkeleton, { class: "h-80" })
                      ]),
                      default: withCtx(() => [
                        createVNode(unref(AsyncCashFlowChart), {
                          data: unref(cashFlowData),
                          loading: unref(cashFlowPending)
                        }, null, 8, ["data", "loading"])
                      ]),
                      _: 1
                    })
                  ]),
                  createVNode("div", null, [
                    createVNode(_component_ClientOnly, null, {
                      fallback: withCtx(() => [
                        createVNode(_component_USkeleton, { class: "h-80" })
                      ]),
                      default: withCtx(() => [
                        createVNode(unref(AsyncAnomalyAlerts), {
                          data: unref(anomalyData),
                          loading: unref(anomalyPending)
                        }, null, 8, ["data", "loading"])
                      ]),
                      _: 1
                    })
                  ])
                ]),
                createVNode(_component_ClientOnly, null, {
                  fallback: withCtx(() => [
                    createVNode(_component_USkeleton, { class: "h-64" })
                  ]),
                  default: withCtx(() => [
                    createVNode(unref(AsyncInvoicePipeline), {
                      data: unref(pipelineData),
                      loading: unref(pipelinePending)
                    }, null, 8, ["data", "loading"])
                  ]),
                  _: 1
                }),
                createVNode(_component_UCard, null, {
                  header: withCtx(() => [
                    createVNode("div", { class: "flex items-center justify-between" }, [
                      createVNode("h3", { class: "text-lg font-semibold" }, "Quick Actions"),
                      createVNode("span", { class: "text-xs bg-muted px-2 py-1 rounded" }, "Cmd+K")
                    ])
                  ]),
                  default: withCtx(() => [
                    createVNode("div", { class: "grid grid-cols-2 md:grid-cols-4 gap-4" }, [
                      createVNode(_component_UButton, {
                        to: "/expenses",
                        color: "neutral",
                        variant: "subtle",
                        class: "flex flex-col items-center p-4 h-auto"
                      }, {
                        default: withCtx(() => [
                          createVNode(_component_UIcon, {
                            name: "i-lucide-credit-card",
                            class: "h-6 w-6 mb-2"
                          }),
                          createVNode("span", { class: "text-sm" }, "Expense Analytics")
                        ]),
                        _: 1
                      }),
                      createVNode(_component_UButton, {
                        to: "/reports",
                        color: "neutral",
                        variant: "subtle",
                        class: "flex flex-col items-center p-4 h-auto"
                      }, {
                        default: withCtx(() => [
                          createVNode(_component_UIcon, {
                            name: "i-lucide-bar-chart-3",
                            class: "h-6 w-6 mb-2"
                          }),
                          createVNode("span", { class: "text-sm" }, "Financial Reports")
                        ]),
                        _: 1
                      }),
                      createVNode(_component_UButton, {
                        to: "/cashflow",
                        color: "neutral",
                        variant: "subtle",
                        class: "flex flex-col items-center p-4 h-auto"
                      }, {
                        default: withCtx(() => [
                          createVNode(_component_UIcon, {
                            name: "i-lucide-trending-up",
                            class: "h-6 w-6 mb-2"
                          }),
                          createVNode("span", { class: "text-sm" }, "Cash Flow")
                        ]),
                        _: 1
                      }),
                      createVNode(_component_UButton, {
                        to: "/anomalies",
                        color: "neutral",
                        variant: "subtle",
                        class: "flex flex-col items-center p-4 h-auto"
                      }, {
                        default: withCtx(() => [
                          createVNode(_component_UIcon, {
                            name: "i-lucide-search",
                            class: "h-6 w-6 mb-2"
                          }),
                          createVNode("span", { class: "text-sm" }, "Anomaly Detection")
                        ]),
                        _: 1
                      })
                    ])
                  ]),
                  _: 1
                })
              ])
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
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("pages/dashboard.vue");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const dashboard = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-0b28a045"]]);

export { dashboard as default };
//# sourceMappingURL=dashboard-DnWxwe96.mjs.map
