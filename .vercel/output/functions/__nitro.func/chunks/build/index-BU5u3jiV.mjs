import { _ as _sfc_main$3 } from './Form-gO420aMi.mjs';
import { _ as _sfc_main$4 } from './PageCard-BrXkocLW.mjs';
import { c as useToast, e as useFetch, d as _sfc_main$9, _ as _sfc_main$e, a as _sfc_main$c, u as useAppConfig, r as reactivePick, l as useFormField, t as tv, g as get } from './server.mjs';
import { _ as _sfc_main$5 } from './FormField-DDRuR3fR.mjs';
import { _ as _sfc_main$6 } from './SelectMenu-BG51Bku2.mjs';
import { defineComponent, ref, reactive, withAsyncContext, watch, mergeProps, unref, withCtx, createVNode, isRef, createBlock, createCommentVNode, toDisplayString, openBlock, Fragment, renderList, useSlots, useId, computed, resolveDynamicComponent, renderSlot, createTextVNode, useSSRContext } from 'vue';
import { ssrRenderComponent, ssrInterpolate, ssrRenderList, ssrRenderAttrs, ssrRenderClass, ssrRenderSlot, ssrRenderVNode } from 'vue/server-renderer';
import { useForwardPropsEmits, RadioGroupRoot, Label, RadioGroupItem, RadioGroupIndicator, useForwardProps, Separator } from 'reka-ui';
import { _ as _sfc_main$7 } from './Input-Bc3-FTjC.mjs';
import { _ as _sfc_main$8 } from './Textarea-BUiU3euD.mjs';
import * as z from 'zod';
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

const theme$1 = {
  "slots": {
    "root": "relative",
    "fieldset": "flex gap-x-2",
    "legend": "mb-1 block font-medium text-default",
    "item": "flex items-start",
    "container": "flex items-center",
    "base": "rounded-full ring ring-inset ring-accented overflow-hidden focus-visible:outline-2 focus-visible:outline-offset-2",
    "indicator": "flex items-center justify-center size-full after:bg-default after:rounded-full",
    "wrapper": "w-full",
    "label": "block font-medium text-default",
    "description": "text-muted"
  },
  "variants": {
    "color": {
      "primary": {
        "base": "focus-visible:outline-primary",
        "indicator": "bg-primary"
      },
      "secondary": {
        "base": "focus-visible:outline-secondary",
        "indicator": "bg-secondary"
      },
      "success": {
        "base": "focus-visible:outline-success",
        "indicator": "bg-success"
      },
      "info": {
        "base": "focus-visible:outline-info",
        "indicator": "bg-info"
      },
      "warning": {
        "base": "focus-visible:outline-warning",
        "indicator": "bg-warning"
      },
      "error": {
        "base": "focus-visible:outline-error",
        "indicator": "bg-error"
      },
      "neutral": {
        "base": "focus-visible:outline-inverted",
        "indicator": "bg-inverted"
      }
    },
    "variant": {
      "list": {
        "item": ""
      },
      "card": {
        "item": "border border-muted rounded-lg"
      },
      "table": {
        "item": "border border-muted"
      }
    },
    "orientation": {
      "horizontal": {
        "fieldset": "flex-row"
      },
      "vertical": {
        "fieldset": "flex-col"
      }
    },
    "indicator": {
      "start": {
        "item": "flex-row",
        "wrapper": "ms-2"
      },
      "end": {
        "item": "flex-row-reverse",
        "wrapper": "me-2"
      },
      "hidden": {
        "base": "sr-only",
        "wrapper": "text-center"
      }
    },
    "size": {
      "xs": {
        "fieldset": "gap-y-0.5",
        "legend": "text-xs",
        "base": "size-3",
        "item": "text-xs",
        "container": "h-4",
        "indicator": "after:size-1"
      },
      "sm": {
        "fieldset": "gap-y-0.5",
        "legend": "text-xs",
        "base": "size-3.5",
        "item": "text-xs",
        "container": "h-4",
        "indicator": "after:size-1"
      },
      "md": {
        "fieldset": "gap-y-1",
        "legend": "text-sm",
        "base": "size-4",
        "item": "text-sm",
        "container": "h-5",
        "indicator": "after:size-1.5"
      },
      "lg": {
        "fieldset": "gap-y-1",
        "legend": "text-sm",
        "base": "size-4.5",
        "item": "text-sm",
        "container": "h-5",
        "indicator": "after:size-1.5"
      },
      "xl": {
        "fieldset": "gap-y-1.5",
        "legend": "text-base",
        "base": "size-5",
        "item": "text-base",
        "container": "h-6",
        "indicator": "after:size-2"
      }
    },
    "disabled": {
      "true": {
        "base": "cursor-not-allowed opacity-75",
        "label": "cursor-not-allowed opacity-75"
      }
    },
    "required": {
      "true": {
        "legend": "after:content-['*'] after:ms-0.5 after:text-error"
      }
    }
  },
  "compoundVariants": [
    {
      "size": "xs",
      "variant": [
        "card",
        "table"
      ],
      "class": {
        "item": "p-2.5"
      }
    },
    {
      "size": "sm",
      "variant": [
        "card",
        "table"
      ],
      "class": {
        "item": "p-3"
      }
    },
    {
      "size": "md",
      "variant": [
        "card",
        "table"
      ],
      "class": {
        "item": "p-3.5"
      }
    },
    {
      "size": "lg",
      "variant": [
        "card",
        "table"
      ],
      "class": {
        "item": "p-4"
      }
    },
    {
      "size": "xl",
      "variant": [
        "card",
        "table"
      ],
      "class": {
        "item": "p-4.5"
      }
    },
    {
      "orientation": "horizontal",
      "variant": "table",
      "class": {
        "item": "first-of-type:rounded-s-lg last-of-type:rounded-e-lg",
        "fieldset": "gap-0 -space-x-px"
      }
    },
    {
      "orientation": "vertical",
      "variant": "table",
      "class": {
        "item": "first-of-type:rounded-t-lg last-of-type:rounded-b-lg",
        "fieldset": "gap-0 -space-y-px"
      }
    },
    {
      "color": "primary",
      "variant": "card",
      "class": {
        "item": "has-data-[state=checked]:border-primary"
      }
    },
    {
      "color": "secondary",
      "variant": "card",
      "class": {
        "item": "has-data-[state=checked]:border-secondary"
      }
    },
    {
      "color": "success",
      "variant": "card",
      "class": {
        "item": "has-data-[state=checked]:border-success"
      }
    },
    {
      "color": "info",
      "variant": "card",
      "class": {
        "item": "has-data-[state=checked]:border-info"
      }
    },
    {
      "color": "warning",
      "variant": "card",
      "class": {
        "item": "has-data-[state=checked]:border-warning"
      }
    },
    {
      "color": "error",
      "variant": "card",
      "class": {
        "item": "has-data-[state=checked]:border-error"
      }
    },
    {
      "color": "neutral",
      "variant": "card",
      "class": {
        "item": "has-data-[state=checked]:border-inverted"
      }
    },
    {
      "color": "primary",
      "variant": "table",
      "class": {
        "item": "has-data-[state=checked]:bg-primary/10 has-data-[state=checked]:border-primary/50 has-data-[state=checked]:z-[1]"
      }
    },
    {
      "color": "secondary",
      "variant": "table",
      "class": {
        "item": "has-data-[state=checked]:bg-secondary/10 has-data-[state=checked]:border-secondary/50 has-data-[state=checked]:z-[1]"
      }
    },
    {
      "color": "success",
      "variant": "table",
      "class": {
        "item": "has-data-[state=checked]:bg-success/10 has-data-[state=checked]:border-success/50 has-data-[state=checked]:z-[1]"
      }
    },
    {
      "color": "info",
      "variant": "table",
      "class": {
        "item": "has-data-[state=checked]:bg-info/10 has-data-[state=checked]:border-info/50 has-data-[state=checked]:z-[1]"
      }
    },
    {
      "color": "warning",
      "variant": "table",
      "class": {
        "item": "has-data-[state=checked]:bg-warning/10 has-data-[state=checked]:border-warning/50 has-data-[state=checked]:z-[1]"
      }
    },
    {
      "color": "error",
      "variant": "table",
      "class": {
        "item": "has-data-[state=checked]:bg-error/10 has-data-[state=checked]:border-error/50 has-data-[state=checked]:z-[1]"
      }
    },
    {
      "color": "neutral",
      "variant": "table",
      "class": {
        "item": "has-data-[state=checked]:bg-elevated has-data-[state=checked]:border-inverted/50 has-data-[state=checked]:z-[1]"
      }
    },
    {
      "variant": [
        "card",
        "table"
      ],
      "disabled": true,
      "class": {
        "item": "cursor-not-allowed opacity-75"
      }
    }
  ],
  "defaultVariants": {
    "size": "md",
    "color": "primary",
    "variant": "list",
    "orientation": "vertical",
    "indicator": "start"
  }
};
const _sfc_main$2 = {
  __name: "URadioGroup",
  __ssrInlineRender: true,
  props: {
    as: { type: null, required: false },
    legend: { type: String, required: false },
    valueKey: { type: null, required: false, default: "value" },
    labelKey: { type: null, required: false, default: "label" },
    descriptionKey: { type: null, required: false, default: "description" },
    items: { type: null, required: false },
    modelValue: { type: null, required: false },
    defaultValue: { type: null, required: false },
    size: { type: null, required: false },
    variant: { type: null, required: false },
    color: { type: null, required: false },
    orientation: { type: null, required: false, default: "vertical" },
    indicator: { type: null, required: false },
    class: { type: null, required: false },
    ui: { type: null, required: false },
    disabled: { type: Boolean, required: false },
    loop: { type: Boolean, required: false },
    name: { type: String, required: false },
    required: { type: Boolean, required: false }
  },
  emits: ["update:modelValue", "change"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emits = __emit;
    const slots = useSlots();
    const appConfig = useAppConfig();
    const rootProps = useForwardPropsEmits(reactivePick(props, "as", "loop", "required"), emits);
    const { emitFormChange, emitFormInput, color, name, size, id: _id, disabled, ariaAttrs } = useFormField(props, { bind: false });
    const id = _id.value ?? useId();
    const ui = computed(() => tv({ extend: tv(theme$1), ...appConfig.ui?.radioGroup || {} })({
      size: size.value,
      color: color.value,
      disabled: disabled.value,
      required: props.required,
      orientation: props.orientation,
      variant: props.variant,
      indicator: props.indicator
    }));
    function normalizeItem(item) {
      if (item === null) {
        return {
          id: `${id}:null`,
          value: void 0,
          label: void 0
        };
      }
      if (typeof item === "string" || typeof item === "number" || typeof item === "bigint") {
        return {
          id: `${id}:${item}`,
          value: String(item),
          label: String(item)
        };
      }
      const value = get(item, props.valueKey);
      const label = get(item, props.labelKey);
      const description = get(item, props.descriptionKey);
      return {
        ...item,
        value,
        label,
        description,
        id: `${id}:${value}`
      };
    }
    const normalizedItems = computed(() => {
      if (!props.items) {
        return [];
      }
      return props.items.map(normalizeItem);
    });
    function onUpdate(value) {
      const event = new Event("change", { target: { value } });
      emits("change", event);
      emitFormChange();
      emitFormInput();
    }
    return (_ctx, _push, _parent, _attrs) => {
      _push(ssrRenderComponent(unref(RadioGroupRoot), mergeProps({ id: unref(id) }, unref(rootProps), {
        "model-value": __props.modelValue,
        "default-value": __props.defaultValue,
        orientation: __props.orientation,
        name: unref(name),
        disabled: unref(disabled),
        class: ui.value.root({ class: [props.ui?.root, props.class] }),
        "onUpdate:modelValue": onUpdate
      }, _attrs), {
        default: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            _push2(`<fieldset${ssrRenderAttrs(mergeProps({
              class: ui.value.fieldset({ class: props.ui?.fieldset })
            }, unref(ariaAttrs)))}${_scopeId}>`);
            if (__props.legend || !!slots.legend) {
              _push2(`<legend class="${ssrRenderClass(ui.value.legend({ class: props.ui?.legend }))}"${_scopeId}>`);
              ssrRenderSlot(_ctx.$slots, "legend", {}, () => {
                _push2(`${ssrInterpolate(__props.legend)}`);
              }, _push2, _parent2, _scopeId);
              _push2(`</legend>`);
            } else {
              _push2(`<!---->`);
            }
            _push2(`<!--[-->`);
            ssrRenderList(normalizedItems.value, (item) => {
              ssrRenderVNode(_push2, createVNode(resolveDynamicComponent(!__props.variant || __props.variant === "list" ? "div" : unref(Label)), {
                key: item.value,
                class: ui.value.item({ class: [props.ui?.item, item.ui?.item, item.class] })
              }, {
                default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                  if (_push3) {
                    _push3(`<div class="${ssrRenderClass(ui.value.container({ class: [props.ui?.container, item.ui?.container] }))}"${_scopeId2}>`);
                    _push3(ssrRenderComponent(unref(RadioGroupItem), {
                      id: item.id,
                      value: item.value,
                      disabled: item.disabled,
                      class: ui.value.base({ class: [props.ui?.base, item.ui?.base], disabled: item.disabled })
                    }, {
                      default: withCtx((_3, _push4, _parent4, _scopeId3) => {
                        if (_push4) {
                          _push4(ssrRenderComponent(unref(RadioGroupIndicator), {
                            class: ui.value.indicator({ class: [props.ui?.indicator, item.ui?.indicator] })
                          }, null, _parent4, _scopeId3));
                        } else {
                          return [
                            createVNode(unref(RadioGroupIndicator), {
                              class: ui.value.indicator({ class: [props.ui?.indicator, item.ui?.indicator] })
                            }, null, 8, ["class"])
                          ];
                        }
                      }),
                      _: 2
                    }, _parent3, _scopeId2));
                    _push3(`</div>`);
                    if (item.label || !!slots.label || (item.description || !!slots.description)) {
                      _push3(`<div class="${ssrRenderClass(ui.value.wrapper({ class: [props.ui?.wrapper, item.ui?.wrapper] }))}"${_scopeId2}>`);
                      if (item.label || !!slots.label) {
                        ssrRenderVNode(_push3, createVNode(resolveDynamicComponent(!__props.variant || __props.variant === "list" ? unref(Label) : "p"), {
                          for: item.id,
                          class: ui.value.label({ class: [props.ui?.label, item.ui?.label] })
                        }, {
                          default: withCtx((_3, _push4, _parent4, _scopeId3) => {
                            if (_push4) {
                              ssrRenderSlot(_ctx.$slots, "label", {
                                item,
                                modelValue: __props.modelValue
                              }, () => {
                                _push4(`${ssrInterpolate(item.label)}`);
                              }, _push4, _parent4, _scopeId3);
                            } else {
                              return [
                                renderSlot(_ctx.$slots, "label", {
                                  item,
                                  modelValue: __props.modelValue
                                }, () => [
                                  createTextVNode(toDisplayString(item.label), 1)
                                ])
                              ];
                            }
                          }),
                          _: 2
                        }), _parent3, _scopeId2);
                      } else {
                        _push3(`<!---->`);
                      }
                      if (item.description || !!slots.description) {
                        _push3(`<p class="${ssrRenderClass(ui.value.description({ class: [props.ui?.description, item.ui?.description] }))}"${_scopeId2}>`);
                        ssrRenderSlot(_ctx.$slots, "description", {
                          item,
                          modelValue: __props.modelValue
                        }, () => {
                          _push3(`${ssrInterpolate(item.description)}`);
                        }, _push3, _parent3, _scopeId2);
                        _push3(`</p>`);
                      } else {
                        _push3(`<!---->`);
                      }
                      _push3(`</div>`);
                    } else {
                      _push3(`<!---->`);
                    }
                  } else {
                    return [
                      createVNode("div", {
                        class: ui.value.container({ class: [props.ui?.container, item.ui?.container] })
                      }, [
                        createVNode(unref(RadioGroupItem), {
                          id: item.id,
                          value: item.value,
                          disabled: item.disabled,
                          class: ui.value.base({ class: [props.ui?.base, item.ui?.base], disabled: item.disabled })
                        }, {
                          default: withCtx(() => [
                            createVNode(unref(RadioGroupIndicator), {
                              class: ui.value.indicator({ class: [props.ui?.indicator, item.ui?.indicator] })
                            }, null, 8, ["class"])
                          ]),
                          _: 2
                        }, 1032, ["id", "value", "disabled", "class"])
                      ], 2),
                      item.label || !!slots.label || (item.description || !!slots.description) ? (openBlock(), createBlock("div", {
                        key: 0,
                        class: ui.value.wrapper({ class: [props.ui?.wrapper, item.ui?.wrapper] })
                      }, [
                        item.label || !!slots.label ? (openBlock(), createBlock(resolveDynamicComponent(!__props.variant || __props.variant === "list" ? unref(Label) : "p"), {
                          key: 0,
                          for: item.id,
                          class: ui.value.label({ class: [props.ui?.label, item.ui?.label] })
                        }, {
                          default: withCtx(() => [
                            renderSlot(_ctx.$slots, "label", {
                              item,
                              modelValue: __props.modelValue
                            }, () => [
                              createTextVNode(toDisplayString(item.label), 1)
                            ])
                          ]),
                          _: 2
                        }, 1032, ["for", "class"])) : createCommentVNode("", true),
                        item.description || !!slots.description ? (openBlock(), createBlock("p", {
                          key: 1,
                          class: ui.value.description({ class: [props.ui?.description, item.ui?.description] })
                        }, [
                          renderSlot(_ctx.$slots, "description", {
                            item,
                            modelValue: __props.modelValue
                          }, () => [
                            createTextVNode(toDisplayString(item.description), 1)
                          ])
                        ], 2)) : createCommentVNode("", true)
                      ], 2)) : createCommentVNode("", true)
                    ];
                  }
                }),
                _: 2
              }), _parent2, _scopeId);
            });
            _push2(`<!--]--></fieldset>`);
          } else {
            return [
              createVNode("fieldset", mergeProps({
                class: ui.value.fieldset({ class: props.ui?.fieldset })
              }, unref(ariaAttrs)), [
                __props.legend || !!slots.legend ? (openBlock(), createBlock("legend", {
                  key: 0,
                  class: ui.value.legend({ class: props.ui?.legend })
                }, [
                  renderSlot(_ctx.$slots, "legend", {}, () => [
                    createTextVNode(toDisplayString(__props.legend), 1)
                  ])
                ], 2)) : createCommentVNode("", true),
                (openBlock(true), createBlock(Fragment, null, renderList(normalizedItems.value, (item) => {
                  return openBlock(), createBlock(resolveDynamicComponent(!__props.variant || __props.variant === "list" ? "div" : unref(Label)), {
                    key: item.value,
                    class: ui.value.item({ class: [props.ui?.item, item.ui?.item, item.class] })
                  }, {
                    default: withCtx(() => [
                      createVNode("div", {
                        class: ui.value.container({ class: [props.ui?.container, item.ui?.container] })
                      }, [
                        createVNode(unref(RadioGroupItem), {
                          id: item.id,
                          value: item.value,
                          disabled: item.disabled,
                          class: ui.value.base({ class: [props.ui?.base, item.ui?.base], disabled: item.disabled })
                        }, {
                          default: withCtx(() => [
                            createVNode(unref(RadioGroupIndicator), {
                              class: ui.value.indicator({ class: [props.ui?.indicator, item.ui?.indicator] })
                            }, null, 8, ["class"])
                          ]),
                          _: 2
                        }, 1032, ["id", "value", "disabled", "class"])
                      ], 2),
                      item.label || !!slots.label || (item.description || !!slots.description) ? (openBlock(), createBlock("div", {
                        key: 0,
                        class: ui.value.wrapper({ class: [props.ui?.wrapper, item.ui?.wrapper] })
                      }, [
                        item.label || !!slots.label ? (openBlock(), createBlock(resolveDynamicComponent(!__props.variant || __props.variant === "list" ? unref(Label) : "p"), {
                          key: 0,
                          for: item.id,
                          class: ui.value.label({ class: [props.ui?.label, item.ui?.label] })
                        }, {
                          default: withCtx(() => [
                            renderSlot(_ctx.$slots, "label", {
                              item,
                              modelValue: __props.modelValue
                            }, () => [
                              createTextVNode(toDisplayString(item.label), 1)
                            ])
                          ]),
                          _: 2
                        }, 1032, ["for", "class"])) : createCommentVNode("", true),
                        item.description || !!slots.description ? (openBlock(), createBlock("p", {
                          key: 1,
                          class: ui.value.description({ class: [props.ui?.description, item.ui?.description] })
                        }, [
                          renderSlot(_ctx.$slots, "description", {
                            item,
                            modelValue: __props.modelValue
                          }, () => [
                            createTextVNode(toDisplayString(item.description), 1)
                          ])
                        ], 2)) : createCommentVNode("", true)
                      ], 2)) : createCommentVNode("", true)
                    ]),
                    _: 2
                  }, 1032, ["class"]);
                }), 128))
              ], 16)
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
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("../node_modules/.pnpm/@nuxt+ui@4.0.0-alpha.2_@babel+parser@7.28.0_@netlify+blobs@9.1.2_axios@1.12.2_change-ca_9e32dd265ffe56b992951caaa30208b5/node_modules/@nuxt/ui/dist/runtime/components/RadioGroup.vue");
  return _sfc_setup$2 ? _sfc_setup$2(props, ctx) : void 0;
};
const theme = {
  "slots": {
    "root": "flex items-center align-center text-center",
    "border": "",
    "container": "font-medium text-default flex",
    "icon": "shrink-0 size-5",
    "avatar": "shrink-0",
    "avatarSize": "2xs",
    "label": "text-sm"
  },
  "variants": {
    "color": {
      "primary": {
        "border": "border-primary"
      },
      "secondary": {
        "border": "border-secondary"
      },
      "success": {
        "border": "border-success"
      },
      "info": {
        "border": "border-info"
      },
      "warning": {
        "border": "border-warning"
      },
      "error": {
        "border": "border-error"
      },
      "neutral": {
        "border": "border-default"
      }
    },
    "orientation": {
      "horizontal": {
        "root": "w-full flex-row",
        "border": "w-full",
        "container": "mx-3 whitespace-nowrap"
      },
      "vertical": {
        "root": "h-full flex-col",
        "border": "h-full",
        "container": "my-2"
      }
    },
    "size": {
      "xs": "",
      "sm": "",
      "md": "",
      "lg": "",
      "xl": ""
    },
    "type": {
      "solid": {
        "border": "border-solid"
      },
      "dashed": {
        "border": "border-dashed"
      },
      "dotted": {
        "border": "border-dotted"
      }
    }
  },
  "compoundVariants": [
    {
      "orientation": "horizontal",
      "size": "xs",
      "class": {
        "border": "border-t"
      }
    },
    {
      "orientation": "horizontal",
      "size": "sm",
      "class": {
        "border": "border-t-[2px]"
      }
    },
    {
      "orientation": "horizontal",
      "size": "md",
      "class": {
        "border": "border-t-[3px]"
      }
    },
    {
      "orientation": "horizontal",
      "size": "lg",
      "class": {
        "border": "border-t-[4px]"
      }
    },
    {
      "orientation": "horizontal",
      "size": "xl",
      "class": {
        "border": "border-t-[5px]"
      }
    },
    {
      "orientation": "vertical",
      "size": "xs",
      "class": {
        "border": "border-s"
      }
    },
    {
      "orientation": "vertical",
      "size": "sm",
      "class": {
        "border": "border-s-[2px]"
      }
    },
    {
      "orientation": "vertical",
      "size": "md",
      "class": {
        "border": "border-s-[3px]"
      }
    },
    {
      "orientation": "vertical",
      "size": "lg",
      "class": {
        "border": "border-s-[4px]"
      }
    },
    {
      "orientation": "vertical",
      "size": "xl",
      "class": {
        "border": "border-s-[5px]"
      }
    }
  ],
  "defaultVariants": {
    "color": "neutral",
    "size": "xs",
    "type": "solid"
  }
};
const _sfc_main$1 = {
  __name: "USeparator",
  __ssrInlineRender: true,
  props: {
    as: { type: null, required: false },
    label: { type: String, required: false },
    icon: { type: [String, Object], required: false },
    avatar: { type: Object, required: false },
    color: { type: null, required: false },
    size: { type: null, required: false },
    type: { type: null, required: false },
    orientation: { type: null, required: false, default: "horizontal" },
    class: { type: null, required: false },
    ui: { type: null, required: false },
    decorative: { type: Boolean, required: false }
  },
  setup(__props) {
    const props = __props;
    const slots = useSlots();
    const appConfig = useAppConfig();
    const rootProps = useForwardProps(reactivePick(props, "as", "decorative", "orientation"));
    const ui = computed(() => tv({ extend: tv(theme), ...appConfig.ui?.separator || {} })({
      color: props.color,
      orientation: props.orientation,
      size: props.size,
      type: props.type
    }));
    return (_ctx, _push, _parent, _attrs) => {
      _push(ssrRenderComponent(unref(Separator), mergeProps(unref(rootProps), {
        class: ui.value.root({ class: [props.ui?.root, props.class] })
      }, _attrs), {
        default: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            _push2(`<div class="${ssrRenderClass(ui.value.border({ class: props.ui?.border }))}"${_scopeId}></div>`);
            if (__props.label || __props.icon || __props.avatar || !!slots.default) {
              _push2(`<!--[--><div class="${ssrRenderClass(ui.value.container({ class: props.ui?.container }))}"${_scopeId}>`);
              ssrRenderSlot(_ctx.$slots, "default", {}, () => {
                if (__props.label) {
                  _push2(`<span class="${ssrRenderClass(ui.value.label({ class: props.ui?.label }))}"${_scopeId}>${ssrInterpolate(__props.label)}</span>`);
                } else if (__props.icon) {
                  _push2(ssrRenderComponent(_sfc_main$e, {
                    name: __props.icon,
                    class: ui.value.icon({ class: props.ui?.icon })
                  }, null, _parent2, _scopeId));
                } else if (__props.avatar) {
                  _push2(ssrRenderComponent(_sfc_main$c, mergeProps({
                    size: props.ui?.avatarSize || ui.value.avatarSize()
                  }, __props.avatar, {
                    class: ui.value.avatar({ class: props.ui?.avatar })
                  }), null, _parent2, _scopeId));
                } else {
                  _push2(`<!---->`);
                }
              }, _push2, _parent2, _scopeId);
              _push2(`</div><div class="${ssrRenderClass(ui.value.border({ class: props.ui?.border }))}"${_scopeId}></div><!--]-->`);
            } else {
              _push2(`<!---->`);
            }
          } else {
            return [
              createVNode("div", {
                class: ui.value.border({ class: props.ui?.border })
              }, null, 2),
              __props.label || __props.icon || __props.avatar || !!slots.default ? (openBlock(), createBlock(Fragment, { key: 0 }, [
                createVNode("div", {
                  class: ui.value.container({ class: props.ui?.container })
                }, [
                  renderSlot(_ctx.$slots, "default", {}, () => [
                    __props.label ? (openBlock(), createBlock("span", {
                      key: 0,
                      class: ui.value.label({ class: props.ui?.label })
                    }, toDisplayString(__props.label), 3)) : __props.icon ? (openBlock(), createBlock(_sfc_main$e, {
                      key: 1,
                      name: __props.icon,
                      class: ui.value.icon({ class: props.ui?.icon })
                    }, null, 8, ["name", "class"])) : __props.avatar ? (openBlock(), createBlock(_sfc_main$c, mergeProps({
                      key: 2,
                      size: props.ui?.avatarSize || ui.value.avatarSize()
                    }, __props.avatar, {
                      class: ui.value.avatar({ class: props.ui?.avatar })
                    }), null, 16, ["size", "class"])) : createCommentVNode("", true)
                  ])
                ], 2),
                createVNode("div", {
                  class: ui.value.border({ class: props.ui?.border })
                }, null, 2)
              ], 64)) : createCommentVNode("", true)
            ];
          }
        }),
        _: 3
      }, _parent));
    };
  }
};
const _sfc_setup$1 = _sfc_main$1.setup;
_sfc_main$1.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("../node_modules/.pnpm/@nuxt+ui@4.0.0-alpha.2_@babel+parser@7.28.0_@netlify+blobs@9.1.2_axios@1.12.2_change-ca_9e32dd265ffe56b992951caaa30208b5/node_modules/@nuxt/ui/dist/runtime/components/Separator.vue");
  return _sfc_setup$1 ? _sfc_setup$1(props, ctx) : void 0;
};
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "index",
  __ssrInlineRender: true,
  async setup(__props) {
    let __temp, __restore;
    const fileRef = ref();
    const profileSchema = z.object({
      name: z.string().min(2, "Too short"),
      email: z.string().email("Invalid email"),
      username: z.string().min(2, "Too short"),
      avatar: z.string().optional(),
      bio: z.string().optional()
    });
    const profile = reactive({
      name: "Benjamin Canac",
      email: "ben@nuxtlabs.com",
      username: "benjamincanac",
      avatar: void 0,
      bio: void 0
    });
    const toast = useToast();
    async function onSubmit(event) {
      toast.add({
        title: "Success",
        description: "Your settings have been updated.",
        icon: "i-lucide-check",
        color: "success"
      });
      console.log(event.data);
    }
    function onFileChange(e) {
      const input = e.target;
      if (!input.files?.length) {
        return;
      }
      profile.avatar = URL.createObjectURL(input.files[0]);
    }
    function onFileClick() {
      fileRef.value?.click();
    }
    const { data: xeroStatus, refresh: refreshStatus } = ([__temp, __restore] = withAsyncContext(() => useFetch("/api/xero/status", { server: false }, "$a_dRQwkjag")), __temp = await __temp, __restore(), __temp);
    const tenantOptions = ref([]);
    const tenantsLoading = ref(false);
    async function loadTenants() {
      try {
        tenantsLoading.value = true;
        const list = await $fetch("/api/xero/tenants");
        tenantOptions.value = (list || []).map((t) => ({ label: t.tenantName, value: t.tenantId }));
      } catch {
        tenantOptions.value = [];
      } finally {
        tenantsLoading.value = false;
      }
    }
    watch(() => xeroStatus?.value?.connected, async (connected) => {
      if (connected) {
        await loadTenants();
      } else {
        tenantOptions.value = [];
      }
    });
    const selectedTenant = ref(void 0);
    watch(() => xeroStatus.value?.selectedTenantId, (v) => {
      selectedTenant.value = v;
    });
    async function selectTenant(tenantId) {
      await $fetch("/api/xero/select-tenant", { method: "POST", body: { tenantId } });
      await refreshStatus();
      toast.add({ title: "Organization selected", icon: "i-lucide-check", color: "success" });
    }
    return (_ctx, _push, _parent, _attrs) => {
      const _component_UForm = _sfc_main$3;
      const _component_UPageCard = _sfc_main$4;
      const _component_UButton = _sfc_main$9;
      const _component_UIcon = _sfc_main$e;
      const _component_UFormField = _sfc_main$5;
      const _component_USelectMenu = _sfc_main$6;
      const _component_URadioGroup = _sfc_main$2;
      const _component_UInput = _sfc_main$7;
      const _component_USeparator = _sfc_main$1;
      const _component_UAvatar = _sfc_main$c;
      const _component_UTextarea = _sfc_main$8;
      _push(ssrRenderComponent(_component_UForm, mergeProps({
        id: "settings",
        schema: unref(profileSchema),
        state: unref(profile),
        onSubmit
      }, _attrs), {
        default: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            _push2(ssrRenderComponent(_component_UPageCard, {
              title: "Profile",
              description: "These informations will be displayed publicly.",
              variant: "naked",
              orientation: "horizontal",
              class: "mb-4"
            }, {
              default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                if (_push3) {
                  _push3(ssrRenderComponent(_component_UButton, {
                    form: "settings",
                    label: "Save changes",
                    color: "neutral",
                    type: "submit",
                    class: "w-fit lg:ms-auto"
                  }, null, _parent3, _scopeId2));
                } else {
                  return [
                    createVNode(_component_UButton, {
                      form: "settings",
                      label: "Save changes",
                      color: "neutral",
                      type: "submit",
                      class: "w-fit lg:ms-auto"
                    })
                  ];
                }
              }),
              _: 1
            }, _parent2, _scopeId));
            _push2(ssrRenderComponent(_component_UPageCard, {
              title: "Xero Connection",
              description: "Connect your Xero account to enable live financial data.",
              variant: "subtle",
              class: "mb-4"
            }, {
              default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                if (_push3) {
                  _push3(`<div class="flex items-center justify-between"${_scopeId2}><div class="flex items-center gap-2"${_scopeId2}>`);
                  _push3(ssrRenderComponent(_component_UIcon, {
                    name: unref(xeroStatus)?.connected ? "i-lucide-badge-check" : "i-lucide-plug"
                  }, null, _parent3, _scopeId2));
                  _push3(`<span${_scopeId2}>${ssrInterpolate(unref(xeroStatus)?.connected ? "Connected" : "Not connected")}</span></div><div class="flex items-center gap-2"${_scopeId2}>`);
                  _push3(ssrRenderComponent(_component_UButton, {
                    label: unref(xeroStatus)?.connected ? "Reconnect" : "Connect Xero",
                    color: "primary",
                    href: "/api/xero/login"
                  }, null, _parent3, _scopeId2));
                  if (unref(xeroStatus)?.connected) {
                    _push3(ssrRenderComponent(_component_UButton, {
                      label: "Refresh orgs",
                      color: "neutral",
                      variant: "outline",
                      onClick: loadTenants
                    }, null, _parent3, _scopeId2));
                  } else {
                    _push3(`<!---->`);
                  }
                  _push3(`</div></div>`);
                  if (unref(xeroStatus)?.connected) {
                    _push3(`<div class="mt-4 space-y-3"${_scopeId2}>`);
                    _push3(ssrRenderComponent(_component_UFormField, {
                      label: "Organization",
                      class: "flex items-center justify-between gap-4"
                    }, {
                      default: withCtx((_3, _push4, _parent4, _scopeId3) => {
                        if (_push4) {
                          _push4(ssrRenderComponent(_component_USelectMenu, {
                            loading: unref(tenantsLoading),
                            options: unref(tenantOptions),
                            placeholder: "Select an organization",
                            "model-value": unref(xeroStatus)?.selectedTenantId || void 0,
                            "onUpdate:modelValue": selectTenant,
                            class: "w-full max-w-md"
                          }, null, _parent4, _scopeId3));
                        } else {
                          return [
                            createVNode(_component_USelectMenu, {
                              loading: unref(tenantsLoading),
                              options: unref(tenantOptions),
                              placeholder: "Select an organization",
                              "model-value": unref(xeroStatus)?.selectedTenantId || void 0,
                              "onUpdate:modelValue": selectTenant,
                              class: "w-full max-w-md"
                            }, null, 8, ["loading", "options", "model-value"])
                          ];
                        }
                      }),
                      _: 1
                    }, _parent3, _scopeId2));
                    if (unref(tenantOptions).length) {
                      _push3(`<div class="text-xs text-muted"${_scopeId2}>Found ${ssrInterpolate(unref(tenantOptions).length)} organization(s).</div>`);
                    } else {
                      _push3(`<!---->`);
                    }
                    if (!unref(tenantOptions).length) {
                      _push3(`<div class="text-xs text-muted"${_scopeId2}> No organizations loaded. Click Refresh orgs or Reconnect and select an org on the consent screen. </div>`);
                    } else {
                      _push3(`<!---->`);
                    }
                    if (unref(tenantOptions).length) {
                      _push3(`<div class="pt-1"${_scopeId2}>`);
                      _push3(ssrRenderComponent(_component_URadioGroup, {
                        modelValue: unref(selectedTenant),
                        "onUpdate:modelValue": [($event) => isRef(selectedTenant) ? selectedTenant.value = $event : null, selectTenant],
                        options: unref(tenantOptions),
                        legend: "Or pick below"
                      }, null, _parent3, _scopeId2));
                      _push3(`<div class="mt-2 flex flex-wrap gap-2"${_scopeId2}><!--[-->`);
                      ssrRenderList(unref(tenantOptions), (opt) => {
                        _push3(ssrRenderComponent(_component_UButton, {
                          key: opt.value,
                          color: "neutral",
                          variant: "outline",
                          label: opt.label,
                          onClick: ($event) => selectTenant(opt.value)
                        }, null, _parent3, _scopeId2));
                      });
                      _push3(`<!--]--></div><div class="text-2xs text-dimmed mt-1"${_scopeId2}>Debug: ${ssrInterpolate(unref(tenantOptions))}</div></div>`);
                    } else {
                      _push3(`<!---->`);
                    }
                    _push3(`</div>`);
                  } else {
                    _push3(`<!---->`);
                  }
                } else {
                  return [
                    createVNode("div", { class: "flex items-center justify-between" }, [
                      createVNode("div", { class: "flex items-center gap-2" }, [
                        createVNode(_component_UIcon, {
                          name: unref(xeroStatus)?.connected ? "i-lucide-badge-check" : "i-lucide-plug"
                        }, null, 8, ["name"]),
                        createVNode("span", null, toDisplayString(unref(xeroStatus)?.connected ? "Connected" : "Not connected"), 1)
                      ]),
                      createVNode("div", { class: "flex items-center gap-2" }, [
                        createVNode(_component_UButton, {
                          label: unref(xeroStatus)?.connected ? "Reconnect" : "Connect Xero",
                          color: "primary",
                          href: "/api/xero/login"
                        }, null, 8, ["label"]),
                        unref(xeroStatus)?.connected ? (openBlock(), createBlock(_component_UButton, {
                          key: 0,
                          label: "Refresh orgs",
                          color: "neutral",
                          variant: "outline",
                          onClick: loadTenants
                        })) : createCommentVNode("", true)
                      ])
                    ]),
                    unref(xeroStatus)?.connected ? (openBlock(), createBlock("div", {
                      key: 0,
                      class: "mt-4 space-y-3"
                    }, [
                      createVNode(_component_UFormField, {
                        label: "Organization",
                        class: "flex items-center justify-between gap-4"
                      }, {
                        default: withCtx(() => [
                          createVNode(_component_USelectMenu, {
                            loading: unref(tenantsLoading),
                            options: unref(tenantOptions),
                            placeholder: "Select an organization",
                            "model-value": unref(xeroStatus)?.selectedTenantId || void 0,
                            "onUpdate:modelValue": selectTenant,
                            class: "w-full max-w-md"
                          }, null, 8, ["loading", "options", "model-value"])
                        ]),
                        _: 1
                      }),
                      unref(tenantOptions).length ? (openBlock(), createBlock("div", {
                        key: 0,
                        class: "text-xs text-muted"
                      }, "Found " + toDisplayString(unref(tenantOptions).length) + " organization(s).", 1)) : createCommentVNode("", true),
                      !unref(tenantOptions).length ? (openBlock(), createBlock("div", {
                        key: 1,
                        class: "text-xs text-muted"
                      }, " No organizations loaded. Click Refresh orgs or Reconnect and select an org on the consent screen. ")) : createCommentVNode("", true),
                      unref(tenantOptions).length ? (openBlock(), createBlock("div", {
                        key: 2,
                        class: "pt-1"
                      }, [
                        createVNode(_component_URadioGroup, {
                          modelValue: unref(selectedTenant),
                          "onUpdate:modelValue": [($event) => isRef(selectedTenant) ? selectedTenant.value = $event : null, selectTenant],
                          options: unref(tenantOptions),
                          legend: "Or pick below"
                        }, null, 8, ["modelValue", "onUpdate:modelValue", "options"]),
                        createVNode("div", { class: "mt-2 flex flex-wrap gap-2" }, [
                          (openBlock(true), createBlock(Fragment, null, renderList(unref(tenantOptions), (opt) => {
                            return openBlock(), createBlock(_component_UButton, {
                              key: opt.value,
                              color: "neutral",
                              variant: "outline",
                              label: opt.label,
                              onClick: ($event) => selectTenant(opt.value)
                            }, null, 8, ["label", "onClick"]);
                          }), 128))
                        ]),
                        createVNode("div", { class: "text-2xs text-dimmed mt-1" }, "Debug: " + toDisplayString(unref(tenantOptions)), 1)
                      ])) : createCommentVNode("", true)
                    ])) : createCommentVNode("", true)
                  ];
                }
              }),
              _: 1
            }, _parent2, _scopeId));
            _push2(ssrRenderComponent(_component_UPageCard, { variant: "subtle" }, {
              default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                if (_push3) {
                  _push3(ssrRenderComponent(_component_UFormField, {
                    name: "name",
                    label: "Name",
                    description: "Will appear on receipts, invoices, and other communication.",
                    required: "",
                    class: "flex max-sm:flex-col justify-between items-start gap-4"
                  }, {
                    default: withCtx((_3, _push4, _parent4, _scopeId3) => {
                      if (_push4) {
                        _push4(ssrRenderComponent(_component_UInput, {
                          modelValue: unref(profile).name,
                          "onUpdate:modelValue": ($event) => unref(profile).name = $event,
                          autocomplete: "off"
                        }, null, _parent4, _scopeId3));
                      } else {
                        return [
                          createVNode(_component_UInput, {
                            modelValue: unref(profile).name,
                            "onUpdate:modelValue": ($event) => unref(profile).name = $event,
                            autocomplete: "off"
                          }, null, 8, ["modelValue", "onUpdate:modelValue"])
                        ];
                      }
                    }),
                    _: 1
                  }, _parent3, _scopeId2));
                  _push3(ssrRenderComponent(_component_USeparator, null, null, _parent3, _scopeId2));
                  _push3(ssrRenderComponent(_component_UFormField, {
                    name: "email",
                    label: "Email",
                    description: "Used to sign in, for email receipts and product updates.",
                    required: "",
                    class: "flex max-sm:flex-col justify-between items-start gap-4"
                  }, {
                    default: withCtx((_3, _push4, _parent4, _scopeId3) => {
                      if (_push4) {
                        _push4(ssrRenderComponent(_component_UInput, {
                          modelValue: unref(profile).email,
                          "onUpdate:modelValue": ($event) => unref(profile).email = $event,
                          type: "email",
                          autocomplete: "off"
                        }, null, _parent4, _scopeId3));
                      } else {
                        return [
                          createVNode(_component_UInput, {
                            modelValue: unref(profile).email,
                            "onUpdate:modelValue": ($event) => unref(profile).email = $event,
                            type: "email",
                            autocomplete: "off"
                          }, null, 8, ["modelValue", "onUpdate:modelValue"])
                        ];
                      }
                    }),
                    _: 1
                  }, _parent3, _scopeId2));
                  _push3(ssrRenderComponent(_component_USeparator, null, null, _parent3, _scopeId2));
                  _push3(ssrRenderComponent(_component_UFormField, {
                    name: "username",
                    label: "Username",
                    description: "Your unique username for logging in and your profile URL.",
                    required: "",
                    class: "flex max-sm:flex-col justify-between items-start gap-4"
                  }, {
                    default: withCtx((_3, _push4, _parent4, _scopeId3) => {
                      if (_push4) {
                        _push4(ssrRenderComponent(_component_UInput, {
                          modelValue: unref(profile).username,
                          "onUpdate:modelValue": ($event) => unref(profile).username = $event,
                          type: "username",
                          autocomplete: "off"
                        }, null, _parent4, _scopeId3));
                      } else {
                        return [
                          createVNode(_component_UInput, {
                            modelValue: unref(profile).username,
                            "onUpdate:modelValue": ($event) => unref(profile).username = $event,
                            type: "username",
                            autocomplete: "off"
                          }, null, 8, ["modelValue", "onUpdate:modelValue"])
                        ];
                      }
                    }),
                    _: 1
                  }, _parent3, _scopeId2));
                  _push3(ssrRenderComponent(_component_USeparator, null, null, _parent3, _scopeId2));
                  _push3(ssrRenderComponent(_component_UFormField, {
                    name: "avatar",
                    label: "Avatar",
                    description: "JPG, GIF or PNG. 1MB Max.",
                    class: "flex max-sm:flex-col justify-between sm:items-center gap-4"
                  }, {
                    default: withCtx((_3, _push4, _parent4, _scopeId3) => {
                      if (_push4) {
                        _push4(`<div class="flex flex-wrap items-center gap-3"${_scopeId3}>`);
                        _push4(ssrRenderComponent(_component_UAvatar, {
                          src: unref(profile).avatar,
                          alt: unref(profile).name,
                          size: "lg"
                        }, null, _parent4, _scopeId3));
                        _push4(ssrRenderComponent(_component_UButton, {
                          label: "Choose",
                          color: "neutral",
                          onClick: onFileClick
                        }, null, _parent4, _scopeId3));
                        _push4(`<input type="file" class="hidden" accept=".jpg, .jpeg, .png, .gif"${_scopeId3}></div>`);
                      } else {
                        return [
                          createVNode("div", { class: "flex flex-wrap items-center gap-3" }, [
                            createVNode(_component_UAvatar, {
                              src: unref(profile).avatar,
                              alt: unref(profile).name,
                              size: "lg"
                            }, null, 8, ["src", "alt"]),
                            createVNode(_component_UButton, {
                              label: "Choose",
                              color: "neutral",
                              onClick: onFileClick
                            }),
                            createVNode("input", {
                              ref_key: "fileRef",
                              ref: fileRef,
                              type: "file",
                              class: "hidden",
                              accept: ".jpg, .jpeg, .png, .gif",
                              onChange: onFileChange
                            }, null, 544)
                          ])
                        ];
                      }
                    }),
                    _: 1
                  }, _parent3, _scopeId2));
                  _push3(ssrRenderComponent(_component_USeparator, null, null, _parent3, _scopeId2));
                  _push3(ssrRenderComponent(_component_UFormField, {
                    name: "bio",
                    label: "Bio",
                    description: "Brief description for your profile. URLs are hyperlinked.",
                    class: "flex max-sm:flex-col justify-between items-start gap-4",
                    ui: { container: "w-full" }
                  }, {
                    default: withCtx((_3, _push4, _parent4, _scopeId3) => {
                      if (_push4) {
                        _push4(ssrRenderComponent(_component_UTextarea, {
                          modelValue: unref(profile).bio,
                          "onUpdate:modelValue": ($event) => unref(profile).bio = $event,
                          rows: 5,
                          autoresize: "",
                          class: "w-full"
                        }, null, _parent4, _scopeId3));
                      } else {
                        return [
                          createVNode(_component_UTextarea, {
                            modelValue: unref(profile).bio,
                            "onUpdate:modelValue": ($event) => unref(profile).bio = $event,
                            rows: 5,
                            autoresize: "",
                            class: "w-full"
                          }, null, 8, ["modelValue", "onUpdate:modelValue"])
                        ];
                      }
                    }),
                    _: 1
                  }, _parent3, _scopeId2));
                } else {
                  return [
                    createVNode(_component_UFormField, {
                      name: "name",
                      label: "Name",
                      description: "Will appear on receipts, invoices, and other communication.",
                      required: "",
                      class: "flex max-sm:flex-col justify-between items-start gap-4"
                    }, {
                      default: withCtx(() => [
                        createVNode(_component_UInput, {
                          modelValue: unref(profile).name,
                          "onUpdate:modelValue": ($event) => unref(profile).name = $event,
                          autocomplete: "off"
                        }, null, 8, ["modelValue", "onUpdate:modelValue"])
                      ]),
                      _: 1
                    }),
                    createVNode(_component_USeparator),
                    createVNode(_component_UFormField, {
                      name: "email",
                      label: "Email",
                      description: "Used to sign in, for email receipts and product updates.",
                      required: "",
                      class: "flex max-sm:flex-col justify-between items-start gap-4"
                    }, {
                      default: withCtx(() => [
                        createVNode(_component_UInput, {
                          modelValue: unref(profile).email,
                          "onUpdate:modelValue": ($event) => unref(profile).email = $event,
                          type: "email",
                          autocomplete: "off"
                        }, null, 8, ["modelValue", "onUpdate:modelValue"])
                      ]),
                      _: 1
                    }),
                    createVNode(_component_USeparator),
                    createVNode(_component_UFormField, {
                      name: "username",
                      label: "Username",
                      description: "Your unique username for logging in and your profile URL.",
                      required: "",
                      class: "flex max-sm:flex-col justify-between items-start gap-4"
                    }, {
                      default: withCtx(() => [
                        createVNode(_component_UInput, {
                          modelValue: unref(profile).username,
                          "onUpdate:modelValue": ($event) => unref(profile).username = $event,
                          type: "username",
                          autocomplete: "off"
                        }, null, 8, ["modelValue", "onUpdate:modelValue"])
                      ]),
                      _: 1
                    }),
                    createVNode(_component_USeparator),
                    createVNode(_component_UFormField, {
                      name: "avatar",
                      label: "Avatar",
                      description: "JPG, GIF or PNG. 1MB Max.",
                      class: "flex max-sm:flex-col justify-between sm:items-center gap-4"
                    }, {
                      default: withCtx(() => [
                        createVNode("div", { class: "flex flex-wrap items-center gap-3" }, [
                          createVNode(_component_UAvatar, {
                            src: unref(profile).avatar,
                            alt: unref(profile).name,
                            size: "lg"
                          }, null, 8, ["src", "alt"]),
                          createVNode(_component_UButton, {
                            label: "Choose",
                            color: "neutral",
                            onClick: onFileClick
                          }),
                          createVNode("input", {
                            ref_key: "fileRef",
                            ref: fileRef,
                            type: "file",
                            class: "hidden",
                            accept: ".jpg, .jpeg, .png, .gif",
                            onChange: onFileChange
                          }, null, 544)
                        ])
                      ]),
                      _: 1
                    }),
                    createVNode(_component_USeparator),
                    createVNode(_component_UFormField, {
                      name: "bio",
                      label: "Bio",
                      description: "Brief description for your profile. URLs are hyperlinked.",
                      class: "flex max-sm:flex-col justify-between items-start gap-4",
                      ui: { container: "w-full" }
                    }, {
                      default: withCtx(() => [
                        createVNode(_component_UTextarea, {
                          modelValue: unref(profile).bio,
                          "onUpdate:modelValue": ($event) => unref(profile).bio = $event,
                          rows: 5,
                          autoresize: "",
                          class: "w-full"
                        }, null, 8, ["modelValue", "onUpdate:modelValue"])
                      ]),
                      _: 1
                    })
                  ];
                }
              }),
              _: 1
            }, _parent2, _scopeId));
          } else {
            return [
              createVNode(_component_UPageCard, {
                title: "Profile",
                description: "These informations will be displayed publicly.",
                variant: "naked",
                orientation: "horizontal",
                class: "mb-4"
              }, {
                default: withCtx(() => [
                  createVNode(_component_UButton, {
                    form: "settings",
                    label: "Save changes",
                    color: "neutral",
                    type: "submit",
                    class: "w-fit lg:ms-auto"
                  })
                ]),
                _: 1
              }),
              createVNode(_component_UPageCard, {
                title: "Xero Connection",
                description: "Connect your Xero account to enable live financial data.",
                variant: "subtle",
                class: "mb-4"
              }, {
                default: withCtx(() => [
                  createVNode("div", { class: "flex items-center justify-between" }, [
                    createVNode("div", { class: "flex items-center gap-2" }, [
                      createVNode(_component_UIcon, {
                        name: unref(xeroStatus)?.connected ? "i-lucide-badge-check" : "i-lucide-plug"
                      }, null, 8, ["name"]),
                      createVNode("span", null, toDisplayString(unref(xeroStatus)?.connected ? "Connected" : "Not connected"), 1)
                    ]),
                    createVNode("div", { class: "flex items-center gap-2" }, [
                      createVNode(_component_UButton, {
                        label: unref(xeroStatus)?.connected ? "Reconnect" : "Connect Xero",
                        color: "primary",
                        href: "/api/xero/login"
                      }, null, 8, ["label"]),
                      unref(xeroStatus)?.connected ? (openBlock(), createBlock(_component_UButton, {
                        key: 0,
                        label: "Refresh orgs",
                        color: "neutral",
                        variant: "outline",
                        onClick: loadTenants
                      })) : createCommentVNode("", true)
                    ])
                  ]),
                  unref(xeroStatus)?.connected ? (openBlock(), createBlock("div", {
                    key: 0,
                    class: "mt-4 space-y-3"
                  }, [
                    createVNode(_component_UFormField, {
                      label: "Organization",
                      class: "flex items-center justify-between gap-4"
                    }, {
                      default: withCtx(() => [
                        createVNode(_component_USelectMenu, {
                          loading: unref(tenantsLoading),
                          options: unref(tenantOptions),
                          placeholder: "Select an organization",
                          "model-value": unref(xeroStatus)?.selectedTenantId || void 0,
                          "onUpdate:modelValue": selectTenant,
                          class: "w-full max-w-md"
                        }, null, 8, ["loading", "options", "model-value"])
                      ]),
                      _: 1
                    }),
                    unref(tenantOptions).length ? (openBlock(), createBlock("div", {
                      key: 0,
                      class: "text-xs text-muted"
                    }, "Found " + toDisplayString(unref(tenantOptions).length) + " organization(s).", 1)) : createCommentVNode("", true),
                    !unref(tenantOptions).length ? (openBlock(), createBlock("div", {
                      key: 1,
                      class: "text-xs text-muted"
                    }, " No organizations loaded. Click Refresh orgs or Reconnect and select an org on the consent screen. ")) : createCommentVNode("", true),
                    unref(tenantOptions).length ? (openBlock(), createBlock("div", {
                      key: 2,
                      class: "pt-1"
                    }, [
                      createVNode(_component_URadioGroup, {
                        modelValue: unref(selectedTenant),
                        "onUpdate:modelValue": [($event) => isRef(selectedTenant) ? selectedTenant.value = $event : null, selectTenant],
                        options: unref(tenantOptions),
                        legend: "Or pick below"
                      }, null, 8, ["modelValue", "onUpdate:modelValue", "options"]),
                      createVNode("div", { class: "mt-2 flex flex-wrap gap-2" }, [
                        (openBlock(true), createBlock(Fragment, null, renderList(unref(tenantOptions), (opt) => {
                          return openBlock(), createBlock(_component_UButton, {
                            key: opt.value,
                            color: "neutral",
                            variant: "outline",
                            label: opt.label,
                            onClick: ($event) => selectTenant(opt.value)
                          }, null, 8, ["label", "onClick"]);
                        }), 128))
                      ]),
                      createVNode("div", { class: "text-2xs text-dimmed mt-1" }, "Debug: " + toDisplayString(unref(tenantOptions)), 1)
                    ])) : createCommentVNode("", true)
                  ])) : createCommentVNode("", true)
                ]),
                _: 1
              }),
              createVNode(_component_UPageCard, { variant: "subtle" }, {
                default: withCtx(() => [
                  createVNode(_component_UFormField, {
                    name: "name",
                    label: "Name",
                    description: "Will appear on receipts, invoices, and other communication.",
                    required: "",
                    class: "flex max-sm:flex-col justify-between items-start gap-4"
                  }, {
                    default: withCtx(() => [
                      createVNode(_component_UInput, {
                        modelValue: unref(profile).name,
                        "onUpdate:modelValue": ($event) => unref(profile).name = $event,
                        autocomplete: "off"
                      }, null, 8, ["modelValue", "onUpdate:modelValue"])
                    ]),
                    _: 1
                  }),
                  createVNode(_component_USeparator),
                  createVNode(_component_UFormField, {
                    name: "email",
                    label: "Email",
                    description: "Used to sign in, for email receipts and product updates.",
                    required: "",
                    class: "flex max-sm:flex-col justify-between items-start gap-4"
                  }, {
                    default: withCtx(() => [
                      createVNode(_component_UInput, {
                        modelValue: unref(profile).email,
                        "onUpdate:modelValue": ($event) => unref(profile).email = $event,
                        type: "email",
                        autocomplete: "off"
                      }, null, 8, ["modelValue", "onUpdate:modelValue"])
                    ]),
                    _: 1
                  }),
                  createVNode(_component_USeparator),
                  createVNode(_component_UFormField, {
                    name: "username",
                    label: "Username",
                    description: "Your unique username for logging in and your profile URL.",
                    required: "",
                    class: "flex max-sm:flex-col justify-between items-start gap-4"
                  }, {
                    default: withCtx(() => [
                      createVNode(_component_UInput, {
                        modelValue: unref(profile).username,
                        "onUpdate:modelValue": ($event) => unref(profile).username = $event,
                        type: "username",
                        autocomplete: "off"
                      }, null, 8, ["modelValue", "onUpdate:modelValue"])
                    ]),
                    _: 1
                  }),
                  createVNode(_component_USeparator),
                  createVNode(_component_UFormField, {
                    name: "avatar",
                    label: "Avatar",
                    description: "JPG, GIF or PNG. 1MB Max.",
                    class: "flex max-sm:flex-col justify-between sm:items-center gap-4"
                  }, {
                    default: withCtx(() => [
                      createVNode("div", { class: "flex flex-wrap items-center gap-3" }, [
                        createVNode(_component_UAvatar, {
                          src: unref(profile).avatar,
                          alt: unref(profile).name,
                          size: "lg"
                        }, null, 8, ["src", "alt"]),
                        createVNode(_component_UButton, {
                          label: "Choose",
                          color: "neutral",
                          onClick: onFileClick
                        }),
                        createVNode("input", {
                          ref_key: "fileRef",
                          ref: fileRef,
                          type: "file",
                          class: "hidden",
                          accept: ".jpg, .jpeg, .png, .gif",
                          onChange: onFileChange
                        }, null, 544)
                      ])
                    ]),
                    _: 1
                  }),
                  createVNode(_component_USeparator),
                  createVNode(_component_UFormField, {
                    name: "bio",
                    label: "Bio",
                    description: "Brief description for your profile. URLs are hyperlinked.",
                    class: "flex max-sm:flex-col justify-between items-start gap-4",
                    ui: { container: "w-full" }
                  }, {
                    default: withCtx(() => [
                      createVNode(_component_UTextarea, {
                        modelValue: unref(profile).bio,
                        "onUpdate:modelValue": ($event) => unref(profile).bio = $event,
                        rows: 5,
                        autoresize: "",
                        class: "w-full"
                      }, null, 8, ["modelValue", "onUpdate:modelValue"])
                    ]),
                    _: 1
                  })
                ]),
                _: 1
              })
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
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("pages/settings/index.vue");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};

export { _sfc_main as default };
//# sourceMappingURL=index-BU5u3jiV.mjs.map
