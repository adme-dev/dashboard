import { _ as _sfc_main$1$1, a as _sfc_main$4 } from './DashboardNavbar-Dma8e2D0.mjs';
import { _ as _sfc_main$6 } from './DashboardSidebarCollapse-Bb0ddWxH.mjs';
import { _ as _sfc_main$5 } from './Badge-BfrefdmG.mjs';
import { defineComponent, ref, withAsyncContext, computed, watch, withCtx, createVNode, useSlots, unref, mergeProps, renderSlot, createBlock, createCommentVNode, openBlock, createTextVNode, toDisplayString, Fragment, renderList, mergeModels, useModel, isRef, withModifiers, useSSRContext } from 'vue';
import { ssrRenderComponent, ssrRenderSlot, ssrRenderList, ssrRenderClass, ssrInterpolate, ssrRenderAttrs } from 'vue/server-renderer';
import { useForwardPropsEmits, TabsRoot, TabsList, TabsIndicator, TabsTrigger, TabsContent } from 'reka-ui';
import { e as useFetch, _ as _sfc_main$e, f as __nuxt_component_2$1, u as useAppConfig, r as reactivePick, t as tv, a as _sfc_main$c, g as get, b as _sfc_main$d, c as useToast, d as _sfc_main$9 } from './server.mjs';
import { isToday, format } from 'date-fns';
import { d as defineShortcuts } from './defineShortcuts-qA-CwxU2.mjs';
import { _ as _sfc_main$7 } from './Tooltip-B1rd475P.mjs';
import { _ as _sfc_main$8 } from './DropdownMenu-DtfLDXzs.mjs';
import { _ as _sfc_main$a } from './Card-jqGRZ5Ik.mjs';
import { _ as _sfc_main$b } from './Textarea-BUiU3euD.mjs';
import { u as useBreakpoints, b as breakpointsTailwind } from './index-Btsu36yb.mjs';
import './DashboardSidebarToggle-NWn7wtB9.mjs';
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
import './Kbd-8hyXBZ7D.mjs';
import 'reka-ui/namespaced';

const theme = {
  "slots": {
    "root": "flex items-center gap-2",
    "list": "relative flex p-1 group",
    "indicator": "absolute transition-[translate,width] duration-200",
    "trigger": [
      "group relative inline-flex items-center min-w-0 data-[state=inactive]:text-muted hover:data-[state=inactive]:not-disabled:text-default font-medium rounded-md disabled:cursor-not-allowed disabled:opacity-75",
      "transition-colors"
    ],
    "leadingIcon": "shrink-0",
    "leadingAvatar": "shrink-0",
    "leadingAvatarSize": "",
    "label": "truncate",
    "trailingBadge": "shrink-0",
    "trailingBadgeSize": "sm",
    "content": "focus:outline-none w-full"
  },
  "variants": {
    "color": {
      "primary": "",
      "secondary": "",
      "success": "",
      "info": "",
      "warning": "",
      "error": "",
      "neutral": ""
    },
    "variant": {
      "pill": {
        "list": "bg-elevated rounded-lg",
        "trigger": "grow",
        "indicator": "rounded-md shadow-xs"
      },
      "link": {
        "list": "border-default",
        "indicator": "rounded-full",
        "trigger": "focus:outline-none"
      }
    },
    "orientation": {
      "horizontal": {
        "root": "flex-col",
        "list": "w-full",
        "indicator": "left-0 w-(--reka-tabs-indicator-size) translate-x-(--reka-tabs-indicator-position)",
        "trigger": "justify-center"
      },
      "vertical": {
        "list": "flex-col",
        "indicator": "top-0 h-(--reka-tabs-indicator-size) translate-y-(--reka-tabs-indicator-position)"
      }
    },
    "size": {
      "xs": {
        "trigger": "px-2 py-1 text-xs gap-1",
        "leadingIcon": "size-4",
        "leadingAvatarSize": "3xs"
      },
      "sm": {
        "trigger": "px-2.5 py-1.5 text-xs gap-1.5",
        "leadingIcon": "size-4",
        "leadingAvatarSize": "3xs"
      },
      "md": {
        "trigger": "px-3 py-1.5 text-sm gap-1.5",
        "leadingIcon": "size-5",
        "leadingAvatarSize": "2xs"
      },
      "lg": {
        "trigger": "px-3 py-2 text-sm gap-2",
        "leadingIcon": "size-5",
        "leadingAvatarSize": "2xs"
      },
      "xl": {
        "trigger": "px-3 py-2 text-base gap-2",
        "leadingIcon": "size-6",
        "leadingAvatarSize": "xs"
      }
    }
  },
  "compoundVariants": [
    {
      "orientation": "horizontal",
      "variant": "pill",
      "class": {
        "indicator": "inset-y-1"
      }
    },
    {
      "orientation": "horizontal",
      "variant": "link",
      "class": {
        "list": "border-b -mb-px",
        "indicator": "-bottom-px h-px"
      }
    },
    {
      "orientation": "vertical",
      "variant": "pill",
      "class": {
        "indicator": "inset-x-1",
        "list": "items-center"
      }
    },
    {
      "orientation": "vertical",
      "variant": "link",
      "class": {
        "list": "border-s -ms-px",
        "indicator": "-start-px w-px"
      }
    },
    {
      "color": "primary",
      "variant": "pill",
      "class": {
        "indicator": "bg-primary",
        "trigger": "data-[state=active]:text-inverted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      }
    },
    {
      "color": "secondary",
      "variant": "pill",
      "class": {
        "indicator": "bg-secondary",
        "trigger": "data-[state=active]:text-inverted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
      }
    },
    {
      "color": "success",
      "variant": "pill",
      "class": {
        "indicator": "bg-success",
        "trigger": "data-[state=active]:text-inverted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-success"
      }
    },
    {
      "color": "info",
      "variant": "pill",
      "class": {
        "indicator": "bg-info",
        "trigger": "data-[state=active]:text-inverted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-info"
      }
    },
    {
      "color": "warning",
      "variant": "pill",
      "class": {
        "indicator": "bg-warning",
        "trigger": "data-[state=active]:text-inverted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-warning"
      }
    },
    {
      "color": "error",
      "variant": "pill",
      "class": {
        "indicator": "bg-error",
        "trigger": "data-[state=active]:text-inverted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-error"
      }
    },
    {
      "color": "neutral",
      "variant": "pill",
      "class": {
        "indicator": "bg-inverted",
        "trigger": "data-[state=active]:text-inverted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inverted"
      }
    },
    {
      "color": "primary",
      "variant": "link",
      "class": {
        "indicator": "bg-primary",
        "trigger": "data-[state=active]:text-primary focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
      }
    },
    {
      "color": "secondary",
      "variant": "link",
      "class": {
        "indicator": "bg-secondary",
        "trigger": "data-[state=active]:text-secondary focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-secondary"
      }
    },
    {
      "color": "success",
      "variant": "link",
      "class": {
        "indicator": "bg-success",
        "trigger": "data-[state=active]:text-success focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-success"
      }
    },
    {
      "color": "info",
      "variant": "link",
      "class": {
        "indicator": "bg-info",
        "trigger": "data-[state=active]:text-info focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-info"
      }
    },
    {
      "color": "warning",
      "variant": "link",
      "class": {
        "indicator": "bg-warning",
        "trigger": "data-[state=active]:text-warning focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-warning"
      }
    },
    {
      "color": "error",
      "variant": "link",
      "class": {
        "indicator": "bg-error",
        "trigger": "data-[state=active]:text-error focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-error"
      }
    },
    {
      "color": "neutral",
      "variant": "link",
      "class": {
        "indicator": "bg-inverted",
        "trigger": "data-[state=active]:text-highlighted focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-inverted"
      }
    }
  ],
  "defaultVariants": {
    "color": "primary",
    "variant": "pill",
    "size": "md"
  }
};
const _sfc_main$3 = {
  __name: "UTabs",
  __ssrInlineRender: true,
  props: {
    as: { type: null, required: false },
    items: { type: Array, required: false },
    color: { type: null, required: false },
    variant: { type: null, required: false },
    size: { type: null, required: false },
    orientation: { type: null, required: false, default: "horizontal" },
    content: { type: Boolean, required: false, default: true },
    labelKey: { type: null, required: false, default: "label" },
    class: { type: null, required: false },
    ui: { type: null, required: false },
    defaultValue: { type: null, required: false, default: "0" },
    modelValue: { type: null, required: false },
    activationMode: { type: String, required: false },
    unmountOnHide: { type: Boolean, required: false, default: true }
  },
  emits: ["update:modelValue"],
  setup(__props, { expose: __expose, emit: __emit }) {
    const props = __props;
    const emits = __emit;
    const slots = useSlots();
    const appConfig = useAppConfig();
    const rootProps = useForwardPropsEmits(reactivePick(props, "as", "unmountOnHide"), emits);
    const ui = computed(() => tv({ extend: tv(theme), ...appConfig.ui?.tabs || {} })({
      color: props.color,
      variant: props.variant,
      size: props.size,
      orientation: props.orientation
    }));
    const triggersRef = ref([]);
    __expose({
      triggersRef
    });
    return (_ctx, _push, _parent, _attrs) => {
      _push(ssrRenderComponent(unref(TabsRoot), mergeProps(unref(rootProps), {
        "model-value": __props.modelValue,
        "default-value": __props.defaultValue,
        orientation: __props.orientation,
        "activation-mode": __props.activationMode,
        class: ui.value.root({ class: [props.ui?.root, props.class] })
      }, _attrs), {
        default: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            _push2(ssrRenderComponent(unref(TabsList), {
              class: ui.value.list({ class: props.ui?.list })
            }, {
              default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                if (_push3) {
                  _push3(ssrRenderComponent(unref(TabsIndicator), {
                    class: ui.value.indicator({ class: props.ui?.indicator })
                  }, null, _parent3, _scopeId2));
                  ssrRenderSlot(_ctx.$slots, "list-leading", {}, null, _push3, _parent3, _scopeId2);
                  _push3(`<!--[-->`);
                  ssrRenderList(__props.items, (item, index) => {
                    _push3(ssrRenderComponent(unref(TabsTrigger), {
                      key: index,
                      ref_for: true,
                      ref: (el) => triggersRef.value[index] = el,
                      value: item.value || String(index),
                      disabled: item.disabled,
                      class: ui.value.trigger({ class: [props.ui?.trigger, item.ui?.trigger] })
                    }, {
                      default: withCtx((_3, _push4, _parent4, _scopeId3) => {
                        if (_push4) {
                          ssrRenderSlot(_ctx.$slots, "leading", {
                            item,
                            index
                          }, () => {
                            if (item.icon) {
                              _push4(ssrRenderComponent(_sfc_main$e, {
                                name: item.icon,
                                class: ui.value.leadingIcon({ class: [props.ui?.leadingIcon, item.ui?.leadingIcon] })
                              }, null, _parent4, _scopeId3));
                            } else if (item.avatar) {
                              _push4(ssrRenderComponent(_sfc_main$c, mergeProps({
                                size: item.ui?.leadingAvatarSize || props.ui?.leadingAvatarSize || ui.value.leadingAvatarSize()
                              }, { ref_for: true }, item.avatar, {
                                class: ui.value.leadingAvatar({ class: [props.ui?.leadingAvatar, item.ui?.leadingAvatar] })
                              }), null, _parent4, _scopeId3));
                            } else {
                              _push4(`<!---->`);
                            }
                          }, _push4, _parent4, _scopeId3);
                          if (unref(get)(item, props.labelKey) || !!slots.default) {
                            _push4(`<span class="${ssrRenderClass(ui.value.label({ class: [props.ui?.label, item.ui?.label] }))}"${_scopeId3}>`);
                            ssrRenderSlot(_ctx.$slots, "default", {
                              item,
                              index
                            }, () => {
                              _push4(`${ssrInterpolate(unref(get)(item, props.labelKey))}`);
                            }, _push4, _parent4, _scopeId3);
                            _push4(`</span>`);
                          } else {
                            _push4(`<!---->`);
                          }
                          ssrRenderSlot(_ctx.$slots, "trailing", {
                            item,
                            index
                          }, () => {
                            if (item.badge !== void 0) {
                              _push4(ssrRenderComponent(_sfc_main$5, mergeProps({
                                color: "neutral",
                                variant: "outline",
                                size: item.ui?.trailingBadgeSize || props.ui?.trailingBadgeSize || ui.value.trailingBadgeSize()
                              }, { ref_for: true }, typeof item.badge === "string" || typeof item.badge === "number" ? { label: item.badge } : item.badge, {
                                class: ui.value.trailingBadge({ class: [props.ui?.trailingBadge, item.ui?.trailingBadge] })
                              }), null, _parent4, _scopeId3));
                            } else {
                              _push4(`<!---->`);
                            }
                          }, _push4, _parent4, _scopeId3);
                        } else {
                          return [
                            renderSlot(_ctx.$slots, "leading", {
                              item,
                              index
                            }, () => [
                              item.icon ? (openBlock(), createBlock(_sfc_main$e, {
                                key: 0,
                                name: item.icon,
                                class: ui.value.leadingIcon({ class: [props.ui?.leadingIcon, item.ui?.leadingIcon] })
                              }, null, 8, ["name", "class"])) : item.avatar ? (openBlock(), createBlock(_sfc_main$c, mergeProps({
                                key: 1,
                                size: item.ui?.leadingAvatarSize || props.ui?.leadingAvatarSize || ui.value.leadingAvatarSize()
                              }, { ref_for: true }, item.avatar, {
                                class: ui.value.leadingAvatar({ class: [props.ui?.leadingAvatar, item.ui?.leadingAvatar] })
                              }), null, 16, ["size", "class"])) : createCommentVNode("", true)
                            ]),
                            unref(get)(item, props.labelKey) || !!slots.default ? (openBlock(), createBlock("span", {
                              key: 0,
                              class: ui.value.label({ class: [props.ui?.label, item.ui?.label] })
                            }, [
                              renderSlot(_ctx.$slots, "default", {
                                item,
                                index
                              }, () => [
                                createTextVNode(toDisplayString(unref(get)(item, props.labelKey)), 1)
                              ])
                            ], 2)) : createCommentVNode("", true),
                            renderSlot(_ctx.$slots, "trailing", {
                              item,
                              index
                            }, () => [
                              item.badge !== void 0 ? (openBlock(), createBlock(_sfc_main$5, mergeProps({
                                key: 0,
                                color: "neutral",
                                variant: "outline",
                                size: item.ui?.trailingBadgeSize || props.ui?.trailingBadgeSize || ui.value.trailingBadgeSize()
                              }, { ref_for: true }, typeof item.badge === "string" || typeof item.badge === "number" ? { label: item.badge } : item.badge, {
                                class: ui.value.trailingBadge({ class: [props.ui?.trailingBadge, item.ui?.trailingBadge] })
                              }), null, 16, ["size", "class"])) : createCommentVNode("", true)
                            ])
                          ];
                        }
                      }),
                      _: 2
                    }, _parent3, _scopeId2));
                  });
                  _push3(`<!--]-->`);
                  ssrRenderSlot(_ctx.$slots, "list-trailing", {}, null, _push3, _parent3, _scopeId2);
                } else {
                  return [
                    createVNode(unref(TabsIndicator), {
                      class: ui.value.indicator({ class: props.ui?.indicator })
                    }, null, 8, ["class"]),
                    renderSlot(_ctx.$slots, "list-leading"),
                    (openBlock(true), createBlock(Fragment, null, renderList(__props.items, (item, index) => {
                      return openBlock(), createBlock(unref(TabsTrigger), {
                        key: index,
                        ref_for: true,
                        ref: (el) => triggersRef.value[index] = el,
                        value: item.value || String(index),
                        disabled: item.disabled,
                        class: ui.value.trigger({ class: [props.ui?.trigger, item.ui?.trigger] })
                      }, {
                        default: withCtx(() => [
                          renderSlot(_ctx.$slots, "leading", {
                            item,
                            index
                          }, () => [
                            item.icon ? (openBlock(), createBlock(_sfc_main$e, {
                              key: 0,
                              name: item.icon,
                              class: ui.value.leadingIcon({ class: [props.ui?.leadingIcon, item.ui?.leadingIcon] })
                            }, null, 8, ["name", "class"])) : item.avatar ? (openBlock(), createBlock(_sfc_main$c, mergeProps({
                              key: 1,
                              size: item.ui?.leadingAvatarSize || props.ui?.leadingAvatarSize || ui.value.leadingAvatarSize()
                            }, { ref_for: true }, item.avatar, {
                              class: ui.value.leadingAvatar({ class: [props.ui?.leadingAvatar, item.ui?.leadingAvatar] })
                            }), null, 16, ["size", "class"])) : createCommentVNode("", true)
                          ]),
                          unref(get)(item, props.labelKey) || !!slots.default ? (openBlock(), createBlock("span", {
                            key: 0,
                            class: ui.value.label({ class: [props.ui?.label, item.ui?.label] })
                          }, [
                            renderSlot(_ctx.$slots, "default", {
                              item,
                              index
                            }, () => [
                              createTextVNode(toDisplayString(unref(get)(item, props.labelKey)), 1)
                            ])
                          ], 2)) : createCommentVNode("", true),
                          renderSlot(_ctx.$slots, "trailing", {
                            item,
                            index
                          }, () => [
                            item.badge !== void 0 ? (openBlock(), createBlock(_sfc_main$5, mergeProps({
                              key: 0,
                              color: "neutral",
                              variant: "outline",
                              size: item.ui?.trailingBadgeSize || props.ui?.trailingBadgeSize || ui.value.trailingBadgeSize()
                            }, { ref_for: true }, typeof item.badge === "string" || typeof item.badge === "number" ? { label: item.badge } : item.badge, {
                              class: ui.value.trailingBadge({ class: [props.ui?.trailingBadge, item.ui?.trailingBadge] })
                            }), null, 16, ["size", "class"])) : createCommentVNode("", true)
                          ])
                        ]),
                        _: 2
                      }, 1032, ["value", "disabled", "class"]);
                    }), 128)),
                    renderSlot(_ctx.$slots, "list-trailing")
                  ];
                }
              }),
              _: 3
            }, _parent2, _scopeId));
            if (!!__props.content) {
              _push2(`<!--[-->`);
              ssrRenderList(__props.items, (item, index) => {
                _push2(ssrRenderComponent(unref(TabsContent), {
                  key: index,
                  value: item.value || String(index),
                  class: ui.value.content({ class: [props.ui?.content, item.ui?.content, item.class] })
                }, {
                  default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                    if (_push3) {
                      ssrRenderSlot(_ctx.$slots, item.slot || "content", {
                        item,
                        index
                      }, () => {
                        _push3(`${ssrInterpolate(item.content)}`);
                      }, _push3, _parent3, _scopeId2);
                    } else {
                      return [
                        renderSlot(_ctx.$slots, item.slot || "content", {
                          item,
                          index
                        }, () => [
                          createTextVNode(toDisplayString(item.content), 1)
                        ])
                      ];
                    }
                  }),
                  _: 2
                }, _parent2, _scopeId));
              });
              _push2(`<!--]-->`);
            } else {
              _push2(`<!---->`);
            }
          } else {
            return [
              createVNode(unref(TabsList), {
                class: ui.value.list({ class: props.ui?.list })
              }, {
                default: withCtx(() => [
                  createVNode(unref(TabsIndicator), {
                    class: ui.value.indicator({ class: props.ui?.indicator })
                  }, null, 8, ["class"]),
                  renderSlot(_ctx.$slots, "list-leading"),
                  (openBlock(true), createBlock(Fragment, null, renderList(__props.items, (item, index) => {
                    return openBlock(), createBlock(unref(TabsTrigger), {
                      key: index,
                      ref_for: true,
                      ref: (el) => triggersRef.value[index] = el,
                      value: item.value || String(index),
                      disabled: item.disabled,
                      class: ui.value.trigger({ class: [props.ui?.trigger, item.ui?.trigger] })
                    }, {
                      default: withCtx(() => [
                        renderSlot(_ctx.$slots, "leading", {
                          item,
                          index
                        }, () => [
                          item.icon ? (openBlock(), createBlock(_sfc_main$e, {
                            key: 0,
                            name: item.icon,
                            class: ui.value.leadingIcon({ class: [props.ui?.leadingIcon, item.ui?.leadingIcon] })
                          }, null, 8, ["name", "class"])) : item.avatar ? (openBlock(), createBlock(_sfc_main$c, mergeProps({
                            key: 1,
                            size: item.ui?.leadingAvatarSize || props.ui?.leadingAvatarSize || ui.value.leadingAvatarSize()
                          }, { ref_for: true }, item.avatar, {
                            class: ui.value.leadingAvatar({ class: [props.ui?.leadingAvatar, item.ui?.leadingAvatar] })
                          }), null, 16, ["size", "class"])) : createCommentVNode("", true)
                        ]),
                        unref(get)(item, props.labelKey) || !!slots.default ? (openBlock(), createBlock("span", {
                          key: 0,
                          class: ui.value.label({ class: [props.ui?.label, item.ui?.label] })
                        }, [
                          renderSlot(_ctx.$slots, "default", {
                            item,
                            index
                          }, () => [
                            createTextVNode(toDisplayString(unref(get)(item, props.labelKey)), 1)
                          ])
                        ], 2)) : createCommentVNode("", true),
                        renderSlot(_ctx.$slots, "trailing", {
                          item,
                          index
                        }, () => [
                          item.badge !== void 0 ? (openBlock(), createBlock(_sfc_main$5, mergeProps({
                            key: 0,
                            color: "neutral",
                            variant: "outline",
                            size: item.ui?.trailingBadgeSize || props.ui?.trailingBadgeSize || ui.value.trailingBadgeSize()
                          }, { ref_for: true }, typeof item.badge === "string" || typeof item.badge === "number" ? { label: item.badge } : item.badge, {
                            class: ui.value.trailingBadge({ class: [props.ui?.trailingBadge, item.ui?.trailingBadge] })
                          }), null, 16, ["size", "class"])) : createCommentVNode("", true)
                        ])
                      ]),
                      _: 2
                    }, 1032, ["value", "disabled", "class"]);
                  }), 128)),
                  renderSlot(_ctx.$slots, "list-trailing")
                ]),
                _: 3
              }, 8, ["class"]),
              !!__props.content ? (openBlock(true), createBlock(Fragment, { key: 0 }, renderList(__props.items, (item, index) => {
                return openBlock(), createBlock(unref(TabsContent), {
                  key: index,
                  value: item.value || String(index),
                  class: ui.value.content({ class: [props.ui?.content, item.ui?.content, item.class] })
                }, {
                  default: withCtx(() => [
                    renderSlot(_ctx.$slots, item.slot || "content", {
                      item,
                      index
                    }, () => [
                      createTextVNode(toDisplayString(item.content), 1)
                    ])
                  ]),
                  _: 2
                }, 1032, ["value", "class"]);
              }), 128)) : createCommentVNode("", true)
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
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("../node_modules/.pnpm/@nuxt+ui@4.0.0-alpha.2_@babel+parser@7.28.0_@netlify+blobs@9.1.2_axios@1.12.2_change-ca_9e32dd265ffe56b992951caaa30208b5/node_modules/@nuxt/ui/dist/runtime/components/Tabs.vue");
  return _sfc_setup$3 ? _sfc_setup$3(props, ctx) : void 0;
};
const _sfc_main$2 = /* @__PURE__ */ defineComponent({
  __name: "InboxList",
  __ssrInlineRender: true,
  props: /* @__PURE__ */ mergeModels({
    mails: {}
  }, {
    "modelValue": {},
    "modelModifiers": {}
  }),
  emits: ["update:modelValue"],
  setup(__props) {
    const props = __props;
    const mailsRefs = ref([]);
    const selectedMail = useModel(__props, "modelValue");
    watch(selectedMail, () => {
      if (!selectedMail.value) {
        return;
      }
      const ref2 = mailsRefs.value[selectedMail.value.id];
      if (ref2) {
        ref2.scrollIntoView({ block: "nearest" });
      }
    });
    defineShortcuts({
      arrowdown: () => {
        const index = props.mails.findIndex((mail) => mail.id === selectedMail.value?.id);
        if (index === -1) {
          selectedMail.value = props.mails[0];
        } else if (index < props.mails.length - 1) {
          selectedMail.value = props.mails[index + 1];
        }
      },
      arrowup: () => {
        const index = props.mails.findIndex((mail) => mail.id === selectedMail.value?.id);
        if (index === -1) {
          selectedMail.value = props.mails[props.mails.length - 1];
        } else if (index > 0) {
          selectedMail.value = props.mails[index - 1];
        }
      }
    });
    return (_ctx, _push, _parent, _attrs) => {
      const _component_UChip = _sfc_main$d;
      _push(`<div${ssrRenderAttrs(mergeProps({ class: "overflow-y-auto divide-y divide-default" }, _attrs))}><!--[-->`);
      ssrRenderList(_ctx.mails, (mail, index) => {
        _push(`<div><div class="${ssrRenderClass([[
          mail.unread ? "text-highlighted" : "text-toned)",
          selectedMail.value && selectedMail.value.id === mail.id ? "border-primary bg-primary/10" : "border-(--ui-bg) hover:border-primary hover:bg-primary/5"
        ], "p-4 sm:px-6 text-sm cursor-pointer border-l-2 transition-colors"])}"><div class="${ssrRenderClass([[mail.unread && "font-semibold"], "flex items-center justify-between"])}"><div class="flex items-center gap-3">${ssrInterpolate(mail.from.name)} `);
        if (mail.unread) {
          _push(ssrRenderComponent(_component_UChip, null, null, _parent));
        } else {
          _push(`<!---->`);
        }
        _push(`</div><span>${ssrInterpolate(unref(isToday)(new Date(mail.date)) ? unref(format)(new Date(mail.date), "HH:mm") : unref(format)(new Date(mail.date), "dd MMM"))}</span></div><p class="${ssrRenderClass([[mail.unread && "font-semibold"], "truncate"])}">${ssrInterpolate(mail.subject)}</p><p class="text-dimmed line-clamp-1">${ssrInterpolate(mail.body)}</p></div></div>`);
      });
      _push(`<!--]--></div>`);
    };
  }
});
const _sfc_setup$2 = _sfc_main$2.setup;
_sfc_main$2.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("components/inbox/InboxList.vue");
  return _sfc_setup$2 ? _sfc_setup$2(props, ctx) : void 0;
};
const __nuxt_component_5 = Object.assign(_sfc_main$2, { __name: "InboxList" });
const _sfc_main$1 = /* @__PURE__ */ defineComponent({
  __name: "InboxMail",
  __ssrInlineRender: true,
  props: {
    mail: {}
  },
  emits: ["close"],
  setup(__props, { emit: __emit }) {
    const emits = __emit;
    const dropdownItems = [[{
      label: "Mark as unread",
      icon: "i-lucide-check-circle"
    }, {
      label: "Mark as important",
      icon: "i-lucide-triangle-alert"
    }], [{
      label: "Star thread",
      icon: "i-lucide-star"
    }, {
      label: "Mute thread",
      icon: "i-lucide-circle-pause"
    }]];
    const toast = useToast();
    const reply = ref("");
    const loading = ref(false);
    function onSubmit() {
      loading.value = true;
      setTimeout(() => {
        reply.value = "";
        toast.add({
          title: "Email sent",
          description: "Your email has been sent successfully",
          icon: "i-lucide-check-circle",
          color: "success"
        });
        loading.value = false;
      }, 1e3);
    }
    return (_ctx, _push, _parent, _attrs) => {
      const _component_UDashboardPanel = _sfc_main$1$1;
      const _component_UDashboardNavbar = _sfc_main$4;
      const _component_UButton = _sfc_main$9;
      const _component_UTooltip = _sfc_main$7;
      const _component_UDropdownMenu = _sfc_main$8;
      const _component_UAvatar = _sfc_main$c;
      const _component_UCard = _sfc_main$a;
      const _component_UIcon = _sfc_main$e;
      const _component_UTextarea = _sfc_main$b;
      _push(ssrRenderComponent(_component_UDashboardPanel, mergeProps({ id: "inbox-2" }, _attrs), {
        default: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            _push2(ssrRenderComponent(_component_UDashboardNavbar, {
              title: _ctx.mail.subject,
              toggle: false
            }, {
              leading: withCtx((_2, _push3, _parent3, _scopeId2) => {
                if (_push3) {
                  _push3(ssrRenderComponent(_component_UButton, {
                    icon: "i-lucide-x",
                    color: "neutral",
                    variant: "ghost",
                    class: "-ms-1.5",
                    onClick: ($event) => emits("close")
                  }, null, _parent3, _scopeId2));
                } else {
                  return [
                    createVNode(_component_UButton, {
                      icon: "i-lucide-x",
                      color: "neutral",
                      variant: "ghost",
                      class: "-ms-1.5",
                      onClick: ($event) => emits("close")
                    }, null, 8, ["onClick"])
                  ];
                }
              }),
              right: withCtx((_2, _push3, _parent3, _scopeId2) => {
                if (_push3) {
                  _push3(ssrRenderComponent(_component_UTooltip, { text: "Archive" }, {
                    default: withCtx((_3, _push4, _parent4, _scopeId3) => {
                      if (_push4) {
                        _push4(ssrRenderComponent(_component_UButton, {
                          icon: "i-lucide-inbox",
                          color: "neutral",
                          variant: "ghost"
                        }, null, _parent4, _scopeId3));
                      } else {
                        return [
                          createVNode(_component_UButton, {
                            icon: "i-lucide-inbox",
                            color: "neutral",
                            variant: "ghost"
                          })
                        ];
                      }
                    }),
                    _: 1
                  }, _parent3, _scopeId2));
                  _push3(ssrRenderComponent(_component_UTooltip, { text: "Reply" }, {
                    default: withCtx((_3, _push4, _parent4, _scopeId3) => {
                      if (_push4) {
                        _push4(ssrRenderComponent(_component_UButton, {
                          icon: "i-lucide-reply",
                          color: "neutral",
                          variant: "ghost"
                        }, null, _parent4, _scopeId3));
                      } else {
                        return [
                          createVNode(_component_UButton, {
                            icon: "i-lucide-reply",
                            color: "neutral",
                            variant: "ghost"
                          })
                        ];
                      }
                    }),
                    _: 1
                  }, _parent3, _scopeId2));
                  _push3(ssrRenderComponent(_component_UDropdownMenu, { items: dropdownItems }, {
                    default: withCtx((_3, _push4, _parent4, _scopeId3) => {
                      if (_push4) {
                        _push4(ssrRenderComponent(_component_UButton, {
                          icon: "i-lucide-ellipsis-vertical",
                          color: "neutral",
                          variant: "ghost"
                        }, null, _parent4, _scopeId3));
                      } else {
                        return [
                          createVNode(_component_UButton, {
                            icon: "i-lucide-ellipsis-vertical",
                            color: "neutral",
                            variant: "ghost"
                          })
                        ];
                      }
                    }),
                    _: 1
                  }, _parent3, _scopeId2));
                } else {
                  return [
                    createVNode(_component_UTooltip, { text: "Archive" }, {
                      default: withCtx(() => [
                        createVNode(_component_UButton, {
                          icon: "i-lucide-inbox",
                          color: "neutral",
                          variant: "ghost"
                        })
                      ]),
                      _: 1
                    }),
                    createVNode(_component_UTooltip, { text: "Reply" }, {
                      default: withCtx(() => [
                        createVNode(_component_UButton, {
                          icon: "i-lucide-reply",
                          color: "neutral",
                          variant: "ghost"
                        })
                      ]),
                      _: 1
                    }),
                    createVNode(_component_UDropdownMenu, { items: dropdownItems }, {
                      default: withCtx(() => [
                        createVNode(_component_UButton, {
                          icon: "i-lucide-ellipsis-vertical",
                          color: "neutral",
                          variant: "ghost"
                        })
                      ]),
                      _: 1
                    })
                  ];
                }
              }),
              _: 1
            }, _parent2, _scopeId));
            _push2(`<div class="flex flex-col sm:flex-row justify-between gap-1 p-4 sm:px-6 border-b border-default"${_scopeId}><div class="flex items-start gap-4 sm:my-1.5"${_scopeId}>`);
            _push2(ssrRenderComponent(_component_UAvatar, mergeProps(_ctx.mail.from.avatar, {
              alt: _ctx.mail.from.name,
              size: "3xl"
            }), null, _parent2, _scopeId));
            _push2(`<div class="min-w-0"${_scopeId}><p class="font-semibold text-highlighted"${_scopeId}>${ssrInterpolate(_ctx.mail.from.name)}</p><p class="text-muted"${_scopeId}>${ssrInterpolate(_ctx.mail.from.email)}</p></div></div><p class="max-sm:pl-16 text-muted text-sm sm:mt-2"${_scopeId}>${ssrInterpolate(unref(format)(new Date(_ctx.mail.date), "dd MMM HH:mm"))}</p></div><div class="flex-1 p-4 sm:p-6 overflow-y-auto"${_scopeId}><p class="whitespace-pre-wrap"${_scopeId}>${ssrInterpolate(_ctx.mail.body)}</p></div><div class="pb-4 px-4 sm:px-6 shrink-0"${_scopeId}>`);
            _push2(ssrRenderComponent(_component_UCard, {
              variant: "subtle",
              class: "mt-auto",
              ui: { header: "flex items-center gap-1.5 text-dimmed" }
            }, {
              header: withCtx((_2, _push3, _parent3, _scopeId2) => {
                if (_push3) {
                  _push3(ssrRenderComponent(_component_UIcon, {
                    name: "i-lucide-reply",
                    class: "size-5"
                  }, null, _parent3, _scopeId2));
                  _push3(`<span class="text-sm truncate"${_scopeId2}> Reply to ${ssrInterpolate(_ctx.mail.from.name)} (${ssrInterpolate(_ctx.mail.from.email)}) </span>`);
                } else {
                  return [
                    createVNode(_component_UIcon, {
                      name: "i-lucide-reply",
                      class: "size-5"
                    }),
                    createVNode("span", { class: "text-sm truncate" }, " Reply to " + toDisplayString(_ctx.mail.from.name) + " (" + toDisplayString(_ctx.mail.from.email) + ") ", 1)
                  ];
                }
              }),
              default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                if (_push3) {
                  _push3(`<form${_scopeId2}>`);
                  _push3(ssrRenderComponent(_component_UTextarea, {
                    modelValue: unref(reply),
                    "onUpdate:modelValue": ($event) => isRef(reply) ? reply.value = $event : null,
                    color: "neutral",
                    variant: "none",
                    required: "",
                    autoresize: "",
                    placeholder: "Write your reply...",
                    rows: 4,
                    disabled: unref(loading),
                    class: "w-full",
                    ui: { base: "p-0 resize-none" }
                  }, null, _parent3, _scopeId2));
                  _push3(`<div class="flex items-center justify-between"${_scopeId2}>`);
                  _push3(ssrRenderComponent(_component_UTooltip, { text: "Attach file" }, {
                    default: withCtx((_3, _push4, _parent4, _scopeId3) => {
                      if (_push4) {
                        _push4(ssrRenderComponent(_component_UButton, {
                          color: "neutral",
                          variant: "ghost",
                          icon: "i-lucide-paperclip"
                        }, null, _parent4, _scopeId3));
                      } else {
                        return [
                          createVNode(_component_UButton, {
                            color: "neutral",
                            variant: "ghost",
                            icon: "i-lucide-paperclip"
                          })
                        ];
                      }
                    }),
                    _: 1
                  }, _parent3, _scopeId2));
                  _push3(`<div class="flex items-center justify-end gap-2"${_scopeId2}>`);
                  _push3(ssrRenderComponent(_component_UButton, {
                    color: "neutral",
                    variant: "ghost",
                    label: "Save draft"
                  }, null, _parent3, _scopeId2));
                  _push3(ssrRenderComponent(_component_UButton, {
                    type: "submit",
                    color: "neutral",
                    loading: unref(loading),
                    label: "Send",
                    icon: "i-lucide-send"
                  }, null, _parent3, _scopeId2));
                  _push3(`</div></div></form>`);
                } else {
                  return [
                    createVNode("form", {
                      onSubmit: withModifiers(onSubmit, ["prevent"])
                    }, [
                      createVNode(_component_UTextarea, {
                        modelValue: unref(reply),
                        "onUpdate:modelValue": ($event) => isRef(reply) ? reply.value = $event : null,
                        color: "neutral",
                        variant: "none",
                        required: "",
                        autoresize: "",
                        placeholder: "Write your reply...",
                        rows: 4,
                        disabled: unref(loading),
                        class: "w-full",
                        ui: { base: "p-0 resize-none" }
                      }, null, 8, ["modelValue", "onUpdate:modelValue", "disabled"]),
                      createVNode("div", { class: "flex items-center justify-between" }, [
                        createVNode(_component_UTooltip, { text: "Attach file" }, {
                          default: withCtx(() => [
                            createVNode(_component_UButton, {
                              color: "neutral",
                              variant: "ghost",
                              icon: "i-lucide-paperclip"
                            })
                          ]),
                          _: 1
                        }),
                        createVNode("div", { class: "flex items-center justify-end gap-2" }, [
                          createVNode(_component_UButton, {
                            color: "neutral",
                            variant: "ghost",
                            label: "Save draft"
                          }),
                          createVNode(_component_UButton, {
                            type: "submit",
                            color: "neutral",
                            loading: unref(loading),
                            label: "Send",
                            icon: "i-lucide-send"
                          }, null, 8, ["loading"])
                        ])
                      ])
                    ], 32)
                  ];
                }
              }),
              _: 1
            }, _parent2, _scopeId));
            _push2(`</div>`);
          } else {
            return [
              createVNode(_component_UDashboardNavbar, {
                title: _ctx.mail.subject,
                toggle: false
              }, {
                leading: withCtx(() => [
                  createVNode(_component_UButton, {
                    icon: "i-lucide-x",
                    color: "neutral",
                    variant: "ghost",
                    class: "-ms-1.5",
                    onClick: ($event) => emits("close")
                  }, null, 8, ["onClick"])
                ]),
                right: withCtx(() => [
                  createVNode(_component_UTooltip, { text: "Archive" }, {
                    default: withCtx(() => [
                      createVNode(_component_UButton, {
                        icon: "i-lucide-inbox",
                        color: "neutral",
                        variant: "ghost"
                      })
                    ]),
                    _: 1
                  }),
                  createVNode(_component_UTooltip, { text: "Reply" }, {
                    default: withCtx(() => [
                      createVNode(_component_UButton, {
                        icon: "i-lucide-reply",
                        color: "neutral",
                        variant: "ghost"
                      })
                    ]),
                    _: 1
                  }),
                  createVNode(_component_UDropdownMenu, { items: dropdownItems }, {
                    default: withCtx(() => [
                      createVNode(_component_UButton, {
                        icon: "i-lucide-ellipsis-vertical",
                        color: "neutral",
                        variant: "ghost"
                      })
                    ]),
                    _: 1
                  })
                ]),
                _: 1
              }, 8, ["title"]),
              createVNode("div", { class: "flex flex-col sm:flex-row justify-between gap-1 p-4 sm:px-6 border-b border-default" }, [
                createVNode("div", { class: "flex items-start gap-4 sm:my-1.5" }, [
                  createVNode(_component_UAvatar, mergeProps(_ctx.mail.from.avatar, {
                    alt: _ctx.mail.from.name,
                    size: "3xl"
                  }), null, 16, ["alt"]),
                  createVNode("div", { class: "min-w-0" }, [
                    createVNode("p", { class: "font-semibold text-highlighted" }, toDisplayString(_ctx.mail.from.name), 1),
                    createVNode("p", { class: "text-muted" }, toDisplayString(_ctx.mail.from.email), 1)
                  ])
                ]),
                createVNode("p", { class: "max-sm:pl-16 text-muted text-sm sm:mt-2" }, toDisplayString(unref(format)(new Date(_ctx.mail.date), "dd MMM HH:mm")), 1)
              ]),
              createVNode("div", { class: "flex-1 p-4 sm:p-6 overflow-y-auto" }, [
                createVNode("p", { class: "whitespace-pre-wrap" }, toDisplayString(_ctx.mail.body), 1)
              ]),
              createVNode("div", { class: "pb-4 px-4 sm:px-6 shrink-0" }, [
                createVNode(_component_UCard, {
                  variant: "subtle",
                  class: "mt-auto",
                  ui: { header: "flex items-center gap-1.5 text-dimmed" }
                }, {
                  header: withCtx(() => [
                    createVNode(_component_UIcon, {
                      name: "i-lucide-reply",
                      class: "size-5"
                    }),
                    createVNode("span", { class: "text-sm truncate" }, " Reply to " + toDisplayString(_ctx.mail.from.name) + " (" + toDisplayString(_ctx.mail.from.email) + ") ", 1)
                  ]),
                  default: withCtx(() => [
                    createVNode("form", {
                      onSubmit: withModifiers(onSubmit, ["prevent"])
                    }, [
                      createVNode(_component_UTextarea, {
                        modelValue: unref(reply),
                        "onUpdate:modelValue": ($event) => isRef(reply) ? reply.value = $event : null,
                        color: "neutral",
                        variant: "none",
                        required: "",
                        autoresize: "",
                        placeholder: "Write your reply...",
                        rows: 4,
                        disabled: unref(loading),
                        class: "w-full",
                        ui: { base: "p-0 resize-none" }
                      }, null, 8, ["modelValue", "onUpdate:modelValue", "disabled"]),
                      createVNode("div", { class: "flex items-center justify-between" }, [
                        createVNode(_component_UTooltip, { text: "Attach file" }, {
                          default: withCtx(() => [
                            createVNode(_component_UButton, {
                              color: "neutral",
                              variant: "ghost",
                              icon: "i-lucide-paperclip"
                            })
                          ]),
                          _: 1
                        }),
                        createVNode("div", { class: "flex items-center justify-end gap-2" }, [
                          createVNode(_component_UButton, {
                            color: "neutral",
                            variant: "ghost",
                            label: "Save draft"
                          }),
                          createVNode(_component_UButton, {
                            type: "submit",
                            color: "neutral",
                            loading: unref(loading),
                            label: "Send",
                            icon: "i-lucide-send"
                          }, null, 8, ["loading"])
                        ])
                      ])
                    ], 32)
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
const _sfc_setup$1 = _sfc_main$1.setup;
_sfc_main$1.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("components/inbox/InboxMail.vue");
  return _sfc_setup$1 ? _sfc_setup$1(props, ctx) : void 0;
};
const __nuxt_component_6 = Object.assign(_sfc_main$1, { __name: "InboxMail" });
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "inbox",
  __ssrInlineRender: true,
  async setup(__props) {
    let __temp, __restore;
    const tabItems = [{
      label: "All",
      value: "all"
    }, {
      label: "Unread",
      value: "unread"
    }];
    const selectedTab = ref("all");
    const { data: mails } = ([__temp, __restore] = withAsyncContext(() => useFetch("/api/mails", { default: () => [] }, "$_PsmgsIljy")), __temp = await __temp, __restore(), __temp);
    const filteredMails = computed(() => {
      if (selectedTab.value === "unread") {
        return mails.value.filter((mail) => !!mail.unread);
      }
      return mails.value;
    });
    const selectedMail = ref();
    computed({
      get() {
        return !!selectedMail.value;
      },
      set(value) {
        if (!value) {
          selectedMail.value = null;
        }
      }
    });
    watch(filteredMails, () => {
      if (!filteredMails.value.find((mail) => mail.id === selectedMail.value?.id)) {
        selectedMail.value = null;
      }
    });
    const breakpoints = useBreakpoints(breakpointsTailwind);
    breakpoints.smaller("lg");
    return (_ctx, _push, _parent, _attrs) => {
      const _component_UDashboardPanel = _sfc_main$1$1;
      const _component_UDashboardNavbar = _sfc_main$4;
      const _component_UDashboardSidebarCollapse = _sfc_main$6;
      const _component_UBadge = _sfc_main$5;
      const _component_UTabs = _sfc_main$3;
      const _component_InboxList = __nuxt_component_5;
      const _component_InboxMail = __nuxt_component_6;
      const _component_UIcon = _sfc_main$e;
      const _component_ClientOnly = __nuxt_component_2$1;
      _push(`<!--[-->`);
      _push(ssrRenderComponent(_component_UDashboardPanel, {
        id: "inbox-1",
        "default-size": 25,
        "min-size": 20,
        "max-size": 30,
        resizable: ""
      }, {
        default: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            _push2(ssrRenderComponent(_component_UDashboardNavbar, { title: "Inbox" }, {
              leading: withCtx((_2, _push3, _parent3, _scopeId2) => {
                if (_push3) {
                  _push3(ssrRenderComponent(_component_UDashboardSidebarCollapse, null, null, _parent3, _scopeId2));
                } else {
                  return [
                    createVNode(_component_UDashboardSidebarCollapse)
                  ];
                }
              }),
              trailing: withCtx((_2, _push3, _parent3, _scopeId2) => {
                if (_push3) {
                  _push3(ssrRenderComponent(_component_UBadge, {
                    label: filteredMails.value.length,
                    variant: "subtle"
                  }, null, _parent3, _scopeId2));
                } else {
                  return [
                    createVNode(_component_UBadge, {
                      label: filteredMails.value.length,
                      variant: "subtle"
                    }, null, 8, ["label"])
                  ];
                }
              }),
              right: withCtx((_2, _push3, _parent3, _scopeId2) => {
                if (_push3) {
                  _push3(ssrRenderComponent(_component_UTabs, {
                    modelValue: selectedTab.value,
                    "onUpdate:modelValue": ($event) => selectedTab.value = $event,
                    items: tabItems,
                    content: false,
                    size: "xs"
                  }, null, _parent3, _scopeId2));
                } else {
                  return [
                    createVNode(_component_UTabs, {
                      modelValue: selectedTab.value,
                      "onUpdate:modelValue": ($event) => selectedTab.value = $event,
                      items: tabItems,
                      content: false,
                      size: "xs"
                    }, null, 8, ["modelValue", "onUpdate:modelValue"])
                  ];
                }
              }),
              _: 1
            }, _parent2, _scopeId));
            _push2(ssrRenderComponent(_component_InboxList, {
              modelValue: selectedMail.value,
              "onUpdate:modelValue": ($event) => selectedMail.value = $event,
              mails: filteredMails.value
            }, null, _parent2, _scopeId));
          } else {
            return [
              createVNode(_component_UDashboardNavbar, { title: "Inbox" }, {
                leading: withCtx(() => [
                  createVNode(_component_UDashboardSidebarCollapse)
                ]),
                trailing: withCtx(() => [
                  createVNode(_component_UBadge, {
                    label: filteredMails.value.length,
                    variant: "subtle"
                  }, null, 8, ["label"])
                ]),
                right: withCtx(() => [
                  createVNode(_component_UTabs, {
                    modelValue: selectedTab.value,
                    "onUpdate:modelValue": ($event) => selectedTab.value = $event,
                    items: tabItems,
                    content: false,
                    size: "xs"
                  }, null, 8, ["modelValue", "onUpdate:modelValue"])
                ]),
                _: 1
              }),
              createVNode(_component_InboxList, {
                modelValue: selectedMail.value,
                "onUpdate:modelValue": ($event) => selectedMail.value = $event,
                mails: filteredMails.value
              }, null, 8, ["modelValue", "onUpdate:modelValue", "mails"])
            ];
          }
        }),
        _: 1
      }, _parent));
      if (selectedMail.value) {
        _push(ssrRenderComponent(_component_InboxMail, {
          mail: selectedMail.value,
          onClose: ($event) => selectedMail.value = null
        }, null, _parent));
      } else {
        _push(`<div class="hidden lg:flex flex-1 items-center justify-center">`);
        _push(ssrRenderComponent(_component_UIcon, {
          name: "i-lucide-inbox",
          class: "size-32 text-dimmed"
        }, null, _parent));
        _push(`</div>`);
      }
      _push(ssrRenderComponent(_component_ClientOnly, null, {}, _parent));
      _push(`<!--]-->`);
    };
  }
});
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("pages/inbox.vue");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};

export { _sfc_main as default };
//# sourceMappingURL=inbox-DBfzGJNP.mjs.map
