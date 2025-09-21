import { u as useToast, d as useFetch, a as _sfc_main$9, b as _sfc_main$c, f as useLocale, g as useAppConfig, j as reactivePick, t as tv, l as useFormField, c as _sfc_main$e$1 } from './server.mjs';
import { _ as _sfc_main$d } from './Badge-BVxjrbdp.mjs';
import { _ as _sfc_main$8 } from './DropdownMenu-DlW5ut9G.mjs';
import { defineComponent, useTemplateRef, ref, withAsyncContext, watch, mergeProps, withCtx, unref, createTextVNode, toDisplayString, createVNode, createBlock, createCommentVNode, openBlock, isRef, h, useSlots, computed, renderSlot, Fragment, renderList, mergeModels, useModel, useId, resolveDynamicComponent, reactive, useSSRContext } from 'vue';
import { ssrRenderComponent, ssrInterpolate, ssrRenderSlot, ssrRenderList, ssrRenderClass, ssrRenderVNode } from 'vue/server-renderer';
import { useForwardPropsEmits, PaginationRoot, PaginationList, PaginationFirst, PaginationPrev, PaginationListItem, PaginationEllipsis, PaginationNext, PaginationLast, useForwardProps, Primitive, Label, CheckboxRoot, CheckboxIndicator } from 'reka-ui';
import { _ as _sfc_main$2$1, a as _sfc_main$1$1, b as _sfc_main$b } from './DashboardSidebarCollapse-CtCG-tPp.mjs';
import { _ as _sfc_main$e } from './Modal-BTsLW1Cg.mjs';
import { _ as _sfc_main$f } from './Form-BYeXVtN8.mjs';
import { _ as _sfc_main$g } from './FormField-CzR1krFt.mjs';
import { _ as _sfc_main$5 } from './Input-CF7oUJK4.mjs';
import * as z from 'zod';
import { _ as _sfc_main$6 } from './Kbd-DpYM52pA.mjs';
import { _ as _sfc_main$7 } from './Select-b27ZNPk4.mjs';
import { _ as _sfc_main$a } from './Table-ahnJ44ag.mjs';
import { W as upperFirst } from '../nitro/nitro.mjs';
import { getPaginationRowModel } from '@tanstack/table-core';
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
import './index-Cc9owYnb.mjs';
import './DashboardSidebarToggle-BZQ1O4qq.mjs';
import '@tanstack/vue-table';

const theme$1 = {
  "slots": {
    "root": "relative flex items-start",
    "container": "flex items-center",
    "base": "rounded-sm ring ring-inset ring-accented overflow-hidden focus-visible:outline-2 focus-visible:outline-offset-2",
    "indicator": "flex items-center justify-center size-full text-inverted",
    "icon": "shrink-0 size-full",
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
        "root": ""
      },
      "card": {
        "root": "border border-muted rounded-lg"
      }
    },
    "indicator": {
      "start": {
        "root": "flex-row",
        "wrapper": "ms-2"
      },
      "end": {
        "root": "flex-row-reverse",
        "wrapper": "me-2"
      },
      "hidden": {
        "base": "sr-only",
        "wrapper": "text-center"
      }
    },
    "size": {
      "xs": {
        "base": "size-3",
        "container": "h-4",
        "wrapper": "text-xs"
      },
      "sm": {
        "base": "size-3.5",
        "container": "h-4",
        "wrapper": "text-xs"
      },
      "md": {
        "base": "size-4",
        "container": "h-5",
        "wrapper": "text-sm"
      },
      "lg": {
        "base": "size-4.5",
        "container": "h-5",
        "wrapper": "text-sm"
      },
      "xl": {
        "base": "size-5",
        "container": "h-6",
        "wrapper": "text-base"
      }
    },
    "required": {
      "true": {
        "label": "after:content-['*'] after:ms-0.5 after:text-error"
      }
    },
    "disabled": {
      "true": {
        "base": "cursor-not-allowed opacity-75",
        "label": "cursor-not-allowed opacity-75",
        "description": "cursor-not-allowed opacity-75"
      }
    },
    "checked": {
      "true": ""
    }
  },
  "compoundVariants": [
    {
      "size": "xs",
      "variant": "card",
      "class": {
        "root": "p-2.5"
      }
    },
    {
      "size": "sm",
      "variant": "card",
      "class": {
        "root": "p-3"
      }
    },
    {
      "size": "md",
      "variant": "card",
      "class": {
        "root": "p-3.5"
      }
    },
    {
      "size": "lg",
      "variant": "card",
      "class": {
        "root": "p-4"
      }
    },
    {
      "size": "xl",
      "variant": "card",
      "class": {
        "root": "p-4.5"
      }
    },
    {
      "color": "primary",
      "variant": "card",
      "class": {
        "root": "has-data-[state=checked]:border-primary"
      }
    },
    {
      "color": "secondary",
      "variant": "card",
      "class": {
        "root": "has-data-[state=checked]:border-secondary"
      }
    },
    {
      "color": "success",
      "variant": "card",
      "class": {
        "root": "has-data-[state=checked]:border-success"
      }
    },
    {
      "color": "info",
      "variant": "card",
      "class": {
        "root": "has-data-[state=checked]:border-info"
      }
    },
    {
      "color": "warning",
      "variant": "card",
      "class": {
        "root": "has-data-[state=checked]:border-warning"
      }
    },
    {
      "color": "error",
      "variant": "card",
      "class": {
        "root": "has-data-[state=checked]:border-error"
      }
    },
    {
      "color": "neutral",
      "variant": "card",
      "class": {
        "root": "has-data-[state=checked]:border-inverted"
      }
    },
    {
      "variant": "card",
      "disabled": true,
      "class": {
        "root": "cursor-not-allowed opacity-75"
      }
    }
  ],
  "defaultVariants": {
    "size": "md",
    "color": "primary",
    "variant": "list",
    "indicator": "start"
  }
};
const _sfc_main$4 = /* @__PURE__ */ Object.assign({ inheritAttrs: false }, {
  __name: "UCheckbox",
  __ssrInlineRender: true,
  props: /* @__PURE__ */ mergeModels({
    as: { type: null, required: false },
    label: { type: String, required: false },
    description: { type: String, required: false },
    color: { type: null, required: false },
    variant: { type: null, required: false },
    size: { type: null, required: false },
    indicator: { type: null, required: false },
    icon: { type: [String, Object], required: false },
    indeterminateIcon: { type: [String, Object], required: false },
    class: { type: null, required: false },
    ui: { type: null, required: false },
    disabled: { type: Boolean, required: false },
    required: { type: Boolean, required: false },
    name: { type: String, required: false },
    value: { type: null, required: false },
    id: { type: String, required: false },
    defaultValue: { type: [Boolean, String], required: false }
  }, {
    "modelValue": { type: [Boolean, String], ...{ default: void 0 } },
    "modelModifiers": {}
  }),
  emits: /* @__PURE__ */ mergeModels(["change"], ["update:modelValue"]),
  setup(__props, { emit: __emit }) {
    const props = __props;
    const slots = useSlots();
    const emits = __emit;
    const modelValue = useModel(__props, "modelValue", { type: [Boolean, String], ...{ default: void 0 } });
    const appConfig = useAppConfig();
    const rootProps = useForwardProps(reactivePick(props, "required", "value", "defaultValue"));
    const { id: _id, emitFormChange, emitFormInput, size, color, name, disabled, ariaAttrs } = useFormField(props);
    const id = _id.value ?? useId();
    const ui = computed(() => tv({ extend: tv(theme$1), ...appConfig.ui?.checkbox || {} })({
      size: size.value,
      color: color.value,
      variant: props.variant,
      indicator: props.indicator,
      required: props.required,
      disabled: disabled.value
    }));
    function onUpdate(value) {
      const event = new Event("change", { target: { value } });
      emits("change", event);
      emitFormChange();
      emitFormInput();
    }
    return (_ctx, _push, _parent, _attrs) => {
      _push(ssrRenderComponent(unref(Primitive), mergeProps({
        as: !__props.variant || __props.variant === "list" ? __props.as : unref(Label),
        class: ui.value.root({ class: [props.ui?.root, props.class] })
      }, _attrs), {
        default: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            _push2(`<div class="${ssrRenderClass(ui.value.container({ class: props.ui?.container }))}"${_scopeId}>`);
            _push2(ssrRenderComponent(unref(CheckboxRoot), mergeProps({ id: unref(id) }, { ...unref(rootProps), ..._ctx.$attrs, ...unref(ariaAttrs) }, {
              modelValue: modelValue.value,
              "onUpdate:modelValue": [($event) => modelValue.value = $event, onUpdate],
              name: unref(name),
              disabled: unref(disabled),
              class: ui.value.base({ class: props.ui?.base })
            }), {
              default: withCtx(({ modelValue: modelValue2 }, _push3, _parent3, _scopeId2) => {
                if (_push3) {
                  _push3(ssrRenderComponent(unref(CheckboxIndicator), {
                    class: ui.value.indicator({ class: props.ui?.indicator })
                  }, {
                    default: withCtx((_2, _push4, _parent4, _scopeId3) => {
                      if (_push4) {
                        if (modelValue2 === "indeterminate") {
                          _push4(ssrRenderComponent(_sfc_main$e$1, {
                            name: __props.indeterminateIcon || unref(appConfig).ui.icons.minus,
                            class: ui.value.icon({ class: props.ui?.icon })
                          }, null, _parent4, _scopeId3));
                        } else {
                          _push4(ssrRenderComponent(_sfc_main$e$1, {
                            name: __props.icon || unref(appConfig).ui.icons.check,
                            class: ui.value.icon({ class: props.ui?.icon })
                          }, null, _parent4, _scopeId3));
                        }
                      } else {
                        return [
                          modelValue2 === "indeterminate" ? (openBlock(), createBlock(_sfc_main$e$1, {
                            key: 0,
                            name: __props.indeterminateIcon || unref(appConfig).ui.icons.minus,
                            class: ui.value.icon({ class: props.ui?.icon })
                          }, null, 8, ["name", "class"])) : (openBlock(), createBlock(_sfc_main$e$1, {
                            key: 1,
                            name: __props.icon || unref(appConfig).ui.icons.check,
                            class: ui.value.icon({ class: props.ui?.icon })
                          }, null, 8, ["name", "class"]))
                        ];
                      }
                    }),
                    _: 2
                  }, _parent3, _scopeId2));
                } else {
                  return [
                    createVNode(unref(CheckboxIndicator), {
                      class: ui.value.indicator({ class: props.ui?.indicator })
                    }, {
                      default: withCtx(() => [
                        modelValue2 === "indeterminate" ? (openBlock(), createBlock(_sfc_main$e$1, {
                          key: 0,
                          name: __props.indeterminateIcon || unref(appConfig).ui.icons.minus,
                          class: ui.value.icon({ class: props.ui?.icon })
                        }, null, 8, ["name", "class"])) : (openBlock(), createBlock(_sfc_main$e$1, {
                          key: 1,
                          name: __props.icon || unref(appConfig).ui.icons.check,
                          class: ui.value.icon({ class: props.ui?.icon })
                        }, null, 8, ["name", "class"]))
                      ]),
                      _: 2
                    }, 1032, ["class"])
                  ];
                }
              }),
              _: 1
            }, _parent2, _scopeId));
            _push2(`</div>`);
            if (__props.label || !!slots.label || (__props.description || !!slots.description)) {
              _push2(`<div class="${ssrRenderClass(ui.value.wrapper({ class: props.ui?.wrapper }))}"${_scopeId}>`);
              if (__props.label || !!slots.label) {
                ssrRenderVNode(_push2, createVNode(resolveDynamicComponent(!__props.variant || __props.variant === "list" ? unref(Label) : "p"), {
                  for: unref(id),
                  class: ui.value.label({ class: props.ui?.label })
                }, {
                  default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                    if (_push3) {
                      ssrRenderSlot(_ctx.$slots, "label", { label: __props.label }, () => {
                        _push3(`${ssrInterpolate(__props.label)}`);
                      }, _push3, _parent3, _scopeId2);
                    } else {
                      return [
                        renderSlot(_ctx.$slots, "label", { label: __props.label }, () => [
                          createTextVNode(toDisplayString(__props.label), 1)
                        ])
                      ];
                    }
                  }),
                  _: 3
                }), _parent2, _scopeId);
              } else {
                _push2(`<!---->`);
              }
              if (__props.description || !!slots.description) {
                _push2(`<p class="${ssrRenderClass(ui.value.description({ class: props.ui?.description }))}"${_scopeId}>`);
                ssrRenderSlot(_ctx.$slots, "description", { description: __props.description }, () => {
                  _push2(`${ssrInterpolate(__props.description)}`);
                }, _push2, _parent2, _scopeId);
                _push2(`</p>`);
              } else {
                _push2(`<!---->`);
              }
              _push2(`</div>`);
            } else {
              _push2(`<!---->`);
            }
          } else {
            return [
              createVNode("div", {
                class: ui.value.container({ class: props.ui?.container })
              }, [
                createVNode(unref(CheckboxRoot), mergeProps({ id: unref(id) }, { ...unref(rootProps), ..._ctx.$attrs, ...unref(ariaAttrs) }, {
                  modelValue: modelValue.value,
                  "onUpdate:modelValue": [($event) => modelValue.value = $event, onUpdate],
                  name: unref(name),
                  disabled: unref(disabled),
                  class: ui.value.base({ class: props.ui?.base })
                }), {
                  default: withCtx(({ modelValue: modelValue2 }) => [
                    createVNode(unref(CheckboxIndicator), {
                      class: ui.value.indicator({ class: props.ui?.indicator })
                    }, {
                      default: withCtx(() => [
                        modelValue2 === "indeterminate" ? (openBlock(), createBlock(_sfc_main$e$1, {
                          key: 0,
                          name: __props.indeterminateIcon || unref(appConfig).ui.icons.minus,
                          class: ui.value.icon({ class: props.ui?.icon })
                        }, null, 8, ["name", "class"])) : (openBlock(), createBlock(_sfc_main$e$1, {
                          key: 1,
                          name: __props.icon || unref(appConfig).ui.icons.check,
                          class: ui.value.icon({ class: props.ui?.icon })
                        }, null, 8, ["name", "class"]))
                      ]),
                      _: 2
                    }, 1032, ["class"])
                  ]),
                  _: 1
                }, 16, ["id", "modelValue", "onUpdate:modelValue", "name", "disabled", "class"])
              ], 2),
              __props.label || !!slots.label || (__props.description || !!slots.description) ? (openBlock(), createBlock("div", {
                key: 0,
                class: ui.value.wrapper({ class: props.ui?.wrapper })
              }, [
                __props.label || !!slots.label ? (openBlock(), createBlock(resolveDynamicComponent(!__props.variant || __props.variant === "list" ? unref(Label) : "p"), {
                  key: 0,
                  for: unref(id),
                  class: ui.value.label({ class: props.ui?.label })
                }, {
                  default: withCtx(() => [
                    renderSlot(_ctx.$slots, "label", { label: __props.label }, () => [
                      createTextVNode(toDisplayString(__props.label), 1)
                    ])
                  ]),
                  _: 3
                }, 8, ["for", "class"])) : createCommentVNode("", true),
                __props.description || !!slots.description ? (openBlock(), createBlock("p", {
                  key: 1,
                  class: ui.value.description({ class: props.ui?.description })
                }, [
                  renderSlot(_ctx.$slots, "description", { description: __props.description }, () => [
                    createTextVNode(toDisplayString(__props.description), 1)
                  ])
                ], 2)) : createCommentVNode("", true)
              ], 2)) : createCommentVNode("", true)
            ];
          }
        }),
        _: 3
      }, _parent));
    };
  }
});
const _sfc_setup$4 = _sfc_main$4.setup;
_sfc_main$4.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("../node_modules/.pnpm/@nuxt+ui@4.0.0-alpha.2_@babel+parser@7.28.0_@netlify+blobs@9.1.2_change-case@5.4.4_db0@_b85612ac9055e711c0cdf49df3463bec/node_modules/@nuxt/ui/dist/runtime/components/Checkbox.vue");
  return _sfc_setup$4 ? _sfc_setup$4(props, ctx) : void 0;
};
const _sfc_main$3 = /* @__PURE__ */ defineComponent({
  __name: "AddModal",
  __ssrInlineRender: true,
  setup(__props) {
    const schema = z.object({
      name: z.string().min(2, "Too short"),
      email: z.string().email("Invalid email")
    });
    const open = ref(false);
    const state = reactive({
      name: void 0,
      email: void 0
    });
    const toast = useToast();
    async function onSubmit(event) {
      toast.add({ title: "Success", description: `New customer ${event.data.name} added`, color: "success" });
      open.value = false;
    }
    return (_ctx, _push, _parent, _attrs) => {
      const _component_UModal = _sfc_main$e;
      const _component_UButton = _sfc_main$9;
      const _component_UForm = _sfc_main$f;
      const _component_UFormField = _sfc_main$g;
      const _component_UInput = _sfc_main$5;
      _push(ssrRenderComponent(_component_UModal, mergeProps({
        open: unref(open),
        "onUpdate:open": ($event) => isRef(open) ? open.value = $event : null,
        title: "New customer",
        description: "Add a new customer to the database"
      }, _attrs), {
        body: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            _push2(ssrRenderComponent(_component_UForm, {
              schema: unref(schema),
              state: unref(state),
              class: "space-y-4",
              onSubmit
            }, {
              default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                if (_push3) {
                  _push3(ssrRenderComponent(_component_UFormField, {
                    label: "Name",
                    placeholder: "John Doe",
                    name: "name"
                  }, {
                    default: withCtx((_3, _push4, _parent4, _scopeId3) => {
                      if (_push4) {
                        _push4(ssrRenderComponent(_component_UInput, {
                          modelValue: unref(state).name,
                          "onUpdate:modelValue": ($event) => unref(state).name = $event,
                          class: "w-full"
                        }, null, _parent4, _scopeId3));
                      } else {
                        return [
                          createVNode(_component_UInput, {
                            modelValue: unref(state).name,
                            "onUpdate:modelValue": ($event) => unref(state).name = $event,
                            class: "w-full"
                          }, null, 8, ["modelValue", "onUpdate:modelValue"])
                        ];
                      }
                    }),
                    _: 1
                  }, _parent3, _scopeId2));
                  _push3(ssrRenderComponent(_component_UFormField, {
                    label: "Email",
                    placeholder: "john.doe@example.com",
                    name: "email"
                  }, {
                    default: withCtx((_3, _push4, _parent4, _scopeId3) => {
                      if (_push4) {
                        _push4(ssrRenderComponent(_component_UInput, {
                          modelValue: unref(state).email,
                          "onUpdate:modelValue": ($event) => unref(state).email = $event,
                          class: "w-full"
                        }, null, _parent4, _scopeId3));
                      } else {
                        return [
                          createVNode(_component_UInput, {
                            modelValue: unref(state).email,
                            "onUpdate:modelValue": ($event) => unref(state).email = $event,
                            class: "w-full"
                          }, null, 8, ["modelValue", "onUpdate:modelValue"])
                        ];
                      }
                    }),
                    _: 1
                  }, _parent3, _scopeId2));
                  _push3(`<div class="flex justify-end gap-2"${_scopeId2}>`);
                  _push3(ssrRenderComponent(_component_UButton, {
                    label: "Cancel",
                    color: "neutral",
                    variant: "subtle",
                    onClick: ($event) => open.value = false
                  }, null, _parent3, _scopeId2));
                  _push3(ssrRenderComponent(_component_UButton, {
                    label: "Create",
                    color: "primary",
                    variant: "solid",
                    type: "submit"
                  }, null, _parent3, _scopeId2));
                  _push3(`</div>`);
                } else {
                  return [
                    createVNode(_component_UFormField, {
                      label: "Name",
                      placeholder: "John Doe",
                      name: "name"
                    }, {
                      default: withCtx(() => [
                        createVNode(_component_UInput, {
                          modelValue: unref(state).name,
                          "onUpdate:modelValue": ($event) => unref(state).name = $event,
                          class: "w-full"
                        }, null, 8, ["modelValue", "onUpdate:modelValue"])
                      ]),
                      _: 1
                    }),
                    createVNode(_component_UFormField, {
                      label: "Email",
                      placeholder: "john.doe@example.com",
                      name: "email"
                    }, {
                      default: withCtx(() => [
                        createVNode(_component_UInput, {
                          modelValue: unref(state).email,
                          "onUpdate:modelValue": ($event) => unref(state).email = $event,
                          class: "w-full"
                        }, null, 8, ["modelValue", "onUpdate:modelValue"])
                      ]),
                      _: 1
                    }),
                    createVNode("div", { class: "flex justify-end gap-2" }, [
                      createVNode(_component_UButton, {
                        label: "Cancel",
                        color: "neutral",
                        variant: "subtle",
                        onClick: ($event) => open.value = false
                      }, null, 8, ["onClick"]),
                      createVNode(_component_UButton, {
                        label: "Create",
                        color: "primary",
                        variant: "solid",
                        type: "submit"
                      })
                    ])
                  ];
                }
              }),
              _: 1
            }, _parent2, _scopeId));
          } else {
            return [
              createVNode(_component_UForm, {
                schema: unref(schema),
                state: unref(state),
                class: "space-y-4",
                onSubmit
              }, {
                default: withCtx(() => [
                  createVNode(_component_UFormField, {
                    label: "Name",
                    placeholder: "John Doe",
                    name: "name"
                  }, {
                    default: withCtx(() => [
                      createVNode(_component_UInput, {
                        modelValue: unref(state).name,
                        "onUpdate:modelValue": ($event) => unref(state).name = $event,
                        class: "w-full"
                      }, null, 8, ["modelValue", "onUpdate:modelValue"])
                    ]),
                    _: 1
                  }),
                  createVNode(_component_UFormField, {
                    label: "Email",
                    placeholder: "john.doe@example.com",
                    name: "email"
                  }, {
                    default: withCtx(() => [
                      createVNode(_component_UInput, {
                        modelValue: unref(state).email,
                        "onUpdate:modelValue": ($event) => unref(state).email = $event,
                        class: "w-full"
                      }, null, 8, ["modelValue", "onUpdate:modelValue"])
                    ]),
                    _: 1
                  }),
                  createVNode("div", { class: "flex justify-end gap-2" }, [
                    createVNode(_component_UButton, {
                      label: "Cancel",
                      color: "neutral",
                      variant: "subtle",
                      onClick: ($event) => open.value = false
                    }, null, 8, ["onClick"]),
                    createVNode(_component_UButton, {
                      label: "Create",
                      color: "primary",
                      variant: "solid",
                      type: "submit"
                    })
                  ])
                ]),
                _: 1
              }, 8, ["schema", "state"])
            ];
          }
        }),
        default: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            _push2(ssrRenderComponent(_component_UButton, {
              label: "New customer",
              icon: "i-lucide-plus"
            }, null, _parent2, _scopeId));
          } else {
            return [
              createVNode(_component_UButton, {
                label: "New customer",
                icon: "i-lucide-plus"
              })
            ];
          }
        }),
        _: 1
      }, _parent));
    };
  }
});
const _sfc_setup$3 = _sfc_main$3.setup;
_sfc_main$3.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("components/customers/AddModal.vue");
  return _sfc_setup$3 ? _sfc_setup$3(props, ctx) : void 0;
};
const __nuxt_component_8 = Object.assign(_sfc_main$3, { __name: "CustomersAddModal" });
const _sfc_main$2 = /* @__PURE__ */ defineComponent({
  __name: "DeleteModal",
  __ssrInlineRender: true,
  props: {
    count: { default: 0 }
  },
  setup(__props) {
    const open = ref(false);
    async function onSubmit() {
      await new Promise((resolve) => setTimeout(resolve, 1e3));
      open.value = false;
    }
    return (_ctx, _push, _parent, _attrs) => {
      const _component_UModal = _sfc_main$e;
      const _component_UButton = _sfc_main$9;
      _push(ssrRenderComponent(_component_UModal, mergeProps({
        open: unref(open),
        "onUpdate:open": ($event) => isRef(open) ? open.value = $event : null,
        title: `Delete ${_ctx.count} customer${_ctx.count > 1 ? "s" : ""}`,
        description: `Are you sure, this action cannot be undone.`
      }, _attrs), {
        body: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            _push2(`<div class="flex justify-end gap-2"${_scopeId}>`);
            _push2(ssrRenderComponent(_component_UButton, {
              label: "Cancel",
              color: "neutral",
              variant: "subtle",
              onClick: ($event) => open.value = false
            }, null, _parent2, _scopeId));
            _push2(ssrRenderComponent(_component_UButton, {
              label: "Delete",
              color: "error",
              variant: "solid",
              "loading-auto": "",
              onClick: onSubmit
            }, null, _parent2, _scopeId));
            _push2(`</div>`);
          } else {
            return [
              createVNode("div", { class: "flex justify-end gap-2" }, [
                createVNode(_component_UButton, {
                  label: "Cancel",
                  color: "neutral",
                  variant: "subtle",
                  onClick: ($event) => open.value = false
                }, null, 8, ["onClick"]),
                createVNode(_component_UButton, {
                  label: "Delete",
                  color: "error",
                  variant: "solid",
                  "loading-auto": "",
                  onClick: onSubmit
                })
              ])
            ];
          }
        }),
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
});
const _sfc_setup$2 = _sfc_main$2.setup;
_sfc_main$2.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("components/customers/DeleteModal.vue");
  return _sfc_setup$2 ? _sfc_setup$2(props, ctx) : void 0;
};
const __nuxt_component_10 = Object.assign(_sfc_main$2, { __name: "CustomersDeleteModal" });
const theme = {
  "slots": {
    "root": "",
    "list": "flex items-center gap-1",
    "ellipsis": "pointer-events-none",
    "label": "min-w-5 text-center",
    "first": "",
    "prev": "",
    "item": "",
    "next": "",
    "last": ""
  }
};
const _sfc_main$1 = {
  __name: "UPagination",
  __ssrInlineRender: true,
  props: {
    as: { type: null, required: false },
    firstIcon: { type: [String, Object], required: false },
    prevIcon: { type: [String, Object], required: false },
    nextIcon: { type: [String, Object], required: false },
    lastIcon: { type: [String, Object], required: false },
    ellipsisIcon: { type: [String, Object], required: false },
    color: { type: null, required: false, default: "neutral" },
    variant: { type: null, required: false, default: "outline" },
    activeColor: { type: null, required: false, default: "primary" },
    activeVariant: { type: null, required: false, default: "solid" },
    showControls: { type: Boolean, required: false, default: true },
    size: { type: null, required: false },
    to: { type: Function, required: false },
    class: { type: null, required: false },
    ui: { type: null, required: false },
    defaultPage: { type: Number, required: false },
    disabled: { type: Boolean, required: false },
    itemsPerPage: { type: Number, required: false, default: 10 },
    page: { type: Number, required: false },
    showEdges: { type: Boolean, required: false, default: false },
    siblingCount: { type: Number, required: false, default: 2 },
    total: { type: Number, required: false, default: 0 }
  },
  emits: ["update:page"],
  setup(__props, { emit: __emit }) {
    const props = __props;
    const emits = __emit;
    const slots = useSlots();
    const { dir } = useLocale();
    const appConfig = useAppConfig();
    const rootProps = useForwardPropsEmits(reactivePick(props, "as", "defaultPage", "disabled", "itemsPerPage", "page", "showEdges", "siblingCount", "total"), emits);
    const firstIcon = computed(() => props.firstIcon || (dir.value === "rtl" ? appConfig.ui.icons.chevronDoubleRight : appConfig.ui.icons.chevronDoubleLeft));
    const prevIcon = computed(() => props.prevIcon || (dir.value === "rtl" ? appConfig.ui.icons.chevronRight : appConfig.ui.icons.chevronLeft));
    const nextIcon = computed(() => props.nextIcon || (dir.value === "rtl" ? appConfig.ui.icons.chevronLeft : appConfig.ui.icons.chevronRight));
    const lastIcon = computed(() => props.lastIcon || (dir.value === "rtl" ? appConfig.ui.icons.chevronDoubleLeft : appConfig.ui.icons.chevronDoubleRight));
    const ui = computed(() => tv({ extend: tv(theme), ...appConfig.ui?.pagination || {} })());
    return (_ctx, _push, _parent, _attrs) => {
      _push(ssrRenderComponent(unref(PaginationRoot), mergeProps(unref(rootProps), {
        class: ui.value.root({ class: [props.ui?.root, props.class] })
      }, _attrs), {
        default: withCtx(({ page, pageCount }, _push2, _parent2, _scopeId) => {
          if (_push2) {
            _push2(ssrRenderComponent(unref(PaginationList), {
              class: ui.value.list({ class: props.ui?.list })
            }, {
              default: withCtx(({ items }, _push3, _parent3, _scopeId2) => {
                if (_push3) {
                  if (__props.showControls || !!slots.first) {
                    _push3(ssrRenderComponent(unref(PaginationFirst), {
                      "as-child": "",
                      class: ui.value.first({ class: props.ui?.first })
                    }, {
                      default: withCtx((_, _push4, _parent4, _scopeId3) => {
                        if (_push4) {
                          ssrRenderSlot(_ctx.$slots, "first", {}, () => {
                            _push4(ssrRenderComponent(_sfc_main$9, {
                              color: __props.color,
                              variant: __props.variant,
                              size: __props.size,
                              icon: firstIcon.value,
                              to: __props.to?.(1)
                            }, null, _parent4, _scopeId3));
                          }, _push4, _parent4, _scopeId3);
                        } else {
                          return [
                            renderSlot(_ctx.$slots, "first", {}, () => [
                              createVNode(_sfc_main$9, {
                                color: __props.color,
                                variant: __props.variant,
                                size: __props.size,
                                icon: firstIcon.value,
                                to: __props.to?.(1)
                              }, null, 8, ["color", "variant", "size", "icon", "to"])
                            ])
                          ];
                        }
                      }),
                      _: 2
                    }, _parent3, _scopeId2));
                  } else {
                    _push3(`<!---->`);
                  }
                  if (__props.showControls || !!slots.prev) {
                    _push3(ssrRenderComponent(unref(PaginationPrev), {
                      "as-child": "",
                      class: ui.value.prev({ class: props.ui?.prev })
                    }, {
                      default: withCtx((_, _push4, _parent4, _scopeId3) => {
                        if (_push4) {
                          ssrRenderSlot(_ctx.$slots, "prev", {}, () => {
                            _push4(ssrRenderComponent(_sfc_main$9, {
                              color: __props.color,
                              variant: __props.variant,
                              size: __props.size,
                              icon: prevIcon.value,
                              to: page > 1 ? __props.to?.(page - 1) : void 0
                            }, null, _parent4, _scopeId3));
                          }, _push4, _parent4, _scopeId3);
                        } else {
                          return [
                            renderSlot(_ctx.$slots, "prev", {}, () => [
                              createVNode(_sfc_main$9, {
                                color: __props.color,
                                variant: __props.variant,
                                size: __props.size,
                                icon: prevIcon.value,
                                to: page > 1 ? __props.to?.(page - 1) : void 0
                              }, null, 8, ["color", "variant", "size", "icon", "to"])
                            ])
                          ];
                        }
                      }),
                      _: 2
                    }, _parent3, _scopeId2));
                  } else {
                    _push3(`<!---->`);
                  }
                  _push3(`<!--[-->`);
                  ssrRenderList(items, (item, index) => {
                    _push3(`<!--[-->`);
                    if (item.type === "page") {
                      _push3(ssrRenderComponent(unref(PaginationListItem), {
                        key: index,
                        "as-child": "",
                        value: item.value,
                        class: ui.value.item({ class: props.ui?.item })
                      }, {
                        default: withCtx((_, _push4, _parent4, _scopeId3) => {
                          if (_push4) {
                            ssrRenderSlot(_ctx.$slots, "item", mergeProps({ ref_for: true }, { item, index, page, pageCount }), () => {
                              _push4(ssrRenderComponent(_sfc_main$9, {
                                color: page === item.value ? __props.activeColor : __props.color,
                                variant: page === item.value ? __props.activeVariant : __props.variant,
                                size: __props.size,
                                label: String(item.value),
                                ui: { label: ui.value.label() },
                                to: __props.to?.(item.value),
                                square: ""
                              }, null, _parent4, _scopeId3));
                            }, _push4, _parent4, _scopeId3);
                          } else {
                            return [
                              renderSlot(_ctx.$slots, "item", mergeProps({ ref_for: true }, { item, index, page, pageCount }), () => [
                                createVNode(_sfc_main$9, {
                                  color: page === item.value ? __props.activeColor : __props.color,
                                  variant: page === item.value ? __props.activeVariant : __props.variant,
                                  size: __props.size,
                                  label: String(item.value),
                                  ui: { label: ui.value.label() },
                                  to: __props.to?.(item.value),
                                  square: ""
                                }, null, 8, ["color", "variant", "size", "label", "ui", "to"])
                              ])
                            ];
                          }
                        }),
                        _: 2
                      }, _parent3, _scopeId2));
                    } else {
                      _push3(ssrRenderComponent(unref(PaginationEllipsis), {
                        key: item.type,
                        index,
                        "as-child": "",
                        class: ui.value.ellipsis({ class: props.ui?.ellipsis })
                      }, {
                        default: withCtx((_, _push4, _parent4, _scopeId3) => {
                          if (_push4) {
                            ssrRenderSlot(_ctx.$slots, "ellipsis", {}, () => {
                              _push4(ssrRenderComponent(_sfc_main$9, {
                                color: __props.color,
                                variant: __props.variant,
                                size: __props.size,
                                icon: __props.ellipsisIcon || unref(appConfig).ui.icons.ellipsis
                              }, null, _parent4, _scopeId3));
                            }, _push4, _parent4, _scopeId3);
                          } else {
                            return [
                              renderSlot(_ctx.$slots, "ellipsis", {}, () => [
                                createVNode(_sfc_main$9, {
                                  color: __props.color,
                                  variant: __props.variant,
                                  size: __props.size,
                                  icon: __props.ellipsisIcon || unref(appConfig).ui.icons.ellipsis
                                }, null, 8, ["color", "variant", "size", "icon"])
                              ])
                            ];
                          }
                        }),
                        _: 2
                      }, _parent3, _scopeId2));
                    }
                    _push3(`<!--]-->`);
                  });
                  _push3(`<!--]-->`);
                  if (__props.showControls || !!slots.next) {
                    _push3(ssrRenderComponent(unref(PaginationNext), {
                      "as-child": "",
                      class: ui.value.next({ class: props.ui?.next })
                    }, {
                      default: withCtx((_, _push4, _parent4, _scopeId3) => {
                        if (_push4) {
                          ssrRenderSlot(_ctx.$slots, "next", {}, () => {
                            _push4(ssrRenderComponent(_sfc_main$9, {
                              color: __props.color,
                              variant: __props.variant,
                              size: __props.size,
                              icon: nextIcon.value,
                              to: page < pageCount ? __props.to?.(page + 1) : void 0
                            }, null, _parent4, _scopeId3));
                          }, _push4, _parent4, _scopeId3);
                        } else {
                          return [
                            renderSlot(_ctx.$slots, "next", {}, () => [
                              createVNode(_sfc_main$9, {
                                color: __props.color,
                                variant: __props.variant,
                                size: __props.size,
                                icon: nextIcon.value,
                                to: page < pageCount ? __props.to?.(page + 1) : void 0
                              }, null, 8, ["color", "variant", "size", "icon", "to"])
                            ])
                          ];
                        }
                      }),
                      _: 2
                    }, _parent3, _scopeId2));
                  } else {
                    _push3(`<!---->`);
                  }
                  if (__props.showControls || !!slots.last) {
                    _push3(ssrRenderComponent(unref(PaginationLast), {
                      "as-child": "",
                      class: ui.value.last({ class: props.ui?.last })
                    }, {
                      default: withCtx((_, _push4, _parent4, _scopeId3) => {
                        if (_push4) {
                          ssrRenderSlot(_ctx.$slots, "last", {}, () => {
                            _push4(ssrRenderComponent(_sfc_main$9, {
                              color: __props.color,
                              variant: __props.variant,
                              size: __props.size,
                              icon: lastIcon.value,
                              to: __props.to?.(pageCount)
                            }, null, _parent4, _scopeId3));
                          }, _push4, _parent4, _scopeId3);
                        } else {
                          return [
                            renderSlot(_ctx.$slots, "last", {}, () => [
                              createVNode(_sfc_main$9, {
                                color: __props.color,
                                variant: __props.variant,
                                size: __props.size,
                                icon: lastIcon.value,
                                to: __props.to?.(pageCount)
                              }, null, 8, ["color", "variant", "size", "icon", "to"])
                            ])
                          ];
                        }
                      }),
                      _: 2
                    }, _parent3, _scopeId2));
                  } else {
                    _push3(`<!---->`);
                  }
                } else {
                  return [
                    __props.showControls || !!slots.first ? (openBlock(), createBlock(unref(PaginationFirst), {
                      key: 0,
                      "as-child": "",
                      class: ui.value.first({ class: props.ui?.first })
                    }, {
                      default: withCtx(() => [
                        renderSlot(_ctx.$slots, "first", {}, () => [
                          createVNode(_sfc_main$9, {
                            color: __props.color,
                            variant: __props.variant,
                            size: __props.size,
                            icon: firstIcon.value,
                            to: __props.to?.(1)
                          }, null, 8, ["color", "variant", "size", "icon", "to"])
                        ])
                      ]),
                      _: 3
                    }, 8, ["class"])) : createCommentVNode("", true),
                    __props.showControls || !!slots.prev ? (openBlock(), createBlock(unref(PaginationPrev), {
                      key: 1,
                      "as-child": "",
                      class: ui.value.prev({ class: props.ui?.prev })
                    }, {
                      default: withCtx(() => [
                        renderSlot(_ctx.$slots, "prev", {}, () => [
                          createVNode(_sfc_main$9, {
                            color: __props.color,
                            variant: __props.variant,
                            size: __props.size,
                            icon: prevIcon.value,
                            to: page > 1 ? __props.to?.(page - 1) : void 0
                          }, null, 8, ["color", "variant", "size", "icon", "to"])
                        ])
                      ]),
                      _: 2
                    }, 1032, ["class"])) : createCommentVNode("", true),
                    (openBlock(true), createBlock(Fragment, null, renderList(items, (item, index) => {
                      return openBlock(), createBlock(Fragment, null, [
                        item.type === "page" ? (openBlock(), createBlock(unref(PaginationListItem), {
                          key: index,
                          "as-child": "",
                          value: item.value,
                          class: ui.value.item({ class: props.ui?.item })
                        }, {
                          default: withCtx(() => [
                            renderSlot(_ctx.$slots, "item", mergeProps({ ref_for: true }, { item, index, page, pageCount }), () => [
                              createVNode(_sfc_main$9, {
                                color: page === item.value ? __props.activeColor : __props.color,
                                variant: page === item.value ? __props.activeVariant : __props.variant,
                                size: __props.size,
                                label: String(item.value),
                                ui: { label: ui.value.label() },
                                to: __props.to?.(item.value),
                                square: ""
                              }, null, 8, ["color", "variant", "size", "label", "ui", "to"])
                            ])
                          ]),
                          _: 2
                        }, 1032, ["value", "class"])) : (openBlock(), createBlock(unref(PaginationEllipsis), {
                          key: item.type,
                          index,
                          "as-child": "",
                          class: ui.value.ellipsis({ class: props.ui?.ellipsis })
                        }, {
                          default: withCtx(() => [
                            renderSlot(_ctx.$slots, "ellipsis", {}, () => [
                              createVNode(_sfc_main$9, {
                                color: __props.color,
                                variant: __props.variant,
                                size: __props.size,
                                icon: __props.ellipsisIcon || unref(appConfig).ui.icons.ellipsis
                              }, null, 8, ["color", "variant", "size", "icon"])
                            ])
                          ]),
                          _: 2
                        }, 1032, ["index", "class"]))
                      ], 64);
                    }), 256)),
                    __props.showControls || !!slots.next ? (openBlock(), createBlock(unref(PaginationNext), {
                      key: 2,
                      "as-child": "",
                      class: ui.value.next({ class: props.ui?.next })
                    }, {
                      default: withCtx(() => [
                        renderSlot(_ctx.$slots, "next", {}, () => [
                          createVNode(_sfc_main$9, {
                            color: __props.color,
                            variant: __props.variant,
                            size: __props.size,
                            icon: nextIcon.value,
                            to: page < pageCount ? __props.to?.(page + 1) : void 0
                          }, null, 8, ["color", "variant", "size", "icon", "to"])
                        ])
                      ]),
                      _: 2
                    }, 1032, ["class"])) : createCommentVNode("", true),
                    __props.showControls || !!slots.last ? (openBlock(), createBlock(unref(PaginationLast), {
                      key: 3,
                      "as-child": "",
                      class: ui.value.last({ class: props.ui?.last })
                    }, {
                      default: withCtx(() => [
                        renderSlot(_ctx.$slots, "last", {}, () => [
                          createVNode(_sfc_main$9, {
                            color: __props.color,
                            variant: __props.variant,
                            size: __props.size,
                            icon: lastIcon.value,
                            to: __props.to?.(pageCount)
                          }, null, 8, ["color", "variant", "size", "icon", "to"])
                        ])
                      ]),
                      _: 2
                    }, 1032, ["class"])) : createCommentVNode("", true)
                  ];
                }
              }),
              _: 2
            }, _parent2, _scopeId));
          } else {
            return [
              createVNode(unref(PaginationList), {
                class: ui.value.list({ class: props.ui?.list })
              }, {
                default: withCtx(({ items }) => [
                  __props.showControls || !!slots.first ? (openBlock(), createBlock(unref(PaginationFirst), {
                    key: 0,
                    "as-child": "",
                    class: ui.value.first({ class: props.ui?.first })
                  }, {
                    default: withCtx(() => [
                      renderSlot(_ctx.$slots, "first", {}, () => [
                        createVNode(_sfc_main$9, {
                          color: __props.color,
                          variant: __props.variant,
                          size: __props.size,
                          icon: firstIcon.value,
                          to: __props.to?.(1)
                        }, null, 8, ["color", "variant", "size", "icon", "to"])
                      ])
                    ]),
                    _: 3
                  }, 8, ["class"])) : createCommentVNode("", true),
                  __props.showControls || !!slots.prev ? (openBlock(), createBlock(unref(PaginationPrev), {
                    key: 1,
                    "as-child": "",
                    class: ui.value.prev({ class: props.ui?.prev })
                  }, {
                    default: withCtx(() => [
                      renderSlot(_ctx.$slots, "prev", {}, () => [
                        createVNode(_sfc_main$9, {
                          color: __props.color,
                          variant: __props.variant,
                          size: __props.size,
                          icon: prevIcon.value,
                          to: page > 1 ? __props.to?.(page - 1) : void 0
                        }, null, 8, ["color", "variant", "size", "icon", "to"])
                      ])
                    ]),
                    _: 2
                  }, 1032, ["class"])) : createCommentVNode("", true),
                  (openBlock(true), createBlock(Fragment, null, renderList(items, (item, index) => {
                    return openBlock(), createBlock(Fragment, null, [
                      item.type === "page" ? (openBlock(), createBlock(unref(PaginationListItem), {
                        key: index,
                        "as-child": "",
                        value: item.value,
                        class: ui.value.item({ class: props.ui?.item })
                      }, {
                        default: withCtx(() => [
                          renderSlot(_ctx.$slots, "item", mergeProps({ ref_for: true }, { item, index, page, pageCount }), () => [
                            createVNode(_sfc_main$9, {
                              color: page === item.value ? __props.activeColor : __props.color,
                              variant: page === item.value ? __props.activeVariant : __props.variant,
                              size: __props.size,
                              label: String(item.value),
                              ui: { label: ui.value.label() },
                              to: __props.to?.(item.value),
                              square: ""
                            }, null, 8, ["color", "variant", "size", "label", "ui", "to"])
                          ])
                        ]),
                        _: 2
                      }, 1032, ["value", "class"])) : (openBlock(), createBlock(unref(PaginationEllipsis), {
                        key: item.type,
                        index,
                        "as-child": "",
                        class: ui.value.ellipsis({ class: props.ui?.ellipsis })
                      }, {
                        default: withCtx(() => [
                          renderSlot(_ctx.$slots, "ellipsis", {}, () => [
                            createVNode(_sfc_main$9, {
                              color: __props.color,
                              variant: __props.variant,
                              size: __props.size,
                              icon: __props.ellipsisIcon || unref(appConfig).ui.icons.ellipsis
                            }, null, 8, ["color", "variant", "size", "icon"])
                          ])
                        ]),
                        _: 2
                      }, 1032, ["index", "class"]))
                    ], 64);
                  }), 256)),
                  __props.showControls || !!slots.next ? (openBlock(), createBlock(unref(PaginationNext), {
                    key: 2,
                    "as-child": "",
                    class: ui.value.next({ class: props.ui?.next })
                  }, {
                    default: withCtx(() => [
                      renderSlot(_ctx.$slots, "next", {}, () => [
                        createVNode(_sfc_main$9, {
                          color: __props.color,
                          variant: __props.variant,
                          size: __props.size,
                          icon: nextIcon.value,
                          to: page < pageCount ? __props.to?.(page + 1) : void 0
                        }, null, 8, ["color", "variant", "size", "icon", "to"])
                      ])
                    ]),
                    _: 2
                  }, 1032, ["class"])) : createCommentVNode("", true),
                  __props.showControls || !!slots.last ? (openBlock(), createBlock(unref(PaginationLast), {
                    key: 3,
                    "as-child": "",
                    class: ui.value.last({ class: props.ui?.last })
                  }, {
                    default: withCtx(() => [
                      renderSlot(_ctx.$slots, "last", {}, () => [
                        createVNode(_sfc_main$9, {
                          color: __props.color,
                          variant: __props.variant,
                          size: __props.size,
                          icon: lastIcon.value,
                          to: __props.to?.(pageCount)
                        }, null, 8, ["color", "variant", "size", "icon", "to"])
                      ])
                    ]),
                    _: 2
                  }, 1032, ["class"])) : createCommentVNode("", true)
                ]),
                _: 2
              }, 1032, ["class"])
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
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("../node_modules/.pnpm/@nuxt+ui@4.0.0-alpha.2_@babel+parser@7.28.0_@netlify+blobs@9.1.2_change-case@5.4.4_db0@_b85612ac9055e711c0cdf49df3463bec/node_modules/@nuxt/ui/dist/runtime/components/Pagination.vue");
  return _sfc_setup$1 ? _sfc_setup$1(props, ctx) : void 0;
};
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "customers",
  __ssrInlineRender: true,
  async setup(__props) {
    let __temp, __restore;
    const UAvatar = _sfc_main$c;
    const UButton = _sfc_main$9;
    const UBadge = _sfc_main$d;
    const UDropdownMenu = _sfc_main$8;
    const UCheckbox = _sfc_main$4;
    const toast = useToast();
    const table = useTemplateRef("table");
    const columnFilters = ref([{
      id: "email",
      value: ""
    }]);
    const columnVisibility = ref();
    const rowSelection = ref({ 1: true });
    const { data, status } = ([__temp, __restore] = withAsyncContext(() => useFetch("/api/customers", {
      lazy: true
    }, "$6qzunmRhlq")), __temp = await __temp, __restore(), __temp);
    function getRowItems(row) {
      return [
        {
          type: "label",
          label: "Actions"
        },
        {
          label: "Copy customer ID",
          icon: "i-lucide-copy",
          onSelect() {
            (void 0).clipboard.writeText(row.original.id.toString());
            toast.add({
              title: "Copied to clipboard",
              description: "Customer ID copied to clipboard"
            });
          }
        },
        {
          type: "separator"
        },
        {
          label: "View customer details",
          icon: "i-lucide-list"
        },
        {
          label: "View customer payments",
          icon: "i-lucide-wallet"
        },
        {
          type: "separator"
        },
        {
          label: "Delete customer",
          icon: "i-lucide-trash",
          color: "error",
          onSelect() {
            toast.add({
              title: "Customer deleted",
              description: "The customer has been deleted."
            });
          }
        }
      ];
    }
    const columns = [
      {
        id: "select",
        header: ({ table: table2 }) => h(UCheckbox, {
          "modelValue": table2.getIsSomePageRowsSelected() ? "indeterminate" : table2.getIsAllPageRowsSelected(),
          "onUpdate:modelValue": (value) => table2.toggleAllPageRowsSelected(!!value),
          "ariaLabel": "Select all"
        }),
        cell: ({ row }) => h(UCheckbox, {
          "modelValue": row.getIsSelected(),
          "onUpdate:modelValue": (value) => row.toggleSelected(!!value),
          "ariaLabel": "Select row"
        })
      },
      {
        accessorKey: "id",
        header: "ID"
      },
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => {
          return h("div", { class: "flex items-center gap-3" }, [
            h(UAvatar, {
              ...row.original.avatar,
              size: "lg"
            }),
            h("div", void 0, [
              h("p", { class: "font-medium text-highlighted" }, row.original.name),
              h("p", { class: "" }, `@${row.original.name}`)
            ])
          ]);
        }
      },
      {
        accessorKey: "email",
        header: ({ column }) => {
          const isSorted = column.getIsSorted();
          return h(UButton, {
            color: "neutral",
            variant: "ghost",
            label: "Email",
            icon: isSorted ? isSorted === "asc" ? "i-lucide-arrow-up-narrow-wide" : "i-lucide-arrow-down-wide-narrow" : "i-lucide-arrow-up-down",
            class: "-mx-2.5",
            onClick: () => column.toggleSorting(column.getIsSorted() === "asc")
          });
        }
      },
      {
        accessorKey: "location",
        header: "Location",
        cell: ({ row }) => row.original.location
      },
      {
        accessorKey: "status",
        header: "Status",
        filterFn: "equals",
        cell: ({ row }) => {
          const color = {
            subscribed: "success",
            unsubscribed: "error",
            bounced: "warning"
          }[row.original.status];
          return h(
            UBadge,
            { class: "capitalize", variant: "subtle", color },
            () => row.original.status
          );
        }
      },
      {
        id: "actions",
        cell: ({ row }) => {
          return h(
            "div",
            { class: "text-right" },
            h(
              UDropdownMenu,
              {
                content: {
                  align: "end"
                },
                items: getRowItems(row)
              },
              () => h(UButton, {
                icon: "i-lucide-ellipsis-vertical",
                color: "neutral",
                variant: "ghost",
                class: "ml-auto"
              })
            )
          );
        }
      }
    ];
    const statusFilter = ref("all");
    watch(() => statusFilter.value, (newVal) => {
      if (!table?.value?.tableApi) return;
      const statusColumn = table.value.tableApi.getColumn("status");
      if (!statusColumn) return;
      if (newVal === "all") {
        statusColumn.setFilterValue(void 0);
      } else {
        statusColumn.setFilterValue(newVal);
      }
    });
    const pagination = ref({
      pageIndex: 0,
      pageSize: 10
    });
    return (_ctx, _push, _parent, _attrs) => {
      const _component_UDashboardPanel = _sfc_main$2$1;
      const _component_UDashboardNavbar = _sfc_main$1$1;
      const _component_UDashboardSidebarCollapse = _sfc_main$b;
      const _component_CustomersAddModal = __nuxt_component_8;
      const _component_UInput = _sfc_main$5;
      const _component_CustomersDeleteModal = __nuxt_component_10;
      const _component_UKbd = _sfc_main$6;
      const _component_USelect = _sfc_main$7;
      const _component_UTable = _sfc_main$a;
      const _component_UPagination = _sfc_main$1;
      _push(ssrRenderComponent(_component_UDashboardPanel, mergeProps({ id: "customers" }, _attrs), {
        header: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            _push2(ssrRenderComponent(_component_UDashboardNavbar, { title: "Customers" }, {
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
                  _push3(ssrRenderComponent(_component_CustomersAddModal, null, null, _parent3, _scopeId2));
                } else {
                  return [
                    createVNode(_component_CustomersAddModal)
                  ];
                }
              }),
              _: 1
            }, _parent2, _scopeId));
          } else {
            return [
              createVNode(_component_UDashboardNavbar, { title: "Customers" }, {
                leading: withCtx(() => [
                  createVNode(_component_UDashboardSidebarCollapse)
                ]),
                right: withCtx(() => [
                  createVNode(_component_CustomersAddModal)
                ]),
                _: 1
              })
            ];
          }
        }),
        body: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            _push2(`<div class="flex flex-wrap items-center justify-between gap-1.5"${_scopeId}>`);
            _push2(ssrRenderComponent(_component_UInput, {
              "model-value": unref(table)?.tableApi?.getColumn("email")?.getFilterValue(),
              class: "max-w-sm",
              icon: "i-lucide-search",
              placeholder: "Filter emails...",
              "onUpdate:modelValue": ($event) => unref(table)?.tableApi?.getColumn("email")?.setFilterValue($event)
            }, null, _parent2, _scopeId));
            _push2(`<div class="flex flex-wrap items-center gap-1.5"${_scopeId}>`);
            _push2(ssrRenderComponent(_component_CustomersDeleteModal, {
              count: unref(table)?.tableApi?.getFilteredSelectedRowModel().rows.length
            }, {
              default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                if (_push3) {
                  if (unref(table)?.tableApi?.getFilteredSelectedRowModel().rows.length) {
                    _push3(ssrRenderComponent(unref(UButton), {
                      label: "Delete",
                      color: "error",
                      variant: "subtle",
                      icon: "i-lucide-trash"
                    }, {
                      trailing: withCtx((_3, _push4, _parent4, _scopeId3) => {
                        if (_push4) {
                          _push4(ssrRenderComponent(_component_UKbd, null, {
                            default: withCtx((_4, _push5, _parent5, _scopeId4) => {
                              if (_push5) {
                                _push5(`${ssrInterpolate(unref(table)?.tableApi?.getFilteredSelectedRowModel().rows.length)}`);
                              } else {
                                return [
                                  createTextVNode(toDisplayString(unref(table)?.tableApi?.getFilteredSelectedRowModel().rows.length), 1)
                                ];
                              }
                            }),
                            _: 1
                          }, _parent4, _scopeId3));
                        } else {
                          return [
                            createVNode(_component_UKbd, null, {
                              default: withCtx(() => [
                                createTextVNode(toDisplayString(unref(table)?.tableApi?.getFilteredSelectedRowModel().rows.length), 1)
                              ]),
                              _: 1
                            })
                          ];
                        }
                      }),
                      _: 1
                    }, _parent3, _scopeId2));
                  } else {
                    _push3(`<!---->`);
                  }
                } else {
                  return [
                    unref(table)?.tableApi?.getFilteredSelectedRowModel().rows.length ? (openBlock(), createBlock(unref(UButton), {
                      key: 0,
                      label: "Delete",
                      color: "error",
                      variant: "subtle",
                      icon: "i-lucide-trash"
                    }, {
                      trailing: withCtx(() => [
                        createVNode(_component_UKbd, null, {
                          default: withCtx(() => [
                            createTextVNode(toDisplayString(unref(table)?.tableApi?.getFilteredSelectedRowModel().rows.length), 1)
                          ]),
                          _: 1
                        })
                      ]),
                      _: 1
                    })) : createCommentVNode("", true)
                  ];
                }
              }),
              _: 1
            }, _parent2, _scopeId));
            _push2(ssrRenderComponent(_component_USelect, {
              modelValue: unref(statusFilter),
              "onUpdate:modelValue": ($event) => isRef(statusFilter) ? statusFilter.value = $event : null,
              items: [
                { label: "All", value: "all" },
                { label: "Subscribed", value: "subscribed" },
                { label: "Unsubscribed", value: "unsubscribed" },
                { label: "Bounced", value: "bounced" }
              ],
              ui: { trailingIcon: "group-data-[state=open]:rotate-180 transition-transform duration-200" },
              placeholder: "Filter status",
              class: "min-w-28"
            }, null, _parent2, _scopeId));
            _push2(ssrRenderComponent(unref(UDropdownMenu), {
              items: unref(table)?.tableApi?.getAllColumns().filter((column) => column.getCanHide()).map((column) => ({
                label: unref(upperFirst)(column.id),
                type: "checkbox",
                checked: column.getIsVisible(),
                onUpdateChecked(checked) {
                  unref(table)?.tableApi?.getColumn(column.id)?.toggleVisibility(!!checked);
                },
                onSelect(e) {
                  e?.preventDefault();
                }
              })),
              content: { align: "end" }
            }, {
              default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                if (_push3) {
                  _push3(ssrRenderComponent(unref(UButton), {
                    label: "Display",
                    color: "neutral",
                    variant: "outline",
                    "trailing-icon": "i-lucide-settings-2"
                  }, null, _parent3, _scopeId2));
                } else {
                  return [
                    createVNode(unref(UButton), {
                      label: "Display",
                      color: "neutral",
                      variant: "outline",
                      "trailing-icon": "i-lucide-settings-2"
                    })
                  ];
                }
              }),
              _: 1
            }, _parent2, _scopeId));
            _push2(`</div></div>`);
            _push2(ssrRenderComponent(_component_UTable, {
              ref_key: "table",
              ref: table,
              "column-filters": unref(columnFilters),
              "onUpdate:columnFilters": ($event) => isRef(columnFilters) ? columnFilters.value = $event : null,
              "column-visibility": unref(columnVisibility),
              "onUpdate:columnVisibility": ($event) => isRef(columnVisibility) ? columnVisibility.value = $event : null,
              "row-selection": unref(rowSelection),
              "onUpdate:rowSelection": ($event) => isRef(rowSelection) ? rowSelection.value = $event : null,
              pagination: unref(pagination),
              "onUpdate:pagination": ($event) => isRef(pagination) ? pagination.value = $event : null,
              "pagination-options": {
                getPaginationRowModel: unref(getPaginationRowModel)()
              },
              class: "shrink-0",
              data: unref(data),
              columns,
              loading: unref(status) === "pending",
              ui: {
                base: "table-fixed border-separate border-spacing-0",
                thead: "[&>tr]:bg-elevated/50 [&>tr]:after:content-none",
                tbody: "[&>tr]:last:[&>td]:border-b-0",
                th: "py-2 first:rounded-l-lg last:rounded-r-lg border-y border-default first:border-l last:border-r",
                td: "border-b border-default"
              }
            }, null, _parent2, _scopeId));
            _push2(`<div class="flex items-center justify-between gap-3 border-t border-default pt-4 mt-auto"${_scopeId}><div class="text-sm text-muted"${_scopeId}>${ssrInterpolate(unref(table)?.tableApi?.getFilteredSelectedRowModel().rows.length || 0)} of ${ssrInterpolate(unref(table)?.tableApi?.getFilteredRowModel().rows.length || 0)} row(s) selected. </div><div class="flex items-center gap-1.5"${_scopeId}>`);
            _push2(ssrRenderComponent(_component_UPagination, {
              "default-page": (unref(table)?.tableApi?.getState().pagination.pageIndex || 0) + 1,
              "items-per-page": unref(table)?.tableApi?.getState().pagination.pageSize,
              total: unref(table)?.tableApi?.getFilteredRowModel().rows.length,
              "onUpdate:page": (p) => unref(table)?.tableApi?.setPageIndex(p - 1)
            }, null, _parent2, _scopeId));
            _push2(`</div></div>`);
          } else {
            return [
              createVNode("div", { class: "flex flex-wrap items-center justify-between gap-1.5" }, [
                createVNode(_component_UInput, {
                  "model-value": unref(table)?.tableApi?.getColumn("email")?.getFilterValue(),
                  class: "max-w-sm",
                  icon: "i-lucide-search",
                  placeholder: "Filter emails...",
                  "onUpdate:modelValue": ($event) => unref(table)?.tableApi?.getColumn("email")?.setFilterValue($event)
                }, null, 8, ["model-value", "onUpdate:modelValue"]),
                createVNode("div", { class: "flex flex-wrap items-center gap-1.5" }, [
                  createVNode(_component_CustomersDeleteModal, {
                    count: unref(table)?.tableApi?.getFilteredSelectedRowModel().rows.length
                  }, {
                    default: withCtx(() => [
                      unref(table)?.tableApi?.getFilteredSelectedRowModel().rows.length ? (openBlock(), createBlock(unref(UButton), {
                        key: 0,
                        label: "Delete",
                        color: "error",
                        variant: "subtle",
                        icon: "i-lucide-trash"
                      }, {
                        trailing: withCtx(() => [
                          createVNode(_component_UKbd, null, {
                            default: withCtx(() => [
                              createTextVNode(toDisplayString(unref(table)?.tableApi?.getFilteredSelectedRowModel().rows.length), 1)
                            ]),
                            _: 1
                          })
                        ]),
                        _: 1
                      })) : createCommentVNode("", true)
                    ]),
                    _: 1
                  }, 8, ["count"]),
                  createVNode(_component_USelect, {
                    modelValue: unref(statusFilter),
                    "onUpdate:modelValue": ($event) => isRef(statusFilter) ? statusFilter.value = $event : null,
                    items: [
                      { label: "All", value: "all" },
                      { label: "Subscribed", value: "subscribed" },
                      { label: "Unsubscribed", value: "unsubscribed" },
                      { label: "Bounced", value: "bounced" }
                    ],
                    ui: { trailingIcon: "group-data-[state=open]:rotate-180 transition-transform duration-200" },
                    placeholder: "Filter status",
                    class: "min-w-28"
                  }, null, 8, ["modelValue", "onUpdate:modelValue"]),
                  createVNode(unref(UDropdownMenu), {
                    items: unref(table)?.tableApi?.getAllColumns().filter((column) => column.getCanHide()).map((column) => ({
                      label: unref(upperFirst)(column.id),
                      type: "checkbox",
                      checked: column.getIsVisible(),
                      onUpdateChecked(checked) {
                        unref(table)?.tableApi?.getColumn(column.id)?.toggleVisibility(!!checked);
                      },
                      onSelect(e) {
                        e?.preventDefault();
                      }
                    })),
                    content: { align: "end" }
                  }, {
                    default: withCtx(() => [
                      createVNode(unref(UButton), {
                        label: "Display",
                        color: "neutral",
                        variant: "outline",
                        "trailing-icon": "i-lucide-settings-2"
                      })
                    ]),
                    _: 1
                  }, 8, ["items"])
                ])
              ]),
              createVNode(_component_UTable, {
                ref_key: "table",
                ref: table,
                "column-filters": unref(columnFilters),
                "onUpdate:columnFilters": ($event) => isRef(columnFilters) ? columnFilters.value = $event : null,
                "column-visibility": unref(columnVisibility),
                "onUpdate:columnVisibility": ($event) => isRef(columnVisibility) ? columnVisibility.value = $event : null,
                "row-selection": unref(rowSelection),
                "onUpdate:rowSelection": ($event) => isRef(rowSelection) ? rowSelection.value = $event : null,
                pagination: unref(pagination),
                "onUpdate:pagination": ($event) => isRef(pagination) ? pagination.value = $event : null,
                "pagination-options": {
                  getPaginationRowModel: unref(getPaginationRowModel)()
                },
                class: "shrink-0",
                data: unref(data),
                columns,
                loading: unref(status) === "pending",
                ui: {
                  base: "table-fixed border-separate border-spacing-0",
                  thead: "[&>tr]:bg-elevated/50 [&>tr]:after:content-none",
                  tbody: "[&>tr]:last:[&>td]:border-b-0",
                  th: "py-2 first:rounded-l-lg last:rounded-r-lg border-y border-default first:border-l last:border-r",
                  td: "border-b border-default"
                }
              }, null, 8, ["column-filters", "onUpdate:columnFilters", "column-visibility", "onUpdate:columnVisibility", "row-selection", "onUpdate:rowSelection", "pagination", "onUpdate:pagination", "pagination-options", "data", "loading"]),
              createVNode("div", { class: "flex items-center justify-between gap-3 border-t border-default pt-4 mt-auto" }, [
                createVNode("div", { class: "text-sm text-muted" }, toDisplayString(unref(table)?.tableApi?.getFilteredSelectedRowModel().rows.length || 0) + " of " + toDisplayString(unref(table)?.tableApi?.getFilteredRowModel().rows.length || 0) + " row(s) selected. ", 1),
                createVNode("div", { class: "flex items-center gap-1.5" }, [
                  createVNode(_component_UPagination, {
                    "default-page": (unref(table)?.tableApi?.getState().pagination.pageIndex || 0) + 1,
                    "items-per-page": unref(table)?.tableApi?.getState().pagination.pageSize,
                    total: unref(table)?.tableApi?.getFilteredRowModel().rows.length,
                    "onUpdate:page": (p) => unref(table)?.tableApi?.setPageIndex(p - 1)
                  }, null, 8, ["default-page", "items-per-page", "total", "onUpdate:page"])
                ])
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
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("pages/customers.vue");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};

export { _sfc_main as default };
//# sourceMappingURL=customers-ulGtUxv1.mjs.map
