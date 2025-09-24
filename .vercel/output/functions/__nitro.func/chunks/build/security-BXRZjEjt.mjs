import { _ as _sfc_main$1 } from './PageCard-BrXkocLW.mjs';
import { _ as _sfc_main$2 } from './Form-gO420aMi.mjs';
import { _ as _sfc_main$3 } from './FormField-DDRuR3fR.mjs';
import { _ as _sfc_main$4 } from './Input-Bc3-FTjC.mjs';
import { d as _sfc_main$9 } from './server.mjs';
import { defineComponent, reactive, withCtx, unref, createVNode, useSSRContext } from 'vue';
import { ssrRenderComponent } from 'vue/server-renderer';
import * as z from 'zod';
import 'reka-ui';
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

const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "security",
  __ssrInlineRender: true,
  setup(__props) {
    const passwordSchema = z.object({
      current: z.string().min(8, "Must be at least 8 characters"),
      new: z.string().min(8, "Must be at least 8 characters")
    });
    const password = reactive({
      current: void 0,
      new: void 0
    });
    const validate = (state) => {
      const errors = [];
      if (state.current && state.new && state.current === state.new) {
        errors.push({ name: "new", message: "Passwords must be different" });
      }
      return errors;
    };
    return (_ctx, _push, _parent, _attrs) => {
      const _component_UPageCard = _sfc_main$1;
      const _component_UForm = _sfc_main$2;
      const _component_UFormField = _sfc_main$3;
      const _component_UInput = _sfc_main$4;
      const _component_UButton = _sfc_main$9;
      _push(`<!--[-->`);
      _push(ssrRenderComponent(_component_UPageCard, {
        title: "Password",
        description: "Confirm your current password before setting a new one.",
        variant: "subtle"
      }, {
        default: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            _push2(ssrRenderComponent(_component_UForm, {
              schema: unref(passwordSchema),
              state: unref(password),
              validate,
              class: "flex flex-col gap-4 max-w-xs"
            }, {
              default: withCtx((_2, _push3, _parent3, _scopeId2) => {
                if (_push3) {
                  _push3(ssrRenderComponent(_component_UFormField, { name: "current" }, {
                    default: withCtx((_3, _push4, _parent4, _scopeId3) => {
                      if (_push4) {
                        _push4(ssrRenderComponent(_component_UInput, {
                          modelValue: unref(password).current,
                          "onUpdate:modelValue": ($event) => unref(password).current = $event,
                          type: "password",
                          placeholder: "Current password",
                          class: "w-full"
                        }, null, _parent4, _scopeId3));
                      } else {
                        return [
                          createVNode(_component_UInput, {
                            modelValue: unref(password).current,
                            "onUpdate:modelValue": ($event) => unref(password).current = $event,
                            type: "password",
                            placeholder: "Current password",
                            class: "w-full"
                          }, null, 8, ["modelValue", "onUpdate:modelValue"])
                        ];
                      }
                    }),
                    _: 1
                  }, _parent3, _scopeId2));
                  _push3(ssrRenderComponent(_component_UFormField, { name: "new" }, {
                    default: withCtx((_3, _push4, _parent4, _scopeId3) => {
                      if (_push4) {
                        _push4(ssrRenderComponent(_component_UInput, {
                          modelValue: unref(password).new,
                          "onUpdate:modelValue": ($event) => unref(password).new = $event,
                          type: "password",
                          placeholder: "New password",
                          class: "w-full"
                        }, null, _parent4, _scopeId3));
                      } else {
                        return [
                          createVNode(_component_UInput, {
                            modelValue: unref(password).new,
                            "onUpdate:modelValue": ($event) => unref(password).new = $event,
                            type: "password",
                            placeholder: "New password",
                            class: "w-full"
                          }, null, 8, ["modelValue", "onUpdate:modelValue"])
                        ];
                      }
                    }),
                    _: 1
                  }, _parent3, _scopeId2));
                  _push3(ssrRenderComponent(_component_UButton, {
                    label: "Update",
                    class: "w-fit",
                    type: "submit"
                  }, null, _parent3, _scopeId2));
                } else {
                  return [
                    createVNode(_component_UFormField, { name: "current" }, {
                      default: withCtx(() => [
                        createVNode(_component_UInput, {
                          modelValue: unref(password).current,
                          "onUpdate:modelValue": ($event) => unref(password).current = $event,
                          type: "password",
                          placeholder: "Current password",
                          class: "w-full"
                        }, null, 8, ["modelValue", "onUpdate:modelValue"])
                      ]),
                      _: 1
                    }),
                    createVNode(_component_UFormField, { name: "new" }, {
                      default: withCtx(() => [
                        createVNode(_component_UInput, {
                          modelValue: unref(password).new,
                          "onUpdate:modelValue": ($event) => unref(password).new = $event,
                          type: "password",
                          placeholder: "New password",
                          class: "w-full"
                        }, null, 8, ["modelValue", "onUpdate:modelValue"])
                      ]),
                      _: 1
                    }),
                    createVNode(_component_UButton, {
                      label: "Update",
                      class: "w-fit",
                      type: "submit"
                    })
                  ];
                }
              }),
              _: 1
            }, _parent2, _scopeId));
          } else {
            return [
              createVNode(_component_UForm, {
                schema: unref(passwordSchema),
                state: unref(password),
                validate,
                class: "flex flex-col gap-4 max-w-xs"
              }, {
                default: withCtx(() => [
                  createVNode(_component_UFormField, { name: "current" }, {
                    default: withCtx(() => [
                      createVNode(_component_UInput, {
                        modelValue: unref(password).current,
                        "onUpdate:modelValue": ($event) => unref(password).current = $event,
                        type: "password",
                        placeholder: "Current password",
                        class: "w-full"
                      }, null, 8, ["modelValue", "onUpdate:modelValue"])
                    ]),
                    _: 1
                  }),
                  createVNode(_component_UFormField, { name: "new" }, {
                    default: withCtx(() => [
                      createVNode(_component_UInput, {
                        modelValue: unref(password).new,
                        "onUpdate:modelValue": ($event) => unref(password).new = $event,
                        type: "password",
                        placeholder: "New password",
                        class: "w-full"
                      }, null, 8, ["modelValue", "onUpdate:modelValue"])
                    ]),
                    _: 1
                  }),
                  createVNode(_component_UButton, {
                    label: "Update",
                    class: "w-fit",
                    type: "submit"
                  })
                ]),
                _: 1
              }, 8, ["schema", "state"])
            ];
          }
        }),
        _: 1
      }, _parent));
      _push(ssrRenderComponent(_component_UPageCard, {
        title: "Account",
        description: "No longer want to use our service? You can delete your account here. This action is not reversible. All information related to this account will be deleted permanently.",
        class: "bg-gradient-to-tl from-error/10 from-5% to-default"
      }, {
        footer: withCtx((_, _push2, _parent2, _scopeId) => {
          if (_push2) {
            _push2(ssrRenderComponent(_component_UButton, {
              label: "Delete account",
              color: "error"
            }, null, _parent2, _scopeId));
          } else {
            return [
              createVNode(_component_UButton, {
                label: "Delete account",
                color: "error"
              })
            ];
          }
        }),
        _: 1
      }, _parent));
      _push(`<!--]-->`);
    };
  }
});
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("pages/settings/security.vue");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};

export { _sfc_main as default };
//# sourceMappingURL=security-BXRZjEjt.mjs.map
