import { defineComponent, ref, computed, mergeProps, withCtx, unref, isRef, createVNode, mergeModels, renderSlot, useSlots, useModel, useId, toRef, watch, createBlock, createCommentVNode, openBlock, createSlots, renderList, Fragment, useTemplateRef, onScopeDispose, resolveDynamicComponent, toHandlers, createTextVNode, toDisplayString, withKeys, withAsyncContext, useSSRContext } from 'vue';
import { ssrRenderComponent, ssrRenderSlot, ssrRenderAttrs, ssrRenderClass, ssrRenderList, ssrRenderVNode, ssrInterpolate, ssrRenderStyle, ssrRenderAttr } from 'vue/server-renderer';
import { Primitive, useForwardProps, useForwardPropsEmits, VisuallyHidden, DialogRoot, DialogTrigger, DialogPortal, DialogOverlay, DialogContent, DialogTitle, DialogDescription, DialogClose, ListboxRoot, ListboxFilter, ListboxContent, ListboxGroup, ListboxGroupLabel, ListboxItem, ListboxItemIndicator } from 'reka-ui';
import { p as provideDashboardContext, u as useDashboard, a as useResizable, b as _sfc_main$d, _ as _sfc_main$1$1 } from './DashboardSidebarToggle-BZQ1O4qq.mjs';
import { I as useRoute, u as useToast, H as useNuxtApp, g as useAppConfig, t as tv, f as useLocale, j as reactivePick, a as _sfc_main$9$1, J as transformUI, K as omit, L as useColorMode, k as usePortal, p as get, G as _sfc_main$a$1, M as pickLinkProps, N as _sfc_main$b$1, c as _sfc_main$e$1, b as _sfc_main$c$1, _ as _sfc_main$d$1, d as useFetch, O as __nuxt_component_1$1 } from './server.mjs';
import { B as defu } from '../nitro/nitro.mjs';
import { c as createReusableTemplate, i as formatTimeAgo } from './index-Cc9owYnb.mjs';
import { _ as _sfc_main$c } from './Modal-BTsLW1Cg.mjs';
import { DrawerRootNested, DrawerRoot, DrawerTrigger, DrawerPortal, DrawerOverlay, DrawerContent, DrawerHandle, DrawerTitle, DrawerDescription } from 'vaul-vue';
import { _ as _sfc_main$g } from './DropdownMenu-DlW5ut9G.mjs';
import { _ as _sfc_main$e } from './Kbd-DpYM52pA.mjs';
import { _ as _sfc_main$f } from './Tooltip-BVNuEb6A.mjs';
import { _ as _sfc_main$b } from './NavigationMenu-Cz4qWt4k.mjs';
import { useFuse } from '@vueuse/integrations/useFuse';
import { _ as _sfc_main$h } from './Input-CF7oUJK4.mjs';
import { d as defineShortcuts } from './defineShortcuts-tuhgUtyW.mjs';
import { u as useDashboard$1 } from './useDashboard-C6EnGCH4.mjs';
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
import 'node:http';
import 'node:https';
import 'node:events';
import 'node:buffer';
import 'node:fs';
import 'node:path';
import 'node:crypto';
import '@iconify/utils';
import 'consola';
import 'reka-ui/namespaced';
import './Badge-BVxjrbdp.mjs';
import './Popover-DbO_rtYu.mjs';

const theme$6 = {
  "base": "fixed inset-0 flex overflow-hidden"
};
const _sfc_main$a = {
  __name: "UDashboardGroup",
  __ssrInlineRender: true,
  props: {
    as: { type: null, required: false },
    class: { type: null, required: false },
    storage: { type: String, required: false, default: "cookie" },
    storageKey: { type: String, required: false, default: "dashboard" },
    persistent: { type: Boolean, required: false, default: true },
    unit: { type: String, required: false, default: "%" }
  },
  setup(__props) {
    const props = __props;
    const nuxtApp = useNuxtApp();
    const appConfig = useAppConfig();
    const ui = computed(() => tv({ extend: tv(theme$6), ...appConfig.ui?.dashboardGroup || {} }));
    const sidebarOpen = ref(false);
    const sidebarCollapsed = ref(false);
    provideDashboardContext({
      storage: props.storage,
      storageKey: props.storageKey,
      persistent: props.persistent,
      unit: props.unit,
      sidebarOpen,
      toggleSidebar: () => {
        nuxtApp.hooks.callHook("dashboard:sidebar:toggle");
      },
      sidebarCollapsed,
      collapseSidebar: (collapsed) => {
        nuxtApp.hooks.callHook("dashboard:sidebar:collapse", collapsed);
      },
      toggleSearch: () => {
        nuxtApp.hooks.callHook("dashboard:search:toggle");
      }
    });
    return (_ctx, _push, _parent, _attrs) => {
      _push(ssrRenderComponent(unref(Primitive), mergeProps({
        as: __props.as,
        class: ui.value({ class: props.class })
      }, _attrs), {
        default: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            ssrRenderSlot(_ctx.$slots, "default", {}, null, _push2, _parent2, _scopeId);
          } else {
            return [
              renderSlot(_ctx.$slots, "default")
            ];
          }
        }),
        _: 3
      }, _parent));
    };
  }
};
const _sfc_setup$a = _sfc_main$a.setup;
_sfc_main$a.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("../node_modules/.pnpm/@nuxt+ui@4.0.0-alpha.2_@babel+parser@7.28.0_@netlify+blobs@9.1.2_change-case@5.4.4_db0@_b85612ac9055e711c0cdf49df3463bec/node_modules/@nuxt/ui/dist/runtime/components/DashboardGroup.vue");
  return _sfc_setup$a ? _sfc_setup$a(props, ctx) : void 0;
};
const theme$5 = {
  "slots": {
    "overlay": "fixed inset-0 bg-elevated/75",
    "content": "fixed bg-default divide-y divide-default sm:ring ring-default sm:shadow-lg flex flex-col focus:outline-none",
    "header": "flex items-center gap-1.5 p-4 sm:px-6 min-h-16",
    "wrapper": "",
    "body": "flex-1 overflow-y-auto p-4 sm:p-6",
    "footer": "flex items-center gap-1.5 p-4 sm:px-6",
    "title": "text-highlighted font-semibold",
    "description": "mt-1 text-muted text-sm",
    "close": "absolute top-4 end-4"
  },
  "variants": {
    "side": {
      "top": {
        "content": "inset-x-0 top-0 max-h-full"
      },
      "right": {
        "content": "right-0 inset-y-0 w-full max-w-md"
      },
      "bottom": {
        "content": "inset-x-0 bottom-0 max-h-full"
      },
      "left": {
        "content": "left-0 inset-y-0 w-full max-w-md"
      }
    },
    "transition": {
      "true": {
        "overlay": "data-[state=open]:animate-[fade-in_200ms_ease-out] data-[state=closed]:animate-[fade-out_200ms_ease-in]"
      }
    }
  },
  "compoundVariants": [
    {
      "transition": true,
      "side": "top",
      "class": {
        "content": "data-[state=open]:animate-[slide-in-from-top_200ms_ease-in-out] data-[state=closed]:animate-[slide-out-to-top_200ms_ease-in-out]"
      }
    },
    {
      "transition": true,
      "side": "right",
      "class": {
        "content": "data-[state=open]:animate-[slide-in-from-right_200ms_ease-in-out] data-[state=closed]:animate-[slide-out-to-right_200ms_ease-in-out]"
      }
    },
    {
      "transition": true,
      "side": "bottom",
      "class": {
        "content": "data-[state=open]:animate-[slide-in-from-bottom_200ms_ease-in-out] data-[state=closed]:animate-[slide-out-to-bottom_200ms_ease-in-out]"
      }
    },
    {
      "transition": true,
      "side": "left",
      "class": {
        "content": "data-[state=open]:animate-[slide-in-from-left_200ms_ease-in-out] data-[state=closed]:animate-[slide-out-to-left_200ms_ease-in-out]"
      }
    }
  ]
};
const _sfc_main$9 = {
  __name: "USlideover",
  __ssrInlineRender: true,
  props: {
    title: { type: String, required: false },
    description: { type: String, required: false },
    content: { type: Object, required: false },
    overlay: { type: Boolean, required: false, default: true },
    transition: { type: Boolean, required: false, default: true },
    side: { type: null, required: false, default: "right" },
    portal: { type: [Boolean, String], required: false, skipCheck: true, default: true },
    close: { type: [Boolean, Object], required: false, default: true },
    closeIcon: { type: [String, Object], required: false },
    dismissible: { type: Boolean, required: false, default: true },
    class: { type: null, required: false },
    ui: { type: null, required: false },
    open: { type: Boolean, required: false },
    defaultOpen: { type: Boolean, required: false },
    modal: { type: Boolean, required: false, default: true }
  },
  emits: ["after:leave", "after:enter", "close:prevent", "update:open"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emits = __emit;
    const slots = useSlots();
    const { t } = useLocale();
    const appConfig = useAppConfig();
    const rootProps = useForwardPropsEmits(reactivePick(props, "open", "defaultOpen", "modal"), emits);
    const portalProps = usePortal(toRef(() => props.portal));
    const contentProps = toRef(() => props.content);
    const contentEvents = computed(() => {
      const defaultEvents = {
        closeAutoFocus: (e) => e.preventDefault()
      };
      if (!props.dismissible) {
        const events = ["pointerDownOutside", "interactOutside", "escapeKeyDown"];
        return events.reduce((acc, curr) => {
          acc[curr] = (e) => {
            e.preventDefault();
            emits("close:prevent");
          };
          return acc;
        }, defaultEvents);
      }
      return defaultEvents;
    });
    const ui = computed(() => tv({ extend: tv(theme$5), ...appConfig.ui?.slideover || {} })({
      transition: props.transition,
      side: props.side
    }));
    return (_ctx, _push, _parent, _attrs) => {
      _push(ssrRenderComponent(unref(DialogRoot), mergeProps(unref(rootProps), _attrs), {
        default: withCtx(({ open, close }, _push2, _parent2, _scopeId) => {
          if (_push2) {
            if (!!slots.default) {
              _push2(ssrRenderComponent(unref(DialogTrigger), {
                "as-child": "",
                class: props.class
              }, {
                default: withCtx((_, _push3, _parent3, _scopeId2) => {
                  if (_push3) {
                    ssrRenderSlot(_ctx.$slots, "default", { open }, null, _push3, _parent3, _scopeId2);
                  } else {
                    return [
                      renderSlot(_ctx.$slots, "default", { open })
                    ];
                  }
                }),
                _: 2
              }, _parent2, _scopeId));
            } else {
              _push2(`<!---->`);
            }
            _push2(ssrRenderComponent(unref(DialogPortal), unref(portalProps), {
              default: withCtx((_, _push3, _parent3, _scopeId2) => {
                if (_push3) {
                  if (__props.overlay) {
                    _push3(ssrRenderComponent(unref(DialogOverlay), {
                      class: ui.value.overlay({ class: props.ui?.overlay })
                    }, null, _parent3, _scopeId2));
                  } else {
                    _push3(`<!---->`);
                  }
                  _push3(ssrRenderComponent(unref(DialogContent), mergeProps({
                    "data-side": __props.side,
                    class: ui.value.content({ class: [!slots.default && props.class, props.ui?.content] })
                  }, contentProps.value, {
                    onAfterEnter: ($event) => emits("after:enter"),
                    onAfterLeave: ($event) => emits("after:leave")
                  }, toHandlers(contentEvents.value)), {
                    default: withCtx((_2, _push4, _parent4, _scopeId3) => {
                      if (_push4) {
                        if (!!slots.content && (__props.title || !!slots.title || (__props.description || !!slots.description))) {
                          _push4(ssrRenderComponent(unref(VisuallyHidden), null, {
                            default: withCtx((_3, _push5, _parent5, _scopeId4) => {
                              if (_push5) {
                                if (__props.title || !!slots.title) {
                                  _push5(ssrRenderComponent(unref(DialogTitle), null, {
                                    default: withCtx((_4, _push6, _parent6, _scopeId5) => {
                                      if (_push6) {
                                        ssrRenderSlot(_ctx.$slots, "title", {}, () => {
                                          _push6(`${ssrInterpolate(__props.title)}`);
                                        }, _push6, _parent6, _scopeId5);
                                      } else {
                                        return [
                                          renderSlot(_ctx.$slots, "title", {}, () => [
                                            createTextVNode(toDisplayString(__props.title), 1)
                                          ])
                                        ];
                                      }
                                    }),
                                    _: 2
                                  }, _parent5, _scopeId4));
                                } else {
                                  _push5(`<!---->`);
                                }
                                if (__props.description || !!slots.description) {
                                  _push5(ssrRenderComponent(unref(DialogDescription), null, {
                                    default: withCtx((_4, _push6, _parent6, _scopeId5) => {
                                      if (_push6) {
                                        ssrRenderSlot(_ctx.$slots, "description", {}, () => {
                                          _push6(`${ssrInterpolate(__props.description)}`);
                                        }, _push6, _parent6, _scopeId5);
                                      } else {
                                        return [
                                          renderSlot(_ctx.$slots, "description", {}, () => [
                                            createTextVNode(toDisplayString(__props.description), 1)
                                          ])
                                        ];
                                      }
                                    }),
                                    _: 2
                                  }, _parent5, _scopeId4));
                                } else {
                                  _push5(`<!---->`);
                                }
                              } else {
                                return [
                                  __props.title || !!slots.title ? (openBlock(), createBlock(unref(DialogTitle), { key: 0 }, {
                                    default: withCtx(() => [
                                      renderSlot(_ctx.$slots, "title", {}, () => [
                                        createTextVNode(toDisplayString(__props.title), 1)
                                      ])
                                    ]),
                                    _: 3
                                  })) : createCommentVNode("", true),
                                  __props.description || !!slots.description ? (openBlock(), createBlock(unref(DialogDescription), { key: 1 }, {
                                    default: withCtx(() => [
                                      renderSlot(_ctx.$slots, "description", {}, () => [
                                        createTextVNode(toDisplayString(__props.description), 1)
                                      ])
                                    ]),
                                    _: 3
                                  })) : createCommentVNode("", true)
                                ];
                              }
                            }),
                            _: 2
                          }, _parent4, _scopeId3));
                        } else {
                          _push4(`<!---->`);
                        }
                        ssrRenderSlot(_ctx.$slots, "content", { close }, () => {
                          if (!!slots.header || (__props.title || !!slots.title) || (__props.description || !!slots.description) || (props.close || !!slots.close)) {
                            _push4(`<div class="${ssrRenderClass(ui.value.header({ class: props.ui?.header }))}"${_scopeId3}>`);
                            ssrRenderSlot(_ctx.$slots, "header", { close }, () => {
                              _push4(`<div class="${ssrRenderClass(ui.value.wrapper({ class: props.ui?.wrapper }))}"${_scopeId3}>`);
                              if (__props.title || !!slots.title) {
                                _push4(ssrRenderComponent(unref(DialogTitle), {
                                  class: ui.value.title({ class: props.ui?.title })
                                }, {
                                  default: withCtx((_3, _push5, _parent5, _scopeId4) => {
                                    if (_push5) {
                                      ssrRenderSlot(_ctx.$slots, "title", {}, () => {
                                        _push5(`${ssrInterpolate(__props.title)}`);
                                      }, _push5, _parent5, _scopeId4);
                                    } else {
                                      return [
                                        renderSlot(_ctx.$slots, "title", {}, () => [
                                          createTextVNode(toDisplayString(__props.title), 1)
                                        ])
                                      ];
                                    }
                                  }),
                                  _: 2
                                }, _parent4, _scopeId3));
                              } else {
                                _push4(`<!---->`);
                              }
                              if (__props.description || !!slots.description) {
                                _push4(ssrRenderComponent(unref(DialogDescription), {
                                  class: ui.value.description({ class: props.ui?.description })
                                }, {
                                  default: withCtx((_3, _push5, _parent5, _scopeId4) => {
                                    if (_push5) {
                                      ssrRenderSlot(_ctx.$slots, "description", {}, () => {
                                        _push5(`${ssrInterpolate(__props.description)}`);
                                      }, _push5, _parent5, _scopeId4);
                                    } else {
                                      return [
                                        renderSlot(_ctx.$slots, "description", {}, () => [
                                          createTextVNode(toDisplayString(__props.description), 1)
                                        ])
                                      ];
                                    }
                                  }),
                                  _: 2
                                }, _parent4, _scopeId3));
                              } else {
                                _push4(`<!---->`);
                              }
                              _push4(`</div>`);
                              ssrRenderSlot(_ctx.$slots, "actions", {}, null, _push4, _parent4, _scopeId3);
                              if (props.close || !!slots.close) {
                                _push4(ssrRenderComponent(unref(DialogClose), { "as-child": "" }, {
                                  default: withCtx((_3, _push5, _parent5, _scopeId4) => {
                                    if (_push5) {
                                      ssrRenderSlot(_ctx.$slots, "close", {
                                        close,
                                        ui: ui.value
                                      }, () => {
                                        if (props.close) {
                                          _push5(ssrRenderComponent(_sfc_main$9$1, mergeProps({
                                            icon: __props.closeIcon || unref(appConfig).ui.icons.close,
                                            color: "neutral",
                                            variant: "ghost",
                                            "aria-label": unref(t)("slideover.close")
                                          }, typeof props.close === "object" ? props.close : {}, {
                                            class: ui.value.close({ class: props.ui?.close })
                                          }), null, _parent5, _scopeId4));
                                        } else {
                                          _push5(`<!---->`);
                                        }
                                      }, _push5, _parent5, _scopeId4);
                                    } else {
                                      return [
                                        renderSlot(_ctx.$slots, "close", {
                                          close,
                                          ui: ui.value
                                        }, () => [
                                          props.close ? (openBlock(), createBlock(_sfc_main$9$1, mergeProps({
                                            key: 0,
                                            icon: __props.closeIcon || unref(appConfig).ui.icons.close,
                                            color: "neutral",
                                            variant: "ghost",
                                            "aria-label": unref(t)("slideover.close")
                                          }, typeof props.close === "object" ? props.close : {}, {
                                            class: ui.value.close({ class: props.ui?.close })
                                          }), null, 16, ["icon", "aria-label", "class"])) : createCommentVNode("", true)
                                        ])
                                      ];
                                    }
                                  }),
                                  _: 2
                                }, _parent4, _scopeId3));
                              } else {
                                _push4(`<!---->`);
                              }
                            }, _push4, _parent4, _scopeId3);
                            _push4(`</div>`);
                          } else {
                            _push4(`<!---->`);
                          }
                          _push4(`<div class="${ssrRenderClass(ui.value.body({ class: props.ui?.body }))}"${_scopeId3}>`);
                          ssrRenderSlot(_ctx.$slots, "body", { close }, null, _push4, _parent4, _scopeId3);
                          _push4(`</div>`);
                          if (!!slots.footer) {
                            _push4(`<div class="${ssrRenderClass(ui.value.footer({ class: props.ui?.footer }))}"${_scopeId3}>`);
                            ssrRenderSlot(_ctx.$slots, "footer", { close }, null, _push4, _parent4, _scopeId3);
                            _push4(`</div>`);
                          } else {
                            _push4(`<!---->`);
                          }
                        }, _push4, _parent4, _scopeId3);
                      } else {
                        return [
                          !!slots.content && (__props.title || !!slots.title || (__props.description || !!slots.description)) ? (openBlock(), createBlock(unref(VisuallyHidden), { key: 0 }, {
                            default: withCtx(() => [
                              __props.title || !!slots.title ? (openBlock(), createBlock(unref(DialogTitle), { key: 0 }, {
                                default: withCtx(() => [
                                  renderSlot(_ctx.$slots, "title", {}, () => [
                                    createTextVNode(toDisplayString(__props.title), 1)
                                  ])
                                ]),
                                _: 3
                              })) : createCommentVNode("", true),
                              __props.description || !!slots.description ? (openBlock(), createBlock(unref(DialogDescription), { key: 1 }, {
                                default: withCtx(() => [
                                  renderSlot(_ctx.$slots, "description", {}, () => [
                                    createTextVNode(toDisplayString(__props.description), 1)
                                  ])
                                ]),
                                _: 3
                              })) : createCommentVNode("", true)
                            ]),
                            _: 3
                          })) : createCommentVNode("", true),
                          renderSlot(_ctx.$slots, "content", { close }, () => [
                            !!slots.header || (__props.title || !!slots.title) || (__props.description || !!slots.description) || (props.close || !!slots.close) ? (openBlock(), createBlock("div", {
                              key: 0,
                              class: ui.value.header({ class: props.ui?.header })
                            }, [
                              renderSlot(_ctx.$slots, "header", { close }, () => [
                                createVNode("div", {
                                  class: ui.value.wrapper({ class: props.ui?.wrapper })
                                }, [
                                  __props.title || !!slots.title ? (openBlock(), createBlock(unref(DialogTitle), {
                                    key: 0,
                                    class: ui.value.title({ class: props.ui?.title })
                                  }, {
                                    default: withCtx(() => [
                                      renderSlot(_ctx.$slots, "title", {}, () => [
                                        createTextVNode(toDisplayString(__props.title), 1)
                                      ])
                                    ]),
                                    _: 3
                                  }, 8, ["class"])) : createCommentVNode("", true),
                                  __props.description || !!slots.description ? (openBlock(), createBlock(unref(DialogDescription), {
                                    key: 1,
                                    class: ui.value.description({ class: props.ui?.description })
                                  }, {
                                    default: withCtx(() => [
                                      renderSlot(_ctx.$slots, "description", {}, () => [
                                        createTextVNode(toDisplayString(__props.description), 1)
                                      ])
                                    ]),
                                    _: 3
                                  }, 8, ["class"])) : createCommentVNode("", true)
                                ], 2),
                                renderSlot(_ctx.$slots, "actions"),
                                props.close || !!slots.close ? (openBlock(), createBlock(unref(DialogClose), {
                                  key: 0,
                                  "as-child": ""
                                }, {
                                  default: withCtx(() => [
                                    renderSlot(_ctx.$slots, "close", {
                                      close,
                                      ui: ui.value
                                    }, () => [
                                      props.close ? (openBlock(), createBlock(_sfc_main$9$1, mergeProps({
                                        key: 0,
                                        icon: __props.closeIcon || unref(appConfig).ui.icons.close,
                                        color: "neutral",
                                        variant: "ghost",
                                        "aria-label": unref(t)("slideover.close")
                                      }, typeof props.close === "object" ? props.close : {}, {
                                        class: ui.value.close({ class: props.ui?.close })
                                      }), null, 16, ["icon", "aria-label", "class"])) : createCommentVNode("", true)
                                    ])
                                  ]),
                                  _: 2
                                }, 1024)) : createCommentVNode("", true)
                              ])
                            ], 2)) : createCommentVNode("", true),
                            createVNode("div", {
                              class: ui.value.body({ class: props.ui?.body })
                            }, [
                              renderSlot(_ctx.$slots, "body", { close })
                            ], 2),
                            !!slots.footer ? (openBlock(), createBlock("div", {
                              key: 1,
                              class: ui.value.footer({ class: props.ui?.footer })
                            }, [
                              renderSlot(_ctx.$slots, "footer", { close })
                            ], 2)) : createCommentVNode("", true)
                          ])
                        ];
                      }
                    }),
                    _: 2
                  }, _parent3, _scopeId2));
                } else {
                  return [
                    __props.overlay ? (openBlock(), createBlock(unref(DialogOverlay), {
                      key: 0,
                      class: ui.value.overlay({ class: props.ui?.overlay })
                    }, null, 8, ["class"])) : createCommentVNode("", true),
                    createVNode(unref(DialogContent), mergeProps({
                      "data-side": __props.side,
                      class: ui.value.content({ class: [!slots.default && props.class, props.ui?.content] })
                    }, contentProps.value, {
                      onAfterEnter: ($event) => emits("after:enter"),
                      onAfterLeave: ($event) => emits("after:leave")
                    }, toHandlers(contentEvents.value)), {
                      default: withCtx(() => [
                        !!slots.content && (__props.title || !!slots.title || (__props.description || !!slots.description)) ? (openBlock(), createBlock(unref(VisuallyHidden), { key: 0 }, {
                          default: withCtx(() => [
                            __props.title || !!slots.title ? (openBlock(), createBlock(unref(DialogTitle), { key: 0 }, {
                              default: withCtx(() => [
                                renderSlot(_ctx.$slots, "title", {}, () => [
                                  createTextVNode(toDisplayString(__props.title), 1)
                                ])
                              ]),
                              _: 3
                            })) : createCommentVNode("", true),
                            __props.description || !!slots.description ? (openBlock(), createBlock(unref(DialogDescription), { key: 1 }, {
                              default: withCtx(() => [
                                renderSlot(_ctx.$slots, "description", {}, () => [
                                  createTextVNode(toDisplayString(__props.description), 1)
                                ])
                              ]),
                              _: 3
                            })) : createCommentVNode("", true)
                          ]),
                          _: 3
                        })) : createCommentVNode("", true),
                        renderSlot(_ctx.$slots, "content", { close }, () => [
                          !!slots.header || (__props.title || !!slots.title) || (__props.description || !!slots.description) || (props.close || !!slots.close) ? (openBlock(), createBlock("div", {
                            key: 0,
                            class: ui.value.header({ class: props.ui?.header })
                          }, [
                            renderSlot(_ctx.$slots, "header", { close }, () => [
                              createVNode("div", {
                                class: ui.value.wrapper({ class: props.ui?.wrapper })
                              }, [
                                __props.title || !!slots.title ? (openBlock(), createBlock(unref(DialogTitle), {
                                  key: 0,
                                  class: ui.value.title({ class: props.ui?.title })
                                }, {
                                  default: withCtx(() => [
                                    renderSlot(_ctx.$slots, "title", {}, () => [
                                      createTextVNode(toDisplayString(__props.title), 1)
                                    ])
                                  ]),
                                  _: 3
                                }, 8, ["class"])) : createCommentVNode("", true),
                                __props.description || !!slots.description ? (openBlock(), createBlock(unref(DialogDescription), {
                                  key: 1,
                                  class: ui.value.description({ class: props.ui?.description })
                                }, {
                                  default: withCtx(() => [
                                    renderSlot(_ctx.$slots, "description", {}, () => [
                                      createTextVNode(toDisplayString(__props.description), 1)
                                    ])
                                  ]),
                                  _: 3
                                }, 8, ["class"])) : createCommentVNode("", true)
                              ], 2),
                              renderSlot(_ctx.$slots, "actions"),
                              props.close || !!slots.close ? (openBlock(), createBlock(unref(DialogClose), {
                                key: 0,
                                "as-child": ""
                              }, {
                                default: withCtx(() => [
                                  renderSlot(_ctx.$slots, "close", {
                                    close,
                                    ui: ui.value
                                  }, () => [
                                    props.close ? (openBlock(), createBlock(_sfc_main$9$1, mergeProps({
                                      key: 0,
                                      icon: __props.closeIcon || unref(appConfig).ui.icons.close,
                                      color: "neutral",
                                      variant: "ghost",
                                      "aria-label": unref(t)("slideover.close")
                                    }, typeof props.close === "object" ? props.close : {}, {
                                      class: ui.value.close({ class: props.ui?.close })
                                    }), null, 16, ["icon", "aria-label", "class"])) : createCommentVNode("", true)
                                  ])
                                ]),
                                _: 2
                              }, 1024)) : createCommentVNode("", true)
                            ])
                          ], 2)) : createCommentVNode("", true),
                          createVNode("div", {
                            class: ui.value.body({ class: props.ui?.body })
                          }, [
                            renderSlot(_ctx.$slots, "body", { close })
                          ], 2),
                          !!slots.footer ? (openBlock(), createBlock("div", {
                            key: 1,
                            class: ui.value.footer({ class: props.ui?.footer })
                          }, [
                            renderSlot(_ctx.$slots, "footer", { close })
                          ], 2)) : createCommentVNode("", true)
                        ])
                      ]),
                      _: 2
                    }, 1040, ["data-side", "class", "onAfterEnter", "onAfterLeave"])
                  ];
                }
              }),
              _: 2
            }, _parent2, _scopeId));
          } else {
            return [
              !!slots.default ? (openBlock(), createBlock(unref(DialogTrigger), {
                key: 0,
                "as-child": "",
                class: props.class
              }, {
                default: withCtx(() => [
                  renderSlot(_ctx.$slots, "default", { open })
                ]),
                _: 2
              }, 1032, ["class"])) : createCommentVNode("", true),
              createVNode(unref(DialogPortal), unref(portalProps), {
                default: withCtx(() => [
                  __props.overlay ? (openBlock(), createBlock(unref(DialogOverlay), {
                    key: 0,
                    class: ui.value.overlay({ class: props.ui?.overlay })
                  }, null, 8, ["class"])) : createCommentVNode("", true),
                  createVNode(unref(DialogContent), mergeProps({
                    "data-side": __props.side,
                    class: ui.value.content({ class: [!slots.default && props.class, props.ui?.content] })
                  }, contentProps.value, {
                    onAfterEnter: ($event) => emits("after:enter"),
                    onAfterLeave: ($event) => emits("after:leave")
                  }, toHandlers(contentEvents.value)), {
                    default: withCtx(() => [
                      !!slots.content && (__props.title || !!slots.title || (__props.description || !!slots.description)) ? (openBlock(), createBlock(unref(VisuallyHidden), { key: 0 }, {
                        default: withCtx(() => [
                          __props.title || !!slots.title ? (openBlock(), createBlock(unref(DialogTitle), { key: 0 }, {
                            default: withCtx(() => [
                              renderSlot(_ctx.$slots, "title", {}, () => [
                                createTextVNode(toDisplayString(__props.title), 1)
                              ])
                            ]),
                            _: 3
                          })) : createCommentVNode("", true),
                          __props.description || !!slots.description ? (openBlock(), createBlock(unref(DialogDescription), { key: 1 }, {
                            default: withCtx(() => [
                              renderSlot(_ctx.$slots, "description", {}, () => [
                                createTextVNode(toDisplayString(__props.description), 1)
                              ])
                            ]),
                            _: 3
                          })) : createCommentVNode("", true)
                        ]),
                        _: 3
                      })) : createCommentVNode("", true),
                      renderSlot(_ctx.$slots, "content", { close }, () => [
                        !!slots.header || (__props.title || !!slots.title) || (__props.description || !!slots.description) || (props.close || !!slots.close) ? (openBlock(), createBlock("div", {
                          key: 0,
                          class: ui.value.header({ class: props.ui?.header })
                        }, [
                          renderSlot(_ctx.$slots, "header", { close }, () => [
                            createVNode("div", {
                              class: ui.value.wrapper({ class: props.ui?.wrapper })
                            }, [
                              __props.title || !!slots.title ? (openBlock(), createBlock(unref(DialogTitle), {
                                key: 0,
                                class: ui.value.title({ class: props.ui?.title })
                              }, {
                                default: withCtx(() => [
                                  renderSlot(_ctx.$slots, "title", {}, () => [
                                    createTextVNode(toDisplayString(__props.title), 1)
                                  ])
                                ]),
                                _: 3
                              }, 8, ["class"])) : createCommentVNode("", true),
                              __props.description || !!slots.description ? (openBlock(), createBlock(unref(DialogDescription), {
                                key: 1,
                                class: ui.value.description({ class: props.ui?.description })
                              }, {
                                default: withCtx(() => [
                                  renderSlot(_ctx.$slots, "description", {}, () => [
                                    createTextVNode(toDisplayString(__props.description), 1)
                                  ])
                                ]),
                                _: 3
                              }, 8, ["class"])) : createCommentVNode("", true)
                            ], 2),
                            renderSlot(_ctx.$slots, "actions"),
                            props.close || !!slots.close ? (openBlock(), createBlock(unref(DialogClose), {
                              key: 0,
                              "as-child": ""
                            }, {
                              default: withCtx(() => [
                                renderSlot(_ctx.$slots, "close", {
                                  close,
                                  ui: ui.value
                                }, () => [
                                  props.close ? (openBlock(), createBlock(_sfc_main$9$1, mergeProps({
                                    key: 0,
                                    icon: __props.closeIcon || unref(appConfig).ui.icons.close,
                                    color: "neutral",
                                    variant: "ghost",
                                    "aria-label": unref(t)("slideover.close")
                                  }, typeof props.close === "object" ? props.close : {}, {
                                    class: ui.value.close({ class: props.ui?.close })
                                  }), null, 16, ["icon", "aria-label", "class"])) : createCommentVNode("", true)
                                ])
                              ]),
                              _: 2
                            }, 1024)) : createCommentVNode("", true)
                          ])
                        ], 2)) : createCommentVNode("", true),
                        createVNode("div", {
                          class: ui.value.body({ class: props.ui?.body })
                        }, [
                          renderSlot(_ctx.$slots, "body", { close })
                        ], 2),
                        !!slots.footer ? (openBlock(), createBlock("div", {
                          key: 1,
                          class: ui.value.footer({ class: props.ui?.footer })
                        }, [
                          renderSlot(_ctx.$slots, "footer", { close })
                        ], 2)) : createCommentVNode("", true)
                      ])
                    ]),
                    _: 2
                  }, 1040, ["data-side", "class", "onAfterEnter", "onAfterLeave"])
                ]),
                _: 2
              }, 1040)
            ];
          }
        }),
        _: 3
      }, _parent));
    };
  }
};
const _sfc_setup$9 = _sfc_main$9.setup;
_sfc_main$9.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("../node_modules/.pnpm/@nuxt+ui@4.0.0-alpha.2_@babel+parser@7.28.0_@netlify+blobs@9.1.2_change-case@5.4.4_db0@_b85612ac9055e711c0cdf49df3463bec/node_modules/@nuxt/ui/dist/runtime/components/Slideover.vue");
  return _sfc_setup$9 ? _sfc_setup$9(props, ctx) : void 0;
};
const theme$4 = {
  "slots": {
    "overlay": "fixed inset-0 bg-elevated/75",
    "content": "fixed bg-default ring ring-default flex focus:outline-none",
    "handle": [
      "shrink-0 !bg-accented",
      "transition-opacity"
    ],
    "container": "w-full flex flex-col gap-4 p-4 overflow-y-auto",
    "header": "",
    "title": "text-highlighted font-semibold",
    "description": "mt-1 text-muted text-sm",
    "body": "flex-1",
    "footer": "flex flex-col gap-1.5"
  },
  "variants": {
    "direction": {
      "top": {
        "content": "mb-24 flex-col-reverse",
        "handle": "mb-4"
      },
      "right": {
        "content": "flex-row",
        "handle": "!ml-4"
      },
      "bottom": {
        "content": "mt-24 flex-col",
        "handle": "mt-4"
      },
      "left": {
        "content": "flex-row-reverse",
        "handle": "!mr-4"
      }
    },
    "inset": {
      "true": {
        "content": "rounded-lg after:hidden overflow-hidden [--initial-transform:calc(100%+1.5rem)]"
      }
    }
  },
  "compoundVariants": [
    {
      "direction": [
        "top",
        "bottom"
      ],
      "class": {
        "content": "h-auto max-h-[96%]",
        "handle": "!w-12 !h-1.5 mx-auto"
      }
    },
    {
      "direction": [
        "right",
        "left"
      ],
      "class": {
        "content": "w-auto max-w-[calc(100%-2rem)]",
        "handle": "!h-12 !w-1.5 mt-auto mb-auto"
      }
    },
    {
      "direction": "top",
      "inset": true,
      "class": {
        "content": "inset-x-4 top-4"
      }
    },
    {
      "direction": "top",
      "inset": false,
      "class": {
        "content": "inset-x-0 top-0 rounded-b-lg"
      }
    },
    {
      "direction": "bottom",
      "inset": true,
      "class": {
        "content": "inset-x-4 bottom-4"
      }
    },
    {
      "direction": "bottom",
      "inset": false,
      "class": {
        "content": "inset-x-0 bottom-0 rounded-t-lg"
      }
    },
    {
      "direction": "left",
      "inset": true,
      "class": {
        "content": "inset-y-4 left-4"
      }
    },
    {
      "direction": "left",
      "inset": false,
      "class": {
        "content": "inset-y-0 left-0 rounded-r-lg"
      }
    },
    {
      "direction": "right",
      "inset": true,
      "class": {
        "content": "inset-y-4 right-4"
      }
    },
    {
      "direction": "right",
      "inset": false,
      "class": {
        "content": "inset-y-0 right-0 rounded-l-lg"
      }
    }
  ]
};
const _sfc_main$8 = {
  __name: "UDrawer",
  __ssrInlineRender: true,
  props: {
    as: { type: null, required: false },
    title: { type: String, required: false },
    description: { type: String, required: false },
    inset: { type: Boolean, required: false },
    content: { type: Object, required: false },
    overlay: { type: Boolean, required: false, default: true },
    handle: { type: Boolean, required: false, default: true },
    portal: { type: [Boolean, String], required: false, skipCheck: true, default: true },
    nested: { type: Boolean, required: false },
    class: { type: null, required: false },
    ui: { type: null, required: false },
    activeSnapPoint: { type: [Number, String, null], required: false },
    closeThreshold: { type: Number, required: false },
    shouldScaleBackground: { type: Boolean, required: false },
    setBackgroundColorOnScale: { type: Boolean, required: false },
    scrollLockTimeout: { type: Number, required: false },
    fixed: { type: Boolean, required: false },
    dismissible: { type: Boolean, required: false, default: true },
    modal: { type: Boolean, required: false, default: true },
    open: { type: Boolean, required: false },
    defaultOpen: { type: Boolean, required: false },
    direction: { type: String, required: false, default: "bottom" },
    noBodyStyles: { type: Boolean, required: false },
    handleOnly: { type: Boolean, required: false },
    preventScrollRestoration: { type: Boolean, required: false },
    snapPoints: { type: Array, required: false }
  },
  emits: ["drag", "release", "close", "update:open", "update:activeSnapPoint", "animationEnd"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emits = __emit;
    const slots = useSlots();
    const appConfig = useAppConfig();
    const rootProps = useForwardPropsEmits(reactivePick(props, "activeSnapPoint", "closeThreshold", "shouldScaleBackground", "setBackgroundColorOnScale", "scrollLockTimeout", "fixed", "dismissible", "modal", "open", "defaultOpen", "nested", "direction", "noBodyStyles", "handleOnly", "preventScrollRestoration", "snapPoints"), emits);
    const portalProps = usePortal(toRef(() => props.portal));
    const contentProps = toRef(() => props.content);
    const contentEvents = {
      closeAutoFocus: (e) => e.preventDefault()
    };
    const ui = computed(() => tv({ extend: tv(theme$4), ...appConfig.ui?.drawer || {} })({
      direction: props.direction,
      inset: props.inset
    }));
    return (_ctx, _push, _parent, _attrs) => {
      ssrRenderVNode(_push, createVNode(resolveDynamicComponent(__props.nested ? unref(DrawerRootNested) : unref(DrawerRoot)), mergeProps(unref(rootProps), _attrs), {
        default: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            if (!!slots.default) {
              _push2(ssrRenderComponent(unref(DrawerTrigger), {
                "as-child": "",
                class: props.class
              }, {
                default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                  if (_push3) {
                    ssrRenderSlot(_ctx.$slots, "default", {}, null, _push3, _parent3, _scopeId2);
                  } else {
                    return [
                      renderSlot(_ctx.$slots, "default")
                    ];
                  }
                }),
                _: 3
              }, _parent2, _scopeId));
            } else {
              _push2(`<!---->`);
            }
            _push2(ssrRenderComponent(unref(DrawerPortal), unref(portalProps), {
              default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                if (_push3) {
                  if (__props.overlay) {
                    _push3(ssrRenderComponent(unref(DrawerOverlay), {
                      class: ui.value.overlay({ class: props.ui?.overlay })
                    }, null, _parent3, _scopeId2));
                  } else {
                    _push3(`<!---->`);
                  }
                  _push3(ssrRenderComponent(unref(DrawerContent), mergeProps({
                    class: ui.value.content({ class: [!slots.default && props.class, props.ui?.content] })
                  }, contentProps.value, toHandlers(contentEvents)), {
                    default: withCtx((_3, _push4, _parent4, _scopeId3) => {
                      if (_push4) {
                        if (__props.handle) {
                          _push4(ssrRenderComponent(unref(DrawerHandle), {
                            class: ui.value.handle({ class: props.ui?.handle })
                          }, null, _parent4, _scopeId3));
                        } else {
                          _push4(`<!---->`);
                        }
                        if (!!slots.content && (__props.title || !!slots.title || (__props.description || !!slots.description))) {
                          _push4(ssrRenderComponent(unref(VisuallyHidden), null, {
                            default: withCtx((_4, _push5, _parent5, _scopeId4) => {
                              if (_push5) {
                                if (__props.title || !!slots.title) {
                                  _push5(ssrRenderComponent(unref(DrawerTitle), null, {
                                    default: withCtx((_5, _push6, _parent6, _scopeId5) => {
                                      if (_push6) {
                                        ssrRenderSlot(_ctx.$slots, "title", {}, () => {
                                          _push6(`${ssrInterpolate(__props.title)}`);
                                        }, _push6, _parent6, _scopeId5);
                                      } else {
                                        return [
                                          renderSlot(_ctx.$slots, "title", {}, () => [
                                            createTextVNode(toDisplayString(__props.title), 1)
                                          ])
                                        ];
                                      }
                                    }),
                                    _: 3
                                  }, _parent5, _scopeId4));
                                } else {
                                  _push5(`<!---->`);
                                }
                                if (__props.description || !!slots.description) {
                                  _push5(ssrRenderComponent(unref(DrawerDescription), null, {
                                    default: withCtx((_5, _push6, _parent6, _scopeId5) => {
                                      if (_push6) {
                                        ssrRenderSlot(_ctx.$slots, "description", {}, () => {
                                          _push6(`${ssrInterpolate(__props.description)}`);
                                        }, _push6, _parent6, _scopeId5);
                                      } else {
                                        return [
                                          renderSlot(_ctx.$slots, "description", {}, () => [
                                            createTextVNode(toDisplayString(__props.description), 1)
                                          ])
                                        ];
                                      }
                                    }),
                                    _: 3
                                  }, _parent5, _scopeId4));
                                } else {
                                  _push5(`<!---->`);
                                }
                              } else {
                                return [
                                  __props.title || !!slots.title ? (openBlock(), createBlock(unref(DrawerTitle), { key: 0 }, {
                                    default: withCtx(() => [
                                      renderSlot(_ctx.$slots, "title", {}, () => [
                                        createTextVNode(toDisplayString(__props.title), 1)
                                      ])
                                    ]),
                                    _: 3
                                  })) : createCommentVNode("", true),
                                  __props.description || !!slots.description ? (openBlock(), createBlock(unref(DrawerDescription), { key: 1 }, {
                                    default: withCtx(() => [
                                      renderSlot(_ctx.$slots, "description", {}, () => [
                                        createTextVNode(toDisplayString(__props.description), 1)
                                      ])
                                    ]),
                                    _: 3
                                  })) : createCommentVNode("", true)
                                ];
                              }
                            }),
                            _: 3
                          }, _parent4, _scopeId3));
                        } else {
                          _push4(`<!---->`);
                        }
                        ssrRenderSlot(_ctx.$slots, "content", {}, () => {
                          _push4(`<div class="${ssrRenderClass(ui.value.container({ class: props.ui?.container }))}"${_scopeId3}>`);
                          if (!!slots.header || (__props.title || !!slots.title) || (__props.description || !!slots.description)) {
                            _push4(`<div class="${ssrRenderClass(ui.value.header({ class: props.ui?.header }))}"${_scopeId3}>`);
                            ssrRenderSlot(_ctx.$slots, "header", {}, () => {
                              if (__props.title || !!slots.title) {
                                _push4(ssrRenderComponent(unref(DrawerTitle), {
                                  class: ui.value.title({ class: props.ui?.title })
                                }, {
                                  default: withCtx((_4, _push5, _parent5, _scopeId4) => {
                                    if (_push5) {
                                      ssrRenderSlot(_ctx.$slots, "title", {}, () => {
                                        _push5(`${ssrInterpolate(__props.title)}`);
                                      }, _push5, _parent5, _scopeId4);
                                    } else {
                                      return [
                                        renderSlot(_ctx.$slots, "title", {}, () => [
                                          createTextVNode(toDisplayString(__props.title), 1)
                                        ])
                                      ];
                                    }
                                  }),
                                  _: 3
                                }, _parent4, _scopeId3));
                              } else {
                                _push4(`<!---->`);
                              }
                              if (__props.description || !!slots.description) {
                                _push4(ssrRenderComponent(unref(DrawerDescription), {
                                  class: ui.value.description({ class: props.ui?.description })
                                }, {
                                  default: withCtx((_4, _push5, _parent5, _scopeId4) => {
                                    if (_push5) {
                                      ssrRenderSlot(_ctx.$slots, "description", {}, () => {
                                        _push5(`${ssrInterpolate(__props.description)}`);
                                      }, _push5, _parent5, _scopeId4);
                                    } else {
                                      return [
                                        renderSlot(_ctx.$slots, "description", {}, () => [
                                          createTextVNode(toDisplayString(__props.description), 1)
                                        ])
                                      ];
                                    }
                                  }),
                                  _: 3
                                }, _parent4, _scopeId3));
                              } else {
                                _push4(`<!---->`);
                              }
                            }, _push4, _parent4, _scopeId3);
                            _push4(`</div>`);
                          } else {
                            _push4(`<!---->`);
                          }
                          if (!!slots.body) {
                            _push4(`<div class="${ssrRenderClass(ui.value.body({ class: props.ui?.body }))}"${_scopeId3}>`);
                            ssrRenderSlot(_ctx.$slots, "body", {}, null, _push4, _parent4, _scopeId3);
                            _push4(`</div>`);
                          } else {
                            _push4(`<!---->`);
                          }
                          if (!!slots.footer) {
                            _push4(`<div class="${ssrRenderClass(ui.value.footer({ class: props.ui?.footer }))}"${_scopeId3}>`);
                            ssrRenderSlot(_ctx.$slots, "footer", {}, null, _push4, _parent4, _scopeId3);
                            _push4(`</div>`);
                          } else {
                            _push4(`<!---->`);
                          }
                          _push4(`</div>`);
                        }, _push4, _parent4, _scopeId3);
                      } else {
                        return [
                          __props.handle ? (openBlock(), createBlock(unref(DrawerHandle), {
                            key: 0,
                            class: ui.value.handle({ class: props.ui?.handle })
                          }, null, 8, ["class"])) : createCommentVNode("", true),
                          !!slots.content && (__props.title || !!slots.title || (__props.description || !!slots.description)) ? (openBlock(), createBlock(unref(VisuallyHidden), { key: 1 }, {
                            default: withCtx(() => [
                              __props.title || !!slots.title ? (openBlock(), createBlock(unref(DrawerTitle), { key: 0 }, {
                                default: withCtx(() => [
                                  renderSlot(_ctx.$slots, "title", {}, () => [
                                    createTextVNode(toDisplayString(__props.title), 1)
                                  ])
                                ]),
                                _: 3
                              })) : createCommentVNode("", true),
                              __props.description || !!slots.description ? (openBlock(), createBlock(unref(DrawerDescription), { key: 1 }, {
                                default: withCtx(() => [
                                  renderSlot(_ctx.$slots, "description", {}, () => [
                                    createTextVNode(toDisplayString(__props.description), 1)
                                  ])
                                ]),
                                _: 3
                              })) : createCommentVNode("", true)
                            ]),
                            _: 3
                          })) : createCommentVNode("", true),
                          renderSlot(_ctx.$slots, "content", {}, () => [
                            createVNode("div", {
                              class: ui.value.container({ class: props.ui?.container })
                            }, [
                              !!slots.header || (__props.title || !!slots.title) || (__props.description || !!slots.description) ? (openBlock(), createBlock("div", {
                                key: 0,
                                class: ui.value.header({ class: props.ui?.header })
                              }, [
                                renderSlot(_ctx.$slots, "header", {}, () => [
                                  __props.title || !!slots.title ? (openBlock(), createBlock(unref(DrawerTitle), {
                                    key: 0,
                                    class: ui.value.title({ class: props.ui?.title })
                                  }, {
                                    default: withCtx(() => [
                                      renderSlot(_ctx.$slots, "title", {}, () => [
                                        createTextVNode(toDisplayString(__props.title), 1)
                                      ])
                                    ]),
                                    _: 3
                                  }, 8, ["class"])) : createCommentVNode("", true),
                                  __props.description || !!slots.description ? (openBlock(), createBlock(unref(DrawerDescription), {
                                    key: 1,
                                    class: ui.value.description({ class: props.ui?.description })
                                  }, {
                                    default: withCtx(() => [
                                      renderSlot(_ctx.$slots, "description", {}, () => [
                                        createTextVNode(toDisplayString(__props.description), 1)
                                      ])
                                    ]),
                                    _: 3
                                  }, 8, ["class"])) : createCommentVNode("", true)
                                ])
                              ], 2)) : createCommentVNode("", true),
                              !!slots.body ? (openBlock(), createBlock("div", {
                                key: 1,
                                class: ui.value.body({ class: props.ui?.body })
                              }, [
                                renderSlot(_ctx.$slots, "body")
                              ], 2)) : createCommentVNode("", true),
                              !!slots.footer ? (openBlock(), createBlock("div", {
                                key: 2,
                                class: ui.value.footer({ class: props.ui?.footer })
                              }, [
                                renderSlot(_ctx.$slots, "footer")
                              ], 2)) : createCommentVNode("", true)
                            ], 2)
                          ])
                        ];
                      }
                    }),
                    _: 3
                  }, _parent3, _scopeId2));
                } else {
                  return [
                    __props.overlay ? (openBlock(), createBlock(unref(DrawerOverlay), {
                      key: 0,
                      class: ui.value.overlay({ class: props.ui?.overlay })
                    }, null, 8, ["class"])) : createCommentVNode("", true),
                    createVNode(unref(DrawerContent), mergeProps({
                      class: ui.value.content({ class: [!slots.default && props.class, props.ui?.content] })
                    }, contentProps.value, toHandlers(contentEvents)), {
                      default: withCtx(() => [
                        __props.handle ? (openBlock(), createBlock(unref(DrawerHandle), {
                          key: 0,
                          class: ui.value.handle({ class: props.ui?.handle })
                        }, null, 8, ["class"])) : createCommentVNode("", true),
                        !!slots.content && (__props.title || !!slots.title || (__props.description || !!slots.description)) ? (openBlock(), createBlock(unref(VisuallyHidden), { key: 1 }, {
                          default: withCtx(() => [
                            __props.title || !!slots.title ? (openBlock(), createBlock(unref(DrawerTitle), { key: 0 }, {
                              default: withCtx(() => [
                                renderSlot(_ctx.$slots, "title", {}, () => [
                                  createTextVNode(toDisplayString(__props.title), 1)
                                ])
                              ]),
                              _: 3
                            })) : createCommentVNode("", true),
                            __props.description || !!slots.description ? (openBlock(), createBlock(unref(DrawerDescription), { key: 1 }, {
                              default: withCtx(() => [
                                renderSlot(_ctx.$slots, "description", {}, () => [
                                  createTextVNode(toDisplayString(__props.description), 1)
                                ])
                              ]),
                              _: 3
                            })) : createCommentVNode("", true)
                          ]),
                          _: 3
                        })) : createCommentVNode("", true),
                        renderSlot(_ctx.$slots, "content", {}, () => [
                          createVNode("div", {
                            class: ui.value.container({ class: props.ui?.container })
                          }, [
                            !!slots.header || (__props.title || !!slots.title) || (__props.description || !!slots.description) ? (openBlock(), createBlock("div", {
                              key: 0,
                              class: ui.value.header({ class: props.ui?.header })
                            }, [
                              renderSlot(_ctx.$slots, "header", {}, () => [
                                __props.title || !!slots.title ? (openBlock(), createBlock(unref(DrawerTitle), {
                                  key: 0,
                                  class: ui.value.title({ class: props.ui?.title })
                                }, {
                                  default: withCtx(() => [
                                    renderSlot(_ctx.$slots, "title", {}, () => [
                                      createTextVNode(toDisplayString(__props.title), 1)
                                    ])
                                  ]),
                                  _: 3
                                }, 8, ["class"])) : createCommentVNode("", true),
                                __props.description || !!slots.description ? (openBlock(), createBlock(unref(DrawerDescription), {
                                  key: 1,
                                  class: ui.value.description({ class: props.ui?.description })
                                }, {
                                  default: withCtx(() => [
                                    renderSlot(_ctx.$slots, "description", {}, () => [
                                      createTextVNode(toDisplayString(__props.description), 1)
                                    ])
                                  ]),
                                  _: 3
                                }, 8, ["class"])) : createCommentVNode("", true)
                              ])
                            ], 2)) : createCommentVNode("", true),
                            !!slots.body ? (openBlock(), createBlock("div", {
                              key: 1,
                              class: ui.value.body({ class: props.ui?.body })
                            }, [
                              renderSlot(_ctx.$slots, "body")
                            ], 2)) : createCommentVNode("", true),
                            !!slots.footer ? (openBlock(), createBlock("div", {
                              key: 2,
                              class: ui.value.footer({ class: props.ui?.footer })
                            }, [
                              renderSlot(_ctx.$slots, "footer")
                            ], 2)) : createCommentVNode("", true)
                          ], 2)
                        ])
                      ]),
                      _: 3
                    }, 16, ["class"])
                  ];
                }
              }),
              _: 3
            }, _parent2, _scopeId));
          } else {
            return [
              !!slots.default ? (openBlock(), createBlock(unref(DrawerTrigger), {
                key: 0,
                "as-child": "",
                class: props.class
              }, {
                default: withCtx(() => [
                  renderSlot(_ctx.$slots, "default")
                ]),
                _: 3
              }, 8, ["class"])) : createCommentVNode("", true),
              createVNode(unref(DrawerPortal), unref(portalProps), {
                default: withCtx(() => [
                  __props.overlay ? (openBlock(), createBlock(unref(DrawerOverlay), {
                    key: 0,
                    class: ui.value.overlay({ class: props.ui?.overlay })
                  }, null, 8, ["class"])) : createCommentVNode("", true),
                  createVNode(unref(DrawerContent), mergeProps({
                    class: ui.value.content({ class: [!slots.default && props.class, props.ui?.content] })
                  }, contentProps.value, toHandlers(contentEvents)), {
                    default: withCtx(() => [
                      __props.handle ? (openBlock(), createBlock(unref(DrawerHandle), {
                        key: 0,
                        class: ui.value.handle({ class: props.ui?.handle })
                      }, null, 8, ["class"])) : createCommentVNode("", true),
                      !!slots.content && (__props.title || !!slots.title || (__props.description || !!slots.description)) ? (openBlock(), createBlock(unref(VisuallyHidden), { key: 1 }, {
                        default: withCtx(() => [
                          __props.title || !!slots.title ? (openBlock(), createBlock(unref(DrawerTitle), { key: 0 }, {
                            default: withCtx(() => [
                              renderSlot(_ctx.$slots, "title", {}, () => [
                                createTextVNode(toDisplayString(__props.title), 1)
                              ])
                            ]),
                            _: 3
                          })) : createCommentVNode("", true),
                          __props.description || !!slots.description ? (openBlock(), createBlock(unref(DrawerDescription), { key: 1 }, {
                            default: withCtx(() => [
                              renderSlot(_ctx.$slots, "description", {}, () => [
                                createTextVNode(toDisplayString(__props.description), 1)
                              ])
                            ]),
                            _: 3
                          })) : createCommentVNode("", true)
                        ]),
                        _: 3
                      })) : createCommentVNode("", true),
                      renderSlot(_ctx.$slots, "content", {}, () => [
                        createVNode("div", {
                          class: ui.value.container({ class: props.ui?.container })
                        }, [
                          !!slots.header || (__props.title || !!slots.title) || (__props.description || !!slots.description) ? (openBlock(), createBlock("div", {
                            key: 0,
                            class: ui.value.header({ class: props.ui?.header })
                          }, [
                            renderSlot(_ctx.$slots, "header", {}, () => [
                              __props.title || !!slots.title ? (openBlock(), createBlock(unref(DrawerTitle), {
                                key: 0,
                                class: ui.value.title({ class: props.ui?.title })
                              }, {
                                default: withCtx(() => [
                                  renderSlot(_ctx.$slots, "title", {}, () => [
                                    createTextVNode(toDisplayString(__props.title), 1)
                                  ])
                                ]),
                                _: 3
                              }, 8, ["class"])) : createCommentVNode("", true),
                              __props.description || !!slots.description ? (openBlock(), createBlock(unref(DrawerDescription), {
                                key: 1,
                                class: ui.value.description({ class: props.ui?.description })
                              }, {
                                default: withCtx(() => [
                                  renderSlot(_ctx.$slots, "description", {}, () => [
                                    createTextVNode(toDisplayString(__props.description), 1)
                                  ])
                                ]),
                                _: 3
                              }, 8, ["class"])) : createCommentVNode("", true)
                            ])
                          ], 2)) : createCommentVNode("", true),
                          !!slots.body ? (openBlock(), createBlock("div", {
                            key: 1,
                            class: ui.value.body({ class: props.ui?.body })
                          }, [
                            renderSlot(_ctx.$slots, "body")
                          ], 2)) : createCommentVNode("", true),
                          !!slots.footer ? (openBlock(), createBlock("div", {
                            key: 2,
                            class: ui.value.footer({ class: props.ui?.footer })
                          }, [
                            renderSlot(_ctx.$slots, "footer")
                          ], 2)) : createCommentVNode("", true)
                        ], 2)
                      ])
                    ]),
                    _: 3
                  }, 16, ["class"])
                ]),
                _: 3
              }, 16)
            ];
          }
        }),
        _: 3
      }), _parent);
    };
  }
};
const _sfc_setup$8 = _sfc_main$8.setup;
_sfc_main$8.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("../node_modules/.pnpm/@nuxt+ui@4.0.0-alpha.2_@babel+parser@7.28.0_@netlify+blobs@9.1.2_change-case@5.4.4_db0@_b85612ac9055e711c0cdf49df3463bec/node_modules/@nuxt/ui/dist/runtime/components/Drawer.vue");
  return _sfc_setup$8 ? _sfc_setup$8(props, ctx) : void 0;
};
const theme$3 = {
  "slots": {
    "root": "relative hidden lg:flex flex-col min-h-svh min-w-16 w-(--width) shrink-0",
    "header": "h-(--ui-header-height) shrink-0 flex items-center gap-1.5 px-4",
    "body": "flex flex-col gap-4 flex-1 overflow-y-auto px-4 py-2",
    "footer": "shrink-0 flex items-center gap-1.5 px-4 py-2",
    "toggle": "",
    "handle": "",
    "content": "lg:hidden",
    "overlay": "lg:hidden"
  },
  "variants": {
    "menu": {
      "true": {
        "header": "sm:px-6",
        "body": "sm:px-6",
        "footer": "sm:px-6"
      }
    },
    "side": {
      "left": {
        "root": "border-r border-default"
      },
      "right": {
        "root": ""
      }
    },
    "toggleSide": {
      "left": {
        "toggle": ""
      },
      "right": {
        "toggle": "ms-auto"
      }
    }
  }
};
function useRuntimeHook(name, fn) {
  const nuxtApp = useNuxtApp();
  const unregister = nuxtApp.hook(name, fn);
  onScopeDispose(unregister);
}
const _sfc_main$7 = /* @__PURE__ */ Object.assign({ inheritAttrs: false }, {
  __name: "UDashboardSidebar",
  __ssrInlineRender: true,
  props: /* @__PURE__ */ mergeModels({
    mode: { type: null, required: false, default: "slideover" },
    menu: { type: null, required: false },
    toggle: { type: [Boolean, Object], required: false, default: true },
    toggleSide: { type: String, required: false, default: "left" },
    class: { type: null, required: false },
    ui: { type: null, required: false },
    id: { type: String, required: false },
    side: { type: String, required: false, default: "left" },
    minSize: { type: Number, required: false, default: 10 },
    maxSize: { type: Number, required: false, default: 20 },
    defaultSize: { type: Number, required: false, default: 15 },
    resizable: { type: Boolean, required: false, default: false },
    collapsible: { type: Boolean, required: false, default: false },
    collapsedSize: { type: Number, required: false, default: 0 }
  }, {
    "open": { type: Boolean, ...{ default: false } },
    "openModifiers": {},
    "collapsed": { type: Boolean, ...{ default: false } },
    "collapsedModifiers": {}
  }),
  emits: ["update:open", "update:collapsed"],
  setup(__props) {
    const props = __props;
    const slots = useSlots();
    const open = useModel(__props, "open", { type: Boolean, ...{ default: false } });
    const collapsed = useModel(__props, "collapsed", { type: Boolean, ...{ default: false } });
    const route = useRoute();
    const { t } = useLocale();
    const appConfig = useAppConfig();
    const dashboardContext = useDashboard({
      storageKey: "dashboard",
      unit: "%",
      sidebarOpen: ref(false),
      sidebarCollapsed: ref(false)
    });
    const id = `${dashboardContext.storageKey}-sidebar-${props.id || useId()}`;
    const { el, size, collapse, isCollapsed, isDragging, onMouseDown, onTouchStart, onDoubleClick } = useResizable(id, toRef(() => ({ ...dashboardContext, ...props })), { collapsed });
    const [DefineToggleTemplate, ReuseToggleTemplate] = createReusableTemplate();
    const [DefineResizeHandleTemplate, ReuseResizeHandleTemplate] = createReusableTemplate();
    useRuntimeHook("dashboard:sidebar:toggle", () => {
      open.value = !open.value;
    });
    useRuntimeHook("dashboard:sidebar:collapse", (value) => {
      isCollapsed.value = value;
    });
    watch(open, () => dashboardContext.sidebarOpen.value = open.value, { immediate: true });
    watch(isCollapsed, () => dashboardContext.sidebarCollapsed.value = isCollapsed.value, { immediate: true });
    watch(() => route.fullPath, () => {
      open.value = false;
    });
    const ui = computed(() => tv({ extend: tv(theme$3), ...appConfig.ui?.dashboardSidebar || {} })({
      side: props.side
    }));
    const Menu = computed(() => ({
      slideover: _sfc_main$9,
      modal: _sfc_main$c,
      drawer: _sfc_main$8
    })[props.mode]);
    const menuProps = toRef(() => defu(props.menu, {
      content: {
        onOpenAutoFocus: (e) => e.preventDefault()
      }
    }, props.mode === "modal" ? { fullscreen: true, transition: false } : props.mode === "slideover" ? { side: "left" } : {}));
    function toggleOpen() {
      open.value = !open.value;
    }
    return (_ctx, _push, _parent, _attrs) => {
      _push(`<!--[-->`);
      _push(ssrRenderComponent(unref(DefineToggleTemplate), null, {
        default: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            ssrRenderSlot(_ctx.$slots, "toggle", {
              open: open.value,
              toggle: toggleOpen
            }, () => {
              if (__props.toggle) {
                _push2(ssrRenderComponent(_sfc_main$d, mergeProps(typeof __props.toggle === "object" ? __props.toggle : {}, {
                  side: __props.toggleSide,
                  class: ui.value.toggle({ class: props.ui?.toggle, toggleSide: __props.toggleSide })
                }), null, _parent2, _scopeId));
              } else {
                _push2(`<!---->`);
              }
            }, _push2, _parent2, _scopeId);
          } else {
            return [
              renderSlot(_ctx.$slots, "toggle", {
                open: open.value,
                toggle: toggleOpen
              }, () => [
                __props.toggle ? (openBlock(), createBlock(_sfc_main$d, mergeProps({ key: 0 }, typeof __props.toggle === "object" ? __props.toggle : {}, {
                  side: __props.toggleSide,
                  class: ui.value.toggle({ class: props.ui?.toggle, toggleSide: __props.toggleSide })
                }), null, 16, ["side", "class"])) : createCommentVNode("", true)
              ])
            ];
          }
        }),
        _: 3
      }, _parent));
      _push(ssrRenderComponent(unref(DefineResizeHandleTemplate), null, {
        default: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            ssrRenderSlot(_ctx.$slots, "resize-handle", {
              onMouseDown: unref(onMouseDown),
              onTouchStart: unref(onTouchStart),
              onDoubleClick: unref(onDoubleClick)
            }, () => {
              if (__props.resizable) {
                _push2(ssrRenderComponent(_sfc_main$1$1, {
                  "aria-controls": id,
                  class: ui.value.handle({ class: props.ui?.handle }),
                  onMousedown: unref(onMouseDown),
                  onTouchstart: unref(onTouchStart),
                  onDblclick: unref(onDoubleClick)
                }, null, _parent2, _scopeId));
              } else {
                _push2(`<!---->`);
              }
            }, _push2, _parent2, _scopeId);
          } else {
            return [
              renderSlot(_ctx.$slots, "resize-handle", {
                onMouseDown: unref(onMouseDown),
                onTouchStart: unref(onTouchStart),
                onDoubleClick: unref(onDoubleClick)
              }, () => [
                __props.resizable ? (openBlock(), createBlock(_sfc_main$1$1, {
                  key: 0,
                  "aria-controls": id,
                  class: ui.value.handle({ class: props.ui?.handle }),
                  onMousedown: unref(onMouseDown),
                  onTouchstart: unref(onTouchStart),
                  onDblclick: unref(onDoubleClick)
                }, null, 8, ["class", "onMousedown", "onTouchstart", "onDblclick"])) : createCommentVNode("", true)
              ])
            ];
          }
        }),
        _: 3
      }, _parent));
      if (__props.side === "right") {
        _push(ssrRenderComponent(unref(ReuseResizeHandleTemplate), null, null, _parent));
      } else {
        _push(`<!---->`);
      }
      _push(`<div${ssrRenderAttrs(mergeProps({
        id,
        ref_key: "el",
        ref: el
      }, _ctx.$attrs, {
        "data-collapsed": unref(isCollapsed),
        "data-dragging": unref(isDragging),
        class: ui.value.root({ class: [props.ui?.root, props.class] }),
        style: { "--width": `${unref(size) || 0}${unref(dashboardContext).unit}` }
      }))}>`);
      if (!!slots.header) {
        _push(`<div class="${ssrRenderClass(ui.value.header({ class: props.ui?.header }))}">`);
        ssrRenderSlot(_ctx.$slots, "header", {
          collapsed: unref(isCollapsed),
          collapse: unref(collapse)
        }, null, _push, _parent);
        _push(`</div>`);
      } else {
        _push(`<!---->`);
      }
      _push(`<div class="${ssrRenderClass(ui.value.body({ class: props.ui?.body }))}">`);
      ssrRenderSlot(_ctx.$slots, "default", {
        collapsed: unref(isCollapsed),
        collapse: unref(collapse)
      }, null, _push, _parent);
      _push(`</div>`);
      if (!!slots.footer) {
        _push(`<div class="${ssrRenderClass(ui.value.footer({ class: props.ui?.footer }))}">`);
        ssrRenderSlot(_ctx.$slots, "footer", {
          collapsed: unref(isCollapsed),
          collapse: unref(collapse)
        }, null, _push, _parent);
        _push(`</div>`);
      } else {
        _push(`<!---->`);
      }
      _push(`</div>`);
      if (__props.side === "left") {
        _push(ssrRenderComponent(unref(ReuseResizeHandleTemplate), null, null, _parent));
      } else {
        _push(`<!---->`);
      }
      _push(ssrRenderComponent(unref(Menu), mergeProps({
        open: open.value,
        "onUpdate:open": ($event) => open.value = $event,
        title: unref(t)("dashboardSidebar.title"),
        description: unref(t)("dashboardSidebar.description")
      }, menuProps.value, {
        ui: {
          overlay: ui.value.overlay({ class: props.ui?.overlay }),
          content: ui.value.content({ class: props.ui?.content })
        }
      }), {
        content: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            ssrRenderSlot(_ctx.$slots, "content", {}, () => {
              if (!!slots.header || __props.mode !== "drawer") {
                _push2(`<div class="${ssrRenderClass(ui.value.header({ class: props.ui?.header, menu: true }))}"${_scopeId}>`);
                if (__props.mode !== "drawer" && __props.toggleSide === "left") {
                  _push2(ssrRenderComponent(unref(ReuseToggleTemplate), null, null, _parent2, _scopeId));
                } else {
                  _push2(`<!---->`);
                }
                ssrRenderSlot(_ctx.$slots, "header", {}, null, _push2, _parent2, _scopeId);
                if (__props.mode !== "drawer" && __props.toggleSide === "right") {
                  _push2(ssrRenderComponent(unref(ReuseToggleTemplate), null, null, _parent2, _scopeId));
                } else {
                  _push2(`<!---->`);
                }
                _push2(`</div>`);
              } else {
                _push2(`<!---->`);
              }
              _push2(`<div class="${ssrRenderClass(ui.value.body({ class: props.ui?.body, menu: true }))}"${_scopeId}>`);
              ssrRenderSlot(_ctx.$slots, "default", {}, null, _push2, _parent2, _scopeId);
              _push2(`</div>`);
              if (!!slots.footer) {
                _push2(`<div class="${ssrRenderClass(ui.value.footer({ class: props.ui?.footer, menu: true }))}"${_scopeId}>`);
                ssrRenderSlot(_ctx.$slots, "footer", {}, null, _push2, _parent2, _scopeId);
                _push2(`</div>`);
              } else {
                _push2(`<!---->`);
              }
            }, _push2, _parent2, _scopeId);
          } else {
            return [
              renderSlot(_ctx.$slots, "content", {}, () => [
                !!slots.header || __props.mode !== "drawer" ? (openBlock(), createBlock("div", {
                  key: 0,
                  class: ui.value.header({ class: props.ui?.header, menu: true })
                }, [
                  __props.mode !== "drawer" && __props.toggleSide === "left" ? (openBlock(), createBlock(unref(ReuseToggleTemplate), { key: 0 })) : createCommentVNode("", true),
                  renderSlot(_ctx.$slots, "header"),
                  __props.mode !== "drawer" && __props.toggleSide === "right" ? (openBlock(), createBlock(unref(ReuseToggleTemplate), { key: 1 })) : createCommentVNode("", true)
                ], 2)) : createCommentVNode("", true),
                createVNode("div", {
                  class: ui.value.body({ class: props.ui?.body, menu: true })
                }, [
                  renderSlot(_ctx.$slots, "default")
                ], 2),
                !!slots.footer ? (openBlock(), createBlock("div", {
                  key: 1,
                  class: ui.value.footer({ class: props.ui?.footer, menu: true })
                }, [
                  renderSlot(_ctx.$slots, "footer")
                ], 2)) : createCommentVNode("", true)
              ])
            ];
          }
        }),
        _: 3
      }, _parent));
      _push(`<!--]-->`);
    };
  }
});
const _sfc_setup$7 = _sfc_main$7.setup;
_sfc_main$7.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("../node_modules/.pnpm/@nuxt+ui@4.0.0-alpha.2_@babel+parser@7.28.0_@netlify+blobs@9.1.2_change-case@5.4.4_db0@_b85612ac9055e711c0cdf49df3463bec/node_modules/@nuxt/ui/dist/runtime/components/DashboardSidebar.vue");
  return _sfc_setup$7 ? _sfc_setup$7(props, ctx) : void 0;
};
const _sfc_main$6 = /* @__PURE__ */ defineComponent({
  __name: "TeamsMenu",
  __ssrInlineRender: true,
  props: {
    collapsed: { type: Boolean }
  },
  setup(__props) {
    const teams = ref([{
      label: "Nuxt",
      avatar: {
        src: "https://github.com/nuxt.png",
        alt: "Nuxt"
      }
    }, {
      label: "NuxtHub",
      avatar: {
        src: "https://github.com/nuxt-hub.png",
        alt: "NuxtHub"
      }
    }, {
      label: "NuxtLabs",
      avatar: {
        src: "https://github.com/nuxtlabs.png",
        alt: "NuxtLabs"
      }
    }]);
    const selectedTeam = ref(teams.value[0]);
    const items = computed(() => {
      return [teams.value.map((team) => ({
        ...team,
        onSelect() {
          selectedTeam.value = team;
        }
      })), [{
        label: "Create team",
        icon: "i-lucide-circle-plus"
      }, {
        label: "Manage teams",
        icon: "i-lucide-cog"
      }]];
    });
    return (_ctx, _push, _parent, _attrs) => {
      const _component_UDropdownMenu = _sfc_main$g;
      const _component_UButton = _sfc_main$9$1;
      _push(ssrRenderComponent(_component_UDropdownMenu, mergeProps({
        items: unref(items),
        content: { align: "center", collisionPadding: 12 },
        ui: { content: _ctx.collapsed ? "w-40" : "w-(--reka-dropdown-menu-trigger-width)" }
      }, _attrs), {
        default: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            _push2(ssrRenderComponent(_component_UButton, mergeProps({
              ...unref(selectedTeam),
              label: _ctx.collapsed ? void 0 : unref(selectedTeam)?.label,
              trailingIcon: _ctx.collapsed ? void 0 : "i-lucide-chevrons-up-down"
            }, {
              color: "neutral",
              variant: "ghost",
              block: "",
              square: _ctx.collapsed,
              class: ["data-[state=open]:bg-elevated", [!_ctx.collapsed && "py-2"]],
              ui: {
                trailingIcon: "text-dimmed"
              }
            }), null, _parent2, _scopeId));
          } else {
            return [
              createVNode(_component_UButton, mergeProps({
                ...unref(selectedTeam),
                label: _ctx.collapsed ? void 0 : unref(selectedTeam)?.label,
                trailingIcon: _ctx.collapsed ? void 0 : "i-lucide-chevrons-up-down"
              }, {
                color: "neutral",
                variant: "ghost",
                block: "",
                square: _ctx.collapsed,
                class: ["data-[state=open]:bg-elevated", [!_ctx.collapsed && "py-2"]],
                ui: {
                  trailingIcon: "text-dimmed"
                }
              }), null, 16, ["square", "class"])
            ];
          }
        }),
        _: 1
      }, _parent));
    };
  }
});
const _sfc_setup$6 = _sfc_main$6.setup;
_sfc_main$6.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("components/TeamsMenu.vue");
  return _sfc_setup$6 ? _sfc_setup$6(props, ctx) : void 0;
};
const __nuxt_component_2 = Object.assign(_sfc_main$6, { __name: "TeamsMenu" });
const theme$2 = {
  "slots": {
    "base": "",
    "trailing": "hidden lg:flex items-center gap-0.5 ms-auto"
  }
};
const _sfc_main$5 = /* @__PURE__ */ Object.assign({ inheritAttrs: false }, {
  __name: "UDashboardSearchButton",
  __ssrInlineRender: true,
  props: {
    icon: { type: [String, Object], required: false },
    label: { type: String, required: false },
    color: { type: null, required: false, default: "neutral" },
    variant: { type: null, required: false },
    size: { type: null, required: false },
    collapsed: { type: Boolean, required: false, default: false },
    tooltip: { type: [Boolean, Object], required: false, default: false },
    kbds: { type: Array, required: false, default: () => ["meta", "k"] },
    ui: { type: void 0, required: false },
    class: { type: null, required: false }
  },
  setup(__props) {
    const props = __props;
    const slots = useSlots();
    const [DefineButtonTemplate, ReuseButtonTemplate] = createReusableTemplate();
    const getProxySlots = () => omit(slots, ["trailing"]);
    const rootProps = useForwardProps(reactivePick(props, "color", "size"));
    const tooltipProps = toRef(() => defu(typeof props.tooltip === "boolean" ? {} : props.tooltip, { delayDuration: 0, content: { side: "right" } }));
    const { t } = useLocale();
    const appConfig = useAppConfig();
    const { toggleSearch } = useDashboard({ toggleSearch: () => {
    } });
    const ui = computed(() => tv({ extend: tv(theme$2), ...appConfig.ui?.dashboardSearchButton || {} })());
    return (_ctx, _push, _parent, _attrs) => {
      _push(`<!--[-->`);
      _push(ssrRenderComponent(unref(DefineButtonTemplate), null, {
        default: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            _push2(ssrRenderComponent(_sfc_main$9$1, mergeProps({
              icon: __props.icon || unref(appConfig).ui.icons.search,
              label: __props.label || unref(t)("dashboardSearchButton.label"),
              variant: __props.variant || (__props.collapsed ? "ghost" : "outline")
            }, {
              ...unref(rootProps),
              ...__props.collapsed ? {
                "square": true,
                "label": void 0,
                "aria-label": __props.label || unref(t)("dashboardSearchButton.label")
              } : {},
              ..._ctx.$attrs
            }, {
              class: ui.value.base({ class: [props.ui?.base, props.class] }),
              ui: unref(transformUI)(ui.value, props.ui),
              onClick: unref(toggleSearch)
            }), createSlots({ _: 2 }, [
              renderList(getProxySlots(), (_2, name) => {
                return {
                  name,
                  fn: withCtx((slotData, _push3, _parent3, _scopeId2) => {
                    if (_push3) {
                      ssrRenderSlot(_ctx.$slots, name, slotData, null, _push3, _parent3, _scopeId2);
                    } else {
                      return [
                        renderSlot(_ctx.$slots, name, slotData)
                      ];
                    }
                  })
                };
              }),
              !__props.collapsed ? {
                name: "trailing",
                fn: withCtx((_2, _push3, _parent3, _scopeId2) => {
                  if (_push3) {
                    _push3(`<div class="${ssrRenderClass(ui.value.trailing({ class: props.ui?.trailing }))}"${_scopeId2}>`);
                    ssrRenderSlot(_ctx.$slots, "trailing", {}, () => {
                      if (__props.kbds?.length) {
                        _push3(`<!--[-->`);
                        ssrRenderList(__props.kbds, (kbd, index) => {
                          _push3(ssrRenderComponent(_sfc_main$e, mergeProps({
                            key: index,
                            variant: "subtle"
                          }, { ref_for: true }, typeof kbd === "string" ? { value: kbd } : kbd), null, _parent3, _scopeId2));
                        });
                        _push3(`<!--]-->`);
                      } else {
                        _push3(`<!---->`);
                      }
                    }, _push3, _parent3, _scopeId2);
                    _push3(`</div>`);
                  } else {
                    return [
                      createVNode("div", {
                        class: ui.value.trailing({ class: props.ui?.trailing })
                      }, [
                        renderSlot(_ctx.$slots, "trailing", {}, () => [
                          __props.kbds?.length ? (openBlock(true), createBlock(Fragment, { key: 0 }, renderList(__props.kbds, (kbd, index) => {
                            return openBlock(), createBlock(_sfc_main$e, mergeProps({
                              key: index,
                              variant: "subtle"
                            }, { ref_for: true }, typeof kbd === "string" ? { value: kbd } : kbd), null, 16);
                          }), 128)) : createCommentVNode("", true)
                        ])
                      ], 2)
                    ];
                  }
                }),
                key: "0"
              } : void 0
            ]), _parent2, _scopeId));
          } else {
            return [
              createVNode(_sfc_main$9$1, mergeProps({
                icon: __props.icon || unref(appConfig).ui.icons.search,
                label: __props.label || unref(t)("dashboardSearchButton.label"),
                variant: __props.variant || (__props.collapsed ? "ghost" : "outline")
              }, {
                ...unref(rootProps),
                ...__props.collapsed ? {
                  "square": true,
                  "label": void 0,
                  "aria-label": __props.label || unref(t)("dashboardSearchButton.label")
                } : {},
                ..._ctx.$attrs
              }, {
                class: ui.value.base({ class: [props.ui?.base, props.class] }),
                ui: unref(transformUI)(ui.value, props.ui),
                onClick: unref(toggleSearch)
              }), createSlots({ _: 2 }, [
                renderList(getProxySlots(), (_2, name) => {
                  return {
                    name,
                    fn: withCtx((slotData) => [
                      renderSlot(_ctx.$slots, name, slotData)
                    ])
                  };
                }),
                !__props.collapsed ? {
                  name: "trailing",
                  fn: withCtx(() => [
                    createVNode("div", {
                      class: ui.value.trailing({ class: props.ui?.trailing })
                    }, [
                      renderSlot(_ctx.$slots, "trailing", {}, () => [
                        __props.kbds?.length ? (openBlock(true), createBlock(Fragment, { key: 0 }, renderList(__props.kbds, (kbd, index) => {
                          return openBlock(), createBlock(_sfc_main$e, mergeProps({
                            key: index,
                            variant: "subtle"
                          }, { ref_for: true }, typeof kbd === "string" ? { value: kbd } : kbd), null, 16);
                        }), 128)) : createCommentVNode("", true)
                      ])
                    ], 2)
                  ]),
                  key: "0"
                } : void 0
              ]), 1040, ["icon", "label", "variant", "class", "ui", "onClick"])
            ];
          }
        }),
        _: 3
      }, _parent));
      if (__props.collapsed && __props.tooltip) {
        _push(ssrRenderComponent(_sfc_main$f, mergeProps({
          text: __props.label || unref(t)("dashboardSearchButton.label")
        }, tooltipProps.value), {
          default: withCtx((_, _push2, _parent2, _scopeId) => {
            if (_push2) {
              _push2(ssrRenderComponent(unref(ReuseButtonTemplate), null, null, _parent2, _scopeId));
            } else {
              return [
                createVNode(unref(ReuseButtonTemplate))
              ];
            }
          }),
          _: 1
        }, _parent));
      } else {
        _push(ssrRenderComponent(unref(ReuseButtonTemplate), null, null, _parent));
      }
      _push(`<!--]-->`);
    };
  }
});
const _sfc_setup$5 = _sfc_main$5.setup;
_sfc_main$5.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("../node_modules/.pnpm/@nuxt+ui@4.0.0-alpha.2_@babel+parser@7.28.0_@netlify+blobs@9.1.2_change-case@5.4.4_db0@_b85612ac9055e711c0cdf49df3463bec/node_modules/@nuxt/ui/dist/runtime/components/DashboardSearchButton.vue");
  return _sfc_setup$5 ? _sfc_setup$5(props, ctx) : void 0;
};
const _sfc_main$4 = /* @__PURE__ */ defineComponent({
  __name: "UserMenu",
  __ssrInlineRender: true,
  props: {
    collapsed: { type: Boolean }
  },
  setup(__props) {
    const colorMode = useColorMode();
    const appConfig = useAppConfig();
    const colors = ["red", "orange", "amber", "yellow", "lime", "green", "emerald", "teal", "cyan", "sky", "blue", "indigo", "violet", "purple", "fuchsia", "pink", "rose"];
    const neutrals = ["slate", "gray", "zinc", "neutral", "stone"];
    const user = ref({
      name: "Benjamin Canac",
      avatar: {
        src: "https://github.com/benjamincanac.png",
        alt: "Benjamin Canac"
      }
    });
    const items = computed(() => [[{
      type: "label",
      label: user.value.name,
      avatar: user.value.avatar
    }], [{
      label: "Profile",
      icon: "i-lucide-user"
    }, {
      label: "Billing",
      icon: "i-lucide-credit-card"
    }, {
      label: "Settings",
      icon: "i-lucide-settings",
      to: "/settings"
    }], [{
      label: "Theme",
      icon: "i-lucide-palette",
      children: [{
        label: "Primary",
        slot: "chip",
        chip: appConfig.ui.colors.primary,
        content: {
          align: "center",
          collisionPadding: 16
        },
        children: colors.map((color) => ({
          label: color,
          chip: color,
          slot: "chip",
          checked: appConfig.ui.colors.primary === color,
          type: "checkbox",
          onSelect: (e) => {
            e.preventDefault();
            appConfig.ui.colors.primary = color;
          }
        }))
      }, {
        label: "Neutral",
        slot: "chip",
        chip: appConfig.ui.colors.neutral === "neutral" ? "old-neutral" : appConfig.ui.colors.neutral,
        content: {
          align: "end",
          collisionPadding: 16
        },
        children: neutrals.map((color) => ({
          label: color,
          chip: color === "neutral" ? "old-neutral" : color,
          slot: "chip",
          type: "checkbox",
          checked: appConfig.ui.colors.neutral === color,
          onSelect: (e) => {
            e.preventDefault();
            appConfig.ui.colors.neutral = color;
          }
        }))
      }]
    }, {
      label: "Appearance",
      icon: "i-lucide-sun-moon",
      children: [{
        label: "Light",
        icon: "i-lucide-sun",
        type: "checkbox",
        checked: colorMode.value === "light",
        onSelect(e) {
          e.preventDefault();
          colorMode.preference = "light";
        }
      }, {
        label: "Dark",
        icon: "i-lucide-moon",
        type: "checkbox",
        checked: colorMode.value === "dark",
        onUpdateChecked(checked) {
          if (checked) {
            colorMode.preference = "dark";
          }
        },
        onSelect(e) {
          e.preventDefault();
        }
      }]
    }], [{
      label: "Templates",
      icon: "i-lucide-layout-template",
      children: [{
        label: "Starter",
        to: "https://starter-template.nuxt.dev/"
      }, {
        label: "Landing",
        to: "https://landing-template.nuxt.dev/"
      }, {
        label: "Docs",
        to: "https://docs-template.nuxt.dev/"
      }, {
        label: "SaaS",
        to: "https://saas-template.nuxt.dev/"
      }, {
        label: "Dashboard",
        to: "https://dashboard-template.nuxt.dev/",
        color: "primary",
        checked: true,
        type: "checkbox"
      }, {
        label: "Chat",
        to: "https://chat-template.nuxt.dev/"
      }, {
        label: "Portfolio",
        to: "https://portfolio-template.nuxt.dev/"
      }, {
        label: "Changelog",
        to: "https://changelog-template.nuxt.dev/"
      }]
    }], [{
      label: "Documentation",
      icon: "i-lucide-book-open",
      to: "https://ui4.nuxt.com/docs/getting-started/installation/nuxt",
      target: "_blank"
    }, {
      label: "GitHub repository",
      icon: "i-simple-icons-github",
      to: "https://github.com/nuxt-ui-templates/dashboard",
      target: "_blank"
    }, {
      label: "Log out",
      icon: "i-lucide-log-out"
    }]]);
    return (_ctx, _push, _parent, _attrs) => {
      const _component_UDropdownMenu = _sfc_main$g;
      const _component_UButton = _sfc_main$9$1;
      _push(ssrRenderComponent(_component_UDropdownMenu, mergeProps({
        items: unref(items),
        content: { align: "center", collisionPadding: 12 },
        ui: { content: _ctx.collapsed ? "w-48" : "w-(--reka-dropdown-menu-trigger-width)" }
      }, _attrs), {
        "chip-leading": withCtx(({ item }, _push2, _parent2, _scopeId) => {
          if (_push2) {
            _push2(`<span style="${ssrRenderStyle({
              "--chip-light": `var(--color-${item.chip}-500)`,
              "--chip-dark": `var(--color-${item.chip}-400)`
            })}" class="ms-0.5 size-2 rounded-full bg-(--chip-light) dark:bg-(--chip-dark)"${_scopeId}></span>`);
          } else {
            return [
              createVNode("span", {
                style: {
                  "--chip-light": `var(--color-${item.chip}-500)`,
                  "--chip-dark": `var(--color-${item.chip}-400)`
                },
                class: "ms-0.5 size-2 rounded-full bg-(--chip-light) dark:bg-(--chip-dark)"
              }, null, 4)
            ];
          }
        }),
        default: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            _push2(ssrRenderComponent(_component_UButton, mergeProps({
              ...unref(user),
              label: _ctx.collapsed ? void 0 : unref(user)?.name,
              trailingIcon: _ctx.collapsed ? void 0 : "i-lucide-chevrons-up-down"
            }, {
              color: "neutral",
              variant: "ghost",
              block: "",
              square: _ctx.collapsed,
              class: "data-[state=open]:bg-elevated",
              ui: {
                trailingIcon: "text-dimmed"
              }
            }), null, _parent2, _scopeId));
          } else {
            return [
              createVNode(_component_UButton, mergeProps({
                ...unref(user),
                label: _ctx.collapsed ? void 0 : unref(user)?.name,
                trailingIcon: _ctx.collapsed ? void 0 : "i-lucide-chevrons-up-down"
              }, {
                color: "neutral",
                variant: "ghost",
                block: "",
                square: _ctx.collapsed,
                class: "data-[state=open]:bg-elevated",
                ui: {
                  trailingIcon: "text-dimmed"
                }
              }), null, 16, ["square"])
            ];
          }
        }),
        _: 1
      }, _parent));
    };
  }
});
const _sfc_setup$4 = _sfc_main$4.setup;
_sfc_main$4.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("components/UserMenu.vue");
  return _sfc_setup$4 ? _sfc_setup$4(props, ctx) : void 0;
};
const __nuxt_component_5 = Object.assign(_sfc_main$4, { __name: "UserMenu" });
function truncateHTMLFromStart(html, maxLength) {
  let truncated = "";
  let totalLength = 0;
  let insideTag = false;
  for (let i = html.length - 1; i >= 0; i--) {
    if (html[i] === ">") {
      insideTag = true;
    } else if (html[i] === "<") {
      insideTag = false;
      truncated = html[i] + truncated;
      continue;
    }
    if (!insideTag) {
      totalLength++;
    }
    if (totalLength <= maxLength) {
      truncated = html[i] + truncated;
    } else {
      truncated = "..." + truncated;
      break;
    }
  }
  return truncated;
}
function highlight(item, searchTerm, forceKey, omitKeys) {
  function generateHighlightedText(value, indices = []) {
    value = value || "";
    let content = "";
    let nextUnhighlightedRegionStartingIndex = 0;
    indices.forEach((region) => {
      if (region.length === 2 && region[0] === region[1]) {
        return;
      }
      const lastIndiceNextIndex = region[1] + 1;
      const isMatched = lastIndiceNextIndex - region[0] >= searchTerm.length;
      content += [
        value.substring(nextUnhighlightedRegionStartingIndex, region[0]),
        isMatched && `<mark>`,
        value.substring(region[0], lastIndiceNextIndex),
        isMatched && "</mark>"
      ].filter(Boolean).join("");
      nextUnhighlightedRegionStartingIndex = lastIndiceNextIndex;
    });
    content += value.substring(nextUnhighlightedRegionStartingIndex);
    const markIndex = content.indexOf("<mark>");
    if (markIndex !== -1) {
      content = truncateHTMLFromStart(content, content.length - markIndex);
    }
    return content;
  }
  if (!item.matches?.length) {
    return;
  }
  for (const match of item.matches) {
    if (forceKey && match.key !== forceKey) {
      continue;
    }
    if (omitKeys?.includes(match.key)) {
      continue;
    }
    return generateHighlightedText(match.value, match.indices);
  }
}
const theme$1 = {
  "slots": {
    "root": "flex flex-col min-h-0 min-w-0 divide-y divide-default",
    "input": "[&>input]:h-12",
    "close": "",
    "back": "p-0",
    "content": "relative overflow-hidden flex flex-col",
    "footer": "p-1",
    "viewport": "relative divide-y divide-default scroll-py-1 overflow-y-auto flex-1 focus:outline-none",
    "group": "p-1 isolate",
    "empty": "py-6 text-center text-sm text-muted",
    "label": "p-1.5 text-xs font-semibold text-highlighted",
    "item": "group relative w-full flex items-center gap-1.5 p-1.5 text-sm select-none outline-none before:absolute before:z-[-1] before:inset-px before:rounded-md data-disabled:cursor-not-allowed data-disabled:opacity-75",
    "itemLeadingIcon": "shrink-0 size-5",
    "itemLeadingAvatar": "shrink-0",
    "itemLeadingAvatarSize": "2xs",
    "itemLeadingChip": "shrink-0 size-5",
    "itemLeadingChipSize": "md",
    "itemTrailing": "ms-auto inline-flex gap-1.5 items-center",
    "itemTrailingIcon": "shrink-0 size-5",
    "itemTrailingHighlightedIcon": "shrink-0 size-5 text-dimmed hidden group-data-highlighted:inline-flex",
    "itemTrailingKbds": "hidden lg:inline-flex items-center shrink-0 gap-0.5",
    "itemTrailingKbdsSize": "md",
    "itemLabel": "truncate space-x-1 text-dimmed",
    "itemLabelBase": "text-highlighted [&>mark]:text-inverted [&>mark]:bg-primary",
    "itemLabelPrefix": "text-default",
    "itemLabelSuffix": "text-dimmed [&>mark]:text-inverted [&>mark]:bg-primary"
  },
  "variants": {
    "active": {
      "true": {
        "item": "text-highlighted before:bg-elevated",
        "itemLeadingIcon": "text-default"
      },
      "false": {
        "item": [
          "text-default data-highlighted:not-data-disabled:text-highlighted data-highlighted:not-data-disabled:before:bg-elevated/50",
          "transition-colors before:transition-colors"
        ],
        "itemLeadingIcon": [
          "text-dimmed group-data-highlighted:not-group-data-disabled:text-default",
          "transition-colors"
        ]
      }
    },
    "loading": {
      "true": {
        "itemLeadingIcon": "animate-spin"
      }
    }
  }
};
const _sfc_main$3 = {
  __name: "UCommandPalette",
  __ssrInlineRender: true,
  props: /* @__PURE__ */ mergeModels({
    as: { type: null, required: false },
    icon: { type: [String, Object], required: false },
    selectedIcon: { type: [String, Object], required: false },
    trailingIcon: { type: [String, Object], required: false },
    placeholder: { type: String, required: false },
    autofocus: { type: Boolean, required: false, default: true },
    close: { type: [Boolean, Object], required: false },
    closeIcon: { type: [String, Object], required: false },
    back: { type: [Boolean, Object], required: false, default: true },
    backIcon: { type: [String, Object], required: false },
    groups: { type: Array, required: false },
    fuse: { type: Object, required: false },
    labelKey: { type: null, required: false, default: "label" },
    class: { type: null, required: false },
    ui: { type: null, required: false },
    multiple: { type: Boolean, required: false },
    disabled: { type: Boolean, required: false },
    modelValue: { type: null, required: false, default: "" },
    defaultValue: { type: null, required: false },
    highlightOnHover: { type: Boolean, required: false },
    selectionBehavior: { type: String, required: false },
    loading: { type: Boolean, required: false },
    loadingIcon: { type: [String, Object], required: false }
  }, {
    "searchTerm": { type: String, ...{ default: "" } },
    "searchTermModifiers": {}
  }),
  emits: /* @__PURE__ */ mergeModels(["update:modelValue", "highlight", "entryFocus", "leave", "update:open"], ["update:searchTerm"]),
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emits = __emit;
    const slots = useSlots();
    const searchTerm = useModel(__props, "searchTerm", { type: String, ...{ default: "" } });
    const { t } = useLocale();
    const appConfig = useAppConfig();
    const rootProps = useForwardPropsEmits(reactivePick(props, "as", "disabled", "multiple", "modelValue", "defaultValue", "highlightOnHover"), emits);
    const inputProps = useForwardProps(reactivePick(props, "loading"));
    const ui = computed(() => tv({ extend: tv(theme$1), ...appConfig.ui?.commandPalette || {} })());
    const fuse = computed(() => defu({}, props.fuse, {
      fuseOptions: {
        ignoreLocation: true,
        threshold: 0.1,
        keys: [props.labelKey, "suffix"]
      },
      resultLimit: 12,
      matchAllWhenSearchEmpty: true
    }));
    const history = ref([]);
    const placeholder = computed(() => history.value[history.value.length - 1]?.placeholder || props.placeholder || t("commandPalette.placeholder"));
    const groups = computed(() => history.value?.length ? [history.value[history.value.length - 1]] : props.groups);
    const items = computed(() => groups.value?.filter((group) => {
      if (!group.id) {
        console.warn(`[@nuxt/ui] CommandPalette group is missing an \`id\` property`);
        return false;
      }
      if (group.ignoreFilter) {
        return false;
      }
      return true;
    })?.flatMap((group) => group.items?.map((item) => ({ ...item, group: group.id })) || []) || []);
    const { results: fuseResults } = useFuse(searchTerm, items, fuse);
    function getGroupWithItems(group, items2) {
      if (group?.postFilter && typeof group.postFilter === "function") {
        items2 = group.postFilter(searchTerm.value, items2);
      }
      return {
        ...group,
        items: items2.slice(0, fuse.value.resultLimit).map((item) => {
          return {
            ...item,
            labelHtml: highlight(item, searchTerm.value, props.labelKey),
            suffixHtml: highlight(item, searchTerm.value, void 0, [props.labelKey])
          };
        })
      };
    }
    const filteredGroups = computed(() => {
      const groupsById = fuseResults.value.reduce((acc, result) => {
        const { item, matches } = result;
        if (!item.group) {
          return acc;
        }
        acc[item.group] ||= [];
        acc[item.group]?.push({ ...item, matches });
        return acc;
      }, {});
      const fuseGroups = Object.entries(groupsById).map(([id, items2]) => {
        const group = groups.value?.find((group2) => group2.id === id);
        if (!group) {
          return;
        }
        return getGroupWithItems(group, items2);
      }).filter((group) => !!group);
      const nonFuseGroups = groups.value?.map((group, index) => ({ ...group, index }))?.filter((group) => group.ignoreFilter && group.items?.length)?.map((group) => ({ ...getGroupWithItems(group, group.items || []), index: group.index })) || [];
      return nonFuseGroups.reduce((acc, group) => {
        acc.splice(group.index, 0, group);
        return acc;
      }, [...fuseGroups]);
    });
    const listboxRootRef = useTemplateRef("listboxRootRef");
    function navigate(item) {
      if (!item.children?.length) {
        return;
      }
      history.value.push({
        id: `history-${history.value.length}`,
        label: item.label,
        slot: item.slot,
        placeholder: item.placeholder,
        items: item.children
      });
      searchTerm.value = "";
      listboxRootRef.value?.highlightFirstItem();
    }
    function navigateBack() {
      if (!history.value.length) {
        return;
      }
      history.value.pop();
      searchTerm.value = "";
      listboxRootRef.value?.highlightFirstItem();
    }
    function onBackspace() {
      if (!searchTerm.value) {
        navigateBack();
      }
    }
    function onSelect(e, item) {
      if (item.children?.length) {
        e.preventDefault();
        navigate(item);
      } else {
        item.onSelect?.(e);
      }
    }
    return (_ctx, _push, _parent, _attrs) => {
      _push(ssrRenderComponent(unref(ListboxRoot), mergeProps(unref(rootProps), {
        ref_key: "listboxRootRef",
        ref: listboxRootRef,
        "selection-behavior": __props.selectionBehavior,
        class: ui.value.root({ class: [props.ui?.root, props.class] })
      }, _attrs), {
        default: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            _push2(ssrRenderComponent(unref(ListboxFilter), {
              modelValue: searchTerm.value,
              "onUpdate:modelValue": ($event) => searchTerm.value = $event,
              "as-child": ""
            }, {
              default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                if (_push3) {
                  _push3(ssrRenderComponent(_sfc_main$h, mergeProps({
                    placeholder: placeholder.value,
                    variant: "none",
                    autofocus: __props.autofocus
                  }, unref(inputProps), {
                    "loading-icon": __props.loadingIcon,
                    icon: __props.icon || unref(appConfig).ui.icons.search,
                    class: ui.value.input({ class: props.ui?.input }),
                    onKeydown: onBackspace
                  }), createSlots({ _: 2 }, [
                    history.value?.length && (__props.back || !!slots.back) ? {
                      name: "leading",
                      fn: withCtx((_3, _push4, _parent4, _scopeId3) => {
                        if (_push4) {
                          ssrRenderSlot(_ctx.$slots, "back", { ui: ui.value }, () => {
                            _push4(ssrRenderComponent(_sfc_main$9$1, mergeProps({
                              icon: __props.backIcon || unref(appConfig).ui.icons.arrowLeft,
                              color: "neutral",
                              variant: "link",
                              "aria-label": unref(t)("commandPalette.back")
                            }, typeof __props.back === "object" ? __props.back : {}, {
                              class: ui.value.back({ class: props.ui?.back }),
                              onClick: navigateBack
                            }), null, _parent4, _scopeId3));
                          }, _push4, _parent4, _scopeId3);
                        } else {
                          return [
                            renderSlot(_ctx.$slots, "back", { ui: ui.value }, () => [
                              createVNode(_sfc_main$9$1, mergeProps({
                                icon: __props.backIcon || unref(appConfig).ui.icons.arrowLeft,
                                color: "neutral",
                                variant: "link",
                                "aria-label": unref(t)("commandPalette.back")
                              }, typeof __props.back === "object" ? __props.back : {}, {
                                class: ui.value.back({ class: props.ui?.back }),
                                onClick: navigateBack
                              }), null, 16, ["icon", "aria-label", "class"])
                            ])
                          ];
                        }
                      }),
                      key: "0"
                    } : void 0,
                    __props.close || !!slots.close ? {
                      name: "trailing",
                      fn: withCtx((_3, _push4, _parent4, _scopeId3) => {
                        if (_push4) {
                          ssrRenderSlot(_ctx.$slots, "close", { ui: ui.value }, () => {
                            if (__props.close) {
                              _push4(ssrRenderComponent(_sfc_main$9$1, mergeProps({
                                icon: __props.closeIcon || unref(appConfig).ui.icons.close,
                                color: "neutral",
                                variant: "ghost",
                                "aria-label": unref(t)("commandPalette.close")
                              }, typeof __props.close === "object" ? __props.close : {}, {
                                class: ui.value.close({ class: props.ui?.close }),
                                onClick: ($event) => emits("update:open", false)
                              }), null, _parent4, _scopeId3));
                            } else {
                              _push4(`<!---->`);
                            }
                          }, _push4, _parent4, _scopeId3);
                        } else {
                          return [
                            renderSlot(_ctx.$slots, "close", { ui: ui.value }, () => [
                              __props.close ? (openBlock(), createBlock(_sfc_main$9$1, mergeProps({
                                key: 0,
                                icon: __props.closeIcon || unref(appConfig).ui.icons.close,
                                color: "neutral",
                                variant: "ghost",
                                "aria-label": unref(t)("commandPalette.close")
                              }, typeof __props.close === "object" ? __props.close : {}, {
                                class: ui.value.close({ class: props.ui?.close }),
                                onClick: ($event) => emits("update:open", false)
                              }), null, 16, ["icon", "aria-label", "class", "onClick"])) : createCommentVNode("", true)
                            ])
                          ];
                        }
                      }),
                      key: "1"
                    } : void 0
                  ]), _parent3, _scopeId2));
                } else {
                  return [
                    createVNode(_sfc_main$h, mergeProps({
                      placeholder: placeholder.value,
                      variant: "none",
                      autofocus: __props.autofocus
                    }, unref(inputProps), {
                      "loading-icon": __props.loadingIcon,
                      icon: __props.icon || unref(appConfig).ui.icons.search,
                      class: ui.value.input({ class: props.ui?.input }),
                      onKeydown: withKeys(onBackspace, ["backspace"])
                    }), createSlots({ _: 2 }, [
                      history.value?.length && (__props.back || !!slots.back) ? {
                        name: "leading",
                        fn: withCtx(() => [
                          renderSlot(_ctx.$slots, "back", { ui: ui.value }, () => [
                            createVNode(_sfc_main$9$1, mergeProps({
                              icon: __props.backIcon || unref(appConfig).ui.icons.arrowLeft,
                              color: "neutral",
                              variant: "link",
                              "aria-label": unref(t)("commandPalette.back")
                            }, typeof __props.back === "object" ? __props.back : {}, {
                              class: ui.value.back({ class: props.ui?.back }),
                              onClick: navigateBack
                            }), null, 16, ["icon", "aria-label", "class"])
                          ])
                        ]),
                        key: "0"
                      } : void 0,
                      __props.close || !!slots.close ? {
                        name: "trailing",
                        fn: withCtx(() => [
                          renderSlot(_ctx.$slots, "close", { ui: ui.value }, () => [
                            __props.close ? (openBlock(), createBlock(_sfc_main$9$1, mergeProps({
                              key: 0,
                              icon: __props.closeIcon || unref(appConfig).ui.icons.close,
                              color: "neutral",
                              variant: "ghost",
                              "aria-label": unref(t)("commandPalette.close")
                            }, typeof __props.close === "object" ? __props.close : {}, {
                              class: ui.value.close({ class: props.ui?.close }),
                              onClick: ($event) => emits("update:open", false)
                            }), null, 16, ["icon", "aria-label", "class", "onClick"])) : createCommentVNode("", true)
                          ])
                        ]),
                        key: "1"
                      } : void 0
                    ]), 1040, ["placeholder", "autofocus", "loading-icon", "icon", "class"])
                  ];
                }
              }),
              _: 3
            }, _parent2, _scopeId));
            _push2(ssrRenderComponent(unref(ListboxContent), {
              class: ui.value.content({ class: props.ui?.content })
            }, {
              default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                if (_push3) {
                  if (filteredGroups.value?.length) {
                    _push3(`<div role="presentation" class="${ssrRenderClass(ui.value.viewport({ class: props.ui?.viewport }))}"${_scopeId2}><!--[-->`);
                    ssrRenderList(filteredGroups.value, (group) => {
                      _push3(ssrRenderComponent(unref(ListboxGroup), {
                        key: `group-${group.id}`,
                        class: ui.value.group({ class: props.ui?.group })
                      }, {
                        default: withCtx((_3, _push4, _parent4, _scopeId3) => {
                          if (_push4) {
                            if (unref(get)(group, props.labelKey)) {
                              _push4(ssrRenderComponent(unref(ListboxGroupLabel), {
                                class: ui.value.label({ class: props.ui?.label })
                              }, {
                                default: withCtx((_4, _push5, _parent5, _scopeId4) => {
                                  if (_push5) {
                                    _push5(`${ssrInterpolate(unref(get)(group, props.labelKey))}`);
                                  } else {
                                    return [
                                      createTextVNode(toDisplayString(unref(get)(group, props.labelKey)), 1)
                                    ];
                                  }
                                }),
                                _: 2
                              }, _parent4, _scopeId3));
                            } else {
                              _push4(`<!---->`);
                            }
                            _push4(`<!--[-->`);
                            ssrRenderList(group.items, (item, index) => {
                              _push4(ssrRenderComponent(unref(ListboxItem), {
                                key: `group-${group.id}-${index}`,
                                value: unref(omit)(item, ["matches", "group", "onSelect", "labelHtml", "suffixHtml", "children"]),
                                disabled: item.disabled,
                                "as-child": "",
                                onSelect: ($event) => onSelect($event, item)
                              }, {
                                default: withCtx((_4, _push5, _parent5, _scopeId4) => {
                                  if (_push5) {
                                    _push5(ssrRenderComponent(_sfc_main$a$1, mergeProps({ ref_for: true }, unref(pickLinkProps)(item), { custom: "" }), {
                                      default: withCtx(({ active, ...slotProps }, _push6, _parent6, _scopeId5) => {
                                        if (_push6) {
                                          _push6(ssrRenderComponent(_sfc_main$b$1, mergeProps({ ref_for: true }, slotProps, {
                                            class: ui.value.item({ class: [props.ui?.item, item.ui?.item, item.class], active: active || item.active })
                                          }), {
                                            default: withCtx((_5, _push7, _parent7, _scopeId6) => {
                                              if (_push7) {
                                                ssrRenderSlot(_ctx.$slots, item.slot || group.slot || "item", {
                                                  item,
                                                  index
                                                }, () => {
                                                  ssrRenderSlot(_ctx.$slots, item.slot ? `${item.slot}-leading` : group.slot ? `${group.slot}-leading` : `item-leading`, {
                                                    item,
                                                    index
                                                  }, () => {
                                                    if (item.loading) {
                                                      _push7(ssrRenderComponent(_sfc_main$e$1, {
                                                        name: __props.loadingIcon || unref(appConfig).ui.icons.loading,
                                                        class: ui.value.itemLeadingIcon({ class: [props.ui?.itemLeadingIcon, item.ui?.itemLeadingIcon], loading: true })
                                                      }, null, _parent7, _scopeId6));
                                                    } else if (item.icon) {
                                                      _push7(ssrRenderComponent(_sfc_main$e$1, {
                                                        name: item.icon,
                                                        class: ui.value.itemLeadingIcon({ class: [props.ui?.itemLeadingIcon, item.ui?.itemLeadingIcon], active: active || item.active })
                                                      }, null, _parent7, _scopeId6));
                                                    } else if (item.avatar) {
                                                      _push7(ssrRenderComponent(_sfc_main$c$1, mergeProps({
                                                        size: item.ui?.itemLeadingAvatarSize || props.ui?.itemLeadingAvatarSize || ui.value.itemLeadingAvatarSize()
                                                      }, { ref_for: true }, item.avatar, {
                                                        class: ui.value.itemLeadingAvatar({ class: [props.ui?.itemLeadingAvatar, item.ui?.itemLeadingAvatar], active: active || item.active })
                                                      }), null, _parent7, _scopeId6));
                                                    } else if (item.chip) {
                                                      _push7(ssrRenderComponent(_sfc_main$d$1, mergeProps({
                                                        size: item.ui?.itemLeadingChipSize || props.ui?.itemLeadingChipSize || ui.value.itemLeadingChipSize(),
                                                        inset: "",
                                                        standalone: ""
                                                      }, { ref_for: true }, item.chip, {
                                                        class: ui.value.itemLeadingChip({ class: [props.ui?.itemLeadingChip, item.ui?.itemLeadingChip], active: active || item.active })
                                                      }), null, _parent7, _scopeId6));
                                                    } else {
                                                      _push7(`<!---->`);
                                                    }
                                                  }, _push7, _parent7, _scopeId6);
                                                  if (item.labelHtml || unref(get)(item, props.labelKey) || !!slots[item.slot ? `${item.slot}-label` : group.slot ? `${group.slot}-label` : `item-label`]) {
                                                    _push7(`<span class="${ssrRenderClass(ui.value.itemLabel({ class: [props.ui?.itemLabel, item.ui?.itemLabel], active: active || item.active }))}"${_scopeId6}>`);
                                                    ssrRenderSlot(_ctx.$slots, item.slot ? `${item.slot}-label` : group.slot ? `${group.slot}-label` : `item-label`, {
                                                      item,
                                                      index
                                                    }, () => {
                                                      if (item.prefix) {
                                                        _push7(`<span class="${ssrRenderClass(ui.value.itemLabelPrefix({ class: [props.ui?.itemLabelPrefix, item.ui?.itemLabelPrefix] }))}"${_scopeId6}>${ssrInterpolate(item.prefix)}</span>`);
                                                      } else {
                                                        _push7(`<!---->`);
                                                      }
                                                      _push7(`<span class="${ssrRenderClass(ui.value.itemLabelBase({ class: [props.ui?.itemLabelBase, item.ui?.itemLabelBase], active: active || item.active }))}"${_scopeId6}>${(item.labelHtml || unref(get)(item, props.labelKey)) ?? ""}</span><span class="${ssrRenderClass(ui.value.itemLabelSuffix({ class: [props.ui?.itemLabelSuffix, item.ui?.itemLabelSuffix], active: active || item.active }))}"${_scopeId6}>${(item.suffixHtml || item.suffix) ?? ""}</span>`);
                                                    }, _push7, _parent7, _scopeId6);
                                                    _push7(`</span>`);
                                                  } else {
                                                    _push7(`<!---->`);
                                                  }
                                                  _push7(`<span class="${ssrRenderClass(ui.value.itemTrailing({ class: [props.ui?.itemTrailing, item.ui?.itemTrailing] }))}"${_scopeId6}>`);
                                                  ssrRenderSlot(_ctx.$slots, item.slot ? `${item.slot}-trailing` : group.slot ? `${group.slot}-trailing` : `item-trailing`, {
                                                    item,
                                                    index
                                                  }, () => {
                                                    if (item.children && item.children.length > 0) {
                                                      _push7(ssrRenderComponent(_sfc_main$e$1, {
                                                        name: __props.trailingIcon || unref(appConfig).ui.icons.chevronRight,
                                                        class: ui.value.itemTrailingIcon({ class: [props.ui?.itemTrailingIcon, item.ui?.itemTrailingIcon] })
                                                      }, null, _parent7, _scopeId6));
                                                    } else if (item.kbds?.length) {
                                                      _push7(`<span class="${ssrRenderClass(ui.value.itemTrailingKbds({ class: [props.ui?.itemTrailingKbds, item.ui?.itemTrailingKbds] }))}"${_scopeId6}><!--[-->`);
                                                      ssrRenderList(item.kbds, (kbd, kbdIndex) => {
                                                        _push7(ssrRenderComponent(_sfc_main$e, mergeProps({
                                                          key: kbdIndex,
                                                          size: item.ui?.itemTrailingKbdsSize || props.ui?.itemTrailingKbdsSize || ui.value.itemTrailingKbdsSize()
                                                        }, { ref_for: true }, typeof kbd === "string" ? { value: kbd } : kbd), null, _parent7, _scopeId6));
                                                      });
                                                      _push7(`<!--]--></span>`);
                                                    } else if (group.highlightedIcon) {
                                                      _push7(ssrRenderComponent(_sfc_main$e$1, {
                                                        name: group.highlightedIcon,
                                                        class: ui.value.itemTrailingHighlightedIcon({ class: [props.ui?.itemTrailingHighlightedIcon, item.ui?.itemTrailingHighlightedIcon] })
                                                      }, null, _parent7, _scopeId6));
                                                    } else {
                                                      _push7(`<!---->`);
                                                    }
                                                  }, _push7, _parent7, _scopeId6);
                                                  if (!item.children?.length) {
                                                    _push7(ssrRenderComponent(unref(ListboxItemIndicator), { "as-child": "" }, {
                                                      default: withCtx((_6, _push8, _parent8, _scopeId7) => {
                                                        if (_push8) {
                                                          _push8(ssrRenderComponent(_sfc_main$e$1, {
                                                            name: __props.selectedIcon || unref(appConfig).ui.icons.check,
                                                            class: ui.value.itemTrailingIcon({ class: [props.ui?.itemTrailingIcon, item.ui?.itemTrailingIcon] })
                                                          }, null, _parent8, _scopeId7));
                                                        } else {
                                                          return [
                                                            createVNode(_sfc_main$e$1, {
                                                              name: __props.selectedIcon || unref(appConfig).ui.icons.check,
                                                              class: ui.value.itemTrailingIcon({ class: [props.ui?.itemTrailingIcon, item.ui?.itemTrailingIcon] })
                                                            }, null, 8, ["name", "class"])
                                                          ];
                                                        }
                                                      }),
                                                      _: 2
                                                    }, _parent7, _scopeId6));
                                                  } else {
                                                    _push7(`<!---->`);
                                                  }
                                                  _push7(`</span>`);
                                                }, _push7, _parent7, _scopeId6);
                                              } else {
                                                return [
                                                  renderSlot(_ctx.$slots, item.slot || group.slot || "item", {
                                                    item,
                                                    index
                                                  }, () => [
                                                    renderSlot(_ctx.$slots, item.slot ? `${item.slot}-leading` : group.slot ? `${group.slot}-leading` : `item-leading`, {
                                                      item,
                                                      index
                                                    }, () => [
                                                      item.loading ? (openBlock(), createBlock(_sfc_main$e$1, {
                                                        key: 0,
                                                        name: __props.loadingIcon || unref(appConfig).ui.icons.loading,
                                                        class: ui.value.itemLeadingIcon({ class: [props.ui?.itemLeadingIcon, item.ui?.itemLeadingIcon], loading: true })
                                                      }, null, 8, ["name", "class"])) : item.icon ? (openBlock(), createBlock(_sfc_main$e$1, {
                                                        key: 1,
                                                        name: item.icon,
                                                        class: ui.value.itemLeadingIcon({ class: [props.ui?.itemLeadingIcon, item.ui?.itemLeadingIcon], active: active || item.active })
                                                      }, null, 8, ["name", "class"])) : item.avatar ? (openBlock(), createBlock(_sfc_main$c$1, mergeProps({
                                                        key: 2,
                                                        size: item.ui?.itemLeadingAvatarSize || props.ui?.itemLeadingAvatarSize || ui.value.itemLeadingAvatarSize()
                                                      }, { ref_for: true }, item.avatar, {
                                                        class: ui.value.itemLeadingAvatar({ class: [props.ui?.itemLeadingAvatar, item.ui?.itemLeadingAvatar], active: active || item.active })
                                                      }), null, 16, ["size", "class"])) : item.chip ? (openBlock(), createBlock(_sfc_main$d$1, mergeProps({
                                                        key: 3,
                                                        size: item.ui?.itemLeadingChipSize || props.ui?.itemLeadingChipSize || ui.value.itemLeadingChipSize(),
                                                        inset: "",
                                                        standalone: ""
                                                      }, { ref_for: true }, item.chip, {
                                                        class: ui.value.itemLeadingChip({ class: [props.ui?.itemLeadingChip, item.ui?.itemLeadingChip], active: active || item.active })
                                                      }), null, 16, ["size", "class"])) : createCommentVNode("", true)
                                                    ]),
                                                    item.labelHtml || unref(get)(item, props.labelKey) || !!slots[item.slot ? `${item.slot}-label` : group.slot ? `${group.slot}-label` : `item-label`] ? (openBlock(), createBlock("span", {
                                                      key: 0,
                                                      class: ui.value.itemLabel({ class: [props.ui?.itemLabel, item.ui?.itemLabel], active: active || item.active })
                                                    }, [
                                                      renderSlot(_ctx.$slots, item.slot ? `${item.slot}-label` : group.slot ? `${group.slot}-label` : `item-label`, {
                                                        item,
                                                        index
                                                      }, () => [
                                                        item.prefix ? (openBlock(), createBlock("span", {
                                                          key: 0,
                                                          class: ui.value.itemLabelPrefix({ class: [props.ui?.itemLabelPrefix, item.ui?.itemLabelPrefix] })
                                                        }, toDisplayString(item.prefix), 3)) : createCommentVNode("", true),
                                                        createVNode("span", {
                                                          class: ui.value.itemLabelBase({ class: [props.ui?.itemLabelBase, item.ui?.itemLabelBase], active: active || item.active }),
                                                          innerHTML: item.labelHtml || unref(get)(item, props.labelKey)
                                                        }, null, 10, ["innerHTML"]),
                                                        createVNode("span", {
                                                          class: ui.value.itemLabelSuffix({ class: [props.ui?.itemLabelSuffix, item.ui?.itemLabelSuffix], active: active || item.active }),
                                                          innerHTML: item.suffixHtml || item.suffix
                                                        }, null, 10, ["innerHTML"])
                                                      ])
                                                    ], 2)) : createCommentVNode("", true),
                                                    createVNode("span", {
                                                      class: ui.value.itemTrailing({ class: [props.ui?.itemTrailing, item.ui?.itemTrailing] })
                                                    }, [
                                                      renderSlot(_ctx.$slots, item.slot ? `${item.slot}-trailing` : group.slot ? `${group.slot}-trailing` : `item-trailing`, {
                                                        item,
                                                        index
                                                      }, () => [
                                                        item.children && item.children.length > 0 ? (openBlock(), createBlock(_sfc_main$e$1, {
                                                          key: 0,
                                                          name: __props.trailingIcon || unref(appConfig).ui.icons.chevronRight,
                                                          class: ui.value.itemTrailingIcon({ class: [props.ui?.itemTrailingIcon, item.ui?.itemTrailingIcon] })
                                                        }, null, 8, ["name", "class"])) : item.kbds?.length ? (openBlock(), createBlock("span", {
                                                          key: 1,
                                                          class: ui.value.itemTrailingKbds({ class: [props.ui?.itemTrailingKbds, item.ui?.itemTrailingKbds] })
                                                        }, [
                                                          (openBlock(true), createBlock(Fragment, null, renderList(item.kbds, (kbd, kbdIndex) => {
                                                            return openBlock(), createBlock(_sfc_main$e, mergeProps({
                                                              key: kbdIndex,
                                                              size: item.ui?.itemTrailingKbdsSize || props.ui?.itemTrailingKbdsSize || ui.value.itemTrailingKbdsSize()
                                                            }, { ref_for: true }, typeof kbd === "string" ? { value: kbd } : kbd), null, 16, ["size"]);
                                                          }), 128))
                                                        ], 2)) : group.highlightedIcon ? (openBlock(), createBlock(_sfc_main$e$1, {
                                                          key: 2,
                                                          name: group.highlightedIcon,
                                                          class: ui.value.itemTrailingHighlightedIcon({ class: [props.ui?.itemTrailingHighlightedIcon, item.ui?.itemTrailingHighlightedIcon] })
                                                        }, null, 8, ["name", "class"])) : createCommentVNode("", true)
                                                      ]),
                                                      !item.children?.length ? (openBlock(), createBlock(unref(ListboxItemIndicator), {
                                                        key: 0,
                                                        "as-child": ""
                                                      }, {
                                                        default: withCtx(() => [
                                                          createVNode(_sfc_main$e$1, {
                                                            name: __props.selectedIcon || unref(appConfig).ui.icons.check,
                                                            class: ui.value.itemTrailingIcon({ class: [props.ui?.itemTrailingIcon, item.ui?.itemTrailingIcon] })
                                                          }, null, 8, ["name", "class"])
                                                        ]),
                                                        _: 2
                                                      }, 1024)) : createCommentVNode("", true)
                                                    ], 2)
                                                  ])
                                                ];
                                              }
                                            }),
                                            _: 2
                                          }, _parent6, _scopeId5));
                                        } else {
                                          return [
                                            createVNode(_sfc_main$b$1, mergeProps({ ref_for: true }, slotProps, {
                                              class: ui.value.item({ class: [props.ui?.item, item.ui?.item, item.class], active: active || item.active })
                                            }), {
                                              default: withCtx(() => [
                                                renderSlot(_ctx.$slots, item.slot || group.slot || "item", {
                                                  item,
                                                  index
                                                }, () => [
                                                  renderSlot(_ctx.$slots, item.slot ? `${item.slot}-leading` : group.slot ? `${group.slot}-leading` : `item-leading`, {
                                                    item,
                                                    index
                                                  }, () => [
                                                    item.loading ? (openBlock(), createBlock(_sfc_main$e$1, {
                                                      key: 0,
                                                      name: __props.loadingIcon || unref(appConfig).ui.icons.loading,
                                                      class: ui.value.itemLeadingIcon({ class: [props.ui?.itemLeadingIcon, item.ui?.itemLeadingIcon], loading: true })
                                                    }, null, 8, ["name", "class"])) : item.icon ? (openBlock(), createBlock(_sfc_main$e$1, {
                                                      key: 1,
                                                      name: item.icon,
                                                      class: ui.value.itemLeadingIcon({ class: [props.ui?.itemLeadingIcon, item.ui?.itemLeadingIcon], active: active || item.active })
                                                    }, null, 8, ["name", "class"])) : item.avatar ? (openBlock(), createBlock(_sfc_main$c$1, mergeProps({
                                                      key: 2,
                                                      size: item.ui?.itemLeadingAvatarSize || props.ui?.itemLeadingAvatarSize || ui.value.itemLeadingAvatarSize()
                                                    }, { ref_for: true }, item.avatar, {
                                                      class: ui.value.itemLeadingAvatar({ class: [props.ui?.itemLeadingAvatar, item.ui?.itemLeadingAvatar], active: active || item.active })
                                                    }), null, 16, ["size", "class"])) : item.chip ? (openBlock(), createBlock(_sfc_main$d$1, mergeProps({
                                                      key: 3,
                                                      size: item.ui?.itemLeadingChipSize || props.ui?.itemLeadingChipSize || ui.value.itemLeadingChipSize(),
                                                      inset: "",
                                                      standalone: ""
                                                    }, { ref_for: true }, item.chip, {
                                                      class: ui.value.itemLeadingChip({ class: [props.ui?.itemLeadingChip, item.ui?.itemLeadingChip], active: active || item.active })
                                                    }), null, 16, ["size", "class"])) : createCommentVNode("", true)
                                                  ]),
                                                  item.labelHtml || unref(get)(item, props.labelKey) || !!slots[item.slot ? `${item.slot}-label` : group.slot ? `${group.slot}-label` : `item-label`] ? (openBlock(), createBlock("span", {
                                                    key: 0,
                                                    class: ui.value.itemLabel({ class: [props.ui?.itemLabel, item.ui?.itemLabel], active: active || item.active })
                                                  }, [
                                                    renderSlot(_ctx.$slots, item.slot ? `${item.slot}-label` : group.slot ? `${group.slot}-label` : `item-label`, {
                                                      item,
                                                      index
                                                    }, () => [
                                                      item.prefix ? (openBlock(), createBlock("span", {
                                                        key: 0,
                                                        class: ui.value.itemLabelPrefix({ class: [props.ui?.itemLabelPrefix, item.ui?.itemLabelPrefix] })
                                                      }, toDisplayString(item.prefix), 3)) : createCommentVNode("", true),
                                                      createVNode("span", {
                                                        class: ui.value.itemLabelBase({ class: [props.ui?.itemLabelBase, item.ui?.itemLabelBase], active: active || item.active }),
                                                        innerHTML: item.labelHtml || unref(get)(item, props.labelKey)
                                                      }, null, 10, ["innerHTML"]),
                                                      createVNode("span", {
                                                        class: ui.value.itemLabelSuffix({ class: [props.ui?.itemLabelSuffix, item.ui?.itemLabelSuffix], active: active || item.active }),
                                                        innerHTML: item.suffixHtml || item.suffix
                                                      }, null, 10, ["innerHTML"])
                                                    ])
                                                  ], 2)) : createCommentVNode("", true),
                                                  createVNode("span", {
                                                    class: ui.value.itemTrailing({ class: [props.ui?.itemTrailing, item.ui?.itemTrailing] })
                                                  }, [
                                                    renderSlot(_ctx.$slots, item.slot ? `${item.slot}-trailing` : group.slot ? `${group.slot}-trailing` : `item-trailing`, {
                                                      item,
                                                      index
                                                    }, () => [
                                                      item.children && item.children.length > 0 ? (openBlock(), createBlock(_sfc_main$e$1, {
                                                        key: 0,
                                                        name: __props.trailingIcon || unref(appConfig).ui.icons.chevronRight,
                                                        class: ui.value.itemTrailingIcon({ class: [props.ui?.itemTrailingIcon, item.ui?.itemTrailingIcon] })
                                                      }, null, 8, ["name", "class"])) : item.kbds?.length ? (openBlock(), createBlock("span", {
                                                        key: 1,
                                                        class: ui.value.itemTrailingKbds({ class: [props.ui?.itemTrailingKbds, item.ui?.itemTrailingKbds] })
                                                      }, [
                                                        (openBlock(true), createBlock(Fragment, null, renderList(item.kbds, (kbd, kbdIndex) => {
                                                          return openBlock(), createBlock(_sfc_main$e, mergeProps({
                                                            key: kbdIndex,
                                                            size: item.ui?.itemTrailingKbdsSize || props.ui?.itemTrailingKbdsSize || ui.value.itemTrailingKbdsSize()
                                                          }, { ref_for: true }, typeof kbd === "string" ? { value: kbd } : kbd), null, 16, ["size"]);
                                                        }), 128))
                                                      ], 2)) : group.highlightedIcon ? (openBlock(), createBlock(_sfc_main$e$1, {
                                                        key: 2,
                                                        name: group.highlightedIcon,
                                                        class: ui.value.itemTrailingHighlightedIcon({ class: [props.ui?.itemTrailingHighlightedIcon, item.ui?.itemTrailingHighlightedIcon] })
                                                      }, null, 8, ["name", "class"])) : createCommentVNode("", true)
                                                    ]),
                                                    !item.children?.length ? (openBlock(), createBlock(unref(ListboxItemIndicator), {
                                                      key: 0,
                                                      "as-child": ""
                                                    }, {
                                                      default: withCtx(() => [
                                                        createVNode(_sfc_main$e$1, {
                                                          name: __props.selectedIcon || unref(appConfig).ui.icons.check,
                                                          class: ui.value.itemTrailingIcon({ class: [props.ui?.itemTrailingIcon, item.ui?.itemTrailingIcon] })
                                                        }, null, 8, ["name", "class"])
                                                      ]),
                                                      _: 2
                                                    }, 1024)) : createCommentVNode("", true)
                                                  ], 2)
                                                ])
                                              ]),
                                              _: 2
                                            }, 1040, ["class"])
                                          ];
                                        }
                                      }),
                                      _: 2
                                    }, _parent5, _scopeId4));
                                  } else {
                                    return [
                                      createVNode(_sfc_main$a$1, mergeProps({ ref_for: true }, unref(pickLinkProps)(item), { custom: "" }), {
                                        default: withCtx(({ active, ...slotProps }) => [
                                          createVNode(_sfc_main$b$1, mergeProps({ ref_for: true }, slotProps, {
                                            class: ui.value.item({ class: [props.ui?.item, item.ui?.item, item.class], active: active || item.active })
                                          }), {
                                            default: withCtx(() => [
                                              renderSlot(_ctx.$slots, item.slot || group.slot || "item", {
                                                item,
                                                index
                                              }, () => [
                                                renderSlot(_ctx.$slots, item.slot ? `${item.slot}-leading` : group.slot ? `${group.slot}-leading` : `item-leading`, {
                                                  item,
                                                  index
                                                }, () => [
                                                  item.loading ? (openBlock(), createBlock(_sfc_main$e$1, {
                                                    key: 0,
                                                    name: __props.loadingIcon || unref(appConfig).ui.icons.loading,
                                                    class: ui.value.itemLeadingIcon({ class: [props.ui?.itemLeadingIcon, item.ui?.itemLeadingIcon], loading: true })
                                                  }, null, 8, ["name", "class"])) : item.icon ? (openBlock(), createBlock(_sfc_main$e$1, {
                                                    key: 1,
                                                    name: item.icon,
                                                    class: ui.value.itemLeadingIcon({ class: [props.ui?.itemLeadingIcon, item.ui?.itemLeadingIcon], active: active || item.active })
                                                  }, null, 8, ["name", "class"])) : item.avatar ? (openBlock(), createBlock(_sfc_main$c$1, mergeProps({
                                                    key: 2,
                                                    size: item.ui?.itemLeadingAvatarSize || props.ui?.itemLeadingAvatarSize || ui.value.itemLeadingAvatarSize()
                                                  }, { ref_for: true }, item.avatar, {
                                                    class: ui.value.itemLeadingAvatar({ class: [props.ui?.itemLeadingAvatar, item.ui?.itemLeadingAvatar], active: active || item.active })
                                                  }), null, 16, ["size", "class"])) : item.chip ? (openBlock(), createBlock(_sfc_main$d$1, mergeProps({
                                                    key: 3,
                                                    size: item.ui?.itemLeadingChipSize || props.ui?.itemLeadingChipSize || ui.value.itemLeadingChipSize(),
                                                    inset: "",
                                                    standalone: ""
                                                  }, { ref_for: true }, item.chip, {
                                                    class: ui.value.itemLeadingChip({ class: [props.ui?.itemLeadingChip, item.ui?.itemLeadingChip], active: active || item.active })
                                                  }), null, 16, ["size", "class"])) : createCommentVNode("", true)
                                                ]),
                                                item.labelHtml || unref(get)(item, props.labelKey) || !!slots[item.slot ? `${item.slot}-label` : group.slot ? `${group.slot}-label` : `item-label`] ? (openBlock(), createBlock("span", {
                                                  key: 0,
                                                  class: ui.value.itemLabel({ class: [props.ui?.itemLabel, item.ui?.itemLabel], active: active || item.active })
                                                }, [
                                                  renderSlot(_ctx.$slots, item.slot ? `${item.slot}-label` : group.slot ? `${group.slot}-label` : `item-label`, {
                                                    item,
                                                    index
                                                  }, () => [
                                                    item.prefix ? (openBlock(), createBlock("span", {
                                                      key: 0,
                                                      class: ui.value.itemLabelPrefix({ class: [props.ui?.itemLabelPrefix, item.ui?.itemLabelPrefix] })
                                                    }, toDisplayString(item.prefix), 3)) : createCommentVNode("", true),
                                                    createVNode("span", {
                                                      class: ui.value.itemLabelBase({ class: [props.ui?.itemLabelBase, item.ui?.itemLabelBase], active: active || item.active }),
                                                      innerHTML: item.labelHtml || unref(get)(item, props.labelKey)
                                                    }, null, 10, ["innerHTML"]),
                                                    createVNode("span", {
                                                      class: ui.value.itemLabelSuffix({ class: [props.ui?.itemLabelSuffix, item.ui?.itemLabelSuffix], active: active || item.active }),
                                                      innerHTML: item.suffixHtml || item.suffix
                                                    }, null, 10, ["innerHTML"])
                                                  ])
                                                ], 2)) : createCommentVNode("", true),
                                                createVNode("span", {
                                                  class: ui.value.itemTrailing({ class: [props.ui?.itemTrailing, item.ui?.itemTrailing] })
                                                }, [
                                                  renderSlot(_ctx.$slots, item.slot ? `${item.slot}-trailing` : group.slot ? `${group.slot}-trailing` : `item-trailing`, {
                                                    item,
                                                    index
                                                  }, () => [
                                                    item.children && item.children.length > 0 ? (openBlock(), createBlock(_sfc_main$e$1, {
                                                      key: 0,
                                                      name: __props.trailingIcon || unref(appConfig).ui.icons.chevronRight,
                                                      class: ui.value.itemTrailingIcon({ class: [props.ui?.itemTrailingIcon, item.ui?.itemTrailingIcon] })
                                                    }, null, 8, ["name", "class"])) : item.kbds?.length ? (openBlock(), createBlock("span", {
                                                      key: 1,
                                                      class: ui.value.itemTrailingKbds({ class: [props.ui?.itemTrailingKbds, item.ui?.itemTrailingKbds] })
                                                    }, [
                                                      (openBlock(true), createBlock(Fragment, null, renderList(item.kbds, (kbd, kbdIndex) => {
                                                        return openBlock(), createBlock(_sfc_main$e, mergeProps({
                                                          key: kbdIndex,
                                                          size: item.ui?.itemTrailingKbdsSize || props.ui?.itemTrailingKbdsSize || ui.value.itemTrailingKbdsSize()
                                                        }, { ref_for: true }, typeof kbd === "string" ? { value: kbd } : kbd), null, 16, ["size"]);
                                                      }), 128))
                                                    ], 2)) : group.highlightedIcon ? (openBlock(), createBlock(_sfc_main$e$1, {
                                                      key: 2,
                                                      name: group.highlightedIcon,
                                                      class: ui.value.itemTrailingHighlightedIcon({ class: [props.ui?.itemTrailingHighlightedIcon, item.ui?.itemTrailingHighlightedIcon] })
                                                    }, null, 8, ["name", "class"])) : createCommentVNode("", true)
                                                  ]),
                                                  !item.children?.length ? (openBlock(), createBlock(unref(ListboxItemIndicator), {
                                                    key: 0,
                                                    "as-child": ""
                                                  }, {
                                                    default: withCtx(() => [
                                                      createVNode(_sfc_main$e$1, {
                                                        name: __props.selectedIcon || unref(appConfig).ui.icons.check,
                                                        class: ui.value.itemTrailingIcon({ class: [props.ui?.itemTrailingIcon, item.ui?.itemTrailingIcon] })
                                                      }, null, 8, ["name", "class"])
                                                    ]),
                                                    _: 2
                                                  }, 1024)) : createCommentVNode("", true)
                                                ], 2)
                                              ])
                                            ]),
                                            _: 2
                                          }, 1040, ["class"])
                                        ]),
                                        _: 2
                                      }, 1040)
                                    ];
                                  }
                                }),
                                _: 2
                              }, _parent4, _scopeId3));
                            });
                            _push4(`<!--]-->`);
                          } else {
                            return [
                              unref(get)(group, props.labelKey) ? (openBlock(), createBlock(unref(ListboxGroupLabel), {
                                key: 0,
                                class: ui.value.label({ class: props.ui?.label })
                              }, {
                                default: withCtx(() => [
                                  createTextVNode(toDisplayString(unref(get)(group, props.labelKey)), 1)
                                ]),
                                _: 2
                              }, 1032, ["class"])) : createCommentVNode("", true),
                              (openBlock(true), createBlock(Fragment, null, renderList(group.items, (item, index) => {
                                return openBlock(), createBlock(unref(ListboxItem), {
                                  key: `group-${group.id}-${index}`,
                                  value: unref(omit)(item, ["matches", "group", "onSelect", "labelHtml", "suffixHtml", "children"]),
                                  disabled: item.disabled,
                                  "as-child": "",
                                  onSelect: ($event) => onSelect($event, item)
                                }, {
                                  default: withCtx(() => [
                                    createVNode(_sfc_main$a$1, mergeProps({ ref_for: true }, unref(pickLinkProps)(item), { custom: "" }), {
                                      default: withCtx(({ active, ...slotProps }) => [
                                        createVNode(_sfc_main$b$1, mergeProps({ ref_for: true }, slotProps, {
                                          class: ui.value.item({ class: [props.ui?.item, item.ui?.item, item.class], active: active || item.active })
                                        }), {
                                          default: withCtx(() => [
                                            renderSlot(_ctx.$slots, item.slot || group.slot || "item", {
                                              item,
                                              index
                                            }, () => [
                                              renderSlot(_ctx.$slots, item.slot ? `${item.slot}-leading` : group.slot ? `${group.slot}-leading` : `item-leading`, {
                                                item,
                                                index
                                              }, () => [
                                                item.loading ? (openBlock(), createBlock(_sfc_main$e$1, {
                                                  key: 0,
                                                  name: __props.loadingIcon || unref(appConfig).ui.icons.loading,
                                                  class: ui.value.itemLeadingIcon({ class: [props.ui?.itemLeadingIcon, item.ui?.itemLeadingIcon], loading: true })
                                                }, null, 8, ["name", "class"])) : item.icon ? (openBlock(), createBlock(_sfc_main$e$1, {
                                                  key: 1,
                                                  name: item.icon,
                                                  class: ui.value.itemLeadingIcon({ class: [props.ui?.itemLeadingIcon, item.ui?.itemLeadingIcon], active: active || item.active })
                                                }, null, 8, ["name", "class"])) : item.avatar ? (openBlock(), createBlock(_sfc_main$c$1, mergeProps({
                                                  key: 2,
                                                  size: item.ui?.itemLeadingAvatarSize || props.ui?.itemLeadingAvatarSize || ui.value.itemLeadingAvatarSize()
                                                }, { ref_for: true }, item.avatar, {
                                                  class: ui.value.itemLeadingAvatar({ class: [props.ui?.itemLeadingAvatar, item.ui?.itemLeadingAvatar], active: active || item.active })
                                                }), null, 16, ["size", "class"])) : item.chip ? (openBlock(), createBlock(_sfc_main$d$1, mergeProps({
                                                  key: 3,
                                                  size: item.ui?.itemLeadingChipSize || props.ui?.itemLeadingChipSize || ui.value.itemLeadingChipSize(),
                                                  inset: "",
                                                  standalone: ""
                                                }, { ref_for: true }, item.chip, {
                                                  class: ui.value.itemLeadingChip({ class: [props.ui?.itemLeadingChip, item.ui?.itemLeadingChip], active: active || item.active })
                                                }), null, 16, ["size", "class"])) : createCommentVNode("", true)
                                              ]),
                                              item.labelHtml || unref(get)(item, props.labelKey) || !!slots[item.slot ? `${item.slot}-label` : group.slot ? `${group.slot}-label` : `item-label`] ? (openBlock(), createBlock("span", {
                                                key: 0,
                                                class: ui.value.itemLabel({ class: [props.ui?.itemLabel, item.ui?.itemLabel], active: active || item.active })
                                              }, [
                                                renderSlot(_ctx.$slots, item.slot ? `${item.slot}-label` : group.slot ? `${group.slot}-label` : `item-label`, {
                                                  item,
                                                  index
                                                }, () => [
                                                  item.prefix ? (openBlock(), createBlock("span", {
                                                    key: 0,
                                                    class: ui.value.itemLabelPrefix({ class: [props.ui?.itemLabelPrefix, item.ui?.itemLabelPrefix] })
                                                  }, toDisplayString(item.prefix), 3)) : createCommentVNode("", true),
                                                  createVNode("span", {
                                                    class: ui.value.itemLabelBase({ class: [props.ui?.itemLabelBase, item.ui?.itemLabelBase], active: active || item.active }),
                                                    innerHTML: item.labelHtml || unref(get)(item, props.labelKey)
                                                  }, null, 10, ["innerHTML"]),
                                                  createVNode("span", {
                                                    class: ui.value.itemLabelSuffix({ class: [props.ui?.itemLabelSuffix, item.ui?.itemLabelSuffix], active: active || item.active }),
                                                    innerHTML: item.suffixHtml || item.suffix
                                                  }, null, 10, ["innerHTML"])
                                                ])
                                              ], 2)) : createCommentVNode("", true),
                                              createVNode("span", {
                                                class: ui.value.itemTrailing({ class: [props.ui?.itemTrailing, item.ui?.itemTrailing] })
                                              }, [
                                                renderSlot(_ctx.$slots, item.slot ? `${item.slot}-trailing` : group.slot ? `${group.slot}-trailing` : `item-trailing`, {
                                                  item,
                                                  index
                                                }, () => [
                                                  item.children && item.children.length > 0 ? (openBlock(), createBlock(_sfc_main$e$1, {
                                                    key: 0,
                                                    name: __props.trailingIcon || unref(appConfig).ui.icons.chevronRight,
                                                    class: ui.value.itemTrailingIcon({ class: [props.ui?.itemTrailingIcon, item.ui?.itemTrailingIcon] })
                                                  }, null, 8, ["name", "class"])) : item.kbds?.length ? (openBlock(), createBlock("span", {
                                                    key: 1,
                                                    class: ui.value.itemTrailingKbds({ class: [props.ui?.itemTrailingKbds, item.ui?.itemTrailingKbds] })
                                                  }, [
                                                    (openBlock(true), createBlock(Fragment, null, renderList(item.kbds, (kbd, kbdIndex) => {
                                                      return openBlock(), createBlock(_sfc_main$e, mergeProps({
                                                        key: kbdIndex,
                                                        size: item.ui?.itemTrailingKbdsSize || props.ui?.itemTrailingKbdsSize || ui.value.itemTrailingKbdsSize()
                                                      }, { ref_for: true }, typeof kbd === "string" ? { value: kbd } : kbd), null, 16, ["size"]);
                                                    }), 128))
                                                  ], 2)) : group.highlightedIcon ? (openBlock(), createBlock(_sfc_main$e$1, {
                                                    key: 2,
                                                    name: group.highlightedIcon,
                                                    class: ui.value.itemTrailingHighlightedIcon({ class: [props.ui?.itemTrailingHighlightedIcon, item.ui?.itemTrailingHighlightedIcon] })
                                                  }, null, 8, ["name", "class"])) : createCommentVNode("", true)
                                                ]),
                                                !item.children?.length ? (openBlock(), createBlock(unref(ListboxItemIndicator), {
                                                  key: 0,
                                                  "as-child": ""
                                                }, {
                                                  default: withCtx(() => [
                                                    createVNode(_sfc_main$e$1, {
                                                      name: __props.selectedIcon || unref(appConfig).ui.icons.check,
                                                      class: ui.value.itemTrailingIcon({ class: [props.ui?.itemTrailingIcon, item.ui?.itemTrailingIcon] })
                                                    }, null, 8, ["name", "class"])
                                                  ]),
                                                  _: 2
                                                }, 1024)) : createCommentVNode("", true)
                                              ], 2)
                                            ])
                                          ]),
                                          _: 2
                                        }, 1040, ["class"])
                                      ]),
                                      _: 2
                                    }, 1040)
                                  ]),
                                  _: 2
                                }, 1032, ["value", "disabled", "onSelect"]);
                              }), 128))
                            ];
                          }
                        }),
                        _: 2
                      }, _parent3, _scopeId2));
                    });
                    _push3(`<!--]--></div>`);
                  } else {
                    _push3(`<div class="${ssrRenderClass(ui.value.empty({ class: props.ui?.empty }))}"${_scopeId2}>`);
                    ssrRenderSlot(_ctx.$slots, "empty", { searchTerm: searchTerm.value }, () => {
                      _push3(`${ssrInterpolate(searchTerm.value ? unref(t)("commandPalette.noMatch", { searchTerm: searchTerm.value }) : unref(t)("commandPalette.noData"))}`);
                    }, _push3, _parent3, _scopeId2);
                    _push3(`</div>`);
                  }
                } else {
                  return [
                    filteredGroups.value?.length ? (openBlock(), createBlock("div", {
                      key: 0,
                      role: "presentation",
                      class: ui.value.viewport({ class: props.ui?.viewport })
                    }, [
                      (openBlock(true), createBlock(Fragment, null, renderList(filteredGroups.value, (group) => {
                        return openBlock(), createBlock(unref(ListboxGroup), {
                          key: `group-${group.id}`,
                          class: ui.value.group({ class: props.ui?.group })
                        }, {
                          default: withCtx(() => [
                            unref(get)(group, props.labelKey) ? (openBlock(), createBlock(unref(ListboxGroupLabel), {
                              key: 0,
                              class: ui.value.label({ class: props.ui?.label })
                            }, {
                              default: withCtx(() => [
                                createTextVNode(toDisplayString(unref(get)(group, props.labelKey)), 1)
                              ]),
                              _: 2
                            }, 1032, ["class"])) : createCommentVNode("", true),
                            (openBlock(true), createBlock(Fragment, null, renderList(group.items, (item, index) => {
                              return openBlock(), createBlock(unref(ListboxItem), {
                                key: `group-${group.id}-${index}`,
                                value: unref(omit)(item, ["matches", "group", "onSelect", "labelHtml", "suffixHtml", "children"]),
                                disabled: item.disabled,
                                "as-child": "",
                                onSelect: ($event) => onSelect($event, item)
                              }, {
                                default: withCtx(() => [
                                  createVNode(_sfc_main$a$1, mergeProps({ ref_for: true }, unref(pickLinkProps)(item), { custom: "" }), {
                                    default: withCtx(({ active, ...slotProps }) => [
                                      createVNode(_sfc_main$b$1, mergeProps({ ref_for: true }, slotProps, {
                                        class: ui.value.item({ class: [props.ui?.item, item.ui?.item, item.class], active: active || item.active })
                                      }), {
                                        default: withCtx(() => [
                                          renderSlot(_ctx.$slots, item.slot || group.slot || "item", {
                                            item,
                                            index
                                          }, () => [
                                            renderSlot(_ctx.$slots, item.slot ? `${item.slot}-leading` : group.slot ? `${group.slot}-leading` : `item-leading`, {
                                              item,
                                              index
                                            }, () => [
                                              item.loading ? (openBlock(), createBlock(_sfc_main$e$1, {
                                                key: 0,
                                                name: __props.loadingIcon || unref(appConfig).ui.icons.loading,
                                                class: ui.value.itemLeadingIcon({ class: [props.ui?.itemLeadingIcon, item.ui?.itemLeadingIcon], loading: true })
                                              }, null, 8, ["name", "class"])) : item.icon ? (openBlock(), createBlock(_sfc_main$e$1, {
                                                key: 1,
                                                name: item.icon,
                                                class: ui.value.itemLeadingIcon({ class: [props.ui?.itemLeadingIcon, item.ui?.itemLeadingIcon], active: active || item.active })
                                              }, null, 8, ["name", "class"])) : item.avatar ? (openBlock(), createBlock(_sfc_main$c$1, mergeProps({
                                                key: 2,
                                                size: item.ui?.itemLeadingAvatarSize || props.ui?.itemLeadingAvatarSize || ui.value.itemLeadingAvatarSize()
                                              }, { ref_for: true }, item.avatar, {
                                                class: ui.value.itemLeadingAvatar({ class: [props.ui?.itemLeadingAvatar, item.ui?.itemLeadingAvatar], active: active || item.active })
                                              }), null, 16, ["size", "class"])) : item.chip ? (openBlock(), createBlock(_sfc_main$d$1, mergeProps({
                                                key: 3,
                                                size: item.ui?.itemLeadingChipSize || props.ui?.itemLeadingChipSize || ui.value.itemLeadingChipSize(),
                                                inset: "",
                                                standalone: ""
                                              }, { ref_for: true }, item.chip, {
                                                class: ui.value.itemLeadingChip({ class: [props.ui?.itemLeadingChip, item.ui?.itemLeadingChip], active: active || item.active })
                                              }), null, 16, ["size", "class"])) : createCommentVNode("", true)
                                            ]),
                                            item.labelHtml || unref(get)(item, props.labelKey) || !!slots[item.slot ? `${item.slot}-label` : group.slot ? `${group.slot}-label` : `item-label`] ? (openBlock(), createBlock("span", {
                                              key: 0,
                                              class: ui.value.itemLabel({ class: [props.ui?.itemLabel, item.ui?.itemLabel], active: active || item.active })
                                            }, [
                                              renderSlot(_ctx.$slots, item.slot ? `${item.slot}-label` : group.slot ? `${group.slot}-label` : `item-label`, {
                                                item,
                                                index
                                              }, () => [
                                                item.prefix ? (openBlock(), createBlock("span", {
                                                  key: 0,
                                                  class: ui.value.itemLabelPrefix({ class: [props.ui?.itemLabelPrefix, item.ui?.itemLabelPrefix] })
                                                }, toDisplayString(item.prefix), 3)) : createCommentVNode("", true),
                                                createVNode("span", {
                                                  class: ui.value.itemLabelBase({ class: [props.ui?.itemLabelBase, item.ui?.itemLabelBase], active: active || item.active }),
                                                  innerHTML: item.labelHtml || unref(get)(item, props.labelKey)
                                                }, null, 10, ["innerHTML"]),
                                                createVNode("span", {
                                                  class: ui.value.itemLabelSuffix({ class: [props.ui?.itemLabelSuffix, item.ui?.itemLabelSuffix], active: active || item.active }),
                                                  innerHTML: item.suffixHtml || item.suffix
                                                }, null, 10, ["innerHTML"])
                                              ])
                                            ], 2)) : createCommentVNode("", true),
                                            createVNode("span", {
                                              class: ui.value.itemTrailing({ class: [props.ui?.itemTrailing, item.ui?.itemTrailing] })
                                            }, [
                                              renderSlot(_ctx.$slots, item.slot ? `${item.slot}-trailing` : group.slot ? `${group.slot}-trailing` : `item-trailing`, {
                                                item,
                                                index
                                              }, () => [
                                                item.children && item.children.length > 0 ? (openBlock(), createBlock(_sfc_main$e$1, {
                                                  key: 0,
                                                  name: __props.trailingIcon || unref(appConfig).ui.icons.chevronRight,
                                                  class: ui.value.itemTrailingIcon({ class: [props.ui?.itemTrailingIcon, item.ui?.itemTrailingIcon] })
                                                }, null, 8, ["name", "class"])) : item.kbds?.length ? (openBlock(), createBlock("span", {
                                                  key: 1,
                                                  class: ui.value.itemTrailingKbds({ class: [props.ui?.itemTrailingKbds, item.ui?.itemTrailingKbds] })
                                                }, [
                                                  (openBlock(true), createBlock(Fragment, null, renderList(item.kbds, (kbd, kbdIndex) => {
                                                    return openBlock(), createBlock(_sfc_main$e, mergeProps({
                                                      key: kbdIndex,
                                                      size: item.ui?.itemTrailingKbdsSize || props.ui?.itemTrailingKbdsSize || ui.value.itemTrailingKbdsSize()
                                                    }, { ref_for: true }, typeof kbd === "string" ? { value: kbd } : kbd), null, 16, ["size"]);
                                                  }), 128))
                                                ], 2)) : group.highlightedIcon ? (openBlock(), createBlock(_sfc_main$e$1, {
                                                  key: 2,
                                                  name: group.highlightedIcon,
                                                  class: ui.value.itemTrailingHighlightedIcon({ class: [props.ui?.itemTrailingHighlightedIcon, item.ui?.itemTrailingHighlightedIcon] })
                                                }, null, 8, ["name", "class"])) : createCommentVNode("", true)
                                              ]),
                                              !item.children?.length ? (openBlock(), createBlock(unref(ListboxItemIndicator), {
                                                key: 0,
                                                "as-child": ""
                                              }, {
                                                default: withCtx(() => [
                                                  createVNode(_sfc_main$e$1, {
                                                    name: __props.selectedIcon || unref(appConfig).ui.icons.check,
                                                    class: ui.value.itemTrailingIcon({ class: [props.ui?.itemTrailingIcon, item.ui?.itemTrailingIcon] })
                                                  }, null, 8, ["name", "class"])
                                                ]),
                                                _: 2
                                              }, 1024)) : createCommentVNode("", true)
                                            ], 2)
                                          ])
                                        ]),
                                        _: 2
                                      }, 1040, ["class"])
                                    ]),
                                    _: 2
                                  }, 1040)
                                ]),
                                _: 2
                              }, 1032, ["value", "disabled", "onSelect"]);
                            }), 128))
                          ]),
                          _: 2
                        }, 1032, ["class"]);
                      }), 128))
                    ], 2)) : (openBlock(), createBlock("div", {
                      key: 1,
                      class: ui.value.empty({ class: props.ui?.empty })
                    }, [
                      renderSlot(_ctx.$slots, "empty", { searchTerm: searchTerm.value }, () => [
                        createTextVNode(toDisplayString(searchTerm.value ? unref(t)("commandPalette.noMatch", { searchTerm: searchTerm.value }) : unref(t)("commandPalette.noData")), 1)
                      ])
                    ], 2))
                  ];
                }
              }),
              _: 3
            }, _parent2, _scopeId));
            if (!!slots.footer) {
              _push2(`<div class="${ssrRenderClass(ui.value.footer({ class: props.ui?.footer }))}"${_scopeId}>`);
              ssrRenderSlot(_ctx.$slots, "footer", { ui: ui.value }, null, _push2, _parent2, _scopeId);
              _push2(`</div>`);
            } else {
              _push2(`<!---->`);
            }
          } else {
            return [
              createVNode(unref(ListboxFilter), {
                modelValue: searchTerm.value,
                "onUpdate:modelValue": ($event) => searchTerm.value = $event,
                "as-child": ""
              }, {
                default: withCtx(() => [
                  createVNode(_sfc_main$h, mergeProps({
                    placeholder: placeholder.value,
                    variant: "none",
                    autofocus: __props.autofocus
                  }, unref(inputProps), {
                    "loading-icon": __props.loadingIcon,
                    icon: __props.icon || unref(appConfig).ui.icons.search,
                    class: ui.value.input({ class: props.ui?.input }),
                    onKeydown: withKeys(onBackspace, ["backspace"])
                  }), createSlots({ _: 2 }, [
                    history.value?.length && (__props.back || !!slots.back) ? {
                      name: "leading",
                      fn: withCtx(() => [
                        renderSlot(_ctx.$slots, "back", { ui: ui.value }, () => [
                          createVNode(_sfc_main$9$1, mergeProps({
                            icon: __props.backIcon || unref(appConfig).ui.icons.arrowLeft,
                            color: "neutral",
                            variant: "link",
                            "aria-label": unref(t)("commandPalette.back")
                          }, typeof __props.back === "object" ? __props.back : {}, {
                            class: ui.value.back({ class: props.ui?.back }),
                            onClick: navigateBack
                          }), null, 16, ["icon", "aria-label", "class"])
                        ])
                      ]),
                      key: "0"
                    } : void 0,
                    __props.close || !!slots.close ? {
                      name: "trailing",
                      fn: withCtx(() => [
                        renderSlot(_ctx.$slots, "close", { ui: ui.value }, () => [
                          __props.close ? (openBlock(), createBlock(_sfc_main$9$1, mergeProps({
                            key: 0,
                            icon: __props.closeIcon || unref(appConfig).ui.icons.close,
                            color: "neutral",
                            variant: "ghost",
                            "aria-label": unref(t)("commandPalette.close")
                          }, typeof __props.close === "object" ? __props.close : {}, {
                            class: ui.value.close({ class: props.ui?.close }),
                            onClick: ($event) => emits("update:open", false)
                          }), null, 16, ["icon", "aria-label", "class", "onClick"])) : createCommentVNode("", true)
                        ])
                      ]),
                      key: "1"
                    } : void 0
                  ]), 1040, ["placeholder", "autofocus", "loading-icon", "icon", "class"])
                ]),
                _: 3
              }, 8, ["modelValue", "onUpdate:modelValue"]),
              createVNode(unref(ListboxContent), {
                class: ui.value.content({ class: props.ui?.content })
              }, {
                default: withCtx(() => [
                  filteredGroups.value?.length ? (openBlock(), createBlock("div", {
                    key: 0,
                    role: "presentation",
                    class: ui.value.viewport({ class: props.ui?.viewport })
                  }, [
                    (openBlock(true), createBlock(Fragment, null, renderList(filteredGroups.value, (group) => {
                      return openBlock(), createBlock(unref(ListboxGroup), {
                        key: `group-${group.id}`,
                        class: ui.value.group({ class: props.ui?.group })
                      }, {
                        default: withCtx(() => [
                          unref(get)(group, props.labelKey) ? (openBlock(), createBlock(unref(ListboxGroupLabel), {
                            key: 0,
                            class: ui.value.label({ class: props.ui?.label })
                          }, {
                            default: withCtx(() => [
                              createTextVNode(toDisplayString(unref(get)(group, props.labelKey)), 1)
                            ]),
                            _: 2
                          }, 1032, ["class"])) : createCommentVNode("", true),
                          (openBlock(true), createBlock(Fragment, null, renderList(group.items, (item, index) => {
                            return openBlock(), createBlock(unref(ListboxItem), {
                              key: `group-${group.id}-${index}`,
                              value: unref(omit)(item, ["matches", "group", "onSelect", "labelHtml", "suffixHtml", "children"]),
                              disabled: item.disabled,
                              "as-child": "",
                              onSelect: ($event) => onSelect($event, item)
                            }, {
                              default: withCtx(() => [
                                createVNode(_sfc_main$a$1, mergeProps({ ref_for: true }, unref(pickLinkProps)(item), { custom: "" }), {
                                  default: withCtx(({ active, ...slotProps }) => [
                                    createVNode(_sfc_main$b$1, mergeProps({ ref_for: true }, slotProps, {
                                      class: ui.value.item({ class: [props.ui?.item, item.ui?.item, item.class], active: active || item.active })
                                    }), {
                                      default: withCtx(() => [
                                        renderSlot(_ctx.$slots, item.slot || group.slot || "item", {
                                          item,
                                          index
                                        }, () => [
                                          renderSlot(_ctx.$slots, item.slot ? `${item.slot}-leading` : group.slot ? `${group.slot}-leading` : `item-leading`, {
                                            item,
                                            index
                                          }, () => [
                                            item.loading ? (openBlock(), createBlock(_sfc_main$e$1, {
                                              key: 0,
                                              name: __props.loadingIcon || unref(appConfig).ui.icons.loading,
                                              class: ui.value.itemLeadingIcon({ class: [props.ui?.itemLeadingIcon, item.ui?.itemLeadingIcon], loading: true })
                                            }, null, 8, ["name", "class"])) : item.icon ? (openBlock(), createBlock(_sfc_main$e$1, {
                                              key: 1,
                                              name: item.icon,
                                              class: ui.value.itemLeadingIcon({ class: [props.ui?.itemLeadingIcon, item.ui?.itemLeadingIcon], active: active || item.active })
                                            }, null, 8, ["name", "class"])) : item.avatar ? (openBlock(), createBlock(_sfc_main$c$1, mergeProps({
                                              key: 2,
                                              size: item.ui?.itemLeadingAvatarSize || props.ui?.itemLeadingAvatarSize || ui.value.itemLeadingAvatarSize()
                                            }, { ref_for: true }, item.avatar, {
                                              class: ui.value.itemLeadingAvatar({ class: [props.ui?.itemLeadingAvatar, item.ui?.itemLeadingAvatar], active: active || item.active })
                                            }), null, 16, ["size", "class"])) : item.chip ? (openBlock(), createBlock(_sfc_main$d$1, mergeProps({
                                              key: 3,
                                              size: item.ui?.itemLeadingChipSize || props.ui?.itemLeadingChipSize || ui.value.itemLeadingChipSize(),
                                              inset: "",
                                              standalone: ""
                                            }, { ref_for: true }, item.chip, {
                                              class: ui.value.itemLeadingChip({ class: [props.ui?.itemLeadingChip, item.ui?.itemLeadingChip], active: active || item.active })
                                            }), null, 16, ["size", "class"])) : createCommentVNode("", true)
                                          ]),
                                          item.labelHtml || unref(get)(item, props.labelKey) || !!slots[item.slot ? `${item.slot}-label` : group.slot ? `${group.slot}-label` : `item-label`] ? (openBlock(), createBlock("span", {
                                            key: 0,
                                            class: ui.value.itemLabel({ class: [props.ui?.itemLabel, item.ui?.itemLabel], active: active || item.active })
                                          }, [
                                            renderSlot(_ctx.$slots, item.slot ? `${item.slot}-label` : group.slot ? `${group.slot}-label` : `item-label`, {
                                              item,
                                              index
                                            }, () => [
                                              item.prefix ? (openBlock(), createBlock("span", {
                                                key: 0,
                                                class: ui.value.itemLabelPrefix({ class: [props.ui?.itemLabelPrefix, item.ui?.itemLabelPrefix] })
                                              }, toDisplayString(item.prefix), 3)) : createCommentVNode("", true),
                                              createVNode("span", {
                                                class: ui.value.itemLabelBase({ class: [props.ui?.itemLabelBase, item.ui?.itemLabelBase], active: active || item.active }),
                                                innerHTML: item.labelHtml || unref(get)(item, props.labelKey)
                                              }, null, 10, ["innerHTML"]),
                                              createVNode("span", {
                                                class: ui.value.itemLabelSuffix({ class: [props.ui?.itemLabelSuffix, item.ui?.itemLabelSuffix], active: active || item.active }),
                                                innerHTML: item.suffixHtml || item.suffix
                                              }, null, 10, ["innerHTML"])
                                            ])
                                          ], 2)) : createCommentVNode("", true),
                                          createVNode("span", {
                                            class: ui.value.itemTrailing({ class: [props.ui?.itemTrailing, item.ui?.itemTrailing] })
                                          }, [
                                            renderSlot(_ctx.$slots, item.slot ? `${item.slot}-trailing` : group.slot ? `${group.slot}-trailing` : `item-trailing`, {
                                              item,
                                              index
                                            }, () => [
                                              item.children && item.children.length > 0 ? (openBlock(), createBlock(_sfc_main$e$1, {
                                                key: 0,
                                                name: __props.trailingIcon || unref(appConfig).ui.icons.chevronRight,
                                                class: ui.value.itemTrailingIcon({ class: [props.ui?.itemTrailingIcon, item.ui?.itemTrailingIcon] })
                                              }, null, 8, ["name", "class"])) : item.kbds?.length ? (openBlock(), createBlock("span", {
                                                key: 1,
                                                class: ui.value.itemTrailingKbds({ class: [props.ui?.itemTrailingKbds, item.ui?.itemTrailingKbds] })
                                              }, [
                                                (openBlock(true), createBlock(Fragment, null, renderList(item.kbds, (kbd, kbdIndex) => {
                                                  return openBlock(), createBlock(_sfc_main$e, mergeProps({
                                                    key: kbdIndex,
                                                    size: item.ui?.itemTrailingKbdsSize || props.ui?.itemTrailingKbdsSize || ui.value.itemTrailingKbdsSize()
                                                  }, { ref_for: true }, typeof kbd === "string" ? { value: kbd } : kbd), null, 16, ["size"]);
                                                }), 128))
                                              ], 2)) : group.highlightedIcon ? (openBlock(), createBlock(_sfc_main$e$1, {
                                                key: 2,
                                                name: group.highlightedIcon,
                                                class: ui.value.itemTrailingHighlightedIcon({ class: [props.ui?.itemTrailingHighlightedIcon, item.ui?.itemTrailingHighlightedIcon] })
                                              }, null, 8, ["name", "class"])) : createCommentVNode("", true)
                                            ]),
                                            !item.children?.length ? (openBlock(), createBlock(unref(ListboxItemIndicator), {
                                              key: 0,
                                              "as-child": ""
                                            }, {
                                              default: withCtx(() => [
                                                createVNode(_sfc_main$e$1, {
                                                  name: __props.selectedIcon || unref(appConfig).ui.icons.check,
                                                  class: ui.value.itemTrailingIcon({ class: [props.ui?.itemTrailingIcon, item.ui?.itemTrailingIcon] })
                                                }, null, 8, ["name", "class"])
                                              ]),
                                              _: 2
                                            }, 1024)) : createCommentVNode("", true)
                                          ], 2)
                                        ])
                                      ]),
                                      _: 2
                                    }, 1040, ["class"])
                                  ]),
                                  _: 2
                                }, 1040)
                              ]),
                              _: 2
                            }, 1032, ["value", "disabled", "onSelect"]);
                          }), 128))
                        ]),
                        _: 2
                      }, 1032, ["class"]);
                    }), 128))
                  ], 2)) : (openBlock(), createBlock("div", {
                    key: 1,
                    class: ui.value.empty({ class: props.ui?.empty })
                  }, [
                    renderSlot(_ctx.$slots, "empty", { searchTerm: searchTerm.value }, () => [
                      createTextVNode(toDisplayString(searchTerm.value ? unref(t)("commandPalette.noMatch", { searchTerm: searchTerm.value }) : unref(t)("commandPalette.noData")), 1)
                    ])
                  ], 2))
                ]),
                _: 3
              }, 8, ["class"]),
              !!slots.footer ? (openBlock(), createBlock("div", {
                key: 0,
                class: ui.value.footer({ class: props.ui?.footer })
              }, [
                renderSlot(_ctx.$slots, "footer", { ui: ui.value })
              ], 2)) : createCommentVNode("", true)
            ];
          }
        }),
        _: 3
      }, _parent));
    };
  }
};
const _sfc_setup$3 = _sfc_main$3.setup;
_sfc_main$3.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("../node_modules/.pnpm/@nuxt+ui@4.0.0-alpha.2_@babel+parser@7.28.0_@netlify+blobs@9.1.2_change-case@5.4.4_db0@_b85612ac9055e711c0cdf49df3463bec/node_modules/@nuxt/ui/dist/runtime/components/CommandPalette.vue");
  return _sfc_setup$3 ? _sfc_setup$3(props, ctx) : void 0;
};
const theme = {
  "slots": {
    "modal": "sm:max-w-3xl sm:h-[28rem]",
    "input": "[&>input]:text-base/5"
  }
};
const _sfc_main$2 = {
  __name: "UDashboardSearch",
  __ssrInlineRender: true,
  props: /* @__PURE__ */ mergeModels({
    icon: { type: [String, Object], required: false },
    placeholder: { type: String, required: false },
    autofocus: { type: Boolean, required: false },
    loading: { type: Boolean, required: false },
    loadingIcon: { type: [String, Object], required: false },
    close: { type: [Boolean, Object], required: false, default: true },
    closeIcon: { type: [String, Object], required: false },
    shortcut: { type: String, required: false, default: "meta_k" },
    groups: { type: Array, required: false },
    fuse: { type: Object, required: false },
    colorMode: { type: Boolean, required: false, default: true },
    class: { type: null, required: false },
    ui: { type: void 0, required: false }
  }, {
    "open": { type: Boolean, ...{ default: false } },
    "openModifiers": {},
    "searchTerm": { type: String, ...{ default: "" } },
    "searchTermModifiers": {}
  }),
  emits: ["update:open", "update:searchTerm"],
  setup(__props, { expose: __expose }) {
    const props = __props;
    const slots = useSlots();
    const open = useModel(__props, "open", { type: Boolean, ...{ default: false } });
    const searchTerm = useModel(__props, "searchTerm", { type: String, ...{ default: "" } });
    useRuntimeHook("dashboard:search:toggle", () => {
      open.value = !open.value;
    });
    const { t } = useLocale();
    const colorMode = useColorMode();
    const appConfig = useAppConfig();
    const commandPaletteProps = useForwardProps(reactivePick(props, "icon", "placeholder", "autofocus", "loading", "loadingIcon", "close", "closeIcon"));
    const getProxySlots = () => omit(slots, ["content"]);
    const fuse = computed(() => defu({}, props.fuse, {
      fuseOptions: {}
    }));
    const ui = computed(() => tv({ extend: tv(theme), ...appConfig.ui?.dashboardSearch || {} })());
    const groups = computed(() => {
      const groups2 = [];
      groups2.push(...props.groups || []);
      if (props.colorMode && !colorMode?.forced) {
        groups2.push({
          id: "theme",
          label: t("dashboardSearch.theme"),
          items: [{
            label: t("colorMode.system"),
            icon: appConfig.ui.icons.system,
            active: colorMode.preference === "system",
            onSelect: () => {
              colorMode.preference = "system";
            }
          }, {
            label: t("colorMode.light"),
            icon: appConfig.ui.icons.light,
            active: colorMode.preference === "light",
            onSelect: () => {
              colorMode.preference = "light";
            }
          }, {
            label: t("colorMode.dark"),
            icon: appConfig.ui.icons.dark,
            active: colorMode.preference === "dark",
            onSelect: () => {
              colorMode.preference = "dark";
            }
          }]
        });
      }
      return groups2;
    });
    function onSelect(item) {
      if (item.disabled) {
        return;
      }
      open.value = false;
      searchTerm.value = "";
    }
    defineShortcuts({
      [props.shortcut]: {
        usingInput: true,
        handler: () => open.value = !open.value
      }
    });
    const commandPaletteRef = useTemplateRef("commandPaletteRef");
    __expose({
      commandPaletteRef
    });
    return (_ctx, _push, _parent, _attrs) => {
      _push(ssrRenderComponent(_sfc_main$c, mergeProps({
        open: open.value,
        "onUpdate:open": ($event) => open.value = $event,
        title: unref(t)("dashboardSearch.title"),
        description: unref(t)("dashboardSearch.description"),
        class: ui.value.modal({ class: [props.ui?.modal, props.class] })
      }, _attrs), {
        content: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            ssrRenderSlot(_ctx.$slots, "content", {}, () => {
              _push2(ssrRenderComponent(_sfc_main$3, mergeProps({
                ref_key: "commandPaletteRef",
                ref: commandPaletteRef,
                "search-term": searchTerm.value,
                "onUpdate:searchTerm": ($event) => searchTerm.value = $event
              }, unref(commandPaletteProps), {
                groups: groups.value,
                fuse: fuse.value,
                ui: unref(transformUI)(unref(omit)(ui.value, ["modal"]), props.ui),
                "onUpdate:modelValue": onSelect,
                "onUpdate:open": ($event) => open.value = $event
              }), createSlots({ _: 2 }, [
                renderList(getProxySlots(), (_2, name) => {
                  return {
                    name,
                    fn: withCtx((slotData, _push3, _parent3, _scopeId2) => {
                      if (_push3) {
                        ssrRenderSlot(_ctx.$slots, name, slotData, null, _push3, _parent3, _scopeId2);
                      } else {
                        return [
                          renderSlot(_ctx.$slots, name, slotData)
                        ];
                      }
                    })
                  };
                })
              ]), _parent2, _scopeId));
            }, _push2, _parent2, _scopeId);
          } else {
            return [
              renderSlot(_ctx.$slots, "content", {}, () => [
                createVNode(_sfc_main$3, mergeProps({
                  ref_key: "commandPaletteRef",
                  ref: commandPaletteRef,
                  "search-term": searchTerm.value,
                  "onUpdate:searchTerm": ($event) => searchTerm.value = $event
                }, unref(commandPaletteProps), {
                  groups: groups.value,
                  fuse: fuse.value,
                  ui: unref(transformUI)(unref(omit)(ui.value, ["modal"]), props.ui),
                  "onUpdate:modelValue": onSelect,
                  "onUpdate:open": ($event) => open.value = $event
                }), createSlots({ _: 2 }, [
                  renderList(getProxySlots(), (_2, name) => {
                    return {
                      name,
                      fn: withCtx((slotData) => [
                        renderSlot(_ctx.$slots, name, slotData)
                      ])
                    };
                  })
                ]), 1040, ["search-term", "onUpdate:searchTerm", "groups", "fuse", "ui", "onUpdate:open"])
              ])
            ];
          }
        }),
        _: 3
      }, _parent));
    };
  }
};
const _sfc_setup$2 = _sfc_main$2.setup;
_sfc_main$2.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("../node_modules/.pnpm/@nuxt+ui@4.0.0-alpha.2_@babel+parser@7.28.0_@netlify+blobs@9.1.2_change-case@5.4.4_db0@_b85612ac9055e711c0cdf49df3463bec/node_modules/@nuxt/ui/dist/runtime/components/DashboardSearch.vue");
  return _sfc_setup$2 ? _sfc_setup$2(props, ctx) : void 0;
};
const _sfc_main$1 = /* @__PURE__ */ defineComponent({
  __name: "NotificationsSlideover",
  __ssrInlineRender: true,
  async setup(__props) {
    let __temp, __restore;
    const { isNotificationsSlideoverOpen } = useDashboard$1();
    const { data: notifications } = ([__temp, __restore] = withAsyncContext(() => useFetch("/api/notifications", "$MBnYHJXT6o")), __temp = await __temp, __restore(), __temp);
    return (_ctx, _push, _parent, _attrs) => {
      const _component_USlideover = _sfc_main$9;
      const _component_NuxtLink = __nuxt_component_1$1;
      const _component_UChip = _sfc_main$d$1;
      const _component_UAvatar = _sfc_main$c$1;
      _push(ssrRenderComponent(_component_USlideover, mergeProps({
        open: unref(isNotificationsSlideoverOpen),
        "onUpdate:open": ($event) => isRef(isNotificationsSlideoverOpen) ? isNotificationsSlideoverOpen.value = $event : null,
        title: "Notifications"
      }, _attrs), {
        body: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            _push2(`<!--[-->`);
            ssrRenderList(unref(notifications), (notification) => {
              _push2(ssrRenderComponent(_component_NuxtLink, {
                key: notification.id,
                to: `/inbox?id=${notification.id}`,
                class: "px-3 py-2.5 rounded-md hover:bg-elevated/50 flex items-center gap-3 relative -mx-3 first:-mt-3 last:-mb-3"
              }, {
                default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                  if (_push3) {
                    _push3(ssrRenderComponent(_component_UChip, {
                      color: "error",
                      show: !!notification.unread,
                      inset: ""
                    }, {
                      default: withCtx((_3, _push4, _parent4, _scopeId3) => {
                        if (_push4) {
                          _push4(ssrRenderComponent(_component_UAvatar, mergeProps({ ref_for: true }, notification.sender.avatar, {
                            alt: notification.sender.name,
                            size: "md"
                          }), null, _parent4, _scopeId3));
                        } else {
                          return [
                            createVNode(_component_UAvatar, mergeProps({ ref_for: true }, notification.sender.avatar, {
                              alt: notification.sender.name,
                              size: "md"
                            }), null, 16, ["alt"])
                          ];
                        }
                      }),
                      _: 2
                    }, _parent3, _scopeId2));
                    _push3(`<div class="text-sm flex-1"${_scopeId2}><p class="flex items-center justify-between"${_scopeId2}><span class="text-highlighted font-medium"${_scopeId2}>${ssrInterpolate(notification.sender.name)}</span><time${ssrRenderAttr("datetime", notification.date)} class="text-muted text-xs"${_scopeId2}>${ssrInterpolate(unref(formatTimeAgo)(new Date(notification.date)))}</time></p><p class="text-dimmed"${_scopeId2}>${ssrInterpolate(notification.body)}</p></div>`);
                  } else {
                    return [
                      createVNode(_component_UChip, {
                        color: "error",
                        show: !!notification.unread,
                        inset: ""
                      }, {
                        default: withCtx(() => [
                          createVNode(_component_UAvatar, mergeProps({ ref_for: true }, notification.sender.avatar, {
                            alt: notification.sender.name,
                            size: "md"
                          }), null, 16, ["alt"])
                        ]),
                        _: 2
                      }, 1032, ["show"]),
                      createVNode("div", { class: "text-sm flex-1" }, [
                        createVNode("p", { class: "flex items-center justify-between" }, [
                          createVNode("span", { class: "text-highlighted font-medium" }, toDisplayString(notification.sender.name), 1),
                          createVNode("time", {
                            datetime: notification.date,
                            class: "text-muted text-xs",
                            textContent: toDisplayString(unref(formatTimeAgo)(new Date(notification.date)))
                          }, null, 8, ["datetime", "textContent"])
                        ]),
                        createVNode("p", { class: "text-dimmed" }, toDisplayString(notification.body), 1)
                      ])
                    ];
                  }
                }),
                _: 2
              }, _parent2, _scopeId));
            });
            _push2(`<!--]-->`);
          } else {
            return [
              (openBlock(true), createBlock(Fragment, null, renderList(unref(notifications), (notification) => {
                return openBlock(), createBlock(_component_NuxtLink, {
                  key: notification.id,
                  to: `/inbox?id=${notification.id}`,
                  class: "px-3 py-2.5 rounded-md hover:bg-elevated/50 flex items-center gap-3 relative -mx-3 first:-mt-3 last:-mb-3"
                }, {
                  default: withCtx(() => [
                    createVNode(_component_UChip, {
                      color: "error",
                      show: !!notification.unread,
                      inset: ""
                    }, {
                      default: withCtx(() => [
                        createVNode(_component_UAvatar, mergeProps({ ref_for: true }, notification.sender.avatar, {
                          alt: notification.sender.name,
                          size: "md"
                        }), null, 16, ["alt"])
                      ]),
                      _: 2
                    }, 1032, ["show"]),
                    createVNode("div", { class: "text-sm flex-1" }, [
                      createVNode("p", { class: "flex items-center justify-between" }, [
                        createVNode("span", { class: "text-highlighted font-medium" }, toDisplayString(notification.sender.name), 1),
                        createVNode("time", {
                          datetime: notification.date,
                          class: "text-muted text-xs",
                          textContent: toDisplayString(unref(formatTimeAgo)(new Date(notification.date)))
                        }, null, 8, ["datetime", "textContent"])
                      ]),
                      createVNode("p", { class: "text-dimmed" }, toDisplayString(notification.body), 1)
                    ])
                  ]),
                  _: 2
                }, 1032, ["to"]);
              }), 128))
            ];
          }
        }),
        _: 1
      }, _parent));
    };
  }
});
const _sfc_setup$1 = _sfc_main$1.setup;
_sfc_main$1.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("components/NotificationsSlideover.vue");
  return _sfc_setup$1 ? _sfc_setup$1(props, ctx) : void 0;
};
const __nuxt_component_7 = Object.assign(_sfc_main$1, { __name: "NotificationsSlideover" });
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "default",
  __ssrInlineRender: true,
  setup(__props) {
    const route = useRoute();
    useToast();
    const open = ref(false);
    const links = [[{
      label: "Home",
      icon: "i-lucide-house",
      to: "/",
      onSelect: () => {
        open.value = false;
      }
    }, {
      label: "Inbox",
      icon: "i-lucide-inbox",
      to: "/inbox",
      badge: "4",
      onSelect: () => {
        open.value = false;
      }
    }, {
      label: "Customers",
      icon: "i-lucide-users",
      to: "/customers",
      onSelect: () => {
        open.value = false;
      }
    }, {
      label: "Reports",
      icon: "i-lucide-file-text",
      to: "/reports",
      onSelect: () => {
        open.value = false;
      }
    }, {
      label: "Invoices",
      icon: "i-lucide-receipt",
      to: "/invoices",
      onSelect: () => {
        open.value = false;
      }
    }, {
      label: "Expenses",
      icon: "i-lucide-wallet",
      to: "/expenses",
      onSelect: () => {
        open.value = false;
      }
    }, {
      label: "Cash Flow",
      icon: "i-lucide-trending-up",
      to: "/cashflow",
      onSelect: () => {
        open.value = false;
      }
    }, {
      label: "Insights",
      icon: "i-lucide-lightbulb",
      to: "/insights",
      onSelect: () => {
        open.value = false;
      }
    }, {
      label: "Anomalies",
      icon: "i-lucide-alert-triangle",
      to: "/anomalies",
      onSelect: () => {
        open.value = false;
      }
    }, {
      label: "Recommendations",
      icon: "i-lucide-clipboard-check",
      to: "/recommendations",
      onSelect: () => {
        open.value = false;
      }
    }, {
      label: "Chat",
      icon: "i-lucide-message-circle",
      to: "/chat",
      onSelect: () => {
        open.value = false;
      }
    }, {
      label: "Settings",
      to: "/settings",
      icon: "i-lucide-settings",
      defaultOpen: true,
      type: "trigger",
      children: [{
        label: "General",
        to: "/settings",
        exact: true,
        onSelect: () => {
          open.value = false;
        }
      }, {
        label: "Members",
        to: "/settings/members",
        onSelect: () => {
          open.value = false;
        }
      }, {
        label: "Notifications",
        to: "/settings/notifications",
        onSelect: () => {
          open.value = false;
        }
      }, {
        label: "Security",
        to: "/settings/security",
        onSelect: () => {
          open.value = false;
        }
      }]
    }], [{
      label: "Feedback",
      icon: "i-lucide-message-circle",
      to: "https://github.com/nuxt-ui-templates/dashboard",
      target: "_blank"
    }, {
      label: "Help & Support",
      icon: "i-lucide-info",
      to: "https://github.com/nuxt-ui-templates/dashboard",
      target: "_blank"
    }]];
    const groups = computed(() => [{
      id: "links",
      label: "Go to",
      items: links.flat()
    }, {
      id: "code",
      label: "Code",
      items: [{
        id: "source",
        label: "View page source",
        icon: "i-simple-icons-github",
        to: `https://github.com/nuxt-ui-templates/dashboard/blob/main/app/pages${route.path === "/" ? "/index" : route.path}.vue`,
        target: "_blank"
      }]
    }]);
    return (_ctx, _push, _parent, _attrs) => {
      const _component_UDashboardGroup = _sfc_main$a;
      const _component_UDashboardSidebar = _sfc_main$7;
      const _component_TeamsMenu = __nuxt_component_2;
      const _component_UDashboardSearchButton = _sfc_main$5;
      const _component_UNavigationMenu = _sfc_main$b;
      const _component_UserMenu = __nuxt_component_5;
      const _component_UDashboardSearch = _sfc_main$2;
      const _component_NotificationsSlideover = __nuxt_component_7;
      _push(ssrRenderComponent(_component_UDashboardGroup, mergeProps({ unit: "rem" }, _attrs), {
        default: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            _push2(ssrRenderComponent(_component_UDashboardSidebar, {
              id: "default",
              open: unref(open),
              "onUpdate:open": ($event) => isRef(open) ? open.value = $event : null,
              collapsible: "",
              resizable: "",
              class: "bg-elevated/25",
              ui: { footer: "lg:border-t lg:border-default" }
            }, {
              header: withCtx(({ collapsed }, _push3, _parent3, _scopeId2) => {
                if (_push3) {
                  _push3(ssrRenderComponent(_component_TeamsMenu, { collapsed }, null, _parent3, _scopeId2));
                } else {
                  return [
                    createVNode(_component_TeamsMenu, { collapsed }, null, 8, ["collapsed"])
                  ];
                }
              }),
              default: withCtx(({ collapsed }, _push3, _parent3, _scopeId2) => {
                if (_push3) {
                  _push3(ssrRenderComponent(_component_UDashboardSearchButton, {
                    collapsed,
                    class: "bg-transparent ring-default"
                  }, null, _parent3, _scopeId2));
                  _push3(ssrRenderComponent(_component_UNavigationMenu, {
                    collapsed,
                    items: links[0],
                    orientation: "vertical",
                    tooltip: "",
                    popover: ""
                  }, null, _parent3, _scopeId2));
                  _push3(ssrRenderComponent(_component_UNavigationMenu, {
                    collapsed,
                    items: links[1],
                    orientation: "vertical",
                    tooltip: "",
                    class: "mt-auto"
                  }, null, _parent3, _scopeId2));
                } else {
                  return [
                    createVNode(_component_UDashboardSearchButton, {
                      collapsed,
                      class: "bg-transparent ring-default"
                    }, null, 8, ["collapsed"]),
                    createVNode(_component_UNavigationMenu, {
                      collapsed,
                      items: links[0],
                      orientation: "vertical",
                      tooltip: "",
                      popover: ""
                    }, null, 8, ["collapsed", "items"]),
                    createVNode(_component_UNavigationMenu, {
                      collapsed,
                      items: links[1],
                      orientation: "vertical",
                      tooltip: "",
                      class: "mt-auto"
                    }, null, 8, ["collapsed", "items"])
                  ];
                }
              }),
              footer: withCtx(({ collapsed }, _push3, _parent3, _scopeId2) => {
                if (_push3) {
                  _push3(ssrRenderComponent(_component_UserMenu, { collapsed }, null, _parent3, _scopeId2));
                } else {
                  return [
                    createVNode(_component_UserMenu, { collapsed }, null, 8, ["collapsed"])
                  ];
                }
              }),
              _: 1
            }, _parent2, _scopeId));
            _push2(ssrRenderComponent(_component_UDashboardSearch, { groups: unref(groups) }, null, _parent2, _scopeId));
            ssrRenderSlot(_ctx.$slots, "default", {}, null, _push2, _parent2, _scopeId);
            _push2(ssrRenderComponent(_component_NotificationsSlideover, null, null, _parent2, _scopeId));
          } else {
            return [
              createVNode(_component_UDashboardSidebar, {
                id: "default",
                open: unref(open),
                "onUpdate:open": ($event) => isRef(open) ? open.value = $event : null,
                collapsible: "",
                resizable: "",
                class: "bg-elevated/25",
                ui: { footer: "lg:border-t lg:border-default" }
              }, {
                header: withCtx(({ collapsed }) => [
                  createVNode(_component_TeamsMenu, { collapsed }, null, 8, ["collapsed"])
                ]),
                default: withCtx(({ collapsed }) => [
                  createVNode(_component_UDashboardSearchButton, {
                    collapsed,
                    class: "bg-transparent ring-default"
                  }, null, 8, ["collapsed"]),
                  createVNode(_component_UNavigationMenu, {
                    collapsed,
                    items: links[0],
                    orientation: "vertical",
                    tooltip: "",
                    popover: ""
                  }, null, 8, ["collapsed", "items"]),
                  createVNode(_component_UNavigationMenu, {
                    collapsed,
                    items: links[1],
                    orientation: "vertical",
                    tooltip: "",
                    class: "mt-auto"
                  }, null, 8, ["collapsed", "items"])
                ]),
                footer: withCtx(({ collapsed }) => [
                  createVNode(_component_UserMenu, { collapsed }, null, 8, ["collapsed"])
                ]),
                _: 1
              }, 8, ["open", "onUpdate:open"]),
              createVNode(_component_UDashboardSearch, { groups: unref(groups) }, null, 8, ["groups"]),
              renderSlot(_ctx.$slots, "default"),
              createVNode(_component_NotificationsSlideover)
            ];
          }
        }),
        _: 3
      }, _parent));
    };
  }
});
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("layouts/default.vue");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};

export { _sfc_main as default };
//# sourceMappingURL=default-C-VaWthb.mjs.map
