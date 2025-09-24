import { _ as _sfc_main$1$1, a as _sfc_main$5 } from './DashboardNavbar-Dma8e2D0.mjs';
import { _ as _sfc_main$6 } from './DashboardSidebarCollapse-Bb0ddWxH.mjs';
import { e as useFetch, _ as _sfc_main$e, d as _sfc_main$9, D as navigateTo, f as __nuxt_component_2$1, c as useToast } from './server.mjs';
import { _ as _sfc_main$7 } from './DashboardToolbar-C9qyFRVV.mjs';
import { _ as _sfc_main$8 } from './Breadcrumb-1kD8Xb-9.mjs';
import { _ as _sfc_main$2 } from './Skeleton-p2Vkb_Gp.mjs';
import { _ as _sfc_main$3 } from './Card-jqGRZ5Ik.mjs';
import { _ as _sfc_main$4 } from './Badge-BfrefdmG.mjs';
import { defineComponent, defineAsyncComponent, withAsyncContext, computed, watch, mergeProps, withCtx, unref, createVNode, createTextVNode, toDisplayString, createBlock, openBlock, Fragment, renderList, createCommentVNode, ref, useSSRContext } from 'vue';
import { ssrRenderComponent, ssrInterpolate, ssrRenderAttr, ssrRenderList, ssrRenderStyle, ssrRenderClass, ssrRenderAttrs } from 'vue/server-renderer';
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

const _sfc_main$1 = /* @__PURE__ */ defineComponent({
  __name: "ExpensesAIInsights",
  __ssrInlineRender: true,
  setup(__props) {
    const isLoading = ref(false);
    const hasLoaded = ref(false);
    const aiData = ref(null);
    const error = ref(null);
    async function loadAIInsights() {
      if (isLoading.value) return;
      if (hasLoaded.value) {
        hasLoaded.value = false;
        aiData.value = null;
      }
      isLoading.value = true;
      error.value = null;
      try {
        const response = await $fetch("/api/ai/expense-insights");
        aiData.value = response;
        hasLoaded.value = true;
      } catch (err) {
        error.value = err;
        console.error("Failed to load AI insights:", err);
      } finally {
        isLoading.value = false;
      }
    }
    const formatCurrency = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0
    }).format;
    const getSeverityColor = (severity) => {
      switch (severity) {
        case "critical":
          return "red";
        case "high":
          return "orange";
        case "medium":
          return "yellow";
        case "low":
          return "blue";
        default:
          return "gray";
      }
    };
    const getImpactColor = (impact) => {
      switch (impact) {
        case "high":
          return "green";
        case "medium":
          return "yellow";
        case "low":
          return "blue";
        default:
          return "gray";
      }
    };
    const getRecommendationIcon = (type) => {
      switch (type) {
        case "cost_reduction":
          return "i-lucide-trending-down";
        case "process_improvement":
          return "i-lucide-settings";
        case "policy_change":
          return "i-lucide-file-text";
        case "vendor_negotiation":
          return "i-lucide-handshake";
        default:
          return "i-lucide-lightbulb";
      }
    };
    return (_ctx, _push, _parent, _attrs) => {
      const _component_UCard = _sfc_main$3;
      const _component_UIcon = _sfc_main$e;
      const _component_UBadge = _sfc_main$4;
      const _component_UButton = _sfc_main$9;
      _push(`<div${ssrRenderAttrs(mergeProps({ class: "space-y-6" }, _attrs))}>`);
      _push(ssrRenderComponent(_component_UCard, { class: "shadow-sm border-0 bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm" }, {
        header: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            _push2(`<div class="flex items-center justify-between"${_scopeId}><div class="flex items-center gap-3"${_scopeId}><div class="p-2 bg-purple-100 dark:bg-purple-900/50 rounded-lg"${_scopeId}>`);
            _push2(ssrRenderComponent(_component_UIcon, {
              name: "i-lucide-brain",
              class: "h-5 w-5 text-purple-600 dark:text-purple-400"
            }, null, _parent2, _scopeId));
            _push2(`</div><div${_scopeId}><h3 class="text-lg font-semibold"${_scopeId}>AI-Powered Insights</h3><p class="text-sm text-muted"${_scopeId}>Intelligent analysis powered by Groq</p></div></div><div class="flex items-center gap-2"${_scopeId}>`);
            if (unref(aiData)?.data?.model) {
              _push2(ssrRenderComponent(_component_UBadge, {
                color: "purple",
                variant: "subtle"
              }, {
                default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                  if (_push3) {
                    _push3(`${ssrInterpolate(unref(aiData).data.model)}`);
                  } else {
                    return [
                      createTextVNode(toDisplayString(unref(aiData).data.model), 1)
                    ];
                  }
                }),
                _: 1
              }, _parent2, _scopeId));
            } else {
              _push2(`<!---->`);
            }
            if (unref(hasLoaded)) {
              _push2(ssrRenderComponent(_component_UButton, {
                icon: "i-lucide-refresh-cw",
                size: "sm",
                color: "gray",
                variant: "ghost",
                loading: unref(isLoading),
                onClick: loadAIInsights
              }, null, _parent2, _scopeId));
            } else {
              _push2(`<!---->`);
            }
            _push2(`</div></div>`);
          } else {
            return [
              createVNode("div", { class: "flex items-center justify-between" }, [
                createVNode("div", { class: "flex items-center gap-3" }, [
                  createVNode("div", { class: "p-2 bg-purple-100 dark:bg-purple-900/50 rounded-lg" }, [
                    createVNode(_component_UIcon, {
                      name: "i-lucide-brain",
                      class: "h-5 w-5 text-purple-600 dark:text-purple-400"
                    })
                  ]),
                  createVNode("div", null, [
                    createVNode("h3", { class: "text-lg font-semibold" }, "AI-Powered Insights"),
                    createVNode("p", { class: "text-sm text-muted" }, "Intelligent analysis powered by Groq")
                  ])
                ]),
                createVNode("div", { class: "flex items-center gap-2" }, [
                  unref(aiData)?.data?.model ? (openBlock(), createBlock(_component_UBadge, {
                    key: 0,
                    color: "purple",
                    variant: "subtle"
                  }, {
                    default: withCtx(() => [
                      createTextVNode(toDisplayString(unref(aiData).data.model), 1)
                    ]),
                    _: 1
                  })) : createCommentVNode("", true),
                  unref(hasLoaded) ? (openBlock(), createBlock(_component_UButton, {
                    key: 1,
                    icon: "i-lucide-refresh-cw",
                    size: "sm",
                    color: "gray",
                    variant: "ghost",
                    loading: unref(isLoading),
                    onClick: loadAIInsights
                  }, null, 8, ["loading"])) : createCommentVNode("", true)
                ])
              ])
            ];
          }
        }),
        default: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            if (!unref(hasLoaded) && !unref(isLoading) && !unref(error)) {
              _push2(`<div class="p-8 text-center"${_scopeId}><div class="p-6 bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 rounded-2xl mb-6 max-w-md mx-auto"${_scopeId}><div class="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-sm mb-4 w-fit mx-auto"${_scopeId}>`);
              _push2(ssrRenderComponent(_component_UIcon, {
                name: "i-lucide-brain",
                class: "h-8 w-8 text-purple-600 dark:text-purple-400"
              }, null, _parent2, _scopeId));
              _push2(`</div><h3 class="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2"${_scopeId}>AI-Powered Financial Analysis</h3><p class="text-gray-600 dark:text-gray-400 text-sm leading-relaxed"${_scopeId}> Get intelligent insights, anomaly detection, and optimization recommendations powered by advanced AI </p></div>`);
              _push2(ssrRenderComponent(_component_UButton, {
                size: "lg",
                color: "purple",
                onClick: loadAIInsights,
                class: "shadow-lg"
              }, {
                default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                  if (_push3) {
                    _push3(ssrRenderComponent(_component_UIcon, {
                      name: "i-lucide-sparkles",
                      class: "h-5 w-5 mr-2"
                    }, null, _parent3, _scopeId2));
                    _push3(` Generate AI Insights `);
                  } else {
                    return [
                      createVNode(_component_UIcon, {
                        name: "i-lucide-sparkles",
                        class: "h-5 w-5 mr-2"
                      }),
                      createTextVNode(" Generate AI Insights ")
                    ];
                  }
                }),
                _: 1
              }, _parent2, _scopeId));
              _push2(`<p class="text-xs text-gray-500 dark:text-gray-400 mt-4"${_scopeId}> Powered by Groq Llama 3.3 70B • Secure &amp; Private Analysis </p></div>`);
            } else if (unref(isLoading)) {
              _push2(`<div class="p-8"${_scopeId}><div class="text-center"${_scopeId}><div class="p-6 bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 rounded-2xl mb-6 max-w-md mx-auto"${_scopeId}><div class="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-sm mb-4 w-fit mx-auto animate-pulse"${_scopeId}>`);
              _push2(ssrRenderComponent(_component_UIcon, {
                name: "i-lucide-brain",
                class: "h-8 w-8 text-purple-600 dark:text-purple-400"
              }, null, _parent2, _scopeId));
              _push2(`</div><h3 class="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2"${_scopeId}>Analyzing Your Financial Data</h3><p class="text-gray-600 dark:text-gray-400 text-sm"${_scopeId}> Our AI is processing your expense data to generate intelligent insights... </p></div><div class="flex items-center justify-center gap-2"${_scopeId}><div class="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style="${ssrRenderStyle({ "animation-delay": "0ms" })}"${_scopeId}></div><div class="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style="${ssrRenderStyle({ "animation-delay": "150ms" })}"${_scopeId}></div><div class="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style="${ssrRenderStyle({ "animation-delay": "300ms" })}"${_scopeId}></div></div><p class="text-xs text-gray-500 dark:text-gray-400 mt-4"${_scopeId}> This may take a few moments... </p></div></div>`);
            } else if (unref(error)) {
              _push2(`<div class="p-6"${_scopeId}><div class="text-center"${_scopeId}><div class="p-4 bg-blue-100 dark:bg-blue-900/50 rounded-full w-20 h-20 mx-auto mb-4 flex items-center justify-center"${_scopeId}>`);
              _push2(ssrRenderComponent(_component_UIcon, {
                name: "i-lucide-brain",
                class: "h-10 w-10 text-blue-600 dark:text-blue-400"
              }, null, _parent2, _scopeId));
              _push2(`</div><h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2"${_scopeId}>AI Analysis Requires Xero Connection</h3><p class="text-gray-600 dark:text-gray-400 mb-6 max-w-md mx-auto"${_scopeId}> Connect your Xero account to unlock AI-powered expense insights, anomaly detection, and optimization recommendations. </p><div class="flex flex-col sm:flex-row gap-3 justify-center items-center"${_scopeId}>`);
              _push2(ssrRenderComponent(_component_UButton, {
                color: "blue",
                size: "lg",
                onClick: ($event) => ("navigateTo" in _ctx ? _ctx.navigateTo : unref(navigateTo))("/api/xero/login")
              }, {
                default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                  if (_push3) {
                    _push3(ssrRenderComponent(_component_UIcon, {
                      name: "i-lucide-link",
                      class: "h-5 w-5 mr-2"
                    }, null, _parent3, _scopeId2));
                    _push3(` Connect to Xero `);
                  } else {
                    return [
                      createVNode(_component_UIcon, {
                        name: "i-lucide-link",
                        class: "h-5 w-5 mr-2"
                      }),
                      createTextVNode(" Connect to Xero ")
                    ];
                  }
                }),
                _: 1
              }, _parent2, _scopeId));
              _push2(ssrRenderComponent(_component_UButton, {
                color: "gray",
                variant: "ghost",
                size: "lg",
                onClick: ($event) => ("navigateTo" in _ctx ? _ctx.navigateTo : unref(navigateTo))("/settings")
              }, {
                default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                  if (_push3) {
                    _push3(ssrRenderComponent(_component_UIcon, {
                      name: "i-lucide-settings",
                      class: "h-5 w-5 mr-2"
                    }, null, _parent3, _scopeId2));
                    _push3(` Settings `);
                  } else {
                    return [
                      createVNode(_component_UIcon, {
                        name: "i-lucide-settings",
                        class: "h-5 w-5 mr-2"
                      }),
                      createTextVNode(" Settings ")
                    ];
                  }
                }),
                _: 1
              }, _parent2, _scopeId));
              _push2(`</div></div></div>`);
            } else if (unref(aiData)?.data) {
              _push2(`<div class="space-y-6"${_scopeId}><div class="grid grid-cols-1 md:grid-cols-3 gap-4"${_scopeId}><div class="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4"${_scopeId}><div class="flex items-center gap-2 mb-2"${_scopeId}>`);
              _push2(ssrRenderComponent(_component_UIcon, {
                name: "i-lucide-calendar",
                class: "h-4 w-4 text-blue-600"
              }, null, _parent2, _scopeId));
              _push2(`<span class="text-sm font-medium text-muted"${_scopeId}>Current Period</span></div><p class="text-xl font-bold"${_scopeId}>${ssrInterpolate(unref(formatCurrency)(unref(aiData).data.period.current.total))}</p><p class="text-xs text-muted"${_scopeId}>${ssrInterpolate(unref(aiData).data.period.current.transactionCount)} transactions</p></div><div class="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4"${_scopeId}><div class="flex items-center gap-2 mb-2"${_scopeId}>`);
              _push2(ssrRenderComponent(_component_UIcon, {
                name: "i-lucide-trending-up",
                class: "h-4 w-4 text-green-600"
              }, null, _parent2, _scopeId));
              _push2(`<span class="text-sm font-medium text-muted"${_scopeId}>Period Change</span></div><p class="${ssrRenderClass([unref(aiData).data.period.change.amount >= 0 ? "text-red-600" : "text-green-600", "text-xl font-bold"])}"${_scopeId}>${ssrInterpolate(unref(aiData).data.period.change.amount >= 0 ? "+" : "")}${ssrInterpolate(unref(aiData).data.period.change.percentage.toFixed(1))}% </p><p class="text-xs text-muted"${_scopeId}>${ssrInterpolate(unref(formatCurrency)(Math.abs(unref(aiData).data.period.change.amount)))} change</p></div><div class="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4"${_scopeId}><div class="flex items-center gap-2 mb-2"${_scopeId}>`);
              _push2(ssrRenderComponent(_component_UIcon, {
                name: "i-lucide-clock",
                class: "h-4 w-4 text-purple-600"
              }, null, _parent2, _scopeId));
              _push2(`<span class="text-sm font-medium text-muted"${_scopeId}>Last Updated</span></div><p class="text-sm font-medium"${_scopeId}>${ssrInterpolate(new Date(unref(aiData).data.generatedAt).toLocaleTimeString())}</p><p class="text-xs text-muted"${_scopeId}>${ssrInterpolate(new Date(unref(aiData).data.generatedAt).toLocaleDateString())}</p></div></div>`);
              if (unref(aiData).data.insights.summary) {
                _push2(`<div class="bg-blue-50 dark:bg-blue-950/20 rounded-lg p-4"${_scopeId}><div class="flex items-start gap-3"${_scopeId}>`);
                _push2(ssrRenderComponent(_component_UIcon, {
                  name: "i-lucide-lightbulb",
                  class: "h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0"
                }, null, _parent2, _scopeId));
                _push2(`<div${_scopeId}><h4 class="font-semibold text-blue-900 dark:text-blue-100 mb-2"${_scopeId}>Executive Summary</h4><p class="text-blue-800 dark:text-blue-200 leading-relaxed"${_scopeId}>${ssrInterpolate(unref(aiData).data.insights.summary)}</p></div></div></div>`);
              } else {
                _push2(`<!---->`);
              }
              _push2(`</div>`);
            } else {
              _push2(`<!---->`);
            }
          } else {
            return [
              !unref(hasLoaded) && !unref(isLoading) && !unref(error) ? (openBlock(), createBlock("div", {
                key: 0,
                class: "p-8 text-center"
              }, [
                createVNode("div", { class: "p-6 bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 rounded-2xl mb-6 max-w-md mx-auto" }, [
                  createVNode("div", { class: "p-4 bg-white dark:bg-gray-800 rounded-xl shadow-sm mb-4 w-fit mx-auto" }, [
                    createVNode(_component_UIcon, {
                      name: "i-lucide-brain",
                      class: "h-8 w-8 text-purple-600 dark:text-purple-400"
                    })
                  ]),
                  createVNode("h3", { class: "text-xl font-bold text-gray-900 dark:text-gray-100 mb-2" }, "AI-Powered Financial Analysis"),
                  createVNode("p", { class: "text-gray-600 dark:text-gray-400 text-sm leading-relaxed" }, " Get intelligent insights, anomaly detection, and optimization recommendations powered by advanced AI ")
                ]),
                createVNode(_component_UButton, {
                  size: "lg",
                  color: "purple",
                  onClick: loadAIInsights,
                  class: "shadow-lg"
                }, {
                  default: withCtx(() => [
                    createVNode(_component_UIcon, {
                      name: "i-lucide-sparkles",
                      class: "h-5 w-5 mr-2"
                    }),
                    createTextVNode(" Generate AI Insights ")
                  ]),
                  _: 1
                }),
                createVNode("p", { class: "text-xs text-gray-500 dark:text-gray-400 mt-4" }, " Powered by Groq Llama 3.3 70B • Secure & Private Analysis ")
              ])) : unref(isLoading) ? (openBlock(), createBlock("div", {
                key: 1,
                class: "p-8"
              }, [
                createVNode("div", { class: "text-center" }, [
                  createVNode("div", { class: "p-6 bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 rounded-2xl mb-6 max-w-md mx-auto" }, [
                    createVNode("div", { class: "p-4 bg-white dark:bg-gray-800 rounded-xl shadow-sm mb-4 w-fit mx-auto animate-pulse" }, [
                      createVNode(_component_UIcon, {
                        name: "i-lucide-brain",
                        class: "h-8 w-8 text-purple-600 dark:text-purple-400"
                      })
                    ]),
                    createVNode("h3", { class: "text-xl font-bold text-gray-900 dark:text-gray-100 mb-2" }, "Analyzing Your Financial Data"),
                    createVNode("p", { class: "text-gray-600 dark:text-gray-400 text-sm" }, " Our AI is processing your expense data to generate intelligent insights... ")
                  ]),
                  createVNode("div", { class: "flex items-center justify-center gap-2" }, [
                    createVNode("div", {
                      class: "w-2 h-2 bg-purple-400 rounded-full animate-bounce",
                      style: { "animation-delay": "0ms" }
                    }),
                    createVNode("div", {
                      class: "w-2 h-2 bg-purple-400 rounded-full animate-bounce",
                      style: { "animation-delay": "150ms" }
                    }),
                    createVNode("div", {
                      class: "w-2 h-2 bg-purple-400 rounded-full animate-bounce",
                      style: { "animation-delay": "300ms" }
                    })
                  ]),
                  createVNode("p", { class: "text-xs text-gray-500 dark:text-gray-400 mt-4" }, " This may take a few moments... ")
                ])
              ])) : unref(error) ? (openBlock(), createBlock("div", {
                key: 2,
                class: "p-6"
              }, [
                createVNode("div", { class: "text-center" }, [
                  createVNode("div", { class: "p-4 bg-blue-100 dark:bg-blue-900/50 rounded-full w-20 h-20 mx-auto mb-4 flex items-center justify-center" }, [
                    createVNode(_component_UIcon, {
                      name: "i-lucide-brain",
                      class: "h-10 w-10 text-blue-600 dark:text-blue-400"
                    })
                  ]),
                  createVNode("h3", { class: "text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2" }, "AI Analysis Requires Xero Connection"),
                  createVNode("p", { class: "text-gray-600 dark:text-gray-400 mb-6 max-w-md mx-auto" }, " Connect your Xero account to unlock AI-powered expense insights, anomaly detection, and optimization recommendations. "),
                  createVNode("div", { class: "flex flex-col sm:flex-row gap-3 justify-center items-center" }, [
                    createVNode(_component_UButton, {
                      color: "blue",
                      size: "lg",
                      onClick: ($event) => ("navigateTo" in _ctx ? _ctx.navigateTo : unref(navigateTo))("/api/xero/login")
                    }, {
                      default: withCtx(() => [
                        createVNode(_component_UIcon, {
                          name: "i-lucide-link",
                          class: "h-5 w-5 mr-2"
                        }),
                        createTextVNode(" Connect to Xero ")
                      ]),
                      _: 1
                    }, 8, ["onClick"]),
                    createVNode(_component_UButton, {
                      color: "gray",
                      variant: "ghost",
                      size: "lg",
                      onClick: ($event) => ("navigateTo" in _ctx ? _ctx.navigateTo : unref(navigateTo))("/settings")
                    }, {
                      default: withCtx(() => [
                        createVNode(_component_UIcon, {
                          name: "i-lucide-settings",
                          class: "h-5 w-5 mr-2"
                        }),
                        createTextVNode(" Settings ")
                      ]),
                      _: 1
                    }, 8, ["onClick"])
                  ])
                ])
              ])) : unref(aiData)?.data ? (openBlock(), createBlock("div", {
                key: 3,
                class: "space-y-6"
              }, [
                createVNode("div", { class: "grid grid-cols-1 md:grid-cols-3 gap-4" }, [
                  createVNode("div", { class: "bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4" }, [
                    createVNode("div", { class: "flex items-center gap-2 mb-2" }, [
                      createVNode(_component_UIcon, {
                        name: "i-lucide-calendar",
                        class: "h-4 w-4 text-blue-600"
                      }),
                      createVNode("span", { class: "text-sm font-medium text-muted" }, "Current Period")
                    ]),
                    createVNode("p", { class: "text-xl font-bold" }, toDisplayString(unref(formatCurrency)(unref(aiData).data.period.current.total)), 1),
                    createVNode("p", { class: "text-xs text-muted" }, toDisplayString(unref(aiData).data.period.current.transactionCount) + " transactions", 1)
                  ]),
                  createVNode("div", { class: "bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4" }, [
                    createVNode("div", { class: "flex items-center gap-2 mb-2" }, [
                      createVNode(_component_UIcon, {
                        name: "i-lucide-trending-up",
                        class: "h-4 w-4 text-green-600"
                      }),
                      createVNode("span", { class: "text-sm font-medium text-muted" }, "Period Change")
                    ]),
                    createVNode("p", {
                      class: ["text-xl font-bold", unref(aiData).data.period.change.amount >= 0 ? "text-red-600" : "text-green-600"]
                    }, toDisplayString(unref(aiData).data.period.change.amount >= 0 ? "+" : "") + toDisplayString(unref(aiData).data.period.change.percentage.toFixed(1)) + "% ", 3),
                    createVNode("p", { class: "text-xs text-muted" }, toDisplayString(unref(formatCurrency)(Math.abs(unref(aiData).data.period.change.amount))) + " change", 1)
                  ]),
                  createVNode("div", { class: "bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4" }, [
                    createVNode("div", { class: "flex items-center gap-2 mb-2" }, [
                      createVNode(_component_UIcon, {
                        name: "i-lucide-clock",
                        class: "h-4 w-4 text-purple-600"
                      }),
                      createVNode("span", { class: "text-sm font-medium text-muted" }, "Last Updated")
                    ]),
                    createVNode("p", { class: "text-sm font-medium" }, toDisplayString(new Date(unref(aiData).data.generatedAt).toLocaleTimeString()), 1),
                    createVNode("p", { class: "text-xs text-muted" }, toDisplayString(new Date(unref(aiData).data.generatedAt).toLocaleDateString()), 1)
                  ])
                ]),
                unref(aiData).data.insights.summary ? (openBlock(), createBlock("div", {
                  key: 0,
                  class: "bg-blue-50 dark:bg-blue-950/20 rounded-lg p-4"
                }, [
                  createVNode("div", { class: "flex items-start gap-3" }, [
                    createVNode(_component_UIcon, {
                      name: "i-lucide-lightbulb",
                      class: "h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0"
                    }),
                    createVNode("div", null, [
                      createVNode("h4", { class: "font-semibold text-blue-900 dark:text-blue-100 mb-2" }, "Executive Summary"),
                      createVNode("p", { class: "text-blue-800 dark:text-blue-200 leading-relaxed" }, toDisplayString(unref(aiData).data.insights.summary), 1)
                    ])
                  ])
                ])) : createCommentVNode("", true)
              ])) : createCommentVNode("", true)
            ];
          }
        }),
        _: 1
      }, _parent));
      if (unref(aiData)?.data?.anomalies?.anomalies?.length) {
        _push(ssrRenderComponent(_component_UCard, null, {
          header: withCtx((_, _push2, _parent2, _scopeId) => {
            if (_push2) {
              _push2(`<div class="flex items-center gap-3"${_scopeId}><div class="p-2 bg-red-100 dark:bg-red-900/50 rounded-lg"${_scopeId}>`);
              _push2(ssrRenderComponent(_component_UIcon, {
                name: "i-lucide-alert-triangle",
                class: "h-5 w-5 text-red-600 dark:text-red-400"
              }, null, _parent2, _scopeId));
              _push2(`</div><div${_scopeId}><h3 class="text-lg font-semibold"${_scopeId}>Anomalies Detected</h3><p class="text-sm text-muted"${_scopeId}>${ssrInterpolate(unref(aiData).data.anomalies.anomalies.length)} issues found</p></div></div>`);
            } else {
              return [
                createVNode("div", { class: "flex items-center gap-3" }, [
                  createVNode("div", { class: "p-2 bg-red-100 dark:bg-red-900/50 rounded-lg" }, [
                    createVNode(_component_UIcon, {
                      name: "i-lucide-alert-triangle",
                      class: "h-5 w-5 text-red-600 dark:text-red-400"
                    })
                  ]),
                  createVNode("div", null, [
                    createVNode("h3", { class: "text-lg font-semibold" }, "Anomalies Detected"),
                    createVNode("p", { class: "text-sm text-muted" }, toDisplayString(unref(aiData).data.anomalies.anomalies.length) + " issues found", 1)
                  ])
                ])
              ];
            }
          }),
          default: withCtx((_, _push2, _parent2, _scopeId) => {
            if (_push2) {
              _push2(`<div class="space-y-3"${_scopeId}><!--[-->`);
              ssrRenderList(unref(aiData).data.anomalies.anomalies, (anomaly, index) => {
                _push2(`<div class="border border-gray-200 dark:border-gray-700 rounded-lg p-4"${_scopeId}><div class="flex items-start justify-between mb-2"${_scopeId}><div class="flex items-center gap-2"${_scopeId}>`);
                _push2(ssrRenderComponent(_component_UBadge, {
                  color: getSeverityColor(anomaly.severity),
                  variant: "subtle"
                }, {
                  default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                    if (_push3) {
                      _push3(`${ssrInterpolate(anomaly.severity.toUpperCase())}`);
                    } else {
                      return [
                        createTextVNode(toDisplayString(anomaly.severity.toUpperCase()), 1)
                      ];
                    }
                  }),
                  _: 2
                }, _parent2, _scopeId));
                _push2(`<span class="font-medium"${_scopeId}>${ssrInterpolate(anomaly.type)}</span></div><span class="text-sm font-semibold"${_scopeId}>${ssrInterpolate(unref(formatCurrency)(anomaly.amount))}</span></div><p class="text-sm text-gray-700 dark:text-gray-300 mb-2"${_scopeId}>${ssrInterpolate(anomaly.description)}</p><div class="bg-green-50 dark:bg-green-950/20 rounded p-3"${_scopeId}><div class="flex items-start gap-2"${_scopeId}>`);
                _push2(ssrRenderComponent(_component_UIcon, {
                  name: "i-lucide-lightbulb",
                  class: "h-4 w-4 text-green-600 mt-0.5 flex-shrink-0"
                }, null, _parent2, _scopeId));
                _push2(`<p class="text-sm text-green-800 dark:text-green-200"${_scopeId}>${ssrInterpolate(anomaly.suggestion)}</p></div></div></div>`);
              });
              _push2(`<!--]--></div>`);
            } else {
              return [
                createVNode("div", { class: "space-y-3" }, [
                  (openBlock(true), createBlock(Fragment, null, renderList(unref(aiData).data.anomalies.anomalies, (anomaly, index) => {
                    return openBlock(), createBlock("div", {
                      key: index,
                      class: "border border-gray-200 dark:border-gray-700 rounded-lg p-4"
                    }, [
                      createVNode("div", { class: "flex items-start justify-between mb-2" }, [
                        createVNode("div", { class: "flex items-center gap-2" }, [
                          createVNode(_component_UBadge, {
                            color: getSeverityColor(anomaly.severity),
                            variant: "subtle"
                          }, {
                            default: withCtx(() => [
                              createTextVNode(toDisplayString(anomaly.severity.toUpperCase()), 1)
                            ]),
                            _: 2
                          }, 1032, ["color"]),
                          createVNode("span", { class: "font-medium" }, toDisplayString(anomaly.type), 1)
                        ]),
                        createVNode("span", { class: "text-sm font-semibold" }, toDisplayString(unref(formatCurrency)(anomaly.amount)), 1)
                      ]),
                      createVNode("p", { class: "text-sm text-gray-700 dark:text-gray-300 mb-2" }, toDisplayString(anomaly.description), 1),
                      createVNode("div", { class: "bg-green-50 dark:bg-green-950/20 rounded p-3" }, [
                        createVNode("div", { class: "flex items-start gap-2" }, [
                          createVNode(_component_UIcon, {
                            name: "i-lucide-lightbulb",
                            class: "h-4 w-4 text-green-600 mt-0.5 flex-shrink-0"
                          }),
                          createVNode("p", { class: "text-sm text-green-800 dark:text-green-200" }, toDisplayString(anomaly.suggestion), 1)
                        ])
                      ])
                    ]);
                  }), 128))
                ])
              ];
            }
          }),
          _: 1
        }, _parent));
      } else {
        _push(`<!---->`);
      }
      if (unref(aiData)?.data?.optimization?.recommendations?.length) {
        _push(ssrRenderComponent(_component_UCard, null, {
          header: withCtx((_, _push2, _parent2, _scopeId) => {
            if (_push2) {
              _push2(`<div class="flex items-center gap-3"${_scopeId}><div class="p-2 bg-green-100 dark:bg-green-900/50 rounded-lg"${_scopeId}>`);
              _push2(ssrRenderComponent(_component_UIcon, {
                name: "i-lucide-target",
                class: "h-5 w-5 text-green-600 dark:text-green-400"
              }, null, _parent2, _scopeId));
              _push2(`</div><div${_scopeId}><h3 class="text-lg font-semibold"${_scopeId}>Optimization Opportunities</h3><p class="text-sm text-muted"${_scopeId}>${ssrInterpolate(unref(aiData).data.optimization.recommendations.length)} recommendations</p></div></div>`);
            } else {
              return [
                createVNode("div", { class: "flex items-center gap-3" }, [
                  createVNode("div", { class: "p-2 bg-green-100 dark:bg-green-900/50 rounded-lg" }, [
                    createVNode(_component_UIcon, {
                      name: "i-lucide-target",
                      class: "h-5 w-5 text-green-600 dark:text-green-400"
                    })
                  ]),
                  createVNode("div", null, [
                    createVNode("h3", { class: "text-lg font-semibold" }, "Optimization Opportunities"),
                    createVNode("p", { class: "text-sm text-muted" }, toDisplayString(unref(aiData).data.optimization.recommendations.length) + " recommendations", 1)
                  ])
                ])
              ];
            }
          }),
          default: withCtx((_, _push2, _parent2, _scopeId) => {
            if (_push2) {
              _push2(`<div class="space-y-4"${_scopeId}><!--[-->`);
              ssrRenderList(unref(aiData).data.optimization.recommendations, (rec, index) => {
                _push2(`<div class="border border-gray-200 dark:border-gray-700 rounded-lg p-4"${_scopeId}><div class="flex items-start justify-between mb-3"${_scopeId}><div class="flex items-center gap-3"${_scopeId}>`);
                _push2(ssrRenderComponent(_component_UIcon, {
                  name: getRecommendationIcon(rec.type),
                  class: "h-5 w-5 text-gray-600"
                }, null, _parent2, _scopeId));
                _push2(`<div${_scopeId}><div class="flex items-center gap-2 mb-1"${_scopeId}><span class="font-medium"${_scopeId}>${ssrInterpolate(rec.category)}</span>`);
                _push2(ssrRenderComponent(_component_UBadge, {
                  color: getImpactColor(rec.impact),
                  variant: "subtle"
                }, {
                  default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                    if (_push3) {
                      _push3(`${ssrInterpolate(rec.impact.toUpperCase())} IMPACT `);
                    } else {
                      return [
                        createTextVNode(toDisplayString(rec.impact.toUpperCase()) + " IMPACT ", 1)
                      ];
                    }
                  }),
                  _: 2
                }, _parent2, _scopeId));
                _push2(`</div><p class="text-sm text-muted capitalize"${_scopeId}>${ssrInterpolate(rec.type.replace("_", " "))}</p></div></div><div class="text-right"${_scopeId}><p class="text-lg font-bold text-green-600"${_scopeId}>${ssrInterpolate(unref(formatCurrency)(rec.savings_potential))}</p><p class="text-xs text-muted"${_scopeId}>Potential Savings</p></div></div><p class="text-sm text-gray-700 dark:text-gray-300 mb-3"${_scopeId}>${ssrInterpolate(rec.description)}</p><div class="bg-blue-50 dark:bg-blue-950/20 rounded-lg p-3"${_scopeId}><h5 class="text-sm font-medium text-blue-900 dark:text-blue-100 mb-2"${_scopeId}>Action Steps:</h5><ul class="space-y-1"${_scopeId}><!--[-->`);
                ssrRenderList(rec.action_steps, (step, stepIndex) => {
                  _push2(`<li class="flex items-start gap-2 text-sm text-blue-800 dark:text-blue-200"${_scopeId}><span class="text-blue-600 font-medium"${_scopeId}>${ssrInterpolate(stepIndex + 1)}.</span><span${_scopeId}>${ssrInterpolate(step)}</span></li>`);
                });
                _push2(`<!--]--></ul></div></div>`);
              });
              _push2(`<!--]--></div>`);
            } else {
              return [
                createVNode("div", { class: "space-y-4" }, [
                  (openBlock(true), createBlock(Fragment, null, renderList(unref(aiData).data.optimization.recommendations, (rec, index) => {
                    return openBlock(), createBlock("div", {
                      key: index,
                      class: "border border-gray-200 dark:border-gray-700 rounded-lg p-4"
                    }, [
                      createVNode("div", { class: "flex items-start justify-between mb-3" }, [
                        createVNode("div", { class: "flex items-center gap-3" }, [
                          createVNode(_component_UIcon, {
                            name: getRecommendationIcon(rec.type),
                            class: "h-5 w-5 text-gray-600"
                          }, null, 8, ["name"]),
                          createVNode("div", null, [
                            createVNode("div", { class: "flex items-center gap-2 mb-1" }, [
                              createVNode("span", { class: "font-medium" }, toDisplayString(rec.category), 1),
                              createVNode(_component_UBadge, {
                                color: getImpactColor(rec.impact),
                                variant: "subtle"
                              }, {
                                default: withCtx(() => [
                                  createTextVNode(toDisplayString(rec.impact.toUpperCase()) + " IMPACT ", 1)
                                ]),
                                _: 2
                              }, 1032, ["color"])
                            ]),
                            createVNode("p", { class: "text-sm text-muted capitalize" }, toDisplayString(rec.type.replace("_", " ")), 1)
                          ])
                        ]),
                        createVNode("div", { class: "text-right" }, [
                          createVNode("p", { class: "text-lg font-bold text-green-600" }, toDisplayString(unref(formatCurrency)(rec.savings_potential)), 1),
                          createVNode("p", { class: "text-xs text-muted" }, "Potential Savings")
                        ])
                      ]),
                      createVNode("p", { class: "text-sm text-gray-700 dark:text-gray-300 mb-3" }, toDisplayString(rec.description), 1),
                      createVNode("div", { class: "bg-blue-50 dark:bg-blue-950/20 rounded-lg p-3" }, [
                        createVNode("h5", { class: "text-sm font-medium text-blue-900 dark:text-blue-100 mb-2" }, "Action Steps:"),
                        createVNode("ul", { class: "space-y-1" }, [
                          (openBlock(true), createBlock(Fragment, null, renderList(rec.action_steps, (step, stepIndex) => {
                            return openBlock(), createBlock("li", {
                              key: stepIndex,
                              class: "flex items-start gap-2 text-sm text-blue-800 dark:text-blue-200"
                            }, [
                              createVNode("span", { class: "text-blue-600 font-medium" }, toDisplayString(stepIndex + 1) + ".", 1),
                              createVNode("span", null, toDisplayString(step), 1)
                            ]);
                          }), 128))
                        ])
                      ])
                    ]);
                  }), 128))
                ])
              ];
            }
          }),
          _: 1
        }, _parent));
      } else {
        _push(`<!---->`);
      }
      if (unref(aiData)?.data?.insights) {
        _push(`<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">`);
        if (unref(aiData).data.insights.trends?.length) {
          _push(ssrRenderComponent(_component_UCard, null, {
            header: withCtx((_, _push2, _parent2, _scopeId) => {
              if (_push2) {
                _push2(`<div class="flex items-center gap-3"${_scopeId}>`);
                _push2(ssrRenderComponent(_component_UIcon, {
                  name: "i-lucide-trending-up",
                  class: "h-5 w-5 text-blue-600"
                }, null, _parent2, _scopeId));
                _push2(`<h3 class="font-semibold"${_scopeId}>Spending Trends</h3></div>`);
              } else {
                return [
                  createVNode("div", { class: "flex items-center gap-3" }, [
                    createVNode(_component_UIcon, {
                      name: "i-lucide-trending-up",
                      class: "h-5 w-5 text-blue-600"
                    }),
                    createVNode("h3", { class: "font-semibold" }, "Spending Trends")
                  ])
                ];
              }
            }),
            default: withCtx((_, _push2, _parent2, _scopeId) => {
              if (_push2) {
                _push2(`<ul class="space-y-3"${_scopeId}><!--[-->`);
                ssrRenderList(unref(aiData).data.insights.trends, (trend, index) => {
                  _push2(`<li class="flex items-start gap-3"${_scopeId}><div class="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"${_scopeId}></div><p class="text-sm"${_scopeId}>${ssrInterpolate(trend)}</p></li>`);
                });
                _push2(`<!--]--></ul>`);
              } else {
                return [
                  createVNode("ul", { class: "space-y-3" }, [
                    (openBlock(true), createBlock(Fragment, null, renderList(unref(aiData).data.insights.trends, (trend, index) => {
                      return openBlock(), createBlock("li", {
                        key: index,
                        class: "flex items-start gap-3"
                      }, [
                        createVNode("div", { class: "w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0" }),
                        createVNode("p", { class: "text-sm" }, toDisplayString(trend), 1)
                      ]);
                    }), 128))
                  ])
                ];
              }
            }),
            _: 1
          }, _parent));
        } else {
          _push(`<!---->`);
        }
        if (unref(aiData).data.insights.insights?.length) {
          _push(ssrRenderComponent(_component_UCard, null, {
            header: withCtx((_, _push2, _parent2, _scopeId) => {
              if (_push2) {
                _push2(`<div class="flex items-center gap-3"${_scopeId}>`);
                _push2(ssrRenderComponent(_component_UIcon, {
                  name: "i-lucide-eye",
                  class: "h-5 w-5 text-purple-600"
                }, null, _parent2, _scopeId));
                _push2(`<h3 class="font-semibold"${_scopeId}>Key Insights</h3></div>`);
              } else {
                return [
                  createVNode("div", { class: "flex items-center gap-3" }, [
                    createVNode(_component_UIcon, {
                      name: "i-lucide-eye",
                      class: "h-5 w-5 text-purple-600"
                    }),
                    createVNode("h3", { class: "font-semibold" }, "Key Insights")
                  ])
                ];
              }
            }),
            default: withCtx((_, _push2, _parent2, _scopeId) => {
              if (_push2) {
                _push2(`<ul class="space-y-3"${_scopeId}><!--[-->`);
                ssrRenderList(unref(aiData).data.insights.insights, (insight, index) => {
                  _push2(`<li class="flex items-start gap-3"${_scopeId}><div class="w-2 h-2 bg-purple-500 rounded-full mt-2 flex-shrink-0"${_scopeId}></div><p class="text-sm"${_scopeId}>${ssrInterpolate(insight)}</p></li>`);
                });
                _push2(`<!--]--></ul>`);
              } else {
                return [
                  createVNode("ul", { class: "space-y-3" }, [
                    (openBlock(true), createBlock(Fragment, null, renderList(unref(aiData).data.insights.insights, (insight, index) => {
                      return openBlock(), createBlock("li", {
                        key: index,
                        class: "flex items-start gap-3"
                      }, [
                        createVNode("div", { class: "w-2 h-2 bg-purple-500 rounded-full mt-2 flex-shrink-0" }),
                        createVNode("p", { class: "text-sm" }, toDisplayString(insight), 1)
                      ]);
                    }), 128))
                  ])
                ];
              }
            }),
            _: 1
          }, _parent));
        } else {
          _push(`<!---->`);
        }
        _push(`</div>`);
      } else {
        _push(`<!---->`);
      }
      _push(`</div>`);
    };
  }
});
const _sfc_setup$1 = _sfc_main$1.setup;
_sfc_main$1.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("components/expenses/ExpensesAIInsights.vue");
  return _sfc_setup$1 ? _sfc_setup$1(props, ctx) : void 0;
};
const __nuxt_component_11 = Object.assign(_sfc_main$1, { __name: "ExpensesAIInsights" });
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "index",
  __ssrInlineRender: true,
  async setup(__props) {
    let __temp, __restore;
    const AsyncCategoryDonut = defineAsyncComponent(() => import('./CategoryDonut.client-FLyktHAq.mjs'));
    const AsyncVendorContributionBars = defineAsyncComponent(() => import('./VendorContributionBars.client-DEpEqH7N.mjs'));
    const AsyncCategoryTreemap = defineAsyncComponent(() => import('./CategoryTreemap.client-Nzi3gcYr.mjs'));
    const { data: statusData, refresh: refreshStatus } = ([__temp, __restore] = withAsyncContext(() => useFetch("/api/xero/status", "$4ZSACgDqeX")), __temp = await __temp, __restore(), __temp);
    const isConnected = computed(() => statusData.value?.connected || false);
    const { data, pending, error, refresh } = ([__temp, __restore] = withAsyncContext(() => useFetch("/api/xero/expenses", {
      lazy: true
    }, "$NNgVTOHDDy")), __temp = await __temp, __restore(), __temp);
    watch(isConnected, async (newValue, oldValue) => {
      if (newValue !== oldValue && newValue) {
        await refresh();
      }
    });
    const expensesData = computed(() => data.value ?? null);
    const daySpan = computed(() => {
      const from = expensesData.value?.range?.from;
      const to = expensesData.value?.range?.to;
      if (!from || !to) return 90;
      const fromDate = new Date(from);
      const toDate = new Date(to);
      const diffMs = toDate.valueOf() - fromDate.valueOf();
      return Math.max(Math.ceil(diffMs / (1e3 * 60 * 60 * 24)) || 0, 1);
    });
    const metrics = computed(() => {
      const categories = expensesData.value?.categories ?? [];
      const vendors = expensesData.value?.vendors ?? [];
      const totalSpend = categories.reduce((total, item) => total + (item.amount || 0), 0);
      const averagePerDay = totalSpend / daySpan.value;
      const topCategory = categories[0];
      const topVendor = vendors[0];
      return {
        totalSpend,
        averagePerDay,
        categoryCount: categories.length,
        vendorCount: vendors.length,
        topCategory,
        topVendor
      };
    });
    const breadcrumbs = computed(() => [
      { label: "Reports", to: "/reports" },
      { label: "Expense Analytics", to: "/expenses" }
    ]);
    const rangeDescription = computed(() => {
      if (!isConnected.value) {
        return "Connect to Xero to view expense data";
      }
      const from = expensesData.value?.range?.from;
      const to = expensesData.value?.range?.to;
      if (!from || !to) {
        return "Trailing 90 days";
      }
      return `Last ${daySpan.value} days (${from} → ${to})`;
    });
    function formatCurrency(value) {
      if (typeof value !== "number" || Number.isNaN(value)) return "-";
      return value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
    }
    async function exportData(format) {
      try {
        const { downloadCSV, downloadJSON, getExportFilename } = await import('./export-DLEQSllu.mjs');
        if (!expensesData.value) {
          throw new Error("No data to export");
        }
        const exportData2 = [
          ...expensesData.value.categories.map((item) => ({
            type: "Category",
            name: item.name,
            amount: item.amount,
            dateRange: `${expensesData.value?.range?.from} to ${expensesData.value?.range?.to}`
          })),
          ...expensesData.value.vendors.map((item) => ({
            type: "Vendor",
            name: item.name,
            amount: item.amount,
            dateRange: `${expensesData.value?.range?.from} to ${expensesData.value?.range?.to}`
          }))
        ];
        if (format === "csv") {
          downloadCSV(exportData2, getExportFilename("expenses", "csv"));
        } else {
          downloadJSON({
            exportDate: (/* @__PURE__ */ new Date()).toISOString(),
            dateRange: expensesData.value.range,
            summary: {
              totalSpend: metrics.value.totalSpend,
              averagePerDay: metrics.value.averagePerDay,
              categoryCount: metrics.value.categoryCount,
              vendorCount: metrics.value.vendorCount
            },
            data: exportData2
          }, getExportFilename("expenses", "json"));
        }
        const toast = useToast();
        toast.add({
          title: "Export Successful",
          description: `Expense data exported as ${format.toUpperCase()}`,
          icon: "i-lucide-check-circle",
          color: "green"
        });
      } catch (error2) {
        console.error("Export failed:", error2);
        const toast = useToast();
        toast.add({
          title: "Export Failed",
          description: "Unable to export expense data",
          icon: "i-lucide-alert-circle",
          color: "red"
        });
      }
    }
    return (_ctx, _push, _parent, _attrs) => {
      const _component_UDashboardPanel = _sfc_main$1$1;
      const _component_UDashboardNavbar = _sfc_main$5;
      const _component_UDashboardSidebarCollapse = _sfc_main$6;
      const _component_UButton = _sfc_main$9;
      const _component_UDashboardToolbar = _sfc_main$7;
      const _component_UBreadcrumb = _sfc_main$8;
      const _component_USkeleton = _sfc_main$2;
      const _component_UIcon = _sfc_main$e;
      const _component_UCard = _sfc_main$3;
      const _component_ClientOnly = __nuxt_component_2$1;
      const _component_UBadge = _sfc_main$4;
      const _component_ExpensesAIInsights = __nuxt_component_11;
      _push(ssrRenderComponent(_component_UDashboardPanel, mergeProps({ id: "expenses" }, _attrs), {
        header: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            _push2(ssrRenderComponent(_component_UDashboardNavbar, { title: "Expense Analytics" }, {
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
                  _push3(`<div class="flex items-center gap-2"${_scopeId2}>`);
                  _push3(ssrRenderComponent(_component_UButton, {
                    icon: "i-lucide-download",
                    label: "CSV",
                    color: "neutral",
                    variant: "ghost",
                    size: "sm",
                    onClick: ($event) => exportData("csv")
                  }, null, _parent3, _scopeId2));
                  _push3(ssrRenderComponent(_component_UButton, {
                    icon: "i-lucide-file-code",
                    label: "JSON",
                    color: "neutral",
                    variant: "ghost",
                    size: "sm",
                    onClick: ($event) => exportData("json"),
                    class: "hidden sm:flex"
                  }, null, _parent3, _scopeId2));
                  _push3(ssrRenderComponent(_component_UButton, {
                    icon: "i-lucide-refresh-cw",
                    label: "Refresh",
                    color: "neutral",
                    size: "sm",
                    onClick: async () => {
                      await unref(refreshStatus)();
                      await unref(refresh)();
                    },
                    class: "hidden sm:flex"
                  }, null, _parent3, _scopeId2));
                  _push3(ssrRenderComponent(_component_UButton, {
                    icon: "i-lucide-refresh-cw",
                    color: "neutral",
                    variant: "ghost",
                    size: "sm",
                    onClick: async () => {
                      await unref(refreshStatus)();
                      await unref(refresh)();
                    },
                    class: "sm:hidden"
                  }, null, _parent3, _scopeId2));
                  _push3(`</div>`);
                } else {
                  return [
                    createVNode("div", { class: "flex items-center gap-2" }, [
                      createVNode(_component_UButton, {
                        icon: "i-lucide-download",
                        label: "CSV",
                        color: "neutral",
                        variant: "ghost",
                        size: "sm",
                        onClick: ($event) => exportData("csv")
                      }, null, 8, ["onClick"]),
                      createVNode(_component_UButton, {
                        icon: "i-lucide-file-code",
                        label: "JSON",
                        color: "neutral",
                        variant: "ghost",
                        size: "sm",
                        onClick: ($event) => exportData("json"),
                        class: "hidden sm:flex"
                      }, null, 8, ["onClick"]),
                      createVNode(_component_UButton, {
                        icon: "i-lucide-refresh-cw",
                        label: "Refresh",
                        color: "neutral",
                        size: "sm",
                        onClick: async () => {
                          await unref(refreshStatus)();
                          await unref(refresh)();
                        },
                        class: "hidden sm:flex"
                      }, null, 8, ["onClick"]),
                      createVNode(_component_UButton, {
                        icon: "i-lucide-refresh-cw",
                        color: "neutral",
                        variant: "ghost",
                        size: "sm",
                        onClick: async () => {
                          await unref(refreshStatus)();
                          await unref(refresh)();
                        },
                        class: "sm:hidden"
                      }, null, 8, ["onClick"])
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
                  _push3(`<span class="text-sm text-muted"${_scopeId2}>${ssrInterpolate(unref(rangeDescription))}</span>`);
                } else {
                  return [
                    createVNode("span", { class: "text-sm text-muted" }, toDisplayString(unref(rangeDescription)), 1)
                  ];
                }
              }),
              _: 1
            }, _parent2, _scopeId));
          } else {
            return [
              createVNode(_component_UDashboardNavbar, { title: "Expense Analytics" }, {
                leading: withCtx(() => [
                  createVNode(_component_UDashboardSidebarCollapse)
                ]),
                right: withCtx(() => [
                  createVNode("div", { class: "flex items-center gap-2" }, [
                    createVNode(_component_UButton, {
                      icon: "i-lucide-download",
                      label: "CSV",
                      color: "neutral",
                      variant: "ghost",
                      size: "sm",
                      onClick: ($event) => exportData("csv")
                    }, null, 8, ["onClick"]),
                    createVNode(_component_UButton, {
                      icon: "i-lucide-file-code",
                      label: "JSON",
                      color: "neutral",
                      variant: "ghost",
                      size: "sm",
                      onClick: ($event) => exportData("json"),
                      class: "hidden sm:flex"
                    }, null, 8, ["onClick"]),
                    createVNode(_component_UButton, {
                      icon: "i-lucide-refresh-cw",
                      label: "Refresh",
                      color: "neutral",
                      size: "sm",
                      onClick: async () => {
                        await unref(refreshStatus)();
                        await unref(refresh)();
                      },
                      class: "hidden sm:flex"
                    }, null, 8, ["onClick"]),
                    createVNode(_component_UButton, {
                      icon: "i-lucide-refresh-cw",
                      color: "neutral",
                      variant: "ghost",
                      size: "sm",
                      onClick: async () => {
                        await unref(refreshStatus)();
                        await unref(refresh)();
                      },
                      class: "sm:hidden"
                    }, null, 8, ["onClick"])
                  ])
                ]),
                _: 1
              }),
              createVNode(_component_UDashboardToolbar, null, {
                left: withCtx(() => [
                  createVNode(_component_UBreadcrumb, { links: unref(breadcrumbs) }, null, 8, ["links"])
                ]),
                right: withCtx(() => [
                  createVNode("span", { class: "text-sm text-muted" }, toDisplayString(unref(rangeDescription)), 1)
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
              _push2(ssrRenderComponent(_component_USkeleton, { class: "h-6 w-40" }, null, _parent2, _scopeId));
              _push2(ssrRenderComponent(_component_USkeleton, { class: "h-32 w-full" }, null, _parent2, _scopeId));
              _push2(`</div>`);
            } else if (unref(error)) {
              _push2(`<div class="text-negative text-sm"${_scopeId}> Failed to load expenses. </div>`);
            } else {
              _push2(`<div class="space-y-8"${_scopeId}>`);
              if (!unref(isConnected)) {
                _push2(`<div class="bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-950/50 dark:to-orange-950/50 rounded-xl p-6 border border-red-200 dark:border-red-800/50 mb-8"${_scopeId}><div class="text-center"${_scopeId}><div class="p-4 bg-red-100 dark:bg-red-900/50 rounded-full w-20 h-20 mx-auto mb-4 flex items-center justify-center"${_scopeId}>`);
                _push2(ssrRenderComponent(_component_UIcon, {
                  name: "i-lucide-plug-zap",
                  class: "h-10 w-10 text-red-600 dark:text-red-400"
                }, null, _parent2, _scopeId));
                _push2(`</div><h2 class="text-xl font-bold text-red-900 dark:text-red-100 mb-2"${_scopeId}>Xero Connection Required</h2><p class="text-red-700 dark:text-red-300 mb-6 max-w-md mx-auto"${_scopeId}> To view your expense analytics, you need to connect your Xero account. This ensures you see real, up-to-date financial data. </p><div class="flex flex-col sm:flex-row gap-3 justify-center items-center"${_scopeId}>`);
                _push2(ssrRenderComponent(_component_UButton, {
                  color: "red",
                  size: "lg",
                  onClick: ($event) => ("navigateTo" in _ctx ? _ctx.navigateTo : unref(navigateTo))("/api/xero/login")
                }, {
                  default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                    if (_push3) {
                      _push3(ssrRenderComponent(_component_UIcon, {
                        name: "i-lucide-link",
                        class: "h-5 w-5 mr-2"
                      }, null, _parent3, _scopeId2));
                      _push3(` Connect to Xero `);
                    } else {
                      return [
                        createVNode(_component_UIcon, {
                          name: "i-lucide-link",
                          class: "h-5 w-5 mr-2"
                        }),
                        createTextVNode(" Connect to Xero ")
                      ];
                    }
                  }),
                  _: 1
                }, _parent2, _scopeId));
                _push2(ssrRenderComponent(_component_UButton, {
                  color: "gray",
                  variant: "ghost",
                  size: "lg",
                  onClick: ($event) => ("navigateTo" in _ctx ? _ctx.navigateTo : unref(navigateTo))("/settings")
                }, {
                  default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                    if (_push3) {
                      _push3(ssrRenderComponent(_component_UIcon, {
                        name: "i-lucide-settings",
                        class: "h-5 w-5 mr-2"
                      }, null, _parent3, _scopeId2));
                      _push3(` Settings `);
                    } else {
                      return [
                        createVNode(_component_UIcon, {
                          name: "i-lucide-settings",
                          class: "h-5 w-5 mr-2"
                        }),
                        createTextVNode(" Settings ")
                      ];
                    }
                  }),
                  _: 1
                }, _parent2, _scopeId));
                _push2(`</div></div></div>`);
              } else {
                _push2(`<!---->`);
              }
              if (unref(isConnected)) {
                _push2(`<div${_scopeId}><div class="bg-gray-50/50 dark:bg-gray-800/20 mb-5 rounded-xl p-6 border border-gray-200 dark:border-gray-700/50"${_scopeId}><div class="flex items-center justify-between mb-4"${_scopeId}><div class="flex items-center gap-3"${_scopeId}><div class="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg"${_scopeId}>`);
                _push2(ssrRenderComponent(_component_UIcon, {
                  name: "i-lucide-trending-up",
                  class: "h-5 w-5 text-gray-600 dark:text-gray-400"
                }, null, _parent2, _scopeId));
                _push2(`</div><div${_scopeId}><h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100"${_scopeId}>Financial Overview</h2><p class="text-sm text-muted"${_scopeId}>${ssrInterpolate(unref(rangeDescription))}</p></div></div>`);
                if (unref(isConnected)) {
                  _push2(`<div class="flex items-center gap-2"${_scopeId}><div class="w-2 h-2 bg-green-500 rounded-full"${_scopeId}></div><span class="text-xs text-green-700 dark:text-green-300 font-medium"${_scopeId}>Live Data</span></div>`);
                } else {
                  _push2(`<!---->`);
                }
                _push2(`</div><div class="grid grid-cols-2 lg:grid-cols-4 gap-4"${_scopeId}><div class="bg-white/50 dark:bg-gray-900/50 rounded-lg p-4 border border-white/20"${_scopeId}><div class="flex items-center gap-2 mb-2"${_scopeId}>`);
                _push2(ssrRenderComponent(_component_UIcon, {
                  name: "i-lucide-dollar-sign",
                  class: "h-4 w-4 text-green-600"
                }, null, _parent2, _scopeId));
                _push2(`<p class="text-xs font-medium text-muted uppercase tracking-wide"${_scopeId}>Total Spend</p></div><p class="text-2xl font-bold text-green-600 mb-1"${_scopeId}>${ssrInterpolate(formatCurrency(unref(metrics).totalSpend))}</p><p class="text-xs text-muted"${_scopeId}> Across ${ssrInterpolate(unref(metrics).categoryCount)} categories </p></div><div class="bg-white/50 dark:bg-gray-900/50 rounded-lg p-4 border border-white/20"${_scopeId}><div class="flex items-center gap-2 mb-2"${_scopeId}>`);
                _push2(ssrRenderComponent(_component_UIcon, {
                  name: "i-lucide-calendar",
                  class: "h-4 w-4 text-blue-600"
                }, null, _parent2, _scopeId));
                _push2(`<p class="text-xs font-medium text-muted uppercase tracking-wide"${_scopeId}>Daily Average</p></div><p class="text-2xl font-bold text-blue-600 mb-1"${_scopeId}>${ssrInterpolate(formatCurrency(unref(metrics).averagePerDay))}</p><p class="text-xs text-muted"${_scopeId}> Over ${ssrInterpolate(unref(daySpan))} days </p></div><div class="bg-white/50 dark:bg-gray-900/50 rounded-lg p-4 border border-white/20"${_scopeId}><div class="flex items-center gap-2 mb-2"${_scopeId}>`);
                _push2(ssrRenderComponent(_component_UIcon, {
                  name: "i-lucide-tag",
                  class: "h-4 w-4 text-purple-600"
                }, null, _parent2, _scopeId));
                _push2(`<p class="text-xs font-medium text-muted uppercase tracking-wide"${_scopeId}>Top Category</p></div><p class="text-lg font-bold text-purple-600 mb-1 truncate"${ssrRenderAttr("title", unref(metrics).topCategory?.name)}${_scopeId}>${ssrInterpolate(unref(metrics).topCategory?.name || "No data")}</p><p class="text-xs text-muted"${_scopeId}>${ssrInterpolate(formatCurrency(unref(metrics).topCategory?.amount))}</p></div><div class="bg-white/50 dark:bg-gray-900/50 rounded-lg p-4 border border-white/20"${_scopeId}><div class="flex items-center gap-2 mb-2"${_scopeId}>`);
                _push2(ssrRenderComponent(_component_UIcon, {
                  name: "i-lucide-building",
                  class: "h-4 w-4 text-orange-600"
                }, null, _parent2, _scopeId));
                _push2(`<p class="text-xs font-medium text-muted uppercase tracking-wide"${_scopeId}>Top Vendor</p></div><p class="text-lg font-bold text-orange-600 mb-1 truncate"${ssrRenderAttr("title", unref(metrics).topVendor?.name)}${_scopeId}>${ssrInterpolate(unref(metrics).topVendor?.name || "No data")}</p><p class="text-xs text-muted"${_scopeId}>${ssrInterpolate(formatCurrency(unref(metrics).topVendor?.amount))}</p></div></div></div><div class="grid grid-cols-1 xl:grid-cols-3 gap-6"${_scopeId}><div class="xl:col-span-2 space-y-6"${_scopeId}>`);
                _push2(ssrRenderComponent(_component_UCard, { class: "shadow-sm border-0 bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm" }, {
                  header: withCtx((_2, _push3, _parent3, _scopeId2) => {
                    if (_push3) {
                      _push3(`<div class="flex items-center justify-between"${_scopeId2}><div class="flex items-center gap-3"${_scopeId2}><div class="p-2 bg-blue-50 dark:bg-blue-900/50 rounded-lg"${_scopeId2}>`);
                      _push3(ssrRenderComponent(_component_UIcon, {
                        name: "i-lucide-pie-chart",
                        class: "h-5 w-5 text-blue-600 dark:text-blue-400"
                      }, null, _parent3, _scopeId2));
                      _push3(`</div><div${_scopeId2}><h3 class="text-lg font-semibold"${_scopeId2}>Expense Distribution</h3><p class="text-sm text-muted"${_scopeId2}>Category breakdown and analysis</p></div></div></div>`);
                    } else {
                      return [
                        createVNode("div", { class: "flex items-center justify-between" }, [
                          createVNode("div", { class: "flex items-center gap-3" }, [
                            createVNode("div", { class: "p-2 bg-blue-50 dark:bg-blue-900/50 rounded-lg" }, [
                              createVNode(_component_UIcon, {
                                name: "i-lucide-pie-chart",
                                class: "h-5 w-5 text-blue-600 dark:text-blue-400"
                              })
                            ]),
                            createVNode("div", null, [
                              createVNode("h3", { class: "text-lg font-semibold" }, "Expense Distribution"),
                              createVNode("p", { class: "text-sm text-muted" }, "Category breakdown and analysis")
                            ])
                          ])
                        ])
                      ];
                    }
                  }),
                  default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                    if (_push3) {
                      _push3(ssrRenderComponent(_component_ClientOnly, null, {}, _parent3, _scopeId2));
                    } else {
                      return [
                        createVNode(_component_ClientOnly, null, {
                          default: withCtx(() => [
                            createVNode(unref(AsyncCategoryDonut), {
                              categories: unref(data)?.categories || []
                            }, null, 8, ["categories"])
                          ]),
                          _: 1
                        })
                      ];
                    }
                  }),
                  _: 1
                }, _parent2, _scopeId));
                _push2(ssrRenderComponent(_component_UCard, { class: "shadow-sm border-0 bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm" }, {
                  header: withCtx((_2, _push3, _parent3, _scopeId2) => {
                    if (_push3) {
                      _push3(`<div class="flex items-center justify-between"${_scopeId2}><div class="flex items-center gap-3"${_scopeId2}><div class="p-2 bg-green-50 dark:bg-green-900/50 rounded-lg"${_scopeId2}>`);
                      _push3(ssrRenderComponent(_component_UIcon, {
                        name: "i-lucide-layout-grid",
                        class: "h-5 w-5 text-green-600 dark:text-green-400"
                      }, null, _parent3, _scopeId2));
                      _push3(`</div><div${_scopeId2}><h3 class="text-lg font-semibold"${_scopeId2}>Category Breakdown</h3><p class="text-sm text-muted"${_scopeId2}>Visual expense distribution</p></div></div>`);
                      _push3(ssrRenderComponent(_component_UBadge, {
                        color: "primary",
                        variant: "subtle"
                      }, {
                        default: withCtx((_3, _push4, _parent4, _scopeId3) => {
                          if (_push4) {
                            _push4(`${ssrInterpolate((unref(data)?.categories || []).length)} categories `);
                          } else {
                            return [
                              createTextVNode(toDisplayString((unref(data)?.categories || []).length) + " categories ", 1)
                            ];
                          }
                        }),
                        _: 1
                      }, _parent3, _scopeId2));
                      _push3(`</div>`);
                    } else {
                      return [
                        createVNode("div", { class: "flex items-center justify-between" }, [
                          createVNode("div", { class: "flex items-center gap-3" }, [
                            createVNode("div", { class: "p-2 bg-green-50 dark:bg-green-900/50 rounded-lg" }, [
                              createVNode(_component_UIcon, {
                                name: "i-lucide-layout-grid",
                                class: "h-5 w-5 text-green-600 dark:text-green-400"
                              })
                            ]),
                            createVNode("div", null, [
                              createVNode("h3", { class: "text-lg font-semibold" }, "Category Breakdown"),
                              createVNode("p", { class: "text-sm text-muted" }, "Visual expense distribution")
                            ])
                          ]),
                          createVNode(_component_UBadge, {
                            color: "primary",
                            variant: "subtle"
                          }, {
                            default: withCtx(() => [
                              createTextVNode(toDisplayString((unref(data)?.categories || []).length) + " categories ", 1)
                            ]),
                            _: 1
                          })
                        ])
                      ];
                    }
                  }),
                  default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                    if (_push3) {
                      _push3(ssrRenderComponent(_component_ClientOnly, null, {}, _parent3, _scopeId2));
                    } else {
                      return [
                        createVNode(_component_ClientOnly, null, {
                          default: withCtx(() => [
                            createVNode(unref(AsyncCategoryTreemap), {
                              categories: unref(data)?.categories || []
                            }, null, 8, ["categories"])
                          ]),
                          _: 1
                        })
                      ];
                    }
                  }),
                  _: 1
                }, _parent2, _scopeId));
                _push2(`</div><div class="space-y-6"${_scopeId}>`);
                _push2(ssrRenderComponent(_component_UCard, { class: "shadow-sm border-0 bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm" }, {
                  header: withCtx((_2, _push3, _parent3, _scopeId2) => {
                    if (_push3) {
                      _push3(`<div class="flex items-center gap-3"${_scopeId2}><div class="p-2 bg-orange-50 dark:bg-orange-900/50 rounded-lg"${_scopeId2}>`);
                      _push3(ssrRenderComponent(_component_UIcon, {
                        name: "i-lucide-bar-chart-3",
                        class: "h-5 w-5 text-orange-600 dark:text-orange-400"
                      }, null, _parent3, _scopeId2));
                      _push3(`</div><div${_scopeId2}><h3 class="text-lg font-semibold"${_scopeId2}>Vendor Analysis</h3><p class="text-sm text-muted"${_scopeId2}>Top spending relationships</p></div></div>`);
                    } else {
                      return [
                        createVNode("div", { class: "flex items-center gap-3" }, [
                          createVNode("div", { class: "p-2 bg-orange-50 dark:bg-orange-900/50 rounded-lg" }, [
                            createVNode(_component_UIcon, {
                              name: "i-lucide-bar-chart-3",
                              class: "h-5 w-5 text-orange-600 dark:text-orange-400"
                            })
                          ]),
                          createVNode("div", null, [
                            createVNode("h3", { class: "text-lg font-semibold" }, "Vendor Analysis"),
                            createVNode("p", { class: "text-sm text-muted" }, "Top spending relationships")
                          ])
                        ])
                      ];
                    }
                  }),
                  default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                    if (_push3) {
                      _push3(ssrRenderComponent(_component_ClientOnly, null, {}, _parent3, _scopeId2));
                    } else {
                      return [
                        createVNode(_component_ClientOnly, null, {
                          default: withCtx(() => [
                            createVNode(unref(AsyncVendorContributionBars), {
                              vendors: unref(data)?.vendors || []
                            }, null, 8, ["vendors"])
                          ]),
                          _: 1
                        })
                      ];
                    }
                  }),
                  _: 1
                }, _parent2, _scopeId));
                _push2(ssrRenderComponent(_component_UCard, { class: "shadow-sm border-0 bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm" }, {
                  header: withCtx((_2, _push3, _parent3, _scopeId2) => {
                    if (_push3) {
                      _push3(`<div class="flex items-center gap-3"${_scopeId2}><div class="p-2 bg-purple-50 dark:bg-purple-900/50 rounded-lg"${_scopeId2}>`);
                      _push3(ssrRenderComponent(_component_UIcon, {
                        name: "i-lucide-activity",
                        class: "h-5 w-5 text-purple-600 dark:text-purple-400"
                      }, null, _parent3, _scopeId2));
                      _push3(`</div><div${_scopeId2}><h3 class="text-lg font-semibold"${_scopeId2}>Key Insights</h3><p class="text-sm text-muted"${_scopeId2}>Performance indicators</p></div></div>`);
                    } else {
                      return [
                        createVNode("div", { class: "flex items-center gap-3" }, [
                          createVNode("div", { class: "p-2 bg-purple-50 dark:bg-purple-900/50 rounded-lg" }, [
                            createVNode(_component_UIcon, {
                              name: "i-lucide-activity",
                              class: "h-5 w-5 text-purple-600 dark:text-purple-400"
                            })
                          ]),
                          createVNode("div", null, [
                            createVNode("h3", { class: "text-lg font-semibold" }, "Key Insights"),
                            createVNode("p", { class: "text-sm text-muted" }, "Performance indicators")
                          ])
                        ])
                      ];
                    }
                  }),
                  default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                    if (_push3) {
                      _push3(`<div class="space-y-4"${_scopeId2}><div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg"${_scopeId2}><div class="flex items-center gap-3"${_scopeId2}>`);
                      _push3(ssrRenderComponent(_component_UIcon, {
                        name: "i-lucide-users",
                        class: "h-4 w-4 text-blue-600"
                      }, null, _parent3, _scopeId2));
                      _push3(`<span class="text-sm font-medium"${_scopeId2}>Active Vendors</span></div>`);
                      _push3(ssrRenderComponent(_component_UBadge, {
                        color: "blue",
                        variant: "subtle"
                      }, {
                        default: withCtx((_3, _push4, _parent4, _scopeId3) => {
                          if (_push4) {
                            _push4(`${ssrInterpolate(unref(metrics).vendorCount)}`);
                          } else {
                            return [
                              createTextVNode(toDisplayString(unref(metrics).vendorCount), 1)
                            ];
                          }
                        }),
                        _: 1
                      }, _parent3, _scopeId2));
                      _push3(`</div><div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg"${_scopeId2}><div class="flex items-center gap-3"${_scopeId2}>`);
                      _push3(ssrRenderComponent(_component_UIcon, {
                        name: "i-lucide-layers",
                        class: "h-4 w-4 text-green-600"
                      }, null, _parent3, _scopeId2));
                      _push3(`<span class="text-sm font-medium"${_scopeId2}>Expense Categories</span></div>`);
                      _push3(ssrRenderComponent(_component_UBadge, {
                        color: "green",
                        variant: "subtle"
                      }, {
                        default: withCtx((_3, _push4, _parent4, _scopeId3) => {
                          if (_push4) {
                            _push4(`${ssrInterpolate(unref(metrics).categoryCount)}`);
                          } else {
                            return [
                              createTextVNode(toDisplayString(unref(metrics).categoryCount), 1)
                            ];
                          }
                        }),
                        _: 1
                      }, _parent3, _scopeId2));
                      _push3(`</div><div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg"${_scopeId2}><div class="flex items-center gap-3"${_scopeId2}>`);
                      _push3(ssrRenderComponent(_component_UIcon, {
                        name: "i-lucide-percent",
                        class: "h-4 w-4 text-purple-600"
                      }, null, _parent3, _scopeId2));
                      _push3(`<span class="text-sm font-medium"${_scopeId2}>Top Category Share</span></div>`);
                      _push3(ssrRenderComponent(_component_UBadge, {
                        color: "purple",
                        variant: "subtle"
                      }, {
                        default: withCtx((_3, _push4, _parent4, _scopeId3) => {
                          if (_push4) {
                            _push4(`${ssrInterpolate(unref(metrics).topCategory && unref(metrics).totalSpend > 0 ? `${(unref(metrics).topCategory.amount / unref(metrics).totalSpend * 100).toFixed(1)}%` : "0%")}`);
                          } else {
                            return [
                              createTextVNode(toDisplayString(unref(metrics).topCategory && unref(metrics).totalSpend > 0 ? `${(unref(metrics).topCategory.amount / unref(metrics).totalSpend * 100).toFixed(1)}%` : "0%"), 1)
                            ];
                          }
                        }),
                        _: 1
                      }, _parent3, _scopeId2));
                      _push3(`</div></div>`);
                    } else {
                      return [
                        createVNode("div", { class: "space-y-4" }, [
                          createVNode("div", { class: "flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg" }, [
                            createVNode("div", { class: "flex items-center gap-3" }, [
                              createVNode(_component_UIcon, {
                                name: "i-lucide-users",
                                class: "h-4 w-4 text-blue-600"
                              }),
                              createVNode("span", { class: "text-sm font-medium" }, "Active Vendors")
                            ]),
                            createVNode(_component_UBadge, {
                              color: "blue",
                              variant: "subtle"
                            }, {
                              default: withCtx(() => [
                                createTextVNode(toDisplayString(unref(metrics).vendorCount), 1)
                              ]),
                              _: 1
                            })
                          ]),
                          createVNode("div", { class: "flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg" }, [
                            createVNode("div", { class: "flex items-center gap-3" }, [
                              createVNode(_component_UIcon, {
                                name: "i-lucide-layers",
                                class: "h-4 w-4 text-green-600"
                              }),
                              createVNode("span", { class: "text-sm font-medium" }, "Expense Categories")
                            ]),
                            createVNode(_component_UBadge, {
                              color: "green",
                              variant: "subtle"
                            }, {
                              default: withCtx(() => [
                                createTextVNode(toDisplayString(unref(metrics).categoryCount), 1)
                              ]),
                              _: 1
                            })
                          ]),
                          createVNode("div", { class: "flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg" }, [
                            createVNode("div", { class: "flex items-center gap-3" }, [
                              createVNode(_component_UIcon, {
                                name: "i-lucide-percent",
                                class: "h-4 w-4 text-purple-600"
                              }),
                              createVNode("span", { class: "text-sm font-medium" }, "Top Category Share")
                            ]),
                            createVNode(_component_UBadge, {
                              color: "purple",
                              variant: "subtle"
                            }, {
                              default: withCtx(() => [
                                createTextVNode(toDisplayString(unref(metrics).topCategory && unref(metrics).totalSpend > 0 ? `${(unref(metrics).topCategory.amount / unref(metrics).totalSpend * 100).toFixed(1)}%` : "0%"), 1)
                              ]),
                              _: 1
                            })
                          ])
                        ])
                      ];
                    }
                  }),
                  _: 1
                }, _parent2, _scopeId));
                _push2(ssrRenderComponent(_component_UCard, { class: "shadow-sm border-0 bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm" }, {
                  header: withCtx((_2, _push3, _parent3, _scopeId2) => {
                    if (_push3) {
                      _push3(`<div class="flex items-center gap-3"${_scopeId2}><div class="p-2 bg-indigo-50 dark:bg-indigo-900/50 rounded-lg"${_scopeId2}>`);
                      _push3(ssrRenderComponent(_component_UIcon, {
                        name: "i-lucide-trending-up",
                        class: "h-5 w-5 text-indigo-600 dark:text-indigo-400"
                      }, null, _parent3, _scopeId2));
                      _push3(`</div><div${_scopeId2}><h3 class="text-lg font-semibold"${_scopeId2}>Expense Trends</h3><p class="text-sm text-muted"${_scopeId2}>Distribution patterns</p></div></div>`);
                    } else {
                      return [
                        createVNode("div", { class: "flex items-center gap-3" }, [
                          createVNode("div", { class: "p-2 bg-indigo-50 dark:bg-indigo-900/50 rounded-lg" }, [
                            createVNode(_component_UIcon, {
                              name: "i-lucide-trending-up",
                              class: "h-5 w-5 text-indigo-600 dark:text-indigo-400"
                            })
                          ]),
                          createVNode("div", null, [
                            createVNode("h3", { class: "text-lg font-semibold" }, "Expense Trends"),
                            createVNode("p", { class: "text-sm text-muted" }, "Distribution patterns")
                          ])
                        ])
                      ];
                    }
                  }),
                  default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                    if (_push3) {
                      _push3(`<div class="space-y-6"${_scopeId2}><div${_scopeId2}><h4 class="text-sm font-semibold mb-3 text-muted"${_scopeId2}>Top 5 Categories</h4><div class="space-y-2"${_scopeId2}><!--[-->`);
                      ssrRenderList((unref(data)?.categories || []).slice(0, 5), (category, index) => {
                        _push3(`<div class="relative"${_scopeId2}><div class="flex items-center justify-between text-sm mb-1"${_scopeId2}><span class="truncate"${ssrRenderAttr("title", category.name)}${_scopeId2}>${ssrInterpolate(category.name.length > 20 ? category.name.substring(0, 20) + "..." : category.name)}</span><span class="text-xs text-muted"${_scopeId2}>${ssrInterpolate(unref(metrics).totalSpend > 0 ? (category.amount / unref(metrics).totalSpend * 100).toFixed(1) : 0)}% </span></div><div class="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden"${_scopeId2}><div class="h-full rounded-full transition-all duration-500" style="${ssrRenderStyle({
                          backgroundColor: ["#3b82f6", "#10b981", "#8b5cf6", "#f97316", "#ef4444"][index % 5],
                          width: unref(metrics).totalSpend > 0 ? `${category.amount / unref(metrics).totalSpend * 100}%` : "0%"
                        })}"${_scopeId2}></div></div></div>`);
                      });
                      _push3(`<!--]--></div></div><div class="border-t border-gray-100 dark:border-gray-800 pt-4"${_scopeId2}><h4 class="text-sm font-semibold mb-3 text-muted"${_scopeId2}>Top 5 Vendors</h4><div class="space-y-2"${_scopeId2}><!--[-->`);
                      ssrRenderList((unref(data)?.vendors || []).slice(0, 5), (vendor, index) => {
                        _push3(`<div class="flex items-center gap-2 text-sm"${_scopeId2}><div class="${ssrRenderClass([`bg-${["indigo", "cyan", "pink", "yellow", "emerald"][index % 5]}-500`, "w-3 h-3 rounded-full flex-shrink-0"])}"${_scopeId2}></div><span class="truncate flex-1"${ssrRenderAttr("title", vendor.name)}${_scopeId2}>${ssrInterpolate(vendor.name)}</span><span class="font-medium text-green-600 text-xs"${_scopeId2}>${ssrInterpolate(formatCurrency(vendor.amount))}</span></div>`);
                      });
                      _push3(`<!--]--></div></div><div class="border-t border-gray-100 dark:border-gray-800 pt-4"${_scopeId2}><h4 class="text-sm font-semibold mb-3 text-muted"${_scopeId2}>Quick Actions</h4><div class="grid grid-cols-2 gap-2"${_scopeId2}>`);
                      _push3(ssrRenderComponent(_component_UButton, {
                        size: "sm",
                        variant: "ghost",
                        class: "justify-start text-xs"
                      }, {
                        default: withCtx((_3, _push4, _parent4, _scopeId3) => {
                          if (_push4) {
                            _push4(ssrRenderComponent(_component_UIcon, {
                              name: "i-lucide-filter",
                              class: "h-3 w-3"
                            }, null, _parent4, _scopeId3));
                            _push4(` Filter `);
                          } else {
                            return [
                              createVNode(_component_UIcon, {
                                name: "i-lucide-filter",
                                class: "h-3 w-3"
                              }),
                              createTextVNode(" Filter ")
                            ];
                          }
                        }),
                        _: 1
                      }, _parent3, _scopeId2));
                      _push3(ssrRenderComponent(_component_UButton, {
                        size: "sm",
                        variant: "ghost",
                        class: "justify-start text-xs"
                      }, {
                        default: withCtx((_3, _push4, _parent4, _scopeId3) => {
                          if (_push4) {
                            _push4(ssrRenderComponent(_component_UIcon, {
                              name: "i-lucide-search",
                              class: "h-3 w-3"
                            }, null, _parent4, _scopeId3));
                            _push4(` Search `);
                          } else {
                            return [
                              createVNode(_component_UIcon, {
                                name: "i-lucide-search",
                                class: "h-3 w-3"
                              }),
                              createTextVNode(" Search ")
                            ];
                          }
                        }),
                        _: 1
                      }, _parent3, _scopeId2));
                      _push3(ssrRenderComponent(_component_UButton, {
                        size: "sm",
                        variant: "ghost",
                        class: "justify-start text-xs"
                      }, {
                        default: withCtx((_3, _push4, _parent4, _scopeId3) => {
                          if (_push4) {
                            _push4(ssrRenderComponent(_component_UIcon, {
                              name: "i-lucide-calendar",
                              class: "h-3 w-3"
                            }, null, _parent4, _scopeId3));
                            _push4(` Period `);
                          } else {
                            return [
                              createVNode(_component_UIcon, {
                                name: "i-lucide-calendar",
                                class: "h-3 w-3"
                              }),
                              createTextVNode(" Period ")
                            ];
                          }
                        }),
                        _: 1
                      }, _parent3, _scopeId2));
                      _push3(ssrRenderComponent(_component_UButton, {
                        size: "sm",
                        variant: "ghost",
                        class: "justify-start text-xs"
                      }, {
                        default: withCtx((_3, _push4, _parent4, _scopeId3) => {
                          if (_push4) {
                            _push4(ssrRenderComponent(_component_UIcon, {
                              name: "i-lucide-share",
                              class: "h-3 w-3"
                            }, null, _parent4, _scopeId3));
                            _push4(` Export `);
                          } else {
                            return [
                              createVNode(_component_UIcon, {
                                name: "i-lucide-share",
                                class: "h-3 w-3"
                              }),
                              createTextVNode(" Export ")
                            ];
                          }
                        }),
                        _: 1
                      }, _parent3, _scopeId2));
                      _push3(`</div></div></div>`);
                    } else {
                      return [
                        createVNode("div", { class: "space-y-6" }, [
                          createVNode("div", null, [
                            createVNode("h4", { class: "text-sm font-semibold mb-3 text-muted" }, "Top 5 Categories"),
                            createVNode("div", { class: "space-y-2" }, [
                              (openBlock(true), createBlock(Fragment, null, renderList((unref(data)?.categories || []).slice(0, 5), (category, index) => {
                                return openBlock(), createBlock("div", {
                                  key: category.name,
                                  class: "relative"
                                }, [
                                  createVNode("div", { class: "flex items-center justify-between text-sm mb-1" }, [
                                    createVNode("span", {
                                      class: "truncate",
                                      title: category.name
                                    }, toDisplayString(category.name.length > 20 ? category.name.substring(0, 20) + "..." : category.name), 9, ["title"]),
                                    createVNode("span", { class: "text-xs text-muted" }, toDisplayString(unref(metrics).totalSpend > 0 ? (category.amount / unref(metrics).totalSpend * 100).toFixed(1) : 0) + "% ", 1)
                                  ]),
                                  createVNode("div", { class: "h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden" }, [
                                    createVNode("div", {
                                      class: "h-full rounded-full transition-all duration-500",
                                      style: {
                                        backgroundColor: ["#3b82f6", "#10b981", "#8b5cf6", "#f97316", "#ef4444"][index % 5],
                                        width: unref(metrics).totalSpend > 0 ? `${category.amount / unref(metrics).totalSpend * 100}%` : "0%"
                                      }
                                    }, null, 4)
                                  ])
                                ]);
                              }), 128))
                            ])
                          ]),
                          createVNode("div", { class: "border-t border-gray-100 dark:border-gray-800 pt-4" }, [
                            createVNode("h4", { class: "text-sm font-semibold mb-3 text-muted" }, "Top 5 Vendors"),
                            createVNode("div", { class: "space-y-2" }, [
                              (openBlock(true), createBlock(Fragment, null, renderList((unref(data)?.vendors || []).slice(0, 5), (vendor, index) => {
                                return openBlock(), createBlock("div", {
                                  key: vendor.name,
                                  class: "flex items-center gap-2 text-sm"
                                }, [
                                  createVNode("div", {
                                    class: ["w-3 h-3 rounded-full flex-shrink-0", `bg-${["indigo", "cyan", "pink", "yellow", "emerald"][index % 5]}-500`]
                                  }, null, 2),
                                  createVNode("span", {
                                    class: "truncate flex-1",
                                    title: vendor.name
                                  }, toDisplayString(vendor.name), 9, ["title"]),
                                  createVNode("span", { class: "font-medium text-green-600 text-xs" }, toDisplayString(formatCurrency(vendor.amount)), 1)
                                ]);
                              }), 128))
                            ])
                          ]),
                          createVNode("div", { class: "border-t border-gray-100 dark:border-gray-800 pt-4" }, [
                            createVNode("h4", { class: "text-sm font-semibold mb-3 text-muted" }, "Quick Actions"),
                            createVNode("div", { class: "grid grid-cols-2 gap-2" }, [
                              createVNode(_component_UButton, {
                                size: "sm",
                                variant: "ghost",
                                class: "justify-start text-xs"
                              }, {
                                default: withCtx(() => [
                                  createVNode(_component_UIcon, {
                                    name: "i-lucide-filter",
                                    class: "h-3 w-3"
                                  }),
                                  createTextVNode(" Filter ")
                                ]),
                                _: 1
                              }),
                              createVNode(_component_UButton, {
                                size: "sm",
                                variant: "ghost",
                                class: "justify-start text-xs"
                              }, {
                                default: withCtx(() => [
                                  createVNode(_component_UIcon, {
                                    name: "i-lucide-search",
                                    class: "h-3 w-3"
                                  }),
                                  createTextVNode(" Search ")
                                ]),
                                _: 1
                              }),
                              createVNode(_component_UButton, {
                                size: "sm",
                                variant: "ghost",
                                class: "justify-start text-xs"
                              }, {
                                default: withCtx(() => [
                                  createVNode(_component_UIcon, {
                                    name: "i-lucide-calendar",
                                    class: "h-3 w-3"
                                  }),
                                  createTextVNode(" Period ")
                                ]),
                                _: 1
                              }),
                              createVNode(_component_UButton, {
                                size: "sm",
                                variant: "ghost",
                                class: "justify-start text-xs"
                              }, {
                                default: withCtx(() => [
                                  createVNode(_component_UIcon, {
                                    name: "i-lucide-share",
                                    class: "h-3 w-3"
                                  }),
                                  createTextVNode(" Export ")
                                ]),
                                _: 1
                              })
                            ])
                          ])
                        ])
                      ];
                    }
                  }),
                  _: 1
                }, _parent2, _scopeId));
                _push2(`</div></div></div>`);
              } else {
                _push2(`<!---->`);
              }
              _push2(`<div class="mt-8"${_scopeId}>`);
              _push2(ssrRenderComponent(_component_ClientOnly, null, {
                fallback: withCtx((_2, _push3, _parent3, _scopeId2) => {
                  if (_push3) {
                    _push3(ssrRenderComponent(_component_UCard, { class: "shadow-sm border-0 bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm" }, {
                      default: withCtx((_3, _push4, _parent4, _scopeId3) => {
                        if (_push4) {
                          _push4(`<div class="flex items-center justify-center h-32"${_scopeId3}><div class="text-center"${_scopeId3}>`);
                          _push4(ssrRenderComponent(_component_USkeleton, { class: "h-4 w-32 mx-auto mb-2" }, null, _parent4, _scopeId3));
                          _push4(ssrRenderComponent(_component_USkeleton, { class: "h-3 w-24 mx-auto" }, null, _parent4, _scopeId3));
                          _push4(`</div></div>`);
                        } else {
                          return [
                            createVNode("div", { class: "flex items-center justify-center h-32" }, [
                              createVNode("div", { class: "text-center" }, [
                                createVNode(_component_USkeleton, { class: "h-4 w-32 mx-auto mb-2" }),
                                createVNode(_component_USkeleton, { class: "h-3 w-24 mx-auto" })
                              ])
                            ])
                          ];
                        }
                      }),
                      _: 1
                    }, _parent3, _scopeId2));
                  } else {
                    return [
                      createVNode(_component_UCard, { class: "shadow-sm border-0 bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm" }, {
                        default: withCtx(() => [
                          createVNode("div", { class: "flex items-center justify-center h-32" }, [
                            createVNode("div", { class: "text-center" }, [
                              createVNode(_component_USkeleton, { class: "h-4 w-32 mx-auto mb-2" }),
                              createVNode(_component_USkeleton, { class: "h-3 w-24 mx-auto" })
                            ])
                          ])
                        ]),
                        _: 1
                      })
                    ];
                  }
                })
              }, _parent2, _scopeId));
              _push2(`</div></div>`);
            }
          } else {
            return [
              unref(pending) ? (openBlock(), createBlock("div", {
                key: 0,
                class: "space-y-4"
              }, [
                createVNode(_component_USkeleton, { class: "h-6 w-40" }),
                createVNode(_component_USkeleton, { class: "h-32 w-full" })
              ])) : unref(error) ? (openBlock(), createBlock("div", {
                key: 1,
                class: "text-negative text-sm"
              }, " Failed to load expenses. ")) : (openBlock(), createBlock("div", {
                key: 2,
                class: "space-y-8"
              }, [
                !unref(isConnected) ? (openBlock(), createBlock("div", {
                  key: 0,
                  class: "bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-950/50 dark:to-orange-950/50 rounded-xl p-6 border border-red-200 dark:border-red-800/50 mb-8"
                }, [
                  createVNode("div", { class: "text-center" }, [
                    createVNode("div", { class: "p-4 bg-red-100 dark:bg-red-900/50 rounded-full w-20 h-20 mx-auto mb-4 flex items-center justify-center" }, [
                      createVNode(_component_UIcon, {
                        name: "i-lucide-plug-zap",
                        class: "h-10 w-10 text-red-600 dark:text-red-400"
                      })
                    ]),
                    createVNode("h2", { class: "text-xl font-bold text-red-900 dark:text-red-100 mb-2" }, "Xero Connection Required"),
                    createVNode("p", { class: "text-red-700 dark:text-red-300 mb-6 max-w-md mx-auto" }, " To view your expense analytics, you need to connect your Xero account. This ensures you see real, up-to-date financial data. "),
                    createVNode("div", { class: "flex flex-col sm:flex-row gap-3 justify-center items-center" }, [
                      createVNode(_component_UButton, {
                        color: "red",
                        size: "lg",
                        onClick: ($event) => ("navigateTo" in _ctx ? _ctx.navigateTo : unref(navigateTo))("/api/xero/login")
                      }, {
                        default: withCtx(() => [
                          createVNode(_component_UIcon, {
                            name: "i-lucide-link",
                            class: "h-5 w-5 mr-2"
                          }),
                          createTextVNode(" Connect to Xero ")
                        ]),
                        _: 1
                      }, 8, ["onClick"]),
                      createVNode(_component_UButton, {
                        color: "gray",
                        variant: "ghost",
                        size: "lg",
                        onClick: ($event) => ("navigateTo" in _ctx ? _ctx.navigateTo : unref(navigateTo))("/settings")
                      }, {
                        default: withCtx(() => [
                          createVNode(_component_UIcon, {
                            name: "i-lucide-settings",
                            class: "h-5 w-5 mr-2"
                          }),
                          createTextVNode(" Settings ")
                        ]),
                        _: 1
                      }, 8, ["onClick"])
                    ])
                  ])
                ])) : createCommentVNode("", true),
                unref(isConnected) ? (openBlock(), createBlock("div", { key: 1 }, [
                  createVNode("div", { class: "bg-gray-50/50 dark:bg-gray-800/20 mb-5 rounded-xl p-6 border border-gray-200 dark:border-gray-700/50" }, [
                    createVNode("div", { class: "flex items-center justify-between mb-4" }, [
                      createVNode("div", { class: "flex items-center gap-3" }, [
                        createVNode("div", { class: "p-2 bg-gray-100 dark:bg-gray-800 rounded-lg" }, [
                          createVNode(_component_UIcon, {
                            name: "i-lucide-trending-up",
                            class: "h-5 w-5 text-gray-600 dark:text-gray-400"
                          })
                        ]),
                        createVNode("div", null, [
                          createVNode("h2", { class: "text-lg font-semibold text-gray-900 dark:text-gray-100" }, "Financial Overview"),
                          createVNode("p", { class: "text-sm text-muted" }, toDisplayString(unref(rangeDescription)), 1)
                        ])
                      ]),
                      unref(isConnected) ? (openBlock(), createBlock("div", {
                        key: 0,
                        class: "flex items-center gap-2"
                      }, [
                        createVNode("div", { class: "w-2 h-2 bg-green-500 rounded-full" }),
                        createVNode("span", { class: "text-xs text-green-700 dark:text-green-300 font-medium" }, "Live Data")
                      ])) : createCommentVNode("", true)
                    ]),
                    createVNode("div", { class: "grid grid-cols-2 lg:grid-cols-4 gap-4" }, [
                      createVNode("div", { class: "bg-white/50 dark:bg-gray-900/50 rounded-lg p-4 border border-white/20" }, [
                        createVNode("div", { class: "flex items-center gap-2 mb-2" }, [
                          createVNode(_component_UIcon, {
                            name: "i-lucide-dollar-sign",
                            class: "h-4 w-4 text-green-600"
                          }),
                          createVNode("p", { class: "text-xs font-medium text-muted uppercase tracking-wide" }, "Total Spend")
                        ]),
                        createVNode("p", { class: "text-2xl font-bold text-green-600 mb-1" }, toDisplayString(formatCurrency(unref(metrics).totalSpend)), 1),
                        createVNode("p", { class: "text-xs text-muted" }, " Across " + toDisplayString(unref(metrics).categoryCount) + " categories ", 1)
                      ]),
                      createVNode("div", { class: "bg-white/50 dark:bg-gray-900/50 rounded-lg p-4 border border-white/20" }, [
                        createVNode("div", { class: "flex items-center gap-2 mb-2" }, [
                          createVNode(_component_UIcon, {
                            name: "i-lucide-calendar",
                            class: "h-4 w-4 text-blue-600"
                          }),
                          createVNode("p", { class: "text-xs font-medium text-muted uppercase tracking-wide" }, "Daily Average")
                        ]),
                        createVNode("p", { class: "text-2xl font-bold text-blue-600 mb-1" }, toDisplayString(formatCurrency(unref(metrics).averagePerDay)), 1),
                        createVNode("p", { class: "text-xs text-muted" }, " Over " + toDisplayString(unref(daySpan)) + " days ", 1)
                      ]),
                      createVNode("div", { class: "bg-white/50 dark:bg-gray-900/50 rounded-lg p-4 border border-white/20" }, [
                        createVNode("div", { class: "flex items-center gap-2 mb-2" }, [
                          createVNode(_component_UIcon, {
                            name: "i-lucide-tag",
                            class: "h-4 w-4 text-purple-600"
                          }),
                          createVNode("p", { class: "text-xs font-medium text-muted uppercase tracking-wide" }, "Top Category")
                        ]),
                        createVNode("p", {
                          class: "text-lg font-bold text-purple-600 mb-1 truncate",
                          title: unref(metrics).topCategory?.name
                        }, toDisplayString(unref(metrics).topCategory?.name || "No data"), 9, ["title"]),
                        createVNode("p", { class: "text-xs text-muted" }, toDisplayString(formatCurrency(unref(metrics).topCategory?.amount)), 1)
                      ]),
                      createVNode("div", { class: "bg-white/50 dark:bg-gray-900/50 rounded-lg p-4 border border-white/20" }, [
                        createVNode("div", { class: "flex items-center gap-2 mb-2" }, [
                          createVNode(_component_UIcon, {
                            name: "i-lucide-building",
                            class: "h-4 w-4 text-orange-600"
                          }),
                          createVNode("p", { class: "text-xs font-medium text-muted uppercase tracking-wide" }, "Top Vendor")
                        ]),
                        createVNode("p", {
                          class: "text-lg font-bold text-orange-600 mb-1 truncate",
                          title: unref(metrics).topVendor?.name
                        }, toDisplayString(unref(metrics).topVendor?.name || "No data"), 9, ["title"]),
                        createVNode("p", { class: "text-xs text-muted" }, toDisplayString(formatCurrency(unref(metrics).topVendor?.amount)), 1)
                      ])
                    ])
                  ]),
                  createVNode("div", { class: "grid grid-cols-1 xl:grid-cols-3 gap-6" }, [
                    createVNode("div", { class: "xl:col-span-2 space-y-6" }, [
                      createVNode(_component_UCard, { class: "shadow-sm border-0 bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm" }, {
                        header: withCtx(() => [
                          createVNode("div", { class: "flex items-center justify-between" }, [
                            createVNode("div", { class: "flex items-center gap-3" }, [
                              createVNode("div", { class: "p-2 bg-blue-50 dark:bg-blue-900/50 rounded-lg" }, [
                                createVNode(_component_UIcon, {
                                  name: "i-lucide-pie-chart",
                                  class: "h-5 w-5 text-blue-600 dark:text-blue-400"
                                })
                              ]),
                              createVNode("div", null, [
                                createVNode("h3", { class: "text-lg font-semibold" }, "Expense Distribution"),
                                createVNode("p", { class: "text-sm text-muted" }, "Category breakdown and analysis")
                              ])
                            ])
                          ])
                        ]),
                        default: withCtx(() => [
                          createVNode(_component_ClientOnly, null, {
                            default: withCtx(() => [
                              createVNode(unref(AsyncCategoryDonut), {
                                categories: unref(data)?.categories || []
                              }, null, 8, ["categories"])
                            ]),
                            _: 1
                          })
                        ]),
                        _: 1
                      }),
                      createVNode(_component_UCard, { class: "shadow-sm border-0 bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm" }, {
                        header: withCtx(() => [
                          createVNode("div", { class: "flex items-center justify-between" }, [
                            createVNode("div", { class: "flex items-center gap-3" }, [
                              createVNode("div", { class: "p-2 bg-green-50 dark:bg-green-900/50 rounded-lg" }, [
                                createVNode(_component_UIcon, {
                                  name: "i-lucide-layout-grid",
                                  class: "h-5 w-5 text-green-600 dark:text-green-400"
                                })
                              ]),
                              createVNode("div", null, [
                                createVNode("h3", { class: "text-lg font-semibold" }, "Category Breakdown"),
                                createVNode("p", { class: "text-sm text-muted" }, "Visual expense distribution")
                              ])
                            ]),
                            createVNode(_component_UBadge, {
                              color: "primary",
                              variant: "subtle"
                            }, {
                              default: withCtx(() => [
                                createTextVNode(toDisplayString((unref(data)?.categories || []).length) + " categories ", 1)
                              ]),
                              _: 1
                            })
                          ])
                        ]),
                        default: withCtx(() => [
                          createVNode(_component_ClientOnly, null, {
                            default: withCtx(() => [
                              createVNode(unref(AsyncCategoryTreemap), {
                                categories: unref(data)?.categories || []
                              }, null, 8, ["categories"])
                            ]),
                            _: 1
                          })
                        ]),
                        _: 1
                      })
                    ]),
                    createVNode("div", { class: "space-y-6" }, [
                      createVNode(_component_UCard, { class: "shadow-sm border-0 bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm" }, {
                        header: withCtx(() => [
                          createVNode("div", { class: "flex items-center gap-3" }, [
                            createVNode("div", { class: "p-2 bg-orange-50 dark:bg-orange-900/50 rounded-lg" }, [
                              createVNode(_component_UIcon, {
                                name: "i-lucide-bar-chart-3",
                                class: "h-5 w-5 text-orange-600 dark:text-orange-400"
                              })
                            ]),
                            createVNode("div", null, [
                              createVNode("h3", { class: "text-lg font-semibold" }, "Vendor Analysis"),
                              createVNode("p", { class: "text-sm text-muted" }, "Top spending relationships")
                            ])
                          ])
                        ]),
                        default: withCtx(() => [
                          createVNode(_component_ClientOnly, null, {
                            default: withCtx(() => [
                              createVNode(unref(AsyncVendorContributionBars), {
                                vendors: unref(data)?.vendors || []
                              }, null, 8, ["vendors"])
                            ]),
                            _: 1
                          })
                        ]),
                        _: 1
                      }),
                      createVNode(_component_UCard, { class: "shadow-sm border-0 bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm" }, {
                        header: withCtx(() => [
                          createVNode("div", { class: "flex items-center gap-3" }, [
                            createVNode("div", { class: "p-2 bg-purple-50 dark:bg-purple-900/50 rounded-lg" }, [
                              createVNode(_component_UIcon, {
                                name: "i-lucide-activity",
                                class: "h-5 w-5 text-purple-600 dark:text-purple-400"
                              })
                            ]),
                            createVNode("div", null, [
                              createVNode("h3", { class: "text-lg font-semibold" }, "Key Insights"),
                              createVNode("p", { class: "text-sm text-muted" }, "Performance indicators")
                            ])
                          ])
                        ]),
                        default: withCtx(() => [
                          createVNode("div", { class: "space-y-4" }, [
                            createVNode("div", { class: "flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg" }, [
                              createVNode("div", { class: "flex items-center gap-3" }, [
                                createVNode(_component_UIcon, {
                                  name: "i-lucide-users",
                                  class: "h-4 w-4 text-blue-600"
                                }),
                                createVNode("span", { class: "text-sm font-medium" }, "Active Vendors")
                              ]),
                              createVNode(_component_UBadge, {
                                color: "blue",
                                variant: "subtle"
                              }, {
                                default: withCtx(() => [
                                  createTextVNode(toDisplayString(unref(metrics).vendorCount), 1)
                                ]),
                                _: 1
                              })
                            ]),
                            createVNode("div", { class: "flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg" }, [
                              createVNode("div", { class: "flex items-center gap-3" }, [
                                createVNode(_component_UIcon, {
                                  name: "i-lucide-layers",
                                  class: "h-4 w-4 text-green-600"
                                }),
                                createVNode("span", { class: "text-sm font-medium" }, "Expense Categories")
                              ]),
                              createVNode(_component_UBadge, {
                                color: "green",
                                variant: "subtle"
                              }, {
                                default: withCtx(() => [
                                  createTextVNode(toDisplayString(unref(metrics).categoryCount), 1)
                                ]),
                                _: 1
                              })
                            ]),
                            createVNode("div", { class: "flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg" }, [
                              createVNode("div", { class: "flex items-center gap-3" }, [
                                createVNode(_component_UIcon, {
                                  name: "i-lucide-percent",
                                  class: "h-4 w-4 text-purple-600"
                                }),
                                createVNode("span", { class: "text-sm font-medium" }, "Top Category Share")
                              ]),
                              createVNode(_component_UBadge, {
                                color: "purple",
                                variant: "subtle"
                              }, {
                                default: withCtx(() => [
                                  createTextVNode(toDisplayString(unref(metrics).topCategory && unref(metrics).totalSpend > 0 ? `${(unref(metrics).topCategory.amount / unref(metrics).totalSpend * 100).toFixed(1)}%` : "0%"), 1)
                                ]),
                                _: 1
                              })
                            ])
                          ])
                        ]),
                        _: 1
                      }),
                      createVNode(_component_UCard, { class: "shadow-sm border-0 bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm" }, {
                        header: withCtx(() => [
                          createVNode("div", { class: "flex items-center gap-3" }, [
                            createVNode("div", { class: "p-2 bg-indigo-50 dark:bg-indigo-900/50 rounded-lg" }, [
                              createVNode(_component_UIcon, {
                                name: "i-lucide-trending-up",
                                class: "h-5 w-5 text-indigo-600 dark:text-indigo-400"
                              })
                            ]),
                            createVNode("div", null, [
                              createVNode("h3", { class: "text-lg font-semibold" }, "Expense Trends"),
                              createVNode("p", { class: "text-sm text-muted" }, "Distribution patterns")
                            ])
                          ])
                        ]),
                        default: withCtx(() => [
                          createVNode("div", { class: "space-y-6" }, [
                            createVNode("div", null, [
                              createVNode("h4", { class: "text-sm font-semibold mb-3 text-muted" }, "Top 5 Categories"),
                              createVNode("div", { class: "space-y-2" }, [
                                (openBlock(true), createBlock(Fragment, null, renderList((unref(data)?.categories || []).slice(0, 5), (category, index) => {
                                  return openBlock(), createBlock("div", {
                                    key: category.name,
                                    class: "relative"
                                  }, [
                                    createVNode("div", { class: "flex items-center justify-between text-sm mb-1" }, [
                                      createVNode("span", {
                                        class: "truncate",
                                        title: category.name
                                      }, toDisplayString(category.name.length > 20 ? category.name.substring(0, 20) + "..." : category.name), 9, ["title"]),
                                      createVNode("span", { class: "text-xs text-muted" }, toDisplayString(unref(metrics).totalSpend > 0 ? (category.amount / unref(metrics).totalSpend * 100).toFixed(1) : 0) + "% ", 1)
                                    ]),
                                    createVNode("div", { class: "h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden" }, [
                                      createVNode("div", {
                                        class: "h-full rounded-full transition-all duration-500",
                                        style: {
                                          backgroundColor: ["#3b82f6", "#10b981", "#8b5cf6", "#f97316", "#ef4444"][index % 5],
                                          width: unref(metrics).totalSpend > 0 ? `${category.amount / unref(metrics).totalSpend * 100}%` : "0%"
                                        }
                                      }, null, 4)
                                    ])
                                  ]);
                                }), 128))
                              ])
                            ]),
                            createVNode("div", { class: "border-t border-gray-100 dark:border-gray-800 pt-4" }, [
                              createVNode("h4", { class: "text-sm font-semibold mb-3 text-muted" }, "Top 5 Vendors"),
                              createVNode("div", { class: "space-y-2" }, [
                                (openBlock(true), createBlock(Fragment, null, renderList((unref(data)?.vendors || []).slice(0, 5), (vendor, index) => {
                                  return openBlock(), createBlock("div", {
                                    key: vendor.name,
                                    class: "flex items-center gap-2 text-sm"
                                  }, [
                                    createVNode("div", {
                                      class: ["w-3 h-3 rounded-full flex-shrink-0", `bg-${["indigo", "cyan", "pink", "yellow", "emerald"][index % 5]}-500`]
                                    }, null, 2),
                                    createVNode("span", {
                                      class: "truncate flex-1",
                                      title: vendor.name
                                    }, toDisplayString(vendor.name), 9, ["title"]),
                                    createVNode("span", { class: "font-medium text-green-600 text-xs" }, toDisplayString(formatCurrency(vendor.amount)), 1)
                                  ]);
                                }), 128))
                              ])
                            ]),
                            createVNode("div", { class: "border-t border-gray-100 dark:border-gray-800 pt-4" }, [
                              createVNode("h4", { class: "text-sm font-semibold mb-3 text-muted" }, "Quick Actions"),
                              createVNode("div", { class: "grid grid-cols-2 gap-2" }, [
                                createVNode(_component_UButton, {
                                  size: "sm",
                                  variant: "ghost",
                                  class: "justify-start text-xs"
                                }, {
                                  default: withCtx(() => [
                                    createVNode(_component_UIcon, {
                                      name: "i-lucide-filter",
                                      class: "h-3 w-3"
                                    }),
                                    createTextVNode(" Filter ")
                                  ]),
                                  _: 1
                                }),
                                createVNode(_component_UButton, {
                                  size: "sm",
                                  variant: "ghost",
                                  class: "justify-start text-xs"
                                }, {
                                  default: withCtx(() => [
                                    createVNode(_component_UIcon, {
                                      name: "i-lucide-search",
                                      class: "h-3 w-3"
                                    }),
                                    createTextVNode(" Search ")
                                  ]),
                                  _: 1
                                }),
                                createVNode(_component_UButton, {
                                  size: "sm",
                                  variant: "ghost",
                                  class: "justify-start text-xs"
                                }, {
                                  default: withCtx(() => [
                                    createVNode(_component_UIcon, {
                                      name: "i-lucide-calendar",
                                      class: "h-3 w-3"
                                    }),
                                    createTextVNode(" Period ")
                                  ]),
                                  _: 1
                                }),
                                createVNode(_component_UButton, {
                                  size: "sm",
                                  variant: "ghost",
                                  class: "justify-start text-xs"
                                }, {
                                  default: withCtx(() => [
                                    createVNode(_component_UIcon, {
                                      name: "i-lucide-share",
                                      class: "h-3 w-3"
                                    }),
                                    createTextVNode(" Export ")
                                  ]),
                                  _: 1
                                })
                              ])
                            ])
                          ])
                        ]),
                        _: 1
                      })
                    ])
                  ])
                ])) : createCommentVNode("", true),
                createVNode("div", { class: "mt-8" }, [
                  createVNode(_component_ClientOnly, null, {
                    fallback: withCtx(() => [
                      createVNode(_component_UCard, { class: "shadow-sm border-0 bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm" }, {
                        default: withCtx(() => [
                          createVNode("div", { class: "flex items-center justify-center h-32" }, [
                            createVNode("div", { class: "text-center" }, [
                              createVNode(_component_USkeleton, { class: "h-4 w-32 mx-auto mb-2" }),
                              createVNode(_component_USkeleton, { class: "h-3 w-24 mx-auto" })
                            ])
                          ])
                        ]),
                        _: 1
                      })
                    ]),
                    default: withCtx(() => [
                      createVNode(_component_ExpensesAIInsights)
                    ]),
                    _: 1
                  })
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
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("pages/expenses/index.vue");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};

export { _sfc_main as default };
//# sourceMappingURL=index-TBQKL5Su.mjs.map
